# Micromex Command Center — Architecture Plan

Single-user CEO command center. Its job: keep the president on the few things that
move the business toward **exit-ready by Oct 2031**. It enforces the user's own
priorities — it never invents them.

**Hard rule: no financial data anywhere.** No revenue, margin, EBITDA, cash,
pricing, invoices, deal values. There are no columns for them, no metric units for
them, and the agent's system prompt forbids surfacing them. Agent-written text
(summaries, rankings, picks) is passed through a currency-amount scrubber.

## Decisions made (no questions needed)

| Decision | Choice | Why |
|---|---|---|
| Location | `command-center/` inside this repo | Keeps the existing Race to Abs app intact. Vercel "Root Directory" = `command-center`. |
| Framework | Next.js 16 App Router, React 19, TS, Tailwind v4 | Current stable. `proxy.ts` (formerly middleware) does the password gate. |
| Data access | One typed RPC registry (`src/lib/rpc`) → `GET /api/q/[name]`, `POST /api/m/[name]` | The UI, the agent's tools and cron jobs all call the *same* service functions. GET queries are cacheable by the service worker → offline reads. |
| DB | Prisma 6 + Postgres (Neon) | Prisma 6 is the stable line; Neon pooled URL + direct URL for migrations. |
| Auth | `APP_PASSWORD` env → HS256 JWT cookie (jose), 90-day | Single user, nothing to manage. |
| Email | **Gmail API adapter** (OAuth). Superhuman sits on Gmail, so labels/drafts/sends appear in Superhuman. | Superhuman's MCP server is built for MCP *clients* like Claude; a headless server-side sync job can't run its interactive OAuth reliably. The adapter interface lets a Superhuman-MCP adapter drop in later. |
| Slack | Slack app, user token (read DMs/channels you're in, post as you) + bot token, Events API webhook for mentions/DMs | Official API. |
| WhatsApp | WhatsApp Business **Cloud API** on a business number + webhook | Only official route; a personal WhatsApp line cannot be pulled. |
| Background jobs | One `/api/cron/tick` endpoint (every 5 min on Vercel Pro; external pinger on Hobby) | Idempotent dispatcher: syncs, 7:00 / 16:30 pushes, follow-up reminders, recurring tasks, metric snapshots. |
| Push | Web Push (VAPID) via `web-push` | Works on iPhone for installed PWAs (iOS 16.4+). |
| Offline | Hand-written service worker: app-shell + network-first cache of `/api/q/*`; offline Parking Lot captures queue in an outbox | "Offline reads" + never lose a captured thought. |
| Agent | Anthropic SDK, `claude-opus-5-5` (env-overridable), streaming manual tool loop over SSE, server-side refusal fallbacks | Manual loop so tool calls stream to the UI and every send stays a Draft. |
| Agent picks | Deterministic scorer produces explainable candidates; the agent (if configured) re-ranks and rewrites reasons. Works without an API key. | "Always explainable", never blank. |
| Timezone | `America/Phoenix` default (Tucson & Sonora are both UTC−7, no DST); editable | Correct 7:00 / 16:30 pushes. |
| Week | Monday start; Friday review | |

## Data model (prisma/schema.prisma)

- **Goal** — one tree with `level` EXIT → ANNUAL → QUARTERLY (rock) → WEEKLY (rock). Owner, due, status, notes, sortOrder, completedAt/archivedAt. Progress = manual override, else average of children, else tasks done/total, else `measures` (scoreboard metric vs target).
- **Task** — linked to a goal/rock (drift alert when not), optional delegate `owner` (Person), due, snooze, recurring instance, source thread.
- **RecurringTask** — weekly commitments (20 outreach touches, 1 LinkedIn post, Friday review), materialised per week.
- **ParkingItem** — captures; triaged to promote / schedule / delete.
- **DailyPlan** — per local date: 3 picks with reasons, candidates (for swap), launch/close timestamps, all-done flag (→ streak).
- **WeeklyReview** — per week; cannot close until next week's rocks exist.
- **Person / FollowUp / Touch** — delegation + chase list with a full touch log.
- **Metric / MetricEntry / ExitCriterion** — weekly scoreboard (manual or auto-from-pipeline), RAG vs target, weighted exit-readiness checklist.
- **PipelineCard / PipelineContact / PipelineEvent** — 8-stage board, 3 lanes, next action + date, stage history for trend.
- **Thread / Message / Draft / Integration** — local copy of Email/Slack/WhatsApp so search and the agent work offline; Drafts gate every outbound send; Integration stores encrypted tokens + sync cursors.
- **PushSubscription / NotificationLog** — push endpoints; idempotency keys so each push fires once.
- **AgentConversation / AgentMessage** — persisted agent history (content stored verbatim).

## Adapter interface (src/lib/integrations/types.ts)

```ts
interface CommsAdapter {
  provider: "gmail" | "slack" | "whatsapp";
  channel: Channel;
  isConfigured(): boolean;            // env present
  status(): Promise<IntegrationState>;
  sync(opts?: { full?: boolean }): Promise<SyncResult>;   // pull → Thread/Message upsert
  send(draft: OutboundDraft): Promise<{ externalId: string }>;
  markRead?(thread: Thread): Promise<void>;
}
```
Webhooks (Slack events, WhatsApp) call the same `ingest()` helpers sync uses.

## Agent tools

Read: `get_overview` (rocks, picks, overdue), `list_goals`, `list_tasks`, `list_followups`, `list_pipeline`, `pipeline_summary` ("where are we on data center?"), `get_scoreboard`, `list_parking_lot`, `get_weekly_review`, `search_messages`, `get_thread`, `list_people`.
Write: `create_task`, `update_task`, `complete_task`, `create_goal`, `update_goal`, `create_followup`, `log_touch`, `complete_followup`, `create_pipeline_card`, `update_pipeline_card`, `move_pipeline_stage`, `record_metric`, `park_item`, `triage_parking_item`, `set_daily_picks`.
Comms: `draft_reply` / `draft_message` (creates a PENDING Draft — never sends), `summarize_thread`, `rank_inbox`, `link_thread_to_card`.
No tool sends. Sending happens only when the user taps **Approve & send** on a Draft.

## Screens

| Screen | Desktop | Phone |
|---|---|---|
| Morning Launch | Full-screen 3-step overlay | Full-screen 3 cards, swipe/next |
| Today | Rock rings hero → 3 picks → overdue → follow-ups → pipeline actions; Inbox Pulse; Parking capture; streak | Same order, full-width cards, gestures (→ done, ← snooze/park, long-press delegate) |
| Goals | Tree with drag reorder, inline edit, roll-up rings | Collapsible levels |
| Scoreboard | Metric tiles with sparklines + RAG, weekly entry grid, trend charts, Exit Readiness ring | Tiles + entry sheet |
| Accountability | Follow-ups by person, touch log, delegation | List |
| Weekly Review | 4-step: said vs done → overdue → Parking triage → set next week's rocks (gate) + monthly summary | Same steps |
| Pipeline | 8-column Kanban (drag), lane filter, card drawer w/ contacts + linked threads | Stage tabs + cards |
| Comms | Unified feed, filters, search, thread view, reply, → task / follow-up / card | Feed → thread |
| Agent | Persistent right panel (`A`) | Full-screen tab |
| Settings | Integrations, push, timezone/times, theme, people, metrics, exit criteria, backup export | Same |

Keyboard: `N` task · `P` parking lot · `/` search · `A` agent · `G then T/G/S/P/C` navigation.
Mic button on every screen → Web Speech API → Parking Lot or task.

## Build order (a commit after each)

1. Design system + Today + Goals + Parking Lot + Morning Launch + Weekly Review (desktop + phone)
2. Scoreboard + Accountability + End of Day + push notifications
3. Pipeline
4. Agent with internal tools
5. Email adapter + Comms Hub
6. Slack adapter
7. WhatsApp adapter
8. Agent comms tools

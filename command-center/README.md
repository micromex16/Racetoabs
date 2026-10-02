# Micromex Command Center

A personal CEO command center for the president of Micromex. It keeps you on the few things that move the business toward **exit-ready by October 2031**, pulls Email, Slack and WhatsApp into one place, and gives you an AI chief of staff you can hand work to.

It never invents priorities. You set the goals and rocks; the app enforces them.

> **No financial data, by design.** There are no fields for revenue, margin, EBITDA, cash, pricing or invoices. Scoreboard metrics are activity and pipeline counts only (financial units are rejected). The agent is told never to surface financial figures, and anything it writes (summaries, pick reasons, chat) runs through a currency scrubber before you see it.

---

## Contents

1. [What's inside](#whats-inside)
2. [The game](#the-game)
3. [Run locally](#run-locally)
4. [Deploy to Vercel](#deploy-to-vercel)
5. [Install on iPhone (PWA) + push notifications](#install-on-iphone-pwa--push-notifications)
6. [The agent (Anthropic)](#the-agent-anthropic)
7. [Email — Gmail API (works with Superhuman)](#email--gmail-api-works-with-superhuman)
8. [Slack](#slack)
9. [WhatsApp Business](#whatsapp-business)
10. [Background jobs (cron)](#background-jobs-cron)
11. [Back up the database](#back-up-the-database)
12. [Add a metric](#add-a-metric)
13. [Environment variables](#environment-variables)
14. [Architecture](#architecture)

---

## What's inside

| Screen | What it does |
|---|---|
| **Morning Launch** | First open each day: (1) your 3 rocks and where you stand, (2) "do these 3 first" — picked against your rocks, each with a reason, swap any one, (3) "anything on your mind?" → Parking Lot. ~30 seconds. |
| **Today** | Focus lock: the 3 weekly rock rings, today's 3 picks, then overdue → follow-ups due → pipeline next actions due. Inbox Pulse, Parking Lot capture, streak, weekly cadence. |
| **Goals** | 5-year exit → annual goals → quarterly rocks → weekly rocks → tasks. Progress rolls up; drag to reorder; cross off with animation; archive later. |
| **Scoreboard** | Weekly metrics with targets, sparklines, RAG (icon + label), trend charts, pipeline-by-stage, and the Exit Readiness ring over your weighted checklist. |
| **Accountability** | Delegate → follow-up date → surfaces on Today, red when overdue, full touch log. |
| **Weekly Review** | Said vs. done → overdue → Parking Lot triage (promote / schedule / delete) → set next week's rocks. **Can't close until next week's rocks exist.** Monthly one-page summary, copyable. |
| **Pipeline** | Target → Contacted → Sample Sent → Discovery → RFQ → Quoted → Pilot → Customer. Lanes: Data Center / A&D / Other. Next actions feed Today. CSV import for the 100-account list. |
| **Comms** | Unified Email / Slack / WhatsApp feed, search, reply, and "→ task / follow-up / pipeline" on every thread. Every outbound message is a draft until you approve. |
| **Plant** | The game: coins from real work, a town you build, speedruns against your personal best, weekly twists, trophies, records. See [The game](#the-game). |
| **Agent** | Chief of staff: reads and writes everything above, ranks your inbox, drafts replies for approval, creates follow-ups from plain speech. Side panel on desktop (`A`), full-screen tab on phone. |

**Keyboard (desktop):** `N` new task · `P` park a thought · `/` search · `A` agent · `V` dictate · `G` then `T` `G` `S` `P` `C` `A` `R` `L` to jump to Today, Goals, Scoreboard, Pipeline, Comms, Accountability, Review, Parking Lot · `⌘K` search.

**Phone:** bottom tabs (Today / Goals / Pipeline / Comms / Agent), mic button on every screen, swipe right = done, swipe left = snooze/park, long-press = delegate.

**Drift alert:** a task that doesn't link to a rock or goal asks "which rock does this serve?" with a **None — park it** button.

---

## The game

Work earns **coins**; coins build your **plant**. You're only playing against your own record. Coins are play currency — they never represent money.

**Earning (only from work that moves the business)**

| Action | Coins |
|---|---|
| Task linked to a rock | 10 (+20 if it's one of today's 3 picks) |
| Task with no rock | 2 — side quests don't pay |
| Follow-up closed | 15 (+20 if picked) |
| Pipeline next action done | 15 (+20 if picked) |
| Account moves forward | Contacted 10 · Sample 20 · Discovery 40 · RFQ 75 · Quoted 75 · Pilot 150 · **Customer 500** |
| Scoreboard activity | per founder touch 3 · kit mailed 10 · discovery call 25 · RFQ 40 · quote 40 · LinkedIn post 25 |
| Clean run (all 3 picks) | 100 |
| Focus sprint finished | 20, plus a combo that grows with each sprint that day |
| Weekly rock / quarter rock | 150 / 1,000 |
| Friday payout (closing the review) | 100 + 60 per clean day + 40 per rock − 15 per overdue item |
| Weekly twist won | 150–400 + a rare blueprint |
| New personal record | 50 |

**Bounties.** Every time you snooze, carry or push something, its bounty grows (+15 per dodge, +5 per day overdue, up to +150). The thing you've been avoiding ends up worth the most coins on the screen.

**Speedrun.** The clock starts when you launch the day and stops when your third pick is done. Today's run races your personal best: you can see your splits against the best run's, and whether you're ahead or behind.

**The plant.** On *Plant* (sidebar, or tap the coin pill), spend coins on assembly lines, a QA lab, warehouses, a water tower, solar, a comedor, saguaros, and more. Upgrade buildings, move them, or sell them back at half price. Some buildings unlock only through real milestones: first RFQ → SMT line, an A&D account at Discovery → wire-harness line, a Data Center pilot → rack cell, first new customer → Tucson office, four Friday reviews → trophy hall, a 20-day streak → founder's statue, 80+ exit readiness → the Exit Tower. The world is live: your 3 weekly rocks are beacons that fill as they progress, every pipeline account is a container on the road at its stage, mailed kits drive to the border as trucks, customers fly flags in Tucson, and the sky follows the time of day in Imuris.

**Power.** Miss workdays or let work go overdue and the plant dims: the smoke stops and the lights go out. Clean runs power it back up.

**Weekly twist.** Each Monday a new challenge is aimed at whichever of your rocks is most behind pace, e.g. "15 founder touches by Wednesday noon" or "clear every overdue item by Wednesday 5pm". The agent designs it when an API key is set; otherwise the built-in rules do.

**Surprises.** About one completion in seven drops a bonus: extra coins, a streak freeze, or a rare blueprint (fountain, mural, neon sign, desert garden, golden saguaro).

**Streak freezes.** You earn one every 5-day streak and can buy them for 150 coins (hold up to 3). If you miss a workday, a freeze is spent automatically so the streak survives.

**Treats.** Under *Plant → Treats*, set real-life rewards and price them in coins. Cash them in when you've earned them, on the honor system.

**Trophies and records.** There are 21 achievements and 7 personal records: fastest clean run, earliest finish, longest streak, most clean days in a week, most founder touches in a week, most sprints in a day, most coins in a week.

Sounds and haptics can be switched off in **Settings → Game**; that's also where you set the sprint length (15/25/45/60). iPhone browsers don't support vibration.

---

## Run locally

Requirements: Node 20+ (22 recommended) and a Postgres database (a free [Neon](https://neon.tech) project works, or local Postgres).

```bash
cd command-center
cp .env.example .env          # then fill in DATABASE_URL, DIRECT_URL, APP_PASSWORD, SESSION_SECRET, ENCRYPTION_KEY, CRON_SECRET
npm install
npx prisma migrate deploy     # creates the tables
npm run db:seed               # optional — the app also seeds itself on first request
npm run dev                   # http://localhost:3000
```

Generate the secrets with:

```bash
openssl rand -base64 48   # run once each for SESSION_SECRET, ENCRYPTION_KEY, CRON_SECRET
```

Log in with `APP_PASSWORD`. On a fresh database the first request loads the seed: the 5-year target, 2027 goals, Q4 2026 rocks, the 2027 quarterly plan, the weekly cadence (20 founder touches, 1 LinkedIn post, Friday review), the scoreboard metrics and the exit-readiness checklist. No people, accounts or messages are seeded.

To run the cron by hand locally: `curl "http://localhost:3000/api/cron/tick?key=$CRON_SECRET"`.

Checks: `npm run typecheck`, `npm run lint`, `npm run build`.

---

## Deploy to Vercel

1. **Database.** In Neon, create a project (region close to Phoenix, e.g. AWS us-west-2). From *Connection details* copy two strings:
   - the **pooled** connection string → `DATABASE_URL` (append `&pgbouncer=true` if it isn't there)
   - the **direct** (unpooled) string → `DIRECT_URL`
2. **Import the repo** in Vercel → *Add New → Project* → pick this repository.
3. **Root Directory:** set it to `command-center` (this repo also contains the older Race to Abs app at the root).
4. **Environment variables:** add everything from [Environment variables](#environment-variables). Set `APP_URL` to the production URL, e.g. `https://micromex-command.vercel.app`.
5. **Deploy.** The build runs `npm run vercel-build` (from `vercel.json`): `prisma generate && prisma migrate deploy && next build`, so migrations apply on every deploy.
6. Open the URL, log in, and walk through Morning Launch.

`vercel.json` registers a cron that hits `/api/cron/tick` every 5 minutes. Vercel sends `Authorization: Bearer $CRON_SECRET`, which the endpoint checks. See [Background jobs](#background-jobs-cron) if you're on the Hobby plan.

---

## Install on iPhone (PWA) + push notifications

Requires iOS 16.4 or later.

1. Open the app URL in **Safari** and log in.
2. Tap **Share** → **Add to Home Screen** → **Add**.
3. Open **Command** from the home screen (it runs full-screen, offline-capable).
4. Go to **More → Settings → Notifications → Enable on this device** and allow notifications. (On iPhone this only works from the home-screen app, not from a Safari tab.)
5. Tap **Test “Your day”** to confirm.

What you get:

- **7:00** — "Your day": 3 rocks with %, today's 3 picks, the top 3 threads.
- **9:00** — follow-up digest (what's due or overdue, by person).
- **4:30 pm** — "Close the day": one tap opens End of Day.
- **Friday 3:30 pm** — weekly review nudge.

Times, timezone (default `America/Phoenix` — Tucson and Imuris are both UTC−7 with no DST) and the review day are editable in Settings.

**Push keys:** generate VAPID keys once and add them to the environment:

```bash
npx web-push generate-vapid-keys
# NEXT_PUBLIC_VAPID_PUBLIC_KEY=<public key>
# VAPID_PRIVATE_KEY=<private key>
# VAPID_SUBJECT=mailto:you@micromex.com
```

Redeploy after adding them (the public key is baked into the client bundle).

**Offline:** screens you've opened stay readable offline. Parking Lot captures made offline are queued on the phone and sync when you're back online.

**Voice:** the mic button uses the browser's speech recognition (works in Safari and Chrome). If your browser doesn't offer it, the capture box opens with the keyboard — tap the keyboard's own mic to dictate.

---

## The agent (Anthropic)

1. Create an API key at [console.anthropic.com](https://console.anthropic.com) → *API Keys*.
2. Set `ANTHROPIC_API_KEY` in Vercel. Optional: `ANTHROPIC_MODEL` (default `claude-opus-5-5`).

How it behaves:

- Its system prompt is rebuilt every turn from your live goals, quarter rocks and this week's rocks — it measures everything against them and never invents priorities.
- It can read and write goals, tasks, follow-ups, pipeline, scoreboard and Parking Lot (27 internal tools) and read, search, summarize, rank, link and **draft** Email/Slack/WhatsApp (9 comms tools).
- **It has no send tool.** Drafts appear in Comms (and on Today) with **Approve & send**.
- Each morning ~6:30 it ranks the inbox against your rocks and, ~6:45, picks your 3 for the day with one-line reasons ("Rock #2 is 40% and due in 9 days"). Without an API key the app falls back to its built-in scorer, which also explains every pick.
- Refusal fallbacks are on (`server-side-fallback-2026-07-01`, `fallbacks: "default"`), so a safety-classifier decline is retried server-side on Anthropic's recommended fallback model instead of failing.

Try: "Where are we on data center?", "Chase Juan on the Dyson SOW Thursday", "Re-pick my 3 for today", "Run my Friday review with me", "What's important in my inbox?", "Log 4 outreach touches".

---

## Email — Gmail API (works with Superhuman)

Superhuman is a client on top of Gmail, so the app talks to **Gmail**. Read state, archive and sends made here show up in Superhuman, and vice versa.

> *Why not Superhuman's MCP server?* It's built for MCP clients like Claude to use interactively with your sign-in; a headless server sync job can't hold that session reliably. The adapter interface (`src/lib/integrations/types.ts`) lets a Superhuman adapter drop in later without touching the rest of the app.

**1. Google Cloud project**

1. [console.cloud.google.com](https://console.cloud.google.com) → create a project, e.g. "Micromex Command".
2. *APIs & Services → Library* → enable **Gmail API**.

**2. OAuth consent screen** (*APIs & Services → OAuth consent screen*)

- **If micromex.com is on Google Workspace (recommended):** User type **Internal**. No Google verification is required and tokens don't expire.
- **If it's a personal @gmail.com account:** User type **External**, publishing status **Testing**, and add your address under *Test users*. Google expires refresh tokens for apps in Testing after 7 days, so you'd reconnect weekly; avoiding that requires Google's verification for restricted scopes.
- Add these **scopes**:
  - `openid`
  - `https://www.googleapis.com/auth/userinfo.email`
  - `https://www.googleapis.com/auth/gmail.modify` — read, label, mark read, archive, and send. No permanent delete.

**3. OAuth client** (*APIs & Services → Credentials → Create credentials → OAuth client ID*)

- Application type: **Web application**
- Authorized redirect URI: `https://<your-app>/api/integrations/gmail/callback`
  (for local dev also add `http://localhost:3000/api/integrations/gmail/callback`)
- Copy the client ID and secret → `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.

**4. Connect.** Redeploy, then **Settings → Integrations → Email → Connect** and approve. The first sync pulls the last 21 days (promotions and social excluded). After that the cron syncs every 5 minutes using Gmail's History API.

---

## Slack

**1. Create the app from a manifest.** [api.slack.com/apps](https://api.slack.com/apps) → *Create New App* → *From an app manifest* → pick your workspace → paste (replace `YOUR-APP`):

```yaml
display_information:
  name: Micromex Command
features:
  bot_user:
    display_name: Command
    always_online: false
oauth_config:
  redirect_urls:
    - https://YOUR-APP/api/integrations/slack/callback
  scopes:
    bot:
      - app_mentions:read
      - chat:write
      - users:read
      - im:history
    user:
      - channels:history
      - channels:read
      - groups:history
      - groups:read
      - im:history
      - im:read
      - mpim:history
      - mpim:read
      - users:read
      - chat:write
      - reactions:write
settings:
  event_subscriptions:
    request_url: https://YOUR-APP/api/webhooks/slack
    bot_events:
      - app_mention
      - message.im
    user_events:
      - message.im
      - message.mpim
      - message.channels
      - message.groups
  org_deploy_enabled: false
  socket_mode_enabled: false
  token_rotation_enabled: false
```

What the scopes are for:

| Scope | Why |
|---|---|
| user `channels:history`, `groups:history`, `im:history`, `mpim:history` | Read messages in the public/private channels, DMs and group DMs **you're already in** |
| user `channels:read`, `groups:read`, `im:read`, `mpim:read` | List those conversations |
| user `users:read`, bot `users:read` | Show names instead of IDs |
| user `chat:write` | Post replies **as you** (only after you approve) |
| user `reactions:write` | The 👍 quick reaction |
| bot `app_mentions:read`, `im:history`, `chat:write` | Receive mentions and DMs to the app |

**2. Credentials.** *Basic Information* → copy **Client ID**, **Client Secret**, **Signing Secret** → `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET`. Redeploy.

**3. Verify the events URL.** *Event Subscriptions* should show the Request URL as **Verified** (the app answers Slack's challenge). If you created the app before deploying, click *Retry*.

**4. Connect.** **Settings → Integrations → Slack → Connect** and approve. The first sync pulls 3 days of DMs, group DMs and channels you're in; after that, mentions and DMs arrive in real time by webhook and the cron catches up every 10 minutes. Only DMs, group DMs and @-mentions mark a conversation unread, so busy channels don't flood the inbox.

---

## WhatsApp Business

> **A personal WhatsApp line cannot be connected.** WhatsApp has no official API for personal accounts; tools that scrape WhatsApp Web break Meta's terms and get numbers banned. The official route is the **WhatsApp Business Cloud API** on a **business phone number**. Messages your contacts send to that number appear in Comms; replies go out from that number.

**1. Meta app**

1. [developers.facebook.com](https://developers.facebook.com/apps) → *Create app* → type **Business** → link (or create) your Meta Business portfolio for Micromex.
2. In the app dashboard, add the **WhatsApp** product. This creates a WhatsApp Business Account (WABA) with a free test number.

**2. Register your business number**

1. *WhatsApp → API Setup → Add phone number*. Use a number that is **not** currently registered on the WhatsApp or WhatsApp Business phone apps (or delete that account first — a number can live in only one place).
2. Set the display name (reviewed by Meta), verify by SMS or voice call.
3. Copy the **Phone number ID** → `WHATSAPP_PHONE_NUMBER_ID`, and the **WhatsApp Business Account ID** → `WHATSAPP_BUSINESS_ACCOUNT_ID`.

**3. Permanent access token**

1. [business.facebook.com](https://business.facebook.com) → *Settings → Users → System users* → *Add* (Admin).
2. *Assign assets* → add your app (Full control) and your WhatsApp account (Full control).
3. *Generate new token* → select the app → token expiration **Never** → permissions **`whatsapp_business_messaging`** and **`whatsapp_business_management`** → copy → `WHATSAPP_TOKEN`.

**4. Webhook**

1. Choose any random string → `WHATSAPP_VERIFY_TOKEN`. App dashboard → *App settings → Basic* → **App secret** → `WHATSAPP_APP_SECRET`. Redeploy.
2. *WhatsApp → Configuration → Webhook → Edit*: Callback URL `https://<your-app>/api/webhooks/whatsapp`, Verify token = your `WHATSAPP_VERIFY_TOKEN` → *Verify and save*.
3. Under *Webhook fields*, **Subscribe** to `messages`.
4. Switch the app to **Live** mode (top bar) so real customers' messages are delivered.

**5. Activate.** **Settings → Integrations → WhatsApp Business → Activate** checks the token and number. Inbound messages arrive by webhook (there's no history API, so the app stores messages from the moment you connect).

**The 24-hour rule:** Meta only allows free-form replies within 24 hours of the contact's last message. Outside that window the app tells you to use an approved template (created in WhatsApp Manager) or wait for them to write again.

---

## Background jobs (cron)

Everything scheduled goes through one idempotent endpoint, `/api/cron/tick`: recurring weekly tasks, Parking Lot items whose date has arrived, scoreboard snapshots, Gmail/Slack sync, inbox ranking, agent picks, and the 7:00 / 9:00 / 4:30 / Friday pushes (each sent once per day).

- **Vercel Pro:** nothing to do; `vercel.json` runs it every 5 minutes.
- **Vercel Hobby** (cron limited to once a day): remove the `crons` block from `vercel.json` and use a free external pinger such as [cron-job.org](https://cron-job.org) to call
  `https://<your-app>/api/cron/tick?key=<CRON_SECRET>` every 5 minutes.

Slack and WhatsApp also deliver in real time by webhook; the cron is the safety net.

---

## Back up the database

**Neon (built in).** Neon keeps point-in-time history (the restore window depends on your plan). To restore, create a branch from a past timestamp in the Neon console, check it, then point `DATABASE_URL`/`DIRECT_URL` at it or restore from it.

**Full dump (recommended weekly):**

```bash
# backup (use the DIRECT connection string)
pg_dump "$DIRECT_URL" --format=custom --no-owner --file=micromex-$(date +%F).dump

# restore into an empty database
pg_restore --no-owner --dbname="$TARGET_DIRECT_URL" micromex-2026-10-02.dump
```

**In-app export.** *Settings → Data → Export JSON* downloads everything you've entered (goals, tasks, follow-ups, scoreboard, pipeline, reviews, drafts). OAuth tokens and message bodies are not included.

---

## Add a metric

**From the app (most metrics):**

1. **Scoreboard → + Metric.**
2. Name it (e.g. "Plant tours hosted"), choose how it rolls up — **Weekly count** (sums year-to-date) or **Level / snapshot** (e.g. "pilots live") — set a unit (blank, `%`, or a noun like `tours`), a target, and whether lower is better. Financial units and names are rejected.
3. Enter values each week with **Enter this week** (or tell the agent "log 2 plant tours").
4. Optional: make a **rock measure itself** with it — Goals → edit the rock → *Measure from scoreboard* → pick the metric and a target. The rock's ring then fills from the metric.
5. Optional: tie it to a **weekly cadence** item (Settings → Weekly cadence) so the Today `+` button logs it.
6. Optional: use it in **Exit Readiness** (Scoreboard → Edit checklist → *Auto: metric* with a threshold).

**Computed from the pipeline (code):** add a function to `AUTO_METRICS` in `src/lib/services/metrics.ts`, e.g.

```ts
pilots_in_dc: {
  label: "Pilot-stage Data Center accounts",
  compute: () => db.pipelineCard.count({ where: { archivedAt: null, stage: "PILOT", lane: "DATA_CENTER" } }),
},
```

then create the metric with `source: "AUTO"`, `autoKey: "pilots_in_dc"` (add it to `METRICS` in `src/lib/seed.ts` for new databases, or insert one row in the `Metric` table). Auto metrics snapshot weekly, so they get trend lines.

---

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✓ | Neon pooled connection string |
| `DIRECT_URL` | ✓ | Neon direct connection string (migrations) |
| `APP_PASSWORD` | ✓ | The single login password |
| `SESSION_SECRET` | ✓ | 32+ random chars |
| `ENCRYPTION_KEY` | ✓ | 32+ random chars; encrypts OAuth tokens at rest. Don't change it after connecting integrations. |
| `CRON_SECRET` | ✓ | Protects `/api/cron/tick` |
| `APP_URL` | ✓ | Public URL, used for OAuth redirects |
| `ANTHROPIC_API_KEY` | agent | Enables the chief of staff |
| `ANTHROPIC_MODEL` | | Default `claude-opus-5-5` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | push | `npx web-push generate-vapid-keys` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | email | Gmail OAuth client |
| `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET` | slack | From the Slack app |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` | whatsapp | Meta Cloud API |
| `WHATSAPP_API_VERSION` | | Graph API version, default `v23.0` |

---

## Architecture

```
src/
  app/(app)/…            screens (Today, Goals, Scoreboard, Pipeline, Comms, Accountability, Review, Parking, Agent, Settings)
  app/api/q/[name]       GET  queries   ─┐ one typed registry (src/lib/rpc/registry.ts)
  app/api/m/[name]       POST mutations ─┘ shared by the UI, the agent's tools and cron
  app/api/agent/chat     streaming agent (SSE)
  app/api/cron/tick      scheduled work
  app/api/webhooks/*     Slack + WhatsApp
  lib/services/*         business logic (goals roll-up, daily picks, review, scoreboard, pipeline, comms)
  lib/agent/*            prompt, tools, streaming loop, picks, inbox ranking, drafting
  lib/integrations/*     CommsAdapter interface + Gmail / Slack / WhatsApp adapters, encrypted token store
  proxy.ts               password gate (Next 16 "proxy", formerly middleware)
prisma/schema.prisma     data model — see PLAN.md
public/sw.js             service worker: offline reads, push
```

- **Picks are explainable by construction.** A scorer ranks open tasks, follow-ups and pipeline next actions by the rock they serve (weekly > quarterly), how far behind pace that rock is, days left, and overdue/due dates — and writes the reason as it scores. The agent may re-rank, but must choose from those candidates and give its own reason.
- **Progress roll-up:** manual override → done → scoreboard measures → children (annual from quarterly, exit from annual; weekly rocks are steps, not slices) → tasks in the subtree.
- **Messages are stored locally**, so search and the agent work even when a provider is down.
- **Outbound is always a Draft.** Agent drafts wait for *Approve & send*; when you type a reply and press Send, that press is the approval.

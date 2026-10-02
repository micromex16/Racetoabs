"use client";
import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Mail, Hash, MessageCircle, RefreshCw, Plug, Unplug, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useQ, call } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Badge, Panel } from "@/components/ui/misc";
import { toast } from "sonner";

const ICON = { gmail: Mail, slack: Hash, whatsapp: MessageCircle } as const;
const CONNECT: Record<string, string | null> = { gmail: "/api/integrations/gmail/connect", slack: "/api/integrations/slack/connect", whatsapp: null };
const HELP: Record<string, string> = {
  gmail: "Gmail API with OAuth. Superhuman sits on Gmail, so archive/read/sends stay in sync with it.",
  slack: "Slack app with your user token: DMs and channels you're in, post as you; Events webhook for mentions.",
  whatsapp: "WhatsApp Business Cloud API on a business number. A personal WhatsApp line can't be connected by official means.",
};

export function Integrations() {
  const { data } = useQ("integrations");
  const params = useSearchParams();
  React.useEffect(() => {
    const c = params.get("connected");
    const e = params.get("error");
    if (c) toast.success(`${c} connected`);
    if (e) toast.error(`Connection failed: ${e}`);
  }, [params]);

  if (!data) return null;
  return (
    <div className="grid gap-3">
      {data.map((i) => {
        const I = ICON[i.provider as keyof typeof ICON];
        const connected = i.status === "connected";
        return (
          <Panel key={i.provider} className="p-4">
            <div className="flex flex-wrap items-start gap-3">
              <div className="grid size-10 place-items-center rounded-xl bg-panel-2">
                <I className="size-5 text-accent" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">{i.label}</p>
                  {connected ? (
                    <Badge tone="good">
                      <CheckCircle2 className="size-3" /> connected
                    </Badge>
                  ) : i.status === "error" ? (
                    <Badge tone="bad">
                      <AlertTriangle className="size-3" /> error
                    </Badge>
                  ) : (
                    <Badge>not connected</Badge>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-fg-2">{HELP[i.provider]}</p>
                {i.account && <p className="mt-1 text-xs text-muted">Account: {i.account}</p>}
                {i.lastSyncAt && <p className="text-xs text-muted">Last sync: {new Date(i.lastSyncAt).toLocaleString()}</p>}
                {i.lastError && <p className="mt-1 text-xs text-bad">{i.lastError}</p>}
                {i.missingEnv.length > 0 && (
                  <p className="mt-1 text-xs text-warn">
                    Missing env: <span className="font-mono">{i.missingEnv.join(", ")}</span> — see README.
                  </p>
                )}
              </div>
              <div className="flex gap-1.5">
                {connected || i.status === "error" ? (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={async () => {
                        const r = await call("integration.sync", { provider: i.provider as "gmail" });
                        toast.success(`Synced ${r.threads} threads, ${r.messages} new messages`);
                      }}
                    >
                      <RefreshCw /> Sync
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => confirm(`Disconnect ${i.label}? Stored messages stay.`) && call("integration.disconnect", { provider: i.provider as "gmail" })}>
                      <Unplug />
                    </Button>
                  </>
                ) : CONNECT[i.provider] ? (
                  <Button size="sm" variant="primary" disabled={!i.configured} asChild={i.configured}>
                    {i.configured ? (
                      <a href={CONNECT[i.provider]!}>
                        <Plug /> Connect
                      </a>
                    ) : (
                      <span>
                        <Plug /> Connect
                      </span>
                    )}
                  </Button>
                ) : (
                  <Button size="sm" variant="primary" disabled={!i.configured} onClick={() => call("integration.sync", { provider: i.provider as "whatsapp" })}>
                    <Plug /> Activate
                  </Button>
                )}
              </div>
            </div>
          </Panel>
        );
      })}
    </div>
  );
}

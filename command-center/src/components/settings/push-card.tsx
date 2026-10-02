"use client";
import * as React from "react";
import { Bell, BellOff, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

function urlB64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function PushCard() {
  const [state, setState] = React.useState<"unsupported" | "needs-install" | "off" | "on" | "denied" | "loading">("loading");
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  React.useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        const ios = /iPhone|iPad/.test(navigator.userAgent);
        const standalone = window.matchMedia("(display-mode: standalone)").matches;
        setState(ios && !standalone ? "needs-install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })();
  }, []);

  const enable = async () => {
    if (!key) return toast.error("Push isn't configured on the server yet (VAPID keys). See README → Push.");
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return setState("denied");
    const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
    await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(key) });
    await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
    setState("on");
    toast.success("Notifications on for this device");
  };
  const disable = async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
      await sub.unsubscribe();
    }
    setState("off");
  };
  const test = async (kind: "morning" | "close") => {
    const r = await fetch("/api/push/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind }) });
    const d = await r.json();
    if (!r.ok) toast.error(d.error);
    else toast.success(`Sent to ${d.sent} device${d.sent === 1 ? "" : "s"}`);
  };

  return (
    <div className="space-y-3">
      {state === "needs-install" && <p className="text-sm text-fg-2">On iPhone, push works only from the installed app: Safari → Share → Add to Home Screen, then open it from the home screen and come back here.</p>}
      {state === "unsupported" && <p className="text-sm text-fg-2">This browser doesn&apos;t support web push.</p>}
      {state === "denied" && <p className="text-sm text-bad">Notifications are blocked for this site. Re-enable them in the browser / iOS Settings → Notifications.</p>}
      <div className="flex flex-wrap gap-2">
        {state === "off" && (
          <Button variant="primary" onClick={enable}>
            <Bell /> Enable on this device
          </Button>
        )}
        {state === "on" && (
          <Button variant="secondary" onClick={disable}>
            <BellOff /> Turn off on this device
          </Button>
        )}
        <Button variant="ghost" onClick={() => test("morning")}>
          <Send /> Test “Your day”
        </Button>
        <Button variant="ghost" onClick={() => test("close")}>
          <Send /> Test “Close the day”
        </Button>
      </div>
    </div>
  );
}

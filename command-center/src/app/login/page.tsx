"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Lock } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next") || "/";
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="w-full max-w-sm space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr("");
        const r = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }) });
        setBusy(false);
        if (r.ok) router.replace(next.startsWith("/") ? next : "/");
        else setErr((await r.json().catch(() => ({}))).error ?? "Wrong password");
      }}
    >
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-accent to-accent-2 text-xl font-bold text-white shadow-[0_16px_40px_-10px_var(--accent)]">M</div>
        <h1 className="text-xl font-semibold tracking-tight">Micromex Command</h1>
        <p className="mt-1 text-sm text-muted">Exit-ready by Oct 2031.</p>
      </div>
      <div className="relative">
        <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <Input type="password" autoFocus autoComplete="current-password" placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} className="h-12 pl-9 text-base" />
      </div>
      {err && <p className="text-center text-sm text-bad">{err}</p>}
      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy || !pw}>
        Enter
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="grid min-h-dvh place-items-center px-6">
      <div className="backdrop" />
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}

"use client";
import useSWR, { mutate as globalMutate, type SWRConfiguration } from "swr";
import { toast } from "sonner";
import type { Queries, Mutations, QueryName, MutationName } from "./rpc/registry";
import type { z } from "zod";

/** Date → string, recursively — what JSON actually delivers. */
export type Jsonify<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Jsonify<U>[]
    : T extends object
      ? { [K in keyof T]: Jsonify<T[K]> }
      : T;

export type QOut<K extends QueryName> = Jsonify<Awaited<ReturnType<Queries[K]["run"]>>>;
export type QIn<K extends QueryName> = z.input<Queries[K]["input"]>;
export type MOut<K extends MutationName> = Jsonify<Awaited<ReturnType<Mutations[K]["run"]>>>;
export type MIn<K extends MutationName> = z.input<Mutations[K]["input"]>;

export function qKey<K extends QueryName>(name: K, input?: QIn<K>) {
  const hasInput = input && Object.keys(input as object).length > 0;
  return `/api/q/${name}${hasInput ? `?input=${encodeURIComponent(JSON.stringify(input))}` : ""}`;
}

async function fetcher(url: string) {
  const res = await fetch(url, { credentials: "same-origin" });
  if (res.status === 401) {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- hard reload drops stale SWR state
    window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    throw new Error("unauthorized");
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? "Request failed");
  return data;
}

export function useQ<K extends QueryName>(name: K, input?: QIn<K>, config?: SWRConfiguration) {
  return useSWR<QOut<K>>(qKey(name, input), fetcher, { revalidateOnFocus: true, keepPreviousData: true, ...config });
}

/** Revalidate every query (single user, small data — simplest correct cache policy). */
export function refreshAll() {
  return globalMutate((key) => typeof key === "string" && key.startsWith("/api/q/"));
}

export async function call<K extends MutationName>(name: K, input: MIn<K>, opts: { silent?: boolean; refresh?: boolean } = {}): Promise<MOut<K>> {
  const res = await fetch(`/api/m/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error ?? "Something went wrong";
    if (!opts.silent) toast.error(msg);
    throw new Error(msg);
  }
  if (opts.refresh !== false) void refreshAll();
  return data;
}

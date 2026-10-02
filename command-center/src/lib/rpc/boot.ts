import { seedIfEmpty } from "../seed";

let booted: Promise<unknown> | null = null;

/** First request in a fresh database loads the seed. Memoized per server instance. */
export function boot() {
  booted ??= seedIfEmpty().catch((e) => {
    booted = null;
    console.error("[seed]", e);
  });
  return booted;
}

import { db } from "../db";
import * as game from "../game/hooks";
import type { Metric } from "@prisma/client";
import { getTz } from "../settings";
import { addDays, dateToKey, keyToDate, todayKey, weekStartKey } from "../time";

// Scoreboard metrics are activity and pipeline counts ONLY. Units are counts or
// unitless percentages — never currency.

export type Rag = "green" | "amber" | "red" | "none";

/** Pipeline-derived values for AUTO metrics. */
export const AUTO_METRICS: Record<string, { label: string; compute: (year: number) => Promise<number> }> = {
  pipeline_active: {
    label: "Active accounts in pipeline (not yet customers)",
    compute: () => db.pipelineCard.count({ where: { archivedAt: null, stage: { not: "CUSTOMER" } } }),
  },
  accounts_won_ytd: {
    label: "Cards moved to Customer this calendar year",
    compute: (year) =>
      db.pipelineCard.count({
        where: { wonAt: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } },
      }),
  },
  dc_accounts: {
    label: "Customer-stage Data Center accounts",
    compute: () => db.pipelineCard.count({ where: { archivedAt: null, stage: "CUSTOMER", lane: "DATA_CENTER" } }),
  },
  ad_accounts: {
    label: "Customer-stage A&D accounts",
    compute: () => db.pipelineCard.count({ where: { archivedAt: null, stage: "CUSTOMER", lane: "AD" } }),
  },
  accounts_3_contacts: {
    label: "Pipeline accounts with 3+ contacts",
    compute: async () => {
      const rows = await db.pipelineContact.groupBy({ by: ["cardId"], _count: true });
      return rows.filter((r) => r._count >= 3).length;
    },
  },
};

export function ragFor(m: Pick<Metric, "target" | "lowerIsBetter" | "aggregation">, value: number | null): Rag {
  if (m.target == null || value == null) return "none";
  if (m.lowerIsBetter) {
    if (value <= m.target) return "green";
    if (value <= m.target * 1.2) return "amber";
    return "red";
  }
  if (m.target === 0) return "green";
  const r = value / m.target;
  if (r >= 1) return "green";
  if (r >= 0.7) return "amber";
  return "red";
}

/** Write this week's snapshot for AUTO metrics so they have trend history. */
export async function snapshotAutoMetrics() {
  const tz = await getTz();
  const today = todayKey(tz);
  const ws = keyToDate(weekStartKey(today));
  const year = Number(today.slice(0, 4));
  const metrics = await db.metric.findMany({ where: { source: "AUTO", archivedAt: null } });
  for (const m of metrics) {
    const def = m.autoKey ? AUTO_METRICS[m.autoKey] : undefined;
    if (!def) continue;
    const value = await def.compute(year);
    await db.metricEntry.upsert({
      where: { metricId_weekStart: { metricId: m.id, weekStart: ws } },
      create: { metricId: m.id, weekStart: ws, value },
      update: { value },
    });
  }
}

/** Actual value per metric over a date range (SUM → total of weeks in range, LATEST → last value). */
export async function metricActualsForRange(keys: string[], start: string, end: string) {
  const metrics = await db.metric.findMany({ where: { key: { in: keys } } });
  const out: Record<string, { name: string; value: number }> = {};
  const year = Number(end.slice(0, 4));
  for (const m of metrics) {
    if (m.source === "AUTO" && m.autoKey && AUTO_METRICS[m.autoKey] && m.aggregation === "LATEST") {
      out[m.key] = { name: m.name, value: await AUTO_METRICS[m.autoKey].compute(year) };
      continue;
    }
    if (m.aggregation === "SUM") {
      const agg = await db.metricEntry.aggregate({
        where: { metricId: m.id, weekStart: { gte: keyToDate(weekStartKey(start)), lte: keyToDate(end) } },
        _sum: { value: true },
      });
      out[m.key] = { name: m.name, value: agg._sum.value ?? 0 };
    } else {
      const last = await db.metricEntry.findFirst({
        where: { metricId: m.id, weekStart: { lte: keyToDate(end) } },
        orderBy: { weekStart: "desc" },
      });
      out[m.key] = { name: m.name, value: last?.value ?? 0 };
    }
  }
  return out;
}

export async function scoreboard(weeks = 12) {
  await snapshotAutoMetrics();
  const tz = await getTz();
  const today = todayKey(tz);
  const thisWeek = weekStartKey(today);
  const firstWeek = addDays(thisWeek, -7 * (weeks - 1));
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const metrics = await db.metric.findMany({
    where: { archivedAt: null },
    orderBy: { sortOrder: "asc" },
    include: { entries: { where: { weekStart: { gte: keyToDate(addDays(yearStart, -7)) } }, orderBy: { weekStart: "asc" } } },
  });
  const weekKeys = Array.from({ length: weeks }, (_, i) => addDays(firstWeek, 7 * i));

  const rows = metrics.map((m) => {
    const byWeek = new Map(m.entries.map((e) => [dateToKey(e.weekStart)!, e.value]));
    let carry: number | null = null;
    const series = weekKeys.map((wk) => {
      const v = byWeek.get(wk);
      if (m.aggregation === "LATEST") {
        if (v != null) carry = v;
        return { week: wk, value: v ?? carry };
      }
      return { week: wk, value: v ?? null };
    });
    const current = byWeek.get(thisWeek) ?? (m.aggregation === "LATEST" ? series.at(-1)?.value ?? null : null);
    const lastWeek = byWeek.get(addDays(thisWeek, -7)) ?? null;
    const ytd =
      m.aggregation === "SUM"
        ? m.entries.filter((e) => dateToKey(e.weekStart)! >= weekStartKey(yearStart)).reduce((a, e) => a + e.value, 0)
        : current;
    return {
      id: m.id,
      key: m.key,
      name: m.name,
      description: m.description,
      unit: m.unit,
      aggregation: m.aggregation,
      source: m.source,
      autoKey: m.autoKey,
      target: m.target,
      ytdTarget: m.ytdTarget,
      lowerIsBetter: m.lowerIsBetter,
      sortOrder: m.sortOrder,
      current,
      lastWeek,
      ytd,
      rag: ragFor(m, m.aggregation === "SUM" ? (current ?? 0) : current),
      // last week is the fairer RAG for weekly sums mid-week
      ragLastWeek: m.aggregation === "SUM" ? ragFor(m, lastWeek ?? 0) : null,
      series,
    };
  });

  // Pipeline by stage (current) — for the stage chart
  const stageCounts = await db.pipelineCard.groupBy({
    by: ["stage", "lane"],
    where: { archivedAt: null },
    _count: true,
  });

  const exit = await exitReadiness();
  return { today, thisWeek, weekKeys, metrics: rows, stageCounts: stageCounts.map((s) => ({ stage: s.stage, lane: s.lane, count: s._count })), exit };
}

export async function recordMetric(input: { metricKey?: string; metricId?: string; weekStart?: string; value: number; mode?: "set" | "add"; note?: string }) {
  const m = input.metricId
    ? await db.metric.findUniqueOrThrow({ where: { id: input.metricId } })
    : await db.metric.findUniqueOrThrow({ where: { key: input.metricKey! } });
  const tz = await getTz();
  const wk = keyToDate(weekStartKey(input.weekStart ?? todayKey(tz)));
  const existing = await db.metricEntry.findUnique({ where: { metricId_weekStart: { metricId: m.id, weekStart: wk } } });
  const value = input.mode === "add" ? (existing?.value ?? 0) + input.value : input.value;
  const entry = await db.metricEntry.upsert({
    where: { metricId_weekStart: { metricId: m.id, weekStart: wk } },
    create: { metricId: m.id, weekStart: wk, value, note: input.note ?? "" },
    update: { value, ...(input.note != null ? { note: input.note } : {}) },
  });
  await game.onMetricRecorded(m.id, wk);
  return entry;
}

export async function clearMetricEntry(metricId: string, weekStart: string) {
  await db.metricEntry.deleteMany({ where: { metricId, weekStart: keyToDate(weekStartKey(weekStart)) } });
  await game.onMetricRecorded(metricId, keyToDate(weekStartKey(weekStart)));
  return { ok: true };
}

export type MetricInput = {
  key: string;
  name: string;
  description?: string;
  unit?: string;
  aggregation?: "SUM" | "LATEST";
  source?: "MANUAL" | "AUTO";
  autoKey?: string | null;
  target?: number | null;
  ytdTarget?: number | null;
  lowerIsBetter?: boolean;
};

const CURRENCY_UNIT = /(\$|usd|mxn|dollar|peso|eur|€|£|revenue|margin|cash|price|invoice|ebitda)/i;

export async function upsertMetric(id: string | null, input: MetricInput) {
  if (input.unit && CURRENCY_UNIT.test(input.unit)) throw new Error("Financial units are not allowed on the scoreboard.");
  if (CURRENCY_UNIT.test(input.name)) throw new Error("Financial metrics are not allowed on the scoreboard.");
  if (id) return db.metric.update({ where: { id }, data: input });
  const count = await db.metric.count();
  return db.metric.create({ data: { ...input, sortOrder: count } });
}

export async function archiveMetric(id: string) {
  return db.metric.update({ where: { id }, data: { archivedAt: new Date() } });
}

export async function reorderMetrics(ids: string[]) {
  await db.$transaction(ids.map((id, i) => db.metric.update({ where: { id }, data: { sortOrder: i } })));
  return { ok: true };
}

// ───────────── Exit readiness ─────────────

export async function exitReadiness() {
  const criteria = await db.exitCriterion.findMany({ orderBy: { sortOrder: "asc" } });
  const tz = await getTz();
  const today = todayKey(tz);
  const keys = criteria.map((c) => c.metricKey).filter(Boolean) as string[];
  const metricVals = keys.length ? await metricActualsForRange(keys, "2000-01-01", today) : {};
  const metrics = keys.length ? await db.metric.findMany({ where: { key: { in: keys } } }) : [];
  const items = criteria.map((c) => {
    let progress = c.progress;
    let auto = false;
    if (c.metricKey && c.threshold != null && metricVals[c.metricKey]) {
      const m = metrics.find((x) => x.key === c.metricKey);
      const v = metricVals[c.metricKey].value;
      const hasData = v > 0;
      if (m && hasData) {
        auto = true;
        if (m.lowerIsBetter) {
          // 100 at/below threshold; scales to 0 at 2× threshold
          progress = v <= c.threshold ? 100 : Math.max(0, Math.round((1 - (v - c.threshold) / c.threshold) * 100));
        } else {
          progress = Math.min(100, Math.round((v / c.threshold) * 100));
        }
      }
    }
    return { ...c, progress, auto, metricValue: c.metricKey ? metricVals[c.metricKey]?.value ?? null : null };
  });
  const totalW = items.reduce((a, c) => a + c.weight, 0) || 1;
  const score = Math.round(items.reduce((a, c) => a + c.weight * c.progress, 0) / totalW);
  return { score, items };
}

export async function upsertExitCriterion(
  id: string | null,
  input: { title: string; notes?: string; weight?: number; progress?: number; metricKey?: string | null; threshold?: number | null },
) {
  if (id) return db.exitCriterion.update({ where: { id }, data: input });
  const count = await db.exitCriterion.count();
  return db.exitCriterion.create({ data: { ...input, sortOrder: count } });
}

export async function deleteExitCriterion(id: string) {
  return db.exitCriterion.delete({ where: { id } });
}

import { db } from "./db";
import { DEFAULT_TZ } from "./time";

export type Settings = {
  ownerName: string;
  company: string;
  timezone: string;
  morningTime: string; // HH:MM
  closeTime: string; // HH:MM
  reviewDay: number; // 5 = Friday
  theme: "dark" | "light";
  exitDate: string; // YYYY-MM-DD
  pushEnabled: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  ownerName: "",
  company: "Micromex",
  timezone: DEFAULT_TZ,
  morningTime: "07:00",
  closeTime: "16:30",
  reviewDay: 5,
  theme: "dark",
  exitDate: "2031-10-31",
  pushEnabled: true,
};

export async function getSettings(): Promise<Settings> {
  const rows = await db.setting.findMany();
  const s: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) s[r.key] = r.value;
  return s as Settings;
}

export async function updateSettings(patch: Partial<Settings>) {
  await db.$transaction(
    Object.entries(patch).map(([key, value]) =>
      db.setting.upsert({
        where: { key },
        create: { key, value: value as never },
        update: { value: value as never },
      }),
    ),
  );
  return getSettings();
}

export async function getTz() {
  const row = await db.setting.findUnique({ where: { key: "timezone" } });
  return (row?.value as string) || DEFAULT_TZ;
}

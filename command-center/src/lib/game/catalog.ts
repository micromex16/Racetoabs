// Pure data shared by the server (prices, unlocks) and the town renderer.

export type Roof = "flat" | "sawtooth" | "gable" | "tank" | "panels" | "cactus" | "tree" | "fountain" | "mural" | "neon" | "flags" | "garden" | "statue" | "tower" | "awning" | "lot" | "yard" | "dock" | "racks" | "sub";

export type BuildingDef = {
  key: string;
  name: string;
  desc: string;
  cost: number;
  w: number;
  d: number;
  /** wall height in px at level 1 */
  h: number;
  category: "production" | "logistics" | "people" | "energy" | "decor" | "landmark";
  roof: Roof;
  /** [top, left face, right face] */
  palette: [string, string, string];
  accent?: string;
  /** Locked until an achievement / rare drop / challenge win unlocks it */
  unlock?: { by: "achievement"; key: string } | { by: "rare" };
  maxLevel: number;
  /** Not purchasable (starting building) */
  fixed?: boolean;
};

const steel: [string, string, string] = ["#c9d3e3", "#8392ab", "#6b7a93"];
const sand: [string, string, string] = ["#e8d8b8", "#c2a77c", "#a88d63"];
const glass: [string, string, string] = ["#cfe6f5", "#6aa5c9", "#4f88ad"];
const brick: [string, string, string] = ["#e3b9a0", "#b57a5c", "#985f44"];
const slate: [string, string, string] = ["#9aa3b5", "#5d6679", "#495163"];
const white: [string, string, string] = ["#f2f2ee", "#cfd0c8", "#b5b6ad"];

export const BUILDINGS: BuildingDef[] = [
  { key: "plant_1", name: "Micromex Plant #1", desc: "Where it all started — Imuris, Sonora.", cost: 0, w: 3, d: 3, h: 34, category: "production", roof: "sawtooth", palette: white, accent: "#7c8cff", maxLevel: 5, fixed: true },

  // Production
  { key: "assembly_line", name: "Assembly Line", desc: "Another line on the floor. Classic sawtooth roof.", cost: 300, w: 2, d: 2, h: 28, category: "production", roof: "sawtooth", palette: steel, accent: "#55a016", maxLevel: 3 },
  { key: "qa_lab", name: "QA Lab", desc: "Glass-walled test lab. Zero escapes.", cost: 450, w: 2, d: 1, h: 24, category: "production", roof: "flat", palette: glass, maxLevel: 3 },
  { key: "smt_line", name: "SMT Line", desc: "Pick-and-place, reflow, AOI.", cost: 800, w: 2, d: 2, h: 26, category: "production", roof: "sawtooth", palette: ["#d6ece9", "#4c9a91", "#3b7f77"], accent: "#1f8fc0", unlock: { by: "achievement", key: "first_rfq" }, maxLevel: 3 },
  { key: "harness_line", name: "Wire-Harness Line", desc: "The A&D lane, built for real.", cost: 600, w: 2, d: 2, h: 28, category: "production", roof: "sawtooth", palette: ["#f1dcc6", "#d0864f", "#b06a37"], accent: "#e5326c", unlock: { by: "achievement", key: "ad_discovery" }, maxLevel: 3 },
  { key: "dc_cell", name: "Data-Center Rack Cell", desc: "Rack integration with blinking burn-in LEDs.", cost: 700, w: 2, d: 2, h: 34, category: "production", roof: "racks", palette: slate, accent: "#1f8fc0", unlock: { by: "achievement", key: "dc_pilot" }, maxLevel: 3 },

  // Logistics
  { key: "warehouse", name: "Warehouse", desc: "Raw material in, finished goods out.", cost: 250, w: 2, d: 2, h: 22, category: "logistics", roof: "gable", palette: sand, maxLevel: 3 },
  { key: "loading_dock", name: "Loading Dock", desc: "Roll-up doors. Trucks love it.", cost: 350, w: 2, d: 1, h: 16, category: "logistics", roof: "dock", palette: steel, accent: "#ffb020", maxLevel: 2 },
  { key: "truck_yard", name: "Truck Yard", desc: "Trailers staged for the border.", cost: 200, w: 2, d: 2, h: 2, category: "logistics", roof: "yard", palette: ["#4a4f5c", "#3a3e48", "#30333b"], maxLevel: 2 },
  { key: "water_tower", name: "Water Tower", desc: "Every real plant has one.", cost: 300, w: 1, d: 1, h: 44, category: "logistics", roof: "tank", palette: white, accent: "#7c8cff", maxLevel: 2 },

  // People
  { key: "office", name: "Front Office", desc: "Reception, conference room, coffee.", cost: 200, w: 1, d: 1, h: 26, category: "people", roof: "flat", palette: glass, maxLevel: 3 },
  { key: "training", name: "Training Center", desc: "Builds the bench. Less key-person risk.", cost: 500, w: 2, d: 1, h: 22, category: "people", roof: "flat", palette: brick, maxLevel: 3 },
  { key: "cafeteria", name: "Comedor", desc: "Lunch for the floor.", cost: 300, w: 1, d: 1, h: 16, category: "people", roof: "awning", palette: ["#fbe3c4", "#e2a35a", "#c98a43"], accent: "#e5326c", maxLevel: 2 },
  { key: "parking", name: "Parking", desc: "Room for the second shift.", cost: 120, w: 2, d: 1, h: 1, category: "people", roof: "lot", palette: ["#5a5f6b", "#45495a", "#3a3e4a"], maxLevel: 1 },

  // Energy
  { key: "solar", name: "Solar Array", desc: "Sonoran sun, put to work.", cost: 280, w: 2, d: 1, h: 4, category: "energy", roof: "panels", palette: ["#24315a", "#1b2442", "#151c35"], maxLevel: 2 },
  { key: "substation", name: "Substation", desc: "More power for more lines.", cost: 220, w: 1, d: 1, h: 16, category: "energy", roof: "sub", palette: slate, accent: "#ffb020", maxLevel: 1 },

  // Decor
  { key: "saguaro", name: "Saguaro", desc: "A local.", cost: 40, w: 1, d: 1, h: 0, category: "decor", roof: "cactus", palette: ["#55a016", "#3f7d10", "#336a0c"], maxLevel: 1 },
  { key: "palo_verde", name: "Palo Verde", desc: "Shade with yellow blooms.", cost: 60, w: 1, d: 1, h: 0, category: "decor", roof: "tree", palette: ["#9cc94a", "#6b9a2a", "#55801f"], accent: "#ffd44a", maxLevel: 1 },
  { key: "flags", name: "Flag Plaza", desc: "🇲🇽 🇺🇸 side by side.", cost: 90, w: 1, d: 1, h: 0, category: "decor", roof: "flags", palette: white, maxLevel: 1 },

  // Rare — only from lucky drops and challenge wins
  { key: "fountain", name: "Fountain", desc: "Rare. Found on a lucky day.", cost: 120, w: 1, d: 1, h: 6, category: "decor", roof: "fountain", palette: ["#d8e7f2", "#9db8cc", "#86a2b6"], unlock: { by: "rare" }, maxLevel: 1 },
  { key: "mural", name: "Sonora Mural", desc: "Rare. Color on the plant wall.", cost: 150, w: 2, d: 1, h: 18, category: "decor", roof: "mural", palette: sand, unlock: { by: "rare" }, maxLevel: 1 },
  { key: "neon", name: "Neon Sign", desc: "Rare. MICROMEX in lights.", cost: 180, w: 1, d: 1, h: 30, category: "decor", roof: "neon", palette: slate, accent: "#e5326c", unlock: { by: "rare" }, maxLevel: 1 },
  { key: "garden", name: "Desert Garden", desc: "Rare. Agave, ocotillo, quiet.", cost: 140, w: 2, d: 2, h: 0, category: "decor", roof: "garden", palette: ["#d9c79c", "#b59d6b", "#9c8455"], unlock: { by: "rare" }, maxLevel: 1 },
  { key: "golden_saguaro", name: "Golden Saguaro", desc: "Very rare.", cost: 250, w: 1, d: 1, h: 0, category: "decor", roof: "cactus", palette: ["#ffd44a", "#d9a915", "#b88d0c"], unlock: { by: "rare" }, maxLevel: 1 },

  // Landmarks — earned by real milestones
  { key: "tucson_hq", name: "Tucson Office", desc: "Unlocked by your first new customer.", cost: 1500, w: 2, d: 2, h: 44, category: "landmark", roof: "flat", palette: glass, accent: "#7c8cff", unlock: { by: "achievement", key: "first_customer" }, maxLevel: 3 },
  { key: "trophy_hall", name: "Trophy Hall", desc: "Unlocked by four closed Friday reviews.", cost: 1200, w: 2, d: 2, h: 30, category: "landmark", roof: "gable", palette: ["#f6e7b5", "#d6b34f", "#bb9532"], unlock: { by: "achievement", key: "reviews_4" }, maxLevel: 2 },
  { key: "founders_statue", name: "Founder's Statue", desc: "Unlocked by a 20-day streak.", cost: 900, w: 1, d: 1, h: 10, category: "landmark", roof: "statue", palette: ["#d9c28a", "#b79b57", "#9c8041"], unlock: { by: "achievement", key: "streak_20" }, maxLevel: 1 },
  { key: "exit_tower", name: "Exit Tower", desc: "Unlocked at 80+ exit readiness. The finish line.", cost: 5000, w: 2, d: 2, h: 80, category: "landmark", roof: "tower", palette: ["#fff2c2", "#e0b743", "#c49a26"], accent: "#ffb020", unlock: { by: "achievement", key: "exit_80" }, maxLevel: 1 },
];

export const RARE_BLUEPRINTS = BUILDINGS.filter((b) => b.unlock?.by === "rare").map((b) => b.key);
export const buildingDef = (key: string) => BUILDINGS.find((b) => b.key === key);
export function upgradeCost(def: BuildingDef, toLevel: number) {
  return Math.round(def.cost * 0.75 * (toLevel - 1)) || 150 * (toLevel - 1);
}

/** World size (tiles). The road runs along the front edge to the border and Tucson. */
export const GRID = { w: 14, h: 12 };
/** Tiles that hold fixed scenery */
export const FIXED = [
  { key: "plant_1", x: 5, y: 4 },
];
export const BEACONS = [
  { x: 1, y: 1 },
  { x: 1, y: 3 },
  { x: 1, y: 5 },
];

export type AchievementDef = { key: string; title: string; desc: string; emoji: string; reward: number };

export const ACHIEVEMENTS: AchievementDef[] = [
  { key: "first_clean", title: "First clean run", desc: "All 3 picks done in a day.", emoji: "✅", reward: 50 },
  { key: "early_bird", title: "Early bird", desc: "All 3 picks done before 10:00.", emoji: "🌅", reward: 100 },
  { key: "streak_5", title: "On a roll", desc: "5-day streak.", emoji: "🔥", reward: 150 },
  { key: "streak_10", title: "Unstoppable", desc: "10-day streak.", emoji: "⚡", reward: 300 },
  { key: "streak_20", title: "Twenty straight", desc: "20-day streak. Unlocks the Founder's Statue.", emoji: "🗿", reward: 600 },
  { key: "sprints_10", title: "Deep worker", desc: "10 focus sprints finished.", emoji: "🎯", reward: 150 },
  { key: "sprints_50", title: "Flow state", desc: "50 focus sprints finished.", emoji: "🌊", reward: 400 },
  { key: "first_rfq", title: "First RFQ", desc: "An account reached RFQ. Unlocks the SMT Line.", emoji: "📄", reward: 150 },
  { key: "ad_discovery", title: "A&D on the board", desc: "An A&D account reached Discovery. Unlocks the Wire-Harness Line.", emoji: "✈️", reward: 150 },
  { key: "dc_pilot", title: "Data-center pilot", desc: "A Data Center account reached Pilot. Unlocks the Rack Cell.", emoji: "🖥️", reward: 400 },
  { key: "first_customer", title: "New logo", desc: "An account moved to Customer. Unlocks the Tucson Office.", emoji: "🏆", reward: 750 },
  { key: "kits_50", title: "Fifty kits", desc: "50 sample kits mailed.", emoji: "📦", reward: 300 },
  { key: "touches_100", title: "Founder in the field", desc: "100 founder outreach touches.", emoji: "🤝", reward: 250 },
  { key: "pipeline_100", title: "Hundred targets", desc: "100 accounts in the pipeline.", emoji: "🎯", reward: 300 },
  { key: "reviews_4", title: "Four Fridays", desc: "4 weekly reviews closed. Unlocks the Trophy Hall.", emoji: "🗓️", reward: 250 },
  { key: "zero_overdue", title: "Clean slate", desc: "Closed a Friday review with nothing overdue.", emoji: "🧹", reward: 150 },
  { key: "quarter_rock", title: "Rock crusher", desc: "Completed a quarterly rock.", emoji: "🪨", reward: 300 },
  { key: "challenge_3", title: "Twist master", desc: "Won 3 weekly twists.", emoji: "🌀", reward: 300 },
  { key: "first_build", title: "Groundbreaking", desc: "First building placed.", emoji: "🏗️", reward: 25 },
  { key: "builder_10", title: "Builder", desc: "10 buildings in town.", emoji: "🏭", reward: 200 },
  { key: "venture_founded", title: "Open for business", desc: "Founded a company in the tycoon game.", emoji: "🔑", reward: 50 },
  { key: "venture_hire_10", title: "Payroll", desc: "Ten people on the game company's payroll at once.", emoji: "👥", reward: 150 },
  { key: "venture_exit", title: "Exit!", desc: "Sold a company in the tycoon game.", emoji: "🥂", reward: 300 },
  { key: "venture_serial", title: "Serial founder", desc: "Sold three companies in the tycoon game.", emoji: "🎩", reward: 750 },
  { key: "exit_80", title: "Almost exit-ready", desc: "Exit readiness 80+. Unlocks the Exit Tower.", emoji: "🗼", reward: 2000 },
];

export type RecordDef = { key: string; title: string; better: "lower" | "higher"; format: "duration" | "clock" | "days" | "count" | "coins" };
export const RECORDS: RecordDef[] = [
  { key: "fastest_run", title: "Fastest clean run", better: "lower", format: "duration" },
  { key: "earliest_finish", title: "Earliest finish", better: "lower", format: "clock" },
  { key: "longest_streak", title: "Longest streak", better: "higher", format: "days" },
  { key: "clean_week", title: "Most clean days in a week", better: "higher", format: "days" },
  { key: "touches_week", title: "Most founder touches in a week", better: "higher", format: "count" },
  { key: "sprints_day", title: "Most sprints in a day", better: "higher", format: "count" },
  { key: "coins_week", title: "Most coins earned in a week", better: "higher", format: "coins" },
];

export type ChallengeKind = "metric_by" | "zero_overdue_by" | "clean_runs" | "early_finishes" | "sprints" | "stage_advances" | "picks_streak";

export function fmtDuration(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}
export function fmtClock(min: number) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  const ap = h >= 12 ? "pm" : "am";
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")}${ap}`;
}
export function fmtRecord(def: RecordDef, v: number) {
  if (def.format === "duration") return fmtDuration(v);
  if (def.format === "clock") return fmtClock(v);
  if (def.format === "days") return `${v} day${v === 1 ? "" : "s"}`;
  if (def.format === "coins") return `${Math.round(v).toLocaleString()} coins`;
  return String(Math.round(v));
}

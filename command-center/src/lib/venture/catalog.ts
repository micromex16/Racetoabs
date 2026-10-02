// The venture: a pretend company you found, staff and grow in the game.
// Its money is "bucks" — fictional play money that never touches Micromex.

export type Role = "OPERATOR" | "SALES" | "ENGINEER" | "MANAGER";
export const ROLES: Role[] = ["OPERATOR", "SALES", "ENGINEER", "MANAGER"];

export type Industry = {
  key: string;
  name: string;
  emoji: string;
  pitch: string;
  unit: string;
  /** Walk-in price of one unit, in bucks */
  price: number;
  roles: Record<Role, string>;
  machines: [string, string, string, string, string];
  customers: string[];
  competitors: string[];
  names: string[];
  color: string;
};

export const INDUSTRIES: Industry[] = [
  {
    key: "contract_mfg",
    name: "Contract manufacturing",
    emoji: "🏭",
    pitch: "The mirror game. Build boards and boxes for other people's brands.",
    unit: "assemblies",
    price: 60,
    roles: { OPERATOR: "Assembler", SALES: "Account manager", ENGINEER: "Process engineer", MANAGER: "Shift lead" },
    machines: ["Solder bench", "Pick-and-place", "Reflow oven", "AOI + test cell", "Robotic line"],
    customers: ["Northwind Robotics", "Helios Data", "Cobalt Medical", "Sierra Avionics", "Ironwood Energy", "Atlas Rail", "Brightline Labs", "Kestrel Defense"],
    competitors: ["Rio Assembly", "Vantage EMS", "Copperhead Mfg"],
    names: ["Desert Forge", "Saguaro Assembly", "Copper Line Works", "Border Built"],
    color: "#7c8cff",
  },
  {
    key: "coffee",
    name: "Coffee roastery",
    emoji: "☕",
    pitch: "Roast, bag, sell to cafés and grocers. Small units, lots of them.",
    unit: "bags",
    price: 18,
    roles: { OPERATOR: "Roaster", SALES: "Wholesale rep", ENGINEER: "Q grader", MANAGER: "Roastery manager" },
    machines: ["Sample roaster", "Drum roaster", "Bagging line", "Fluid-bed roaster", "Cold-brew plant"],
    customers: ["Corner Bakery Co.", "Hotel Saguaro", "Campus Dining", "Grocer's Collective", "Airport Kiosks", "Office Pantry Inc.", "Mesa Cafés", "Trailhead Market"],
    competitors: ["Big Bean", "Roast Republic", "Driftwood Coffee"],
    names: ["Ocotillo Roasters", "Monsoon Coffee", "Sunrise Bean Co.", "Copper Kettle"],
    color: "#b0703c",
  },
  {
    key: "brewery",
    name: "Craft brewery",
    emoji: "🍺",
    pitch: "Brew, keg, get on tap across town.",
    unit: "kegs",
    price: 120,
    roles: { OPERATOR: "Brewer", SALES: "Distributor rep", ENGINEER: "Lab tech", MANAGER: "Taproom manager" },
    machines: ["Pilot system", "Fermenters", "Bright tanks", "Canning line", "Barrel room"],
    customers: ["The Thirsty Saguaro", "Stadium Concessions", "Mesa Taphouse", "Desert Distributing", "Riverfront Grill", "Hotel Congress Row"],
    competitors: ["Mega Brew Co.", "Canyon Ales", "Hop Republic"],
    names: ["Monsoon Brewing", "Dry Heat Ales", "Sonoran Brewworks", "Dust Devil Beer"],
    color: "#e0a526",
  },
  {
    key: "software",
    name: "Software studio",
    emoji: "💻",
    pitch: "Ship features for clients. Talent is everything.",
    unit: "features",
    price: 300,
    roles: { OPERATOR: "Developer", SALES: "Sales lead", ENGINEER: "Architect", MANAGER: "Product manager" },
    machines: ["Laptops", "Device lab", "CI servers", "Design studio", "GPU cluster"],
    customers: ["Fleetwise", "Paloma Health", "Ledgerline", "Arroyo Logistics", "Quill Education", "Trailmap Outdoors"],
    competitors: ["Pixel Mill", "Stacksmith", "Northstar Digital"],
    names: ["Night Shift Labs", "Mesa Software", "Cactus Code", "Pinnacle Apps"],
    color: "#1f8fc0",
  },
  {
    key: "furniture",
    name: "Furniture workshop",
    emoji: "🪑",
    pitch: "Tables, chairs, built-ins. Craft that scales into a factory.",
    unit: "pieces",
    price: 220,
    roles: { OPERATOR: "Craftsperson", SALES: "Showroom rep", ENGINEER: "Designer", MANAGER: "Shop foreman" },
    machines: ["Workbench", "Table saw", "CNC router", "Finishing booth", "Kiln dryer"],
    customers: ["Boutique Hotel Group", "Studio Home", "Campus Housing", "Mesquite Restaurants", "Office Fit-Out Co.", "Ranch & Range"],
    competitors: ["Flatpack Giant", "Oakline", "Heritage Woodworks"],
    names: ["Mesquite & Co.", "Ironwood Works", "Dovetail Desert", "Grain & Steel"],
    color: "#a0693a",
  },
  {
    key: "bakery",
    name: "Bakery",
    emoji: "🥐",
    pitch: "Early mornings, wholesale bread, a line out the door.",
    unit: "dozens",
    price: 30,
    roles: { OPERATOR: "Baker", SALES: "Wholesale rep", ENGINEER: "Pastry chef", MANAGER: "Bakery manager" },
    machines: ["Stand mixers", "Deck oven", "Proofing room", "Spiral mixer", "Tunnel oven"],
    customers: ["Downtown Cafés", "Hotel Breakfasts", "School District", "Farmers Market Co-op", "Corporate Catering", "Weekend Brunch Bar"],
    competitors: ["Factory Bread Co.", "La Esquina", "Golden Crust"],
    names: ["Conchas & Co.", "Rise Early", "Mesquite Flour", "Sunrise Bakehouse"],
    color: "#d58b44",
  },
  {
    key: "drones",
    name: "Drone maker",
    emoji: "🛩️",
    pitch: "Few units, big tickets, long programs.",
    unit: "drones",
    price: 900,
    roles: { OPERATOR: "Technician", SALES: "BD lead", ENGINEER: "Flight engineer", MANAGER: "Program manager" },
    machines: ["Solder stations", "3D-print farm", "Flight-test cage", "Carbon layup", "Assembly cell"],
    customers: ["AgriSky Farms", "Border Survey", "Mining Ops Inc.", "Wildfire Response", "Utility Inspect", "Film Rentals West"],
    competitors: ["SkyForge", "Rotorwerks", "Hawkline"],
    names: ["Kestrel Aero", "Haboob Drones", "Thermal Labs", "Roadrunner UAV"],
    color: "#55a016",
  },
  {
    key: "apparel",
    name: "Apparel brand",
    emoji: "👕",
    pitch: "Cut, sew, print, ship. Drops and wholesale.",
    unit: "garments",
    price: 25,
    roles: { OPERATOR: "Sewist", SALES: "Buyer rep", ENGINEER: "Pattern maker", MANAGER: "Studio manager" },
    machines: ["Sewing machines", "Screen-print press", "Cutting table", "Embroidery heads", "DTG printers"],
    customers: ["Boutique Collective", "Team Store", "Music Festival", "Brewery Merch", "Outdoor Outfitters", "Campus Bookstore"],
    competitors: ["Fast Fashion Inc.", "Thread Lab", "Desert Threads"],
    names: ["Dry Heat Supply", "Monsoon Goods", "Saguaro Stitch", "Copper State Co."],
    color: "#e5326c",
  },
];

export const industryDef = (key: string) => INDUSTRIES.find((i) => i.key === key) ?? INDUSTRIES[0];
/** Units per hour scale so every industry earns on the same curve. */
export const rateOf = (ind: Industry) => 15 / ind.price;

export type LeaseDef = { key: string; name: string; emoji: string; seats: number; slots: number; rent: number; moveIn: number; level: number; floor: [number, number] };
export const LEASES: LeaseDef[] = [
  { key: "garage", name: "Garage", emoji: "🏚️", seats: 3, slots: 1, rent: 15, moveIn: 0, level: 1, floor: [4, 3] },
  { key: "shop", name: "Small shop", emoji: "🏪", seats: 8, slots: 3, rent: 60, moveIn: 1500, level: 2, floor: [6, 4] },
  { key: "warehouse", name: "Warehouse", emoji: "🏬", seats: 18, slots: 6, rent: 180, moveIn: 6000, level: 4, floor: [8, 5] },
  { key: "plant", name: "Plant", emoji: "🏭", seats: 40, slots: 12, rent: 450, moveIn: 25000, level: 7, floor: [10, 6] },
  { key: "campus", name: "Campus", emoji: "🏙️", seats: 90, slots: 24, rent: 1100, moveIn: 90000, level: 10, floor: [12, 7] },
];
export const leaseDef = (key: string) => LEASES.find((l) => l.key === key) ?? LEASES[0];
export const leaseIndex = (key: string) => Math.max(0, LEASES.findIndex((l) => l.key === key));

export const MACHINE_TIERS = [
  { cost: 800, boost: 0.25, upkeep: 2 },
  { cost: 3000, boost: 0.5, upkeep: 6 },
  { cost: 9000, boost: 0.8, upkeep: 15 },
  { cost: 25000, boost: 1.2, upkeep: 35 },
  { cost: 70000, boost: 1.8, upkeep: 80 },
];
/** Machine tier t (0-based) needs at least lease index t. */
export const machineNeedsLease = (t: number) => t;

export const WAGE: Record<Role, { base: number; perSkill: number }> = {
  OPERATOR: { base: 14, perSkill: 5 },
  SALES: { base: 16, perSkill: 6 },
  ENGINEER: { base: 20, perSkill: 7 },
  MANAGER: { base: 22, perSkill: 8 },
};

export type TraitKey = "hustler" | "loyal" | "mentor" | "rookie" | "star" | "steady";
export const TRAITS: Record<TraitKey, { name: string; emoji: string; desc: string }> = {
  hustler: { name: "Hustler", emoji: "⚡", desc: "+20% output, a little less happy." },
  loyal: { name: "Loyal", emoji: "🤝", desc: "Happier, and almost never quits." },
  mentor: { name: "Mentor", emoji: "🧑‍🏫", desc: "The whole team learns 30% faster." },
  rookie: { name: "Rookie", emoji: "🌱", desc: "Cheaper and learns twice as fast." },
  star: { name: "Star", emoji: "🌟", desc: "+30% contribution. Costs 40% more." },
  steady: { name: "Steady", emoji: "🧘", desc: "Mood barely moves, good times or bad." },
};

export function wageFor(role: Role, skill: number, trait: string | null) {
  const w = WAGE[role];
  let wage = w.base + w.perSkill * skill;
  if (trait === "rookie") wage *= 0.8;
  if (trait === "star") wage *= 1.4;
  return Math.round(wage);
}

export type TierDef = { rep: number; units: [number, number]; hours: [number, number]; mult: number; repGain: number; repLoss: number; label: string };
export const CONTRACT_TIERS: TierDef[] = [
  { rep: 0, units: [8, 24], hours: [8, 20], mult: 1.6, repGain: 3, repLoss: 4, label: "Small" },
  { rep: 15, units: [40, 110], hours: [16, 40], mult: 1.8, repGain: 6, repLoss: 8, label: "Regular" },
  { rep: 40, units: [150, 360], hours: [30, 72], mult: 2.0, repGain: 12, repLoss: 15, label: "Big" },
  { rep: 90, units: [550, 1400], hours: [60, 120], mult: 2.2, repGain: 25, repLoss: 25, label: "Major" },
  { rep: 180, units: [1800, 4200], hours: [96, 168], mult: 2.4, repGain: 50, repLoss: 40, label: "Anchor" },
];
export const maxTierFor = (rep: number) => CONTRACT_TIERS.reduce((m, t, i) => (rep >= t.rep ? i : m), 0);

/** Founder level comes only from coins earned by real work. */
export const LEVELS = [0, 300, 900, 1800, 3000, 4600, 6600, 9000, 12000, 15500, 19500, 24000, 29000, 35000, 42000, 50000];
export const LEVEL_TITLES = ["Side hustler", "Founder", "Operator", "Builder", "Owner", "Employer", "Industrialist", "Magnate", "Mogul", "Tycoon"];
export function founderLevel(xp: number) {
  let lvl = 1;
  for (let i = 0; i < LEVELS.length; i++) if (xp >= LEVELS[i]) lvl = i + 1;
  const next = LEVELS[lvl] ?? null;
  const prev = LEVELS[lvl - 1];
  return { level: lvl, title: LEVEL_TITLES[Math.min(LEVEL_TITLES.length - 1, Math.floor((lvl - 1) / 1.6))], xp, prev, next, pct: next ? Math.round(((xp - prev) / (next - prev)) * 100) : 100 };
}

/** Real-life wins open doors in the game. Keyed by real achievements. */
export const CONNECTIONS: { achievement: string; name: string; emoji: string; desc: string }[] = [
  { achievement: "first_rfq", name: "Quote desk", emoji: "📄", desc: "Contracts pay 5% more." },
  { achievement: "dc_pilot", name: "Pilot program", emoji: "🧪", desc: "Bigger contract offers come more often." },
  { achievement: "first_customer", name: "Anchor customer", emoji: "🏆", desc: "Offers arrive 20% faster." },
  { achievement: "reviews_4", name: "Operating rhythm", emoji: "🗓️", desc: "Team mood +5." },
  { achievement: "streak_10", name: "Discipline", emoji: "⚡", desc: "Output +5%." },
  { achievement: "sprints_50", name: "Deep focus", emoji: "🎯", desc: "Momentum can reach ×2.3." },
];

export const STARTING_CASH = 5000;
export const COINS_TO_BUCKS = 25;
export const MIN_SELL_HOURS = 72;
export const MAX_CATCHUP_HOURS = 72;
/** Real coins in the last 24h that move momentum by +1 */
export const MOMENTUM_COINS = 300;

export const FIRST = ["Ana", "Luis", "Maria", "Jorge", "Sofia", "Diego", "Valeria", "Carlos", "Lucia", "Miguel", "Elena", "Ramon", "Paula", "Tomas", "Isabel", "Andres", "Camila", "Hector", "Rosa", "Pablo", "Jess", "Sam", "Alex", "Jordan", "Taylor", "Morgan", "Casey", "Riley", "Quinn", "Avery", "Drew", "Jamie", "Noor", "Kai", "Mei", "Ravi", "Omar", "Lena", "Ivan", "Zoe"];
export const LAST = ["Garcia", "Lopez", "Martinez", "Ruiz", "Soto", "Reyes", "Castro", "Ortega", "Navarro", "Vega", "Romero", "Molina", "Chen", "Patel", "Nguyen", "Kim", "Smith", "Brooks", "Hayes", "Foster", "Bennett", "Price", "Ward", "Ellis", "Shah", "Okafor", "Silva", "Duarte"];

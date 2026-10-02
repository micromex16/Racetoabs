"use client";
import * as React from "react";
import type { QOut } from "@/lib/client";
import { BUILDINGS, BEACONS, GRID, buildingDef } from "@/lib/game/catalog";
import { IsoBuilding, IsoBox, SvgDefs, makeProj, TW, TH, type Proj } from "./iso";
import { RING_COLORS } from "@/lib/utils";

type Game = QOut<"game">;
type Tile = { x: number; y: number };
export type Ghost = { type: string; x: number; y: number; valid: boolean } | null;

const STAGES = ["TARGET", "CONTACTED", "SAMPLE_SENT", "DISCOVERY", "RFQ", "QUOTED", "PILOT", "CUSTOMER"];
const STAGE_SHORT: Record<string, string> = { TARGET: "Target", CONTACTED: "Contacted", SAMPLE_SENT: "Sample", DISCOVERY: "Discovery", RFQ: "RFQ", QUOTED: "Quoted", PILOT: "Pilot", CUSTOMER: "Customer" };
const LANE_COLOR: Record<string, string> = { DATA_CENTER: "#1f8fc0", AD: "#e5326c", OTHER: "#9aa0ae" };
const pts = (list: [number, number][]) => list.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

const X0 = (GRID.h + 1) * (TW / 2) + 24;
const Y0 = 170;
export const WORLD_W = X0 + GRID.w * (TW / 2) + 56;
export const WORLD_H = Y0 + (GRID.w + GRID.h + 7) * (TH / 2) + 30;
const ROAD_Y = GRID.h;
const stageX = (i: number) => 0.6 + i * 1.72;

/** Occupied cells (client-side mirror of the server rule, for ghost previews). */
export function occupiedCells(buildings: Game["buildings"], ignoreId?: string) {
  const s = new Set<string>();
  for (const b of buildings) {
    if (b.id === ignoreId) continue;
    const d = buildingDef(b.type);
    if (!d) continue;
    for (let i = 0; i < d.w; i++) for (let j = 0; j < d.d; j++) s.add(`${b.x + i},${b.y + j}`);
  }
  for (const bc of BEACONS) s.add(`${bc.x},${bc.y}`);
  return s;
}
export function fits(type: string, x: number, y: number, occ: Set<string>) {
  const d = buildingDef(type);
  if (!d || x < 0 || y < 0 || x + d.w > GRID.w || y + d.d > GRID.h) return false;
  for (let i = 0; i < d.w; i++) for (let j = 0; j < d.d; j++) if (occ.has(`${x + i},${y + j}`)) return false;
  return true;
}

function skyFor(hour: number) {
  if (hour < 5.5 || hour >= 20) return { top: "#0a1030", bottom: "#1d2550", night: true, sun: false, dusk: false };
  if (hour < 7.5) return { top: "#3b3f7a", bottom: "#f4a26b", night: false, sun: true, dusk: true };
  if (hour >= 18) return { top: "#3a2f6b", bottom: "#ef8a5b", night: false, sun: true, dusk: true };
  return { top: "#7ec4f0", bottom: "#d8eefb", night: false, sun: true, dusk: false };
}

export function World({
  game,
  mini,
  ghost,
  selectedId,
  onTile,
  onBuilding,
  showGrid,
  hideId,
}: {
  game: Game;
  mini?: boolean;
  ghost?: Ghost;
  selectedId?: string | null;
  onTile?: (t: Tile) => void;
  onBuilding?: (id: string) => void;
  showGrid?: boolean;
  /** Building being moved — drawn as the ghost instead */
  hideId?: string | null;
}) {
  const P: Proj = React.useMemo(() => makeProj(X0, Y0), []);
  const svgRef = React.useRef<SVGSVGElement>(null);
  const [hover, setHover] = React.useState<Tile | null>(null);
  const sky = skyFor(game.hour);
  const power = game.power.value / 100;
  const lit = sky.night && game.power.value >= 40;
  const look = { lit, night: sky.night, power: game.power.value };

  const toTile = (clientX: number, clientY: number): Tile | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const m = svg.getScreenCTM();
    if (!m) return null;
    const p = pt.matrixTransform(m.inverse());
    const X = (p.x - X0) / (TW / 2);
    const Y = (p.y - Y0) / (TH / 2);
    const gx = Math.floor((X + Y) / 2);
    const gy = Math.floor((Y - X) / 2);
    if (gx < 0 || gy < 0 || gx >= GRID.w || gy >= GRID.h) return null;
    return { x: gx, y: gy };
  };

  const sorted = [...game.buildings].sort((a, b) => {
    const da = buildingDef(a.type)!, db = buildingDef(b.type)!;
    return a.x + da.w + a.y + da.d - (b.x + db.w + b.y + db.d) || a.x - b.x;
  });

  // Ground tiles
  const tiles: React.ReactNode[] = [];
  for (let gx = 0; gx < GRID.w; gx++)
    for (let gy = 0; gy < GRID.h; gy++) {
      const a = P(gx, gy), b = P(gx + 1, gy), c = P(gx + 1, gy + 1), e = P(gx, gy + 1);
      const v = (gx * 7 + gy * 13) % 5;
      const fill = ["#e3cfa6", "#e0caa0", "#e6d3ab", "#ddc79c", "#e2cda4"][v];
      const isHover = hover && hover.x === gx && hover.y === gy && showGrid;
      tiles.push(<polygon key={`${gx}-${gy}`} points={pts([a, b, c, e])} fill={isHover ? "#f0dfb8" : fill} stroke={showGrid ? "rgba(120,90,40,.35)" : "rgba(120,90,40,.08)"} strokeWidth={showGrid ? 0.8 : 0.5} />);
    }

  const corner = (gx: number, gy: number) => P(gx, gy);
  const plain = [corner(-3, -2), corner(GRID.w + 7, -2), corner(GRID.w + 7, GRID.h + 5), corner(-3, GRID.h + 5)] as [number, number][];

  // Road strip and stage posts
  const road = [P(-2, ROAD_Y + 0.1), P(GRID.w + 6, ROAD_Y + 0.1), P(GRID.w + 6, ROAD_Y + 1.1), P(-2, ROAD_Y + 1.1)] as [number, number][];
  const [lx1, ly1] = P(-2, ROAD_Y + 0.6);
  const [lx2, ly2] = P(GRID.w + 6, ROAD_Y + 0.6);

  // Pipeline containers
  const byStage = new Map<string, Game["pipeline"]>();
  for (const c of game.pipeline) if (c.stage !== "CUSTOMER") byStage.set(c.stage, [...(byStage.get(c.stage) ?? []), c]);

  const trucks = Math.min(6, Math.max(0, Math.round(game.kitsThisWeek)));
  const truckFrom = P(0.4, ROAD_Y + 0.35);
  const truckTo = P(GRID.w + 1.2, ROAD_Y + 0.35);
  const TP = makeProj(0, 0);

  const plant = game.buildings.find((b) => b.type === "plant_1");
  const chimney = plant ? P(plant.x + 2.65, plant.y + 0.35) : null;
  const plantH = plant ? Math.round(34 * (1 + 0.35 * (plant.level - 1))) : 34;

  const vb = mini ? `${X0 - (GRID.h + 1) * (TW / 2) + 30} ${Y0 - 110} ${(GRID.w + GRID.h + 1) * (TW / 2)} ${(GRID.w + GRID.h) * (TH / 2) + 150}` : `0 0 ${WORLD_W} ${WORLD_H}`;

  return (
    <svg
      ref={svgRef}
      viewBox={vb}
      className="block h-auto w-full select-none"
      onPointerMove={(e) => {
        if (!onTile) return;
        setHover(toTile(e.clientX, e.clientY));
      }}
      onPointerLeave={() => setHover(null)}
      onClick={(e) => {
        if (!onTile) return;
        const t = toTile(e.clientX, e.clientY);
        if (t) onTile(t);
      }}
      role="img"
      aria-label="Your plant and town"
    >
      <SvgDefs />
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sky.top} />
          <stop offset="1" stopColor={sky.bottom} />
        </linearGradient>
        <radialGradient id="sunG">
          <stop offset="0" stopColor={sky.dusk ? "#ffd08a" : "#fff7cf"} />
          <stop offset="1" stopColor={sky.dusk ? "#ff8a5b" : "#ffe27a"} stopOpacity={0} />
        </radialGradient>
      </defs>

      {/* Sky + Sonoran mountains */}
      <rect x={-200} y={-200} width={WORLD_W + 400} height={WORLD_H + 400} fill="url(#sky)" />
      {sky.night &&
        Array.from({ length: 40 }).map((_, i) => <circle key={i} cx={(i * 197) % WORLD_W} cy={(i * 53) % 150} r={(i % 3) * 0.5 + 0.6} fill="#fff" className="game-twinkle" style={{ animationDelay: `${(i % 7) * 0.4}s` }} />)}
      {sky.sun ? <circle cx={WORLD_W * 0.78} cy={sky.dusk ? 120 : 60} r={sky.dusk ? 60 : 44} fill="url(#sunG)" /> : <circle cx={WORLD_W * 0.8} cy={60} r={14} fill="#f3f0e0" opacity={0.9} />}
      <polygon points={pts([[-50, 210], [80, 120], [170, 170], [260, 100], [380, 175], [470, 130], [560, 190], [WORLD_W + 50, 150], [WORLD_W + 50, 330], [-50, 330]])} fill={sky.night ? "#1b2140" : "#b98b6a"} opacity={0.55} />
      <polygon points={pts([[-50, 240], [120, 175], [230, 220], [330, 165], [450, 225], [600, 180], [WORLD_W + 50, 215], [WORLD_W + 50, 340], [-50, 340]])} fill={sky.night ? "#252b4d" : "#a8775a"} opacity={0.6} />

      <g style={{ filter: `saturate(${(0.35 + 0.65 * power).toFixed(2)}) brightness(${(0.62 + 0.38 * power).toFixed(2)})` }}>
        {/* Desert plain */}
        <polygon points={pts(plain)} fill={sky.night ? "#8a7a5c" : "#dcc597"} />
        {tiles}

        {/* Road to the border and Tucson */}
        <polygon points={pts(road)} fill="url(#roadG)" />
        <line x1={lx1} y1={ly1} x2={lx2} y2={ly2} stroke="#f5d36b" strokeWidth={1.4} strokeDasharray="8 8" />
        {!mini &&
          STAGES.map((s, i) => {
            const [px, py] = P(stageX(i) + 0.2, ROAD_Y + 1.55);
            return (
              <g key={s}>
                <line x1={px} y1={py} x2={px} y2={py - 14} stroke="#8a8f9c" strokeWidth={1.2} />
                <rect x={px - 1} y={py - 18} width={30} height={9} rx={2} fill={i === 7 ? "#55a016" : "#2f3442"} />
                <text x={px + 14} y={py - 11.5} fontSize={6.2} fontWeight={700} fill="#fff" textAnchor="middle">
                  {STAGE_SHORT[s]}
                </text>
              </g>
            );
          })}
        {/* Border crossing */}
        {(() => {
          const [bx, by] = P(GRID.w + 1.6, ROAD_Y + 0.6);
          return (
            <g>
              <rect x={bx - 22} y={by - 40} width={4} height={40} fill="#c9ccd3" />
              <rect x={bx + 18} y={by - 30} width={4} height={40} fill="#c9ccd3" />
              <rect x={bx - 24} y={by - 46} width={48} height={12} rx={2} fill="#2f3442" />
              <text x={bx} y={by - 37.5} fontSize={7} fontWeight={800} fill="#fff" textAnchor="middle">
                MX · US
              </text>
            </g>
          );
        })()}
        {/* Tucson skyline */}
        {[
          [GRID.w + 2.6, ROAD_Y - 1.6, 0.6, 0.6, 46],
          [GRID.w + 3.3, ROAD_Y - 1.8, 0.7, 0.7, 64],
          [GRID.w + 4.1, ROAD_Y - 1.5, 0.6, 0.6, 38],
          [GRID.w + 3.2, ROAD_Y - 0.9, 0.5, 0.5, 30],
        ].map(([x, y, w, d, h], i) => (
          <g key={i}>
            <IsoBox P={P} x={x} y={y} w={w} d={d} h={h} top="#cfe6f5" left="#7fa9c6" right="#638ead" />
            {lit &&
              [0.3, 0.55, 0.8].map((f) => {
                const [wx, wy] = P(x + w * 0.3, y + d);
                return <rect key={f} x={wx} y={wy - h * f} width={3} height={3} fill="#ffd77a" opacity={0.9} />;
              })}
          </g>
        ))}
        {!mini && (
          <text x={P(GRID.w + 3.4, ROAD_Y - 0.6)[0]} y={P(GRID.w + 3.4, ROAD_Y - 0.6)[1] + 30} fontSize={9} fontWeight={800} fill="#fff" stroke="#2f3442" strokeWidth={2.5} paintOrder="stroke" textAnchor="middle" letterSpacing={2}>
            TUCSON
          </text>
        )}
        {/* Customer row: one flag per customer */}
        {game.customers.slice(0, 14).map((name, i) => {
          const [fx, fy] = P(GRID.w + 2 + (i % 7) * 0.45, ROAD_Y + 1.5 + Math.floor(i / 7) * 0.5);
          return (
            <g key={name + i}>
              <title>{name}</title>
              <line x1={fx} y1={fy} x2={fx} y2={fy - 22} stroke="#bbb" strokeWidth={1.2} />
              <rect x={fx} y={fy - 22} width={11} height={7} fill={["#55a016", "#1f8fc0", "#e5326c", "#7c8cff", "#f5b819"][i % 5]} className="game-wave" />
            </g>
          );
        })}

        {/* Rock beacons: light fills with this week's rock progress */}
        {BEACONS.map((bc, i) => {
          const r = game.rocks[i];
          const [cx, cy] = P(bc.x + 0.5, bc.y + 0.5);
          const H = 46;
          const fill = r ? Math.max(0.04, r.progress / 100) : 0;
          const col = RING_COLORS[i % 3];
          return (
            <g key={i}>
              <title>{r ? `Rock #${i + 1}: ${r.title} — ${r.progress}%` : `Rock #${i + 1}: not set`}</title>
              <ellipse cx={cx} cy={cy} rx={11} ry={5.5} fill="rgba(0,0,0,.2)" />
              <rect x={cx - 5} y={cy - H} width={10} height={H} rx={5} fill="rgba(255,255,255,.35)" stroke="rgba(0,0,0,.2)" strokeWidth={0.6} />
              <rect x={cx - 5} y={cy - H * fill} width={10} height={H * fill} rx={5} fill={col} />
              <circle cx={cx} cy={cy - H - 6} r={r?.done ? 6 : 4} fill={r ? col : "#999"} filter={r?.done || lit ? "url(#neonGlow)" : undefined} className={r?.done ? "game-pulse" : undefined} />
              {!mini && (
                <text x={cx} y={cy + 13} fontSize={7.5} fontWeight={800} textAnchor="middle" fill={col}>
                  #{i + 1}
                </text>
              )}
            </g>
          );
        })}

        {/* Buildings, back to front */}
        {sorted.map((b) => {
          const def = buildingDef(b.type);
          if (!def) return null;
          if (b.id === hideId) return null;
          return (
            <g
              key={b.id}
              onClick={(e) => {
                if (!onBuilding || ghost) return;
                e.stopPropagation();
                onBuilding(b.id);
              }}
              style={{ cursor: onBuilding && !ghost ? "pointer" : undefined }}
            >
              <IsoBuilding P={P} def={def} x={b.x} y={b.y} level={b.level} look={{ ...look, selected: b.id === selectedId }} />
            </g>
          );
        })}

        {/* Smoke from the plant when it's running */}
        {chimney && game.power.value >= 60 &&
          [0, 1, 2].map((i) => <circle key={i} cx={chimney[0]} cy={chimney[1] - plantH - 36} r={5} fill={sky.night ? "#a0a4b5" : "#f5f5f0"} className="game-smoke" style={{ animationDelay: `${i * 1.05}s` }} />)}

        {/* Ghost while placing */}
        {ghost && buildingDef(ghost.type) && <IsoBuilding P={P} def={buildingDef(ghost.type)!} x={ghost.x} y={ghost.y} look={{ ...look, ghost: true, invalid: !ghost.valid }} />}

        {/* Pipeline containers waiting at each stage */}
        {STAGES.slice(0, 7).map((s, i) =>
          (byStage.get(s) ?? []).slice(0, 5).map((c, k) => (
            <g key={c.id}>
              <title>{`${c.company} — ${STAGE_SHORT[s]}`}</title>
              <IsoBox P={P} x={stageX(i) - 0.15 + k * 0.3} y={ROAD_Y + 0.2} w={0.22} d={0.4} h={8} top={LANE_COLOR[c.lane]} left={LANE_COLOR[c.lane]} right="#2f3442" stroke="rgba(0,0,0,.35)" />
            </g>
          )),
        )}
        {!mini &&
          STAGES.slice(0, 7).map((s, i) => {
            const n = (byStage.get(s) ?? []).length;
            if (n <= 5) return null;
            const [tx, ty] = P(stageX(i) + 1.5, ROAD_Y + 0.2);
            return (
              <text key={s} x={tx} y={ty - 12} fontSize={7} fontWeight={800} fill="#fff">
                +{n - 5}
              </text>
            );
          })}

        {/* Trucks carry this week's sample kits to the border */}
        {Array.from({ length: trucks }).map((_, i) => (
          <g key={i} opacity={0}>
            <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.08;0.9;1" dur="11s" begin={`${i * 1.8}s`} repeatCount="indefinite" />
            <animateMotion dur="11s" begin={`${i * 1.8}s`} repeatCount="indefinite" path={`M${truckFrom[0]},${truckFrom[1]} L${truckTo[0]},${truckTo[1]}`} />
            <IsoBox P={TP} x={-0.55} y={-0.12} w={0.7} d={0.28} h={10} top="#f2f2ee" left="#cfd0c8" right="#b5b6ad" />
            <IsoBox P={TP} x={0.17} y={-0.12} w={0.22} d={0.28} h={9} top="#e5326c" left="#c22a5b" right="#a8244f" />
          </g>
        ))}
      </g>

      {/* Night tint */}
      {sky.night && <rect x={-200} y={-200} width={WORLD_W + 400} height={WORLD_H + 400} fill="#0a1030" opacity={0.18} pointerEvents="none" />}
    </svg>
  );
}

export const SHOP = BUILDINGS.filter((b) => !b.fixed);

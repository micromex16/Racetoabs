"use client";
import * as React from "react";
import type { BuildingDef } from "@/lib/game/catalog";

// Isometric projection: tile (gx, gy) → screen. 2:1 diamonds.
export const TW = 64;
export const TH = 32;

export type Proj = (gx: number, gy: number) => [number, number];
export function makeProj(x0: number, y0: number): Proj {
  return (gx, gy) => [x0 + ((gx - gy) * TW) / 2, y0 + ((gx + gy) * TH) / 2];
}
const pts = (list: [number, number][]) => list.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
const up = ([x, y]: [number, number], h: number): [number, number] => [x, y - h];

export type Look = { lit: boolean; night: boolean; ghost?: boolean; invalid?: boolean; selected?: boolean; power: number };

/** A plain isometric box: visible top, front-left and front-right faces. */
export function IsoBox({ P, x, y, w, d, h, z = 0, top, left, right, stroke = "rgba(0,0,0,0.18)" }: { P: Proj; x: number; y: number; w: number; d: number; h: number; z?: number; top: string; left: string; right: string; stroke?: string }) {
  const a = up(P(x, y), z), b = up(P(x + w, y), z), c = up(P(x + w, y + d), z), e = up(P(x, y + d), z);
  return (
    <g strokeLinejoin="round">
      <polygon points={pts([e, c, up(c, h), up(e, h)])} fill={left} stroke={stroke} strokeWidth={0.6} />
      <polygon points={pts([c, b, up(b, h), up(c, h)])} fill={right} stroke={stroke} strokeWidth={0.6} />
      <polygon points={pts([up(a, h), up(b, h), up(c, h), up(e, h)])} fill={top} stroke={stroke} strokeWidth={0.6} />
    </g>
  );
}

/** Rows of windows on both visible faces. */
function Windows({ P, x, y, w, d, h, lit, color = "#9fc6e6" }: { P: Proj; x: number; y: number; w: number; d: number; h: number; lit: boolean; color?: string }) {
  if (h < 12) return null;
  const rows = Math.max(1, Math.floor((h - 6) / 10));
  const out: React.ReactNode[] = [];
  const fill = lit ? "#ffd77a" : color;
  const glow = lit ? "url(#winGlow)" : undefined;
  for (let r = 0; r < rows; r++) {
    const v0 = 5 + r * 10;
    const v1 = v0 + 5;
    const cols = Math.max(1, Math.round(w * 2.5));
    for (let c = 0; c < cols; c++) {
      const u0 = (c + 0.25) / (cols / w);
      const u1 = (c + 0.75) / (cols / w);
      out.push(<polygon key={`l${r}-${c}`} points={pts([up(P(x + u0, y + d), v1), up(P(x + u1, y + d), v1), up(P(x + u1, y + d), v0), up(P(x + u0, y + d), v0)])} fill={fill} opacity={lit ? 0.95 : 0.55} filter={glow} />);
    }
    const colsR = Math.max(1, Math.round(d * 2.5));
    for (let c = 0; c < colsR; c++) {
      const t0 = d - (c + 0.25) / (colsR / d);
      const t1 = d - (c + 0.75) / (colsR / d);
      out.push(<polygon key={`r${r}-${c}`} points={pts([up(P(x + w, y + t0), v1), up(P(x + w, y + t1), v1), up(P(x + w, y + t1), v0), up(P(x + w, y + t0), v0)])} fill={fill} opacity={lit ? 0.9 : 0.45} filter={glow} />);
    }
  }
  return <g>{out}</g>;
}

/** Text painted along the front-left face. */
function FaceText({ P, x, y, d, v, text, color, size = 9 }: { P: Proj; x: number; y: number; d: number; v: number; text: string; color: string; size?: number }) {
  const [sx, sy] = up(P(x + 0.25, y + d), v);
  return (
    <text transform={`matrix(1,0.5,0,1,${sx},${sy})`} fontSize={size} fontWeight={800} fill={color} letterSpacing={1} style={{ fontFamily: "var(--font-geist-sans), system-ui" }}>
      {text}
    </text>
  );
}

function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

export function IsoBuilding({ P, def, x, y, level = 1, look }: { P: Proj; def: BuildingDef; x: number; y: number; level?: number; look: Look }) {
  const { w, d } = def;
  const [top, left, right] = def.palette;
  const h = Math.round(def.h * (1 + 0.35 * (level - 1)));
  const lit = look.lit;
  const center = P(x + w / 2, y + d / 2);
  const op = look.ghost ? 0.6 : 1;
  const body = (hh = h, t = top, l = left, r = right) => <IsoBox P={P} x={x} y={y} w={w} d={d} h={hh} top={t} left={l} right={r} />;
  let content: React.ReactNode;

  switch (def.roof) {
    case "sawtooth": {
      const teeth: React.ReactNode[] = [];
      const n = w * 2;
      for (let i = 0; i < n; i++) {
        const u0 = (i / n) * w;
        const u1 = ((i + 1) / n) * w;
        teeth.push(
          <g key={i}>
            <polygon points={pts([up(P(x + u0, y), h), up(P(x + u1, y), h + 8), up(P(x + u1, y + d), h + 8), up(P(x + u0, y + d), h)])} fill={shade(top, -8)} stroke="rgba(0,0,0,.15)" strokeWidth={0.5} />
            <polygon points={pts([up(P(x + u1, y), h + 8), up(P(x + u1, y + d), h + 8), up(P(x + u1, y + d), h), up(P(x + u1, y), h)])} fill={lit ? "#ffe39a" : "#a9d3ef"} opacity={0.9} />
          </g>,
        );
      }
      const isPlant = def.key === "plant_1";
      content = (
        <>
          {body()}
          <Windows P={P} x={x} y={y} w={w} d={d} h={h} lit={lit} />
          {teeth}
          {def.accent && <polygon points={pts([up(P(x, y + d), 3), up(P(x + w, y + d), 3), up(P(x + w, y + d), 6), up(P(x, y + d), 6)])} fill={def.accent} />}
          {isPlant && (
            <>
              <IsoBox P={P} x={x + w - 0.5} y={y + 0.2} w={0.3} d={0.3} h={h + 34} top="#d0d0c8" left="#9a9a92" right="#84847c" />
              <FaceText P={P} x={x} y={y} d={d} v={h - 9} text="MICROMEX" color="#4f5bd5" size={11} />
            </>
          )}
        </>
      );
      break;
    }
    case "gable": {
      const r = 12 + w * 2;
      content = (
        <>
          {body()}
          <Windows P={P} x={x} y={y} w={w} d={d} h={h} lit={lit} />
          <polygon points={pts([up(P(x, y), h), up(P(x + w, y), h), up(P(x + w, y + d / 2), h + r), up(P(x, y + d / 2), h + r)])} fill={shade(top, -30)} />
          <polygon points={pts([up(P(x, y + d), h), up(P(x + w, y + d), h), up(P(x + w, y + d / 2), h + r), up(P(x, y + d / 2), h + r)])} fill={shade(left, 10)} stroke="rgba(0,0,0,.15)" strokeWidth={0.5} />
          <polygon points={pts([up(P(x + w, y), h), up(P(x + w, y + d), h), up(P(x + w, y + d / 2), h + r)])} fill={right} stroke="rgba(0,0,0,.15)" strokeWidth={0.5} />
        </>
      );
      break;
    }
    case "tank": {
      const [cx, cy] = center;
      const legH = h - 16;
      content = (
        <>
          <ellipse cx={cx} cy={cy} rx={14} ry={7} fill="rgba(0,0,0,0.15)" />
          {[-10, 10, -4, 4].map((dx, i) => (
            <line key={i} x1={cx + dx} y1={cy + (i < 2 ? 0 : 3)} x2={cx + dx * 0.5} y2={cy - legH} stroke="#8e8e86" strokeWidth={2} />
          ))}
          <rect x={cx - 13} y={cy - legH - 18} width={26} height={18} fill={left} />
          <rect x={cx} y={cy - legH - 18} width={13} height={18} fill={right} />
          <ellipse cx={cx} cy={cy - legH} rx={13} ry={5} fill={right} />
          <ellipse cx={cx} cy={cy - legH - 18} rx={13} ry={5} fill={top} />
          <path d={`M${cx - 13} ${cy - legH - 18} Q${cx} ${cy - legH - 34} ${cx + 13} ${cy - legH - 18}`} fill={shade(top, -15)} />
          <text x={cx - 7} y={cy - legH - 5} fontSize={8} fontWeight={800} fill={def.accent}>
            MX
          </text>
        </>
      );
      break;
    }
    case "panels": {
      const rows: React.ReactNode[] = [];
      for (let i = 0; i < w * 2; i++) {
        const u0 = i / 2 + 0.05;
        const u1 = u0 + 0.4;
        rows.push(<polygon key={i} points={pts([up(P(x + u0, y + 0.1), h + 8), up(P(x + u1, y + 0.1), h + 8), up(P(x + u1, y + d - 0.1), h), up(P(x + u0, y + d - 0.1), h)])} fill="#2a3f7a" stroke="#8fb0ff" strokeWidth={0.6} />);
      }
      content = (
        <>
          {body(h, "#7f8796", "#5f6674", "#4f5562")}
          {rows}
        </>
      );
      break;
    }
    case "cactus":
    case "tree": {
      const [cx, cy] = center;
      if (def.roof === "cactus") {
        content = (
          <g>
            <ellipse cx={cx} cy={cy} rx={9} ry={4} fill="rgba(0,0,0,0.18)" />
            <rect x={cx - 4} y={cy - 34} width={8} height={34} rx={4} fill={left} />
            <rect x={cx - 1.5} y={cy - 34} width={3} height={34} rx={1.5} fill={top} opacity={0.6} />
            <path d={`M${cx - 4} ${cy - 16} h-6 a3 3 0 0 1 -3 -3 v-9`} stroke={left} strokeWidth={5} fill="none" strokeLinecap="round" />
            <path d={`M${cx + 4} ${cy - 22} h5 a3 3 0 0 0 3 -3 v-6`} stroke={left} strokeWidth={5} fill="none" strokeLinecap="round" />
          </g>
        );
      } else {
        content = (
          <g>
            <ellipse cx={cx} cy={cy} rx={14} ry={6} fill="rgba(0,0,0,0.18)" />
            <rect x={cx - 2} y={cy - 16} width={4} height={16} fill="#7a6040" />
            <circle cx={cx - 8} cy={cy - 20} r={10} fill={right} />
            <circle cx={cx + 7} cy={cy - 22} r={11} fill={left} />
            <circle cx={cx} cy={cy - 30} r={11} fill={top} />
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <circle key={i} cx={cx - 10 + ((i * 7) % 20)} cy={cy - 34 + ((i * 11) % 16)} r={1.6} fill={def.accent} />
            ))}
          </g>
        );
      }
      break;
    }
    case "fountain": {
      const [cx, cy] = center;
      content = (
        <>
          {body(h)}
          <ellipse cx={cx} cy={cy - h} rx={18} ry={9} fill="#5fb4e8" opacity={0.9} />
          <rect x={cx - 1.5} y={cy - h - 18} width={3} height={18} fill="#dfe9f1" />
          <circle cx={cx} cy={cy - h - 20} r={4} fill="#8fd0f5" className="game-bob" />
        </>
      );
      break;
    }
    case "mural": {
      const stripes = ["#e5326c", "#ffb020", "#55a016", "#1f8fc0", "#7c8cff"];
      content = (
        <>
          {body()}
          {stripes.map((c, i) => (
            <polygon key={c} points={pts([up(P(x + (i * w) / 5, y + d), h - 3), up(P(x + ((i + 1) * w) / 5, y + d), h - 3), up(P(x + ((i + 1) * w) / 5, y + d), 3), up(P(x + (i * w) / 5, y + d), 3)])} fill={c} opacity={0.9} />
          ))}
          <circle cx={P(x + w / 2, y + d)[0]} cy={P(x + w / 2, y + d)[1] - h / 2} r={6} fill="#ffd44a" />
        </>
      );
      break;
    }
    case "neon": {
      const [cx, cy] = center;
      content = (
        <g>
          <line x1={cx} y1={cy} x2={cx} y2={cy - h} stroke="#6d7387" strokeWidth={3} />
          <rect x={cx - 26} y={cy - h - 16} width={52} height={16} rx={3} fill="#151826" stroke={def.accent} strokeWidth={1.5} filter={lit ? "url(#neonGlow)" : undefined} />
          <text x={cx} y={cy - h - 5} fontSize={8.5} fontWeight={800} textAnchor="middle" fill={lit ? "#ff6fa0" : "#a14466"} filter={lit ? "url(#neonGlow)" : undefined} letterSpacing={0.6}>
            MICROMEX
          </text>
        </g>
      );
      break;
    }
    case "flags": {
      const [cx, cy] = center;
      content = (
        <g>
          <ellipse cx={cx} cy={cy} rx={14} ry={6} fill="#d9d4c4" />
          {[
            [-7, ["#006847", "#ffffff", "#ce1126"]],
            [7, ["#b22234", "#ffffff", "#3c3b6e"]],
          ].map(([dx, cols]) => (
            <g key={dx as number}>
              <line x1={cx + (dx as number)} y1={cy} x2={cx + (dx as number)} y2={cy - 40} stroke="#aaa" strokeWidth={1.5} />
              {(cols as string[]).map((c, i) => (
                <rect key={c} x={cx + (dx as number)} y={cy - 40 + i * 3.5} width={14} height={3.5} fill={c} className="game-wave" />
              ))}
            </g>
          ))}
        </g>
      );
      break;
    }
    case "garden": {
      const spikes: React.ReactNode[] = [];
      for (let i = 0; i < 7; i++) {
        const [px, py] = P(x + 0.3 + ((i * 0.37) % 1.5), y + 0.3 + ((i * 0.61) % 1.4));
        spikes.push(<path key={i} d={`M${px} ${py} l-5 -10 M${px} ${py} l0 -13 M${px} ${py} l5 -10`} stroke={i % 3 ? "#6f9c4a" : "#9a7bc0"} strokeWidth={2.2} strokeLinecap="round" />);
      }
      content = (
        <>
          {body(2)}
          {spikes}
        </>
      );
      break;
    }
    case "statue": {
      const [cx, cy] = center;
      content = (
        <>
          <IsoBox P={P} x={x + 0.2} y={y + 0.2} w={0.6} d={0.6} h={h} top="#e8e2d2" left="#bdb6a4" right="#a29b88" />
          <g transform={`translate(${cx},${cy - h - 2})`} fill={left}>
            <circle cx={0} cy={-26} r={4.5} fill={top} />
            <path d="M-6 -20 h12 l2 20 h-16z" />
            <path d="M6 -18 l9 -8" stroke={top} strokeWidth={3} strokeLinecap="round" />
          </g>
        </>
      );
      break;
    }
    case "tower": {
      const [cx] = center;
      const [, ty] = up(P(x + w / 2, y + d / 2), h);
      content = (
        <>
          {body()}
          <Windows P={P} x={x} y={y} w={w} d={d} h={h} lit={lit} color="#ffe9a6" />
          <IsoBox P={P} x={x + 0.5} y={y + 0.5} w={w - 1} d={d - 1} h={22} z={h} top={top} left={left} right={right} />
          <line x1={cx} y1={ty - 22} x2={cx} y2={ty - 52} stroke="#e0b743" strokeWidth={2.5} />
          <circle cx={cx} cy={ty - 54} r={4} fill={def.accent} className="game-blink" filter="url(#neonGlow)" />
        </>
      );
      break;
    }
    case "awning": {
      const stripes = [0, 1, 2, 3];
      content = (
        <>
          {body()}
          <Windows P={P} x={x} y={y} w={w} d={d} h={h} lit={lit} />
          {stripes.map((i) => (
            <polygon key={i} points={pts([up(P(x + (i * w) / 4, y + d), h - 2), up(P(x + ((i + 1) * w) / 4, y + d), h - 2), up(P(x + ((i + 1) * w) / 4, y + d + 0.35), h - 8), up(P(x + (i * w) / 4, y + d + 0.35), h - 8)])} fill={i % 2 ? "#ffffff" : def.accent} />
          ))}
        </>
      );
      break;
    }
    case "lot":
    case "yard": {
      const marks: React.ReactNode[] = [];
      if (def.roof === "lot") {
        const cars = ["#e5326c", "#1f8fc0", "#f2f2ee", "#55a016"];
        for (let i = 0; i < w * 3; i++) {
          const u = 0.2 + i * 0.33;
          marks.push(<line key={`m${i}`} x1={up(P(x + u, y + 0.1), h)[0]} y1={up(P(x + u, y + 0.1), h)[1]} x2={up(P(x + u, y + 0.5), h)[0]} y2={up(P(x + u, y + 0.5), h)[1]} stroke="#e7e7e0" strokeWidth={1} />);
          if (i % 2 === 0) marks.push(<IsoBox key={`c${i}`} P={P} x={x + u + 0.03} y={y + 0.12} w={0.24} d={0.35} h={5} z={h} top={cars[i % 4]} left={shade(cars[i % 4], -40)} right={shade(cars[i % 4], -60)} />);
        }
      } else {
        marks.push(<IsoBox key="t1" P={P} x={x + 0.2} y={y + 0.3} w={1.5} d={0.5} h={12} z={h} top="#eef0f3" left="#c9ccd3" right="#b1b5bd" />);
        marks.push(<IsoBox key="t2" P={P} x={x + 0.2} y={y + 1.1} w={1.5} d={0.5} h={12} z={h} top="#eef0f3" left="#c9ccd3" right="#b1b5bd" />);
      }
      content = (
        <>
          {body()}
          {marks}
        </>
      );
      break;
    }
    case "dock": {
      const doors = [0, 1, 2];
      content = (
        <>
          {body()}
          {doors.map((i) => {
            const u0 = 0.15 + i * (w / 3);
            const u1 = u0 + w / 3 - 0.3;
            return <polygon key={i} points={pts([up(P(x + u0, y + d), h - 3), up(P(x + u1, y + d), h - 3), up(P(x + u1, y + d), 0), up(P(x + u0, y + d), 0)])} fill="#565e6e" stroke={def.accent} strokeWidth={0.8} />;
          })}
        </>
      );
      break;
    }
    case "racks": {
      const leds: React.ReactNode[] = [];
      for (let i = 0; i < 10; i++) {
        const u = 0.15 + (i % 5) * (w / 5.5);
        const v = 8 + Math.floor(i / 5) * 12;
        const [lx, ly] = up(P(x + u, y + d), v);
        leds.push(<circle key={i} cx={lx} cy={ly} r={1.6} fill={i % 3 ? "#5ff08a" : def.accent} className={i % 2 ? "game-blink" : "game-blink2"} />);
      }
      content = (
        <>
          {body()}
          {leds}
        </>
      );
      break;
    }
    case "sub": {
      const [cx, cy] = center;
      content = (
        <>
          {body(h - 6)}
          {[-6, 0, 6].map((dx) => (
            <line key={dx} x1={cx + dx} y1={cy - h + 6} x2={cx + dx} y2={cy - h - 8} stroke="#c9ccd3" strokeWidth={2} />
          ))}
          <path d={`M${cx - 3} ${cy - h - 12} l4 -6 l-1 4 l3 0 l-4 6 l1 -4z`} fill={def.accent} />
        </>
      );
      break;
    }
    default: {
      content = (
        <>
          {body()}
          <Windows P={P} x={x} y={y} w={w} d={d} h={h} lit={lit} />
          {/* parapet + rooftop units */}
          <IsoBox P={P} x={x + w * 0.55} y={y + 0.15} w={0.3} d={0.3} h={5} z={h} top="#d6d9df" left="#a8acb5" right="#959aa3" />
        </>
      );
    }
  }

  const a = P(x, y), b = P(x + w, y), c = P(x + w, y + d), e = P(x, y + d);
  return (
    <g opacity={op}>
      {(look.ghost || look.selected) && <polygon points={pts([a, b, c, e])} fill={look.invalid ? "rgba(224,82,82,.45)" : "rgba(85,160,22,.4)"} stroke={look.invalid ? "#e05252" : "#9cf06a"} strokeWidth={1.5} strokeDasharray={look.selected ? "4 3" : undefined} />}
      {content}
      {level > 1 && !look.ghost && (
        <g transform={`translate(${up(P(x + w, y + d), 0)[0] - 6},${up(P(x + w, y + d), 0)[1] - 10})`}>
          <circle r={7} fill="#f5b819" stroke="#8a5a00" strokeWidth={1} />
          <text y={3} fontSize={8} fontWeight={800} textAnchor="middle" fill="#5a3b00">
            {level}
          </text>
        </g>
      )}
    </g>
  );
}

/** A building drawn alone (shop thumbnails). */
export function BuildingThumb({ def, size = 88 }: { def: BuildingDef; size?: number }) {
  const span = def.w + def.d;
  const lift = def.h + (def.roof === "tower" ? 62 : def.roof === "tank" ? 22 : def.roof === "neon" ? 22 : def.roof === "cactus" || def.roof === "tree" || def.roof === "flags" ? 44 : def.roof === "sawtooth" || def.roof === "gable" ? 26 : 12);
  const P = makeProj(def.d * (TW / 2) + 6, lift);
  const vbW = span * (TW / 2) + 12;
  const vbH = lift + span * (TH / 2) + 6;
  return (
    <svg viewBox={`0 0 ${vbW} ${vbH}`} width={size} height={size} preserveAspectRatio="xMidYMax meet">
      <IsoBuilding P={P} def={def} x={0} y={0} look={{ lit: false, night: false, power: 100 }} />
    </svg>
  );
}

export function SvgDefs() {
  return (
    <defs>
      <filter id="winGlow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="1.2" result="b" />
        <feMerge>
          <feMergeNode in="b" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter id="neonGlow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="2.2" result="b" />
        <feMerge>
          <feMergeNode in="b" />
          <feMergeNode in="b" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <linearGradient id="roadG" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#3a3e48" />
        <stop offset="1" stopColor="#2c2f37" />
      </linearGradient>
    </defs>
  );
}

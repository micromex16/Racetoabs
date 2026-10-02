"use client";
import * as React from "react";
import { makeProj, IsoBox, TW } from "@/components/game/iso";
import { LEASES, type Role } from "@/lib/venture/catalog";

// A cutaway of the leased space: machines, desks, and the people working them.

type Person = { id: string; role: Role | "FOUNDER"; morale: number; name: string };
const ROLE_COLOR: Record<string, string> = { OPERATOR: "#f59e0b", SALES: "#3b82f6", ENGINEER: "#10b981", MANAGER: "#8b5cf6", FOUNDER: "#e5326c" };
const SKIN = ["#f1c7a0", "#d9a07a", "#b97a52", "#8d5a3b", "#f3d2b5", "#6b4430"];
const MACHINE_COLOR = [
  ["#cfd6e2", "#9aa6ba", "#7f8ba1"],
  ["#c9e4f5", "#7fb3d6", "#5f97bd"],
  ["#d9f0d0", "#86c06d", "#679f51"],
  ["#f5dcc0", "#d99a5b", "#bb7c3e"],
  ["#eadcf7", "#a984d6", "#8a66b8"],
];
const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

export function VentureScene({
  lease,
  name,
  color,
  people,
  machines,
  producing,
  shipping,
  className,
}: {
  lease: string;
  name: string;
  color: string;
  people: Person[];
  machines: { id: string; tier: number }[];
  producing: boolean;
  shipping: boolean;
  className?: string;
}) {
  const L = LEASES.find((l) => l.key === lease) ?? LEASES[0];
  const [W, D] = L.floor;
  const wallH = 34 + LEASES.indexOf(L) * 6;
  // Frame: tile (0,0) is the back corner
  const pad = 1.4;
  const P0 = makeProj(0, 0);
  const xs = [P0(-pad, D + pad)[0], P0(W + pad, -pad)[0]];
  const ys = [P0(-pad, -pad)[1] - wallH - 16, P0(W + pad, D + pad)[1] + 8];
  const vw = xs[1] - xs[0];
  const vh = ys[1] - ys[0];
  const P = makeProj(-xs[0], -ys[0]);

  // Zones: machines on the left (production), desks on the right (office)
  const split = Math.max(2, Math.round(W * 0.62));
  const prodCells: [number, number][] = [];
  for (let y = 0; y < D - 1; y++) for (let x = 0; x < split; x++) if ((x + y) % 2 === 0 || W <= 4) prodCells.push([x + 0.5, y + 0.6]);
  const deskCells: [number, number][] = [];
  for (let y = 0; y < D - 1; y++) for (let x = split; x < W; x++) deskCells.push([x + 0.35, y + 0.45]);

  const ops = people.filter((p) => p.role === "OPERATOR" || p.role === "FOUNDER");
  const office = people.filter((p) => p.role !== "OPERATOR" && p.role !== "FOUNDER");
  const MAXP = 40;
  type Item = { k: string; depth: number; node: React.ReactNode };
  const items: Item[] = [];

  machines.slice(0, prodCells.length).forEach((m, i) => {
    const [x, y] = prodCells[i];
    const [top, left, right] = MACHINE_COLOR[m.tier] ?? MACHINE_COLOR[0];
    const h = 10 + m.tier * 5;
    const lamp = P(x + 0.35, y + 0.35);
    items.push({
      k: m.id,
      depth: x + y,
      node: (
        <g>
          <IsoBox P={P} x={x - 0.05} y={y - 0.05} w={0.75} d={0.75} h={h} top={top} left={left} right={right} />
          <circle cx={lamp[0]} cy={lamp[1] - h - 3} r={1.8} fill={producing ? "#4ade80" : "#94a3b8"}>
            {producing && <animate attributeName="opacity" values="1;0.3;1" dur={`${1 + (i % 3) * 0.4}s`} repeatCount="indefinite" />}
          </circle>
        </g>
      ),
    });
  });
  // Benches for operators beyond the machines
  ops.slice(0, MAXP).forEach((p, i) => {
    const cell = prodCells[i % Math.max(1, prodCells.length)] ?? [0.5, 0.5];
    const ring = Math.floor(i / Math.max(1, prodCells.length));
    const x = cell[0] + 0.75 + ring * 0.18;
    const y = cell[1] + 0.25 + ring * 0.12;
    items.push({ k: p.id, depth: x + y + 0.1, node: <Figure P={P} x={x} y={y} p={p} seed={hash(p.id)} working={producing} /> });
  });
  office.slice(0, MAXP).forEach((p, i) => {
    const cell = deskCells[i % Math.max(1, deskCells.length)] ?? [W - 0.6, 0.5];
    const ring = Math.floor(i / Math.max(1, deskCells.length));
    const [x, y] = [cell[0] + ring * 0.2, cell[1] + ring * 0.15];
    items.push({
      k: `desk-${p.id}`,
      depth: x + y,
      node: <IsoBox P={P} x={x} y={y} w={0.5} d={0.32} h={6} top="#e9dcc6" left="#c6b394" right="#ad9a7c" />,
    });
    items.push({ k: p.id, depth: x + y + 0.3, node: <Figure P={P} x={x + 0.25} y={y + 0.55} p={p} seed={hash(p.id)} working /> });
  });
  items.sort((a, b) => a.depth - b.depth);

  const corner = (x: number, y: number) => P(x, y);
  const floor = [corner(0, 0), corner(W, 0), corner(W, D), corner(0, D)];
  const ground = [corner(-pad, -pad), corner(W + pad, -pad), corner(W + pad, D + pad), corner(-pad, D + pad)];
  const pts = (l: [number, number][]) => l.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(" ");
  const belt0 = P(0.3, D - 0.45);
  const belt1 = P(W - 0.2, D - 0.45);
  const sign = P(0.6, 0);

  return (
    <svg viewBox={`0 0 ${vw.toFixed(0)} ${vh.toFixed(0)}`} className={className} role="img" aria-label={`${name}: ${L.name} with ${people.length} people`}>
      <polygon points={pts(ground)} fill="#e3cfa6" stroke="#c9b083" strokeWidth={1} />
      {/* Back walls */}
      <IsoBox P={P} x={0} y={-0.18} w={W} d={0.18} h={wallH} top="#e7e3dc" left="#d8d2c8" right="#c4bdb1" />
      <IsoBox P={P} x={-0.18} y={-0.18} w={0.18} d={D + 0.18} h={wallH} top="#e7e3dc" left="#cfc8bc" right="#bfb7aa" />
      {/* Windows on the back wall */}
      {Array.from({ length: Math.max(1, Math.floor(W / 1.5)) }).map((_, i) => {
        const x0 = 0.5 + i * 1.5;
        const a = P(x0, 0), b = P(x0 + 0.8, 0);
        const v0 = wallH * 0.45, v1 = wallH * 0.8;
        return <polygon key={i} points={pts([[a[0], a[1] - v1], [b[0], b[1] - v1], [b[0], b[1] - v0], [a[0], a[1] - v0]])} fill="#a9cbe6" opacity={0.75} />;
      })}
      {/* Company sign */}
      <g transform={`matrix(1,0.5,0,1,${sign[0]},${sign[1] - wallH * 0.18})`}>
        <rect x={-3} y={-11} width={Math.min(W * TW * 0.42, name.length * 6.4 + 10)} height={14} rx={2} fill={color} />
        <text x={2} y={0} fontSize={9} fontWeight={800} fill="#fff" letterSpacing={0.8} style={{ fontFamily: "var(--font-geist-sans), system-ui" }}>
          {name.toUpperCase().slice(0, 28)}
        </text>
      </g>
      {/* Floor slab */}
      <polygon points={pts(floor)} fill="#cfd3d8" stroke="#aab0b8" strokeWidth={1} />
      <g opacity={0.25} stroke="#8e96a1" strokeWidth={0.5}>
        {Array.from({ length: W - 1 }).map((_, i) => {
          const a = P(i + 1, 0), b = P(i + 1, D);
          return <line key={`gx${i}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />;
        })}
        {Array.from({ length: D - 1 }).map((_, i) => {
          const a = P(0, i + 1), b = P(W, i + 1);
          return <line key={`gy${i}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />;
        })}
      </g>
      {/* Office zone rug */}
      <polygon points={pts([P(split, 0.1), P(W - 0.1, 0.1), P(W - 0.1, D - 1), P(split, D - 1)])} fill={color} opacity={0.12} />
      {/* Conveyor along the front with parcels when producing */}
      <line x1={belt0[0]} y1={belt0[1]} x2={belt1[0]} y2={belt1[1]} stroke="#59606b" strokeWidth={4} strokeLinecap="round" />
      {producing &&
        [0, 1, 2].map((i) => (
          <rect key={i} x={-3} y={-6} width={6} height={5} rx={1} fill="#c8955a" stroke="#8a6338" strokeWidth={0.5}>
            <animateMotion dur="4.5s" begin={`${i * 1.5}s`} repeatCount="indefinite" path={`M${belt0[0]},${belt0[1]} L${belt1[0]},${belt1[1]}`} />
          </rect>
        ))}
      {items.map((it) => (
        <React.Fragment key={it.k}>{it.node}</React.Fragment>
      ))}
      {people.length > MAXP * 2 && (
        <text x={P(W / 2, D)[0]} y={P(W / 2, D)[1] + 14} textAnchor="middle" fontSize={10} fill="#6b7280">
          +{people.length - MAXP * 2} more
        </text>
      )}
      {/* Loading dock + truck while contracts are open */}
      <g>
        <IsoBox P={P} x={W} y={D - 1.3} w={0.25} d={1} h={14} top="#9aa2ad" left="#7c8590" right="#6a727c" />
        {shipping && (
          <g>
            <IsoBox P={P} x={W + 0.35} y={D - 1.25} w={0.9} d={0.55} h={11} top="#f5f5f5" left="#dedede" right="#c8c8c8" />
            <IsoBox P={P} x={W + 0.35} y={D - 0.65} w={0.9} d={0.35} h={8} top={color} left={color} right={color} />
          </g>
        )}
      </g>
    </svg>
  );
}

function Figure({ P, x, y, p, seed, working }: { P: ReturnType<typeof makeProj>; x: number; y: number; p: Person; seed: number; working: boolean }) {
  const [sx, sy] = P(x, y);
  const body = ROLE_COLOR[p.role];
  const skin = SKIN[seed % SKIN.length];
  const dur = 0.9 + (seed % 7) * 0.12;
  const sad = p.role !== "FOUNDER" && p.morale < 35;
  return (
    <g transform={`translate(${sx.toFixed(1)},${sy.toFixed(1)})`}>
      <ellipse cx={0} cy={0} rx={4.5} ry={2} fill="rgba(0,0,0,0.18)" />
      <g>
        {working && <animateTransform attributeName="transform" type="translate" values="0 0;0 -1.4;0 0" dur={`${dur}s`} repeatCount="indefinite" />}
        <rect x={-3.6} y={-12} width={7.2} height={10} rx={3} fill={body} />
        <circle cx={0} cy={-15} r={3.4} fill={skin} />
        {p.role === "FOUNDER" && <path d="M-3.8,-17 L3.8,-17 L2.6,-19.6 L-2.6,-19.6 Z" fill="#f5b819" stroke="#a46f00" strokeWidth={0.5} />}
        {p.role === "OPERATOR" && <path d="M-3.5,-16.6 Q0,-20.5 3.5,-16.6 Z" fill="#ffd23f" />}
        {sad && <circle cx={4.5} cy={-20} r={1.8} fill="#ef4444" />}
      </g>
      <title>{p.name}</title>
    </g>
  );
}

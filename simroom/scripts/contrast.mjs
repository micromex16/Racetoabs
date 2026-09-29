// Prints WCAG contrast ratios for every preset so we keep them legible across a room.
import { PRESETS } from '../src/renderer/themes.js';
const lum = (hex) => { const n = hex.slice(1); return [0,2,4].map(i=>parseInt(n.slice(i,i+2),16)/255).map(v=>v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[0.2126,0.7152,0.0722][i],0); };
const ratio = (a,b) => { const [x,y]=[lum(a),lum(b)].sort((p,q)=>q-p); return (x+0.05)/(y+0.05); };
let bad = 0;
for (const t of PRESETS) {
  const c = t.colors;
  const rows = { 'text/tile': ratio(c.text,c.tile), 'text/hover': ratio(c.text,c.tileHover), 'muted/bg': ratio(c.muted,c.background), 'accent/tile': ratio(c.accent,c.tile), 'text/bg': ratio(c.text,c.background) };
  const line = Object.entries(rows).map(([k,v])=>`${k} ${v.toFixed(1)}`).join('  ');
  const low = Object.entries(rows).filter(([k,v]) => v < (k.startsWith('text') ? 7 : 4.5));
  bad += low.length;
  console.log(`${t.id.padEnd(10)} ${line}${low.length ? '  <-- LOW: ' + low.map(l=>l[0]).join(',') : ''}`);
}
process.exitCode = bad ? 1 : 0;

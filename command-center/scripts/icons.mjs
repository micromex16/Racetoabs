// Regenerate PWA icons from public/icons/icon.svg: node scripts/icons.mjs
import sharp from "sharp";
const src = "public/icons/icon.svg";
const out = [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["apple-touch-icon.png", 180],
];
for (const [name, size] of out) await sharp(src).resize(size, size).png().toFile(`public/icons/${name}`);
// maskable: extra padding so the safe zone holds the rings
await sharp({ create: { width: 512, height: 512, channels: 4, background: "#06070b" } })
  .composite([{ input: await sharp(src).resize(400, 400).png().toBuffer(), gravity: "center" }])
  .png()
  .toFile("public/icons/maskable-512.png");
console.log("icons written");

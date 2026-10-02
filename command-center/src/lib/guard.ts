// Financial-data guard. The app never stores financial fields, but free text
// from email/Slack/WhatsApp can contain amounts. Anything the agent writes back
// into the app (summaries, pick reasons, rankings) goes through scrubMoney().

const PATTERNS: RegExp[] = [
  // $1,234.56  $12k  $3.5M  US$40  MX$200
  /\b(?:US|MX|CA)?\$\s?\d[\d,]*(?:\.\d+)?\s?(?:k|m|mm|b|bn|K|M|B)?\b/g,
  // 1,234 USD / 5k MXN / 2.5M dollars / 300 pesos / €40 / £40
  /\b\d[\d,]*(?:\.\d+)?\s?(?:k|m|mm|b|bn|K|M|B)?\s?(?:USD|MXN|EUR|GBP|CAD|dollars?|pesos?|bucks)\b/gi,
  /\b(?:USD|MXN|EUR|GBP|CAD)\s?\d[\d,]*(?:\.\d+)?\s?(?:k|m|mm|b|bn|K|M|B)?\b/g,
  /[€£]\s?\d[\d,]*(?:\.\d+)?\s?(?:k|m|K|M)?/g,
];

export function scrubMoney(text: string): string {
  let out = text;
  for (const p of PATTERNS) out = out.replace(p, "[amount hidden]");
  return out;
}

import { MATS, FINS } from "@/lib/site/data";

// 估價公式（來源：design_handoff_mei5899_site/README.md〈估價公式〉，完整沿用）
// 1 才 = 30cm × 30cm = 900 cm²；最低消費 NT$300；區間取 -10% / +15% 並以 50 元進位。
// ⚠ 單價與加成為設計稿示範值，上線前須由業務確認真實數字。

export type QuoteInput = { mat: number; w: number; h: number; q: number; fins: number[] };
export type QuoteResult = { range: string; detail: string; cai: number; low: number; high: number };

const money = (n: number) => `NT$${(Math.round(n / 50) * 50).toLocaleString("en-US")}`;

export function calcQuote({ mat, w, h, q, fins }: QuoteInput): QuoteResult {
  const cai = Math.max((w * h) / 900, 1);
  const material = MATS[mat] ?? MATS[0];
  let mult = 1;
  for (const i of fins) {
    const f = FINS[i];
    if (f) mult += f.add;
  }
  const base = Math.max(cai * material.unit * Math.max(q, 1) * mult, 300);
  const low = Math.round((base * 0.9) / 50) * 50;
  const high = Math.round((base * 1.15) / 50) * 50;

  const finNames = fins.map((i) => FINS[i]?.name).filter(Boolean);
  const detail =
    `${material.name} ／ ${w}×${h} cm ／ ${Math.max(q, 1)} 件 ／ 約 ${cai.toFixed(1)} 才` +
    (finNames.length ? ` ／ ${finNames.join("、")}` : " ／ 無後加工");

  return { range: `${money(base * 0.9)} – ${money(base * 1.15)}`, detail, cai, low, high };
}

// 加工／配件下拉選項的顯示文字。純函式、零依賴：client 元件（OrderEditForm）直接 import，
// 不會把 lib/erp.ts 的 supabase client 拖進前端 bundle。

export type ItemOptionLike = { code: string; name: string; unit: string | null };

/**
 * 「代碼 名稱（單位）」組成單一字串（單位空白就省略括號）。
 * 刻意是一個字串而不是 JSX 的 {code} {name}{unit}：後者會被 React 拆成 4 個文字節點，SSR 時
 * 每個之間插一個 <!-- --> 分隔——工單頁 10 個下拉 × 149 個選項，因此多出四千多個分隔註解。
 */
export function itemOptionLabel(opt: ItemOptionLike): string {
  return `${opt.code} ${opt.name}${opt.unit ? `（${opt.unit}）` : ""}`;
}

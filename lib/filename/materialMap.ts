// 原始材質字串 → 工單「商品名稱」顯示對照。
// 依實體工單照片：檔名 pvc+霧 → 工單商品名稱顯示「高遮PVC+霧」，代表有材質對照。
// 查無對照就原樣顯示、不擋收檔（parser 仍判 ok）。持續擴充這張表即可。
const MAP: Record<string, string> = {
  pvc: "高遮PVC",
  "pvc+霧": "高遮PVC+霧",
  "pvc+亮": "高遮PVC+亮",
  相紙: "相紙",
  "相紙+霧": "相紙+霧膜",
  背膠: "背膠",
  珍珠板: "珍珠板",
};

export function productNameFor(raw: string): string {
  if (!raw) return raw;
  return MAP[raw.toLowerCase()] ?? MAP[raw] ?? raw;
}

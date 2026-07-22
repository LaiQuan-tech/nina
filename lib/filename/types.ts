// 檔名拆解出的各欄位（deterministic parser 的產物）。
export type Segments = {
  serial: string; // 6 碼流水號，例 069871
  payment: string; // 付款別，例 月匯
  customer: string; // 客戶名稱，例 百陽廣告
  category: string; // 類別編號，例 78
  date: string; // 日期 YYYYMMDD，例 20260625
  owner: string; // 案主代碼，例 WG
  design: string; // 案名，例 星雲AI地板
  sizeW: number; // 成品寬，例 90
  sizeH: number; // 成品高，例 100
  sizeUnit: string; // 尺寸單位，例 cm
  material: string; // 原始材質字串，例 pvc+霧
  productName: string; // 對照後的商品名稱，例 高遮PVC+霧
  totalQty: number; // 總數量，例 1
  spec: string; // 材料/機台規格，例 CCPVC720N10M
  ext: string; // 副檔名（小寫），例 ai
};

// 單一段落的驗證錯誤（給前端 / AI 產生引導文字）。
export type SegErr = {
  key: string; // 欄位鍵，例 serial / customer / size
  label: string; // 中文欄位名，例 6碼流水號
  expected: string; // 正確格式（範例），例 6 位數字(069871)
  got: string; // 目前擷取到的內容
  message: string; // 組好的中文說明句
};

export type ParseOk = { ok: true; raw: string; segments: Segments; errors: [] };
export type ParseFail = { ok: false; raw: string; segments: Partial<Segments>; errors: SegErr[] };
export type ParseResult = ParseOk | ParseFail;

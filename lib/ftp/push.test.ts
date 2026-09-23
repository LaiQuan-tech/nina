import assert from "node:assert/strict";
import test from "node:test";
import iconv from "iconv-lite";
import { toBig5Latin1, sanitizeCustomerDirName, pushWorkOrderToFtp } from "./push";

// 已知 Big5 hex 對照——用 Python 內建的 'big5' codec（跟 iconv-lite 完全獨立的另一套實作）
// 交叉驗證過，兩邊算出來的 bytes 一致：
//   python3 -c "print('網站收稿'.encode('big5').hex())"  → baf4afb8a6acbd5a
//   python3 -c "print('百陽廣告'.encode('big5').hex())"  → a6cab6a7bc73a769
// 這裡不是只測「有回東西」，是逐 byte 比對已知正確答案。
test("toBig5Latin1：「網站收稿」「百陽廣告」的 Big5 bytes 與已知對照一致", () => {
  assert.equal(Buffer.from(toBig5Latin1("網站收稿"), "latin1").toString("hex"), "baf4afb8a6acbd5a");
  assert.equal(Buffer.from(toBig5Latin1("百陽廣告"), "latin1").toString("hex"), "a6cab6a7bc73a769");
});

test("toBig5Latin1：純 ASCII 每個字元的 code 就是自己的 byte 值，不受影響", () => {
  const out = toBig5Latin1("abc123");
  assert.equal(out, "abc123");
  assert.equal(Buffer.from(out, "latin1").toString("hex"), "616263313233");
});

test("toBig5Latin1：中文與 '/' 混合時分隔線仍是原始單一 byte，不會被吃進雙位元組字元裡", () => {
  const out = toBig5Latin1("客戶名/百陽廣告");
  assert.equal(out.indexOf("/"), 6); // 「客戶名」3 字 × 2 bytes = 6，"/" 是第 7 個字元
  assert.equal(Buffer.from(out, "latin1").toString("hex"), "abc8a4e1a6572fa6cab6a7bc73a769");
  // ensureDir() 內部用 remoteDirPath.split("/") 切路徑段——確認轉碼後 split 仍切得對，
  // 不會因為某個 Big5 byte 剛好等於 0x2f 而多切或少切。
  assert.deepEqual(
    toBig5Latin1("/網站收稿/百陽廣告").split("/").filter(Boolean),
    [toBig5Latin1("網站收稿"), toBig5Latin1("百陽廣告")],
  );
});

test("toBig5Latin1：latin1 round-trip 解回 Big5 可還原成原始字串（basic-ftp 送出時仰賴這個特性沒有 lossy）", () => {
  const samples = ["網站收稿", "百陽廣告", "美強光印刷_2026收稿站", "測試/斜線/客戶"];
  for (const s of samples) {
    const roundTripBytes = Buffer.from(toBig5Latin1(s), "latin1");
    assert.equal(iconv.decode(roundTripBytes, "big5"), s);
  }
});

test("toBig5Latin1：空字串回空字串", () => {
  assert.equal(toBig5Latin1(""), "");
});

test("sanitizeCustomerDirName：null／undefined／空白一律歸類 _未分類", () => {
  assert.equal(sanitizeCustomerDirName(null), "_未分類");
  assert.equal(sanitizeCustomerDirName(undefined), "_未分類");
  assert.equal(sanitizeCustomerDirName("   "), "_未分類");
  assert.equal(sanitizeCustomerDirName(""), "_未分類");
});

test("sanitizeCustomerDirName：合法中文客戶名原樣保留", () => {
  assert.equal(sanitizeCustomerDirName("百陽廣告"), "百陽廣告");
  assert.equal(sanitizeCustomerDirName("  百陽廣告  "), "百陽廣告");
});

test("sanitizeCustomerDirName：換掉路徑與 Windows/SMB 不合法字元", () => {
  assert.equal(sanitizeCustomerDirName('A/B\\C:D*E?F"G<H>I|J'), "A_B_C_D_E_F_G_H_I_J");
});

test("pushWorkOrderToFtp：缺 FTP 環境變數時明確 throw，不靜默略過", async () => {
  const keys = ["FTP_HOST", "FTP_USER", "FTP_PASS"] as const;
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  for (const k of keys) delete process.env[k];
  try {
    await assert.rejects(
      () => pushWorkOrderToFtp({ storage_path: "orders/x/y.pdf", file_name: "y.pdf", customer_name: "測試" }),
      /FTP 未設定/,
    );
  } finally {
    for (const k of keys) {
      const v = saved[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test("pushWorkOrderToFtp：只設定部分環境變數（例如漏 FTP_PASS）一樣視為未設定", async () => {
  const keys = ["FTP_HOST", "FTP_USER", "FTP_PASS"] as const;
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  process.env.FTP_HOST = "nas.example.com";
  process.env.FTP_USER = "webupload";
  delete process.env.FTP_PASS;
  try {
    await assert.rejects(
      () => pushWorkOrderToFtp({ storage_path: "orders/x/y.pdf", file_name: "y.pdf", customer_name: "測試" }),
      /FTP 未設定/,
    );
  } finally {
    for (const k of keys) {
      const v = saved[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

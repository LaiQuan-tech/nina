import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { formatMegabytes, isUploadSizeAllowed, MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from "./limits";
import { isGeneratedPrintFilePath, newPrintFilePath, printFilePathMatchesName, safeFileName } from "./path";
import {
  deriveUploadTicketKey,
  signUploadTicket,
  UPLOAD_TICKET_TTL_MS,
  uploadTicketKeyFromEnv,
  verifyUploadTicket,
  type UploadTicket,
} from "./ticket";

const NAME = "069871_{(月匯)百陽廣告}_(78)20260625WG星雲AI地板90x100cmpvc+霧-1CCPVC720N10M.ai";
const ROOT = "test-service-role-key";
const KEY = deriveUploadTicketKey(ROOT);
const NOW = Date.UTC(2026, 8, 29, 8, 0, 0);
const PATH = newPrintFilePath(NAME, new Date(NOW), "0123456789");

function ticket(overrides: Partial<UploadTicket> = {}): UploadTicket {
  return { path: PATH, fileName: NAME, size: 1234, exp: NOW + 60_000, ...overrides };
}

/** 用正確金鑰替任意 payload 字串簽章（模擬「簽章對、內容不合規」的票券）。格式同 lib/upload/ticket.ts。 */
function signRaw(payloadJson: string, key: Buffer = KEY): string {
  const payload = Buffer.from(payloadJson, "utf8").toString("base64url");
  const sig = createHmac("sha256", key).update(`nina.upload-ticket.v1.${payload}`).digest("base64url");
  return `${payload}.${sig}`;
}

function decodePayload(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8"));
}

// ── 共用上限 ──

test("MAX_UPLOAD_BYTES = 10MB（10485760，與儲存桶 file_size_limit 同值），顯示字樣 10 MB", () => {
  assert.equal(MAX_UPLOAD_BYTES, 10 * 1024 * 1024);
  assert.equal(MAX_UPLOAD_BYTES, 10485760);
  assert.equal(MAX_UPLOAD_LABEL, "10 MB");
});

test("isUploadSizeAllowed：剛好 10MB 可、+1 byte 拒；0、負數、小數、NaN、字串一律拒", () => {
  assert.equal(isUploadSizeAllowed(MAX_UPLOAD_BYTES), true);
  assert.equal(isUploadSizeAllowed(MAX_UPLOAD_BYTES + 1), false);
  assert.equal(isUploadSizeAllowed(1), true);
  for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "1024", null, undefined]) {
    assert.equal(isUploadSizeAllowed(bad), false, String(bad));
  }
});

test("formatMegabytes：無條件進位到 0.1 MB——超過上限 1 byte 顯示 10.1 MB，不會被四捨五入成 10.0 MB", () => {
  assert.equal(formatMegabytes(MAX_UPLOAD_BYTES), "10.0 MB");
  assert.equal(formatMegabytes(MAX_UPLOAD_BYTES + 1), "10.1 MB");
  assert.equal(formatMegabytes(12 * 1024 * 1024), "12.0 MB");
  assert.equal(formatMegabytes(12_345_678), "11.8 MB");
});

// ── 路徑（從 lib/storage.ts 抽出的共用規則）──

test("newPrintFilePath：orders/<UTC yyyymm>/<10 碼 hex>-<安全檔名>；預設亂數也是 10 碼 hex", () => {
  assert.equal(PATH, "orders/202609/0123456789-069871_____________78_20260625WG__AI__90x100cmpvc__-1CCPVC720N10M.ai");
  // 台北 10/1 00:30 = UTC 9/30 16:30 → 月份沿用既有的 UTC 規則
  assert.match(newPrintFilePath("a.pdf", new Date(Date.UTC(2026, 8, 30, 16, 30))), /^orders\/202609\/[0-9a-f]{10}-a\.pdf$/);
  assert.ok(isGeneratedPrintFilePath(newPrintFilePath(NAME)));
});

test("safeFileName：路徑穿越段（../、\\）被剝掉、只留 [A-Za-z0-9._-]、連續點折疊、純中文退為 file", () => {
  assert.equal(safeFileName("../../etc/passwd"), "passwd");
  assert.equal(safeFileName("..\\..\\windows\\system.ini"), "system.ini");
  assert.equal(safeFileName("a/b/../..pdf"), "pdf");
  assert.equal(safeFileName("x..y...z.pdf"), "x.y.z.pdf");
  assert.equal(safeFileName("星雲"), "file");
  assert.ok(safeFileName("a".repeat(200) + ".pdf").length <= 80);
  assert.ok(!safeFileName("../../x/../y.pdf").includes("/"));
});

test("printFilePathMatchesName／isGeneratedPrintFilePath：只認 orders/ 下、檔名段正是 safeFileName(fileName) 的路徑", () => {
  assert.equal(printFilePathMatchesName(PATH, NAME), true);
  assert.equal(printFilePathMatchesName(PATH, NAME.replace("-1CCPVC", "-2CCPVC")), false);
  assert.equal(printFilePathMatchesName(PATH.replace("orders/", "thumbs/"), NAME), false);
  assert.equal(isGeneratedPrintFilePath("thumbs/0b8f6a0e-1111-2222-3333-444455556666-auto-x.jpg"), false);
  assert.equal(isGeneratedPrintFilePath("orders/202609/0123456789-../x.pdf"), false);
  assert.equal(isGeneratedPrintFilePath("orders/202609/ZZZZZZZZZZ-a.pdf"), false);
});

// ── 票券：簽發／驗證 ──

test("簽發 → 驗證：欄位原樣取回", () => {
  const token = signUploadTicket(ticket(), KEY);
  const r = verifyUploadTicket(token, KEY, NOW);
  assert.deepEqual(r, { ok: true, ticket: ticket() });
});

test("金鑰由根密鑰以 HKDF＋固定 context 推導：決定性、32 bytes、不等於根密鑰本身", () => {
  assert.equal(KEY.length, 32);
  assert.ok(deriveUploadTicketKey(ROOT).equals(KEY));
  assert.ok(!deriveUploadTicketKey("another-root").equals(KEY));
  assert.ok(!KEY.equals(Buffer.from(ROOT, "utf8")));
});

test("uploadTicketKeyFromEnv：取 SUPABASE_SERVICE_ROLE_KEY 推導，沒設就回 null（不新增環境變數）", () => {
  assert.equal(uploadTicketKeyFromEnv({} as NodeJS.ProcessEnv), null);
  const k = uploadTicketKeyFromEnv({ SUPABASE_SERVICE_ROLE_KEY: ROOT } as unknown as NodeJS.ProcessEnv);
  assert.ok(k && k.equals(KEY));
});

test("竄改：改 payload 的 size／path／fileName 但沿用原簽章 → bad_signature", () => {
  const token = signUploadTicket(ticket(), KEY);
  const sig = token.split(".")[1];
  for (const patch of [{ s: 5 * 1024 * 1024 }, { p: newPrintFilePath(NAME, new Date(NOW), "ffffffffff") }, { e: NOW + 10 * UPLOAD_TICKET_TTL_MS }]) {
    const forged = Buffer.from(JSON.stringify({ ...decodePayload(token), ...patch }), "utf8").toString("base64url");
    assert.deepEqual(verifyUploadTicket(`${forged}.${sig}`, KEY, NOW), { ok: false, reason: "bad_signature" }, JSON.stringify(patch));
  }
});

test("竄改：改簽章一個字元、拿別張票的簽章 → bad_signature", () => {
  const token = signUploadTicket(ticket(), KEY);
  const [payload, sig] = token.split(".");
  const flipped = sig.slice(0, -1) + (sig.endsWith("A") ? "B" : "A");
  assert.deepEqual(verifyUploadTicket(`${payload}.${flipped}`, KEY, NOW), { ok: false, reason: "bad_signature" });
  const other = signUploadTicket(ticket({ size: 999 }), KEY);
  assert.deepEqual(verifyUploadTicket(`${payload}.${other.split(".")[1]}`, KEY, NOW), { ok: false, reason: "bad_signature" });
});

test("domain separation：別的根密鑰、或直接拿根密鑰（沒經過推導）簽的票 → bad_signature", () => {
  const good = ticket();
  assert.deepEqual(verifyUploadTicket(signUploadTicket(good, deriveUploadTicketKey("other-root")), KEY, NOW), {
    ok: false,
    reason: "bad_signature",
  });
  const rawRootKey = Buffer.from(ROOT, "utf8");
  assert.deepEqual(verifyUploadTicket(signUploadTicket(good, rawRootKey), KEY, NOW), { ok: false, reason: "bad_signature" });
});

test("過期：now == exp 即拒（expired），exp 前 1ms 仍有效；簽發端效期 60 分鐘", () => {
  const token = signUploadTicket(ticket({ exp: NOW + 1000 }), KEY);
  assert.equal(verifyUploadTicket(token, KEY, NOW + 999).ok, true);
  assert.deepEqual(verifyUploadTicket(token, KEY, NOW + 1000), { ok: false, reason: "expired" });
  assert.deepEqual(verifyUploadTicket(token, KEY, NOW + 5_000_000), { ok: false, reason: "expired" });
  assert.equal(UPLOAD_TICKET_TTL_MS, 60 * 60 * 1000);
});

test("格式錯（非字串、空、沒有點、三段、非 base64url、超長）→ malformed，不會丟例外", () => {
  const token = signUploadTicket(ticket(), KEY);
  for (const bad of [undefined, null, 42, {}, "", "abc", `${token}.x`, token.replace(".", ".+"), `a b.${token.split(".")[1]}`, "a".repeat(5000)]) {
    assert.deepEqual(verifyUploadTicket(bad, KEY, NOW), { ok: false, reason: "malformed" }, String(bad).slice(0, 30));
  }
});

test("欄位不符（簽章正確但內容不合規）→ invalid_fields：路徑與檔名不是同一組、路徑不在 orders/、大小越界、檔名空或過長", () => {
  const cases: Array<[string, Partial<UploadTicket>]> = [
    ["路徑屬於另一個檔名", { fileName: NAME.replace("-1CCPVC", "-2CCPVC") }],
    ["路徑指到縮圖", { path: "thumbs/0b8f6a0e-1111-2222-3333-444455556666-manual-thumbnail-1.jpg" }],
    ["路徑穿越", { path: "orders/202609/0123456789-../../x.ai" }],
    ["size 0", { size: 0 }],
    ["size 超過 10MB 1 byte", { size: MAX_UPLOAD_BYTES + 1 }],
    ["size 小數", { size: 1.5 }],
    ["檔名空字串", { fileName: "" }],
    ["檔名 256 字", { fileName: "a".repeat(252) + ".pdf", path: newPrintFilePath("a".repeat(252) + ".pdf", new Date(NOW), "0123456789") }],
  ];
  for (const [label, patch] of cases) {
    const token = signUploadTicket(ticket(patch), KEY);
    assert.deepEqual(verifyUploadTicket(token, KEY, NOW), { ok: false, reason: "invalid_fields" }, label);
  }
  // 剛好 10MB 是合法的票
  assert.equal(verifyUploadTicket(signUploadTicket(ticket({ size: MAX_UPLOAD_BYTES }), KEY), KEY, NOW).ok, true);
  // 版本不對、型別不對、不是 JSON
  const base = { v: 1, p: PATH, n: NAME, s: 1234, e: NOW + 60_000 };
  for (const raw of [
    JSON.stringify({ ...base, v: 2 }),
    JSON.stringify({ ...base, s: "1234" }),
    JSON.stringify({ ...base, e: "later" }),
    JSON.stringify({ ...base, p: undefined }),
    JSON.stringify([base]),
    "not json",
  ]) {
    assert.deepEqual(verifyUploadTicket(signRaw(raw), KEY, NOW), { ok: false, reason: "invalid_fields" }, raw.slice(0, 40));
  }
});

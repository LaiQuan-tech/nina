import { Client as FtpClient } from "basic-ftp";
import { Readable } from "node:stream";
import iconv from "iconv-lite";
import { downloadPrintFile } from "@/lib/storage";

// 印刷檔自動推上美強光 Synology NAS 的 FTP（網站收稿資料夾）。
// 見 supabase/work_order_ftp_schema.sql：收檔存進 Supabase Storage 後標 ftp_status='pending'，
// 由 app/api/cron/ftp-push 非同步推、失敗重試；這支只管「推一筆」，不管排程與重試次數。

const DEFAULT_PORT = 21;
const DEFAULT_BASE_DIR = "網站收稿";
const CONNECT_TIMEOUT_MS = 20000;
const UNCATEGORIZED_DIR = "_未分類";

// NAS 資料夾/檔名要避開的字元：Windows/SMB 不合法字元 \ / : * ? " < > | 加控制字元。
// Synology 同一顆 volume 通常也開 SMB 分享給人工歸檔用，資料夾名稱最好兩邊都合法。
const ILLEGAL_NAME_CHARS_RE = /[\\/:*?"<>|\x00-\x1f]/g;

export type FtpPushableOrder = {
  storage_path: string;
  file_name: string;
  customer_name: string | null;
};

export type FtpPushResult = { ok: true; remotePath: string };

type FtpConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  baseDir: string;
  secure: boolean;
};

/**
 * 讀 FTP 連線設定。缺 FTP_HOST / FTP_USER / FTP_PASS 視為「這個環境沒接 FTP」，
 * 明確 throw 一個好認的訊息——不能吞掉讓呼叫端誤以為「推了但剛好沒東西可推」，
 * 那樣客人上傳的檔會安靜地卡在 pending 永遠推不上去卻沒有任何錯誤線索。
 */
function loadFtpConfig(): FtpConfig {
  const host = process.env.FTP_HOST?.trim();
  const user = process.env.FTP_USER?.trim();
  const password = process.env.FTP_PASS;
  if (!host || !user || !password) {
    throw new Error("FTP 未設定：缺少 FTP_HOST / FTP_USER / FTP_PASS 環境變數");
  }
  const portRaw = Number(process.env.FTP_PORT);
  const port = Number.isFinite(portRaw) && portRaw > 0 ? portRaw : DEFAULT_PORT;
  const baseDir = process.env.FTP_BASE_DIR?.trim() || DEFAULT_BASE_DIR;
  const secure = process.env.FTP_SECURE === "true";
  return { host, port, user, password, baseDir, secure };
}

/**
 * 把字串轉成「用 latin1 字串包住的 Big5 bytes」。
 *
 * basic-ftp 的控制連線送指令時是 `socket.write(command, client.ftp.encoding)`——只吃 Node
 * 內建的 Buffer 編碼名稱，Node 沒有內建的 "big5"。做法：先用 iconv-lite 把字串正確編碼成
 * Big5 的原始 bytes（Buffer），再用 'latin1' 把這個 Buffer「逐 byte 讀回字串」——latin1 是
 * 1 byte ↔ 1 code point、不做任何轉換的編碼，所以這個字串的每個字元剛好對應原本一個 Big5
 * byte。呼叫端只要把 `client.ftp.encoding` 設成 'latin1'，basic-ftp 送出這個字串時就會逐
 * byte 還原成一模一樣的 Big5 bytes，NAS 收到的路徑／檔名因此不會變亂碼。
 *
 * ASCII 字元（0x00–0x7F）在 Big5 裡就是原本的單一 byte，跟中文字混在同一個字串裡轉碼、
 * 之後再用 "/" 組路徑一樣安全——Big5 雙位元組字元的第二 byte 範圍是 0x40–0x7E／
 * 0xA1–0xFE，"/" 是 0x2F，不落在這個範圍內，所以不會被誤判成某個中文字的一部分。
 *
 * 已用 Python 內建的 'big5' codec（跟 iconv-lite 完全獨立的另一套實作）交叉驗證過，
 * 結果一致（見 lib/ftp/push.test.ts）：
 *   "網站收稿" → Big5 bytes hex baf4afb8a6acbd5a
 *   "百陽廣告" → Big5 bytes hex a6cab6a7bc73a769
 */
export function toBig5Latin1(input: string): string {
  return iconv.encode(String(input ?? ""), "big5").toString("latin1");
}

/**
 * 客戶資料夾名稱淨化：換掉 Windows/SMB 不合法字元與控制字元，比照 lib/storage.ts
 * safeFileName() 的風格——換底線而非整段砍掉，不同輸入才不會撞出同一個資料夾名。
 * 清完是空字串（customer_name 是 null／空白，或整段都是不合法字元）一律歸檔到
 * "_未分類"，檔案才不會憑空消失在算不出來的路徑，方便人工事後歸檔。
 */
export function sanitizeCustomerDirName(name: string | null | undefined): string {
  const cleaned = String(name ?? "")
    .replace(ILLEGAL_NAME_CHARS_RE, "_")
    .trim();
  return cleaned || UNCATEGORIZED_DIR;
}

function buildRemotePaths(config: FtpConfig, order: FtpPushableOrder): { dir: string; filePath: string } {
  const customerDir = sanitizeCustomerDirName(order.customer_name);
  const dir = `/${config.baseDir}/${customerDir}`.replace(/\/{2,}/g, "/");
  return { dir, filePath: `${dir}/${order.file_name}` };
}

/**
 * 推一張工單的印刷檔到美強光 Synology NAS 的 FTP。
 *
 * 流程：讀連線設定（缺就 throw）→ 從 Supabase Storage 下載印刷檔 bytes（讀不到就 throw）
 * → 連線（basic-ftp 預設被動模式；連線逾時 20s）→ 用 Big5 bytes 逐層建
 * `<FTP_BASE_DIR>/<客戶名>/` 資料夾（已存在就直接 cd 進去，不會出錯）→ 用 Big5 bytes
 * 當遠端檔名上傳（檔名＝order.file_name 原始檔名，不經過 lib/storage.ts safeFileName 的
 * 淨化——那是給 Storage 內部路徑用的，NAS 這邊要讓人看得懂原始中文檔名）→ 關閉連線。
 *
 * 冪等：同一張工單重推 = 同一個遠端路徑覆蓋，安全（Cron 重試、手動重推都仰賴這個特性）。
 * 失敗一律 throw（附可讀訊息），不在這裡吞錯——呼叫端（cron 端點／手動重推端點）決定
 * 怎麼寫 ftp_status／ftp_meta。
 */
export async function pushWorkOrderToFtp(order: FtpPushableOrder): Promise<FtpPushResult> {
  const config = loadFtpConfig();

  const arrayBuffer = await downloadPrintFile(order.storage_path);
  if (!arrayBuffer) {
    throw new Error(`FTP 推送失敗：讀不到印刷檔（storage_path=${order.storage_path}）`);
  }

  const { dir, filePath } = buildRemotePaths(config, order);

  const client = new FtpClient(CONNECT_TIMEOUT_MS);
  // ⚠️ 已知風險，真 NAS 測試時務必留意：basic-ftp 的 access() 內部固定會送兩次
  // "OPTS UTF8 ON"（登入前一次、useDefaultSettings() 內一次，見
  // node_modules/basic-ftp/dist/Client.js），且沒有任何選項可以關掉。這台 NAS 是
  // 「Big5 台灣機型設定」——這類舊式 local-charset FTP daemon 一般根本不認得
  // OPTS UTF8（會回 500/502，client 用 sendIgnoringError 吞掉，行為不受影響），
  // 但這點沒有真帳密連真 NAS 沒辦法 100% 確認。**真 NAS 端對端測試時，除了推檔成功
  // 與否，務必額外用 File Station 或 SSH `ls` 檢查資料夾/檔名沒有變亂碼**；如果真的
  // 因為 OPTS UTF8 被 NAS 接受而導致亂碼，代表要繞過 basic-ftp 的 access()、改用
  // client.ftp.send() 自己兜一段不送 OPTS UTF8 的登入流程，不是這裡的 Big5 編碼邏輯錯了
  // （toBig5Latin1 本身已用獨立的 Python big5 codec 交叉驗證過，見 push.test.ts）。
  client.ftp.encoding = "latin1";
  try {
    await client.access({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      secure: config.secure,
    });
    await client.ensureDir(toBig5Latin1(dir));
    await client.uploadFrom(Readable.from(Buffer.from(arrayBuffer)), toBig5Latin1(order.file_name));
    return { ok: true, remotePath: filePath };
  } finally {
    client.close();
  }
}

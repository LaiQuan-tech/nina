# 送件完成收尾流程 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在一批稿件處理完畢後提供明確的完成摘要，讓客人選擇繼續上傳或前往我的發稿紀錄，並在紀錄頁承接成功提示。

**Architecture:** `ChatUpload` 回傳每批檔案的成功／失敗摘要，`IntakeFlow` 保存摘要並渲染收尾卡片。完成動作以一般站內連結前往 `/member?submitted=1`，紀錄頁依查詢參數顯示一次性成功提示；不新增 API、資料表或案件狀態。

**Tech Stack:** Next.js 14 App Router、React 18、TypeScript、Node test runner、既有全域 CSS。

---

### Task 1: 建立批次結果摘要規則

**Files:**
- Create: `lib/upload/completion.ts`
- Create: `lib/upload/completion.test.ts`
- Modify: `package.json`

**Step 1: 寫失敗測試**

建立 `lib/upload/completion.test.ts`：

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { summarizeUploadBatch } from "./completion";

test("全部成功時回傳成功數量", () => {
  assert.deepEqual(summarizeUploadBatch([true, true]), {
    successCount: 2,
    failureCount: 0,
    canFinish: true,
  });
});

test("部分成功時分開計數", () => {
  assert.deepEqual(summarizeUploadBatch([true, false, false]), {
    successCount: 1,
    failureCount: 2,
    canFinish: true,
  });
});

test("全部失敗時不可完成送件", () => {
  assert.deepEqual(summarizeUploadBatch([false, false]), {
    successCount: 0,
    failureCount: 2,
    canFinish: false,
  });
});
```

把 `lib/upload/completion.test.ts` 加進 `package.json` 的 `test` 指令。

**Step 2: 執行測試確認失敗**

Run: `npm test`

Expected: FAIL，錯誤指出找不到 `./completion`。

**Step 3: 實作最小摘要函式**

建立 `lib/upload/completion.ts`：

```ts
export type UploadBatchSummary = {
  successCount: number;
  failureCount: number;
  canFinish: boolean;
};

export function summarizeUploadBatch(results: boolean[]): UploadBatchSummary {
  const successCount = results.filter(Boolean).length;
  const failureCount = results.length - successCount;
  return { successCount, failureCount, canFinish: successCount > 0 };
}
```

**Step 4: 執行測試確認通過**

Run: `npm test`

Expected: 所有既有測試與 3 個新測試 PASS。

**Step 5: 提交**

```bash
git add package.json lib/upload/completion.ts lib/upload/completion.test.ts
git commit -m "test: 建立送件批次摘要規則"
```

### Task 2: 讓上傳元件回報整批結果

**Files:**
- Modify: `components/ai/ChatUpload.tsx`
- Test: `lib/upload/completion.test.ts`

**Step 1: 擴充測試涵蓋空批次**

在 `lib/upload/completion.test.ts` 加入：

```ts
test("空批次不可完成送件", () => {
  assert.deepEqual(summarizeUploadBatch([]), {
    successCount: 0,
    failureCount: 0,
    canFinish: false,
  });
});
```

**Step 2: 執行測試確認目前行為**

Run: `npm test`

Expected: PASS。這一步鎖定即將接入元件的空值行為。

**Step 3: 調整 `ChatUpload` props 與單檔回傳值**

將 props 改成：

```ts
import { summarizeUploadBatch, type UploadBatchSummary } from "@/lib/upload/completion";

export default function ChatUpload({
  sessionId,
  contactName,
  focusRequest = 0,
  onBatchStart,
  onBatchComplete,
}: {
  sessionId: string;
  contactName?: string;
  focusRequest?: number;
  onBatchStart?: () => void;
  onBatchComplete?: (summary: UploadBatchSummary) => void;
}) {
```

新增可見上傳按鈕的 ref，當 `focusRequest` 改變時聚焦：

```ts
const uploadButtonRef = useRef<HTMLButtonElement>(null);

useEffect(() => {
  if (focusRequest > 0) uploadButtonRef.current?.focus();
}, [focusRequest]);
```

讓 `processFile` 成功時 `return true`，檔名錯誤、上傳錯誤與 catch 時 `return false`。不要改變既有逐檔訊息。

**Step 4: 在整批結束後回報摘要**

`handleFiles` 開始時呼叫 `onBatchStart?.()`，依序收集結果：

```ts
const results: boolean[] = [];
for (const file of files) {
  results.push(await processFile(file));
}
onBatchComplete?.(summarizeUploadBatch(results));
```

在可見上傳按鈕加入 `ref={uploadButtonRef}`，移除舊的 `onSubmitted` callback。

**Step 5: 驗證型別與測試**

Run: `npm test && npm run build`

Expected: 測試 PASS；build 暫時可能因 `IntakeFlow` 還傳入舊 `onSubmitted` 而 FAIL。確認錯誤只指向下一個 Task 要更新的介面。

**Step 6: 暫不提交**

`ChatUpload` 與 `IntakeFlow` 的介面必須一起完成，留到 Task 3 一併提交，避免留下無法建置的 commit。

### Task 3: 顯示收尾卡片並支援繼續上傳

**Files:**
- Create: `components/intake/UploadCompletionCard.tsx`
- Modify: `components/intake/IntakeFlow.tsx`
- Modify: `app/globals.css`
- Modify: `components/ai/ChatUpload.tsx`

**Step 1: 建立純展示完成卡片**

`UploadCompletionCard` 接受 `summary` 與 `onContinue`：

```tsx
import Link from "next/link";
import type { UploadBatchSummary } from "@/lib/upload/completion";

export default function UploadCompletionCard({
  summary,
  onContinue,
}: {
  summary: UploadBatchSummary;
  onContinue: () => void;
}) {
  const detail = summary.failureCount
    ? `已成功收到 ${summary.successCount} 個檔案，另有 ${summary.failureCount} 個未成功。您可以先查看已收到的紀錄，或繼續重新上傳。`
    : `已成功收到 ${summary.successCount} 個檔案。若檔案都上傳完成，請前往發稿紀錄確認。`;

  return (
    <section className="mei-upload-complete" role="status" aria-labelledby="upload-complete-title">
      <h2 id="upload-complete-title" tabIndex={-1}>本次檔案已送出</h2>
      <p>{detail}</p>
      <div className="actions">
        <Link className="mei-btn mei-btn-primary" href="/member?submitted=1">
          完成送件，查看紀錄
        </Link>
        <button type="button" className="mei-btn mei-btn-ghost" onClick={onContinue}>
          繼續上傳檔案
        </button>
      </div>
    </section>
  );
}
```

**Step 2: 在 `IntakeFlow` 保存摘要**

新增：

```ts
const [batchSummary, setBatchSummary] = useState<UploadBatchSummary | null>(null);
const [focusRequest, setFocusRequest] = useState(0);
const completionRef = useRef<HTMLElement>(null);
```

`ChatUpload` 改傳：

```tsx
<ChatUpload
  sessionId={step.sessionId}
  contactName={step.who}
  focusRequest={focusRequest}
  onBatchStart={() => setBatchSummary(null)}
  onBatchComplete={(summary) => setBatchSummary(summary.canFinish ? summary : null)}
/>
```

在 `ChatUpload` 後渲染完成卡片。`onContinue` 清除摘要並增加 `focusRequest`。移除上傳頁成功後的 `SetPasswordCard` 與 `uploaded` state；guest 密碼提示改由紀錄頁承接。

**Step 3: 完成後捲動與聚焦**

當 `batchSummary?.canFinish` 變成 true，用 `requestAnimationFrame` 將 `#upload-complete-title` 捲入視野並呼叫 `focus()`。避免在 render 中直接操作 DOM。

**Step 4: 加入響應式樣式**

在 `app/globals.css` 新增 `.mei-upload-complete`、標題、說明與 `.actions`。桌機按鈕可並排，窄螢幕改為垂直排列且每個按鈕寬度 100%。沿用既有色彩 token、邊框與圓角，不加入新色票。

**Step 5: 執行驗證**

Run: `npm test && npm run build`

Expected: 全部 PASS，且不再有舊 `onSubmitted` 或 `SetPasswordCard` 未使用錯誤。

**Step 6: 提交**

```bash
git add components/ai/ChatUpload.tsx components/intake/IntakeFlow.tsx components/intake/UploadCompletionCard.tsx app/globals.css
git commit -m "feat: 新增送件完成收尾卡片"
```

### Task 4: 在發稿紀錄頁承接成功狀態

**Files:**
- Modify: `app/(site)/member/page.tsx`

**Step 1: 接收查詢參數**

將頁面函式簽名改成 Next.js 14 App Router 可用的同步 `searchParams`：

```ts
export default async function MemberPage({
  searchParams,
}: {
  searchParams?: { submitted?: string };
}) {
  const showSubmitted = searchParams?.submitted === "1";
```

**Step 2: 渲染成功提示**

在會員標題區之後、guest 密碼卡之前加入：

```tsx
{showSubmitted && (
  <div className="mei-notice" role="status">
    <p className="t">送件完成，我們已收到您的檔案。</p>
    <p className="d">最新紀錄已列在下方，後續可回到這裡查看製作進度。</p>
  </div>
)}
```

保留既有 `uploads` 排序與 guest `SetPasswordCard`；不要要求客人先設定密碼。

**Step 3: 建置驗證**

Run: `npm test && npm run build`

Expected: PASS；`/member` 仍為動態路由。

**Step 4: 提交**

```bash
git add app/'(site)'/member/page.tsx
git commit -m "feat: 發稿紀錄承接送件成功提示"
```

### Task 5: 完整流程與回歸驗證

**Files:**
- Verify: `components/ai/ChatUpload.tsx`
- Verify: `components/intake/IntakeFlow.tsx`
- Verify: `components/intake/UploadCompletionCard.tsx`
- Verify: `app/(site)/member/page.tsx`
- Verify: `app/globals.css`

**Step 1: 執行自動驗證**

Run: `npm test && npm run build && git diff --check`

Expected: 所有測試 PASS、production build PASS、沒有 whitespace error。

**Step 2: 在本機 production server 驗證 guest 流程**

啟動 `npm start`，使用瀏覽器完成以下案例：

- 單檔成功：完成卡片只出現一次，顯示成功 1 個。
- 多檔部分成功：摘要數量正確，逐檔訊息仍保留。
- 全部失敗：沒有「完成送件」卡片。
- 點「繼續上傳檔案」：卡片消失，焦點回到選檔按鈕，可再次上傳。
- 點「完成送件，查看紀錄」：到 `/member?submitted=1`，顯示成功提示與最新檔案。
- guest 可立即查看紀錄，設定密碼卡位於成功提示下方。

**Step 3: 驗證桌機、手機與鍵盤操作**

- 桌機寬度約 1440 px、手機寬度約 390 px 均無水平溢出。
- 完成卡片出現時可見且焦點落在標題。
- Tab 順序依序為完成主動作、繼續上傳。
- 成功與部分失敗文案不依賴顏色即可理解。

**Step 4: 安全與資料邊界檢查**

- 未登入直接開 `/member?submitted=1` 仍由 middleware 導向登入。
- 查詢參數只控制提示顯示，不作為送件成功或會員授權的依據。
- 不在網址或客戶端加入工單 ID、會員 ID 或其他敏感資料。

**Step 5: 最終提交與推送**

如果驗證過程有調整：

```bash
git add <實際調整檔案>
git commit -m "fix: 完善送件收尾流程"
```

確認 `git status --short --branch` 乾淨後，依專案約定直接推送：

```bash
git push origin main
```

推送後確認正式站首頁、`/upload`、未登入 `/member?submitted=1` 的狀態正常，並在登入流程下完成一次送件收尾驗收。

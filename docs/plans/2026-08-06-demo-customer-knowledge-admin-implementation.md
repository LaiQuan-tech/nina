# Demo 客戶知識後台 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 建立可用 Supabase Demo 資料操作的客戶知識、服務搜尋及回訪後台，完整對應 Nina Pitch 的七項客戶知識能力。

**Architecture:** 沿用現有 `members`、`intake_sessions`、`work_orders`，新增客戶樣貌、報價與回訪資料表，並在既有資料加入 `is_demo` 隔離。後台 Server Components 經單一 service-role 資料層聚合資料；只有樣貌／偏好及回訪使用受保護 API 寫入。固定 UUID seed 提供可重複且可安全清除的全虛構 Demo 資料。

**Tech Stack:** Next.js 14 App Router、React 18、TypeScript、Supabase Postgres、Node test runner、既有後台 CSS。

---

### Task 1: 建立 Demo 隔離與客戶知識資料表

**Files:**
- Create: `supabase/customer_knowledge_schema.sql`
- Modify: `supabase/member_schema.sql`
- Modify: `supabase/schema.sql`

**Step 1: 新增冪等 migration**

Migration 必須：

- 為 `members`、`intake_sessions`、`work_orders` 加入 `is_demo boolean not null default false`。
- 建立 `customer_profiles`，以 `member_id` 為 primary key。
- 建立 `quotes` 與 `customer_followups`。
- 為 member、status、due date、created date 與 `is_demo` 建索引。
- 啟用 RLS，不建立 public policy。
- 為新增表建立 `updated_at` trigger。
- 使用 check constraint 限制 tier、price sensitivity、quote status、followup priority/status。

**Step 2: 同步基礎 schema**

把既有表的 `is_demo` 欄位同步補進 `member_schema.sql` 與 `schema.sql`，讓新環境從零建立時一致。

**Step 3: 套用 migration**

使用 Supabase 官方工具執行 `supabase/customer_knowledge_schema.sql`。

Expected: 所有 DDL 成功；重跑一次仍成功。

**Step 4: 驗證 schema**

查詢 `information_schema.columns` 與 `pg_tables`，確認 3 個新增表及 3 個 `is_demo` 欄位存在，RLS 已啟用。

**Step 5: 提交**

```bash
git add supabase/customer_knowledge_schema.sql supabase/member_schema.sql supabase/schema.sql
git commit -m "feat: 建立客戶知識與 Demo 資料模型"
```

### Task 2: 建立純資料規則與測試

**Files:**
- Create: `lib/admin/customerKnowledgeView.ts`
- Create: `lib/admin/customerKnowledgeView.test.ts`
- Modify: `package.json`

**Step 1: 寫失敗測試**

測試以下純規則：

- 客戶搜尋同時比對公司、姓名、手機與標籤。
- 客戶 tier／產業／狀態篩選可組合。
- 對話、報價、工單與回訪合併後依時間新到舊排序。
- 回訪依逾期、今天、七天內、稍後分組。
- Demo 統計只計入 `is_demo=true`。
- profile patch 只接受列舉、字串長度及字串陣列上限內的值。

**Step 2: 執行測試確認失敗**

Run: `npm test`

Expected: FAIL，找不到 `customerKnowledgeView`。

**Step 3: 實作最小純函式**

輸出型別與函式：

```ts
export type CustomerTier = "standard" | "growth" | "vip";
export type FollowupBucket = "overdue" | "today" | "next7" | "later";
export function matchesCustomerFilters(...): boolean;
export function mergeCustomerTimeline(...): CustomerTimelineEvent[];
export function bucketFollowups(...): Record<FollowupBucket, Followup[]>;
export function validateCustomerProfilePatch(...): ValidationResult;
```

所有比較以正規化後的繁中／英文小寫字串執行，陣列最多 12 項、單項最多 80 字，摘要最多 2,000 字。

**Step 4: 執行測試確認通過**

Run: `npm test`

Expected: 所有既有與新增測試 PASS。

**Step 5: 提交**

```bash
git add package.json lib/admin/customerKnowledgeView.ts lib/admin/customerKnowledgeView.test.ts
git commit -m "test: 建立客戶知識後台資料規則"
```

### Task 3: 建立固定 Demo seed

**Files:**
- Create: `scripts/seedDemoCrm.ts`
- Create: `lib/admin/demoSeedManifest.ts`
- Create: `lib/admin/demoSeedManifest.test.ts`
- Modify: `package.json`

**Step 1: 先寫 manifest 測試**

驗證：

- 恰有 10 位客戶且 UUID、手機、Email 不重複。
- 所有 Email 使用 `example.com`，手機使用 `09000000xx` 測試區段。
- 每個 profile／session／quote／order／followup 都引用存在的 Demo member。
- 資料量至少為 20 段對話、15 筆報價、30 筆工單及 12 筆回訪。
- 每一列 `is_demo` 都為 true。

**Step 2: 執行測試確認失敗**

Run: `npm test`

Expected: FAIL，manifest 尚不存在。

**Step 3: 建立虛構資料 manifest**

建立十種情境：月結熟客、高價值、成長客、新客、價格敏感、沉睡、待報價、逾期回訪、急件常客與季節型客戶。日期以 seed 執行時間為基準產生相對日期，確保每次 Demo 都有今天、逾期與未來提醒。

**Step 4: 建立 idempotent seed 腳本**

腳本依序 upsert：members → profiles → sessions → quotes → work_orders → followups。固定 UUID 作 conflict key；`--clean` 只按 `is_demo=true` 逆序刪除，執行前及完成後輸出每表筆數。

新增：

```json
"seed:demo-crm": "tsx scripts/seedDemoCrm.ts",
"clean:demo-crm": "tsx scripts/seedDemoCrm.ts --clean"
```

**Step 5: 執行測試與 seed**

Run: `npm test && npm run seed:demo-crm && npm run seed:demo-crm`

Expected: 測試 PASS；兩次 seed 後筆數相同，沒有重複資料。

**Step 6: 提交**

```bash
git add package.json lib/admin/demoSeedManifest.ts lib/admin/demoSeedManifest.test.ts scripts/seedDemoCrm.ts
git commit -m "feat: 建立 Demo 客戶與服務資料"
```

### Task 4: 建立後台聚合資料層

**Files:**
- Create: `lib/admin/customerKnowledge.ts`

**Step 1: 定義安全的 UI projection**

只輸出後台需要的欄位，建立：

```ts
getDemoDashboard(): Promise<DemoDashboard>
listKnowledgeCustomers(filters): Promise<KnowledgeCustomer[]>
getKnowledgeCustomer(id): Promise<KnowledgeCustomerDetail | null>
searchServiceKnowledge(filters): Promise<ServiceKnowledgeResult[]>
listFollowups(): Promise<CustomerFollowup[]>
updateCustomerProfile(memberId, patch): Promise<CustomerProfile | null>
createFollowup(input): Promise<CustomerFollowup | null>
updateFollowup(id, patch): Promise<CustomerFollowup | null>
```

**Step 2: 實作聚合查詢**

- 客戶列表只讀 `is_demo=true`。
- 詳情由 member/profile/session/quote/work_order/followup 合併。
- 服務搜尋在 server 端對受限欄位使用 Supabase `ilike`，限制 100 筆。
- dashboard 用 count 與限定期間查詢，避免下載整張表。
- 時間軸使用 Task 2 的純函式排序。

**Step 3: 加入失敗降級**

單一來源查詢失敗時回傳空集合並記錄 server error；不得把 Supabase error 或 service key 回傳瀏覽器。

**Step 4: 驗證**

Run: `npm test && npm run build`

Expected: PASS。

**Step 5: 提交**

```bash
git add lib/admin/customerKnowledge.ts
git commit -m "feat: 新增客戶知識聚合資料層"
```

### Task 5: 升級後台導覽與營運總覽

**Files:**
- Modify: `components/admin/AdminShell.tsx`
- Modify: `app/admin/page.tsx`
- Create: `components/admin/DemoDashboard.tsx`
- Modify: `app/globals.css`

**Step 1: 調整導覽**

新增客戶知識庫、服務知識庫、追蹤與回訪三個入口，既有功能保留。品牌副標改為「AI 數位系統 · 後台」。

**Step 2: 建立 dashboard 元件**

顯示六張統計卡、30 天 CSS/SVG 趨勢、產業分布、熱門材質、今日待辦與最近活動。所有圖表提供文字值與 aria label。

**Step 3: 串接 server data**

`app/admin/page.tsx` 呼叫 `getDemoDashboard()`，顯示「示範資料」說明，不再只呈現收稿四個數字。

**Step 4: 建立響應式樣式**

桌機使用 12 欄 grid，平板與手機逐步改為 2 欄及單欄。不得產生水平捲動。

**Step 5: 驗證並提交**

Run: `npm test && npm run build`

```bash
git add components/admin/AdminShell.tsx components/admin/DemoDashboard.tsx app/admin/page.tsx app/globals.css
git commit -m "feat: 建立 Demo 營運總覽"
```

### Task 6: 建立客戶知識庫列表與詳情

**Files:**
- Create: `app/admin/customers/page.tsx`
- Create: `app/admin/customers/[id]/page.tsx`
- Create: `components/admin/CustomerKnowledgeList.tsx`
- Create: `components/admin/CustomerProfileEditor.tsx`
- Create: `components/admin/CustomerTimeline.tsx`
- Modify: `app/globals.css`

**Step 1: 建立列表**

列表使用 URL query 保存搜尋、tier、產業與狀態，Server Component 取得資料。每張／列顯示公司、聯絡人、tier、標籤、最近互動、案件、報價與待辦數。

**Step 2: 建立詳情**

頁首顯示 DEMO、客戶等級、聯絡資料與快速新增回訪。內容分為樣貌／偏好、AI 摘要及跨來源時間軸，工單可連到既有 `/admin/orders/[id]`。

**Step 3: 建立編輯器**

摘要、服務備註、聯絡偏好、價格敏感度、材料／加工／交貨／尺寸／產品偏好可編輯。陣列欄位以逗號或 tag input 操作，提交到 Task 7 API。

**Step 4: 加入空狀態與響應式樣式**

搜尋無結果、單一資料來源無紀錄及錯誤狀態都有明確文案；手機改為單欄卡片。

**Step 5: 驗證並提交**

Run: `npm test && npm run build`

```bash
git add app/admin/customers components/admin/CustomerKnowledgeList.tsx components/admin/CustomerProfileEditor.tsx components/admin/CustomerTimeline.tsx app/globals.css
git commit -m "feat: 建立客戶知識庫"
```

### Task 7: 建立受保護的客戶樣貌與回訪 API

**Files:**
- Create: `lib/admin/adminRequest.ts`
- Create: `app/api/admin/customers/[id]/route.ts`
- Create: `app/api/admin/followups/route.ts`
- Create: `app/api/admin/followups/[id]/route.ts`
- Test: `lib/admin/customerKnowledgeView.test.ts`

**Step 1: 抽出管理員請求守門**

重用 admin cookie 驗證並實作同源檢查。所有 route handler 開頭都必須通過兩者。

**Step 2: 客戶 profile PATCH**

只接受 Task 2 白名單欄位，拒絕未知 member、非 Demo member、錯誤列舉、超長字串與非字串陣列。成功後回傳安全 projection。

**Step 3: 回訪 POST/PATCH**

POST 驗證 Demo member、標題、原因、優先度、指派人及 ISO 日期。PATCH 只允許完成、重新開啟、改期與更新白名單欄位；不得改 member id 或 `is_demo`。

**Step 4: 客戶端串接**

`CustomerProfileEditor` 顯示儲存中、成功與失敗狀態；回訪 UI 操作後 refresh server data。

**Step 5: 驗證安全邊界**

- 未登入 API 回 401。
- 非同源請求回 403。
- 正式 member id 回 404 或 403。
- 錯誤列舉／日期／長度回 400。

Run: `npm test && npm run build`

**Step 6: 提交**

```bash
git add lib/admin/adminRequest.ts app/api/admin/customers app/api/admin/followups components/admin/CustomerProfileEditor.tsx
git commit -m "feat: 新增客戶知識與回訪管理 API"
```

### Task 8: 建立服務知識庫

**Files:**
- Create: `app/admin/knowledge/page.tsx`
- Create: `components/admin/ServiceKnowledgeSearch.tsx`
- Modify: `app/globals.css`

**Step 1: 建立搜尋表單**

以 URL query 保存關鍵字、類型、狀態與客戶。空關鍵字顯示最近活動，不執行無界限全文查詢。

**Step 2: 建立分型結果**

對話、報價、稿件／工單使用不同圖示與欄位，統一顯示客戶、日期、摘要、狀態及連結。

**Step 3: 驗證與提交**

Run: `npm test && npm run build`

```bash
git add app/admin/knowledge components/admin/ServiceKnowledgeSearch.tsx app/globals.css
git commit -m "feat: 建立服務知識搜尋"
```

### Task 9: 建立追蹤與回訪工作區

**Files:**
- Create: `app/admin/followups/page.tsx`
- Create: `components/admin/FollowupBoard.tsx`
- Modify: `app/globals.css`

**Step 1: 顯示分組提醒**

使用 Task 2 bucket 規則呈現逾期、今天、七天內及稍後；頁首提供全部／未完成／已完成切換。

**Step 2: 建立新增與快速操作**

可從頁面新增提醒，並對既有提醒執行完成、延後一天、延後七天。所有操作顯示 loading/error 並保存。

**Step 3: 驗證與提交**

Run: `npm test && npm run build`

```bash
git add app/admin/followups components/admin/FollowupBoard.tsx app/globals.css
git commit -m "feat: 建立客戶追蹤與回訪中心"
```

### Task 10: 阻擋 Demo 客戶進入前台會員流程

**Files:**
- Modify: `lib/members.ts`
- Modify: `lib/memberSession.ts`
- Modify: `lib/members.test.ts` or related pure test file

**Step 1: 寫失敗測試**

測試 PublicMember projection 不輸出 `is_demo`，並以純 helper 驗證 Demo member 不具前台登入資格。

**Step 2: 收斂所有前台 member query**

`getMemberByPhone`、`getMemberById`、登入、session 解析及建立／更新流程加入 `.eq("is_demo", false)` 或等價保護。後台專用讀取不受影響。

**Step 3: 驗證**

Run: `npm test && npm run build`

Expected: PASS；使用 Demo 手機與任意密碼無法登入前台。

**Step 4: 提交**

```bash
git add lib/members.ts lib/memberSession.ts <測試檔>
git commit -m "fix: 隔離前台與 Demo 客戶資料"
```

### Task 11: 合併送件收尾功能

依 `docs/plans/2026-08-06-upload-completion-implementation.md` 逐項執行，完成批次摘要、收尾卡片、紀錄頁成功提示與 guest 密碼卡承接。每個計畫中的測試與 commit 都必須保留。

### Task 12: 完整驗收、審查與發布

**Files:**
- Verify: all files above

**Step 1: 自動驗證**

Run: `npm test && npm run build && git diff --check`

Expected: 全部 PASS。

Run: `npm audit --omit=dev`

Expected: 不新增 dependency advisory；既有 Next.js/PostCSS advisory 另行列出，不在此 feature 強制 major upgrade。

**Step 2: 資料驗證**

- 查詢所有 Demo 表筆數符合 manifest。
- 重跑 seed 筆數不變。
- 確認所有 Demo 關聯 member 都存在。
- 確認所有正式資料 `is_demo=false` 且沒有被修改。

**Step 3: 瀏覽器驗收**

- 1440 px 與 390 px 檢查 dashboard、客戶列表／詳情、知識搜尋、回訪中心與送件完成流程。
- 執行搜尋、篩選、profile 編輯、新增／完成／延期提醒並重新整理驗證持久化。
- 確認 browser console 無 error、頁面無水平溢出。

**Step 4: 權限驗收**

- 未登入所有新 admin 頁導向登入。
- 未登入所有新 API 回 401。
- 非同源寫入回 403。
- Demo member 無法登入前台或出現在前台會員紀錄。

**Step 5: 程式碼審查**

依 `requesting-code-review` 檢查 BASE 到 HEAD 的 correctness、安全、資料隔離、效能與測試缺口；修正所有 Critical／Important 後重跑完整驗證。

**Step 6: 直接推送 main 並確認部署**

```bash
git push origin main
```

等待 Vercel 完成，確認正式站 `/admin` 新 dashboard 存在、未登入保護正常、前台首頁與上傳流程無回歸。

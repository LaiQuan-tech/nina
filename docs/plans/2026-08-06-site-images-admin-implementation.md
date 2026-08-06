# 官網站圖與後台圖片管理 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 為 14 個官網圖片位生成並上架寫實圖片，讓首頁讀取這些圖片，並提供只有管理員可用的上傳與替換介面。

**Architecture:** 沿用 `site_images` 資料表及公開 `site-media` bucket。所有圖片位與上傳規則由純函式模組集中管理；前台 server component 一次讀取 ready 圖片，後台 API 以固定白名單驗證上傳並版本化 Storage 路徑。

**Tech Stack:** Next.js 14 App Router、React 18、TypeScript、Supabase、Node test runner、built-in ImageGen

---

### Task 1: 圖片上傳規則與測試

**Files:**
- Create: `lib/site/imageUpload.ts`
- Create: `lib/site/imageUpload.test.ts`
- Modify: `package.json`

**Step 1: Write the failing test**

測試以下純函式：

- `findImageSlot("hero.main")` 可找到圖片位。
- 未定義的 `slotKey` 回傳 `null`。
- JPEG、PNG、WebP 的 MIME 與 magic bytes 可通過。
- 偽裝成圖片的內容被拒絕。
- 超過 4 MiB 的檔案被拒絕。
- `buildStoragePath` 只產生安全字元、版本化且副檔名由實際格式決定。

**Step 2: Run test to verify it fails**

Run: `node --import tsx --test lib/site/imageUpload.test.ts`

Expected: FAIL because `lib/site/imageUpload.ts` does not exist.

**Step 3: Write minimal implementation**

建立常數 `MAX_SITE_IMAGE_BYTES = 8 * 1024 * 1024`、支援格式表、magic-byte 驗證、圖片位白名單查詢及 Storage 路徑產生器。

**Step 4: Run test to verify it passes**

Run: `node --import tsx --test lib/site/imageUpload.test.ts`

Expected: all site-image validation tests PASS.

**Step 5: Add aggregate test script and commit**

在 `package.json` 新增 `test`，執行 parser 與 site-image 測試。

```bash
git add lib/site/imageUpload.ts lib/site/imageUpload.test.ts package.json package-lock.json
git commit -m "test: 建立站圖上傳驗證規則"
```

### Task 2: Supabase 站圖資料層與首頁接線

**Files:**
- Create: `lib/site/siteImages.ts`
- Modify: `app/(site)/page.tsx`
- Modify: `components/mei/Hero.tsx`
- Modify: `components/mei/ServiceRail.tsx`
- Modify: `components/mei/ProjectWall.tsx`

**Step 1: Add a failing mapping test**

在 `lib/site/imageUpload.test.ts` 測試資料列只在 `is_active=true`、`status=ready` 且 `public_url` 存在時轉成 `Record<string, SlotImage>`，並保留 alt、width、height。

**Step 2: Run test to verify it fails**

Run: `node --import tsx --test lib/site/imageUpload.test.ts`

Expected: FAIL because row mapper is missing.

**Step 3: Implement the data layer**

- `listSiteImages()` 使用 server-side admin client 讀取後台所需欄位。
- `getReadySiteImageMap()` 取得前台圖片 map；查詢失敗回空物件。
- `mapReadyRows()` 保持為可單元測試的純函式。

**Step 4: Wire the homepage**

將首頁改為 async server component，一次讀圖後傳入：

```tsx
<Hero image={images["hero.main"]} mobileImage={images["hero.mobile"]} />
<ServiceRail images={images} />
<ProjectWall images={images} />
```

Hero 使用 `<picture>` 或兩個受 CSS 控制的圖片位，桌機與手機分別使用契約中的圖片；任一缺失時各自 fallback。

**Step 5: Run tests and build**

Run: `npm test && npm run build`

Expected: tests PASS and Next production build succeeds.

**Step 6: Commit**

```bash
git add lib/site/siteImages.ts lib/site/imageUpload.test.ts app/'(site)'/page.tsx components/mei
git commit -m "feat: 首頁接上 Supabase 站圖"
```

### Task 3: 管理員站圖 API

**Files:**
- Create: `app/api/admin/site-images/route.ts`
- Modify: `lib/site/siteImages.ts`

**Step 1: Add failing service tests**

針對上傳請求解析的純邏輯加入測試：缺檔、未知 slot、錯誤格式與過大檔案都回對應錯誤碼。

**Step 2: Run test to verify it fails**

Run: `npm test`

Expected: new cases FAIL.

**Step 3: Implement GET**

回傳按 `IMAGE_SLOTS.sort` 排序的完整圖片位，即使資料庫尚無資料列也要回傳 empty 狀態，讓後台始終可管理全部 14 格。

**Step 4: Implement POST**

- 解析 multipart `slotKey`、`file`。
- 驗證白名單、大小、MIME 與 magic bytes。
- 上傳到 `site-media` 的版本化路徑。
- 取得公開 URL，upsert `site_images` 為 `ready`、`source=upload`。
- 資料庫失敗時清除新檔；成功後嘗試清除舊檔。
- `revalidatePath("/")`。

**Step 5: Run tests and type checks**

Run: `npm test && npx tsc --noEmit`

Expected: PASS.

**Step 6: Commit**

```bash
git add app/api/admin/site-images/route.ts lib/site/siteImages.ts lib/site/imageUpload.test.ts
git commit -m "feat: 新增管理員站圖上傳 API"
```

### Task 4: 後台圖片管理介面

**Files:**
- Create: `app/admin/site-images/page.tsx`
- Create: `components/admin/SiteImagesManager.tsx`
- Modify: `components/admin/AdminShell.tsx`
- Modify: `app/globals.css`

**Step 1: Add the navigation and page shell**

後台側欄新增「網站圖片」，頁面用 `AdminShell` 包裹並載入管理元件。

**Step 2: Implement grouped cards**

元件透過 GET API 載入 14 個圖片位，按主視覺、服務項目、作品案例分組；每格顯示比例、狀態及目前圖片。

**Step 3: Implement local preview and upload**

- `<input type="file" accept="image/jpeg,image/png,image/webp">`
- 以 `URL.createObjectURL` 顯示待上傳預覽，並在替換或 unmount 時 revoke。
- 個別卡片有獨立 loading／success／error 狀態。
- 送出 multipart 後以 API 回傳資料更新卡片。

**Step 4: Add responsive styles**

桌機多欄卡片、手機單欄；使用固定 aspect-ratio 避免 layout shift，錯誤與成功訊息不只靠顏色辨識。

**Step 5: Verify**

Run: `npm test && npm run build`

Expected: all tests and production build PASS; `/admin/site-images` appears in route table.

**Step 6: Commit**

```bash
git add app/admin/site-images/page.tsx components/admin/SiteImagesManager.tsx components/admin/AdminShell.tsx app/globals.css
git commit -m "feat: 新增後台網站圖片管理"
```

### Task 5: 生成並上架 14 張圖片

**Files:**
- Create: `public/generated/site/*.webp` or source PNG files selected from ImageGen output
- Modify: `package.json`
- Modify: `README.md`

**Step 1: Load ImageGen prompting guidance**

讀取 imagegen skill 指定的 `references/prompting.md`，使用 built-in ImageGen；每個獨立圖片位各呼叫一次，不能用同一 prompt 的 variants 代替。

**Step 2: Generate all images**

使用 `IMAGE_SLOTS.subject + STYLE_SUFFIX`，並依各自比例補充構圖需求。輸出必須無可辨識文字、商標、浮水印與人臉。

**Step 3: Inspect and select**

逐張檢查主題、風格、裁切安全區及禁止項目；不合格圖片只做一次有針對性的重生。

**Step 4: Persist in the workspace**

將最終圖複製到 `public/generated/site/`，以安全 slot key 命名。保留工作區副本，避免專案資產只存在 ImageGen 預設目錄。

**Step 5: Upload and seed Supabase**

補上可執行的 `gen:images` 或 seed 腳本入口，將選定圖片上傳 `site-media/generated/`，upsert 14 筆 `site_images`，標記 `source=ai`、`status=ready`。

**Step 6: Verify database and URLs**

執行只讀查詢，確認 14 個 slot 皆為 ready，且每個 public URL 回應成功圖片 MIME。

**Step 7: Update docs and commit**

修正 README 的圖片位數量及後台操作說明。

```bash
git add public/generated/site package.json README.md scripts
git commit -m "feat: 上架官網寫實情境圖片"
```

### Task 6: 完整驗收

**Files:**
- Modify only if verification exposes a defect.

**Step 1: Run automated verification**

Run: `npm test && npm run build && npm audit --omit=dev`

Expected: tests and build PASS; no newly introduced high/critical vulnerability.

**Step 2: Run local visual verification**

啟動 production server，檢查首頁桌機／手機 Hero、8 張服務圖、4 張作品圖及後台圖片管理頁。確認圖片無變形、文字仍可讀、fallback 正常。

**Step 3: Verify security boundaries**

- 未登入存取 `/api/admin/site-images` 得到 401 或 redirect。
- 不支援格式、偽造 MIME、過大檔案與未知 slot 都被拒絕。
- 瀏覽器端 bundle 不含 service role key。

**Step 4: Check git state and summarize**

Run: `git status --short --branch && git log --oneline -8`

Expected: only intentional changes, or clean after commits.

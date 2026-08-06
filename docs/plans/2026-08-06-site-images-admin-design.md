# 官網站圖與後台圖片管理設計

## 目標

為官網目前的所有示意圖片位補上貼近台灣廣告輸出產業的寫實生成圖片，並讓已登入管理員能在後台預覽、上傳及替換每個圖片位。前台在圖片資料缺失或讀取失敗時，仍保留既有條紋佔位作為安全 fallback。

## 範圍

- 依 `IMAGE_SLOTS` 為桌機／手機 Hero、8 個服務項目及 4 個作品項目產生獨立圖片。
- 圖片風格統一為台灣廣告輸出工廠或施工現場紀實攝影；無文字、商標、浮水印及可辨識人臉。
- 圖片上傳至公開 Supabase Storage bucket `site-media`。
- 使用既有 `site_images` 資料表保存圖片位、公開網址、尺寸、替代文字、來源與更新資訊。
- 首頁以 Server Component 讀取啟用且狀態為 `ready` 的圖片。
- 後台新增「網站圖片」頁面，支援預覽、上傳及替換；不提供後台 AI 生成按鈕。

## 架構

### 前台

新增站圖資料存取層，使用 server-only 的 Supabase service client 讀取 `site_images`。首頁一次取得所有可用圖片並轉成以 `slot_key` 為索引的 map，再分別傳給 `Hero`、`ServiceRail`、`ProjectWall`。

讀取失敗、資料列未完成或 URL 缺失時不讓頁面報錯，而是讓元件沿用現有 fallback。首頁採動態或可重新驗證的資料模式，管理員換圖後立即使快取失效。

### 後台

新增 `/admin/site-images`：

- 依 `hero`、`service`、`work` 分組。
- 每張卡片顯示名稱、建議比例、目前圖片、更新狀態及檔案選擇器。
- 選檔後先在瀏覽器顯示本地預覽，確認後才送出。
- 上傳成功後更新該卡片並提示成功；失敗時保留原圖並顯示可理解的錯誤。

新增受現有管理員 middleware 保護的 `/api/admin/site-images`：

- `GET`：回傳所有圖片位與目前圖片狀態。
- `POST multipart/form-data`：接收固定 `slotKey` 與圖片檔，驗證後上傳並 upsert `site_images`。

## 圖片與儲存策略

- 圖片位白名單只接受 `IMAGE_SLOTS` 中存在的 key。
- 接受 JPEG、PNG、WebP；限制單檔大小。
- Storage 路徑由伺服器產生，例如 `slots/<safe-slot-key>/<timestamp>-<random>.<ext>`，不使用使用者提供的檔名作為路徑。
- 使用版本化路徑避免 CDN／瀏覽器顯示舊圖。
- 替換資料列成功後再刪除舊檔；若清理失敗不影響新圖使用。
- 初始生成圖標記為 `source = 'ai'`，後台上傳圖標記為 `source = 'upload'`。

## 安全

- API 只透過 `/api/admin/*` 暴露，沿用 HMAC 管理員 cookie middleware。
- `service_role` 僅在伺服器資料層使用，不送到瀏覽器。
- 驗證圖片 MIME type、大小與檔案簽章，避免只信任副檔名。
- 不允許客戶端指定 bucket、Storage 路徑、public URL 或資料庫欄位。
- 公開 bucket 僅存官網站圖，與私有客戶印刷檔 `print-files` 分離。

## 錯誤處理

- 前台資料庫錯誤時顯示既有佔位，不阻擋頁面。
- 後台上傳失敗時不覆蓋現有資料列。
- Storage 成功但資料庫更新失敗時，嘗試刪除剛上傳的孤兒檔。
- API 使用穩定的錯誤代碼與繁體中文訊息。

## 測試與驗收

- 單元測試圖片位白名單、MIME／簽章與大小驗證、Storage 路徑產生。
- API 驗證未登入會被 middleware 拒絕。
- 前台確認有圖時顯示圖片、缺圖時仍顯示 fallback。
- 後台確認可上傳與替換，各種錯誤不會移除原圖。
- 執行測試、TypeScript／Lint 與 production build。
- 檢查桌機及手機 Hero 裁切，以及服務卡和作品牆的圖片比例。


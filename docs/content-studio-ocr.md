# StudyNova Content Studio 與 OCR 規格

## 目的

Content Studio 讓管理員建立可依教育階段隔離的教材版本，設定教材識別資料、封面與內容，並以既有 StudyNova AI OCR 引擎將圖片或 PDF 轉成可編輯的教材課次。

## 教材版本設定

| 設定 | 說明 |
| --- | --- |
| 教育階段 | 決定學生端可見範圍 |
| 出版社、版本、冊次 | 教材識別資訊 |
| ISBN | 外部書籍識別碼 |
| 封面圖片 | 透過後台上傳，儲存於 storage，學生端使用教材封面 route 讀取 |
| 詳細說明 | 提供教材內容、適用範圍與使用提示 |
| OCR 狀態 | `not_started`、`analyzing`、`ready` |

## OCR 詳細設定

每次 OCR 匯入可設定下列項目：

| 設定 | 行為 |
| --- | --- |
| `includeQuestion` | 是否辨識並匯入題目區塊 |
| `includeNote` | 是否辨識筆記與螢光標記區塊 |
| `includeHandwriting` | 是否辨識手寫內容 |
| `highlightPriority` | 是否要求模型優先保留螢光標記內容 |
| `confidenceThreshold` | 只匯入信心分數大於等於門檻的區塊，範圍為 0 至 1 |

分析結果會保存區塊種類、原始文字、信心分數、來源檔名與匯入設定。系統不會對低信心文字自行補猜；管理員應在匯入後人工校訂。

## API

| Method | Path | 權限 | 用途 |
| --- | --- | --- | --- |
| `GET` | `/api/v1/admin/textbooks` | Admin | 讀取教材版本清單 |
| `PATCH` | `/api/v1/admin/textbooks/:id` | Admin | 更新教材詳細設定與 OCR 設定 |
| `POST` | `/api/v1/admin/textbooks/:id/cover` | Admin | 上傳教材封面圖片 |
| `POST` | `/api/v1/admin/textbooks/:id/ocr` | Admin | 上傳圖片／PDF並執行 OCR 匯入 |
| `GET` | `/api/textbook-covers/:id` | Public asset | 讀取教材封面圖片 |

## 正式環境注意事項

正式環境應先套用教材詳細欄位 migration，再使用 OCR。若資料庫尚未完成 migration，教材清單 API 會使用舊欄位 fallback，使後台仍可進入；新增詳細欄位與 OCR 狀態則要等 migration 完成後才能完整保存。

## 使用者 OCR 分析 pipeline

使用者端 OCR 與影像分析共用獨立的 `solveOcrImage` 服務，不直接把 provider 呼叫散落在 route handler。流程為驗證登入、確認檔案 ownership、驗證檔案大小與 magic bytes、呼叫 AI provider、驗證 JSON 結果、正規化座標與信心分數、寫入頁面，再進入後續 Vision 分析。系統不信任 client 傳來的檔名或 MIME type。

單張圖片上限為 12MB，支援 JPEG、PNG 與 WebP。無效圖片會回傳 `SN-AI-6010`，過大圖片回傳 `SN-AI-6011`，空的 OCR 結果回傳 `SN-AI-6006`，AI 回傳無法驗證的 JSON 回傳 `SN-AI-6013`。這些錯誤不會被轉成模糊的成功回應，也不會寫入假的 OCR 文字。

## References

[1]: https://github.com/roy445/StudyNova "StudyNova repository"

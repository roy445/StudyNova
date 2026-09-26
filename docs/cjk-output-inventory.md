# StudyNova CJK 輸出盤點

## 統一來源

- **字型**：Noto Sans CJK TC Regular
- **授權**：SIL Open Font License 1.1；授權副本位於 `src/server/fonts/NotoSansCJK-LICENSE.txt`
- **固定資源**：`src/server/fonts/NotoSansCJKTC-Regular.ttf`
- **Server service**：`src/server/cjk-font.ts`
- **Browser endpoint**：`/api/fonts/cjk`
- **Production tracing**：`next.config.ts` 的 `outputFileTracingIncludes`

## 輸出功能與處理狀態

| Feature | Renderer | Font source | Traditional Chinese status | 修正內容 |
|---|---|---|---|---|
| 個人資料 PDF 匯出 | pdf-lib | `embedCjkFont()` | 支援 | 移除 Helvetica 與非 ASCII 替換，嵌入 TTF |
| Admin 錯誤報告 PDF | pdf-lib | `embedCjkFont()` | 支援 | 錯誤訊息、範圍與 meta 保留中文並嵌入 TTF |
| AI 筆記／心智圖 PDF | pdf-lib | `embedCjkFont()` | 支援 | AI artifact PDF 改用嵌入字型 |
| AI 筆記／心智圖 PNG | Sharp + SVG | SVG data-font | 支援 | Server SVG 內嵌字型，移除 Comic Sans 依賴 |
| Study Notes 心智圖 SVG | Browser SVG download | `/api/fonts/cjk` → data-font | 支援 | 匯出前載入並嵌入字型，不依賴使用者電腦 |
| Study Notes 心智圖 PNG | Canvas + embedded SVG | `/api/fonts/cjk` → data-font | 支援 | Canvas 以帶字型的 SVG 產生 PNG |
| Admin／學生端圖表 | Inline SVG | 全站 `@font-face` | 支援 | 全站 UI 載入固定 CJK font |
| Challenge semantic visual | Browser SVG data URI | `StudyNova CJK` fallback | 支援於已載入 StudyNova UI 字型的 renderer | 移除 Arial-only 宣告；後續若改為 server export，沿用 `withCjkSvgFont()` |
| CSV／TXT／Markdown／DOCX／XLSX | 原生文字／套件 | Unicode | 支援 | 保留 UTF-8；CSV 仍輸出 BOM |

## Health check

`GET /api/v1/admin/system/cjk-font-health`（由現有 API router 提供）會實際驗證：

1. 字型檔存在、可讀取、family 與 glyph 數量。
2. 測試字元包含繁體中文、英文、數字與標點。
3. pdf-lib 嵌入與 PDF 重新載入。
4. Sharp 將含 data-font 的 SVG 轉成 PNG。
5. SVG 是否含固定 data-font。

Admin → 系統 → **CJK 字型測試** 可重新執行並查看真正錯誤原因。

## Regression test

`tests/cjk-font.test.ts` 會驗證固定字型 glyph，以及 PDF、PNG、SVG 三條實際產出路徑。新增文字輸出功能時，應使用 `embedCjkFont()` 或 `withCjkSvgFont()`，不可重新使用系統預設字型或僅 CSS fallback。

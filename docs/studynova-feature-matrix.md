# StudyNova 功能完成度初步矩陣

本矩陣以頁面是否使用既有 API、資料儲存與瀏覽器能力判斷，並不把頁面存在本身視為功能完成。

| 頁面 | 行數 | API 線索 | 實作訊號 | 初步判定 |
|---|---:|---:|---|---|
| `src/app/(app)/ai/page.tsx` | 404 | 0 | useApi, useEffect, useState, upload | 有真實資料流／需檢查細節 |
| `src/app/(app)/challenge/page.tsx` | 780 | 6 | useApi, useEffect, useState, SpeechSynthesis | 有真實資料流／需檢查細節 |
| `src/app/(app)/compress/page.tsx` | 57 | 0 | useEffect, useState, Chart | 有真實資料流／需檢查細節 |
| `src/app/(app)/dashboard/page.tsx` | 365 | 1 | useApi, useState, Chart | 有真實資料流／需檢查細節 |
| `src/app/(app)/essay/page.tsx` | 152 | 0 | useApi, useState | 有真實資料流／需檢查細節 |
| `src/app/(app)/export/page.tsx` | 146 | 0 | useEffect, useState | 有真實資料流／需檢查細節 |
| `src/app/(app)/grades/page.tsx` | 354 | 3 | useApi, useState, Chart | 有真實資料流／需檢查細節 |
| `src/app/(app)/knowledge/[date]/page.tsx` | 45 | 0 | useState | 有真實資料流／需檢查細節 |
| `src/app/(app)/onboarding/page.tsx` | 170 | 1 | useState | 有真實資料流／需檢查細節 |
| `src/app/(app)/profile/page.tsx` | 607 | 6 | useApi, useEffect, useState, localStorage, serviceWorker | 有真實資料流／需檢查細節 |
| `src/app/(app)/report/page.tsx` | 132 | 0 | useApi, useState, Chart | 有真實資料流／需檢查細節 |
| `src/app/(app)/study/page.tsx` | 77 | 0 | useEffect, useState | 有真實資料流／需檢查細節 |
| `src/app/(app)/weekly/page.tsx` | 473 | 0 | useApi, useEffect, useState, SpeechSynthesis | 有真實資料流／需檢查細節 |
| `src/app/(public)/faq/page.tsx` | 246 | 0 | useApi, useState | 有真實資料流／需檢查細節 |
| `src/app/(public)/nova/[novaId]/page.tsx` | 89 | 0 | useApi | 有真實資料流／需檢查細節 |
| `src/app/(public)/privacy/page.tsx` | 8 | 0 | — | 可能偏 UI 或靜態頁 |
| `src/app/(public)/support/page.tsx` | 324 | 0 | useApi, useEffect, useState | 有真實資料流／需檢查細節 |
| `src/app/(public)/terms/page.tsx` | 8 | 0 | — | 可能偏 UI 或靜態頁 |
| `src/app/admin/challenges/page.tsx` | 93 | 1 | useApi, useEffect, useState | 有真實資料流／需檢查細節 |
| `src/app/admin/features/page.tsx` | 51 | 0 | useApi, useState | 有真實資料流／需檢查細節 |
| `src/app/admin/ops/page.tsx` | 835 | 3 | useApi, useState, upload, Blob | 有真實資料流／需檢查細節 |
| `src/app/admin/page.tsx` | 407 | 4 | useApi, useEffect, useState, Chart | 有真實資料流／需檢查細節 |
| `src/app/admin/performance/page.tsx` | 33 | 0 | useApi, upload | 有真實資料流／需檢查細節 |
| `src/app/admin/reference-materials/page.tsx` | 113 | 0 | useState, upload | 有真實資料流／需檢查細節 |
| `src/app/admin/support/page.tsx` | 253 | 0 | useApi, useState | 有真實資料流／需檢查細節 |
| `src/app/admin/system/page.tsx` | 238 | 3 | useApi, useState | 有真實資料流／需檢查細節 |
| `src/app/admin/weekly/page.tsx` | 653 | 0 | useApi, useEffect, useState, upload | 有真實資料流／需檢查細節 |
| `src/app/login/page.tsx` | 99 | 0 | useState | 有真實資料流／需檢查細節 |
| `src/app/page.tsx` | 155 | 0 | useEffect, useState | 有真實資料流／需檢查細節 |
| `src/app/register/page.tsx` | 141 | 0 | useState | 有真實資料流／需檢查細節 |
| `src/app/reset-password/page.tsx` | 115 | 1 | useState | 有真實資料流／需檢查細節 |
| `src/app/s/[slug]/page.tsx` | 63 | 0 | — | 可能偏 UI 或靜態頁 |

## Route and data notes

現有 API 路徑清單見 `docs/api-paths.txt`。核心能力已涵蓋教材、OCR、筆記、單字、錯題、成績、專注、計畫、Novi 對話與 memory、通知、好友、房間、語音、匯出與搜尋；但路徑存在不代表所有能力已達產品級完成，仍需逐路由確認寫入、權限、錯誤、同步與歷史資料。

# StudyNova 功能完成度矩陣

> 文件版本：v1.2.0｜更新日期：2026-11-24
>
> 本矩陣以目前工作區的程式碼、路由與資料模型為準，不把「頁面存在」視為功能完成。未部署、未執行 Production migration、未 push Git；Production 是否已套用相同變更必須另行驗證。

## 使用者功能

| 功能 | 目前狀態 | 實作依據／限制 |
|---|---|---|
| Novi AI 對話 | 已實作 | 登入、對話、附件與記憶流程有 server API；需以 provider 設定與資料庫狀態驗證部署環境。 |
| Novi 全站外觀 | 已實作 | 預設使用 stellar；一般使用者不可切換，Nova Pro 可在個人中心調整；固定右下角，可縮小／收合，不可拖曳。 |
| 額度與 Nova | 已實作 | server-side feature permission、每日／每月額度、Nova ledger 與冪等流程；實際數值以後台設定與個人中心為準。 |
| 英文作文批改 | 規格已確認／後端 fallback 需部署驗證 | 不使用一般 AI 額度；免費版每日 1 次、Pro 每日 5 次，超過後每次 50 Nova，無額外每日／每月上限；失敗不應扣。 |
| AI 背景工作 | 已實作 | PostgreSQL `job_queue`；Pro priority 優先，同層級依時間 FIFO；API 回傳前方人數、預估秒數與 priority。需外部 cron 每分鐘 drain。 |
| 任務通知 | 已實作 | 站內通知與 Web Push；推播失敗不回滾主要資料操作。 |
| 非活躍帳號生命週期 | 已實作 | 超過 30 天未登入／使用先提醒；提醒後 7 天仍未登入才永久刪除，重新登入會取消倒數。需排程實際執行。 |
| 英文閱讀／雜誌分析 | 部分完成／依部署驗證 | 頁面與背景 queue 路由存在；分析是否即時完成取決於 queue drain、provider、SMTP／儲存設定。 |
| OCR | 部分完成 | 目前產品定位以英文科目圖片分析為主；其他科目請使用解題專區或 Novi。需依 provider 與檔案儲存設定驗證。 |
| 解題專區 | 已實作 | 可處理不限英文的解題情境；與英文 OCR 產品定位分開。 |
| 商店與自行購買 Pro | 全域關閉 | `commerce_access.shopEnabled`、`proPurchaseEnabled` 預設關閉；前端隱藏且 API 拒絕交易。既有資格、管理員授予與優惠碼不受影響。 |
| `/introduce` | 已實作 | 公開介紹頁，包含 Novi、單字、閱讀、作文、分析、挑戰與 CTA。 |
| 分享邀請 | 部分完成／依部署驗證 | 分享連結有到期與邀請註冊流程；獎勵與防重複領取需以資料庫資料及實際流程測試確認。 |
| Nova 取得管道 | 已有多種管道 | 學習任務、專注、測驗、成就、活動、挑戰、有效分享邀請、管理員贈送與兌換碼；商店／刷卡關閉。 |

## 管理員與維運

| 功能 | 目前狀態 | 實作依據／限制 |
|---|---|---|
| Feature permissions | 已實作 | `feature_permissions` 由 schema／seed 管理；`ai_solution` 有固定 key，Production 應執行專用檢查與 migration。 |
| 額度查詢與重置 | 已實作 | 可單人、批量、全站重置；站內通知與 Web Push 使用 operation id 去重。 |
| 額度匯出 | 已實作／依權限驗證 | 後台可查詢使用狀況並匯出；正式資料不可用假資料代替，需以 production DB 權限與連線驗證。 |
| 指定 Email 測試 | 已實作 | 後台支援密碼重設、申訴、Pro／獎勵與非活躍警告信測試；SMTP 未設定時不可宣稱已寄出。 |
| DB／系統觀測 | 部分完成 | 有管理 API、system logs、queue 與 provider 記錄；圖表的準確性取決於事件寫入與資料庫 schema 已同步。 |
| Cron／queue drain | 已實作 | 支援外部 cron；Vercel Hobby 不使用每分鐘 Vercel Cron。 |
| Production migration | 尚未由本次工作區執行 | 不可把本地 typecheck 通過當成 Production schema 已更新；依部署文件執行 release 與 AI solution 檢查。 |

## 工程驗證狀態

- `./node_modules/.bin/tsc --noEmit`：本次盤點前已通過。
- `pnpm exec tsc`／`pnpm test`：曾受環境中的 pnpm ignored build scripts 檢查阻擋；不能將該環境錯誤解讀為產品測試全數通過。
- 本次未部署、未執行 Production migration、未 push Git。

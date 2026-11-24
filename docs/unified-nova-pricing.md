# StudyNova 額度與 Nova 使用規則

**文件版本：v1.2.0｜更新日期：2026-11-24**
**適用範圍：AI 解題中心、Novi、OCR、英文作文批改、閱讀分析與其他需要後端資源的功能**

> 本文件描述目前產品規則與計費安全原則，不是對外固定價格承諾。實際數值由後台 `feature_permissions` 與帳號狀態決定；未在後台確認的數字不可寫成宣傳保證。

## 一、核心原則

StudyNova 將「一般 AI 額度」與「Nova 點數」分開管理。額度是功能在每日／每月的使用上限；Nova 是在允許的功能中，使用者選擇超額補用時消耗的點數。所有權限、價格、Pro 限制與扣點都由伺服器端決定，前端傳入的價格一律不可信。

標準流程為：

```text
登入與權限檢查
→ 讀取 feature permission
→ 檢查 Free／Pro 額度與 Nova 餘額
→ 建立 idempotency/request record
→ 建立或等待 AI job
→ AI 成功並通過輸出驗證
→ 寫入 usage／完成 Nova ledger
```

AI provider 尚未成功、工作排隊失敗、輸出驗證失敗、重試失敗或資料庫錯誤，都不得扣除一般額度或 Nova。重複 request 只能完成一次使用記錄。

## 二、英文作文批改是獨立規則

英文作文批改**不使用一般 AI 額度**，也不應套用一般 Novi 對話或解題的扣點邏輯。正式產品規格為免費版每日 1 次、Nova Pro 每日 5 次；免費次數用完後每次 50 Nova，且不設額外每日／每月上限。

超額補用應在免費限制達上限後檢查 Nova 餘額並顯示確認畫面；正式成本為 50 Nova，且不設額外每日／每月上限。成功產生有效批改結果後才完成扣點，失敗不扣。Production 仍須依部署流程驗證後端 fallback 與資料庫設定。

對外說明應使用：

> 作文批改不會吃一般 AI 額度。免費版每日 1 次、Nova Pro 每日 5 次；用完後每次 50 Nova 繼續，且不設額外每日／每月上限。若批改失敗，不會扣除額度或 Nova。

## 三、一般功能的管理設定

管理員應從後台設定功能，而不是在前端硬編碼：

| 設定 | 用途 |
|---|---|
| `feature` | 固定功能 key，例如 `ai_solution`、作文功能 key |
| `enabled` | 是否開放 |
| `pro_only` | 是否限 Nova Pro |
| `free_daily_limit` | 免費版每日上限；依實作約定，`-1` 可表示不限 |
| `pro_daily_limit` | Pro 每日上限 |
| `monthly_limit` | 月上限 |
| `nova_cost` | 已啟用功能的 server-side Nova 成本；英文作文超額補用為 50 |
| `updated_at` | 設定異動時間 |

`ai_solution` 必須維持固定 key，不得在前端、seed、quota service 之間改成 `ai-solution` 或 `solution`。查詢 permission 發生真正的 schema／connection／permission denied 錯誤時要記錄結構化 log；只有找不到可選設定時才可使用明確、安全的 server default。

## 四、失敗、退款與冪等

| 狀態 | 額度／Nova | 說明 |
|---|---|---|
| preflight 失敗 | 不扣 | 權限、檔案、餘額或參數不符合 |
| 排隊建立失敗 | 不扣 | 沒有成功建立可執行工作 |
| provider timeout／429／5xx | 不扣 | 任務標記失敗或可安全重試 |
| 輸出品質驗證失敗 | 不扣 | 不可用低品質結果冒充成功 |
| 成功且結果有效 | 完成記錄／依規則扣除 | 僅在成功提交結果後結算 |
| 重送相同 idempotency key | 不重複扣 | 回傳既有 request／job 結果 |

若某個 legacy 流程必須先建立 pending ledger，也只能視為暫存預留；最終失敗必須標記 `refunded`，且使用者的實際消耗為零。

## 五、使用者顯示要求

開始任何可能使用 Nova 的工作前，畫面要說明：功能名稱、目前 Nova、預計消耗、成功條件、失敗不扣的政策，以及是否還有排隊。背景工作則需顯示排隊狀態、前方人數與預估等待時間；Nova Pro 工作具有優先權。

## 六、商店與購買狀態

目前 `shopEnabled=false`、`proPurchaseEnabled=false`。因此使用者不能從商店或購買頁自行取得商品／Nova Pro，前端應隱藏相關入口，API 也必須拒絕交易。這不影響既有會員權益、管理員授予／延長／回收，或管理員仍允許的優惠碼兌換流程。

## 七、Nova 取得管道

Nova 可由完成學習任務、專注與測驗、成就、活動、挑戰、有效分享邀請、管理員贈送及管理員發放的兌換碼取得。每個獎勵都必須使用 transaction 與 idempotency key，避免重複領取。商店與刷卡購買目前關閉，不列為使用者取得管道。

## 八、資料與稽核

每次使用至少應保留 user、feature、job/request id、idempotency key、成功／失敗狀態、provider、延遲、Nova transaction id 與錯誤分類。管理員可依權限查詢與匯出使用狀況；匯出資料不得包含 API key、session secret 或資料庫連線字串。

## 九、目前限制與部署提醒

本文件不表示 Production 已完成部署。工作區目前尚未執行 Production migration、尚未部署、尚未 push Git。正式環境請依 [`DEPLOYMENT_CONFIG.md`](./DEPLOYMENT_CONFIG.md) 執行 schema／release migration、`ai_solution` 檢查與外部 queue drain 設定，再以實際個人中心與管理後台資料驗證。

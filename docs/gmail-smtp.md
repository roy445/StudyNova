# StudyNova Gmail SMTP 設定

> 文件版本：v1.2.0｜更新日期：2026-11-24

StudyNova 使用 Gmail SMTP 寄送密碼重設、申訴解封、Pro、獎勵通知與非活躍帳號警告信。這個方式不需要購買網域，但 Gmail 帳戶必須開啟兩步驟驗證並建立一組 16 位數的應用程式密碼。

## Google 帳戶設定

前往 [Google 帳戶安全性](https://myaccount.google.com/security)，開啟「兩步驟驗證」，再進入「應用程式密碼」。新增一組名稱為 `StudyNova` 的應用程式密碼。Google 顯示的密碼可能包含空格，填入 Vercel 時可以保留或移除空格，程式會自動移除空白字元。

這組密碼不是 Gmail 登入密碼，也不應提交至 GitHub、聊天訊息或程式碼檔案。如果密碼外洩，請立即在 Google 帳戶中撤銷該應用程式密碼。

## Vercel Environment Variables

在 Vercel 專案的 **Settings → Environment Variables** 新增以下變數，至少選擇 Production；如果要在 Preview 測試，也選擇 Preview。

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=你的Gmail信箱
SMTP_PASSWORD=Google產生的16位應用程式密碼
EMAIL_FROM=StudyNova <你的Gmail信箱>
NEXT_PUBLIC_APP_URL=https://你的Vercel網址
```

例如：

```env
SMTP_USER=studynova.notice@gmail.com
SMTP_PASSWORD=abcdefghijklmnop
EMAIL_FROM=StudyNova <studynova.notice@gmail.com>
```

完成後必須重新部署，Vercel Function 才會取得新的環境變數。不要把 `SMTP_PASSWORD` 放進前端變數，也不要使用 `NEXT_PUBLIC_` 前綴。

## 寄信範圍

系統會使用同一套 Gmail SMTP 服務寄送密碼重設、封鎖申訴核准、帳號重新啟動、Pro、獎勵通知與 `inactivity_warning` 非活躍警告。使用者最後登入／使用超過 30 天會先收到提醒；信件會明確說明「7 天內重新登入，否則帳號將永久刪除」，期限內重新登入會取消倒數。

管理員可在「管理員 → 支援／帳號通知信」輸入指定收件者，選擇「非活躍帳號：7 天後永久刪除警告」進行測試；若未填連結，系統會使用目前網站的 `/login`。測試信只能驗證模板與 SMTP 設定，不會修改該收件者帳號的刪除倒數。若 SMTP 尚未設定，後台應顯示失敗或可複製的測試內容，不會假裝已寄出。

## Gmail 限制

Gmail 個人帳戶適合 StudyNova 的少量系統通知，不適合大量群發。若帳戶是學校或公司管理的 Google Workspace，管理員可能停用應用程式密碼；這種情況需要管理員允許，或改用其他郵件服務。

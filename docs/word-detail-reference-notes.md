# 單字詳細資訊參考觀察

本次只採用互動與資料呈現概念，不複製任何參考網站的 UI、CSS、品牌視覺或大量原始碼。

## wordsfunny
來源：https://wordsfunny.com/BeiShiGaoZhong_4/words

觀察到參考頁面以教材／詞庫清單瀏覽單字，提供「全部／已掌握／未掌握」等學習狀態篩選，並以登入狀態限制個人化功能。StudyNova 將沿用「列表→選取單字→檢視詳細內容與學習狀態」的互動概念，但保留 StudyNova 現有深色星軌、卡片、圓角、按鈕、字體與導航設計。

## remix-words-funny
來源：https://github.com/SteveSuv/remix-words-funny

README 顯示參考專案是使用 Remix／React Router、tRPC、Drizzle、PostgreSQL、HeroUI、Jotai 的全端英文單字學習網站。對本次實作有用的概念是將單字資料、使用者資料與學習狀態分開，並透過型別安全 API 與 query cache 取得資料。StudyNova 不更換既有 Next.js、REST router、Drizzle、PostgreSQL、現有登入系統或 UI 設計；會以目前架構新增 detail endpoint、AI cache 與使用者 progress mutation。

## 實作約束

單字列表維持輕量資料；只有點擊單字才請求詳細資料。詳細頁採全螢幕、由底部滑入的 sheet，不使用傳統小型 modal，不改變 URL，關閉後保留原列表狀態。AI 補充與基本資料分區，AI 內容採資料庫快取，AI 失敗不阻斷基本單字資訊。

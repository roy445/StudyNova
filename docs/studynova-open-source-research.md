# StudyNova 開源借鑒研究與產品演進藍圖

**作者：Manus AI**  
**研究範圍：StudyNova 既有 GitHub 專案，以及考試出題系統以外的開源能力**  
**明確排除：考試出題、題庫、模擬考、AI 閱卷與 AI 口試 Repository**

## 摘要與結論

StudyNova 現在不是一個只有畫面的原型，而是已經具備相當完整的學習產品骨架：Next.js App Router、React、PostgreSQL、Drizzle、REST-like server route、Blob/S3 儲存、BullMQ/Redis fallback、AI provider fallback、Nova ledger、Novi 對話、教材與 OCR、單字、錯題、筆記、專注、計畫、通知、好友、挑戰、語音與 Admin。真正需要補強的不是再增加一堆孤立頁面，而是把既有資料串成四個核心系統：**智慧複習層、學習記憶層、學習知識圖譜、跨內容搜尋與分析層**。

本次研究的最高優先結論是：StudyNova 不應直接嵌入任何大型外部產品，而應吸收其資料模型與工程原則。第一階段採用 **FSRS 演算法層 + PostgreSQL 既有資料庫 + 事件紀錄 + 使用者可控的 AI Memory**；第二階段再加入 `pgvector` 或 Meilisearch；只有在圖譜查詢與資料規模確實超過 PostgreSQL 能力時，才考慮 Graphiti/Neo4j 類架構。

> 最值得先做的不是「再做一個更花俏的 Dashboard」，而是讓每一次閱讀、作答、錯誤、複習、筆記與 Novi 對話，都留下可追蹤、可刪除、可解釋的學習證據。

## 一、StudyNova 現況盤點

### 1. 技術架構

目前 `package.json` 顯示 StudyNova 使用 Next.js 16.2.6、React 19.2.6、TypeScript 5.9.3、Tailwind CSS 4、Drizzle ORM、PostgreSQL、Vercel Blob、AWS S3 SDK、BullMQ、ioredis、web-push、pdf-lib、sharp、zod、Vitest。前端頁面位於 `src/app`，共用元件位於 `src/components`，REST-like API route 位於 `src/server/routes`，資料表集中在 `src/db/schema.ts`。這個架構適合採取「同一個 PostgreSQL source of truth、逐步增加索引與 worker」的演進方式，不適合現在就拆成多個微服務。

### 2. 已有真實資料流的功能

| 功能領域 | 目前已確認的實作 | 判定 |
|---|---|---|
| 登入與帳號 | login、register、logout、session、密碼變更、忘記密碼、session 管理與帳號設定 | **已完成骨架，需持續安全維護** |
| 教材與 OCR | materials、OCR documents/pages、分析、vision analysis、transform、學習操作與私人儲存 | **已有後端資料流** |
| 單字學習 | my vocabulary、word detail、progress、daily words、memory tip、answer、session complete、Word Detail Ask AI | **已有產品流程，可接 FSRS** |
| 錯題學習 | wrong、wrong/due、review、AI tip，以及 quizzes/from-wrong | **已有產品流程，可接 FSRS 與學習圖譜** |
| AI／Novi | ai conversations、messages、quick、memory、solution contexts、upload、AppShell 固定 Novi | **已有後端，但 Memory 仍偏基礎** |
| 筆記 | notes、visual-notes/generate、教材 highlights 欄位 | **已有功能入口，但還不是完整 Block/Backlink 系統** |
| 專注與計畫 | focus history/complete、plan、daily tasks、block done、regenerate | **已有真實資料流** |
| 語音 | voice records、transcripts、analysis、reading/recite/speaking 模式與前端語音播放 | **已有骨架；一般語音學習仍可升級** |
| 通知 | notifications、read、push subscribe/unsubscribe、VAPID 設定、`dedupeKey` unique index | **已有基礎；尚未是完整 workflow/queue 系統** |
| 社交 | friends、requests、block、rooms、activity feed、leaderboard、friend challenges | **已有基礎社交資料流** |
| Gamification | Nova、XP、achievements、user achievements、tasks、leaderboard、Novi shop | **已存在，但規則仍需可配置化** |
| Admin | users、questions、question import、weekly、challenges、AI health、performance、support、reference materials、system | **後台廣泛，治理規則可再抽象** |

### 3. 目前較可能是部分完成或需要深度驗證的區域

API 路徑已經很多，但「有 route」不等於「產品級完成」。目前應把以下區域列為部分完成：

第一，**AI Memory** 目前已存在 `aiMemory` 資料表與 `/ai/memory` API，但 schema 中以使用者與 key 的 unique index 為主，還不像 Mem0 或 Graphiti 那樣有多層 scope、語意檢索、來源 provenance、時間有效性、衝突版本與使用者刪除政策。

第二，**Smart Notes** 已有 notes、visual notes 與教材 highlights，但尚未確認具備完整 block editor、Wiki link、backlink、block-level search、模板、版本與可逆整理。這是吸收 Logseq／Obsidian 類概念，而不是直接採用 AGPL 程式碼的區域。

第三，**文件閱讀** 已有教材與 OCR 及 highlights 欄位，但仍應補齊頁碼／區域標註、書籤、閱讀進度、選取文字、標註來源與知識點連結。PDF.js 可以提供可靠的渲染核心，但 annotation 與學習資料必須由 StudyNova 自己管理。

第四，**Global Search** 已有 `/search` 與 AppShell 搜尋 Modal，但目前仍應視為單一搜尋入口，而非完整的跨內容索引系統。搜尋教材、PDF 頁面、筆記、單字、錯題、概念、學習紀錄與 Novi 對話，必須統一資料模型與權限過濾。

第五，**學習分析** 已有 dashboard、grades、report、performance、focus 與各種紀錄，但尚未形成一致的 learning event ledger，因而難以計算記憶保持率、複習效率、弱點轉移與進步速度。

第六，**PWA／Offline-first** 已有安裝引導、service worker／push 相關線索，但目前尚未看到完整的 IndexedDB local cache、sync queue、idempotency key 與 conflict resolution。這是下一階段的基礎工程，不應只加一個離線 banner。

第七，**固定 AI 助理** 已完成。Novi 已移除拖曳 state、pointermove／pointerup handler、transform 定位與 drag cursor，保留開啟、收合、縮小與聊天互動，固定於 responsive bottom-right 位置。此次修改已通過 typecheck、lint、30 個測試、production build 與 `git diff --check`，commit 為 `605f7ed fix Novi assistant fixed position`。

## 二、最值得借鑒的開源專案排行榜

排行榜不是單純依 GitHub stars 排序，而是依 **StudyNova 適配度、License 風險、能否吸收核心設計、與現有架構的整合成本** 評估。

| 排名 | Repository／技術 | License | 最值得借鑒的地方 | StudyNova 改造方向 | 難度 | 優先級 |
|---:|---|---|---|---|---|---|
| 1 | [open-spaced-repetition/free-spaced-repetition-scheduler](https://github.com/open-spaced-repetition/free-spaced-repetition-scheduler)／FSRS | MIT | Difficulty、Stability、Retrievability 三個記憶變數；允許提前或延後複習；有 TypeScript、Python、Rust 等實作與 optimizer [1] | 建立統一 `review_items`，把單字、錯題、教材重點與知識點都轉成可排程 item；使用 rating 更新 due、stability、difficulty，而不是固定隔幾天 | 中 | **P0** |
| 2 | [mem0ai/mem0](https://github.com/mem0ai/mem0) | Apache-2.0 | User／Session／Agent 多層 Memory、混合語意與 BM25、entity linking、temporal retrieval、self-hosted server [2] | 保留 PostgreSQL；建立 memory scope、source、confidence、consent、expiresAt、deleteAt、lastUsedAt，Novi 只取與目前學習任務相關的記憶 | 中高 | **P0** |
| 3 | [mozilla/pdf.js](https://github.com/mozilla/pdf.js) | Apache-2.0 | HTML5 PDF rendering、worker、generic viewer、瀏覽器相容性與完整測試 [6] | 作為 Reader rendering core；StudyNova 自己存 highlight、note、bookmark、reading progress、selected text、concept link | 中 | **P0** |
| 4 | [meilisearch/meilisearch](https://github.com/meilisearch/meilisearch) | MIT Community Edition；另有 Enterprise licensing | typo tolerance、facets、filters、synonyms、tenant tokens、中文支援與 hybrid search [8] | 先改善 PostgreSQL 搜尋與權限；規模和 latency 確實需要時再加 Meilisearch indexing worker | 中 | **P1** |
| 5 | [getzep/graphiti](https://github.com/getzep/graphiti) | Apache-2.0 | Temporal knowledge graph、entities、facts、episodes provenance、validity windows、incremental ingestion、hybrid retrieval [4] | 先用 PostgreSQL `knowledge_nodes`／`knowledge_edges`／`edge_evidence`／mastery history 模擬 bounded graph；成熟後再評估 Neo4j/FalkorDB | 高 | **P1** |
| 6 | [logseq/logseq](https://github.com/logseq/logseq) | AGPL-3.0 | Privacy-first、Markdown／Org-mode、block-oriented notes、PDF annotation、graph、plugin API、mobile 思路 [5] | 僅吸收 block、backlink、graph、annotation UX 與資料模型；不要直接拷貝 AGPL 程式碼進 StudyNova | 高 | **P1** |
| 7 | [novuhq/novu](https://github.com/novuhq/novu) | MIT core；Enterprise folder 為商業授權 | Unified notification API、workflow branching、digest、Inbox、preferences、多 channel delivery [9] | 以既有 notifications、BullMQ 與 web-push 為基礎加入 outbox、schedule、retry、dedupe、quiet hours、delivery history | 中高 | **P1** |
| 8 | [learningequality/kolibri](https://github.com/learningequality/kolibri) | MIT | Offline-first education platform、下載內容包、前後端測試與本機學習 [7] | 借鑒 offline content pack、sync boundaries 與離線學習體驗；不引入整個 LMS | 高 | **P1** |
| 9 | [isuru89/oasis](https://github.com/isuru89/oasis) | Apache-2.0 | Event-driven points、badges、milestones、leaderboards、challenges、可設定 rules、Admin/Stats API、out-of-order event support [10] | 建立 `gamification_rules`、`rule_conditions`、`reward_grants`、`event_idempotency`；Admin 用設定建立成就，不必改程式碼 | 中高 | **P1** |
| 10 | [OATutor](https://www.oatutor.io/)／[CAHLR/OATutor](https://github.com/CAHLR/OATutor) | 需逐版確認 Repository license；官方定位為研究與教育用途 | Bayesian Knowledge Tracing、mastery、adaptive path、real-time feedback、A/B testing [11] | 以 BKT 作為概念／技能掌握補充訊號；由 deterministic recommender 決定下一步，Novi 負責解釋 | 高 | **P1** |
| 11 | [dexie/Dexie.js](https://github.com/dexie/Dexie.js) + [GoogleChrome/workbox](https://github.com/GoogleChrome/workbox) | 分別依各 Repository 版本核對 | IndexedDB wrapper、local-first cache、Service Worker、Background Sync 與 request queue 概念 [17] [18] | 優先離線快取已下載教材、單字與 due reviews；新增 outbox/sync queue，不把所有資料無差別同步 | 中高 | **P1** |
| 12 | [OpenPronounce](https://github.com/Halleck45/OpenPronounce) | MIT | Wav2Vec2 + DTW phoneme-level pronunciation assessment、IPA、word errors、prosody、JSON/FastAPI；可 self-host [12] | 只作一般英文發音練習的 optional worker，不與 AI 口試混在一起；先小量試點並顯示模型限制 | 高 | **P2** |
| 13 | [PaddlePaddle/PaddleSpeech](https://github.com/PaddlePaddle/PaddleSpeech) | Apache-2.0 | Streaming ASR／TTS、Chinese frontend/G2P、punctuation、translation、部署 runtime [13] | 作為一般語音與教材朗讀的候選服務；目前優先使用既有 Web Speech／既有 voice flow，避免立刻引入 Paddle 重依賴 | 高 | **P2** |
| 14 | [OpenFGA](https://github.com/openfga/openfga) | Apache-2.0 | 可讀的 Relationship-Based Access Control model、細粒度權限與 API；同時涵蓋 RBAC／ABAC 思路 [14] | 先把 owner／viewer／editor／group_member／teacher／admin 轉成可測試 policy functions；分享規則複雜後才考慮獨立服務 | 高 | **P2** |
| 15 | [authjs/next-auth](https://github.com/nextauthjs/next-auth) | MIT | CSRF、restrictive cookies、encrypted JWT、session polling、Web API 與 TypeScript 安全原則；Repository 已說明新專案可評估 Better Auth [15] | 不更換既有登入；吸收安全 checklist、session revocation、revalidation、audit events 與 provider isolation | 中 | **P2** |

### 明確不優先採用的候選

[Typesense](https://github.com/typesense/typesense) 功能很強，包含 typo tolerance、facets、vector、hybrid、federated search、scoped keys 與 voice/image search，但 Repository license 為 GPL-3.0 [19]。對 StudyNova 這類希望保持產品部署彈性的專案，License 成本與額外服務成本都比 Meilisearch 高，除非未來明確需要它的特定功能，否則不列為首選。

[OpenSearch](https://github.com/opensearch-project/OpenSearch) 是 Apache-2.0 且能力完整，但對目前 StudyNova 仍屬過重。它適合大型分散式搜尋、分析與 log 平台，不適合現在直接拿來替代 PostgreSQL `/search`。Letta 的概念值得看，但官方 README 已說明目前 Repository 是 landing page，活躍 source 已移到 `letta-ai/letta-code`，舊 server archive 不應用於 production [3]，所以不列為直接依賴。

## 三、智慧複習：StudyNova 應該怎麼做

### 1. 不要只做單字卡

StudyNova 的複習單位應該統一抽象為 `review_item`，但 item 可以指向不同來源：`vocabulary`、`wrong_question`、`material_highlight`、`knowledge_point`、`note_block` 或 `sentence_pattern`。每個 item 保存 `contentType`、`contentId`、`userId`、`fsrsState`、`difficulty`、`stability`、`retrievability`、`dueAt`、`lastReviewedAt`、`lastRating`、`sourceEvidenceId`。

FSRS 只負責「何時再出現」與根據回憶品質更新記憶狀態；內容生成、題型選擇、閱讀來源、Novi 解釋與學習路徑仍由 StudyNova 控制。這樣可以避免把所有內容硬做成卡片，也能讓一次錯題回顧同時更新概念掌握與複習排程。

### 2. 複習事件與資料來源

每次學習都應寫入 append-only `learning_events`：開始複習、看過、答對、答錯、提示後答對、跳過、朗讀、標註、完成一段教材、Novi 解釋後再次回答。FSRS rating 不能只從「答對／答錯」猜，而要保留 response time、是否看提示、是否自信、是否中途離開等 evidence。

錯題、單字、教材重點與知識點可以共享排程，但要保留不同評量方式。例如，單字可以是回憶中文義、拼字與聽音；教材重點可以是短答、摘要或辨認關係；知識點可以是 prerequisite check。排程是共通的，評量模板不必相同。

## 四、AI Memory 與 Novi

Novi 應採用分層記憶，而不是把所有聊天內容塞進一個長 prompt：

| 層級 | 內容 | 保存原則 |
|---|---|---|
| Session memory | 最近一輪對話、目前問題、當前教材頁面 | 短期保存，可快速過期 |
| Task memory | 本次正在做的學習任務、目標、未完成步驟 | 與任務綁定，任務結束後可歸檔 |
| Learning profile | 使用者偏好語言、常用學習時段、喜歡的解釋形式 | 使用者可查看、編輯、刪除 |
| Mastery memory | 某概念的熟練度、常犯錯誤、最後證據 | 必須引用學習事件，不能由 AI 無證據臆測 |
| Episodic memory | 之前與 Novi 討論過的具體學習內容 | 要有來源、時間、可搜尋與可撤回 |
| Semantic memory | 經確認的概念、關係與定義 | 需要 provenance 與版本，不把模型猜測當真理 |

每筆 Memory 都應有 `scope`、`sourceType`、`sourceId`、`confidence`、`consentStatus`、`createdAt`、`lastUsedAt`、`expiresAt`、`deletedAt`。使用者介面必須提供「Novi 記得什麼」、「不要記住這件事」、「暫停記憶」、「刪除這筆」、「匯出我的記憶」與「只在單次對話使用」。這是 Mem0 的分層與檢索概念加上 StudyNova 自己的隱私控制，而不是把第三方記憶服務當黑盒子。

## 五、Learning Graph 與 Knowledge Graph

StudyNova 目標圖譜可以抽象成：

```text
Subject
  └─ Unit
      └─ Knowledge Point
          ├─ Material / Page / Highlight
          ├─ Note Block
          ├─ Vocabulary
          ├─ Wrong Question
          ├─ Review Item
          └─ Mastery Evidence
```

第一版不建議直接增加 Neo4j。PostgreSQL 已是現有 source of truth，可新增 `knowledge_nodes`、`knowledge_edges`、`edge_evidence`、`node_mastery_history`，並用 recursive CTE、索引與 pgvector 做 bounded graph。Graphiti 最值得借鑒的是「每個關係都有來源 episode、時間有效性與可追溯性」，不是必須立刻採用它的 graph backend。

只有當以下情況成立，才值得引入外部圖資料庫：跨數百萬節點的深層 traversal 成為主要查詢、PostgreSQL recursive query 已經無法維持 latency、或產品需要讓使用者自由探索大型 graph。否則新增外部 graph service 會增加部署、備份、權限與資料同步成本。

## 六、Smart Notes 與文件閱讀

Smart Notes 應採用 StudyNova 自己的 block schema：`note` → `blocks` → `inline links` → `references`。每個 block 可以連到 material page、PDF highlight、word、wrong question、knowledge point 或 Novi conversation message。Wiki link 與 backlink 不只是文字搜尋結果，而要成為可查詢的 edge。

PDF Reader 應採用 PDF.js 作為 renderer，新增 StudyNova 自己的 annotation tables：`document_annotations`、`document_bookmarks`、`reading_progress`、`annotation_links`。Highlight 必須保存 document、page、rectangles、selectedText、color、note、createdBy 與 source hash。EPUB 則可以先參考 epub.js 的瀏覽層，但必須把章節、位置與閱讀進度抽象成通用 `document_locator`，避免 PDF 與 EPUB 各做一套無法互連的筆記。

AI 整理不能直接改寫使用者原文。建議流程是「選取範圍 → AI 產生摘要／概念／問答／單字候選 → 顯示來源與差異 → 使用者確認 → 寫入 note/knowledge graph」。

## 七、Global Search 選型

| 選項 | 優點 | 代價 | 建議 |
|---|---|---|---|
| PostgreSQL FTS | 零新服務、權限與交易一致、適合目前規模 | 中文 tokenization、typo tolerance、semantic ranking 較弱 | **現在先做** |
| `pg_trgm` | 英文與拼字錯誤、部分中文片段搜尋實用 | 不是完整語意搜尋 | 與 PostgreSQL FTS 一起做 |
| `pgvector` | 直接留在 PostgreSQL、適合 semantic retrieval | 需要 embeddings、chunking、ranking 與成本治理 | **第一階段 AI 搜尋加入** |
| Meilisearch | MIT CE、安裝簡單、typo、facets、tenant、hybrid、中文支援 | 新索引服務、資料同步與權限過濾責任增加 | **第二階段首選** |
| Typesense | search UX、vector/hybrid、federated 功能很完整 | GPL-3.0、需新服務 | 不作首選 |
| OpenSearch/Elasticsearch | 大型索引、分析與分散式能力強 | 運維重、資源與 schema 成本高 | 現階段不要用 |
| Vector-only | 語意理解好 | 精確詞、拼字、標題、ID 搜尋弱 | 不可單獨使用 |
| Hybrid | 關鍵字精準 + 語意召回 | ranking、去重、評估與成本較複雜 | **最終方向** |

Global Search v1 應建立 `search_documents` projection，每筆包含 `ownerId`、`visibility`、`kind`、`title`、`body`、`normalizedText`、`sourceId`、`embedding`、`updatedAt`。所有查詢先套 ownership／visibility predicate，再做全文與 semantic ranking，不能把權限留給搜尋服務最後才補。

## 八、學習分析與 Adaptive Learning

需要新增的是 learning event ledger，而不是更多圖表。推薦事件欄位包括 `userId`、`eventType`、`objectType`、`objectId`、`conceptId`、`sessionId`、`occurredAt`、`durationSec`、`responseTimeMs`、`correct`、`hintUsed`、`confidence`、`source` 與 `idempotencyKey`。

由這些事件計算：學習時間、有效專注時間、正確率、提示後正確率、FSRS retention、複習效率、連續學習、科目分布、弱點、錯誤類型、概念掌握、進步速度、間隔與遺忘曲線。Novi 只應讀取已聚合且有 evidence 的指標，例如「你最近三次在 X 概念的錯誤都發生於被動辨識，下一步安排主動回憶」，而不是只看一張漂亮圖表後自由發揮。

Adaptive Learning 的 deterministic ranker 可以使用：

```text
priority = urgency × weakness × prerequisite_impact × goal_relevance × content_fit
```

其中 urgency 來自 FSRS due/retrievability，weakness 來自錯誤與 mastery evidence，prerequisite impact 來自 learning graph，goal relevance 來自使用者目標與 deadline，content fit 則考慮目前可用時間、裝置與偏好。Novi 可以解釋與調整排序，但不可偷偷覆寫 evidence。

## 九、Gamification、通知與社交學習

StudyNova 已有 Nova、XP、徽章、成就與挑戰，不需重做基本 UI。下一步應把「事件 → 條件 → reward grant」抽象成可設定引擎。條件可包括 event count、連續天數、時間範圍、concept mastery、review retention、first occurrence、group goal 與指定活動。每個 reward 都必須有 `ruleVersion`、`eventId`、`dedupeKey`、`grantedAt`、`reversalPolicy`，避免重複領獎與規則修改污染歷史。

通知系統應以現有 `notifications.dedupeKey` 和 BullMQ 為起點，加入 outbox、workflow、schedule、quiet hours、retry with backoff、dead letter、delivery attempt、user preferences 與 notification history。Novu 值得借鑒的是 workflow／digest／preferences／多 channel 抽象，不應在目前階段直接再建立第二個通知資料庫。

社交學習應優先做低風險的 study groups、private group goals、好友共同複習與可選 activity feed。預設不公開弱點、成績、錯題與 Novi memory；群組分享要逐項授權，未成年與校園情境應提供 block、report、mute、invite control、審核與最小化個資。

## 十、PWA、Offline-first 與 375px Mobile-first

推薦採用「部分可離線」，不是一開始追求整站離線。第一批可下載內容是已授權教材頁面、PDF cache、單字、due review queue、個人筆記草稿。IndexedDB 保存 material cache、review cache、drafts 與 `sync_queue`；Service Worker／Workbox 處理 static assets 與可重試 request；每個 mutation 都帶 idempotency key。

Conflict policy 必須按資料類型定義：學習事件採 append-only merge；XP／Nova 由 server authoritative；偏好設定可用 last-write-wins；筆記採 revision／conflict copy，不直接覆蓋；複習結果以 server transaction 合併。iOS Safari 對 Background Sync 支援不一致，因此前景恢復、visibility change 與手動「立即同步」都要有 fallback。

375px QA 清單應包含：固定 Novi 不遮住 bottom navigation、bottom sheet 可上下拖動但不誤觸文字、輸入法開啟時 modal 不被鍵盤遮住、所有 touch target 至少約 44px、維持 scroll position、長單字與長句可換行、離線狀態可見、retry 不重複提交。

## 十一、建議實作順序

| 階段 | 內容 | 主要產出 |
|---|---|---|
| P0 | Event ledger、FSRS adapter、review_items、Memory consent／CRUD、固定 Novi 的 mobile QA | 單字／錯題先有真正智慧複習；Novi 記憶可查看與刪除 |
| P1 | Learning graph bounded schema、PostgreSQL FTS + pg_trgm + pgvector、PDF.js reader annotations、notes blocks/backlinks | 教材、筆記、單字、錯題、知識點開始互相連結 |
| P1 | Notification outbox／dedupe／retry、可配置 achievement rules、focus／retention analytics | 通知可靠，Admin 可設定成就，Novi 有 evidence-based 建議 |
| P2 | Dexie/Workbox offline pack、sync queue、conflict UI、study groups privacy controls | 手機斷線仍可讀教材、複習與寫筆記 |
| P2 | Meilisearch 評估導入、OpenPronounce optional worker、adaptive ranker + BKT experiment | 跨內容搜尋與個人化路徑進入產品化 |
| P3 | Graph backend、完整 graph explorer、跨裝置即時協作、進階語音分析 | 只有在真實規模與使用數據證明需求後才做 |

## 十二、最終推薦清單

如果只能先研究與吸收五個方向，我建議是：

1. **FSRS／ts-fsrs**：立即讓單字、錯題、教材重點與概念有真正的智慧複習。
2. **Mem0 的 memory lifecycle 與 hybrid retrieval**：把 Novi 從聊天機器人提升成有控制權的學習夥伴。
3. **PDF.js + StudyNova annotation model**：把上傳文件變成可讀、可標註、可搜尋、可連結的學習內容。
4. **Meilisearch 的 search UX 與 hybrid direction**：先以 PostgreSQL 打底，再在需要時加入專用搜尋服務。
5. **Graphiti／Logseq 的 provenance、temporal graph、block/backlink 思路**：建立 StudyNova 自己的 Learning Graph 與 Smart Notes，而不是直接複製外部產品。

## References

[1]: https://github.com/open-spaced-repetition/free-spaced-repetition-scheduler "Free Spaced Repetition Scheduler"
[2]: https://github.com/mem0ai/mem0 "Mem0"
[3]: https://github.com/letta-ai/letta "Letta"
[4]: https://github.com/getzep/graphiti "Graphiti"
[5]: https://github.com/logseq/logseq "Logseq"
[6]: https://github.com/mozilla/pdf.js "PDF.js"
[7]: https://github.com/learningequality/kolibri "Kolibri"
[8]: https://github.com/meilisearch/meilisearch "Meilisearch"
[9]: https://github.com/novuhq/novu "Novu"
[10]: https://github.com/isuru89/oasis "OASIS"
[11]: https://www.oatutor.io/ "OATutor"
[12]: https://github.com/Halleck45/OpenPronounce "OpenPronounce"
[13]: https://github.com/PaddlePaddle/PaddleSpeech "PaddleSpeech"
[14]: https://openfga.dev/ "OpenFGA"
[15]: https://github.com/nextauthjs/next-auth "Auth.js"
[16]: https://github.com/typesense/typesense "Typesense"
[17]: https://github.com/dexie/Dexie.js "Dexie.js"
[18]: https://github.com/GoogleChrome/workbox "Workbox"
[19]: https://github.com/opensearch-project/OpenSearch "OpenSearch"

# StudyNova UI/UX 改版決策紀錄

## Mode

**Redesign · Preserve**：保留既有產品資訊架構、路由、中文內容、NOVA ID、Novi、Nova 點數與主要學習流程；全面改善視覺層級、導覽效率、狀態回饋、響應式可用性與可及性，但不任意改動後端 API 契約或使用者資料。

## Preserve

- StudyNova AI／Novi 的品牌資產與深色星軌氛圍。
- 既有主要路由、側邊導覽、手機底部導覽與核心入口。
- Dashboard 的資訊範圍：今日建議、目標、讀書計畫、任務、考試、成績、活動、公告、最近成績。
- 表單欄位名稱、送出行為、API 路徑、權限判斷與現有的 reduced-motion 設定。
- 空狀態、載入狀態、錯誤狀態、通知、搜尋、Novi 快捷助手等功能契約。

## Improve

- 全域色彩、邊框、陰影、圓角與間距收斂到一致的 8pt rhythm，降低目前 glass 元件過度堆疊造成的視覺噪音。
- 提高標題／描述／數值的層級差異，讓 Dashboard 首屏先看「今天要做什麼」，再看統計與延伸資訊。
- 強化 CTA 的文字與狀態，補足 focus、hover、disabled、loading、empty、error 的清晰回饋。
- 改善手機版底部導覽與 Novi dock 的空間關係，避免遮擋內容與誤觸。
- 導覽、搜尋、通知、Modal、Tab、表單控制項加入更一致的 aria 標示、鍵盤操作與可見焦點。
- 修正深／淺色主題下文字與表面對比，讓 muted 文字與邊框不過度偏暗。
- 將 emoji 從主要資訊層級退為輔助視覺，避免介面感覺像原型稿；保留必要的品牌個性。
- Dashboard 的卡片與資料列增加可掃讀的分組、狀態色與互動提示，並改善長標題／空資料／錯誤資料的韌性。

## Remove

- 沒有實際互動或沒有導向的純裝飾性資訊表現。
- 重複且過強的玻璃效果、過度發光、低資訊價值的動效。
- 依賴單一 emoji 才能理解功能的表達方式；改以文字、狀態與一致的 icon-like badge 組合。

## Protected contracts

- 不更換既有路由與主要導覽 label。
- 不更換品牌 Logo、Wordmark、Novi 資產。
- 不更動表單 field name、欄位順序、提交行為、API endpoint 或後端資料格式。
- 不改動隱私、條款、權限、點數、通知與登入流程的產品語意。
- 不刪除既有 accessibility 與 reduced-motion 支援。

## Design Read + dials

```yaml
artifact: authenticated learning dashboard + shared app shell
 audience: 台灣國中、高中生；需要快速知道今天要做什麼，也要能低摩擦回到錯題、單字與 AI
visual-language: cosmic study command center；深色 navy base、violet/cyan focus、warm gold reward，採克制的 glass surfaces
mode: preserve
visual-variance: 4/10
motion-intensity: 3/10
information-density: 7/10
asset-dependence: 7/10
brand-fidelity: 9/10
```

## Positioning questions

- **Narrative role**：Dashboard 是每日行動入口，首屏應先呈現 Novi 的今日建議與一個明確主行動。
- **Viewing distance**：手機 10cm、筆電 1m；需支援窄螢幕單手操作與桌面快速掃讀。
- **Visual temperature**：鼓勵、清楚、有能量，但不使用持續高亮或過度炫技干擾學習。
- **Capacity check**：Dashboard 保留高密度資料，但採「一個 hero + 四個 stats + 兩欄任務」分段，讓每張卡片只承擔一個決策。

## Design Decisions

- **Color palette**：背景 `#070B18` / surface `#0F1830` / elevated `#15213F`；primary violet `#8B72FF`；focus cyan `#42D9FF`；reward gold `#FFC857`；text `#F1F4FF`；muted `#A8B4D6`。維持深色品牌，提升 body、muted、focus 的對比。
- **Typography**：沿用系統 sans fallback，標題使用更明確的 display weight；body 15px、small 13px、caption 12px；數值使用 tabular numerals。
- **Spacing**：8pt base，常用 8/12/16/24/32；卡片內距桌面 20px、手機 16px；頁面 column gap 16px。
- **Border-radius**：主要卡片 20px、控制項 12px、狀態 badge full-pill；避免每一層都使用不同的大圓角。
- **Shadow hierarchy**：一般卡片使用低對比 shadow；floating Novi／Modal 才使用較深的 elevation；減少整頁 blur 疊加。
- **Motion style**：保留入場與重要狀態變更，採 180–420ms ease-out；避免自動 marquee 與持續性的非必要動畫在 reduced-motion 之外持續搶焦點。

## Highest-risk change

共用 UI primitives 與 AppShell 會影響大部分頁面；先以向後相容的 class/token 與 aria 補強，避免修改元件公開 props 或各頁資料契約。

## Rollback / fallback

所有程式修改前保留 Git diff；若某個頁面因 class 或 CSS token 造成回歸，優先回退該區塊，保留不具破壞性的可及性與 loading/error 修正。

## First implementation batch

1. 全域 tokens、surface、focus、scroll、safe-area 與 motion。
2. 共用 Button、Card、Stat、Input、Modal、Tabs、Toast。
3. AppShell 的 desktop/mobile navigation、搜尋結果與通知可掃讀性。
4. Dashboard 首屏層級、主 CTA、目標／任務／成績區塊與響應式間距。
5. 執行 lint、typecheck、build，確認 Git diff 後推送至 `roy445/StudyNova`。

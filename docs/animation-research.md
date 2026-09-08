# StudyNova 動畫與 Loading 方案研究

## 結論

StudyNova 採用 **Motion Primitives 的逐元件 source-copy** 作為主要互動動畫參考，不整套引入上游專案。原因是它與 React、Next.js、Tailwind CSS 相容，且可直接修改原始碼以接入既有 StudyNova design tokens。核心學習流程僅使用 opacity、transform、短 transition、進入視窗觸發與進度回饋；閱讀、測驗與內容密集頁面不使用持續背景、粒子或 hover-only 動畫。

| 方案 | License | 技術與相容性 | 效能與手機 | StudyNova 決策 |
|---|---|---|---|---|
| Motion Primitives | MIT；需保留 copyright 與 license notice | React/Next/Tailwind；source-copy，可逐元件客製 | 可使用 `m` + `LazyMotion`、dynamic import 控制初始 bundle；cursor、tilt 等觸控需降級 | **首選**：受控互動層 |
| Magic UI | MIT；仍須盤點所選元件及第三方依賴 | React/Next/Tailwind；shadcn-style registry/copy-paste | copy-paste 可避免整庫，但 particles、blur、SVG、ResizeObserver 需實機量測 | 次選：少量品牌視覺與非核心頁面 |
| Aceternity UI | 公開 GitHub license 無法驗證；Pro 有 End Product 與 template/marketplace 限制 | React/Next/Tailwind；元件可拷貝 | aurora、parallax、canvas/WebGL、infinite loop 可能增加 GPU/paint/電量成本 | 不納入核心；僅在取得書面授權後用於 marketing |

## 整合原則

1. 保留既有 StudyNova tokens、spacing、typography、focus ring 與元件 API；動畫只能透過內部 wrapper 導入，不覆蓋既有 globals.css。
2. Server Components 優先；只有 hooks、browser API 或互動動畫使用最小 `use client` subtree。非首屏元件使用 lazy mount/dynamic import。
3. 動畫分級：核心學習頁只使用低幅度 opacity/transform、進度、章節切換與一次性 in-view；避免大量同時 mount、長時間 shimmer、canvas/WebGL 與無限粒子。
4. 手機上停用或改寫 cursor-following、Magnetic、Tilt、Spotlight 等滑鼠效果；hover 不得是唯一資訊入口。
5. `prefers-reduced-motion: reduce` 與低階裝置都必須有不依賴動畫的完整內容與操作狀態。
6. 每個第三方元件記錄來源 URL、上游 commit、license、copyright、依賴與本地修改；不複製整個展示站或未使用依賴。

## 官方來源

- [Motion Primitives GitHub](https://github.com/ibelick/motion-primitives)
- [Motion Primitives License](https://raw.githubusercontent.com/ibelick/motion-primitives/main/LICENCE.md)
- [Motion for React bundle size](https://motion.dev/docs/react-reduce-bundle-size)
- [Magic UI GitHub](https://github.com/magicuidesign/magicui)
- [Magic UI License](https://raw.githubusercontent.com/magicuidesign/magicui/main/LICENSE.md)
- [Aceternity UI](https://ui.aceternity.com/)
- [Aceternity UI License](https://ui.aceternity.com/licence)

## 本次落地

本次保留既有動畫語言，補充全站 `loading.tsx` route-level skeleton、統一 motion timing tokens、button/link active feedback、`prefers-reduced-motion` 規則，以及教材頁面的 loading/error/empty 狀態。未引入大型動畫 runtime，避免增加核心學習頁 bundle。

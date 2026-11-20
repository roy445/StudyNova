"use client";
import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { notFound } from "next/navigation";
import { apiPost, useApi } from "@/lib/api";
import { Button, Card, Input } from "@/components/ui";
import { learningCurriculum, type Lesson } from "@/content/learning/ch1";
import { Bio3DViewer, type BioModelType } from "@/components/Bio3DViewer";

type QuizQuestion = { stem: string; options: string[]; answer: number; explanation: string; kind: "隨堂" | "素養" };

function InteractiveModule({ lesson }: { lesson: Lesson }) {
  const [selected, setSelected] = useState<string | null>(null);
  const kind = lesson.interactive;
  if (kind === "classification") return <div className="grid gap-3 sm:grid-cols-3">{["純物質", "混合物", "分離方法"].map((label) => <button type="button" key={label} onClick={() => setSelected(label)} className={`rounded-2xl border p-4 text-left transition ${selected === label ? "border-cyan-300 bg-cyan-300/10" : "border-[var(--line)] bg-white/[0.03] hover:border-cyan-300/40"}`}><span className="text-lg">{label === "純物質" ? "◇" : label === "混合物" ? "◈" : "⚗"}</span><p className="mt-2 font-semibold">{label}</p><p className="mt-1 text-xs text-muted">{lesson.concepts.find((item) => item.includes(label.replace("分離方法", "分離"))) ?? "點選查看概念"}</p></button>)}</div>;
  if (kind === "logarithm") return <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.04] p-5"><p className="font-semibold">對數概念快篩</p><p className="mt-2 text-sm leading-6 text-muted">點選一個式子，觀察它如何在指數式與對數式之間轉換。</p><div className="mt-4 grid gap-2 sm:grid-cols-2">{["10³=1000 ⇔ log 1000=3", "10ˣ=6 ⇔ x=log 6", "10ˡᵒᵍ 12=12", "pH=−log[H⁺]"].map((item) => <button type="button" key={item} onClick={() => setSelected(item)} className={`rounded-xl border p-3 text-left text-sm transition ${selected === item ? "border-cyan-300 bg-cyan-300/10" : "border-[var(--line)] hover:border-cyan-300/40"}`}>{item}</button>)}</div>{selected && <p className="mt-4 rounded-xl bg-white/5 p-3 text-sm leading-6 text-cyan-100">已選：{selected}。先確認定義，再決定是否需要計算機近似。</p>}</div>;
  if (kind === "atoms") return <div className="rounded-2xl border border-violet-300/20 bg-violet-300/[0.05] p-5"><div className="flex flex-wrap gap-2">{["Thomson", "Rutherford", "Bohr", "現代模型"].map((model) => <button type="button" key={model} onClick={() => setSelected(model)} className={`rounded-full px-3 py-1.5 text-xs ${selected === model ? "bg-violet-300 text-slate-950" : "bg-white/5 text-muted"}`}>{model}</button>)}</div><div className="mx-auto mt-5 grid h-36 w-36 place-items-center rounded-full border border-violet-200/40"><span className="text-2xl">＋</span></div><p className="mt-4 text-center text-sm text-muted">{selected ? `目前模型：${selected}。模型是用來解釋證據的工具。` : "選擇模型開始比較。"}</p></div>;
  if (kind === "heat") return <div className="rounded-2xl border border-orange-300/20 bg-orange-300/[0.05] p-5"><p className="font-semibold">熱學判斷器</p><p className="mt-2 text-sm leading-6 text-muted">選一個情境，判斷主要的熱學概念，再對照說明。</p><div className="mt-4 grid gap-2 sm:grid-cols-2">{[{ label: "冰塊正在融化", answer: "潛熱：吸收熱量但溫度可維持不變" }, { label: "太陽曬熱地面", answer: "輻射：能量以電磁波穿過空間" }, { label: "鍋中的水循環", answer: "對流：流體因密度差上下移動" }, { label: "金屬鍋柄變熱", answer: "傳導：能量透過相鄰粒子傳遞" }].map((item) => <button type="button" key={item.label} onClick={() => setSelected(item.label)} className={`rounded-xl border p-3 text-left text-sm transition ${selected === item.label ? "border-orange-200 bg-orange-200/10" : "border-[var(--line)] hover:border-orange-200/40"}`}><span className="font-semibold">{item.label}</span>{selected === item.label && <p className="mt-2 text-xs leading-5 text-orange-100">{item.answer}</p>}</button>)}</div></div>;
  if (kind === "history") {
    const stages = [
      { label: "分類", detail: "誰命名、如何分類，會影響族群身分與權利。" },
      { label: "治理", detail: "貿易、軍事、劃界、教化與調查把部落納入政權。" },
      { label: "土地", detail: "拓墾、開山、開發與遷移改變生活空間與資源分配。" },
      { label: "行動", detail: "正名、原權與部落運動把歷史經驗轉成公共訴求。" },
    ];
    return <div className="rounded-2xl border border-amber-200/20 bg-amber-200/[0.04] p-5"><p className="font-semibold">歷史分析四步驟</p><p className="mt-2 text-sm leading-6 text-muted">依序點選，練習從教材的事件整理出「制度 → 土地 → 社會 → 行動」的因果鏈。</p><div className="mt-4 grid gap-2 sm:grid-cols-4">{stages.map((stage, index) => <button type="button" key={stage.label} onClick={() => setSelected(stage.label)} className={`rounded-xl border p-3 text-left transition ${selected === stage.label ? "border-amber-200 bg-amber-200/10" : "border-[var(--line)] hover:border-amber-200/50"}`}><span className="text-xs text-amber-200">0{index + 1}</span><p className="mt-1 font-semibold">{stage.label}</p><p className="mt-2 text-xs leading-5 text-muted">{stage.detail}</p></button>)}</div>{selected && <p className="mt-4 rounded-xl bg-white/5 p-3 text-sm leading-6 text-amber-100">目前焦點：{selected}。不要只背事件名稱，請繼續追問它影響了誰、改變了什麼，以及哪些人提出回應。</p>}</div>;
  }
  if (kind === "states") return <div className="grid gap-4 sm:grid-cols-3">{["固態", "液態", "氣態"].map((label, index) => <button type="button" key={label} onClick={() => setSelected(label)} className={`rounded-2xl border p-4 text-left ${selected === label ? "border-cyan-300" : "border-[var(--line)]"}`}><p className="font-bold">{label}</p><p className="mt-2 text-xs text-muted">{index === 0 ? "形狀、體積固定" : index === 1 ? "體積固定，形狀隨容器" : "形狀與體積皆不固定"}</p><div className="mt-4 flex flex-wrap gap-2">{Array.from({ length: index === 0 ? 9 : 6 }).map((_, i) => <span key={i} className="h-2 w-2 rounded-full bg-cyan-200" />)}</div></button>)}</div>;
  if (kind === "biology-cell") {
    const organelles = [
      { name: "粒線體", membrane: "雙層膜", feature: "有氧呼吸產生 ATP，細胞能量工廠；含自身環狀 DNA 與核糖體，屬母系遺傳半自主胞器。" },
      { name: "葉綠體", membrane: "雙層膜", feature: "光合作用場所，內含葉綠囊（光反應）與基質（碳反應）；含自身環狀 DNA，植物與藻類特有。" },
      { name: "內質網", membrane: "單層膜", feature: "粗糙型（附著核糖體）合成修飾蛋白質；平滑型（無核糖體）合成脂質、解毒與儲存鈣離子。" },
      { name: "高基氏體", membrane: "單層膜", feature: "數個扁囊組成，細胞分泌中心；修飾、分類、包裝蛋白質並形成囊泡運送至細胞內外。" },
      { name: "溶體", membrane: "單層膜", feature: "含多種酸性水解酵素，負責胞內消化、分解吞入的病原體以及老化胞器的自噬更新。" },
      { name: "液泡/液胞", membrane: "單層膜", feature: "植物具中央大型液泡維持形狀與膨壓；動物為多個小液泡；草履蟲具伸縮泡排出多餘水分。" },
      { name: "核糖體", membrane: "無膜構造", feature: "由 rRNA 與蛋白質組成，蛋白質合成的工廠；原核與真核細胞皆具有。" },
      { name: "中心粒", membrane: "無膜構造", feature: "由 9 束三聯微管組成，與動物細胞分裂紡錘絲形成有關；高等種子植物缺乏中心粒。" },
    ];
    const current = organelles.find((o) => o.name === selected) ?? organelles[0];
    return <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.04] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-300/20 pb-3">
        <p className="font-semibold text-emerald-200">🔬 細胞胞器膜系與功能快篩</p>
        <span className="text-xs text-muted">點選胞器查看膜層數與考點</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {organelles.map((item) => (
          <button type="button" key={item.name} onClick={() => setSelected(item.name)} className={`rounded-xl border p-3 text-left transition ${selected === item.name || (!selected && item.name === "粒線體") ? "border-emerald-300 bg-emerald-300/15 text-emerald-100" : "border-[var(--line)] bg-white/[0.02] hover:border-emerald-300/40"}`}>
            <p className="text-sm font-bold">{item.name}</p>
            <p className="mt-1 text-xs text-muted">{item.membrane}</p>
          </button>
        ))}
      </div>
      <div className="mt-4 rounded-xl border border-emerald-200/20 bg-black/20 p-4">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-emerald-400/20 px-2 py-0.5 text-xs font-semibold text-emerald-300">{current.membrane}</span>
          <span className="text-base font-bold text-white">{current.name}</span>
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-200">{current.feature}</p>
      </div>
    </div>;
  }
  if (kind === "biology-transport") {
    const transportModes = [
      { name: "簡單擴散", energy: "不耗能 (順梯度)", carrier: "不需要膜蛋白", example: "O₂、CO₂、甘油、脂肪酸等脂溶性或非極性小分子直接穿過磷脂雙層。" },
      { name: "促進性擴散", energy: "不耗能 (順梯度)", carrier: "需通道蛋白 / 載體蛋白", example: "葡萄糖、胺基酸、離子（Na⁺、K⁺、Ca²⁺）及大量水分子（水通道蛋白）。" },
      { name: "滲透作用", energy: "不耗能 (物理擴散)", carrier: "水分子跨半透膜", example: "水分自低滲透壓向高滲透壓流動；高張液中動物血球萎縮、植物原生質分離。" },
      { name: "主動運輸", energy: "消耗 ATP (逆梯度)", carrier: "必須專一性運輸蛋白", example: "海帶逆濃度吸收碘離子、小腸吸收葡萄糖、植物根毛吸收土壤無機鹽。" },
    ];
    const current = transportModes.find((m) => m.name === selected) ?? transportModes[0];
    return <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.04] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cyan-300/20 pb-3">
        <p className="font-semibold text-cyan-200">⚡ 跨膜運輸機制對比器</p>
        <span className="text-xs text-muted">比較耗能條件與運輸受質</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {transportModes.map((item) => (
          <button type="button" key={item.name} onClick={() => setSelected(item.name)} className={`rounded-xl border p-3 text-left transition ${selected === item.name || (!selected && item.name === "簡單擴散") ? "border-cyan-300 bg-cyan-300/15 text-cyan-100" : "border-[var(--line)] bg-white/[0.02] hover:border-cyan-300/40"}`}>
            <p className="text-sm font-bold">{item.name}</p>
            <p className="mt-1 text-xs text-muted">{item.energy.split(" ")[0]}</p>
          </button>
        ))}
      </div>
      <div className="mt-4 space-y-2 rounded-xl border border-cyan-200/20 bg-black/20 p-4 text-sm">
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded bg-cyan-400/20 px-2 py-0.5 text-cyan-200">{current.energy}</span>
          <span className="rounded bg-violet-400/20 px-2 py-0.5 text-violet-200">{current.carrier}</span>
        </div>
        <p className="mt-2 text-slate-200">{current.example}</p>
      </div>
    </div>;
  }
  if (kind === "biology-energy") {
    const energyModes = [
      { name: "光反應", place: "葉綠體・類囊體膜", equation: "H₂O ＋ ADP ＋ NADP⁺ ➔ O₂ ＋ ATP ＋ NADPH", tip: "葉綠素吸光裂解水分子釋放氧氣，產生高能同化力 ATP 與 NADPH。" },
      { name: "碳反應", place: "葉綠體・基質", equation: "CO₂ ＋ ATP ＋ NADPH ➔ 葡萄糖 ＋ ADP ＋ NADP⁺", tip: "利用光反應提供的 ATP 與 NADPH 還原 CO₂ 合成三碳醣，再組成葡萄糖。" },
      { name: "有氧呼吸", place: "細胞質 ＋ 粒線體", equation: "C₆H₁₂O₆ ＋ 6 O₂ ➔ 6 CO₂ ＋ 6 H₂O ＋ 36~38 ATP", tip: "糖解(質) ➔ 檸檬酸循環(基質) ➔ 電子傳遞鏈(內膜)，完全氧化產能效率最高。" },
      { name: "酒精醱酵", place: "細胞質 (缺氧)", equation: "C₆H₁₂O₆ ➔ 2 乙醇 ＋ 2 CO₂ ＋ 2 ATP", tip: "酵母菌或植物缺氧根部進行；不消耗氧氣，產生二氧化碳氣體與酒精。" },
      { name: "乳酸醱酵", place: "細胞質 (缺氧)", equation: "C₆H₁₂O₆ ➔ 2 乳酸 ＋ 2 ATP", tip: "人體劇烈運動時骨骼肌細胞、乳酸菌進行；不產生 CO₂，累積乳酸造成肌肉痠痛。" },
    ];
    const current = energyModes.find((m) => m.name === selected) ?? energyModes[0];
    return <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.04] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-300/20 pb-3">
        <p className="font-semibold text-amber-200">☀️ 代謝產能與反應路徑對照</p>
        <span className="text-xs text-muted">點選路徑比對化學式與場所</span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {energyModes.map((item) => (
          <button type="button" key={item.name} onClick={() => setSelected(item.name)} className={`rounded-xl border px-3 py-2 text-left transition ${selected === item.name || (!selected && item.name === "光反應") ? "border-amber-300 bg-amber-300/15 text-amber-100" : "border-[var(--line)] bg-white/[0.02] hover:border-amber-300/40"}`}>
            <span className="text-sm font-bold">{item.name}</span>
          </button>
        ))}
      </div>
      <div className="mt-4 space-y-2 rounded-xl border border-amber-200/20 bg-black/20 p-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="rounded bg-amber-400/20 px-2 py-0.5 text-xs text-amber-200">{current.place}</span>
          <span className="font-mono text-xs text-amber-100">{current.equation}</span>
        </div>
        <p className="mt-2 text-slate-200">{current.tip}</p>
      </div>
    </div>;
  }
  if (kind === "biology-division") {
    const divisionModes = [
      { name: "有絲分裂", type: "體細胞", copies: "DNA複製 1 次，分裂 1 次", ploidy: "2n ➔ 2n (產生 2 個同質子細胞)", key: "中期染色體排列赤道板；後期著絲點分開，姊妹染色分體分離；無聯會與四分體。" },
      { name: "第一減數分裂", type: "生殖母細胞", copies: "複製 1 次，同源染色體分離", ploidy: "2n ➔ n (染色體數減半)", key: "前期同源染色體聯會形成四分體（發生互換）；後期同源染色體分開向兩極移動。" },
      { name: "第二減數分裂", type: "次級生殖細胞", copies: "不進行 DNA 複製，分裂 1 次", ploidy: "n ➔ n (最終產生 4 個單套細胞)", key: "後期著絲點分開，姊妹染色分體互相分離，產生 4 個單倍體配子。" },
    ];
    const current = divisionModes.find((m) => m.name === selected) ?? divisionModes[0];
    return <div className="rounded-2xl border border-rose-300/20 bg-rose-300/[0.04] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rose-300/20 pb-3">
        <p className="font-semibold text-rose-200">🧬 細胞分裂與染色體行為判斷器</p>
        <span className="text-xs text-muted">比較染色體套數與分離行為</span>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {divisionModes.map((item) => (
          <button type="button" key={item.name} onClick={() => setSelected(item.name)} className={`rounded-xl border p-3 text-left transition ${selected === item.name || (!selected && item.name === "有絲分裂") ? "border-rose-300 bg-rose-300/15 text-rose-100" : "border-[var(--line)] bg-white/[0.02] hover:border-rose-300/40"}`}>
            <p className="text-sm font-bold">{item.name}</p>
            <p className="mt-1 text-xs text-muted">{item.type}</p>
          </button>
        ))}
      </div>
      <div className="mt-4 space-y-2 rounded-xl border border-rose-200/20 bg-black/20 p-4 text-sm">
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded bg-rose-400/20 px-2 py-0.5 text-rose-200">{current.copies}</span>
          <span className="rounded bg-cyan-400/20 px-2 py-0.5 text-cyan-200">{current.ploidy}</span>
        </div>
        <p className="mt-2 text-slate-200">{current.key}</p>
      </div>
    </div>;
  }
  return <div className="rounded-2xl border border-amber-200/20 bg-amber-200/[0.04] p-5"><p className="font-semibold">Lewis 電子點式練習</p><div className="mt-5 flex justify-center gap-3"><button type="button" onClick={() => setSelected("Na⁺")} className={`grid h-20 w-20 place-items-center rounded-2xl border text-xl ${selected === "Na⁺" ? "border-cyan-300 bg-cyan-300/10" : "border-[var(--line)]"}`}>Na⁺</button><span className="self-center text-2xl">＋</span><button type="button" onClick={() => setSelected("Cl⁻")} className={`grid h-20 w-20 place-items-center rounded-2xl border text-xl ${selected === "Cl⁻" ? "border-cyan-300 bg-cyan-300/10" : "border-[var(--line)]"}`}>Cl⁻</button></div><p className="mt-4 text-center text-sm text-muted">{selected ? `已選擇 ${selected}：相反電荷粒子之間形成靜電吸引。` : "點選離子觀察鍵結概念。"}</p></div>;
}

function fallbackQuestions(lesson: Lesson, count: number, kind: "隨堂" | "素養"): QuizQuestion[] {
  const templates = [
    { stem: `根據「${lesson.concepts[0]}」的定義，下列哪個敘述最正確？`, options: [lesson.comparisons[0]?.left ?? "組成固定", lesson.comparisons[0]?.right ?? "組成可變", "兩者完全相同", "無法用任何方式判斷"], answer: 0 },
    { stem: `學習「${lesson.title}」時，最容易忽略的重點是什麼？`, options: [lesson.commonErrors[0] ?? "先確認定義", lesson.formulas[0] ?? "直接背答案", "只看題目外觀", "忽略單位與條件"], answer: 0 },
    { stem: `下列哪一項最能應用本節的核心概念？`, options: [lesson.details[0]?.example ?? lesson.summary, lesson.details[1]?.example ?? "只靠記憶", "不需要觀察條件", "所有物質性質都相同"], answer: 0 },
    { stem: `要解決相關題目，第一步應該做什麼？`, options: ["辨認題目給的粒子、性質或數量", "先猜最長的選項", "先套用所有公式", "跳過單位檢查"], answer: 0 },
    { stem: `下列哪個比較可以避免本節常見混淆？`, options: [lesson.comparisons[Math.min(1, lesson.comparisons.length - 1)]?.label ?? "先定義再比較", "把所有名詞視為同義", "只看數字不看情境", "忽略物質組成"], answer: 0 },
  ];
  return Array.from({ length: count }, (_, index) => { const item = templates[index % templates.length]; return { ...item, kind, explanation: index % 2 === 0 ? lesson.details[index % lesson.details.length]?.body ?? lesson.quiz.explanation : lesson.quiz.explanation }; });
}

export default function LessonPage({ params }: { params: Promise<{ subject: string; chapter: string; lesson: string }> }) {
  const routeParams = use(params);
  const curriculum = learningCurriculum[routeParams.subject as keyof typeof learningCurriculum];
  const currentChapter = useMemo(() => { if (!curriculum) return undefined; return "chapters" in curriculum ? curriculum.chapters.find((item) => item.slug === routeParams.chapter) : curriculum.chapter.slug === routeParams.chapter ? curriculum.chapter : undefined; }, [curriculum, routeParams.chapter]);
  const chapterLessons: Lesson[] | undefined = currentChapter && "lessons" in currentChapter ? currentChapter.lessons : curriculum?.lessons;
  const lesson = useMemo(() => chapterLessons?.find((item) => item.slug === routeParams.lesson), [chapterLessons, routeParams.lesson]);
  const [spoken, setSpoken] = useState(false);
  const [choice, setChoice] = useState<number | null>(null);
  const [completed, setCompleted] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(0);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [quizBusy, setQuizBusy] = useState(false);
  const [quizMode, setQuizMode] = useState<"隨堂" | "素養" | null>(null);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizChoice, setQuizChoice] = useState<number | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const membership = useApi<{ isPro: boolean }>("/membership");
  const isPro = Boolean(membership.data?.isPro);

  const subjectAiPlaceholders: Record<string, string> = {
    biology: "例如：為什麼光反應產生的 ATP 不能直接供細胞質使用？",
    chemistry: "例如：純物質與混合物在加熱曲線上的主要差異是什麼？",
    physics: "例如：為什麼合力為零時物體動量一定守恆？",
    history: "例如：這次制度變革對原住民土地權利有何長遠影響？",
    math: "例如：對數首數與尾數的幾何意義與圖形特徵是什麼？",
  };
  const aiPlaceholder = subjectAiPlaceholders[routeParams.subject] ?? "例如：這個觀念在考試時常怎麼考？";

  const defaultBioModel: BioModelType =
    routeParams.lesson === "cell-division"
      ? "dna"
      : routeParams.lesson === "cell-energy"
      ? "chloroplast"
      : routeParams.lesson === "cell-structure"
      ? "mitochondria"
      : "membrane";
  const [bioModel, setBioModel] = useState<BioModelType>(defaultBioModel);

  // Hydrate client-only completion state after the lesson is available.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (lesson) setCompleted(window.localStorage.getItem(`studynova:lesson:${lesson.slug}:completed`) === "1"); }, [lesson]);
  if (!curriculum || !currentChapter || !lesson) return notFound();
  const stopSpeaking = () => { if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel(); setSpoken(false); };
  const speak = () => { if (spoken) return stopSpeaking(); if (typeof window === "undefined" || !("speechSynthesis" in window)) return; const u = new SpeechSynthesisUtterance(`${lesson.title}。${lesson.summary}。${lesson.details.map((item) => `${item.title}。${item.body}`).join("。")}`); u.lang = "zh-TW"; u.rate = 1; u.onend = () => setSpoken(false); window.speechSynthesis.cancel(); window.speechSynthesis.speak(u); setSpoken(true); };
  const markComplete = () => { const next = !completed; setCompleted(next); window.localStorage.setItem(`studynova:lesson:${lesson.slug}:completed`, next ? "1" : "0"); };
  const askModel = async (message: string, featureKey: "learning_ai_chat" | "learning_ai_question_generation") => { let id = conversationId; if (!id) { const created = await apiPost<{ conversation: { id: string } }>("/ai/conversations", { title: `${currentChapter.title}・${lesson.title}`, mode: "teacher", allowContext: [] }); id = created.conversation.id; setConversationId(id); } const res = await apiPost<{ message: { content: string } }>(`/ai/conversations/${id}/messages`, { content: message, featureKey }); return res.message.content; };
  const askAi = async () => { if (!question.trim()) return; setAiBusy(true); setAnswer(""); try { const reply = await askModel(`只根據以下教材回答學生問題，若資料不足請明說。課程：${lesson.title}。摘要：${lesson.summary}。詳細內容：${lesson.details.map((x) => `${x.title}：${x.body}`).join("；")}。學生問題：${question}`, "learning_ai_chat"); setAnswer(reply); } catch (error) { setAnswer(error instanceof Error ? error.message : "AI 暫時無法回答，請稍後再試。"); } finally { setAiBusy(false); } };
  const generateQuiz = async (kind: "隨堂" | "素養") => { const count = kind === "隨堂" ? 5 : 10; setQuizBusy(true); setQuizMode(kind); setQuizIndex(0); setQuizChoice(null); try { const reply = await askModel(`請根據以下高中教材出 ${count} 題${kind}單選題。只回傳 JSON 陣列，每題格式 {"stem":string,"options":string[],"answer":number,"explanation":string}，answer 為 0 到 3。不要捏造教材外資料。教材：${lesson.title}；${lesson.summary}；${lesson.details.map((x) => `${x.title}：${x.body}`).join("；")}`, "learning_ai_question_generation"); const raw = reply.match(/\[[\s\S]*\]/)?.[0]; const parsed = raw ? JSON.parse(raw) : null; if (Array.isArray(parsed) && parsed.length) setQuizQuestions(parsed.slice(0, count).map((item) => ({ ...item, kind }))); else setQuizQuestions(fallbackQuestions(lesson, count, kind)); } catch { setQuizQuestions(fallbackQuestions(lesson, count, kind)); } finally { setQuizBusy(false); } };
  const currentQuiz = quizQuestions[quizIndex];

  return (
    <div className="min-w-0 max-w-full space-y-5 overflow-x-clip pb-24">
      {/* 網頁互動介面（列印時徹底隱藏） */}
      <div className="space-y-5 print:hidden">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <Link href={`/learning/${routeParams.subject}/${routeParams.chapter}`} className="text-xs text-cyan-200 hover:underline">
            ← 課程總覽
          </Link>
          <div className="flex min-w-0 flex-wrap gap-2">
            <span className="rounded-xl border border-[var(--line)] px-3 py-2 text-xs text-muted">第 {lesson.number} 節</span>
            <Button size="sm" variant="outline" onClick={() => window.print()}>
              📄 下載／列印章節重點教材 PDF
            </Button>
          </div>
        </div>

        <header className="min-w-0 max-w-full overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-gradient-to-br from-cyan-300/[0.1] to-violet-300/[0.05] p-4 sm:p-8">
          <p className="text-xs font-semibold tracking-[.25em] text-cyan-200">LESSON {lesson.number}</p>
          <h1 className="mt-3 break-words text-3xl font-black">{lesson.title}</h1>
          <p className="mt-4 max-w-3xl break-words text-sm leading-7 text-muted [overflow-wrap:anywhere]">{lesson.summary}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button size="sm" onClick={speak}>{spoken ? "■ 停止朗讀" : "🔊 開始朗讀"}</Button>
            <Button size="sm" variant={completed ? "outline" : "ghost"} onClick={markComplete}>{completed ? "✓ 已完成（取消記號）" : "○ 標記本節完成"}</Button>
            <span className="rounded-xl border border-[var(--line)] px-3 py-2 text-xs text-muted">預估 {lesson.minutes} 分鐘</span>
          </div>
        </header>

        <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,.85fr)]">
          <main className="min-w-0 space-y-5">
            <Card className="min-w-0 max-w-full" title="① 詳細知識導讀" subtitle="每個知識點都可以展開查看定義、推理與具體例子。">
              <div className="min-w-0 space-y-2">
                {lesson.details.map((detail, index) => (
                  <div key={detail.title} className="min-w-0 overflow-hidden rounded-2xl border border-[var(--line)]">
                    <button type="button" className="flex w-full min-w-0 items-start justify-between gap-3 p-4 text-left font-semibold" onClick={() => setExpanded(expanded === index ? null : index)}>
                      <span className="min-w-0 break-words [overflow-wrap:anywhere]">{index + 1}. {detail.title}</span>
                      <span className="shrink-0 text-cyan-200">{expanded === index ? "−" : "+"}</span>
                    </button>
                    {expanded === index && (
                      <div className="min-w-0 border-t border-[var(--line)] bg-white/[0.025] p-4 text-sm leading-7">
                        <p className="break-words [overflow-wrap:anywhere]">{detail.body}</p>
                        <p className="mt-3 break-words rounded-xl border border-amber-200/20 bg-amber-200/[0.05] p-3 text-amber-100 [overflow-wrap:anywhere]">
                          <strong>例子：</strong>{detail.example}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>

            <Card className="min-w-0 max-w-full" title="② 互動教學與 3D 解剖模型" subtitle="請操作模型，把抽象概念轉成可觀察的立體判斷。">
              <InteractiveModule lesson={lesson} />
              {routeParams.subject === "biology" && (
                <div className="mt-5 border-t border-[var(--line)] pt-5">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-cyan-200">🔬 3D 解剖模型切換：</p>
                    <div className="flex flex-wrap gap-1">
                      {(["dna", "mitochondria", "membrane", "chloroplast"] as const).map((m) => (
                        <button
                          type="button"
                          key={m}
                          onClick={() => setBioModel(m)}
                          className={`rounded-lg px-2.5 py-1 text-xs transition ${
                            bioModel === m
                              ? "bg-cyan-300/20 text-cyan-200 border border-cyan-300/50"
                              : "bg-white/5 text-muted hover:text-white"
                          }`}
                        >
                          {m === "dna" ? "🧬 DNA" : m === "mitochondria" ? "⚡ 粒線體" : m === "membrane" ? "🌊 細胞膜" : "🍃 葉綠體"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Bio3DViewer modelType={bioModel} isPro={isPro} />
                </div>
              )}
            </Card>

            <Card className="min-w-0 max-w-full" title="③ 公式與比較表">
              <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                {lesson.formulas.map((formula) => (
                  <div key={formula} className="min-w-0 break-words rounded-xl border border-amber-200/20 bg-amber-200/[0.05] p-4 font-mono text-sm text-amber-100 [overflow-wrap:anywhere]">
                    {formula}
                  </div>
                ))}
              </div>
              <div className="mt-5 min-w-0 overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--line)]">
                      <th className="p-3">比較項目</th>
                      <th className="p-3 text-cyan-200">左側</th>
                      <th className="p-3 text-violet-200">右側</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lesson.comparisons.map((item) => (
                      <tr key={item.label} className="border-b border-[var(--line)]">
                        <td className="p-3 font-semibold">{item.label}</td>
                        <td className="p-3 text-muted">{item.left}</td>
                        <td className="p-3 text-muted">{item.right}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card className="min-w-0 max-w-full" title="④ AI 出題">
              <p className="break-words text-sm leading-6 text-muted [overflow-wrap:anywhere]">
                AI 只根據本節教材出題；若 AI 回傳格式不完整，系統會使用同一教材的保底題組，不會顯示空白題目。
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button loading={quizBusy && quizMode === "隨堂"} onClick={() => void generateQuiz("隨堂")}>
                  生成隨堂 5 題
                </Button>
                <Button loading={quizBusy && quizMode === "素養"} variant="outline" onClick={() => void generateQuiz("素養")}>
                  生成素養 10 題
                </Button>
              </div>
              {quizMode && quizQuestions.length > 0 && currentQuiz && (
                <div className="mt-4 min-w-0 rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.04] p-4">
                  <div className="flex justify-between text-xs text-muted">
                    <span>{quizMode}題組</span>
                    <span>{quizIndex + 1} / {quizQuestions.length}</span>
                  </div>
                  <p className="mt-3 break-words font-semibold leading-7 [overflow-wrap:anywhere]">{currentQuiz.stem}</p>
                  <div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-2">
                    {currentQuiz.options.map((option, index) => (
                      <button
                        type="button"
                        key={option}
                        onClick={() => setQuizChoice(index)}
                        className={`min-w-0 break-words rounded-xl border p-3 text-left text-sm [overflow-wrap:anywhere] ${
                          quizChoice === index
                            ? index === currentQuiz.answer
                              ? "border-emerald-300 bg-emerald-300/10"
                              : "border-rose-300 bg-rose-300/10"
                            : "border-[var(--line)] hover:border-cyan-300/40"
                        }`}
                      >
                        {String.fromCharCode(65 + index)}. {option}
                      </button>
                    ))}
                  </div>
                  {quizChoice !== null && (
                    <div className="mt-3 min-w-0 rounded-xl bg-white/5 p-3 text-xs leading-5">
                      <strong>{quizChoice === currentQuiz.answer ? "答對了！" : "需要補強。"}</strong>
                      <p className="mt-1 break-words [overflow-wrap:anywhere]">{currentQuiz.explanation}</p>
                      <Button size="sm" className="mt-3" onClick={() => { setQuizIndex((index) => Math.min(index + 1, quizQuestions.length - 1)); setQuizChoice(null); }}>
                        {quizIndex === quizQuestions.length - 1 ? "完成題組" : "下一題"}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </Card>
          </main>

          <aside className="min-w-0 space-y-5">
            <Card className="min-w-0 max-w-full" title="⑤ 隨時問 AI" subtitle="可以針對目前學科與小節追問，不必離開教材頁。">
              <Input
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") void askAi(); }}
                placeholder={aiPlaceholder}
              />
              <Button className="mt-3" loading={aiBusy} onClick={() => void askAi()}>
                詢問 Novi AI
              </Button>
              {answer && (
                <div className="mt-3 break-words whitespace-pre-wrap rounded-xl bg-cyan-300/10 p-3 text-sm leading-6 [overflow-wrap:anywhere]">
                  {answer}
                </div>
              )}
            </Card>

            <Card className="min-w-0 max-w-full" title="⚠ 常見錯誤與段考陷阱">
              <ul className="space-y-3 text-sm leading-6 text-muted">
                {lesson.commonErrors.map((item) => (
                  <li key={item} className="flex min-w-0 gap-2">
                    <span className="shrink-0 text-amber-200">•</span>
                    <span className="min-w-0 break-words [overflow-wrap:anywhere]">{item}</span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card className="min-w-0 max-w-full" title="⑥ 講義列印版">
              <p className="break-words text-sm leading-6 text-muted [overflow-wrap:anywhere]">
                列印時將自動排版為標準 A4 講義格式，去除網頁介面、按鈕與邊欄。
              </p>
              <Button className="mt-3" variant="outline" onClick={() => window.print()}>
                列印／另存為講義 PDF
              </Button>
            </Card>

            <Card className="min-w-0 max-w-full" title="下一步">
              <Link href={`/learning/${routeParams.subject}/${routeParams.chapter}`} className="block break-words rounded-xl bg-cyan-300/10 p-3 text-sm font-semibold text-cyan-100 hover:bg-cyan-300/20 [overflow-wrap:anywhere]">
                回到 {currentChapter.slug.toUpperCase()} 課程地圖 →
              </Link>
            </Card>
          </aside>
        </div>
      </div>

      {/* 標準 A4 重點整理講義（僅在按下列印時呈現在紙張／PDF 上） */}
      <article id="printable-handout" className="learning-handout hidden print:block text-slate-900 bg-white">
        <header className="border-b-2 border-slate-900 pb-3 mb-4">
          <div className="flex justify-between items-center text-xs text-slate-600 mb-1">
            <span className="font-bold tracking-wider">STUDYNOVA AI 高中線上學習專區 · 重點整理教材</span>
            <span>範圍：{currentChapter.title}</span>
          </div>
          <div className="flex justify-between items-end mt-2">
            <div>
              <p className="text-xs font-bold text-cyan-700 tracking-widest uppercase">LESSON {lesson.number}</p>
              <h1 className="text-2xl font-black text-slate-950 mt-0.5">{lesson.title}</h1>
            </div>
            <div className="text-right text-xs text-slate-800 border border-slate-400 rounded px-3 py-1.5">
              班級：________ 姓名：________ 座號：________
            </div>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-700">{lesson.summary}</p>
        </header>

        <section className="mb-5">
          <h2 className="text-sm font-black border-b border-slate-400 pb-1 mb-2.5 text-slate-950">一、核心觀念與知識導讀</h2>
          <div className="space-y-2.5">
            {lesson.details.map((detail, index) => (
              <div key={detail.title} className="text-xs leading-5">
                <p className="font-bold text-slate-950">{index + 1}. {detail.title}</p>
                <p className="text-slate-800 mt-0.5 pl-2.5 border-l-2 border-slate-300">{detail.body}</p>
                <p className="mt-0.5 pl-2.5 text-slate-600 italic"><strong>【範例】</strong>{detail.example}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-5">
          <h2 className="text-sm font-black border-b border-slate-400 pb-1 mb-2.5 text-slate-950">二、重點公式、反應式與對照比較</h2>
          {lesson.formulas.length > 0 && (
            <div className="mb-2.5 space-y-1">
              {lesson.formulas.map((formula) => (
                <div key={formula} className="rounded border border-slate-300 bg-slate-50 p-1.5 font-mono text-[11px] text-slate-900">
                  {formula}
                </div>
              ))}
            </div>
          )}
          <table className="w-full text-left text-xs border-collapse border border-slate-300">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-300">
                <th className="p-1.5 border-r border-slate-300 w-1/4 font-bold text-slate-950">比較項目</th>
                <th className="p-1.5 border-r border-slate-300 w-3/8 font-bold text-slate-950">對照重點 A</th>
                <th className="p-1.5 w-3/8 font-bold text-slate-950">對照重點 B</th>
              </tr>
            </thead>
            <tbody>
              {lesson.comparisons.map((item, idx) => (
                <tr key={item.label} className={idx % 2 === 1 ? "bg-slate-50" : ""}>
                  <td className="p-1.5 border-t border-r border-slate-300 font-semibold text-slate-900">{item.label}</td>
                  <td className="p-1.5 border-t border-r border-slate-300 text-slate-800">{item.left}</td>
                  <td className="p-1.5 border-t border-slate-300 text-slate-800">{item.right}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="mb-5">
          <h2 className="text-sm font-black border-b border-slate-400 pb-1 mb-2 text-slate-950">三、段考常考陷阱與避雷清單（常見錯誤）</h2>
          <ul className="list-disc pl-4 space-y-1 text-xs text-slate-800">
            {lesson.commonErrors.map((error) => (
              <li key={error}><span className="font-semibold text-slate-950">避雷提醒：</span>{error}</li>
            ))}
          </ul>
        </section>

        <section className="mb-4">
          <h2 className="text-sm font-black border-b border-slate-400 pb-1 mb-2 text-slate-950">四、隨堂自我檢測真題</h2>
          <div className="rounded border border-slate-300 p-2.5 text-xs">
            <p className="font-bold text-slate-950">{lesson.quiz.question}</p>
            <div className="grid grid-cols-2 gap-1 my-1.5">
              {lesson.quiz.options.map((opt, i) => (
                <div key={opt} className="text-slate-800">
                  ({String.fromCharCode(65 + i)}) {opt}
                </div>
              ))}
            </div>
            <div className="mt-1.5 pt-1.5 border-t border-dashed border-slate-300">
              <span className="font-bold text-slate-950">【參考答案】：({String.fromCharCode(65 + lesson.quiz.answer)})</span>
              <p className="mt-0.5 text-slate-600">【解析】：{lesson.quiz.explanation}</p>
            </div>
          </div>
        </section>

        <footer className="border-t border-slate-400 pt-2 text-[10px] text-slate-500 flex justify-between">
          <span>考前重點速記：____________________________________________________________________</span>
          <span>StudyNova 學習講義 · 預估複習時間 {lesson.minutes} 分鐘</span>
        </footer>
      </article>
    </div>
  );
}

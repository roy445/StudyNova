export type LearningStatus = "DRAFT" | "DEVELOPING" | "BETA" | "PUBLISHED" | "MAINTENANCE" | "ARCHIVED";

export type Lesson = {
  slug: string;
  number: string;
  title: string;
  summary: string;
  minutes: number;
  concepts: string[];
  formulas: string[];
  comparisons: Array<{ label: string; left: string; right: string }>;
  commonErrors: string[];
  sourcePages: string;
  interactive: "classification" | "states" | "atoms" | "bonds";
  quiz: { question: string; options: string[]; answer: number; explanation: string };
};

export const learningSubjects = [
  { slug: "chemistry", icon: "🧪", title: "高中化學", subtitle: "從基礎概念開始，一步一步建立完整化學觀念。", status: "PUBLISHED" as LearningStatus, statusLabel: "已開放" },
  { slug: "physics", icon: "⚛️", title: "高中物理", subtitle: "力學、電磁學與波動的互動課程準備中。", status: "DEVELOPING" as LearningStatus, statusLabel: "🚧 開發中" },
  { slug: "biology", icon: "🧬", title: "高中生物", subtitle: "細胞、遺傳與生態的完整學習路徑準備中。", status: "DEVELOPING" as LearningStatus, statusLabel: "🚧 開發中" },
  { slug: "math", icon: "📐", title: "高中數學", subtitle: "函數、幾何與機率的互動課程準備中。", status: "DEVELOPING" as LearningStatus, statusLabel: "🚧 開發中" },
  { slug: "english", icon: "🇬🇧", title: "高中英文", subtitle: "字彙、文法與閱讀的學習路徑準備中。", status: "DEVELOPING" as LearningStatus, statusLabel: "🚧 開發中" },
];

export const chemistryChapter = {
  slug: "ch1",
  title: "CH1 物質的分類與組成",
  subtitle: "從物質分類、基本定律到原子結構與化學鍵，建立化學的共同語言。",
  source: "化學(全)互動式教學講義_02_CH1_物質的分類與組成_學用_115f193680.pdf",
  sourcePages: "第 5–68 頁",
};

export const chemistryLessons: Lesson[] = [
  {
    slug: "classification",
    number: "01",
    title: "物質的分類、分離及狀態",
    summary: "辨認純物質、混合物、元素與化合物，並用物理性質選擇適當的分離方法。",
    minutes: 35,
    concepts: ["純物質與混合物", "元素與化合物", "過濾、蒸餾、萃取、層析", "固態、液態、氣態", "相圖與三相點"],
    formulas: ["Q = m s ΔT", "Q = mL（相變時溫度不變）"],
    comparisons: [
      { label: "純物質 vs 混合物", left: "組成固定、性質固定", right: "組成比例可變、可用物理方法分離" },
      { label: "過濾 vs 蒸餾", left: "分離不溶固體與液體", right: "利用沸點差分離液體或回收溶劑" },
      { label: "固體 vs 液體 vs 氣體", left: "形狀、體積皆固定", right: "液體形狀隨容器；氣體形狀與體積皆不固定" },
    ],
    commonErrors: ["把溶液中的溶質當成可用過濾分離的固體", "把相變平台誤認為溫度仍持續上升", "忽略水在 4°C 時密度最大的特殊性"],
    sourcePages: "第 6–18 頁",
    interactive: "classification",
    quiz: { question: "下列哪一組最適合用蒸餾分離？", options: ["食鹽與沙", "水與乙醇", "鐵粉與硫粉", "泥水"], answer: 1, explanation: "水與乙醇是互溶液體，可利用沸點差進行蒸餾；其他選項分別適合溶解／過濾或磁性等方法。" },
  },
  {
    slug: "laws-and-mole",
    number: "02",
    title: "化學的基本定律與莫耳",
    summary: "從質量守恆、定比與倍比定律，連結原子說、同位素、平均原子量與莫耳換算。",
    minutes: 40,
    concepts: ["質量守恆定律", "定比定律與倍比定律", "道耳頓原子說", "同位素與平均原子量", "莫耳與亞佛加厥常數"],
    formulas: ["n = m/M", "N = nN_A", "平均原子量 = Σ（同位素質量 × 豐度）"],
    comparisons: [
      { label: "定比 vs 倍比", left: "同一化合物的元素質量比固定", right: "不同化合物中同質量元素所結合的另一元素質量成簡單整數比" },
      { label: "原子量 vs 莫耳質量", left: "相對值，無單位", right: "一莫耳物質的質量，常用 g/mol" },
    ],
    commonErrors: ["把原子數、分子數與莫耳數混為一談", "平均原子量忘記乘以同位素豐度", "把化學反應前後原子重新排列誤認成原子消失"],
    sourcePages: "第 20–31 頁",
    interactive: "classification",
    quiz: { question: "18 g 的水（H₂O，M = 18 g/mol）約含有多少莫耳？", options: ["0.1 mol", "1 mol", "18 mol", "36 mol"], answer: 1, explanation: "n = m/M = 18/18 = 1 mol。" },
  },
  {
    slug: "atoms-periodic",
    number: "03",
    title: "原子結構與元素週期表",
    summary: "沿著原子模型演進理解電子排列、價電子、原子序與週期趨勢。",
    minutes: 45,
    concepts: ["Thomson、Rutherford、Bohr 與現代模型", "原子與離子", "原子序與質量數", "電子排列與價電子", "週期表與週期趨勢"],
    formulas: ["質量數 A = 質子數 Z + 中子數 N", "中性原子：電子數 = 質子數"],
    comparisons: [
      { label: "原子序 vs 質量數", left: "質子數，決定元素種類", right: "質子數加中子數" },
      { label: "原子 vs 陽離子", left: "中性，電子數等於質子數", right: "失去電子，電子數少於質子數" },
    ],
    commonErrors: ["把質量數當成平均原子量", "忘記陰離子是得到電子", "只看電子層數就判斷週期趨勢，忽略有效核電荷"],
    sourcePages: "第 32–49 頁",
    interactive: "atoms",
    quiz: { question: "某中性原子的原子序為 17，表示它有幾個質子？", options: ["7", "17", "18", "35"], answer: 1, explanation: "原子序 Z 就是質子數；中性原子的電子數也為 17。" },
  },
  {
    slug: "chemical-bonds",
    number: "04",
    title: "物質的化學鍵、構造及特性",
    summary: "比較離子鍵、共價鍵與金屬鍵，練習 Lewis 結構、分子模型與網狀固體特性。",
    minutes: 45,
    concepts: ["離子鍵與離子化合物", "共價鍵與 Lewis 結構", "金屬鍵", "分子模型", "共價網狀固體"],
    formulas: ["形式電荷 = 價電子 − 非鍵結電子 − 1/2鍵結電子"],
    comparisons: [
      { label: "離子化合物 vs 分子化合物", left: "晶格排列，熔點通常較高，熔融或水溶液可導電", right: "獨立分子，性質依分子間作用力而異" },
      { label: "離子鍵 vs 共價鍵", left: "電子轉移形成正負離子間靜電吸引", right: "原子共享電子對" },
      { label: "金屬鍵", left: "金屬陽離子骨架", right: "價電子可在晶體中自由移動" },
    ],
    commonErrors: ["把離子化合物說成由分子組成", "Lewis 結構漏算總價電子", "以為所有含碳物質都是共價網狀固體"],
    sourcePages: "第 50–68 頁",
    interactive: "bonds",
    quiz: { question: "下列何者最能解釋金屬具有導電性？", options: ["金屬原子沒有電子", "價電子可在晶體中移動", "金屬一定溶於水", "金屬由分子組成"], answer: 1, explanation: "金屬鍵模型中的價電子具有離域性，可在晶體中移動並傳遞電荷。" },
  },
];

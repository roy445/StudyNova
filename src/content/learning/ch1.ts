export type LearningStatus = "DRAFT" | "DEVELOPING" | "BETA" | "PUBLISHED" | "MAINTENANCE" | "ARCHIVED";

export type Lesson = {
  slug: string;
  number: string;
  title: string;
  summary: string;
  details: Array<{ title: string; body: string; example: string }>;
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
    details: [
      { title: "純物質與混合物怎麼判斷？", body: "純物質的組成固定，沸點、熔點與密度等物理性質在一定條件下具有特定值；混合物的組成比例可以改變，常能利用物理性質差異分離。", example: "蒸餾水是純物質；海水是混合物，含水、鹽類與其他溶解物。" },
      { title: "分離方法的選擇邏輯", body: "先判斷成分的狀態與是否互溶，再找差異最大的物理性質：粒徑用過濾、沸點用蒸餾、溶解度用結晶或萃取、吸附力用層析。分離不會改變物質的化學組成。", example: "泥水先用過濾；水與乙醇則利用沸點差蒸餾。" },
      { title: "三態與加熱曲線", body: "固體粒子主要在固定位置振動，液體粒子能流動，氣體粒子間距大且可壓縮。純物質相變時，熱量主要用於改變粒子間作用力，因此溫度暫時保持不變。", example: "冰融化成水的水平平台不是溫度停止測量，而是能量正在破壞晶格排列。" },
    ],
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
    details: [
      { title: "三個基本定律的差異", body: "質量守恆談反應前後總質量不變；定比定律談同一化合物的元素質量比固定；倍比定律比較不同化合物，指出同質量元素所結合的另一元素質量成簡單整數比。", example: "CO 與 CO₂ 中，固定碳質量時所結合的氧質量比為 1:2。" },
      { title: "同位素與平均原子量", body: "同一元素的同位素具有相同質子數，但中子數不同。週期表上的原子量是自然界各同位素依豐度加權後的平均，不一定等於任何一個單一原子的質量數。", example: "若元素有 75% 的 35X 與 25% 的 37X，平均原子量為 35×0.75+37×0.25=35.5。" },
      { title: "莫耳的換算", body: "莫耳是粒子數的計數單位；一莫耳含有 6.022×10²³ 個指定粒子。先確認題目問的是質量、粒子數還是莫耳數，再選 n=m/M 或 N=nNₐ。", example: "18 g H₂O ÷ 18 g/mol = 1 mol H₂O，含約 6.022×10²³ 個水分子。" },
    ],
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
    details: [
      { title: "原子模型為什麼一直改變？", body: "科學模型不是背誦的歷史名詞，而是用來解釋新證據的工具。Thomson 發現電子，Rutherford 證明正電集中於小核心，Bohr 引入能階；現代模型則用軌域與機率描述電子。", example: "α 粒子散射少數大角度偏折，表示原子大部分是空間，正電集中在很小的原子核。" },
      { title: "原子序、質量數與離子", body: "原子序 Z 等於質子數，決定元素種類；質量數 A 等於質子數加中子數。中性原子的電子數等於質子數，失去電子形成陽離子，得到電子形成陰離子。", example: "²³₁₁Na⁺ 有 11 個質子、12 個中子與 10 個電子。" },
      { title: "週期趨勢的原因", body: "同週期由左到右，核電荷增加但電子仍在相同主能階，原子半徑通常變小、游離能與電負度通常變大；同族往下，電子層增加，遮蔽效應使半徑變大。", example: "Na 比 Cl 更容易失去價電子；F 的電負度比 Cl 大。" },
    ],
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
    details: [
      { title: "三種鍵結的核心差異", body: "離子鍵是正負離子間的靜電吸引；共價鍵是原子共享電子對；金屬鍵則是金屬陽離子骨架與離域價電子的吸引。不要只看化學式，要連結粒子的排列與可移動性。", example: "NaCl 是離子晶格，不是 NaCl 分子；H₂O 是由獨立分子構成。" },
      { title: "Lewis 結構的固定步驟", body: "先加總所有原子的價電子，再畫骨架單鍵，補足外圍原子的八隅體，最後把剩餘電子放在中心原子；若中心原子不足八隅體，再將孤電子對形成多鍵。", example: "CO₂ 的骨架為 O—C—O，補足後形成 O=C=O。" },
      { title: "結構如何影響性質？", body: "離子固體的離子固定在晶格中，固態通常不導電，熔融或溶於水後離子能移動；金屬有可移動電子所以導電導熱；共價網狀固體以強共價鍵延伸成網狀結構，通常硬度高、熔點高。", example: "鑽石與石墨都是碳，但三維網狀與層狀結構不同，導致硬度與導電性差異。" },
    ],
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

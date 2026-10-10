import { historyChapter, historyLessons } from "./history";
import { physicsChapter, physicsLessons, physicsTracks } from "./physics";
import { physicsExtraLessons } from "./physics-extra";

export type LearningStatus = "DRAFT" | "DEVELOPING" | "BETA" | "PUBLISHED" | "MAINTENANCE" | "ARCHIVED";

export type Lesson = {
  slug: string;
  unit?: string;
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
  interactive: "classification" | "states" | "atoms" | "bonds" | "logarithm" | "history" | "heat";
  quiz: { question: string; options: string[]; answer: number; explanation: string };
};

export const learningSubjects = [
  { slug: "chemistry", icon: "🧪", title: "高中化學", subtitle: "從基礎概念開始，一步一步建立完整化學觀念。", status: "PUBLISHED" as LearningStatus, statusLabel: "已開放" },
  { slug: "history", icon: "▥", title: "高中歷史", subtitle: "從原住民族、外力治理到移民社會，建立台灣歷史的長時段脈絡。", status: "PUBLISHED" as LearningStatus, statusLabel: "已開放" },
  { slug: "physics", icon: "⚛️", title: "高中物理", subtitle: "高一基礎物理第 1～4 章：物理學與人類生活、運動與力、熱、聲音。", status: "PUBLISHED" as LearningStatus, statusLabel: "已開放", gradeLabel: "高一", tracks: physicsTracks },
  { slug: "biology", icon: "🧬", title: "高中生物", subtitle: "細胞、遺傳與生態的完整學習路徑準備中。", status: "DEVELOPING" as LearningStatus, statusLabel: "🚧 開發中" },
  { slug: "math", icon: "📐", title: "高中數學", subtitle: "從科學記號與常用對數開始，建立高一數學的解題基礎。", status: "PUBLISHED" as LearningStatus, statusLabel: "已開放" },
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


export const mathChapter = {
  slug: "ch1",
  title: "CH1 常用對數",
  subtitle: "從科學記號、有效數字與位數判斷，建立常用對數的定義、運算與生活應用能力。",
  source: "1-4常用對數_merged.pdf（使用者提供講義）",
  sourcePages: "第 1–22 頁（PDF 共 65 頁）",
};

export const mathLessons: Lesson[] = [
  {
    slug: "scientific-notation",
    number: "01",
    title: "科學記號、有效數字與位數",
    summary: "學會用 a×10ⁿ 表示很大或很小的數，並由指數快速判斷整數位數與小數首次出現非零數字的位置。",
    details: [
      { title: "科學記號的標準形式", body: "每個正數都能寫成 a×10ⁿ，其中 1≤a<10，n 是整數。指數為正時表示數值很大，指數為負時表示數值很小。", example: "17,420,000 = 1.742×10⁷；0.000000054 = 5.4×10⁻⁸。" },
      { title: "有效數字怎麼數？", body: "先寫成科學記號，再依題目要求四捨五入係數。係數中所有非零數字，以及夾在非零數字間的 0，都是有效數字。", example: "1.742×10⁷ 有 4 位有效數字；取 3 位有效數字為 1.74×10⁷。" },
      { title: "指數與位數的關係", body: "若 n≥0，a×10ⁿ 的整數部分有 n+1 位；若 n=−k，則從小數點後第 k 位開始出現非零數字。遇到非整數指數時，先用對數估計其落在哪兩個整數之間。", example: "3.21×10⁸ 的整數部分是 9 位；3.24×10⁻⁵ 從小數點後第 5 位開始出現非零數字。" },
      { title: "科學記號的運算", body: "乘除時先運算係數、指數相加或相減，再把結果整理成標準形式；加減時要先調整成相同的 10 次方。", example: "(3×10⁵)(2×10⁻³)=6×10²；(2.3×10⁶)+(4.1×10⁵)=2.71×10⁶。" },
    ],
    minutes: 35,
    concepts: ["a×10ⁿ 的標準形式", "有效數字與四捨五入", "指數判斷整數位數", "科學記號的乘除加減"],
    formulas: ["1≤a<10", "n≥0：整數部分 n+1 位", "n=−k：小數點後第 k 位開始非零"],
    comparisons: [
      { label: "大數 vs 小數", left: "正指數：數值放大", right: "負指數：數值縮小" },
      { label: "乘除 vs 加減", left: "係數運算、指數相加減", right: "先化成相同次方再運算" },
    ],
    commonErrors: ["把指數 n 直接當成位數，忘記正指數要加 1", "有效數字與小數位數混淆", "科學記號加減時沒有先對齊 10 的次方"],
    sourcePages: "第 1–2 頁",
    interactive: "logarithm",
    quiz: { question: "3.24×10⁻⁵ 從小數點後第幾位開始出現非零數字？", options: ["第 3 位", "第 4 位", "第 5 位", "第 6 位"], answer: 2, explanation: "10⁻⁵ 的 1 從小數點後第 5 位開始，因此 3.24×10⁻⁵ 也是第 5 位開始出現非零數字。" },
  },
  {
    slug: "log-definition",
    number: "02",
    title: "常用對數的定義與計算機",
    summary: "從 10 的乘冪理解 log，熟悉 log p 與 10ˡᵒᵍ p 的互換，並用計算機求近似值。",
    details: [
      { title: "常用對數的定義", body: "若正數 p=10ᵃ，則稱 a 為 p 的常用對數，記作 a=log p。底數 10 在常用對數中通常省略不寫。", example: "10³=1000，所以 log 1000=3；10⁻⁵=0.00001，所以 log 0.00001=−5。" },
      { title: "定義的雙向轉換", body: "p=10ᵃ 與 a=log p 是完全等價的兩種寫法。任何正數 p 都可以寫成 10 的 log p 次方，但 log 的真數必須是正數。", example: "10ˡᵒᵍ 12=12；若 10ˣ=6，則 x=log 6。" },
      { title: "計算機求近似值", body: "計算機的 log 鍵可以求出常用對數。題目若要求四捨五入到小數點後幾位，最後一步才進行四捨五入。", example: "log 6≈0.778151125，因此取到小數點後 4 位是 0.7782。" },
      { title: "對數值的範圍判斷", body: "利用 10ⁿ 的大小先估計 log p。若 10⁴<p<10⁵，就能判斷 4<log p<5；若 10⁻⁴<p<10⁻³，則 −4<log p<−3。", example: "1409 介於 10³ 與 10⁴ 之間，所以 3<log 1409<4。" },
    ],
    minutes: 40,
    concepts: ["p=10ᵃ ⇔ a=log p", "log 1=0 與 log 10ⁿ=n", "計算機近似值", "對數值的上下界"],
    formulas: ["p=10ᵃ ⇔ a=log p", "10ˡᵒᵍ p=p（p>0）", "log 10ⁿ=n"],
    comparisons: [
      { label: "指數式 vs 對數式", left: "10ᵃ=p：求出 p", right: "a=log p：求出指數 a" },
      { label: "正數 vs 非正數真數", left: "log p 有意義（p>0）", right: "log 0、log 負數在實數範圍無意義" },
    ],
    commonErrors: ["忘記常用對數底數是 10", "把 log p 當成 10p", "對數真數寫成 0 或負數", "四捨五入過早造成答案誤差"],
    sourcePages: "第 3–6 頁",
    interactive: "logarithm",
    quiz: { question: "若 10ˣ=0.5，x 應表示為什麼？", options: ["log 5", "log 0.5", "10 log 0.5", "0.5 log 10"], answer: 1, explanation: "依定義 10ˣ=p ⇔ x=log p，因此 x=log 0.5。" },
  },
  {
    slug: "log-laws",
    number: "03",
    title: "對數的運算與方程式",
    summary: "結合指數律與對數定義，處理乘方、對數表達、位數與含對數的簡單方程。",
    details: [
      { title: "乘方與對數的連結", body: "若 10ᵃ=p，則 10ᵏᵃ=pᵏ；因此 10²ˡᵒᵍ 6=6²=36。這類題目先辨認『10 的某個對數次方』，通常不必按計算機。", example: "10ˡᵒᵍ 29=29；10⁻ˡᵒᵍ 3=1/3。" },
      { title: "用對數判斷位數", body: "若正整數 N 的常用對數為 x，且 m<x<m+1，則 N 的整數部分有 m+1 位。對 2ᵖ−1 類題目，要先估計 p log 2，再判斷整數位數。", example: "若 2¹²⁷=10ᵏ，則 k=127 log 2≈38.2，因此 2¹²⁷−1 是 39 位數。" },
      { title: "建立方程式再取對數", body: "看到 10ˣ=A 時，直接寫 x=log A；看到數值是某個 10 的乘冪時，則可用 log 10ⁿ=n 化簡。保持等式兩邊的定義一致，不要混用自然對數。", example: "10ᵗ=0.055，所以 t=log 0.055≈−1.2596。" },
    ],
    minutes: 45,
    concepts: ["10ˡᵒᵍ p 的化簡", "pᵏ 與 k log p", "利用 log 判斷位數", "10ˣ=A 型方程"],
    formulas: ["10ˡᵒᵍ p=p", "10ᵏˡᵒᵍ p=pᵏ", "m<log N<m+1 ⇒ N 有 m+1 位（N 為正整數）"],
    comparisons: [
      { label: "直接化簡 vs 計算機", left: "10ˡᵒᵍ p 優先用定義化簡", right: "非特殊值才用計算機近似" },
      { label: "log N 的位置", left: "N>1：log N 為正", right: "0<N<1：log N 為負" },
    ],
    commonErrors: ["把 10²ˡᵒᵍ 6 誤算成 12", "判斷位數時忘記最後的 −1 不一定改變位數邊界", "把 log 的乘法誤寫成 log(a+b)=log a+log b"],
    sourcePages: "第 6–7 頁、第 10–12 頁",
    interactive: "logarithm",
    quiz: { question: "10²ˡᵒᵍ 6 的值為何？", options: ["12", "36", "6²ˡᵒᵍ 10", "log 36"], answer: 1, explanation: "10ˡᵒᵍ 6=6，所以 10²ˡᵒᵍ 6=(10ˡᵒᵍ 6)²=36。" },
  },
  {
    slug: "log-applications",
    number: "04",
    title: "常用對數的生活與科學應用",
    summary: "把對數連到 pH、分貝、星等、人口與班佛定律，練習從文字情境建立數學模型。",
    details: [
      { title: "酸鹼值 pH", body: "pH=−log[H⁺]，其中 [H⁺] 是氫離子濃度。濃度每相差 10 倍，pH 就相差 1；混合溶液要先平均濃度，再取對數。", example: "[H⁺]=10⁻³ mol/L 時，pH=3。" },
      { title: "聲音強度與分貝", body: "分貝函數 d(I)=10 log(I/I₀)，I₀=10⁻¹² W/m²。先把強度比 I/I₀ 算清楚，再代入對數；反過來求強度時要改寫成 10 的乘冪。", example: "I=10² W/m² 時，d=10 log(10¹⁴)=140 分貝。" },
      { title: "星等與距離", body: "星等公式會把距離的乘法關係轉成對數。解題時先整理含 log d 的等式，再用 10 的乘冪表示距離，最後才換算單位。", example: "M=m+5−5 log d；移項後可求 d=10^((m+5−M)/5)。" },
      { title: "從資料看世界", body: "班佛定律、人口與步行速度等情境，都能用 log 描述尺度變化。重點不是背公式，而是確認變數單位、代入順序與最後的四捨五入要求。", example: "首位數字為 a 的比例約為 log(1+1/a)；a=7 時再用計算機取近似值。" },
    ],
    minutes: 45,
    concepts: ["pH 酸鹼值", "分貝與聲音強度", "視星等與絕對星等", "班佛定律與人口模型"],
    formulas: ["pH=−log[H⁺]", "d(I)=10 log(I/I₀)", "M=m+5−5 log d", "比例≈log(1+1/a)"],
    comparisons: [
      { label: "直接量 vs 對數量", left: "強度、濃度、距離等原始量", right: "pH、分貝、星等等對數尺度" },
      { label: "正向代入 vs 反向求解", left: "已知原始量，代入公式求尺度", right: "已知尺度，改寫成 10 的乘冪求原始量" },
    ],
    commonErrors: ["pH 前面的負號漏掉", "分貝公式忘記除以基準強度 I₀", "星等公式移項時 5 的係數處理錯誤", "忽略題目指定的單位與四捨五入位數"],
    sourcePages: "第 5–6 頁、第 8–18 頁",
    interactive: "logarithm",
    quiz: { question: "若 [H⁺]=10⁻³ mol/L，該溶液的 pH 為何？", options: ["−3", "0.001", "3", "10³"], answer: 2, explanation: "pH=−log(10⁻³)=−(−3)=3。" },
  },
];

export const learningCurriculum = {
  chemistry: { chapter: chemistryChapter, lessons: chemistryLessons },
  math: { chapter: mathChapter, lessons: mathLessons },
  history: { chapter: historyChapter, lessons: historyLessons },
  physics: (() => {
    const lessons = [...physicsExtraLessons.slice(0, 3), ...physicsExtraLessons.slice(3, 7), ...physicsLessons, ...physicsExtraLessons.slice(7)];
    const chapters = [
      { ...physicsChapter, slug: "ch1", title: "CH1 物理學與人類生活", subtitle: "從物理學簡史、科學方法、量測到物理與科技。", sourcePages: "PDF 第 30–74 頁", lessons: lessons.filter((lesson) => lesson.number.startsWith("1-")) },
      { ...physicsChapter, slug: "ch2", title: "CH2 運動與力", subtitle: "從位置、速度與加速度，建立牛頓運動定律、能量與動量觀念。", sourcePages: "PDF 第 75–131 頁", lessons: lessons.filter((lesson) => lesson.number.startsWith("2-")) },
      { ...physicsChapter, slug: "ch3", title: "CH3 熱", subtitle: "從溫度、熱量與比熱，理解物態變化、熱傳播，以及冰箱與保溫等生活應用。", sourcePages: "PDF 第 1–14 頁", lessons: lessons.filter((lesson) => lesson.number.startsWith("3-")) },
      { ...physicsChapter, slug: "ch4", title: "CH4 聲音", subtitle: "從波動、聲速、分貝、反射與共鳴理解聲音的物理。", sourcePages: "PDF 第 16–28 頁", lessons: lessons.filter((lesson) => lesson.number.startsWith("4-")) },
    ] as const;
    return { chapter: chapters[0], chapters, lessons };
  })(),
} as const;

export type DailyKnowledge = {
  subject: "國文" | "英文" | "數學" | "自然" | "社會";
  title: string;
  body: string;
  detail: string;
  tag: string;
  trend: string;
  sourceName: string;
  sourceUrl: string;
  quiz: { question: string; options: string[]; answer: number; explanation: string };
};

export const DAILY_KNOWLEDGE: DailyKnowledge[] = [
  {
    subject: "自然", tag: "自然・太空科學", trend: "圖表判讀＋跨科推理", title: "月球其實正在慢慢離開地球",
    body: "月球每年約離地球 3.8 公分；這與潮汐造成的角動量轉移有關。",
    detail: "月球與地球呈潮汐鎖定，我們長期看到的主要是同一面。NASA 也指出，月球兩極永久陰影區存在水冰，這些資料能連結到重力、角動量、月相與未來太空探索等概念。",
    sourceName: "NASA Moon Facts", sourceUrl: "https://science.nasa.gov/moon/facts/",
    quiz: { question: "月球每年大約以多少距離遠離地球？", options: ["3.8 公分", "3.8 公尺", "38 公尺", "完全沒有移動"], answer: 0, explanation: "NASA 的資料指出，月球每年約遠離地球 1 英吋，也就是約 3.8 公分。" },
  },
  {
    subject: "自然", tag: "自然・太陽系", trend: "生活情境＋科學解釋", title: "最熱的行星不是離太陽最近的水星",
    body: "金星是太陽系最熱的行星，關鍵在於它濃厚大氣造成的失控溫室效應。",
    detail: "水星雖然更靠近太陽，但金星的大氣主要由二氧化碳構成，能有效留住熱量，因此表面溫度比水星更高。這是把天文觀察與地球科學、氣候素養連在一起的例子。",
    sourceName: "NASA Solar System Facts", sourceUrl: "https://science.nasa.gov/solar-system/solar-system-facts/",
    quiz: { question: "太陽系中表面最熱的行星是哪一顆？", options: ["水星", "金星", "地球", "火星"], answer: 1, explanation: "NASA 指出最熱的是金星，因為濃厚大氣造成強烈溫室效應。" },
  },
  {
    subject: "英文", tag: "英文・語境閱讀", trend: "情境理解取代死背", title: "look、see、watch 怎麼分？",
    body: "look 強調「看」的動作，see 指自然注意到，watch 則常用於持續觀看移動中的事物。",
    detail: "理解三個字的差異，最重要的是觀察動詞後面的情境：look at the picture、I see a bird、watch a movie。這種以短文情境辨識語意的方式，比只背中文意思更接近閱讀素養題。",
    sourceName: "Cambridge Dictionary", sourceUrl: "https://dictionary.cambridge.org/",
    quiz: { question: "持續觀看電影通常用哪個字？", options: ["look", "see", "watch", "listen"], answer: 2, explanation: "watch 常用於持續觀看活動或移動中的事物。" },
  },
  {
    subject: "英文", tag: "英文・媒體素養", trend: "短文訊息＋判斷作者意圖", title: "看到 actually 不一定只是「實際上」",
    body: "在對話或文章中，actually 常用來修正前文、補充真實情況，理解語氣比逐字翻譯重要。",
    detail: "例如 I thought it was closed. Actually, it is open. 這裡 actually 帶出與原先想法不同的資訊。閱讀題常用轉折語判斷作者態度與資訊重點。",
    sourceName: "British Council LearnEnglish", sourceUrl: "https://learnenglish.britishcouncil.org/",
    quiz: { question: "Actually 最常在語境中扮演什麼功能？", options: ["表示修正或補充真實情況", "表示未來時間", "表示數量", "表示地點"], answer: 0, explanation: "Actually 常用來修正前面說法或引出更準確的資訊。" },
  },
  {
    subject: "數學", tag: "數學・資料判讀", trend: "真實資料＋估算與合理性", title: "平均數高，不代表每個人都高",
    body: "平均數容易受到極端值影響；看到薪資、成績或調查圖表時，也要比較中位數與分布。",
    detail: "若五個人的數值是 10、10、10、10、100，平均數是 28，但多數人的數值仍是 10。素養題會要求你從統計量與圖表判斷一段話是否合理，而不是只套公式。",
    sourceName: "Khan Academy Statistics", sourceUrl: "https://www.khanacademy.org/math/statistics-probability",
    quiz: { question: "哪一個統計量最不容易受到單一極端值影響？", options: ["平均數", "中位數", "總和", "最大值"], answer: 1, explanation: "中位數取排序後的中間位置，通常比平均數更不受單一極端值影響。" },
  },
  {
    subject: "數學", tag: "數學・生活應用", trend: "比例推理＋消費決策", title: "打折不只看折數，還要看比較基準",
    body: "先打八折再打九折，總價是原價的 72%，不是七折；連續百分比要逐次乘上剩餘比例。",
    detail: "原價 1,000 元先打八折為 800 元，再打九折為 720 元。這種購物、利率與人口變化的比例題，重點是辨識每一步的基準是否改變。",
    sourceName: "Math is Fun・Percentages", sourceUrl: "https://www.mathsisfun.com/percentage.html",
    quiz: { question: "原價 1,000 元先打八折再打九折，最後價格是多少？", options: ["700 元", "720 元", "800 元", "810 元"], answer: 1, explanation: "1,000 × 0.8 × 0.9 = 720。" },
  },
  {
    subject: "自然", tag: "自然・氣候與環境", trend: "證據解讀＋因果辨識", title: "天氣和氣候不是同一件事",
    body: "今天下雨是天氣；長期觀察到的溫度、降雨與極端事件趨勢，才是在討論氣候。",
    detail: "閱讀氣候圖表時，要注意時間尺度、平均值、變異和極端值，不能用單一天氣事件直接否定長期趨勢。這類題目常結合圖表、新聞與科學證據。",
    sourceName: "NOAA Climate.gov", sourceUrl: "https://www.climate.gov/",
    quiz: { question: "判斷氣候趨勢最需要哪種資料？", options: ["一天的溫度", "一週的天氣", "長期且連續的觀測", "一次朋友圈投票"], answer: 2, explanation: "氣候描述長期狀態與趨勢，需要較長時間且連續的觀測資料。" },
  },
  {
    subject: "社會", tag: "社會・公民與媒體", trend: "多文本比對＋來源判讀", title: "看到一張圖表，先問資料從哪裡來",
    body: "圖表有數字不代表一定客觀；要檢查資料來源、調查對象、時間範圍與是否省略座標軸。",
    detail: "同一組資料用不同縱軸尺度呈現，視覺效果可能完全不同。社會科素養題常要求比較新聞、圖表與原始資料，判斷敘述是否過度推論。",
    sourceName: "Our World in Data", sourceUrl: "https://ourworldindata.org/",
    quiz: { question: "閱讀調查圖表時，哪一項最應優先確認？", options: ["顏色是否漂亮", "資料來源與樣本範圍", "標題字體", "圖片大小"], answer: 1, explanation: "來源、樣本、時間與定義會直接影響資料能否支持結論。" },
  },
  {
    subject: "社會", tag: "社會・歷史與文化", trend: "時間脈絡＋觀點比較", title: "歷史材料要先分辨『誰在說』",
    body: "同一事件可能有不同記載；閱讀史料時要留意作者身分、寫作年代、目的與使用的語詞。",
    detail: "素養型歷史題不只問年代，也會要求你根據一手或二手材料，比較不同立場並判斷哪些推論有證據支持。理解脈絡比背誦單一結論更重要。",
    sourceName: "國立故宮博物院・典藏資源", sourceUrl: "https://www.npm.gov.tw/",
    quiz: { question: "判讀歷史史料時，哪一項最能幫助理解立場？", options: ["作者身分與寫作目的", "紙張顏色", "字數多寡", "圖片解析度"], answer: 0, explanation: "作者身分、時代與目的會影響史料的選材、語氣與觀點。" },
  },
  {
    subject: "國文", tag: "國文・閱讀素養", trend: "跨文本整合＋證據推論", title: "先找主張，再找支持它的證據",
    body: "閱讀議論文時，不要只找關鍵字；要辨識作者主張、理由、例證與可能的反方觀點。",
    detail: "近年的閱讀素養常把文章、圖表或不同文本放在一起，要求讀者判斷哪一句是作者立場、哪一句只是例子，以及哪個推論超出了原文證據。",
    sourceName: "國家教育研究院・素養導向教學與評量", sourceUrl: "https://www.naer.edu.tw/PageSyllabus?fid=53",
    quiz: { question: "閱讀議論文時，例子主要用來做什麼？", options: ["支持或說明主張", "取代所有證據", "改變文章作者", "只增加字數"], answer: 0, explanation: "例子通常用來具體說明或支持作者提出的主張，但仍要檢查是否真的相關。" },
  },
  {
    subject: "國文", tag: "國文・語文表達", trend: "語境判斷＋精準表達", title: "同一句話換個語氣，立場可能就不同",
    body: "閱讀與寫作不只看字面意思，也要觀察連接詞、程度副詞與語氣，判斷作者是肯定、保留還是反駁。",
    detail: "例如「可能」「多半」「必然」的確定程度不同；「然而」「因此」「反而」也會改變句子間的邏輯。把這些訊號圈出來，能更準確地整理文章結構。",
    sourceName: "教育部重編國語辭典修訂本", sourceUrl: "https://dict.revised.moe.edu.tw/",
    quiz: { question: "『然而』通常表示什麼關係？", options: ["轉折", "時間先後", "數量增加", "地點移動"], answer: 0, explanation: "然而是轉折連接詞，表示後文可能與前文方向不同。" },
  },
];

export function dailyKnowledge(date: string): DailyKnowledge {
  const index = [...date].reduce((sum, char) => sum + char.charCodeAt(0), 0) % DAILY_KNOWLEDGE.length;
  return DAILY_KNOWLEDGE[index];
}

export const DAILY_SUBJECTS: DailyKnowledge["subject"][] = ["國文", "英文", "數學", "自然", "社會"];

export function dailyKnowledgeBySubject(date: string, subject: DailyKnowledge["subject"]): DailyKnowledge {
  const items = DAILY_KNOWLEDGE.filter((item) => item.subject === subject);
  const seed = [...date].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return items[seed % items.length] ?? dailyKnowledge(date);
}

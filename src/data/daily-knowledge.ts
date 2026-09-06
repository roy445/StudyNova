export type DailyKnowledge = {
  title: string;
  body: string;
  detail: string;
  tag: string;
  sourceName: string;
  sourceUrl: string;
  quiz: { question: string; options: string[]; answer: number; explanation: string };
};

export const DAILY_KNOWLEDGE: DailyKnowledge[] = [
  {
    tag: "NASA・太空科學",
    title: "月球其實正在慢慢離開地球",
    body: "月球每年約離地球 3.8 公分；這與潮汐造成的角動量轉移有關。",
    detail: "月球與地球呈潮汐鎖定，我們長期看到的主要是同一面。NASA 也指出，月球兩極永久陰影區存在水冰，這些資料能連結到重力、角動量、月相與未來太空探索等概念。",
    sourceName: "NASA Moon Facts",
    sourceUrl: "https://science.nasa.gov/moon/facts/",
    quiz: { question: "月球每年大約以多少距離遠離地球？", options: ["3.8 公分", "3.8 公尺", "38 公尺", "完全沒有移動"], answer: 0, explanation: "NASA 的資料指出，月球每年約遠離地球 1 英吋，也就是約 3.8 公分。" },
  },
  {
    tag: "NASA・太陽系",
    title: "最熱的行星不是離太陽最近的水星",
    body: "金星是太陽系最熱的行星，關鍵在於它濃厚大氣造成的失控溫室效應。",
    detail: "水星雖然更靠近太陽，但金星的大氣主要由二氧化碳構成，能有效留住熱量，因此表面溫度比水星更高。這是把天文觀察與地球科學、氣候素養連在一起的例子。",
    sourceName: "NASA Solar System Facts",
    sourceUrl: "https://science.nasa.gov/solar-system/solar-system-facts/",
    quiz: { question: "太陽系中表面最熱的行星是哪一顆？", options: ["水星", "金星", "地球", "火星"], answer: 1, explanation: "NASA 指出最熱的是金星，因為濃厚大氣造成強烈溫室效應。" },
  },
  { tag: "英文小知識", title: "look、see、watch 怎麼分？", body: "look 強調「看」的動作，see 指自然注意到，watch 則常用於持續觀看移動中的事物。", detail: "理解三個字的差異，最重要的是觀察動詞後面的情境：look at the picture、I see a bird、watch a movie。", sourceName: "StudyNova English Notes", sourceUrl: "https://dictionary.cambridge.org/", quiz: { question: "持續觀看電影通常用哪個字？", options: ["look", "see", "watch", "listen"], answer: 2, explanation: "watch 常用於持續觀看活動或移動中的事物。" } },
  { tag: "學習方法", title: "回想比重讀更有效", body: "讀完一段內容後先合上筆記，試著說出三個重點。", detail: "這種主動回想能讓大腦練習提取資訊；搭配間隔複習，可以把短期記憶逐步轉成長期記憶。", sourceName: "StudyNova Learning Lab", sourceUrl: "https://www.learningscientists.org/", quiz: { question: "讀完內容後最適合先做什麼？", options: ["立刻重讀十次", "合上筆記回想重點", "完全不複習", "只看標題"], answer: 1, explanation: "主動回想比被動重讀更能檢驗自己是否真的理解。" } },
  { tag: "科學小知識", title: "天空為什麼是藍色？", body: "陽光穿過大氣時，藍光比紅光更容易被空氣分子散射。", detail: "這個現象稱為瑞利散射；日出日落時光線穿過更長的大氣路徑，藍光被散射得更多，因此紅橙色更容易進入我們的視線。", sourceName: "NASA Science", sourceUrl: "https://science.nasa.gov/earth/", quiz: { question: "天空呈藍色主要與什麼有關？", options: ["藍光較容易被散射", "海水反射", "雲朵染色", "太陽本身是藍色"], answer: 0, explanation: "大氣分子對短波長的藍光散射較強。" } },
];

export function dailyKnowledge(date: string): DailyKnowledge {
  const index = [...date].reduce((sum, char) => sum + char.charCodeAt(0), 0) % DAILY_KNOWLEDGE.length;
  return DAILY_KNOWLEDGE[index];
}

export type DailyKnowledge = {
  title: string;
  body: string;
  tag: string;
};

export const DAILY_KNOWLEDGE: DailyKnowledge[] = [
  { tag: "英文小知識", title: "look、see、watch 怎麼分？", body: "look 強調「看」的動作，see 指自然注意到，watch 則常用於持續觀看移動中的事物。" },
  { tag: "學習方法", title: "回想比重讀更有效", body: "讀完一段內容後先合上筆記，試著說出三個重點，這種主動回想能幫助記憶更穩固。" },
  { tag: "英文小知識", title: "because 後面接什麼？", body: "because 後面通常接完整子句；because of 後面則接名詞或名詞片語。" },
  { tag: "科學小知識", title: "為什麼天空是藍色的？", body: "陽光穿過大氣時，藍光比紅光更容易被空氣分子散射，所以我們更容易看見藍色。" },
  { tag: "學習方法", title: "把目標切成小步驟", body: "將「今天讀英文」改成「完成 10 個單字與 5 題練習」，具體的小目標更容易開始與完成。" },
  { tag: "英文小知識", title: "borrow 和 lend 的方向", body: "borrow 是「向別人借進來」，lend 是「借給別人」。記得把動作方向和主詞一起想。" },
  { tag: "歷史小知識", title: "學習也需要間隔", body: "把複習分散在不同日期，通常比同一天長時間重複閱讀更有助於長期保留。" },
];

export function dailyKnowledge(date: string): DailyKnowledge {
  const index = [...date].reduce((sum, char) => sum + char.charCodeAt(0), 0) % DAILY_KNOWLEDGE.length;
  return DAILY_KNOWLEDGE[index];
}

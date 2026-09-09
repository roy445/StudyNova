export const SUBJECTS = ["國文", "英文", "數學", "自然", "社會", "理化", "生物", "歷史", "地理", "公民", "其他"] as const;
export type StudySubject = (typeof SUBJECTS)[number];

const STRATEGIES: Record<StudySubject, string> = {
  國文: "重視字詞、文意、修辭、段落結構、主旨、寫作手法與引用證據。",
  英文: "重視單字、片語、文法、句型、閱讀理解、翻譯與上下文證據。",
  數學: "保留公式與符號，重視已知條件、解題步驟、計算、單位、圖形與答案驗算；不要把數學式當一般文字。",
  自然: "區分物理、化學、生物與地科概念，重視定義、實驗變因、因果、數據、公式、單位與圖表證據。",
  社會: "重視時間、地點、人物、制度、因果、比較、史料與圖表證據，區分歷史、地理與公民概念。",
  理化: "重視物理量、化學式、反應、公式、單位、實驗變因、計算步驟與結果合理性。",
  生物: "重視構造與功能、分類、遺傳、生態、實驗流程、因果與圖表資料。",
  歷史: "重視時序、人物、事件、背景、因果、影響、史料與不同觀點。",
  地理: "重視位置、地圖、尺度、自然與人文因素、數據圖表、區域比較與因果。",
  公民: "重視概念定義、權利義務、制度、法律、公共議題、利害關係人與論證。",
  其他: "先判斷內容領域，再抓取關鍵概念、證據、步驟、定義與可驗證的結論。",
};

export function subjectStrategy(subject?: string | null) {
  const normalized = SUBJECTS.includes(subject as StudySubject) ? subject as StudySubject : "其他";
  return `指定科目：${normalized}。分析策略：${STRATEGIES[normalized]}`;
}

export function subjectOptions() {
  return SUBJECTS.map((subject) => ({ value: subject, label: subject }));
}

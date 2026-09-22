import pg from "pg";

const { Pool } = pg;
const model = process.env.EXAMPLE_MODEL || "gpt-5-mini";
const limit = Number(process.env.LIMIT || 0);
const targetWord = process.env.WORD?.trim().toLowerCase() || "";
const concurrency = Math.max(1, Math.min(8, Number(process.env.CONCURRENCY || 4)));
const apiBase = (process.env.OPENAI_API_BASE || "").replace(/\/$/, "");
const apiKey = process.env.OPENAI_API_KEY;
if (!process.env.DATABASE_URL || !apiBase || !apiKey) throw new Error("DATABASE_URL, OPENAI_API_BASE and OPENAI_API_KEY are required");

const forbidden = [/in the passage/i, /the word\s+["“']/i, /the writer/i, /the author/i, /this sentence shows/i, /the meaning of/i, /helps explain the writer/i, /is used to describe/i];
function validExamples(items, word) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const target = new RegExp(`\\b${escaped}\\b`, "i");
  const seen = new Set();
  return (Array.isArray(items) ? items : []).filter((item) => {
    const english = String(item?.english || "").trim();
    const chinese = String(item?.chinese || "").trim();
    const key = english.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const count = english.split(/\s+/).length;
    if (!english || !chinese || !target.test(english) || count < 5 || count > 35 || forbidden.some((pattern) => pattern.test(english)) || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 5).map((item) => ({ english: String(item.english).trim(), chinese: String(item.chinese).trim(), level: String(item.level || "一般").slice(0, 30) }));
}

async function generate(word, meaning, partOfSpeech, meanings, phrases) {
  const instruction = `為英文單字「${word}」產生 5 句真正自然、可朗讀、可直接學習用法的英文例句，並提供每句完整繁體中文翻譯。
詞性：${partOfSpeech || "未知"}
主要中文義項：${meaning || "未知"}
其他義項：${JSON.stringify(meanings || [])}
常見片語：${JSON.stringify(phrases || [])}

嚴格品質規則：例句的最高目的，是讓學生理解這個字在現實生活何時使用、如何使用及常見搭配。優先使用日常對話、學校、手機網路、社群、作業考試、社團、旅行交通、購物餐廳、人際關係、問題解決、建議提醒、表達意見感受或實際狀況。每句約 8–18 字（必要時可略超過），必須有資訊價值、符合詞性與常見義項，並盡可能呈現固定搭配或句型。句型和主詞要自然變化，不要五句都用 I 開頭。
禁止流水帳（起床、吃早餐、上學、放學、回家等與目標字無關的行程）、禁止為塞入單字而硬寫、禁止小說式虛假故事、禁止不自然或過度學術的英文、禁止解釋單字本身。禁止 In the passage...、The word X...、The writer...、The author...、This sentence shows...、The meaning of X...、helps explain the writer's main idea，以及任何正在介紹這個單字的句子。多義字只挑國高中最常見且有學習價值的意思，除非其他意思也很重要才分配句子。生成後自行檢查：英文自然嗎、用法正確嗎、學生真的會遇到嗎、是否有常見搭配、是否比空泛句更實用；不合格就重寫。
只回傳 JSON：{"examples":[{"english":"自然英文句子","chinese":"完整繁體中文翻譯","level":"基礎|會考|進階"}]}`;
  let last = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`${apiBase}/chat/completions`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "system", content: "You are a Taiwanese high-school English teacher and professional copy editor. Write natural, usable English, not meta-explanations." }, { role: "user", content: instruction + (attempt ? "\n上一版未通過品質檢查，請完全改寫所有句子，避免任何相似句型。" : "") }], max_completion_tokens: 1800, response_format: { type: "json_schema", json_schema: { name: "natural_examples", strict: true, schema: { type: "object", properties: { examples: { type: "array", minItems: 5, maxItems: 5, items: { type: "object", properties: { english: { type: "string" }, chinese: { type: "string" }, level: { type: "string" } }, required: ["english", "chinese", "level"], additionalProperties: false } } }, required: ["examples"], additionalProperties: false } } }, reasoning: { effort: "minimal" } })
    });
    if (!response.ok) throw new Error(`LLM ${response.status}: ${await response.text()}`);
    const payload = await response.json();
    let content = payload.choices?.[0]?.message?.content || "{}";
    if (Array.isArray(content)) content = content.map((part) => part.text || "").join("");
    try { last = validExamples(JSON.parse(content).examples, word); } catch { last = []; }
    if (last.length === 5) return last;
  }
  throw new Error(`品質檢查未通過：${word}，只得到 ${last.length} 句`);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  const query = `SELECT dw.id, dw.word, dw.meaning, dw.meanings, dw.part_of_speech, dw.phrases,
    count(we.id)::int AS existing_examples
    FROM daily_words dw
    LEFT JOIN word_examples we ON we.word_id = dw.id
    ${targetWord ? `WHERE lower(dw.word) = '${targetWord.replaceAll("'", "''")}'` : ""}
    GROUP BY dw.id
    HAVING count(we.id) < 5
    ORDER BY dw.word ${limit ? `LIMIT ${Math.floor(limit)}` : ""}`;
  const { rows } = await client.query(query);
  let cursor = 0; let done = 0; let failed = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= rows.length) return;
      const row = rows[index];
      try {
        const examples = await generate(row.word, row.meaning, row.part_of_speech, row.meanings, row.phrases);
        // Never delete or replace existing rows: official/source examples are immutable.
        // Only fill the missing quota, and skip generated sentences that already exist.
        const existing = await client.query("SELECT english FROM word_examples WHERE word_id = $1", [row.id]);
        const existingCount = existing.rows.length;
        const seen = new Set(existing.rows.map((item) => String(item.english).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()));
        const targetCount = Math.max(5, existingCount);
        for (const example of examples) {
          if (seen.size >= targetCount) break;
          const key = example.english.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
          if (!key || seen.has(key)) continue;
          await client.query("INSERT INTO word_examples (word_id, english, chinese, level, source_kind) VALUES ($1, $2, $3, $4, $5)", [row.id, example.english, example.chinese, example.level, "ai_natural_regenerated"]);
          seen.add(key);
        }
        done += 1;
        if (done % 10 === 0 || done === rows.length) console.log(`進度 ${done}/${rows.length}：${row.word}`);
      } catch (error) {
        failed += 1;
        console.error(`失敗 ${row.word}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) }, worker));
  console.log(JSON.stringify({ total: rows.length, regenerated: done, failed }, null, 2));
} finally { client.release(); await pool.end(); }

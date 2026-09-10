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
  const instruction = `為英文單字「${word}」產生 5 句真正自然、可朗讀、可直接學習用法的英文例句，並提供每句完整繁體中文翻譯。\n詞性：${partOfSpeech || "未知"}\n主要中文義項：${meaning || "未知"}\n其他義項：${JSON.stringify(meanings || [])}\n常見片語：${JSON.stringify(phrases || [])}\n\n要求：把單字放在真實語境中使用，不要解釋單字本身。情境自然分散在日常生活、朋友對話、家庭、旅行、科技、新聞、運動、工作、學校等；句型可以是敘述、否定、問句、對話、條件句或轉折句。每句必須符合詞性、常見搭配與其中一個義項。禁止 In the passage...、The word X...、The writer...、The author...、This sentence shows...、The meaning of X...、helps explain the writer's main idea，以及任何「正在介紹這個單字」的句子。不要五句只替換單字，也不要使用空泛的教材解釋句。只回傳 JSON：{"examples":[{"english":"自然英文句子","chinese":"完整繁體中文翻譯","level":"基礎|會考|進階"}]}`;
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
  const query = `SELECT id, word, meaning, meanings, part_of_speech, phrases FROM daily_words ${targetWord ? `WHERE lower(word) = '${targetWord.replaceAll("'", "''")}'` : ""} ORDER BY word ${limit ? `LIMIT ${Math.floor(limit)}` : ""}`;
  const { rows } = await client.query(query);
  let cursor = 0; let done = 0; let failed = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= rows.length) return;
      const row = rows[index];
      try {
        const examples = await generate(row.word, row.meaning, row.part_of_speech, row.meanings, row.phrases);
        await client.query("BEGIN");
        await client.query("DELETE FROM word_examples WHERE word_id = $1", [row.id]);
        for (const example of examples) await client.query("INSERT INTO word_examples (word_id, english, chinese, level, source_kind) VALUES ($1, $2, $3, $4, $5)", [row.id, example.english, example.chinese, example.level, "ai_natural_regenerated"]);
        await client.query("COMMIT");
        done += 1;
        if (done % 10 === 0 || done === rows.length) console.log(`進度 ${done}/${rows.length}：${row.word}`);
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        failed += 1;
        console.error(`失敗 ${row.word}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) }, worker));
  console.log(JSON.stringify({ total: rows.length, regenerated: done, failed }, null, 2));
} finally { client.release(); await pool.end(); }

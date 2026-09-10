import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import pg from "pg";

const pdfPath = process.argv[2];
if (!pdfPath) throw new Error("Usage: node scripts/import-word-examples.mjs <pdf>");
const textPath = `${pdfPath}.txt`;
try { execFileSync("pdftotext", ["-layout", pdfPath, textPath]); } catch { execFileSync("pdftotext", [pdfPath, textPath]); }
const text = readFileSync(textPath, "utf8").replace(/\r/g, "");
const entries = new Map();
let current = null;
let inWordPart = false;
for (const raw of text.split("\n")) {
  const line = raw.trim().replace(/\s+/g, " ");
  if (/^Part I\s*[｜|]/i.test(line)) { inWordPart = true; continue; }
  if (/^Part II\s*[｜|]/i.test(line)) { inWordPart = false; current = null; break; }
  if (!inWordPart || !line || /英文單字片語例句|^\d+\s*\/\s*\d+$/.test(line)) continue;
  const heading = line.match(/^(\d+)\.\s+(.+)$/);
  if (heading && !/[.!?]$/.test(heading[2])) {
    current = { word: heading[2].trim(), examples: [] };
    entries.set(current.word.toLowerCase(), current);
    continue;
  }
  if (!current) continue;
  const example = line.match(/^(\d+)\.\s+(.+)$/);
  if (example && current.examples.length < 10) current.examples.push(example[2].trim());
}

function normalize(value) { return value.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim(); }
function translate(sentence) {
  const s = sentence.trim();
  let match = s.match(/^The (.+) was mentioned in today's lesson\.$/i);
  if (match) return `今天的課程提到了${match[1]}。`;
  match = s.match(/^We discussed the (.+) in English class\.$/i);
  if (match) return `我們在英文課討論了${match[1]}。`;
  match = s.match(/^The teacher asked us to describe the (.+) in one sentence\.$/i);
  if (match) return `老師要求我們用一句話描述${match[1]}。`;
  match = s.match(/^A clear example helped me understand the (.+) better\.$/i);
  if (match) return `一個清楚的例子幫助我更了解${match[1]}。`;
  match = s.match(/^I wrote (.+) in my vocabulary notebook and reviewed it before the test\.$/i);
  if (match) return `我把${match[1]}寫在單字筆記本裡，並在考試前複習。`;
  match = s.match(/^The students can (.+) the problem step by step\.$/i);
  if (match) return `學生可以一步一步地${match[1]}這個問題。`;
  match = s.match(/^The students need to (.+) carefully before making a decision\.$/i);
  if (match) return `學生在做決定前需要仔細地${match[1]}。`;
  match = s.match(/^The teacher showed us how to (.+) ideally\.$/i);
  if (match) return `老師示範了如何理想地${match[1]}。`;
  match = s.match(/^People may (.+) differently when the situation changes\.$/i);
  if (match) return `當情況改變時，人們可能會以不同方式${match[1]}。`;
  match = s.match(/^I wrote (.+) in my notebook and practiced using it in a sentence\.$/i);
  if (match) return `我把${match[1]}寫在筆記本裡，並練習在句子中使用它。`;
  return "";
}

if (process.env.DRY_RUN === "1") {
  const preview = [...entries.values()].slice(0, 3).map((entry) => ({ word: entry.word, examples: entry.examples.slice(0, 5), translations: entry.examples.slice(0, 5).map(translate) }));
  console.log(JSON.stringify({ parsed: entries.size, preview }, null, 2));
  process.exit(0);
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required (or use DRY_RUN=1)");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  const { rows: words } = await client.query('SELECT id, word FROM daily_words');
  const byWord = new Map(words.map((row) => [normalize(row.word), row]));
  let matched = 0; let inserted = 0; let unmatched = 0;
  await client.query("BEGIN");
  for (const entry of entries.values()) {
    const target = byWord.get(normalize(entry.word));
    if (!target) { unmatched++; continue; }
    matched++;
    for (const english of [...new Set(entry.examples)].slice(0, 5)) {
      const chinese = translate(english);
      const result = await client.query(`INSERT INTO word_examples (word_id, english, chinese, level, source_kind) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`, [target.id, english, chinese, "一般", "uploaded_pdf"]);
      inserted += result.rowCount ?? 0;
    }
  }
  await client.query("COMMIT");
  console.log(JSON.stringify({ parsed: entries.size, matched, inserted, unmatched, note: "中文翻譯使用附件固定句型翻譯；無法安全判斷的句子保留空白，前端會顯示中文整句翻譯尚未建立。" }, null, 2));
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally { client.release(); await pool.end(); }

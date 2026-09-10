import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const word = process.argv[2] || "abortion";
const { rows } = await pool.query("SELECT d.word, e.english, e.chinese, e.source_kind FROM daily_words d JOIN word_examples e ON e.word_id=d.id WHERE lower(d.word)=lower($1) ORDER BY e.created_at DESC LIMIT 5", [word]);
console.log(JSON.stringify(rows, null, 2));
await pool.end();

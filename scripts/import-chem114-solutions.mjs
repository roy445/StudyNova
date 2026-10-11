import fs from "node:fs";
import pg from "pg";

const [activityId, adminId, jsonPath = "scripts/data/chem114-solutions.json"] = process.argv.slice(2);
if (!activityId || !adminId) {
  console.error("用法：DATABASE_URL=... node scripts/import-chem114-solutions.mjs <activityId> <adminUserId> [jsonPath]");
  process.exit(2);
}
const source = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("BEGIN");
  const activity = (await client.query("select id, name from exam_prep_activities where id=$1 for update", [activityId])).rows[0];
  if (!activity) throw new Error("找不到指定活動");
  const job = (await client.query(
    `insert into exam_prep_import_jobs
      (activity_id, uploaded_by, filename, mime_type, checksum, status, stage, progress, page_count, draft_count, error_message)
     values ($1,$2,$3,$4,$5,'pending_review','ready',100,$6,$7,'') returning id`,
    [activityId, adminId, source.source ?? "114-1-1高中化學.pdf", "application/pdf", "ai-solution-bundle:chem114", source.pages.length, source.solutions.reduce((n, p) => n + (p.questions?.length ?? 0), 0)],
  )).rows[0];
  const analysisByPage = new Map(source.solutions.map((page) => [page.page, page]));
  let inserted = 0;
  for (const page of source.pages) {
    const solved = analysisByPage.get(page.page);
    for (const original of page.questions ?? []) {
      const result = solved?.questions?.find((q) => Number(q.number) === Number(original.number));
      const answer = result?.answer == null ? [] : Array.isArray(result.answer) ? result.answer.map(String) : [String(result.answer)];
      const needsReview = Boolean(result?.needs_review) || Number(result?.confidence ?? 0) < 0.65 || !answer.length || !result?.explanation;
      const explanation = String(result?.explanation ?? "");
      await client.query(
        `insert into exam_prep_question_drafts
          (job_id, activity_id, question_number, page_start, page_end, type, subject, stem, options, answer, explanation, confidence, source_metadata, analysis, quality, analysis_status, status, admin_note)
         values ($1,$2,$3,$4,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12::jsonb,$13::jsonb,$14::jsonb,'completed','needs_review',$15)`,
        [job.id, activityId, original.number ?? null, page.page, original.question_type ?? "single", "化學", original.stem ?? "", JSON.stringify(original.options ?? []), JSON.stringify(answer), explanation, Number(result?.confidence ?? original.confidence ?? 0), JSON.stringify({ source: source.source, page: page.page, assets: original.assets ?? page.assets ?? [], orientation: "rotated270", answerGeneratedBy: "gpt-5-mini" }), JSON.stringify({ verifiedAnswer: answer, detailedExplanation: explanation, needsReview }), JSON.stringify({ passed: !needsReview, failed: needsReview ? ["AI 結果需人工複核"] : [], imageCount: (original.image_regions ?? []).length }), needsReview ? "低信心或缺答案／詳解：請人工確認後再核准。" : "AI 已產生答案與詳解，仍須人工確認。"],
      );
      inserted++;
    }
  }
  await client.query("COMMIT");
  console.log(JSON.stringify({ activityId, activity: activity.name, jobId: job.id, inserted, status: "pending_review" }));
} catch (error) {
  await client.query("ROLLBACK");
  console.error(error);
  process.exitCode = 1;
} finally {
  await client.end();
}

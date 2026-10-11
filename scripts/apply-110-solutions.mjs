import fs from 'node:fs';
import pg from '/home/ubuntu/StudyNova/node_modules/pg/lib/index.js';
const {Client}=pg;
const SOL=JSON.parse(fs.readFileSync('/home/ubuntu/StudyNova/work/110/import-bundle/solution-pages.json','utf8'));
const client=new Client({connectionString:process.env.DATABASE_URL});
const BANK='97a3195a-c76d-446c-8f68-c97bb2488a80', JOB='923f930b-9620-4fbb-bb1a-a896eac699a0';
const agg=new Map();
for(const page of SOL){for(const z of page.solutions||[]){const q=Number(z.question_number);if(!Number.isInteger(q))continue;const k=`${page.subject}|${q}`;const cur=agg.get(k)||{subject:page.subject,q,answers:new Set(),explanation:'',pages:[]};for(const a of z.answer||[])if(String(a).trim())cur.answers.add(String(a).trim());if(String(z.explanation||'').trim().length>cur.explanation.length)cur.explanation=String(z.explanation).trim();cur.pages.push(page.page);agg.set(k,cur);}}
await client.connect();
try{await client.query('BEGIN');
const qs=(await client.query(`SELECT id,subject,metadata->>'questionNumber' AS q,answer,explanation FROM questions WHERE bank_id=$1`,[BANK])).rows;
const ds=(await client.query(`SELECT id,question_id,subject,question_number,answer,explanation FROM exam_prep_question_drafts WHERE job_id=$1`,[JOB])).rows;
let qUpdated=0,dUpdated=0,matched=0;
for(const r of qs){const m=agg.get(`${r.subject}|${Number(r.q)}`);if(!m||(!m.explanation&&!m.answers.size))continue;matched++;const answers=[...m.answers];const explanation=m.explanation||r.explanation||'';await client.query(`UPDATE questions SET answer=$1,explanation=$2,metadata=metadata||$3::jsonb,updated_at=now() WHERE id=$4`,[JSON.stringify(answers),explanation,JSON.stringify({solutionPages:[...new Set(m.pages)].sort((a,b)=>a-b),solutionOcr:true}),r.id]);qUpdated++;}
for(const r of ds){const m=agg.get(`${r.subject}|${Number(r.question_number)}`);if(!m||(!m.explanation&&!m.answers.size))continue;const answers=[...m.answers];const explanation=m.explanation||r.explanation||'';await client.query(`UPDATE exam_prep_question_drafts SET answer=$1,explanation=$2,source_metadata=source_metadata||$3::jsonb,admin_note=CASE WHEN admin_note LIKE '%缺少答案%' OR admin_note LIKE '%缺少詳解%' THEN regexp_replace(regexp_replace(admin_note,'缺少答案；','','g'),'缺少詳解；','','g') ELSE admin_note END,updated_at=now() WHERE id=$4`,[JSON.stringify(answers),explanation,JSON.stringify({solutionPages:[...new Set(m.pages)].sort((a,b)=>a-b),solutionOcr:true}),r.id]);dUpdated++;}
await client.query('COMMIT');console.log(JSON.stringify({solutionKeys:agg.size,matchedQuestions:matched,questionsUpdated:qUpdated,draftsUpdated:dUpdated,failedPages:SOL.filter(x=>!x.ok).map(x=>x.page)},null,2));
}catch(e){await client.query('ROLLBACK');console.error(e);process.exitCode=1}finally{await client.end()}

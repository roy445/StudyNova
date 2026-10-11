#!/usr/bin/env python3
"""Build a reviewable 110學測 import bundle from the 123-page scanned PDF.

This is intentionally file-based: production insertion still goes through the
admin import/review API after the generated drafts have been checked.
"""
from __future__ import annotations
import argparse, base64, concurrent.futures, hashlib, json, os, subprocess, time
from pathlib import Path
from openai import OpenAI

SUBJECT_RANGES = {
    "數學 A": [(1, 16), (121, 123)],
    "自然": [(17, 44)],
    "英文": [(45, 59)],
    "國文": [(60, 79)],
    "社會": [(80, 111)],
    "數學 B": [(112, 120)],
}
ASSET_PAGES = {1,2,3,4,6,10,11,12,13,*range(18,45),55,58,59,63,64,68,71,73,74,75,78,79,82,84,85,86,*range(88,105),108,109,110,111,112,113,114,115,117,118,120,121,122,123}
MANUAL_REVIEW = {70, 72}

SCHEMA = {
    "type": "object", "additionalProperties": False,
    "properties": {"questions": {"type": "array", "items": {
        "type": "object", "additionalProperties": False,
        "properties": {
            "question_number": {"type": "integer"},
            "question_type": {"type": "string"},
            "stem": {"type": "string"},
            "options": {"type": "array", "items": {"type": "string"}},
            "answer": {"type": "array", "items": {"type": "string"}},
            "explanation": {"type": "string"},
            "confidence": {"type": "number"},
        },
        "required": ["question_number","question_type","stem","options","answer","explanation","confidence"],
    }}, "page_role": {"type": "string"}, "notes": {"type": "string"}},
    "required": ["questions","page_role","notes"],
}

def subject(page: int) -> str:
    for name, ranges in SUBJECT_RANGES.items():
        if any(a <= page <= b for a,b in ranges): return name
    return "其他"

def render(pdf: Path, out: Path, page: int):
    target = out / f"page-{page:03d}.png"
    if target.exists() and target.stat().st_size > 1000: return target
    subprocess.run(["pdftoppm", "-f", str(page), "-l", str(page), "-png", "-r", "150", str(pdf), str(out / f"page-{page:03d}")], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    generated = out / f"page-{page:03d}-{page}.png"
    if not generated.exists():
        candidates = sorted(out.glob(f"page-{page:03d}-*.png"))
        if candidates: generated = candidates[-1]
    generated.rename(target)
    return target

def analyse(path: Path, page: int, model: str):
    data = base64.b64encode(path.read_bytes()).decode()
    prompt = f"""你是台灣學測題庫資料工程師。這是 110 年學測掃描卷原卷第 {page} 頁，歸類科目為「{subject(page)}」。請只根據影像辨識，不可補造影像外資訊。\n
若本頁是封面、純詳解、答案表或無法辨識，questions 請回傳空陣列，page_role 說明。若有題目，逐題輸出完整題號、題幹、選項、卷面標準答案（若影像沒有明確答案則空陣列）、卷面詳解（若本頁沒有則空字串）。數學式、化學式、表格內容盡量原樣保留；不能確定的字詞在 notes 說明。頁碼不得跨頁猜測。"""
    client = OpenAI()
    for attempt in range(3):
        try:
            r = client.chat.completions.create(
                model=model,
                messages=[{"role":"system","content":"只輸出符合 JSON Schema 的 JSON。"},{"role":"user","content":[{"type":"text","text":prompt},{"type":"image_url","image_url":{"url":f"data:image/png;base64,{data}","detail":"high"}}]}],
                response_format={"type":"json_schema","json_schema":{"name":"exam_page","strict":True,"schema":SCHEMA}},
                max_completion_tokens=5000,
            )
            return json.loads(r.choices[0].message.content)
        except Exception as e:
            if attempt == 2: return {"questions": [], "page_role":"analysis_failed", "notes":str(e)}
            time.sleep(2 ** attempt)

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--pdf", required=True); ap.add_argument("--out", required=True); ap.add_argument("--workers", type=int, default=4); ap.add_argument("--model", default="gpt-5-mini"); ap.add_argument("--start", type=int, default=1); ap.add_argument("--end", type=int, default=123)
    args=ap.parse_args(); root=Path(args.out); assets=root/"assets"; assets.mkdir(parents=True,exist_ok=True); results=root/"page-analysis.jsonl"
    pdf=Path(args.pdf); checksum=hashlib.sha256(pdf.read_bytes()).hexdigest()
    existing={}
    if results.exists():
        for line in results.read_text().splitlines():
            try: existing[json.loads(line)["page"]]=json.loads(line)
            except Exception: pass
    pages=list(range(args.start,args.end+1))
    def one(p):
        img=render(pdf,assets,p)
        if p in existing: return existing[p]
        parsed=analyse(img,p,args.model)
        row={"page":p,"subject":subject(p),"asset_id":f"110-page-{p:03d}","asset_path":str(img.relative_to(root)),"has_required_visual":p in ASSET_PAGES,"review_status":"needs_manual_review" if p in MANUAL_REVIEW else "ai_draft","analysis":parsed}
        return row
    rows=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as ex:
        for i,row in enumerate(ex.map(one,pages),1):
            rows.append(row); results.write_text("\n".join(json.dumps(x,ensure_ascii=False) for x in sorted(rows,key=lambda x:x["page"]))+"\n")
            print(f"processed {i}/{len(pages)} page={row['page']} subject={row['subject']} questions={len(row['analysis'].get('questions',[]))}",flush=True)
    drafts=[]
    for row in sorted(rows,key=lambda x:x["page"]):
        for q in row["analysis"].get("questions",[]):
            drafts.append({"source_page":row["page"],"subject":row["subject"],"question_number":q.get("question_number"),"type":q.get("question_type","single"),"stem":q.get("stem",""),"options":q.get("options",[]),"answer":q.get("answer",[]),"explanation":q.get("explanation",""),"confidence":q.get("confidence",0),"asset_ids":[row["asset_id"]] if row["has_required_visual"] else [],"review_status":"needs_manual_review" if row["review_status"]=="needs_manual_review" else "needs_review","source_metadata":{"filename":pdf.name,"page_start":row["page"],"page_end":row["page"],"parser":"gpt-5-mini-vision","required_visual":row["has_required_visual"]}})
    (root/"drafts.json").write_text(json.dumps(drafts,ensure_ascii=False,indent=2)+"\n")
    manifest={"year":110,"exam_name":"110 年學測","pdf":pdf.name,"pdf_sha256":checksum,"page_count":123,"subjects":SUBJECT_RANGES,"required_visual_pages":sorted(ASSET_PAGES),"manual_review_pages":sorted(MANUAL_REVIEW),"draft_count":len(drafts),"pages":len(rows),"status":"needs_manual_review","generated_at":time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),"next_step":"Upload PDF through /admin/previous-exams or adapt drafts.json to the admin import API; do not publish until all drafts pass AI quality gate and human review."}
    (root/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n")
    print(json.dumps(manifest,ensure_ascii=False,indent=2))
if __name__=='__main__': main()

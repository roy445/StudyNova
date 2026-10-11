from __future__ import annotations
import base64, json, os, re, time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from openai import OpenAI

ROOT=Path('/home/ubuntu/StudyNova/work/110/import-bundle/assets')
OUT=Path('/home/ubuntu/StudyNova/work/110/import-bundle/solution-pages.json')
PAGES=[]
for a,b,subject in [(10,16,'數學 A'),(38,44,'自然'),(55,59,'英文'),(75,79,'國文'),(104,111,'社會'),(120,120,'數學 B'),(121,123,'數學 A')]:
    PAGES += [(p,subject) for p in range(a,b+1)]

SCHEMA={"type":"object","properties":{"pages":{"type":"array","items":{"type":"object","properties":{"question_number":{"type":"integer"},"answer":{"type":"array","items":{"type":"string"}},"explanation":{"type":"string"},"confidence":{"type":"number"},"notes":{"type":"string"}},"required":["question_number","answer","explanation","confidence","notes"],"additionalProperties":False}}},"required":["pages"],"additionalProperties":False}

def one(item):
    page,subject=item
    raw=(ROOT/f'page-{page:03d}.png').read_bytes()
    b64=base64.b64encode(raw).decode()
    client=OpenAI()
    prompt=f'''這是 110 年學測的「{subject}」詳解／答案頁，原始 PDF 第 {page} 頁。請逐一辨識本頁所有可見題號，擷取該題的標準答案與原卷詳解文字。若本頁是答案表，answer 填選項或數值；若是非選題，填可見的作答結果。若詳解跨頁或文字不清，explanation 仍保留目前能讀到的內容並在 notes 說明，不要自己補造。不要遺漏本頁任何題號。只輸出符合 JSON schema 的資料。'''
    for attempt in range(4):
        try:
            r=client.chat.completions.create(model='gemini-3-flash-preview',messages=[{'role':'user','content':[{'type':'text','text':prompt},{'type':'image_url','image_url':{'url':f'data:image/png;base64,{b64}','detail':'high'}}]}],max_tokens=10000,response_format={'type':'json_schema','json_schema':{'name':'solution_page','strict':True,'schema':SCHEMA}})
            data=json.loads(r.choices[0].message.content)
            return {'page':page,'subject':subject,'solutions':data.get('pages',[]),'ok':True}
        except Exception as e:
            if attempt==3:return {'page':page,'subject':subject,'solutions':[],'ok':False,'error':str(e)}
            time.sleep(2**attempt)

existing=[]
if OUT.exists():
    try: existing=json.loads(OUT.read_text())
    except: existing=[]
by_page={x['page']:x for x in existing}
need=[x for x in PAGES if x[0] not in by_page or not by_page[x[0]].get('ok')]
print(f'pages={len(PAGES)} need={len(need)}',flush=True)
with ThreadPoolExecutor(max_workers=4) as ex:
    fs=[ex.submit(one,x) for x in need]
    for i,f in enumerate(as_completed(fs),1):
        r=f.result(); by_page[r['page']]=r
        OUT.write_text(json.dumps([by_page[p] for p,_ in PAGES if p in by_page],ensure_ascii=False,indent=2))
        print(f"{i}/{len(need)} page={r['page']} subject={r['subject']} solutions={len(r.get('solutions',[]))} ok={r.get('ok')}",flush=True)
print(json.dumps({'pages':len(by_page),'ok':sum(x.get('ok') for x in by_page.values()),'output':str(OUT)},ensure_ascii=False))

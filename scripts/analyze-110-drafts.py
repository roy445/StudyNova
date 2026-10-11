from __future__ import annotations
import argparse, concurrent.futures, json, time
from pathlib import Path
from openai import OpenAI
SCHEMA={"type":"object","additionalProperties":False,"properties":{"verified_answer":{"type":"array","items":{"type":"string"}},"understanding":{"type":"string"},"answer_reason":{"type":"string"},"approach":{"type":"string"},"detailed_explanation":{"type":"string"},"option_analysis":{"type":"array","items":{"type":"object","additionalProperties":False,"properties":{"option":{"type":"string"},"reason":{"type":"string"}},"required":["option","reason"]}},"core_concept":{"type":"string"},"common_errors":{"type":"array","items":{"type":"string"}},"memory_tip":{"type":"string"}},"required":["verified_answer","understanding","answer_reason","approach","detailed_explanation","option_analysis","core_concept","common_errors","memory_tip"]}
def norm(x): return ''.join(x.strip().lower().split()).replace('（','(').replace('）',')')
def idx(x, opts):
 x=norm(x)
 if len(x)==1 and 'a'<=x<='z': return ord(x)-97
 if x.isdigit(): return int(x)-1
 for i,o in enumerate(opts):
  if x==norm(o): return i
 return None
def gate(d,a):
 checks={"has_stem":len(d['stem'].strip())>=4,"has_options":len(d['options'])<2 or len(d['options'])>=2,"answer_present":bool(d['answer'] or a['verified_answer']),"has_understanding":len(a['understanding'].strip())>=12,"has_approach":len(a['approach'].strip())>=12,"has_explanation":len(a['detailed_explanation'].strip())>=24,"has_concept":bool(a['core_concept'].strip()),"has_errors":bool(a['common_errors']),"has_option_analysis":len(d['options'])<2 or len(a['option_analysis'])==len(d['options'])}
 conflict=False
 if d['answer'] and a['verified_answer']:
  expected={idx(x,d['options']) for x in d['answer']}; actual={idx(x,d['options']) for x in a['verified_answer']}; conflict=expected != actual
 checks['no_answer_conflict']=not conflict
 failed=[k for k,v in checks.items() if not v]
 return {"passed":not failed,"score":round(100*sum(checks.values())/len(checks)),"checks":checks,"failed":failed,"answer_conflict":conflict}
def one(d,model):
 opts='\n'.join(f'{chr(65+i)}. {x}' for i,x in enumerate(d['options'])) or '（無選項）'
 prompt=f"""請分析台灣 110 年學測正式題目，只根據提供內容推導，不可補造圖表資訊。若資料不足，verified_answer 留空並說明。\n科目：{d['subject']}\n題幹：{d['stem']}\n選項：\n{opts}\n卷面答案：{'、'.join(d['answer']) or '未提供'}\n卷面詳解：{d['explanation'] or '未提供'}"""
 c=OpenAI()
 for n in range(3):
  try:
   r=c.chat.completions.create(model=model,messages=[{"role":"system","content":"你是嚴謹的學測題目審核專家，只輸出 JSON。"},{"role":"user","content":prompt}],response_format={"type":"json_schema","json_schema":{"name":"question_analysis","strict":True,"schema":SCHEMA}},max_completion_tokens=3200)
   a=json.loads(r.choices[0].message.content); return {"analysis":a,"quality":gate(d,a)}
  except Exception as e:
   if n==2:return {"analysis":{},"quality":{"passed":False,"score":0,"failed":["analysis_failed"],"error":str(e)}}
   time.sleep(2**n)
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--input',required=True);ap.add_argument('--output',required=True);ap.add_argument('--workers',type=int,default=4);ap.add_argument('--model',default='gpt-5-mini');args=ap.parse_args()
 rows=json.loads(Path(args.input).read_text()); out=[]
 def work(d): return {**d,**one(d,args.model)}
 with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as ex:
  for i,r in enumerate(ex.map(work,rows),1): out.append(r); print(f'analyzed {i}/{len(rows)}',flush=True)
 Path(args.output).write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
 stats={"total":len(out),"passed":sum(bool(x['quality'].get('passed')) and x['review_status']=='needs_review' for x in out),"manual":sum(x['review_status']=='needs_manual_review' for x in out),"failed":sum(not x['quality'].get('passed',False) for x in out),"answer_conflicts":sum(x['quality'].get('answer_conflict',False) for x in out)}
 Path(Path(args.output).with_suffix('.stats.json')).write_text(json.dumps(stats,ensure_ascii=False,indent=2)+'\n');print(json.dumps(stats,ensure_ascii=False))
if __name__=='__main__':main()

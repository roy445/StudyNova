import base64,json,os
from pathlib import Path
from openai import OpenAI
client=OpenAI()
items=[(75,'國文','left','請擷取這張 110 年學測國文詳解頁左側的答案表。輸出 JSON：{"answers":[{"question_number":整數,"answer":[字串]}]}。逐列讀取 1 到 38 題；非選題答案可填空陣列。'),(75,'國文','right','請擷取這張 110 年學測國文詳解頁右側可見的第 5 到 10 題解析。輸出 JSON：{"solutions":[{"question_number":整數,"answer":[字串],"explanation":字串}]}。只保留清楚可見內容，解析簡潔但不得自行補造。'),(104,'社會','left','請擷取這張 110 年學測社會詳解頁左側的答案表。輸出 JSON：{"answers":[{"question_number":整數,"answer":[字串]}]}。逐列讀取 1 到 68 題；非選題答案可填空陣列。'),(104,'社會','right','請擷取這張 110 年學測社會詳解頁右側可見的第 5 到 10 題解析。輸出 JSON：{"solutions":[{"question_number":整數,"answer":[字串],"explanation":字串}]}。只保留清楚可見內容，解析簡潔但不得自行補造。')]
out=[]
for p,s,side,prompt in items:
 b=base64.b64encode(Path(f'/tmp/page-{p}-{side}.png').read_bytes()).decode()
 r=client.chat.completions.create(model='gemini-3-flash-preview',messages=[{'role':'user','content':[{'type':'text','text':prompt},{'type':'image_url','image_url':{'url':f'data:image/png;base64,{b}','detail':'high'}}]}],max_tokens=5000,response_format={'type':'json_object'})
 data=json.loads(r.choices[0].message.content);out.append({'page':p,'subject':s,'side':side,'data':data});print(p,side,len(json.dumps(data,ensure_ascii=False)),flush=True)
Path('work/110/import-bundle/solution-retry.json').write_text(json.dumps(out,ensure_ascii=False,indent=2))

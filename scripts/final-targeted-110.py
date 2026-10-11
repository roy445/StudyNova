import base64,json
from pathlib import Path
from openai import OpenAI
c=OpenAI(); tasks=[
(105,'社會','請只擷取第19題的標準答案與詳解；輸出 JSON {"question_number":19,"answer":["..."],"explanation":"..."}，若本頁沒有第19題就回傳空字串。'),
(41,'自然','請只擷取第30題的標準答案與詳解；輸出 JSON {"question_number":30,"answer":["..."],"explanation":"..."}，若本頁沒有第30題就回傳空字串。'),
(56,'英文','請只擷取第39題的標準答案與詳解；輸出 JSON {"question_number":39,"answer":["..."],"explanation":"..."}，若本頁沒有第39題就回傳空字串。'),
(120,'數學 B','請讀取頁面左上方答案表第8至12題，輸出 JSON {"solutions":[{"question_number":8,"answer":["..."]}]}，只填答案，不要推導不存在的詳解。')]
out=[]
for p,s,prompt in tasks:
 b=base64.b64encode(Path(f'work/110/import-bundle/assets/page-{p:03d}.png').read_bytes()).decode()
 r=c.chat.completions.create(model='gemini-3-flash-preview',messages=[{'role':'user','content':[{'type':'text','text':prompt},{'type':'image_url','image_url':{'url':f'data:image/png;base64,{b}','detail':'high'}}]}],max_tokens=2200,response_format={'type':'json_object'})
 t=r.choices[0].message.content
 try:d=json.loads(t)
 except:d={'raw':t}
 out.append({'page':p,'subject':s,'data':d});print(p,s,flush=True)
Path('work/110/import-bundle/solution-final-targeted.json').write_text(json.dumps(out,ensure_ascii=False,indent=2))

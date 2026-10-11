import base64,json
from pathlib import Path
from openai import OpenAI
client=OpenAI()
items=[(75,'國文','請只擷取第 1 到 8 題。這是詳解頁，請讀取答案表中的標準答案，以及右欄每題的解析。輸出 JSON {"solutions":[{"question_number":1,"answer":["A"],"explanation":"..."}]}，每題一筆，解析可簡潔但要忠實。'),(104,'社會','請只擷取第 1 到 10 題。這是詳解頁，請讀取答案表中的標準答案，以及頁面中每題的解析。輸出 JSON {"solutions":[{"question_number":1,"answer":["A"],"explanation":"..."}]}，每題一筆，解析可簡潔但要忠實。'),(119,'數學 B','請擷取本頁所有可見題號（尤其第 8 到 19 題）的標準答案與詳解。輸出 JSON {"solutions":[{"question_number":1,"answer":["(1)"],"explanation":"..."}]}，只填清楚可見內容。')]
out=[]
for p,s,prompt in items:
 b=base64.b64encode(Path(f'work/110/import-bundle/assets/page-{p:03d}.png').read_bytes()).decode()
 r=client.chat.completions.create(model='gemini-3-flash-preview',messages=[{'role':'user','content':[{'type':'text','text':prompt},{'type':'image_url','image_url':{'url':f'data:image/png;base64,{b}','detail':'high'}}]}],max_tokens=6000,response_format={'type':'json_object'})
 text=r.choices[0].message.content
 try:data=json.loads(text)
 except Exception as e:data={'raw':text,'parse_error':str(e)}
 out.append({'page':p,'subject':s,'data':data});print(p,s,len(text),flush=True)
Path('work/110/import-bundle/solution-targeted.json').write_text(json.dumps(out,ensure_ascii=False,indent=2))

# StudyNova 題目檔案批次匯入

`scripts/import-question-files.mjs` 會掃描指定資料夾中的 PDF、PNG、JPG、WEBP、JSON 與 JSONL，將可辨識的內容轉成 StudyNova 管理員題庫頁可接受的 JSON 陣列。PDF 使用 `pdftotext`；圖片優先使用本機 Tesseract，若沒有可設定 `OPENAI_API_KEY` 與視覺模型進行 OCR。OCR 不清楚或讀不到文字時，腳本會標示錯誤，不會自行猜答案。

## 使用方式

```bash
node scripts/import-question-files.mjs \
  --input /home/ubuntu/upload \
  --out /tmp/studynova-question-import.json \
  --max 5000 \
  --dry-run
```

完成確認後移除 `--dry-run`。腳本會輸出一個 JSON 陣列，可直接貼到後台「題庫」頁的匯入框。相同題目會在腳本內先去重，後端匯入時也會再透過 fingerprint 去重，因此可安全重複執行。

如果要在已登入的管理員 session 下直接送到後端，可以提供 API URL 與目前瀏覽器的 session cookie；不要把 cookie 寫入 Git 或分享給其他人：

```bash
node scripts/import-question-files.mjs \
  --input /home/ubuntu/upload \
  --endpoint https://study-nova-psi.vercel.app/api/v1/admin/questions/import \
  --cookie 'sn_session=你的管理員SessionCookie'
```

預設只掃描題目相關格式：PDF、圖片、JSON 與 JSONL。若要把 TXT／Markdown 也當作來源，額外加上 `--include-text`；一般說明文件不建議加入，避免產生非題目內容。

## 圖片 OCR

本機有 Tesseract 時可設定語言，例如：

```bash
TESSERACT_LANG=eng+chi_tra node scripts/import-question-files.mjs --input ./materials --out ./question-import.json
```

如果沒有 Tesseract，使用視覺 OCR：

```bash
OPENAI_API_KEY="$OPENAI_API_KEY" \
OPENAI_VISION_MODEL="gpt-4o-mini" \
node scripts/import-question-files.mjs --input ./materials --out ./question-import.json
```

若圖片包含簽名、模糊手寫、非題目 Logo 或無法辨識的內容，腳本會回報該檔案，不會建立虛構題目。

## 題庫欄位

文字欄位會依檔名推測 `subject`、`bankCategory`、`topic` 與 `sourceLabel`，也可以直接使用 JSON／JSONL 提供完整欄位：

```json
{
  "subject": "英文",
  "topic": "片語",
  "bankCategory": "英文片語",
  "sourceLabel": "英文片語講義 PDF",
  "level": "senior",
  "difficulty": "normal",
  "type": "short",
  "stem": "請寫出 look forward to 的意思。",
  "options": [],
  "answer": ["期待"],
  "explanation": "look forward to 後接名詞或 V-ing。"
}
```

批次腳本只負責檔案擷取與格式化；匯入後仍建議在管理後台抽查題目、答案與分類，再將題庫加入活動出題範圍。

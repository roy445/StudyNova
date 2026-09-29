# StudyNova AI 朗讀與 Queue Cron 部署指南

本指南說明如何讓 StudyNova 的「AI 朗讀」產生音檔，以及讓 PostgreSQL 背景工作持續被處理。**不需要自備 GPU：目前推薦先用 Azure Speech F0 的線上 Neural TTS 免費額度**；CosyVoice/GPT-SoVITS 自架方式仍保留在後段，供已有 GPU 主機或需要自訂模型時使用。

Azure 路徑直接由 StudyNova server-side 呼叫 Azure Speech REST API，Azure 回傳 WAV 後沿用 StudyNova 現有物件儲存流程，不需要另外租 GPU 主機或部署 TTS adapter。`workers/cosyvoice-adapter/` 則是可選的自架方案。

## Azure Speech F0（線上、免 GPU）

Microsoft 官方目前列出 Neural TTS **每月 500,000 字元免費額度**；F0 standard voices 限制為 **每分鐘最多 20 次請求**、單次合成最長 10 分鐘。這是有限額免費服務，不是無限量；建立資源時請選 **F0 (Free)**，不要切換成付費的 S0。額度/規則可能調整，操作前可再看[官方價格](https://azure.microsoft.com/en-us/pricing/details/speech/)與[官方配額](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-services-quotas-and-limits)。

1. 在 Azure Portal 建立 **Speech** resource，pricing tier 選 **F0 (Free)**；選擇 Azure TTS 支援的地區，記下該 resource 的 region slug（例如 `eastasia`）。
2. 在該 Speech resource 的 **Keys and Endpoint** 頁複製一組 key。**不要把 key 貼到聊天、程式碼或 GitHub**。
3. 在 Vercel Project → **Settings → Environment Variables** 的 Production 加入 `AZURE_SPEECH_KEY` 和 `AZURE_SPEECH_REGION`；key 只放 server-side，絕不加 `NEXT_PUBLIC_`。
4. 重新部署 StudyNova。新建的課文朗讀工作會在有 Azure key/region 時自動選 Azure；未設定 Azure 時保留原本的自架 worker fallback。繁體中文預設使用 `zh-TW-HsiaoChenNeural`，也支援程式內列出的英文、簡中、日文、韓文及俄文預設 voice。
5. 先用短課文測試。若回 HTTP 429，通常是 F0 每分鐘 request rate 或免費額度限制；等候後再試，或減少每次工作/區段數。Azure Speech 錯誤訊息不會包含 resource key。

`TTS_REQUEST_TIMEOUT_MS` 預設 120 秒、上限 300 秒。`AZURE_SPEECH_KEY` 和 `AZURE_SPEECH_REGION` 必須屬於同一個 Speech resource。任何 Azure key 請由使用者自行保存在 Vercel，不要傳給協助部署的人。

## 1. 先選擇 TTS 部署方式

| 方案 | 適合情況 | 維運與成本 | 注意事項 |
|---|---|---|---|
| **Azure Speech F0（推薦、免 GPU）** | 想直接使用線上課文朗讀且維持低成本 | 無需 GPU 主機；官方 F0 Neural TTS 額度為每月 500,000 字元 | 需 Azure Speech resource key/region；F0 有固定 rate limit，不是無限量 |
| **CosyVoice 自架（本指南示範）** | 想控制模型/資料，或已有 GPU 主機 | 需要 GPU 主機、模型磁碟空間與更新維運；GPU 費用按供應商/使用時間計 | StudyNova adapter 目前固定使用設定好的 SFT speaker；目前不套用 request 的語速參數 |
| **GPT-SoVITS 自架** | 需要 few-shot 聲音複製或自訂聲線 | 設定與模型管理較複雜，也需要 GPU 主機 | 要另外做符合 StudyNova `POST /v1/tts` JSON 合約的 adapter；上游 API 格式不能直接當成本應用的 TTS endpoint |

以下 Docker 章節只供選擇 CosyVoice 自架時使用；Azure 使用者不必執行任何 GPU 主機或 Docker 步驟。CosyVoice upstream 對話模型及語音模型版本會更新；部署前請依官方 repository/模型卡的授權條款選擇模型。

## 2. 架構與必要設定

```text
StudyNova on Vercel
  ├─ POST /api/v1/tts/jobs
  ├─ PostgreSQL job_queue + 每分鐘 queue_drain cron
  ├─ Azure F0：server-side REST + AZURE_SPEECH_KEY/REGION（免 GPU）
  └─ optional self-hosted fallback：TTS_SERVICE_URL / Bearer token
       HTTPS → StudyNova adapter → CosyVoice / GPT-SoVITS
```

Azure F0 直接接收 SSML POST 並回傳 WAV bytes；StudyNova 會以 server-side resource key 呼叫 Azure，之後沿用既有音檔儲存流程。選擇舊式自架 worker 時，StudyNova 才會對 `TTS_SERVICE_URL + /v1/tts` 發出 JSON POST，並以 `Authorization: Bearer ...` 傳送 `TTS_SERVICE_TOKEN`。對外只公開 HTTPS adapter；**CosyVoice 的 50000 port 不應直接公開到網際網路**。

## 3. GPU 主機準備

準備一台可長時間執行 Docker 的 Linux 主機、NVIDIA GPU、正確的 NVIDIA driver，以及 NVIDIA Container Toolkit。部署前先確認：

```bash
nvidia-smi
docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi
```

第二個指令必須能在 container 內看到 GPU。若失敗，先依 GPU 主機供應商的 NVIDIA Container Toolkit 文件修好 Docker/GPU runtime；不要進行下一步。

CosyVoice upstream 提供 `runtime/python` Docker build 與 FastAPI inference server。第一次建置和下載模型可能耗時；模型檔會占用額外磁碟空間。

## 4. 建立 CosyVoice 官方服務

在 GPU 主機執行：

```bash
git clone --recursive https://github.com/FunAudioLLM/CosyVoice.git
cd CosyVoice/runtime/python
docker build -t cosyvoice:v1.0 .
docker network create studynova-tts
sudo install -d -m 755 /var/lib/studynova-cosyvoice-cache
```

啟動 SFT FastAPI 模型。此例使用官方模型 `iic/CosyVoice-300M-SFT`；容器只加入私有 Docker network，不做 `-p 50000:50000` 公網 port mapping：

```bash
docker run -d \
  --name cosyvoice \
  --restart unless-stopped \
  --runtime=nvidia \
  --network studynova-tts \
  --volume /var/lib/studynova-cosyvoice-cache:/root/.cache \
  cosyvoice:v1.0 \
  /bin/bash -c 'cd /opt/CosyVoice/CosyVoice/runtime/python/fastapi && python3 server.py --port 50000 --model_dir iic/CosyVoice-300M-SFT && sleep infinity'
```

確認啟動與模型下載狀態：

```bash
docker ps --filter name=cosyvoice
docker logs --tail 100 cosyvoice
```

若官方容器的 GPU runtime 在你的主機上使用 `--gpus all` 而非 `--runtime=nvidia`，可以改成主機支援的 Docker GPU 參數。請先確認 `nvidia-smi` 在 container 內正常。

## 5. 建置 StudyNova adapter

回到 StudyNova 專案目錄（或將 `workers/cosyvoice-adapter/` 複製到 GPU 主機）。產生至少 32-byte 隨機 token，**不要把 token 寫入 Git、公開 issue 或前端環境變數**：

```bash
openssl rand -hex 32
```

將產生的值保存在安全的密碼管理器，並分別用於 adapter 與 Vercel 的 `TTS_SERVICE_TOKEN`。在 GPU 主機上建立權限受限的 env file：

```bash
sudo install -d -m 700 /etc/studynova-tts
sudoedit /etc/studynova-tts/worker.env
sudo chmod 600 /etc/studynova-tts/worker.env
```

檔案內容（將 token 替換成剛才產生的隨機值）：

```dotenv
COSYVOICE_URL=http://cosyvoice:50000
COSYVOICE_SPK_ID=中文女
COSYVOICE_SAMPLE_RATE=22050
COSYVOICE_TIMEOUT_SECONDS=180
TTS_WORKER_TOKEN=請貼上隨機token
```

在 StudyNova repo root 建置並執行 adapter：

```bash
docker build -t studynova-cosyvoice-adapter ./workers/cosyvoice-adapter
docker run -d \
  --name studynova-tts-worker \
  --restart unless-stopped \
  --network studynova-tts \
  --publish 127.0.0.1:8000:8000 \
  --env-file /etc/studynova-tts/worker.env \
  studynova-cosyvoice-adapter
```

`127.0.0.1:8000` 只供同一台主機上的 TLS reverse proxy 連線。`/healthz` 是無需登入的存活檢查；`/v1/tts` 必須提供 Bearer token。這個簡易 adapter 使用固定的 `COSYVOICE_SPK_ID`；StudyNova request 傳入的 `language`/`speed` 不會在此 adapter 中改變 CosyVoice 語言或語速。如需可切換聲線/語速，需再擴充 adapter 和 UI。

## 6. 提供 HTTPS URL

設定你自己的 DNS，例如 `tts.example.com` 指向 GPU 主機。使用 Caddy、Nginx + Certbot 或雲端 HTTPS proxy，將 HTTPS 443 反向代理到 `127.0.0.1:8000`。Caddy 範例：

```caddyfile
tts.example.com {
  reverse_proxy 127.0.0.1:8000
}
```

防火牆只允許必要的管理連線及 HTTPS 443；**不要開放 TCP 50000（CosyVoice）或 TCP 8000（adapter）給公網**。若使用雲端 proxy，確認 request body/response size 和 timeout 可以容納音訊 JSON 回應。

檢查 adapter health：

```bash
curl -fsS https://tts.example.com/healthz
```

預期回傳：`{"status":"ok"}`。health endpoint 只表示 adapter process 正常；模型是否能推論還要做下一段端到端測試。

## 7. 自架 CosyVoice 時的 Vercel 環境變數（Azure 不需要）

只有選擇上面的自架 CosyVoice/GPT-SoVITS worker 才需要這些值；Azure F0 只需設定前述 `AZURE_SPEECH_KEY` 與 `AZURE_SPEECH_REGION`。在 Vercel 專案 **Settings → Environment Variables** 設定 Production（若 Preview 也要測試，另在 Preview 設定）並重新部署：

| 變數 | 值 |
|---|---|
| `TTS_SERVICE_URL` | `https://tts.example.com`，不要加 `/v1/tts` |
| `TTS_SERVICE_TOKEN` | 與 GPU 主機 `TTS_WORKER_TOKEN` 完全相同的隨機 token |
| `TTS_REQUEST_TIMEOUT_MS` | 可先用 `200000`（3 分 20 秒），比 worker 的 180 秒 timeout 多留網路回應時間；程式允許 5 秒到 5 分鐘，預設 2 分鐘 |
| `CRON_SECRET` | 獨立產生的另一組高熵隨機 secret，不要和 TTS token 共用 |

`TTS_SERVICE_TOKEN` 是 server-only 變數，不要加 `NEXT_PUBLIC_`。完成後重新部署 Vercel，環境變數才會套用至新 deployment。

## 8. 加入 queue_drain cron（每分鐘）

TTS job 會進 PostgreSQL `job_queue`。若只有 Vercel serverless，沒有常駐 queue consumer，就要每分鐘呼叫一次 StudyNova 的 queue drain endpoint：

```text
GET https://<你的 StudyNova 網域>/api/cron/queue-drain
```

此路徑沿用 `/api/v1/system/cron` 的 `CRON_SECRET` 驗證，並固定執行 `queue_drain`，無需在 URL 放 task 或 secret。

### 方案 A：Vercel Cron（Pro / Enterprise）

Vercel 官方方案表目前指出 Hobby 最快只能每日一次，Pro/Enterprise 可每分鐘執行。若你是 Pro/Enterprise，在 repo root 的 `vercel.json` 新增 `crons`（已有此檔時只合併欄位，不要覆寫其他設定）：

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    {
      "path": "/api/cron/queue-drain",
      "schedule": "* * * * *"
    }
  ]
}
```

在 Vercel Production Environment Variables 設定 `CRON_SECRET`，然後部署。Vercel Cron 會自動將該值放在 `Authorization: Bearer <CRON_SECRET>` header；StudyNova endpoint 同時支援這種格式。到 Vercel **Settings → Cron Jobs** 確認排程已出現，並查看執行紀錄。

### 方案 B：外部排程器（例如 Cron-job.org）

若使用 Vercel Hobby，Vercel 原生 Cron 不能每分鐘執行。可在外部排程器建立每分鐘排程：

- URL：`https://<你的 StudyNova 網域>/api/cron/queue-drain`
- Method：`GET`
- Custom header：`x-cron-secret: <與 Vercel CRON_SECRET 完全相同的值>`
- Schedule：每分鐘一次

**重要限制：**Cron-job.org 官方 FAQ 說明其最短間隔為每分鐘、支援自訂 HTTP headers，但單次 HTTP request 超過 30 秒會 timeout。queue drain 可能呼叫 AI 或 TTS worker，若一分鐘內處理的工作超過 30 秒，這個免費方案不能保證完成；請改用能等待足夠久的排程/常駐 worker，或選擇支援所需頻率與執行時間的 Vercel 方案。不要把 secret 放在 URL query string。

## 9. 端到端測試

### 測試自架 TTS worker（Azure 使用者可略過）

從可連到公開 HTTPS 網域的機器執行，將 token 放進本機 shell 變數，不要貼在公開日誌：

```bash
export TTS_TOKEN='貼上 TTS_SERVICE_TOKEN'
curl -fsS https://tts.example.com/healthz
```

接著送一段短句；用 Python 儲存 WAV，不要把長 base64 輸出到終端：

```bash
python3 - <<'PY'
import base64, json, os, urllib.request
payload = json.dumps({
    "text": "你好，這是 StudyNova 課文朗讀測試。",
    "language": "zh-TW",
    "voice": "default",
    "speed": 1,
    "provider": "cosyvoice",
}).encode()
request = urllib.request.Request(
    "https://tts.example.com/v1/tts",
    data=payload,
    headers={"Content-Type": "application/json", "Authorization": f"Bearer {os.environ['TTS_TOKEN']}"},
)
with urllib.request.urlopen(request, timeout=180) as response:
    result = json.load(response)
with open("studynova-tts-test.wav", "wb") as audio:
    audio.write(base64.b64decode(result["audioBase64"]))
print("Saved studynova-tts-test.wav; duration_ms=", result.get("durationMs"))
PY
```

### 測試 queue cron

若用外部排程器，從安全 shell 設定 `CRON_SECRET` 後呼叫：

```bash
curl -i \
  -H "x-cron-secret: ${CRON_SECRET}" \
  "https://<你的 StudyNova 網域>/api/cron/queue-drain"
```

預期 HTTP 200 並回傳 queue drain 統計。401/403 表示 secret/header 不一致；500 通常要到 StudyNova 管理後台 System Health / Cron、Vercel Function logs 與資料庫錯誤紀錄查看。不要把完整 secret 貼進 issue 或截圖。

### 測試教材朗讀

在 StudyNova：

1. 上傳有可讀文字的教材，或貼上課文。
2. 開啟教材，先按 **內容理解**，等狀態完成（TTS 需要已完成的 reading segments）。
3. 按 **AI 朗讀**。工作會先進 PostgreSQL queue，再由即時 drain/每分鐘 cron 處理。
4. 若失敗，查看該 TTS job 的 `errorCode`/`errorMessage`、Vercel logs，以及 GPU 主機 `docker logs --tail 100 studynova-tts-worker` 和 `docker logs --tail 100 cosyvoice`。

常見錯誤：

| 錯誤/現象 | 優先檢查 |
|---|---|
| `TTS_NOT_CONFIGURED` | Azure 模式檢查 `AZURE_SPEECH_KEY`/`AZURE_SPEECH_REGION`；自架模式檢查 `TTS_SERVICE_URL`；改 env 後要重新部署 |
| `AZURE_TTS_AUTH_FAILED` | Azure Speech key 與 region 必須來自同一個 resource，且 pricing tier 應為 F0 |
| `AZURE_TTS_QUOTA_OR_RATE_LIMIT` / HTTP 429 | Azure F0 每月字元額度、每分鐘最多 20 次 request，或 Azure 區域服務繁忙；等候並重試 |
| 401（自架模式） | `TTS_SERVICE_TOKEN` 與 `TTS_WORKER_TOKEN` 不一致，或 reverse proxy 沒有轉送 Authorization header |
| 502/504、`AZURE_TTS_TIMEOUT` | Azure region endpoint、網路或 timeout；調整 `TTS_REQUEST_TIMEOUT_MS`（5,000–300,000 ms） |
| 502/504、`TTS_WORKER_TIMEOUT`（自架模式） | CosyVoice container、GPU、模型下載、adapter/反向代理 timeout；調高時同步檢查 worker `COSYVOICE_TIMEOUT_SECONDS`（5–300 秒）和 `TTS_REQUEST_TIMEOUT_MS`，並確認 proxy timeout 不更短 |
| 一直 queued | cron 沒有執行、secret 不符、queue DB/lease migration 未套用，或 drain 尚未被觸發 |
| 沒有可朗讀區段 | 先完成教材 **內容理解**，確認資料庫有 ready document/reading segments |

## 官方參考

- [Azure Speech 官方價格與 F0 免費額度](https://azure.microsoft.com/en-us/pricing/details/speech/)
- [Azure Speech 官方配額與限制](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-services-quotas-and-limits)
- [Azure Speech REST Text-to-Speech API](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-text-to-speech)
- [Azure Speech 語言與 Neural voice 清單](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=tts)
- [CosyVoice 官方 repository（安裝、模型與 Docker/FastAPI 部署）](https://github.com/FunAudioLLM/CosyVoice)
- [CosyVoice 官方 FastAPI server（`inference_sft` 使用 `tts_text`/`spk_id`，回傳 int16 PCM）](https://github.com/FunAudioLLM/CosyVoice/blob/main/runtime/python/fastapi/server.py)
- [GPT-SoVITS 官方 repository](https://github.com/RVC-Boss/GPT-SoVITS)
- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs)
- [Vercel Cron 使用與方案頻率限制](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- [Vercel Cron secret / Authorization header](https://vercel.com/docs/cron-jobs/manage-cron-jobs)
- [Cron-job.org 官方 FAQ（頻率、30 秒 timeout、自訂 header）](https://cron-job.org/en/faq/)

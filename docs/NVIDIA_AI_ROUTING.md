# StudyNova NVIDIA NIM 路由查核

本文件記錄 2026-10-31 查核 NVIDIA 官方 Build、API Catalog、NGC/NIM 文件後的模型狀態。免費端點指 NVIDIA Build 的免費原型方案，受速率限制，不代表永久或無限制免費。

## 可用於 hosted Chat Completions

- `nvidia/nemotron-3.5-lightning-30b-a3b`：一般聊天、推理、Coding、工具呼叫。官方端點：`https://integrate.api.nvidia.com/v1/chat/completions`。
- `nvidia/nemotron-3.5-super-vl-120b-a12b`：Vision、文件與影片理解、多模態代理。
- `google/gemma-4-31b-it`：文字、影像、影片、摘要、推理、Coding、Function Calling。
- `deepseek-ai/deepseek-v4.1-flash`：多模態推理、文件理解、Coding、工具使用。
- `z-ai/glm-5.3-flash`：推理、Coding、代理工作流、視覺與長文件理解。

以上模型可使用同一個 NVIDIA OpenAI-compatible Chat Completions endpoint。正式路由只使用官方查核過的 API Model ID，不使用 NGC 自託管容器名稱代替 hosted API ID。

## 已確認但不接入 Chat 路由

- `nvidia/nemotron-3.5-parse`：官方介面為 `/v1/parse`，目前沒有足夠證據證明可直接使用 hosted `/v1/chat/completions`。
- `nvidia/nemotron-ocr-v2`：官方介面為 `/v1/ocr`，不可當成 Chat Completions 模型呼叫；目前不接入 StudyNova hosted OCR 路由。
- `nvidia/nemotron-3.5-embed-1b`：官方介面為 `/v1/embeddings`，只用於 Embedding／RAG，不能當成聊天模型。

## 官方來源

- https://build.nvidia.com/nvidia/nemotron-3.5-lightning-30b-a3b
- https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-5-lightning-30b-a3b-infer
- https://build.nvidia.com/nvidia/nemotron-3.5-super-vl-120b-a12b
- https://docs.nvidia.com/nim/large-language-models/2.0.13/get-started/advanced/get-started-nemotron-3.5-super-vl.html
- https://build.nvidia.com/google/gemma-4-31b-it
- https://docs.nvidia.com/nim/vision-language-models/1.7.0/examples/gemma-4-31b-it/api.html
- https://build.nvidia.com/deepseek-ai/deepseek-v4.1-flash
- https://docs.api.nvidia.com/nim/reference/nvidia-deepseek-v4_1-flash-infer
- https://build.nvidia.com/z-ai/glm-5-3-flash
- https://docs.nvidia.com/nim/vision-language-models/latest/get-started/advanced/get-started-glm-5-3-flash.html
- https://build.nvidia.com/nvidia/nemotron-3.5-parse
- https://docs.nvidia.com/nim/ingestion/parse/2.4/getting-started.html
- https://build.nvidia.com/nvidia/nemotron-ocr-v2
- https://docs.nvidia.com/nim/ingestion/image-ocr/latest/getting-started.html
- https://build.nvidia.com/nvidia/nemotron-3_5-embed-1b
- https://docs.nvidia.com/nim/nemo-retriever/embedding/latest/getting-started.html

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { platformSettings } from "@/db/schema";

export type NvidiaModelKind = "chat" | "vision" | "embedding" | "ocr" | "parse";
export type NvidiaModelDefinition = {
  id: string;
  label: string;
  kind: NvidiaModelKind;
  endpoint: string;
  chatCompatible: boolean;
  freePrototype: boolean;
  enabledByDefault: boolean;
  officialUrls: string[];
};

export const NVIDIA_MODEL_REGISTRY: NvidiaModelDefinition[] = [
  { id: "nvidia/nemotron-3.5-lightning-30b-a3b", label: "Nemotron 3.5 Lightning 30B A3B", kind: "chat", endpoint: "/v1/chat/completions", chatCompatible: true, freePrototype: true, enabledByDefault: true, officialUrls: ["https://build.nvidia.com/nvidia/nemotron-3.5-lightning-30b-a3b", "https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-5-lightning-30b-a3b-infer"] },
  { id: "nvidia/nemotron-3.5-super-vl-120b-a12b", label: "Nemotron 3.5 Super VL 120B A12B", kind: "vision", endpoint: "/v1/chat/completions", chatCompatible: true, freePrototype: true, enabledByDefault: true, officialUrls: ["https://build.nvidia.com/nvidia/nemotron-3.5-super-vl-120b-a12b", "https://docs.nvidia.com/nim/large-language-models/2.0.13/get-started/advanced/get-started-nemotron-3.5-super-vl.html"] },
  { id: "google/gemma-4-31b-it", label: "Gemma 4 31B IT", kind: "vision", endpoint: "/v1/chat/completions", chatCompatible: true, freePrototype: true, enabledByDefault: true, officialUrls: ["https://build.nvidia.com/google/gemma-4-31b-it", "https://docs.nvidia.com/nim/vision-language-models/1.7.0/examples/gemma-4-31b-it/api.html"] },
  { id: "deepseek-ai/deepseek-v4.1-flash", label: "DeepSeek V4.1 Flash", kind: "vision", endpoint: "/v1/chat/completions", chatCompatible: true, freePrototype: true, enabledByDefault: true, officialUrls: ["https://build.nvidia.com/deepseek-ai/deepseek-v4.1-flash", "https://docs.api.nvidia.com/nim/reference/nvidia-deepseek-v4_1-flash-infer"] },
  { id: "z-ai/glm-5.3-flash", label: "GLM 5.3 Flash", kind: "vision", endpoint: "/v1/chat/completions", chatCompatible: true, freePrototype: true, enabledByDefault: true, officialUrls: ["https://build.nvidia.com/z-ai/glm-5-3-flash", "https://docs.nvidia.com/nim/vision-language-models/latest/get-started/advanced/get-started-glm-5-3-flash.html"] },
  { id: "nvidia/nemotron-3.5-parse", label: "Nemotron 3.5 Parse", kind: "parse", endpoint: "/v1/parse", chatCompatible: false, freePrototype: true, enabledByDefault: false, officialUrls: ["https://build.nvidia.com/nvidia/nemotron-3.5-parse", "https://docs.nvidia.com/nim/ingestion/parse/2.4/getting-started.html"] },
  { id: "nvidia/nemotron-ocr-v2", label: "Nemotron OCR v2", kind: "ocr", endpoint: "/v1/ocr", chatCompatible: false, freePrototype: true, enabledByDefault: false, officialUrls: ["https://build.nvidia.com/nvidia/nemotron-ocr-v2", "https://docs.nvidia.com/nim/ingestion/image-ocr/latest/getting-started.html"] },
  { id: "nvidia/nemotron-3.5-embed-1b", label: "Nemotron 3.5 Embed 1B", kind: "embedding", endpoint: "/v1/embeddings", chatCompatible: false, freePrototype: true, enabledByDefault: false, officialUrls: ["https://build.nvidia.com/nvidia/nemotron-3_5-embed-1b", "https://docs.nvidia.com/nim/nemo-retriever/embedding/latest/getting-started.html"] },
];

export const NVIDIA_DEFAULT_TASK_MODELS: Record<string, string> = {
  general_chat: "nvidia/nemotron-3.5-lightning-30b-a3b",
  tutoring: "nvidia/nemotron-3.5-lightning-30b-a3b",
  reasoning: "nvidia/nemotron-3.5-lightning-30b-a3b",
  coding: "nvidia/nemotron-3.5-lightning-30b-a3b",
  subject_qa: "nvidia/nemotron-3.5-lightning-30b-a3b",
  planning: "nvidia/nemotron-3.5-lightning-30b-a3b",
  document_analysis: "nvidia/nemotron-3.5-super-vl-120b-a12b",
  vision: "nvidia/nemotron-3.5-super-vl-120b-a12b",
};

export function nvidiaTaskForFeature(feature: string, hasImage = false): string {
  if (hasImage) return "vision";
  if (/ocr|parse|embedding/i.test(feature)) return "unsupported_specialized";
  if (/code|program/i.test(feature)) return "coding";
  if (/exam|question|mistake|solution|math|science|chemistry|physics|tutor|reason/i.test(feature)) return "reasoning";
  if (/document|material|textbook|reading|essay|analysis/i.test(feature)) return "document_analysis";
  if (/plan|schedule/i.test(feature)) return "planning";
  if (/subject|weekly|vocabulary|word/i.test(feature)) return "subject_qa";
  return "general_chat";
}

export function nvidiaModelDefinition(modelId: string) {
  return NVIDIA_MODEL_REGISTRY.find((model) => model.id === modelId);
}

export async function getNvidiaRoutingSettings(): Promise<Record<string, string>> {
  try {
    const row = (await db.select().from(platformSettings).where(eq(platformSettings.key, "ai_nvidia_routing")).limit(1))[0];
    const value = row?.value;
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ...NVIDIA_DEFAULT_TASK_MODELS };
    const out = { ...NVIDIA_DEFAULT_TASK_MODELS };
    for (const [task, modelId] of Object.entries(value as Record<string, unknown>)) {
      if (typeof modelId === "string" && nvidiaModelDefinition(modelId)?.chatCompatible) out[task] = modelId;
    }
    return out;
  } catch (error) {
    console.error("[ai] NVIDIA routing settings unavailable; using safe defaults", error instanceof Error ? error.message : "unknown");
    return { ...NVIDIA_DEFAULT_TASK_MODELS };
  }
}

export async function nvidiaModelForFeature(feature: string, hasImage = false): Promise<string | null> {
  const task = nvidiaTaskForFeature(feature, hasImage);
  if (task === "unsupported_specialized") return null;
  const settings = await getNvidiaRoutingSettings();
  return settings[task] ?? NVIDIA_DEFAULT_TASK_MODELS.general_chat;
}

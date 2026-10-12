export type ObservabilityAlert = {
  code: "API_ERROR_RATE_HIGH" | "API_P95_SLOW" | "AI_FAILURES_HIGH";
  severity: "warning" | "critical";
  message: string;
  value: number;
  threshold: number;
};

export type ObservabilitySnapshot = {
  apiRequests: number;
  apiErrorRate: number;
  apiP95Ms: number | null;
  aiRequests: number;
  aiFailures: number;
};

export function getObservabilityAlerts(snapshot: ObservabilitySnapshot): ObservabilityAlert[] {
  const alerts: ObservabilityAlert[] = [];
  const enoughApiSamples = snapshot.apiRequests >= 20;
  const enoughAiSamples = snapshot.aiRequests >= 20;
  if (enoughApiSamples && snapshot.apiErrorRate >= 0.05) {
    alerts.push({
      code: "API_ERROR_RATE_HIGH",
      severity: snapshot.apiErrorRate >= 0.15 ? "critical" : "warning",
      message: `近 7 日 API 錯誤率 ${(snapshot.apiErrorRate * 100).toFixed(2)}%，已超過 5% 門檻。`,
      value: snapshot.apiErrorRate,
      threshold: 0.05,
    });
  }
  if (enoughApiSamples && snapshot.apiP95Ms !== null && snapshot.apiP95Ms >= 3000) {
    alerts.push({
      code: "API_P95_SLOW",
      severity: snapshot.apiP95Ms >= 8000 ? "critical" : "warning",
      message: `近 7 日 API P95 延遲 ${Math.round(snapshot.apiP95Ms)} ms，已超過 3000 ms 門檻。`,
      value: snapshot.apiP95Ms,
      threshold: 3000,
    });
  }
  if (enoughAiSamples && snapshot.aiFailures / snapshot.aiRequests >= 0.1) {
    const failureRate = snapshot.aiFailures / snapshot.aiRequests;
    alerts.push({
      code: "AI_FAILURES_HIGH",
      severity: failureRate >= 0.25 ? "critical" : "warning",
      message: `近 7 日 AI 失敗率 ${(failureRate * 100).toFixed(2)}%，已超過 10% 門檻。`,
      value: failureRate,
      threshold: 0.1,
    });
  }
  return alerts;
}

import { describe, expect, it } from "vitest";
import { getObservabilityAlerts } from "@/server/observability-alerts";

describe("production observability alerts", () => {
  it("does not alert when metrics are healthy", () => {
    expect(getObservabilityAlerts({ apiRequests: 100, apiErrorRate: 0.02, apiP95Ms: 1200, aiRequests: 100, aiFailures: 2 })).toEqual([]);
  });

  it("raises warning alerts at defined thresholds", () => {
    const alerts = getObservabilityAlerts({ apiRequests: 100, apiErrorRate: 0.05, apiP95Ms: 3000, aiRequests: 100, aiFailures: 10 });
    expect(alerts.map((alert) => alert.code)).toEqual(["API_ERROR_RATE_HIGH", "API_P95_SLOW", "AI_FAILURES_HIGH"]);
    expect(alerts.every((alert) => alert.severity === "warning")).toBe(true);
  });

  it("raises critical alerts for severe degradation", () => {
    const alerts = getObservabilityAlerts({ apiRequests: 100, apiErrorRate: 0.2, apiP95Ms: 9000, aiRequests: 100, aiFailures: 30 });
    expect(alerts.every((alert) => alert.severity === "critical")).toBe(true);
  });

  it("does not alert on small samples", () => {
    expect(getObservabilityAlerts({ apiRequests: 19, apiErrorRate: 1, apiP95Ms: 9999, aiRequests: 19, aiFailures: 19 })).toEqual([]);
  });
});

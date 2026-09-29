import { describe, expect, it } from "vitest";
import { canClientUseFeature, featureKeyForApiPath, isFeatureGateLive, type FeatureGateState } from "@/lib/feature-version";

const base: FeatureGateState = { enabled: true, releaseStatus: "PUBLISHED", releaseDate: null, requiredVersion: "1.5.0", minimumVersion: "1.4.0" };
const now = new Date("2026-09-29T12:00:00.000Z");

describe("feature version gates", () => {
  it("keeps draft gates hidden even when enabled is true", () => {
    expect(isFeatureGateLive({ ...base, releaseStatus: "DRAFT" }, now)).toBe(false);
    expect(canClientUseFeature({ ...base, releaseStatus: "DRAFT" }, "1.5.0", now)).toBe(false);
  });

  it("keeps scheduled gates hidden until the release timestamp", () => {
    expect(isFeatureGateLive({ ...base, releaseStatus: "SCHEDULED", releaseDate: "2026-09-29T12:01:00.000Z" }, now)).toBe(false);
    expect(isFeatureGateLive({ ...base, releaseStatus: "SCHEDULED", releaseDate: "2026-09-29T12:00:00.000Z" }, now)).toBe(true);
  });

  it("requires the feature version and minimum supported version", () => {
    expect(canClientUseFeature(base, "1.4.9", now)).toBe(false);
    expect(canClientUseFeature(base, "1.5.0", now)).toBe(true);
    expect(canClientUseFeature({ ...base, minimumVersion: "1.6.0" }, "1.5.0", now)).toBe(false);
  });

  it("does not expose disabled or archived gates", () => {
    expect(isFeatureGateLive({ ...base, enabled: false }, now)).toBe(false);
    expect(isFeatureGateLive({ ...base, releaseStatus: "ARCHIVED" }, now)).toBe(false);
  });

  it("maps direct API endpoints to the same feature gates used by the UI", () => {
    expect(featureKeyForApiPath("/ai/solution/analyze")).toBe("solve");
    expect(featureKeyForApiPath("/ai/messages/123/action")).toBe("ai");
    expect(featureKeyForApiPath("/pk/matchmaking/join")).toBe("online-pk");
    expect(featureKeyForApiPath("/weekly/attempts/123/submit")).toBe("weekly");
    expect(featureKeyForApiPath("/learning/timeline")).toBe("study");
    expect(featureKeyForApiPath("/learning/radar")).toBe("dashboard");
    expect(featureKeyForApiPath("/activities/123/questions")).toBe("challenge");
    expect(featureKeyForApiPath("/account/overview")).toBe("profile");
    expect(featureKeyForApiPath("/admin/pk/matches/123/control")).toBeNull();
    expect(featureKeyForApiPath("/notifications")).toBeNull();
  });
});

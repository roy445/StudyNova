import { compareSemVer, isValidSemVer } from "@/lib/semver";

const API_FEATURE_ROUTE_PREFIXES: Array<readonly [string, readonly string[]]> = [
  ["solve", ["/ai/solution"]],
  ["online-pk", ["/pk"]],
  ["weekly", ["/weekly"]],
  ["challenge", ["/challenges", "/friends", "/rooms", "/activities"]],
  ["essay", ["/essay"]],
  ["compress", ["/compress"]],
  ["export", ["/exports"]],
  ["grades", ["/grades", "/exams", "/exam-date-policies", "/exam-date-appeals"]],
  ["report", ["/report"]],
  ["ai", ["/ai"]],
  ["dashboard", ["/dashboard", "/learning/radar", "/learning/error-patterns", "/tasks/daily"]],
  ["profile", ["/account", "/achievements"]],
  ["study", ["/study", "/learning/timeline", "/learning-packages", "/learning/one-page", "/review", "/focus", "/tasks", "/assignments", "/wrong-questions", "/adaptive", "/words", "/quizzes", "/wrong", "/sentences", "/materials", "/quick-memory", "/ocr", "/my-vocabulary", "/knowledge", "/notes", "/voice", "/visual-notes", "/daily-knowledge", "/exam-hubs", "/tts", "/textbooks", "/shares"]],
];

/** Infer the client-facing feature for an API path; explicit route gates override this mapping. */
export function featureKeyForApiPath(path: string): string | null {
  return API_FEATURE_ROUTE_PREFIXES.find(([, prefixes]) => prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`)))?.[0] ?? null;
}

export type FeatureGateState = {
  enabled: boolean;
  releaseStatus: string;
  releaseDate: Date | string | null;
  requiredVersion: string;
  minimumVersion: string;
};

export function isFeatureGateLive(gate: Pick<FeatureGateState, "enabled" | "releaseStatus" | "releaseDate">, now = new Date()): boolean {
  if (!gate.enabled) return false;
  if (gate.releaseStatus === "PUBLISHED") return !gate.releaseDate || new Date(gate.releaseDate).getTime() <= now.getTime();
  return gate.releaseStatus === "SCHEDULED" && gate.releaseDate !== null && new Date(gate.releaseDate).getTime() <= now.getTime();
}

export function canClientUseFeature(gate: FeatureGateState, clientVersion: string, now = new Date()): boolean {
  if (!isFeatureGateLive(gate, now) || !isValidSemVer(clientVersion)) return false;
  return compareSemVer(clientVersion, gate.requiredVersion) >= 0 && compareSemVer(clientVersion, gate.minimumVersion) >= 0;
}

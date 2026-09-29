const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export type SemVerTuple = readonly [major: number, minor: number, patch: number];

export function parseSemVer(value: string): SemVerTuple | null {
  const match = SEMVER_PATTERN.exec(value.trim());
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  if (!parts.every(Number.isSafeInteger)) return null;
  return parts as unknown as SemVerTuple;
}

export function isValidSemVer(value: string): boolean {
  return parseSemVer(value) !== null;
}

export function compareSemVer(left: string, right: string): -1 | 0 | 1 {
  const a = parseSemVer(left);
  const b = parseSemVer(right);
  if (!a || !b) throw new TypeError("Both versions must use valid major.minor.patch SemVer.");
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

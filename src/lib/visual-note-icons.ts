/** Text glyphs verified against the bundled Noto Sans CJK TC font. */
export const VISUAL_NOTE_ICONS = ["文", "學", "問", "思", "閱", "筆", "知"] as const;
export const DEFAULT_VISUAL_NOTE_ICON = VISUAL_NOTE_ICONS[0];

export function isVisualNoteIcon(value: string): value is (typeof VISUAL_NOTE_ICONS)[number] {
  return (VISUAL_NOTE_ICONS as readonly string[]).includes(value);
}

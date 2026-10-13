type QuestionLike = {
  subject?: string | null;
  type?: string | null;
  stem?: string | null;
  metadata?: unknown;
};

export type ExamPrepQuestionMetadata = Record<string, unknown> & {
  passage?: string;
  groupLabel?: string;
  questionGroup?: string;
};

function metadataOf(question: QuestionLike): ExamPrepQuestionMetadata {
  return question.metadata && typeof question.metadata === "object" ? question.metadata as ExamPrepQuestionMetadata : {};
}

function sourceMetadataOf(question: QuestionLike): ExamPrepQuestionMetadata {
  const metadata = metadataOf(question);
  return metadata.sourceMetadata && typeof metadata.sourceMetadata === "object" ? metadata.sourceMetadata as ExamPrepQuestionMetadata : {};
}

export function examPrepMetadata(question: QuestionLike): ExamPrepQuestionMetadata {
  const metadata = metadataOf(question);
  const sourceMetadata = sourceMetadataOf(question);
  const passage = typeof metadata.passage === "string" && metadata.passage.trim() ? metadata.passage : typeof sourceMetadata.passage === "string" && sourceMetadata.passage.trim() ? sourceMetadata.passage : undefined;
  const groupLabel = typeof metadata.groupLabel === "string" && metadata.groupLabel.trim() ? metadata.groupLabel : typeof sourceMetadata.groupLabel === "string" && sourceMetadata.groupLabel.trim() ? sourceMetadata.groupLabel : undefined;
  return { ...metadata, ...(passage ? { passage } : {}), ...(groupLabel ? { groupLabel } : {}), ...(passage && groupLabel ? { questionGroup: groupLabel } : {}) };
}

/**
 * Listening/image extraction questions sometimes survive as only `__13__` with
 * no passage. They cannot be answered fairly, so they must never enter a
 * student exam or PK room. Fill-in questions with a real passage stay visible.
 */
export function isHiddenEnglishListeningQuestion(question: QuestionLike) {
  const subject = (question.subject ?? "").toLocaleLowerCase();
  if (!subject.includes("英") && !subject.includes("english")) return false;
  const metadata = examPrepMetadata(question);
  const stem = (question.stem ?? "").trim();
  const hasPassage = typeof metadata.passage === "string" && metadata.passage.trim().length > 0;
  if (hasPassage) return false;
  return question.type === "fill" && (/^__\d+__$/.test(stem) || /^_+$/.test(stem) || stem.length <= 2);
}

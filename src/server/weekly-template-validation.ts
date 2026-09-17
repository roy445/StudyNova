export type TemplateSection = { key: string; name: string; type: string; questionCount: number; percentage: number; pointsPerQuestion: number; questionLogic: string; sourceRules?: string; answerMode?: string };
export type TemplateStructure = { totalQuestions: number; totalScore: number; sections: TemplateSection[]; difficulty?: string; questionLogicSummary?: string };

export function validateTemplateStructure(value: unknown): string[] {
  const structure = value as Partial<TemplateStructure>;
  const errors: string[] = [];
  const sections = Array.isArray(structure.sections) ? structure.sections : [];
  const count = sections.reduce((sum, section) => sum + Number(section.questionCount || 0), 0);
  const score = sections.reduce((sum, section) => sum + Number(section.questionCount || 0) * Number(section.pointsPerQuestion || 0), 0);
  const percentage = sections.reduce((sum, section) => sum + Number(section.percentage || 0), 0);
  if (!Number.isInteger(Number(structure.totalQuestions)) || Number(structure.totalQuestions) < 1) errors.push("totalQuestions 必須是正整數");
  if (Number(structure.totalQuestions) !== count) errors.push("totalQuestions 不等於各大題 questionCount 總和");
  if (!Number.isFinite(Number(structure.totalScore)) || Number(structure.totalScore) <= 0) errors.push("totalScore 必須大於 0");
  if (Math.abs(score - Number(structure.totalScore)) > 0.01) errors.push("各題配分總和不等於 totalScore");
  if (Math.abs(percentage - 100) > 0.01) errors.push("各大題百分比總和必須為 100%");
  sections.forEach((section, index) => {
    if (!section.name || !section.type || !section.questionLogic) errors.push(`第 ${index + 1} 大題缺少題型規則`);
    if (!Number.isInteger(Number(section.questionCount)) || Number(section.questionCount) < 1) errors.push(`第 ${index + 1} 大題題數不合法`);
    if (!Number.isFinite(Number(section.pointsPerQuestion)) || Number(section.pointsPerQuestion) <= 0) errors.push(`第 ${index + 1} 大題每題配分不合法`);
  });
  return errors;
}

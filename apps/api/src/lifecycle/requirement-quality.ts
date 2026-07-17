export type WordingQualityRule = "ambiguous_wording" | "weak_obligation";

const AMBIGUOUS_WORDING = [
  /\b(?:approximately|generally|normally|typically|as needed|if possible|and so on|etc\.?)\b/i,
  /\b(?:m\u00fcmk\u00fcnse|yakla\u015f\u0131k|genellikle|normalde|gerekti\u011finde|ve benzeri|vb\.?)\b/i,
];

const WEAK_OBLIGATION = [
  /\b(?:should|may|might|could)\b/i,
  /\b(?:olabilir|yapabilir|sa\u011flayabilir|uygun olmal\u0131)\b/i,
];

export function wordingQualityRules(content: string): WordingQualityRule[] {
  const normalized = content.trim();
  if (!normalized) return [];
  const rules: WordingQualityRule[] = [];
  if (AMBIGUOUS_WORDING.some((pattern) => pattern.test(normalized))) rules.push("ambiguous_wording");
  if (WEAK_OBLIGATION.some((pattern) => pattern.test(normalized))) rules.push("weak_obligation");
  return rules;
}

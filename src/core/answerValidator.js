/**
 * 回答の正誤判定（カテゴリ共通）
 *
 * 選択肢 ID の集合として比較するため、選択順・重複は結果に影響しない。
 * 選択肢 ID は立方体の要素 ID に限らない（数字・形の名前・分数などでもよい）。
 */

export const ANSWER_STATUS = Object.freeze({
  CORRECT: 'correct', // 完全正解
  PARTIAL: 'partial', // おしい（複数回答で、ちがいが1つだけ）
  INCORRECT: 'incorrect',
  UNANSWERED: 'unanswered',
});

/** 重複を除いた回答（最初に出てきた順） */
export function normalizeAnswers(answers) {
  if (!Array.isArray(answers)) return [];
  return [...new Set(answers.filter((a) => a !== undefined && a !== null && a !== ''))];
}

/**
 * 回答を確定できるか
 * @param {string[]} selected
 * @param {'single'|'multiple'} type
 */
export function canSubmitAnswer(selected, type) {
  const answers = normalizeAnswers(selected);
  return type === 'single' ? answers.length === 1 : answers.length > 0;
}

/**
 * 正誤を判定する
 * @param {string[]} correctAnswers 正解の選択肢 ID
 * @param {string[]} selected 選んだ選択肢 ID（順不同・重複可）
 * @returns {{ status: string, isCorrect: boolean, selected: string[], hits: string[], missing: string[], wrong: string[] }}
 *   hits = 選んだ正解 / missing = 選ばなかった正解 / wrong = 選んだ不正解
 */
export function validateAnswer(correctAnswers, selected) {
  const correct = new Set(normalizeAnswers(correctAnswers));
  if (correct.size === 0) throw new Error('正解が設定されていません');
  const answers = normalizeAnswers(selected);

  const hits = answers.filter((a) => correct.has(a));
  const wrong = answers.filter((a) => !correct.has(a));
  const missing = [...correct].filter((c) => !answers.includes(c));

  let status;
  if (answers.length === 0) status = ANSWER_STATUS.UNANSWERED;
  else if (wrong.length === 0 && missing.length === 0) status = ANSWER_STATUS.CORRECT;
  else if (correct.size > 1 && hits.length > 0 && wrong.length + missing.length === 1) status = ANSWER_STATUS.PARTIAL;
  else status = ANSWER_STATUS.INCORRECT;

  return { status, isCorrect: status === ANSWER_STATUS.CORRECT, selected: answers, hits, missing, wrong };
}

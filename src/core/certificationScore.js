/**
 * 段位認定のスコア計算（Three.js・DOM 非依存）
 *
 * - 完全正解だけに、問題の難易度ごとの得点を与える（部分正解・不正解は 0 点。連続正解は 0 に戻る）
 * - 連続正解ボーナス：連続正解数がルールの min 以上なら、その問題に bonus を加える
 * - 誤答の減点：n 回目の誤答で perMistake × min(n, maxMultiplier) 点を引く（得点は 0 点より下がらない）
 */
import { CERTIFICATION_RULES } from './certificationRules.js';

export const basePoints = (difficulty, rules = CERTIFICATION_RULES) => rules.points[difficulty] ?? 0;

/** 連続正解数 streak（この問題をふくむ）のときのボーナス */
export function streakBonus(streak, rules = CERTIFICATION_RULES) {
  for (const { min, bonus } of rules.streakBonus) if (streak >= min) return bonus;
  return 0;
}

/** n 回目の誤答の減点（n は maxMultiplier まで） */
export function mistakeDeduction(n, rules = CERTIFICATION_RULES) {
  const { perMistake, maxMultiplier } = rules.mistakePenalty;
  return perMistake * Math.min(Math.max(1, n), maxMultiplier);
}

/** スコアの初期状態 */
export const createScoreState = () => ({ score: 0, streak: 0, maxStreak: 0, correct: 0, answered: 0, mistakes: 0 });

/**
 * 1問の結果を反映する
 * @param {ReturnType<typeof createScoreState>} state
 * @param {{ difficulty: 1|2|3, isCorrect: boolean }} answer
 * @returns {{ state, points: number, bonus: number, deduction: number }} points はボーナスをふくまない得点。deduction は実際に引いた点
 */
export function applyAnswer(state, { difficulty, isCorrect }, rules = CERTIFICATION_RULES) {
  const next = { mistakes: 0, ...state, answered: state.answered + 1 };
  if (!isCorrect) {
    next.streak = 0;
    next.mistakes += 1;
    const deduction = Math.min(state.score, mistakeDeduction(next.mistakes, rules));
    next.score = state.score - deduction;
    return { state: next, points: 0, bonus: 0, deduction };
  }
  next.streak = state.streak + 1;
  next.maxStreak = Math.max(state.maxStreak, next.streak);
  next.correct = state.correct + 1;
  const points = basePoints(difficulty, rules);
  const bonus = streakBonus(next.streak, rules);
  next.score = state.score + points + bonus;
  return { state: next, points, bonus, deduction: 0 };
}

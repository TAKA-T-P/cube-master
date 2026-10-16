/**
 * 段位認定のスコア計算（Three.js・DOM 非依存）
 *
 * - 完全正解だけに、問題の難易度ごとの得点を与える（部分正解・不正解は 0 点。連続正解は 0 に戻る）
 * - 連続正解ボーナス：連続正解数がルールの min 以上なら、その問題に bonus を加える
 */
import { CERTIFICATION_RULES } from './certificationRules.js';

export const basePoints = (difficulty, rules = CERTIFICATION_RULES) => rules.points[difficulty] ?? 0;

/** 連続正解数 streak（この問題をふくむ）のときのボーナス */
export function streakBonus(streak, rules = CERTIFICATION_RULES) {
  for (const { min, bonus } of rules.streakBonus) if (streak >= min) return bonus;
  return 0;
}

/** スコアの初期状態 */
export const createScoreState = () => ({ score: 0, streak: 0, maxStreak: 0, correct: 0, answered: 0 });

/**
 * 1問の結果を反映する
 * @param {ReturnType<typeof createScoreState>} state
 * @param {{ difficulty: 1|2|3, isCorrect: boolean }} answer
 * @returns {{ state, points: number, bonus: number }} points はボーナスをふくまない得点
 */
export function applyAnswer(state, { difficulty, isCorrect }, rules = CERTIFICATION_RULES) {
  const next = { ...state, answered: state.answered + 1 };
  if (!isCorrect) {
    next.streak = 0;
    return { state: next, points: 0, bonus: 0 };
  }
  next.streak = state.streak + 1;
  next.maxStreak = Math.max(state.maxStreak, next.streak);
  next.correct = state.correct + 1;
  const points = basePoints(difficulty, rules);
  const bonus = streakBonus(next.streak, rules);
  next.score = state.score + points + bonus;
  return { state: next, points, bonus };
}

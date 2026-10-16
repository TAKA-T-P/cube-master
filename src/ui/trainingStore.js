/**
 * トレーニングの進行状態（メモリ上のみ。Phase 1 ではブラウザに保存しない）
 *
 * 画面（と 3D ビューア）は遷移のたびに作り直されるが、進行状態はここに残るので、
 * 画面を行き来しても問題番号や正解数がずれない。
 */
import { TrainingSession } from '../core/questionEngine.js';
import { getCategory, getTemplates, DEFAULT_SETTINGS } from '../questions/questionRegistry.js';

let state = {
  settings: null, // { category, difficulty, questionLimit }
  session: null,
  summary: null,
  review: null, // 結果画面から1問だけ解き直すセッション（もとの結果は変えない）
};

/**
 * 新しいトレーニングを始める
 * @param {{ category: string, difficulty?: 1|2|3|'all', questionLimit?: number|'endless' }} settings
 * @param {{ rng?: () => number }} [options]
 */
export function startTraining(settings, { rng } = {}) {
  const category = getCategory(settings.category);
  if (!category?.enabled) throw new Error(`遊べないカテゴリです: ${settings.category}`);
  const full = { ...DEFAULT_SETTINGS, ...settings };
  const session = new TrainingSession({
    category: full.category,
    templates: getTemplates(full.category),
    difficulty: full.difficulty,
    questionLimit: full.questionLimit,
    rng,
  });
  state = { settings: full, session, summary: null, review: null };
  return session;
}

export const getSession = () => state.session;
export const getSettings = () => state.settings;
export const getSummary = () => state.summary;

/** トレーニングを終えて結果を残す */
export function finishTraining() {
  if (!state.session) return null;
  state.summary = state.session.finish();
  return state.summary;
}

/**
 * 結果画面の「第◯問」から、同じ問題（同じ図・同じ選択肢の並び）をもう一度解く
 * @param {number} number 問題番号（1始まり）
 * @returns {TrainingSession|null}
 */
export function startReview(number) {
  const item = state.summary?.history.find((x) => x.number === number);
  if (!item?.question) return null;
  const session = new TrainingSession({ category: state.summary.category, difficulty: item.difficulty, questions: [item.question] });
  state.review = { number, session };
  return session;
}

/** 復習中のセッション（{ number, session }。復習していなければ null） */
export const getReview = () => state.review;

/** 復習を終える（結果画面に戻るとき） */
export function endReview() {
  state.review = null;
}

/** すべて消す（テスト用） */
export function resetTrainingStore() {
  state = { settings: null, session: null, summary: null, review: null };
}

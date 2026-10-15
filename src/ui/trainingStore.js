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
  state = { settings: full, session, summary: null };
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

/** すべて消す（テスト用） */
export function resetTrainingStore() {
  state = { settings: null, session: null, summary: null };
}

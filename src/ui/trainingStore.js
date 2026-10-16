/**
 * トレーニングの進行状態（メモリ上）
 *
 * 画面（と 3D ビューア）は遷移のたびに作り直されるが、進行状態はここに残るので、
 * 画面を行き来しても問題番号や正解数がずれない。
 * トレーニングを終えると、学習記録と間違えた問題をブラウザに保存する（ui/learningStore）。
 *
 * 復習（review）は、もとの結果を変えずに、出題した問題データそのものをもう一度解く。
 *   kind: 'card'     結果画面の「第◯問」から1問だけ（解いたら結果画面へ戻る）
 *         'mistakes' 結果画面の「間違えた問題を復習」（不正解・部分正解の問題すべて）
 *         'saved'    学習記録の「復習する」（ブラウザに保存した、前に間違えた問題）
 *         'cert'     段位認定の結果の「間違えた問題をトレーニングで復習」（いろいろなカテゴリの問題）
 */
import { TrainingSession } from '../core/questionEngine.js';
import { getCategory, getTemplates, DEFAULT_SETTINGS } from '../questions/questionRegistry.js';
import { recordFinishedTraining, getSavedReviewQuestions } from './learningStore.js';

const emptyState = () => ({
  settings: null, // { category, difficulty, questionLimit }
  session: null,
  summary: null,
  recorded: false, // 学習記録に保存したか（同じトレーニングを2回記録しない）
  review: null, // { kind, number?, category, total, session }
  reviewSummary: null, // 終えた復習の結果
});

let state = emptyState();

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
  state = { ...emptyState(), settings: full, session };
  return session;
}

export const getSession = () => state.session;
export const getSettings = () => state.settings;
export const getSummary = () => state.summary;

/** トレーニングを終えて結果を残す（学習記録に保存する） */
export function finishTraining() {
  if (!state.session) return null;
  state.summary = state.session.finish();
  if (!state.recorded) {
    state.recorded = true;
    recordFinishedTraining(state.summary);
  }
  return state.summary;
}

/** 結果のうち、不正解・部分正解の問題 */
export const getMistakes = () => (state.summary?.history ?? []).filter((h) => !h.isCorrect && h.question);

function beginReview(kind, category, questions, extra = {}) {
  if (questions.length === 0) return null;
  const session = new TrainingSession({ category, difficulty: 'all', questions });
  state.review = { kind, category, total: questions.length, session, ...extra };
  state.reviewSummary = null;
  return session;
}

/**
 * 結果画面の「第◯問」から、同じ問題（同じ図・同じ選択肢の並び）をもう一度解く
 * @param {number} number 問題番号（1始まり）
 */
export function startReview(number) {
  const item = state.summary?.history.find((x) => x.number === number);
  if (!item?.question) return null;
  return beginReview('card', state.summary.category, [item.question], { number });
}

/** 結果画面の「間違えた問題を復習」（不正解・部分正解の問題すべて） */
export const startMistakeReview = () => (state.summary ? beginReview('mistakes', state.summary.category, getMistakes().map((h) => h.question)) : null);

/** ブラウザに保存した、前に間違えた問題を復習する */
export const startSavedReview = (category) => beginReview('saved', category, getSavedReviewQuestions(category));

/** 段位認定で間違えた問題を、トレーニングと同じ画面でじっくり解き直す（時間制限・得点なし） */
export const startCertificationReview = (questions) => beginReview('cert', 'certification', questions);

/** 復習の結果画面から、まだ間違えている問題をもう一度 */
export function startRetryReview() {
  const last = state.reviewSummary;
  if (!last) return null;
  return beginReview(last.kind === 'card' ? 'mistakes' : last.kind, last.category, last.wrongQuestions);
}

/** 復習中のセッション（{ kind, number?, category, total, session }。復習していなければ null） */
export const getReview = () => state.review;
export const getReviewSummary = () => state.reviewSummary;

/** 復習を終えて、復習の結果を残す */
export function finishReview() {
  const review = state.review;
  if (!review) return state.reviewSummary;
  const summary = review.session.finish();
  state.reviewSummary = {
    kind: review.kind,
    category: review.category,
    total: review.total,
    answeredCount: summary.answeredCount,
    correctCount: summary.correctCount,
    accuracy: summary.accuracy,
    history: summary.history,
    wrongQuestions: summary.history.filter((h) => !h.isCorrect).map((h) => h.question),
  };
  state.review = null;
  return state.reviewSummary;
}

/** 復習をやめる（結果は残さない。結果画面に戻るとき） */
export function endReview() {
  state.review = null;
}

/** すべて消す（テスト用） */
export function resetTrainingStore() {
  state = emptyState();
}

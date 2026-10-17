/**
 * 学習記録・復習データの保存（ブラウザの localStorage。個人情報は保存しない）
 *
 * 形の確かめ・集計は core（learningHistory / reviewManager / storageManager）が行い、ここは
 * 「いつ読み込んで、いつ保存するか」だけを受け持つ。localStorage が使えない環境では、
 * メモリの中だけで記録し（ページを閉じると消える）、練習はそのまま続けられる。
 */
import { createStorage } from '../core/storageManager.js';
import { normalizeHistory, recordTrainingResult, recordReviewAnswer as addReviewAnswer, getCategoryStats, recordChallengeResult, getChallengeBest as readChallengeBest } from '../core/learningHistory.js';
import { normalizeReviewStore, addReviewEntries, recordReviewResult, getReviewEntries } from '../core/reviewManager.js';
import { getCategory } from '../questions/questionRegistry.js';
import { showToast } from '../utils/dom.js';

const KEYS = { history: 'history', review: 'review' };

/** 保存先の問題テンプレートが、今も遊べるカテゴリにあるか（なくなったものは復習データから外す） */
const isKnownTemplate = (category, templateId) => {
  const c = getCategory(category);
  return Boolean(c?.enabled && c.templates.some((t) => t.id === templateId));
};

function browserBackend() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

let storage = null;
let history = null;
let reviewStore = null;
/** 問題データ → 復習データの ID（保存した問題を復習で解いたときに、結果を反映するため） */
let entryIds = new WeakMap();
let warned = false;

function ensureLoaded() {
  if (storage) return;
  storage = createStorage(browserBackend());
  history = normalizeHistory(storage.read(KEYS.history));
  reviewStore = normalizeReviewStore(storage.read(KEYS.review), { isKnownTemplate });
  for (const e of reviewStore.entries) entryIds.set(e.question, e.id);
}

function save() {
  const savedHistory = storage.write(KEYS.history, history);
  const savedReview = storage.write(KEYS.review, reviewStore);
  const ok = savedHistory && savedReview;
  if (!ok && storage.available && !warned) {
    warned = true;
    showToast('学習記録を保存できませんでした。練習はこのまま続けられます。', { type: 'error' });
  }
  return ok;
}

/** 保存先を差しかえる（テスト用。null で localStorage にもどす） */
export function configureLearningStorage(backend) {
  storage = createStorage(backend === undefined ? browserBackend() : backend);
  history = normalizeHistory(storage.read(KEYS.history));
  reviewStore = normalizeReviewStore(storage.read(KEYS.review), { isKnownTemplate });
  entryIds = new WeakMap();
  for (const e of reviewStore.entries) entryIds.set(e.question, e.id);
  warned = false;
}

/** ブラウザに保存できるか（できなければ、記録はページを閉じるまで） */
export function isLearningStorageAvailable() {
  ensureLoaded();
  return storage.available;
}

export function getLearningHistory() {
  ensureLoaded();
  return history;
}

export function getLearningStats(category) {
  ensureLoaded();
  return getCategoryStats(history, category);
}

/**
 * トレーニング1回分を記録する。不正解・部分正解の問題は復習データに入れる
 * @param {ReturnType<import('../core/questionEngine.js').TrainingSession['getSummary']>} summary
 */
export function recordFinishedTraining(summary) {
  ensureLoaded();
  if (!summary || summary.answeredCount === 0) return;
  history = recordTrainingResult(history, summary);
  const wrong = summary.history.filter((h) => !h.isCorrect && h.question).map((h) => h.question);
  if (wrong.length > 0) {
    const result = addReviewEntries(reviewStore, wrong);
    reviewStore = result.store;
    wrong.forEach((q, i) => result.ids[i] && entryIds.set(q, result.ids[i]));
  }
  save();
}

/** 復習で1問解いた（保存してある問題なら、正解で外し、まちがいで回数を増やす） */
export function recordReviewAnswer(question, isCorrect) {
  ensureLoaded();
  history = addReviewAnswer(history, question.category, isCorrect);
  const id = entryIds.get(question);
  if (id) reviewStore = recordReviewResult(reviewStore, id, isCorrect);
  save();
}

/** 1分チャレンジの結果を記録する（最高記録は下がらない） */
export function recordChallenge(summary) {
  ensureLoaded();
  const result = recordChallengeResult(history, summary);
  history = result.history;
  save();
  return result;
}

/** 1分チャレンジの最高記録（正解数） */
export function getChallengeBest(category, difficulty) {
  ensureLoaded();
  return readChallengeBest(history, category, difficulty);
}

/** 保存してある復習待ちの問題（カテゴリ別。新しく間違えた順） */
export function getSavedReviewQuestions(category) {
  ensureLoaded();
  return getReviewEntries(reviewStore, category).map((e) => e.question);
}

export function getSavedReviewCount(category) {
  ensureLoaded();
  return getReviewEntries(reviewStore, category).length;
}

/** CUBE MASTER の学習記録・復習データをすべて消す（ほかのサイトのデータは消さない） */
export function clearLearningData() {
  ensureLoaded();
  storage.clearAll();
  history = normalizeHistory(null);
  reviewStore = normalizeReviewStore(null);
  entryIds = new WeakMap();
}

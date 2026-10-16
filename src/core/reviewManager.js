/**
 * 間違えた問題の復習データ（ブラウザに保存して、後日も同じ問題を復習する。Three.js・DOM 非依存）
 *
 * 問題は、作り直す（ランダムに再生成する）と別の問題になってしまうので、出題した問題データそのもの
 * （JSON にできるデータだけ。3D の描画オブジェクトは持たない）を保存する。
 *
 * {
 *   version: 1,
 *   entries: [{
 *     id,                 // 復習データの ID（保存したときに付ける）
 *     schemaVersion,      // 保存したときの問題データの形の番号（core/questionSchema の QUESTION_SCHEMA_VERSION）
 *     category, templateId, problemKey,
 *     question,           // 回答前の問題データ（選択肢・正解・図・3D のデータ）
 *     addedAt, lastIncorrectAt, incorrectCount,
 *   }]
 * }
 * 読み込むときは必ず確かめ、今の形と合わない問題（schemaVersion がちがう・データが不正）は、作り直さずに除外する。
 * 正しく解けた問題は復習データから外す。
 */
import { QUESTION_SCHEMA_VERSION, getQuestionErrors } from './questionSchema.js';

export const REVIEW_VERSION = 1;
/** カテゴリごと・全体の保存する問題数の上限（古いものから消す） */
export const MAX_ENTRIES_PER_CATEGORY = 15;
export const MAX_ENTRIES = 60;
/** 保存データ全体の文字数の上限 */
export const MAX_REVIEW_CHARS = 1_200_000;

export const createEmptyReviewStore = () => ({ version: REVIEW_VERSION, entries: [] });

/** JSON にしてもどして、同じ形になる（関数・undefined・NaN などをふくまない）問題データのコピー */
export function snapshotQuestion(question) {
  try {
    return JSON.parse(JSON.stringify(question));
  } catch {
    return null;
  }
}

/**
 * 保存された1件が、今の形の問題として使えるか
 * @param {object} entry
 * @param {{ isKnownTemplate?: (category: string, templateId: string) => boolean }} [options]
 */
export function isUsableEntry(entry, { isKnownTemplate = () => true } = {}) {
  if (!entry || typeof entry !== 'object') return false;
  if (entry.schemaVersion !== QUESTION_SCHEMA_VERSION) return false;
  if (typeof entry.id !== 'string' || typeof entry.category !== 'string' || typeof entry.templateId !== 'string') return false;
  const q = entry.question;
  if (!q || q.category !== entry.category || q.templateId !== entry.templateId) return false;
  if (!isKnownTemplate(entry.category, entry.templateId)) return false;
  return getQuestionErrors(q).length === 0;
}

/** 保存データを確かめて、使えるものだけを残す（こわれていれば空にする） */
export function normalizeReviewStore(raw, options) {
  if (!raw || typeof raw !== 'object' || raw.version !== REVIEW_VERSION || !Array.isArray(raw.entries)) return createEmptyReviewStore();
  const seen = new Set();
  const entries = [];
  for (const e of raw.entries) {
    if (!isUsableEntry(e, options) || seen.has(e.id)) continue;
    seen.add(e.id);
    entries.push({
      id: e.id,
      schemaVersion: e.schemaVersion,
      category: e.category,
      templateId: e.templateId,
      problemKey: typeof e.problemKey === 'string' ? e.problemKey : e.question.key,
      question: e.question,
      addedAt: typeof e.addedAt === 'string' ? e.addedAt : new Date(0).toISOString(),
      lastIncorrectAt: typeof e.lastIncorrectAt === 'string' ? e.lastIncorrectAt : new Date(0).toISOString(),
      incorrectCount: Number.isInteger(e.incorrectCount) && e.incorrectCount > 0 ? e.incorrectCount : 1,
    });
  }
  return trimReviewStore({ version: REVIEW_VERSION, entries });
}

/** 上限を守る（カテゴリごと・全体の件数、全体の文字数。新しく間違えたものを残す） */
export function trimReviewStore(store, { maxPerCategory = MAX_ENTRIES_PER_CATEGORY, maxEntries = MAX_ENTRIES, maxChars = MAX_REVIEW_CHARS } = {}) {
  const sorted = [...store.entries].sort((a, b) => (a.lastIncorrectAt < b.lastIncorrectAt ? 1 : a.lastIncorrectAt > b.lastIncorrectAt ? -1 : 0));
  const perCategory = new Map();
  let kept = [];
  for (const e of sorted) {
    const n = perCategory.get(e.category) ?? 0;
    if (n >= maxPerCategory || kept.length >= maxEntries) continue;
    perCategory.set(e.category, n + 1);
    kept.push(e);
  }
  while (kept.length > 0 && JSON.stringify({ version: REVIEW_VERSION, entries: kept }).length > maxChars) kept = kept.slice(0, -1);
  return { version: REVIEW_VERSION, entries: kept };
}

let idSeq = 0;
const newId = (now) => `r${Date.parse(now).toString(36)}${(idSeq++).toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

/**
 * 間違えた問題を追加する
 * @param {object} store
 * @param {object[]} questions 問題データ（出題したもの）
 * @param {{ now?: string }} [options]
 * @returns {{ store: object, ids: (string|null)[] }} ids は questions と同じ順（保存できなかったものは null）
 */
export function addReviewEntries(store, questions, { now = new Date().toISOString() } = {}) {
  const entries = [...store.entries];
  const ids = [];
  for (const q of questions) {
    const question = snapshotQuestion(q);
    const entry = question && {
      id: newId(now),
      schemaVersion: QUESTION_SCHEMA_VERSION,
      category: question.category,
      templateId: question.templateId,
      problemKey: question.key,
      question,
      addedAt: now,
      lastIncorrectAt: now,
      incorrectCount: 1,
    };
    if (!entry || !isUsableEntry(entry)) {
      ids.push(null);
      continue;
    }
    entries.push(entry);
    ids.push(entry.id);
  }
  const trimmed = trimReviewStore({ version: REVIEW_VERSION, entries });
  const keptIds = new Set(trimmed.entries.map((e) => e.id));
  return { store: trimmed, ids: ids.map((id) => (id && keptIds.has(id) ? id : null)) };
}

/** 復習の結果を反映する（正解なら外す。まちがいなら回数を増やす） */
export function recordReviewResult(store, id, isCorrect, { now = new Date().toISOString() } = {}) {
  if (isCorrect) return { ...store, entries: store.entries.filter((e) => e.id !== id) };
  return {
    ...store,
    entries: store.entries.map((e) => (e.id === id ? { ...e, incorrectCount: e.incorrectCount + 1, lastIncorrectAt: now } : e)),
  };
}

/** カテゴリの復習待ちの問題（新しく間違えた順） */
export const getReviewEntries = (store, category) => store.entries.filter((e) => !category || e.category === category);

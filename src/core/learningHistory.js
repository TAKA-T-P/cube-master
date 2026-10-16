/**
 * 学習記録（カテゴリ別の練習回数・正答数など。Three.js・DOM 非依存）
 *
 * 個人情報（名前・ID など）は持たない。ブラウザの中だけに保存する（core/storageManager）。
 * 関数はすべて新しいオブジェクトを返し、引数は変えない。
 *
 * {
 *   version: 1,
 *   categories: {
 *     [categoryId]: {
 *       playedSessions, answeredCount, correctCount, partialCount, hintUsedCount,
 *       byDifficulty: { 1: { answered, correct }, 2: {…}, 3: {…} },
 *       recent: [{ date, difficulty, answered, correct }]（新しい順・最大 RECENT_LIMIT 件）,
 *       reviewAnswered, reviewCorrect,   // 復習で解いた数・正解した数
 *     }
 *   },
 * }
 * 段位認定（Phase 5）の結果は、categories と並べて新しい項目（例 certification）として追加できる。
 * 読み込むときは normalizeHistory で必ず形を確かめ、こわれた値は 0 などに直す。
 */
export const HISTORY_VERSION = 1;
export const RECENT_LIMIT = 10;
/** 記録するカテゴリの数の上限（不正なデータで大きくならないように） */
const MAX_CATEGORIES = 40;

const count = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
const emptyDifficulty = () => ({ 1: { answered: 0, correct: 0 }, 2: { answered: 0, correct: 0 }, 3: { answered: 0, correct: 0 } });

export const createEmptyHistory = () => ({ version: HISTORY_VERSION, categories: {} });

export const emptyCategoryRecord = () => ({
  playedSessions: 0,
  answeredCount: 0,
  correctCount: 0,
  partialCount: 0,
  hintUsedCount: 0,
  byDifficulty: emptyDifficulty(),
  recent: [],
  reviewAnswered: 0,
  reviewCorrect: 0,
});

function normalizeRecord(raw) {
  const r = emptyCategoryRecord();
  if (!raw || typeof raw !== 'object') return r;
  for (const k of ['playedSessions', 'answeredCount', 'correctCount', 'partialCount', 'hintUsedCount', 'reviewAnswered', 'reviewCorrect']) r[k] = count(raw[k]);
  r.correctCount = Math.min(r.correctCount, r.answeredCount);
  r.reviewCorrect = Math.min(r.reviewCorrect, r.reviewAnswered);
  for (const d of [1, 2, 3]) {
    const v = raw.byDifficulty?.[d];
    const answered = count(v?.answered);
    r.byDifficulty[d] = { answered, correct: Math.min(count(v?.correct), answered) };
  }
  if (Array.isArray(raw.recent)) {
    r.recent = raw.recent
      .filter((x) => x && typeof x.date === 'string' && !Number.isNaN(Date.parse(x.date)))
      .slice(0, RECENT_LIMIT)
      .map((x) => {
        const answered = count(x.answered);
        return { date: x.date, difficulty: [1, 2, 3, 'all'].includes(x.difficulty) ? x.difficulty : 'all', answered, correct: Math.min(count(x.correct), answered) };
      });
  }
  return r;
}

/** 保存データを確かめて、今の形にそろえる（古い形・こわれたデータでもエラーにしない） */
export function normalizeHistory(raw) {
  if (!raw || typeof raw !== 'object' || raw.version !== HISTORY_VERSION || !raw.categories || typeof raw.categories !== 'object') {
    // 今は version 1 だけ。形を変えたときは、ここで古い version から移しかえる
    return createEmptyHistory();
  }
  const categories = {};
  for (const [id, rec] of Object.entries(raw.categories).slice(0, MAX_CATEGORIES)) {
    if (typeof id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(id)) categories[id] = normalizeRecord(rec);
  }
  return { version: HISTORY_VERSION, categories };
}

/**
 * トレーニング1回分の結果を記録する（TrainingSession.getSummary() の形）
 * @param {object} history
 * @param {{ category, difficulty, answeredCount, correctCount, hintUsedCount?, history: object[] }} summary
 * @param {{ date?: string }} [options] 日時（ISO 文字列）
 */
export function recordTrainingResult(history, summary, { date = new Date().toISOString() } = {}) {
  const next = normalizeHistory(history);
  if (!summary || summary.answeredCount <= 0) return next;
  const rec = next.categories[summary.category] ?? emptyCategoryRecord();
  rec.playedSessions += 1;
  rec.answeredCount += summary.answeredCount;
  rec.correctCount += summary.correctCount;
  rec.hintUsedCount += count(summary.hintUsedCount);
  for (const item of summary.history ?? []) {
    if (item.status === 'partial') rec.partialCount += 1;
    const d = rec.byDifficulty[item.difficulty];
    if (d) {
      d.answered += 1;
      if (item.isCorrect) d.correct += 1;
    }
  }
  rec.recent = [{ date, difficulty: summary.difficulty, answered: summary.answeredCount, correct: summary.correctCount }, ...rec.recent].slice(0, RECENT_LIMIT);
  next.categories[summary.category] = rec;
  return next;
}

/** 復習で1問解いた結果を記録する（通常のトレーニングの正答数には入れない） */
export function recordReviewAnswer(history, category, isCorrect) {
  const next = normalizeHistory(history);
  const rec = next.categories[category] ?? emptyCategoryRecord();
  rec.reviewAnswered += 1;
  if (isCorrect) rec.reviewCorrect += 1;
  next.categories[category] = rec;
  return next;
}

/** 表示用の集計（記録がなければ null） */
export function getCategoryStats(history, category) {
  const rec = history?.categories?.[category];
  if (!rec || (rec.playedSessions === 0 && rec.reviewAnswered === 0)) return null;
  const rate = (c, a) => (a === 0 ? null : c / a);
  return {
    ...rec,
    accuracy: rate(rec.correctCount, rec.answeredCount),
    difficultyAccuracy: Object.fromEntries([1, 2, 3].map((d) => [d, rate(rec.byDifficulty[d].correct, rec.byDifficulty[d].answered)])),
  };
}

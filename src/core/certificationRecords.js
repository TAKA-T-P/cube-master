/**
 * 段位認定の記録（レベル別の挑戦回数・最高得点・最高段位・最近の結果。Three.js・DOM 非依存）
 *
 * トレーニングの学習記録（core/learningHistory。キー cubeMaster:history）とは別のデータ（キー cubeMaster:certification）に保存するので、
 * 段位認定をしてもトレーニングの記録は変わらず、古い学習記録・復習データにもさわらない。
 *
 * {
 *   version: 1,
 *   rulesVersion: 1,             // 最高記録をとったときの段位の基準（core/certificationRules の rulesVersion）
 *   levels: {
 *     basic | standard | expert: {
 *       attempts, bestScore, bestCorrect, bestRank（0〜21。0 = 認定なし）, lastPlayedAt（ISO 文字列 | null）,
 *       recent: [{ date, score, correct, answered, rank, rulesVersion }]（新しい順・最大 RECENT_LIMIT 件）,
 *       previous?: { rulesVersion, bestScore, bestRank }（基準が変わる前の最高記録。今の基準の記録とは混ぜない）
 *     }
 *   }
 * }
 * 中断した挑戦（summary.aborted）は記録しない。最高段位・最高得点は、低い成績で下がらない。
 */
import { LEVELS, MAX_RANK, CERTIFICATION_RULES } from './certificationRules.js';

export const RECORDS_VERSION = 1;
export const RECENT_LIMIT = 20;

const count = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
const rank = (v) => Math.min(MAX_RANK, count(v));
const isDate = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v));

export const emptyLevelRecord = () => ({ attempts: 0, bestScore: 0, bestCorrect: 0, bestRank: 0, lastPlayedAt: null, recent: [] });

export const createEmptyRecords = (rules = CERTIFICATION_RULES) => ({
  version: RECORDS_VERSION,
  rulesVersion: rules.rulesVersion,
  levels: Object.fromEntries(LEVELS.map((l) => [l, emptyLevelRecord()])),
});

function normalizeLevel(raw) {
  const r = emptyLevelRecord();
  if (!raw || typeof raw !== 'object') return r;
  r.attempts = count(raw.attempts);
  r.bestScore = count(raw.bestScore);
  r.bestCorrect = count(raw.bestCorrect);
  r.bestRank = rank(raw.bestRank);
  r.lastPlayedAt = isDate(raw.lastPlayedAt) ? raw.lastPlayedAt : null;
  if (Array.isArray(raw.recent)) {
    r.recent = raw.recent
      .filter((x) => x && isDate(x.date))
      .slice(0, RECENT_LIMIT)
      .map((x) => ({ date: x.date, score: count(x.score), correct: count(x.correct), answered: count(x.answered), rank: rank(x.rank), rulesVersion: count(x.rulesVersion) }));
  }
  if (raw.previous && typeof raw.previous === 'object') {
    r.previous = { rulesVersion: count(raw.previous.rulesVersion), bestScore: count(raw.previous.bestScore), bestRank: rank(raw.previous.bestRank) };
  }
  return r;
}

/**
 * 保存データを確かめて今の形にそろえる（ない・こわれている・古い形でもエラーにしない）
 * 段位の基準（rulesVersion）が変わっていたら、前の最高記録を previous に移し、今の基準の最高記録は 0 から数える
 */
export function normalizeRecords(raw, rules = CERTIFICATION_RULES) {
  if (!raw || typeof raw !== 'object' || raw.version !== RECORDS_VERSION || !raw.levels || typeof raw.levels !== 'object') return createEmptyRecords(rules);
  const levels = Object.fromEntries(LEVELS.map((l) => [l, normalizeLevel(raw.levels[l])]));
  const savedRules = count(raw.rulesVersion);
  if (savedRules !== rules.rulesVersion) {
    for (const l of LEVELS) {
      const rec = levels[l];
      if (rec.bestScore > 0 || rec.bestRank > 0) rec.previous = { rulesVersion: savedRules, bestScore: rec.bestScore, bestRank: rec.bestRank };
      rec.bestScore = 0;
      rec.bestCorrect = 0;
      rec.bestRank = 0;
    }
  }
  return { version: RECORDS_VERSION, rulesVersion: rules.rulesVersion, levels };
}

/**
 * 1回の挑戦の結果を記録する
 * @param {object} records
 * @param {ReturnType<import('./certificationSession.js').CertificationSession['getSummary']>} summary
 * @returns {{ records, previousRank: number, newRank: number, rankUp: boolean, bestScoreUpdated: boolean, recorded: boolean }}
 *   rankUp：最高段位が上がったときだけ true（昇段の演出を出す）。bestScoreUpdated：最高得点を更新した（段位が同じでも自己ベスト）
 */
export function recordCertificationResult(records, summary, { date = new Date().toISOString(), rules = CERTIFICATION_RULES } = {}) {
  const next = normalizeRecords(records, rules);
  const rec = next.levels[summary?.level];
  if (!rec || summary.aborted) {
    const r = rec?.bestRank ?? 0;
    return { records: next, previousRank: r, newRank: r, rankUp: false, bestScoreUpdated: false, recorded: false };
  }
  const previousRank = rec.bestRank;
  const previousBest = rec.bestScore;
  const achieved = rank(summary.rankLevel);
  rec.attempts += 1;
  rec.lastPlayedAt = date;
  rec.bestRank = Math.max(rec.bestRank, achieved);
  rec.bestScore = Math.max(rec.bestScore, count(summary.score));
  rec.bestCorrect = Math.max(rec.bestCorrect, count(summary.correctCount));
  rec.recent = [
    { date, score: count(summary.score), correct: count(summary.correctCount), answered: count(summary.answeredCount), rank: achieved, rulesVersion: rules.rulesVersion },
    ...rec.recent,
  ].slice(0, RECENT_LIMIT);
  return {
    records: next,
    previousRank,
    newRank: rec.bestRank,
    rankUp: rec.bestRank > previousRank,
    bestScoreUpdated: summary.score > previousBest && summary.score > 0,
    recorded: true,
  };
}

/**
 * トライアルの記録（Three.js・DOM 非依存。保存は ui/trial/trialStore、キー cubeMaster:trial）
 *
 *   { version: 1, modes: { blockCount: { bestLevel, attempts, lastPlayedAt }, ... } }
 *
 * 種類ごとに自己ベスト（最高到達 LEVEL）を持つ。記録の基準は highestLevel だけで、終了時の LEVEL は使わない。
 * 中断した挑戦は記録しない。トレーニング・1分チャレンジ・段位認定の記録とは別に保存する。
 */
import { TRIAL_MODE_IDS, isTrialMode } from './trialRules.js';

export const TRIAL_RECORDS_VERSION = 1;

const emptyMode = () => ({ bestLevel: 0, attempts: 0, lastPlayedAt: null });

export function createEmptyTrialRecords() {
  return { version: TRIAL_RECORDS_VERSION, modes: Object.fromEntries(TRIAL_MODE_IDS.map((id) => [id, emptyMode()])) };
}

const count = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);

/** 読み込んだデータの形を確かめる（こわれた値は直すか捨てる） */
export function normalizeTrialRecords(raw) {
  const records = createEmptyTrialRecords();
  if (!raw || typeof raw !== 'object' || raw.version !== TRIAL_RECORDS_VERSION || typeof raw.modes !== 'object' || !raw.modes) return records;
  for (const id of TRIAL_MODE_IDS) {
    const m = raw.modes[id];
    if (!m || typeof m !== 'object') continue;
    records.modes[id] = { bestLevel: count(m.bestLevel), attempts: count(m.attempts), lastPlayedAt: typeof m.lastPlayedAt === 'string' ? m.lastPlayedAt : null };
  }
  return records;
}

/**
 * 最後まで終えた挑戦を記録する（中断したものは記録しない）
 * @returns {{ records, previousBest: number, bestUpdated: boolean, recorded: boolean }}
 */
export function recordTrialResult(records, summary, { now = () => new Date().toISOString() } = {}) {
  const current = normalizeTrialRecords(records);
  if (!summary || summary.aborted || !isTrialMode(summary.mode)) return { records: current, previousBest: 0, bestUpdated: false, recorded: false };
  const prev = current.modes[summary.mode];
  const bestUpdated = summary.highestLevel > prev.bestLevel;
  const next = {
    ...current,
    modes: {
      ...current.modes,
      [summary.mode]: { bestLevel: Math.max(prev.bestLevel, summary.highestLevel), attempts: prev.attempts + 1, lastPlayedAt: now() },
    },
  };
  return { records: next, previousBest: prev.bestLevel, bestUpdated, recorded: true };
}

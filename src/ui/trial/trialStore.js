/**
 * トライアルの進行状態と記録の保存（記録はブラウザの localStorage。キー cubeMaster:trial）
 *
 * トレーニング・1分チャレンジ・段位認定の記録とは別に保存する。中断した挑戦（タブの切りかえ・画面を離れた・やめる）は記録しない。
 */
import { TrialSession } from '../../core/trial/trialSession.js';
import { normalizeTrialRecords, recordTrialResult } from '../../core/trial/trialRecords.js';
import { createStorage } from '../../core/storageManager.js';
import { showToast } from '../../utils/dom.js';

const KEY = 'trial';

function browserBackend() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

let storage = null;
const getStorage = () => (storage ??= createStorage(browserBackend()));

let state = { mode: null, session: null, summary: null, outcome: null, notice: null };

/** 保存先を差しかえる（テスト用。undefined で localStorage にもどす） */
export function configureTrialStorage(backend) {
  storage = createStorage(backend === undefined ? browserBackend() : backend);
}

/** 4種類の自己ベスト・挑戦回数 */
export const getTrialRecords = () => normalizeTrialRecords(getStorage().read(KEY));

/** 新しい挑戦を始める（まだタイマーは動かない。カウントダウンのあと、最初の問題を表示したときに始まる） */
export function startTrial(mode, { rng, now } = {}) {
  const session = new TrialSession({ mode, rng, now });
  state = { mode, session, summary: null, outcome: null, notice: null };
  return session;
}

export const getTrialSession = () => state.session;

/** 最後まで終えた挑戦を記録する（中断したものは記録しない） */
export function finishTrial() {
  const session = state.session;
  if (!session) return null;
  const summary = session.finish();
  const outcome = recordTrialResult(getTrialRecords(), summary);
  if (outcome.recorded && !getStorage().write(KEY, outcome.records) && getStorage().available) {
    showToast('トライアルの記録を保存できませんでした。', { type: 'error' });
  }
  state = { ...state, session: null, summary, outcome };
  return { summary, outcome };
}

/** 中断する（記録しない）。notice は次にトライアルの画面を開いたときに出すお知らせ */
export function abortTrial(notice = null) {
  state.session?.abort();
  state = { ...state, session: null, summary: null, outcome: null, notice };
}

export const getTrialResult = () => (state.summary ? { summary: state.summary, outcome: state.outcome, mode: state.mode } : null);

/** お知らせ（中断したときなど）を1回だけ受け取る */
export function takeTrialNotice() {
  const n = state.notice;
  state.notice = null;
  return n;
}

/** すべて消す（テスト用） */
export function resetTrialStore() {
  state = { mode: null, session: null, summary: null, outcome: null, notice: null };
}

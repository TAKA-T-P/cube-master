/**
 * 段位認定の進行状態と記録の保存（記録はブラウザの localStorage。キー cubeMaster:certification）
 *
 * トレーニングの学習記録（ui/learningStore・cubeMaster:history）とは別に保存する。
 * 中断した挑戦（タブの切りかえ・画面を離れた・やめる）は記録しない。
 */
import { CertificationSession } from '../core/certificationSession.js';
import { CERTIFICATION_RULES } from '../core/certificationRules.js';
import { normalizeRecords, recordCertificationResult } from '../core/certificationRecords.js';
import { createStorage } from '../core/storageManager.js';
import { CATEGORIES, getTemplates } from '../questions/questionRegistry.js';
import { showToast } from '../utils/dom.js';

const KEY = 'certification';

function browserBackend() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

let storage = null;
const getStorage = () => (storage ??= createStorage(browserBackend()));

let state = { level: null, session: null, summary: null, outcome: null, notice: null };

/** 保存先を差しかえる（テスト用。undefined で localStorage にもどす） */
export function configureCertificationStorage(backend) {
  storage = createStorage(backend === undefined ? browserBackend() : backend);
}

/** 段位認定で出題するカテゴリのテンプレート（ルールの categories のうち、遊べるカテゴリ） */
export function certificationTemplates(rules = CERTIFICATION_RULES) {
  return Object.fromEntries(CATEGORIES.filter((c) => c.enabled && rules.categories.includes(c.id)).map((c) => [c.id, getTemplates(c.id)]));
}

/**
 * 新しい挑戦を始める（まだタイマーは動かない。カウントダウンのあと、最初の問題を表示したときに始まる）
 * @param {'basic'|'standard'|'expert'} level
 */
export function startCertification(level, { rng, now } = {}) {
  const session = new CertificationSession({ level, templatesByCategory: certificationTemplates(), rng, now });
  state = { level, session, summary: null, outcome: null, notice: null };
  return session;
}

export const getCertificationSession = () => state.session;
export const getCertificationLevel = () => state.level;

/** 最後まで終えた挑戦を記録する（中断したものは記録しない） */
export function finishCertification() {
  const session = state.session;
  if (!session) return null;
  const summary = session.finish();
  const records = normalizeRecords(getStorage().read(KEY));
  const outcome = recordCertificationResult(records, summary);
  if (outcome.recorded && !getStorage().write(KEY, outcome.records) && getStorage().available) {
    showToast('段位認定の記録を保存できませんでした。', { type: 'error' });
  }
  state = { ...state, session: null, summary, outcome };
  return { summary, outcome };
}

/** 中断する（記録しない）。notice は次に段位認定の画面を開いたときに出すお知らせ */
export function abortCertification(notice = null) {
  state.session?.abort();
  state = { ...state, session: null, summary: null, outcome: null, notice };
}

export const getCertificationResult = () => (state.summary ? { summary: state.summary, outcome: state.outcome, level: state.level } : null);

/** お知らせ（中断したときなど）を1回だけ受け取る */
export function takeCertificationNotice() {
  const n = state.notice;
  state.notice = null;
  return n;
}

/** 保存した記録（ない・こわれていても空の記録） */
export const getCertificationRecords = () => normalizeRecords(getStorage().read(KEY));
export const isCertificationStorageAvailable = () => getStorage().available;

/** すべて消す（テスト用） */
export function resetCertificationStore() {
  state = { level: null, session: null, summary: null, outcome: null, notice: null };
}

/**
 * アプリの設定（効果音のオン／オフ・音量、三平方の定理・√ を使う問題を出すか）。ブラウザに保存する（キー cubeMaster:settings）
 *
 * - allowPythagoreanQuestions：通常トレーニングで、三平方の定理・√ が必要な問題を出すか（初期値 false = 出題しない）。
 *   古い保存データにこの項目がなければ false として読む。1分チャレンジ・段位認定ではこの設定を見ない（core/questionEligibility）
 *
 * 効果音をすべて止めても、正誤（○△×・色）と結果は画面でわかる。保存できない環境では、ページを閉じるまで覚えておく。
 */
import { createStorage } from '../core/storageManager.js';

const KEY = 'settings';
const DEFAULTS = Object.freeze({ soundEnabled: true, soundVolume: 0.8, allowPythagoreanQuestions: false });

function browserBackend() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

let storage = null;
let settings = null;
const listeners = new Set();

function normalize(raw) {
  const s = { ...DEFAULTS };
  if (raw && typeof raw === 'object') {
    if (typeof raw.soundEnabled === 'boolean') s.soundEnabled = raw.soundEnabled;
    if (Number.isFinite(raw.soundVolume)) s.soundVolume = Math.min(1, Math.max(0, raw.soundVolume));
    if (typeof raw.allowPythagoreanQuestions === 'boolean') s.allowPythagoreanQuestions = raw.allowPythagoreanQuestions;
  }
  return s;
}

function load() {
  if (settings) return settings;
  storage ??= createStorage(browserBackend());
  settings = normalize(storage.read(KEY));
  return settings;
}

function update(patch) {
  settings = normalize({ ...load(), ...patch });
  storage.write(KEY, settings);
  for (const fn of listeners) fn(settings);
}

/** 保存先を差しかえる（テスト用。undefined で localStorage にもどす） */
export function configureSoundSettingsStorage(backend) {
  storage = createStorage(backend === undefined ? browserBackend() : backend);
  settings = null;
}

export const getSoundSettings = () => {
  const { soundEnabled, soundVolume } = load();
  return { soundEnabled, soundVolume };
};
export const isSoundEnabled = () => load().soundEnabled;
export const getSoundVolume = () => load().soundVolume;
export const setSoundEnabled = (enabled) => update({ soundEnabled: Boolean(enabled) });
export const setSoundVolume = (volume) => update({ soundVolume: Number(volume) });

/** 問題の出題設定（通常トレーニングで使う） */
export const getQuestionSettings = () => ({ allowPythagoreanQuestions: load().allowPythagoreanQuestions });
export const isPythagoreanAllowed = () => load().allowPythagoreanQuestions;
export const setPythagoreanAllowed = (allowed) => update({ allowPythagoreanQuestions: Boolean(allowed) });

/** 設定が変わったときに呼ぶ（画面のボタンの表示を合わせる） */
export function onSoundSettingsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

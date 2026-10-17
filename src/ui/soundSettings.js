/**
 * 効果音の設定（オン／オフ・音量）。ブラウザに保存する（キー cubeMaster:settings）
 *
 * 効果音をすべて止めても、正誤（○△×・色）と結果は画面でわかる。保存できない環境では、ページを閉じるまで覚えておく。
 */
import { createStorage } from '../core/storageManager.js';

const KEY = 'settings';
const DEFAULTS = Object.freeze({ soundEnabled: true, soundVolume: 0.8 });

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

export const getSoundSettings = () => ({ ...load() });
export const isSoundEnabled = () => load().soundEnabled;
export const getSoundVolume = () => load().soundVolume;
export const setSoundEnabled = (enabled) => update({ soundEnabled: Boolean(enabled) });
export const setSoundVolume = (volume) => update({ soundVolume: Number(volume) });

/** 設定が変わったときに呼ぶ（画面のボタンの表示を合わせる） */
export function onSoundSettingsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * 回答後の効果音（Web Audio で合成するので、音声ファイルは使わない）
 *
 * - 正解：ピンポーン（高い音が2つ上がる）
 * - おしい：ポンポン（同じ高さの音が2つ）
 * - 不正解：ブッブー（低いブザー）
 * - 結果画面へ（決めた問題数を解き終えたとき）：ファンファーレ（ド・ミ・ソ・ド）
 * - ボタンを押したとき：ポッ（低く短い音。高さを少し下げて丸い音にする）
 * - 段位認定：カウントダウン（3・2・1 はピッ、START! はピーン）・時間切れ（ピッ・ピッ・ピー）・昇段（キラキラ）
 *
 * 効果音のオン／オフ・音量は ui/soundSettings（ブラウザに保存）。オフのときは何も鳴らさない。
 * iOS などは、ボタンを押した処理の中で AudioContext を作る・再開しないと音が出ないので、
 * 「回答する」「結果を見る」を押したときに呼ぶ。Web Audio が使えない環境では何もしない。
 */
import { isSoundEnabled, getSoundVolume } from './soundSettings.js';

const TONES = {
  correct: [
    { freq: 1046.5, at: 0, length: 0.16, volume: 0.22 },
    { freq: 1568, at: 0.13, length: 0.5, volume: 0.2 },
  ],
  partial: [
    { freq: 784, at: 0, length: 0.14, volume: 0.2 },
    { freq: 784, at: 0.2, length: 0.26, volume: 0.2 },
  ],
  incorrect: [
    { freq: 185, at: 0, length: 0.24, volume: 0.07, type: 'square' },
    { freq: 185, at: 0.3, length: 0.45, volume: 0.07, type: 'square' },
  ],
  // 段位認定：昇段（キラキラと上がる音）
  rankUp: [
    { freq: 783.99, at: 0, length: 0.12, volume: 0.16, type: 'triangle' },
    { freq: 1046.5, at: 0.1, length: 0.12, volume: 0.16, type: 'triangle' },
    { freq: 1318.5, at: 0.2, length: 0.12, volume: 0.16, type: 'triangle' },
    { freq: 1568, at: 0.3, length: 0.12, volume: 0.16, type: 'triangle' },
    { freq: 2093, at: 0.42, length: 0.8, volume: 0.14, type: 'triangle' },
    { freq: 1568, at: 0.42, length: 0.8, volume: 0.08 },
  ],
  // 段位認定：カウントダウン
  countdown: [{ freq: 880, at: 0, length: 0.14, volume: 0.18 }],
  countdownStart: [
    { freq: 1760, at: 0, length: 0.5, volume: 0.2 },
    { freq: 1318.5, at: 0, length: 0.5, volume: 0.1 },
  ],
  // 段位認定：時間切れ
  timeUp: [
    { freq: 880, at: 0, length: 0.18, volume: 0.15, type: 'square' },
    { freq: 660, at: 0.2, length: 0.18, volume: 0.15, type: 'square' },
    { freq: 440, at: 0.4, length: 0.5, volume: 0.15, type: 'square' },
  ],
  // ボタンを押したとき（freqEnd まで高さを下げる）
  click: [{ freq: 330, freqEnd: 150, at: 0, length: 0.07, volume: 0.22 }],
  finish: [
    { freq: 523.25, at: 0, length: 0.16, volume: 0.18, type: 'triangle' },
    { freq: 659.25, at: 0.14, length: 0.16, volume: 0.18, type: 'triangle' },
    { freq: 783.99, at: 0.28, length: 0.16, volume: 0.18, type: 'triangle' },
    { freq: 1046.5, at: 0.44, length: 0.7, volume: 0.2, type: 'triangle' },
    { freq: 1318.5, at: 0.44, length: 0.7, volume: 0.1 },
  ],
};

let context = null;

function getContext() {
  if (context) return context;
  const AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!AudioContextClass) return null;
  try {
    context = new AudioContextClass();
  } catch {
    context = null;
  }
  return context;
}

/** @param {'correct'|'partial'|'incorrect'} status */
export const playAnswerSound = (status) => playTones(TONES[status]);

/** 決めた問題数を解き終えて、結果画面へ進むとき */
export const playFinishSound = () => playTones(TONES.finish);

/** 段位認定：昇段したとき */
export const playRankUpSound = () => playTones(TONES.rankUp);

/** 段位認定：カウントダウン（start = true で START!） */
export const playCountdownSound = (start = false) => playTones(start ? TONES.countdownStart : TONES.countdown);

/** 段位認定：時間切れ */
export const playTimeUpSound = () => playTones(TONES.timeUp);

/** ボタンを押したとき：ポッ */
export const playClickSound = () => playTones(TONES.click);

/**
 * 画面のどのボタンを押しても「ポッ」と鳴らす（無効なボタンは押せないので鳴らない）。
 * data-click-sound="off" のボタン（「回答する」：すぐあとに正誤の音が鳴る）では鳴らさない
 * @param {Document|HTMLElement} [root]
 * @returns {() => void} 取り外す関数
 */
export function installButtonSound(root = document) {
  const onClick = (event) => {
    const btn = event.target?.closest?.('button:not(:disabled)');
    if (btn && btn.dataset.clickSound !== 'off') playClickSound();
  };
  root.addEventListener('click', onClick, true);
  return () => root.removeEventListener('click', onClick, true);
}

function playTones(tones) {
  if (!tones || !isSoundEnabled()) return;
  const volume = getSoundVolume();
  if (volume <= 0) return;
  const ctx = getContext();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') ctx.resume?.();
    const now = ctx.currentTime + 0.02;
    for (const tone of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = tone.type ?? 'sine';
      osc.frequency.value = tone.freq;
      if (tone.freqEnd) {
        osc.frequency.setValueAtTime(tone.freq, now + tone.at);
        osc.frequency.exponentialRampToValueAtTime(tone.freqEnd, now + tone.at + tone.length);
      }
      const start = now + tone.at;
      const end = start + tone.length;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, tone.volume * volume), start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(end + 0.02);
    }
  } catch {
    // 音が鳴らなくても回答の流れは止めない
  }
}

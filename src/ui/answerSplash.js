/**
 * 回答直後に画面の前面へ大きく出す「○」「△」「×」
 *
 * 約1秒表示して消え、消えたら onDone を呼ぶ（このあとに正誤・解説・3D の演出を出す）。
 * タップすると、すぐに閉じる。記号は文字ではなく図形で描く（端末によって位置がずれない）。
 */
import { h } from '../utils/dom.js';

/** 表示する時間（ミリ秒）。0 なら表示せずにすぐ onDone を呼ぶ（テスト用） */
export const answerSplash = { duration: 1000 };

const SVG_NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs) => {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
};

const MARKS = {
  correct: { label: '正解！', shapes: () => [svg('circle', { cx: 50, cy: 50, r: 36, fill: 'none', 'stroke-width': 12 })] },
  partial: {
    label: 'おしい！',
    shapes: () => [svg('polygon', { points: '50,12 90,82 10,82', fill: 'none', 'stroke-width': 11, 'stroke-linejoin': 'round' })],
  },
  incorrect: {
    label: '不正解',
    shapes: () => [
      svg('line', { x1: 18, y1: 18, x2: 82, y2: 82, 'stroke-width': 13, 'stroke-linecap': 'round' }),
      svg('line', { x1: 82, y1: 18, x2: 18, y2: 82, 'stroke-width': 13, 'stroke-linecap': 'round' }),
    ],
  },
};

/**
 * @param {HTMLElement} parent  表示する場所（画面を閉じると一緒に消える）
 * @param {'correct'|'partial'|'incorrect'} status
 * @param {() => void} onDone
 * @returns {{ close: () => void, cancel: () => void }} close：すぐ閉じて onDone、cancel：onDone を呼ばずに消す
 */
export function showAnswerSplash(parent, status, onDone) {
  const mark = MARKS[status] ?? MARKS.incorrect;
  let finished = false;
  let timer = null;
  let el = null;
  const finish = (callDone) => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    el?.remove();
    if (callDone) onDone();
  };
  if (!(answerSplash.duration > 0)) {
    finish(true);
    return { close() {}, cancel() {} };
  }
  const icon = svg('svg', { viewBox: '0 0 100 100', class: 'answer-splash__mark', 'aria-hidden': 'true' });
  icon.append(...mark.shapes());
  el = h(
    'div',
    { class: `answer-splash answer-splash--${status}`, role: 'status', 'aria-label': mark.label, onClick: () => finish(true) },
    icon,
    h('span', { class: 'answer-splash__label' }, mark.label),
  );
  el.style.setProperty('--splash-duration', `${answerSplash.duration}ms`);
  parent.append(el);
  timer = setTimeout(() => finish(true), answerSplash.duration);
  return { close: () => finish(true), cancel: () => finish(false) };
}

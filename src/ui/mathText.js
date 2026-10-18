/**
 * 解説などの文の中の分数（1/2・9/2・√2/2・2√10/3 など）を、横線の上に分子・下に分母がある縦型の分数で表示する
 *
 * 見えない「/」を間に入れるので、読み上げや textContent は「1/2」のまま。
 */
import { h } from '../utils/dom.js';

// 分子：整数・√ をふくむ数（√2・2√10）。分母：整数。日付や「ア/イ」のような文字は対象にしない
const FRACTION = /(\d*√\d+|\d+)\/(\d+)/g;

/** 分数をふくむ文を、縦型の分数をまぜた DOM にする */
export function renderMathText(text) {
  const fragment = document.createDocumentFragment();
  let last = 0;
  for (const m of String(text ?? '').matchAll(FRACTION)) {
    if (m.index > last) fragment.append(text.slice(last, m.index));
    fragment.append(
      h(
        'span',
        { class: 'frac' },
        h('span', { class: 'frac__num' }, m[1]),
        h('span', { class: 'sr-only' }, '/'),
        h('span', { class: 'frac__den' }, m[2]),
      ),
    );
    last = m.index + m[0].length;
  }
  if (last < String(text ?? '').length) fragment.append(String(text).slice(last));
  return fragment;
}

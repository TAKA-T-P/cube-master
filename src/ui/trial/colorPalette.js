/**
 * 「展開図に分けろ！」の色パレット（5色＋消しゴム）。色ごとに、ぬったマスの数（6まで）を出す
 */
import { h } from '../../utils/dom.js';
import { MAX_CELLS_PER_COLOR } from '../../core/trial/netPartitionTrial.js';

export const TRIAL_COLORS = Object.freeze([
  { id: 0, name: '赤', fill: '#ff5a5a' },
  { id: 1, name: 'オレンジ', fill: '#ffbf2e' },
  { id: 2, name: '黄', fill: '#fff04a' },
  { id: 3, name: '緑', fill: '#8fd45a' },
  { id: 4, name: '青', fill: '#3fb3f5' },
]);
export const ERASER = 'eraser';

/**
 * @param {{ onSelect?: (color: number|'eraser') => void }} options
 */
export function createColorPalette({ onSelect = () => {} } = {}) {
  let selected = 0;
  const counts = TRIAL_COLORS.map(() => h('span', { class: 'trial-palette__count' }, `0/${MAX_CELLS_PER_COLOR}`));
  const buttons = TRIAL_COLORS.map((color, i) =>
    h(
      'button',
      { class: 'trial-palette__color', type: 'button', role: 'radio', 'aria-label': `${color.name}（${MAX_CELLS_PER_COLOR}マスまで）`, dataset: { color: color.id }, style: { background: color.fill }, onClick: () => select(color.id) },
      counts[i],
    ),
  );
  const eraser = h('button', { class: 'trial-palette__eraser', type: 'button', role: 'radio', 'aria-label': '消しゴム', dataset: { color: ERASER }, onClick: () => select(ERASER) }, '消しゴム');
  const render = () => {
    for (const b of [...buttons, eraser]) b.setAttribute('aria-checked', String(b.dataset.color === String(selected)));
  };
  function select(c) {
    selected = c;
    render();
    onSelect(c);
  }
  render();
  return {
    el: h('div', { class: 'trial-palette', role: 'radiogroup', 'aria-label': '色' }, buttons, eraser),
    getSelected: () => selected,
    /** 色ごとにぬったマスの数を表示する */
    setCounts(list) {
      list.forEach((n, i) => {
        counts[i].textContent = `${n}/${MAX_CELLS_PER_COLOR}`;
        buttons[i].classList.toggle('trial-palette__color--full', n >= MAX_CELLS_PER_COLOR);
      });
    },
    setDisabled(v) {
      for (const b of [...buttons, eraser]) b.disabled = v;
    },
  };
}

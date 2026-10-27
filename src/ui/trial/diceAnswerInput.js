/**
 * サイコロの目（1〜6）のボタン。押したらすぐに回答する（「決定」ボタンはない）。目はふつうのサイコロと同じドットで描く
 */
import { h } from '../../utils/dom.js';
import { renderFaceSvg } from '../visualChoices.js';
import { numberFace } from '../../core/cubeFaceLabels.js';

export function createDiceAnswerInput({ onSubmit }) {
  let selected = null;
  let disabled = false;
  const buttons = [1, 2, 3, 4, 5, 6].map((n) =>
    h(
      'button',
      { class: 'trial-dice__btn', type: 'button', role: 'radio', 'aria-checked': 'false', 'aria-label': `${n}の目`, dataset: { value: n }, onClick: () => select(n) },
      renderFaceSvg({ face: numberFace(n) }, 'trial-dice__face'),
      h('span', { class: 'trial-dice__num' }, String(n)),
    ),
  );
  const render = () => {
    for (const b of buttons) b.setAttribute('aria-checked', String(Number(b.dataset.value) === selected));
  };
  // 押した目で、すぐに回答する（どれを押したかは、答え合わせの間も印で残す）
  function select(n) {
    if (disabled) return;
    selected = n;
    render();
    onSubmit(n);
  }
  const onKey = (e) => {
    if (disabled || !/^[1-6]$/.test(e.key)) return;
    select(Number(e.key));
    e.preventDefault();
  };
  document.addEventListener('keydown', onKey);
  render();
  return {
    el: h('div', { class: 'trial-dice' }, h('div', { class: 'trial-dice__buttons', role: 'radiogroup', 'aria-label': '上の面の目（押すと回答）' }, buttons)),
    getValue: () => selected,
    setDisabled(v) {
      disabled = v;
      for (const b of buttons) b.disabled = v;
      render();
    },
    destroy() {
      document.removeEventListener('keydown', onKey);
    },
  };
}

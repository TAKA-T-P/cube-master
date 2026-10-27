/**
 * サイコロの目（1〜6）を選んで「決定」する部品。目はふつうのサイコロと同じドットで描く
 */
import { h } from '../../utils/dom.js';
import { renderFaceSvg } from '../visualChoices.js';
import { numberFace } from '../../core/cubeFaceLabels.js';

export function createDiceAnswerInput({ onSubmit }) {
  let selected = null;
  let disabled = false;
  const submit = h('button', { class: 'btn btn--primary trial-dice__submit', type: 'button', onClick: () => !disabled && selected !== null && onSubmit(selected) }, '決定');
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
    submit.disabled = disabled || selected === null;
  };
  function select(n) {
    if (disabled) return;
    selected = n;
    render();
  }
  const onKey = (e) => {
    if (disabled) return;
    if (/^[1-6]$/.test(e.key)) select(Number(e.key));
    else if (e.key === 'Enter' && selected !== null) onSubmit(selected);
    else return;
    e.preventDefault();
  };
  document.addEventListener('keydown', onKey);
  render();
  return {
    el: h('div', { class: 'trial-dice' }, h('div', { class: 'trial-dice__buttons', role: 'radiogroup', 'aria-label': '上の面の目' }, buttons), submit),
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

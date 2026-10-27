/**
 * 数字を入力するテンキー（0〜9・1文字消す・全部消す・決定）
 *
 * スマホでもキーボードを出さずに入力できる。PC ではキーボードの数字・Backspace・Delete・Enter も使える。
 * 何も入力していないときは「決定」を押せない。
 */
import { h } from '../../utils/dom.js';

/**
 * @param {{ maxDigits?: number, unit?: string, onSubmit: (value: string) => void }} options
 */
export function createNumberInput({ maxDigits = 3, unit = '', onSubmit }) {
  let value = '';
  let disabled = false;
  const display = h('output', { class: 'trial-number__display', 'aria-live': 'polite', 'data-testid': 'number-display' }, '');
  const submit = h('button', { class: 'btn btn--primary trial-number__submit', type: 'button', onClick: () => doSubmit() }, '決定');

  const render = () => {
    display.textContent = value === '' ? '' : `${value}${unit}`;
    display.classList.toggle('trial-number__display--empty', value === '');
    submit.disabled = disabled || value === '';
  };
  const type = (d) => {
    if (disabled) return;
    if (value.length >= maxDigits) return;
    value = value === '0' ? d : value + d;
    render();
  };
  const backspace = () => {
    if (disabled) return;
    value = value.slice(0, -1);
    render();
  };
  const clear = () => {
    if (disabled) return;
    value = '';
    render();
  };
  function doSubmit() {
    if (disabled || value === '') return;
    onSubmit(value);
  }

  const key = (label, onClick, extra = '') => h('button', { class: `trial-key ${extra}`, type: 'button', dataset: { key: label }, onClick }, label);
  const pad = h(
    'div',
    { class: 'trial-number__pad' },
    ...['7', '8', '9', '4', '5', '6', '1', '2', '3'].map((d) => key(d, () => type(d))),
    key('全消去', clear, 'trial-key--sub'),
    key('0', () => type('0')),
    key('⌫', backspace, 'trial-key--sub'),
  );
  pad.lastElementChild.setAttribute('aria-label', '1文字消す');

  const onKey = (e) => {
    if (disabled || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^[0-9]$/.test(e.key)) type(e.key);
    else if (e.key === 'Backspace') backspace();
    else if (e.key === 'Delete' || e.key === 'Escape') clear();
    else if (e.key === 'Enter') doSubmit();
    else return;
    e.preventDefault();
  };
  document.addEventListener('keydown', onKey);
  render();

  return {
    el: h('div', { class: 'trial-number' }, h('div', { class: 'trial-number__row' }, display, submit), pad),
    getValue: () => value,
    setDisabled(v) {
      disabled = v;
      for (const b of pad.querySelectorAll('button')) b.disabled = v;
      render();
    },
    destroy() {
      document.removeEventListener('keydown', onKey);
    },
  };
}

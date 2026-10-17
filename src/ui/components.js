/**
 * 画面共通の小さな UI 部品
 */
import { h, showToast } from '../utils/dom.js';

/** パネルのまとまり */
export function group(title, ...children) {
  return h('section', { class: 'panel-group' }, h('h2', { class: 'panel-group__title' }, title), ...children);
}

/** ボタン（クリック時のエラーで画面が止まらないようにする） */
export function button(label, onClick, extraClass = '') {
  return h(
    'button',
    {
      class: `btn ${extraClass}`,
      type: 'button',
      onClick: () => {
        try {
          onClick();
        } catch (err) {
          console.error(err);
          showToast('操作を完了できませんでした。', { type: 'error' });
        }
      },
    },
    label,
  );
}

/**
 * 複数の選択肢から1つを選ぶボタン群
 * @param {string} label
 * @param {{ value: any, label: string }[]} options
 */
export function segmented(label, options, initial, onChange) {
  let value = initial;
  const buttons = options.map((opt) =>
    h(
      'button',
      {
        class: 'segmented__item',
        type: 'button',
        'aria-pressed': String(opt.value === value),
        dataset: { value: String(opt.value) },
        onClick: () => {
          if (opt.value === value) return;
          value = opt.value;
          for (const [i, b] of buttons.entries()) b.setAttribute('aria-pressed', String(options[i].value === value));
          onChange(value);
        },
      },
      opt.label,
    ),
  );
  const el = h(
    'div',
    { class: 'field' },
    h('span', { class: 'field__label' }, label),
    h('div', { class: 'segmented', role: 'group', 'aria-label': label }, buttons),
  );
  return { el, get: () => value };
}

/** 数を選ぶスライダー（今の値を「5問」のように横に出す） */
export function slider(label, { min, max, step = 1, unit = '' }, initial, onChange) {
  let value = initial;
  const output = h('output', { class: 'slider__value' }, `${value}${unit}`);
  const input = h('input', {
    class: 'slider__input',
    type: 'range',
    min: String(min),
    max: String(max),
    step: String(step),
    value: String(value),
    'aria-label': label,
  });
  input.addEventListener('input', () => {
    value = Number(input.value);
    output.textContent = `${value}${unit}`;
    onChange(value);
  });
  const el = h(
    'div',
    { class: 'field' },
    h('span', { class: 'field__label' }, label),
    h(
      'div',
      { class: 'slider' },
      h('span', { class: 'slider__end', 'aria-hidden': 'true' }, String(min)),
      input,
      h('span', { class: 'slider__end', 'aria-hidden': 'true' }, String(max)),
      output,
    ),
  );
  return { el, get: () => value };
}

/** ON/OFF スイッチ */
export function toggle(label, initial, onChange) {
  const input = h('input', { type: 'checkbox', class: 'switch__input', checked: initial });
  input.addEventListener('change', () => onChange(input.checked));
  const el = h(
    'label',
    { class: 'switch' },
    input,
    h('span', { class: 'switch__track', 'aria-hidden': 'true' }),
    h('span', { class: 'switch__label' }, label),
  );
  return { el };
}

/**
 * 確認ダイアログ
 * @returns {{ el: HTMLElement, result: Promise<boolean>, close: (value:boolean) => void }}
 */
export function confirmDialog({ title, message, okLabel = 'はい', cancelLabel = 'いいえ' }) {
  let resolve;
  const result = new Promise((r) => (resolve = r));
  const onKey = (e) => {
    if (e.key === 'Escape') close(false);
  };
  const close = (value) => {
    document.removeEventListener('keydown', onKey);
    el.remove();
    resolve(value);
  };
  const okButton = h('button', { class: 'btn btn--primary', type: 'button', onClick: () => close(true) }, okLabel);
  const el = h(
    'div',
    { class: 'dialog-backdrop', onClick: (e) => e.target === el && close(false) },
    h(
      'div',
      { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'dialog-title' },
      h('h2', { id: 'dialog-title', class: 'dialog__title' }, title),
      message ? h('p', { class: 'dialog__message' }, message) : null,
      h(
        'div',
        { class: 'dialog__actions' },
        h('button', { class: 'btn', type: 'button', onClick: () => close(false) }, cancelLabel),
        okButton,
      ),
    ),
  );
  document.addEventListener('keydown', onKey);
  document.body.append(el);
  okButton.focus();
  return { el, result, close };
}

/**
 * 説明を見るだけのポップアップ（「閉じる」・Esc・外側を押すと閉じる）
 * @param {{ title: string, items: string[] }} options items は箇条書きにする説明
 */
export function infoDialog({ title, items }) {
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  const close = () => {
    document.removeEventListener('keydown', onKey);
    el.remove();
  };
  const closeButton = h('button', { class: 'btn btn--primary', type: 'button', onClick: () => close() }, '閉じる');
  const el = h(
    'div',
    { class: 'dialog-backdrop', onClick: (e) => e.target === el && close() },
    h(
      'div',
      { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'dialog-title' },
      h('h2', { id: 'dialog-title', class: 'dialog__title' }, title),
      h('ul', { class: 'dialog__list' }, items.map((item) => h('li', {}, item))),
      h('div', { class: 'dialog__actions' }, closeButton),
    ),
  );
  document.addEventListener('keydown', onKey);
  document.body.append(el);
  closeButton.focus();
  return { el, close };
}

/** 小さな「？」ボタン（押すと説明のポップアップを出す） */
export function helpButton(ariaLabel, onClick) {
  return h('button', { class: 'help-q', type: 'button', 'aria-label': ariaLabel, title: ariaLabel, onClick }, '？');
}

/**
 * 小さな DOM 生成ヘルパー
 *   h('button', { class: 'btn', onClick: fn, disabled: true }, 'ラベル')
 * on〇〇 はイベントリスナー、class / dataset / style 以外は属性として設定する。
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key === 'style') Object.assign(el.style, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

/** 画面下部に短いメッセージを表示する */
export function showToast(message, { type = 'info', duration = 3500 } = {}) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const toast = h('div', { class: `toast toast--${type}`, role: type === 'error' ? 'alert' : 'status' }, message);
  root.append(toast);
  setTimeout(() => toast.remove(), duration);
}

/** タッチ操作が主な端末か */
export const isTouchPrimary = () => window.matchMedia?.('(pointer: coarse)').matches ?? false;

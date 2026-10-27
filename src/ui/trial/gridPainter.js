/**
 * マス目をタップ・なぞって塗る部品（Pointer Events。スマホ・PC 共通）
 *
 * - 押した最初のマスで「何にするか」（塗る・消す・どの色）を決め、なぞっている間はその操作を続ける
 *   （同じストロークで同じマスを2回通っても、反転しない）
 * - なぞっている間はページがスクロールしない（touch-action: none）
 */
import { h } from '../../utils/dom.js';

/**
 * @param {{
 *   rows: number, cols: number,
 *   isActive?: (r, c) => boolean,            // 塗れるマスか（展開図の図形の外は塗れない）
 *   initial?: (r, c) => any,                  // はじめの値（null：塗っていない）
 *   resolve: (value, r, c) => any,           // ストロークのはじめに、押したマスの値から「何にするか」を決める（undefined なら何もしない）
 *   canApply?: (r, c, target, values) => boolean,  // そのマスを target にしてよいか
 *   render: (cellEl, value, r, c) => void,
 *   onChange?: (values) => void,
 *   label?: string,
 * }} options
 */
export function createGridPainter({ rows, cols, isActive = () => true, initial = () => null, resolve, canApply = () => true, render, onChange = () => {}, label = 'マス目' }) {
  const values = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => (isActive(r, c) ? initial(r, c) : null)));
  let disabled = false;
  let stroke = null; // { target, visited: Set }

  const cells = [];
  const grid = h('div', {
    class: 'trial-grid',
    role: 'grid',
    'aria-label': label,
    style: { gridTemplateColumns: `repeat(${cols}, 1fr)`, aspectRatio: `${cols} / ${rows}` },
  });
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const active = isActive(r, c);
      const el = h('div', { class: `trial-cell ${active ? '' : 'trial-cell--off'}`, role: 'gridcell', dataset: { r, c } });
      cells.push(el);
      grid.append(el);
      if (active) render(el, values[r][c], r, c);
    }
  }
  const cellEl = (r, c) => cells[r * cols + c];

  // 押したときは押したマス。なぞっている間（ポインターをつかまえている間）は、指の下にあるマス
  const cellFrom = (e, { pointed = false } = {}) => {
    const under = () => (typeof document.elementFromPoint === 'function' && Number.isFinite(e.clientX) ? document.elementFromPoint(e.clientX, e.clientY) : null);
    const candidates = pointed ? [under(), e.target] : [e.target, under()];
    const el = candidates.map((x) => x?.closest?.('.trial-cell')).find((x) => x && grid.contains(x));
    if (!el) return null;
    const r = Number(el.dataset.r);
    const c = Number(el.dataset.c);
    return isActive(r, c) ? { r, c } : null;
  };

  function apply(r, c) {
    if (!stroke) return;
    const k = `${r},${c}`;
    if (stroke.visited.has(k)) return;
    stroke.visited.add(k);
    if (values[r][c] === stroke.target) return;
    if (!canApply(r, c, stroke.target, values)) return;
    values[r][c] = stroke.target;
    render(cellEl(r, c), values[r][c], r, c);
    onChange(values);
  }

  grid.addEventListener('pointerdown', (e) => {
    if (disabled) return;
    const cell = cellFrom(e);
    if (!cell) return;
    const target = resolve(values[cell.r][cell.c], cell.r, cell.c);
    if (target === undefined) return;
    e.preventDefault();
    stroke = { target, visited: new Set() };
    try {
      grid.setPointerCapture?.(e.pointerId);
    } catch {
      // 捕まえられなくても、なぞる操作は続ける
    }
    apply(cell.r, cell.c);
  });
  grid.addEventListener('pointermove', (e) => {
    if (!stroke || disabled) return;
    const cell = cellFrom(e, { pointed: true });
    if (cell) apply(cell.r, cell.c);
  });
  const end = () => {
    stroke = null;
  };
  grid.addEventListener('pointerup', end);
  grid.addEventListener('pointercancel', end);
  grid.addEventListener('lostpointercapture', end);

  return {
    el: grid,
    getValues: () => values.map((row) => [...row]),
    /** すべてのマスを value にする（全消去） */
    setAll(value) {
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (isActive(r, c)) values[r][c] = value;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (isActive(r, c)) render(cellEl(r, c), values[r][c], r, c);
      onChange(values);
    },
    /** 表示だけを変える（答え合わせの印など） */
    decorate(fn) {
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) fn(cellEl(r, c), r, c);
    },
    setDisabled(v) {
      disabled = v;
      stroke = null;
      grid.classList.toggle('trial-grid--disabled', v);
    },
  };
}

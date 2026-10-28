/**
 * トライアル⑤「展開図に矢印を引け！」の図（SVG）と、展開図に矢印をかく入力
 *
 * - 見取図：半透明の立方体（見えない辺は点線）に、赤・青の矢印。見えない面（うら側）の矢印と面のふちは点線で、
 *   見える面の矢印は実線でかく。見る向きは core/cubeConstants の DEFAULT_VIEW_DIRECTION（ほかの見取図と同じ）
 * - 展開図：マスと赤い矢印。マスの中をなぞると、なぞった向きにいちばん近い8方向の青い矢印になる（1本だけ。かき直せる）
 */
import { VERTICES, EDGES, FACES, DEFAULT_VIEW_DIRECTION } from '../../core/cubeConstants.js';
import { projectBoardPoint } from '../../core/trial/diceRollTrial.js';
import { ARROW_DIRECTIONS, isVisibleFace, snapArrowDirection } from '../../core/trial/netArrowTrial.js';
import { getNetBounds } from '../../core/cubeNet.js';

export const ARROW_COLORS = Object.freeze({ red: '#e53935', blue: '#1e6fe0', wrong: '#8a94a3' });

const SVG_NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) el.setAttribute(k, String(v));
  for (const c of children.flat()) if (c) el.append(c);
  return el;
}

const fmt = (list) => list.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

/**
 * 矢印の形（軸と三角の頭）。center：中心、d：向き（長さは自由）、half：中心から先までの長さ
 * @returns {{ tail, base, head: number[][] }} どれも 2D の点
 */
export function arrowShape2D([cx, cy], [dx, dy], half) {
  const len = Math.hypot(dx, dy);
  const [ux, uy] = [dx / len, dy / len];
  const tip = [cx + ux * half, cy + uy * half];
  const base = [tip[0] - ux * half * 0.7, tip[1] - uy * half * 0.7];
  const w = half * 0.5;
  return { tail: [cx - ux * half, cy - uy * half], base, head: [tip, [base[0] - uy * w, base[1] + ux * w], [base[0] + uy * w, base[1] - ux * w]] };
}

const arrowSvg2D = (shape, color, { width, dashed = false, opacity = 1, cls } = {}) =>
  svg(
    'g',
    { class: cls, opacity },
    svg('line', { x1: shape.tail[0], y1: shape.tail[1], x2: shape.base[0], y2: shape.base[1], stroke: color, 'stroke-width': width, 'stroke-linecap': 'round', 'stroke-dasharray': dashed ? `${width * 1.2} ${width}` : null }),
    svg('polygon', { points: fmt(shape.head), fill: dashed ? '#fff' : color, stroke: color, 'stroke-width': dashed ? width * 0.6 : 1, 'stroke-linejoin': 'round' }),
  );

// ---------------- 見取図 ----------------
const S = 70;
const P = (w) => projectBoardPoint(w, DEFAULT_VIEW_DIRECTION).map((v) => v * S);
const POS = Object.fromEntries(VERTICES.map((v) => [v.id, v.position]));
const FACE_BY_ID = Object.fromEntries(FACES.map((f) => [f.id, f]));
const add3 = (a, b) => a.map((v, i) => v + b[i]);
const scale3 = (a, s) => a.map((v) => v * s);
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** 面の上の矢印を、3D で形を作ってから見取図に写す */
function sketchArrow({ face, vector }, color) {
  const f = FACE_BY_ID[face];
  const visible = isVisibleFace(f.normal);
  const len = Math.hypot(...vector);
  const u = scale3(vector, 1 / len);
  const side = cross3(f.normal, u);
  const c = [...f.normal]; // 一辺 2 の立方体なので、面の中心 = 外向きの法線
  const half = 0.62;
  const tip = add3(c, scale3(u, half));
  const base = add3(tip, scale3(u, -half * 0.7));
  const w = half * 0.5;
  const shape = { tail: P(add3(c, scale3(u, -half))), base: P(base), head: [P(tip), P(add3(base, scale3(side, w))), P(add3(base, scale3(side, -w)))] };
  const outline = f.vertices.map((id) => P(POS[id]));
  return svg(
    'g',
    { class: `trial-sketch__arrow trial-sketch__arrow--${visible ? 'front' : 'back'}`, 'data-face': face },
    svg('polygon', { points: fmt(outline), fill: color, 'fill-opacity': visible ? 0.13 : 0.08, stroke: color, 'stroke-width': 2, 'stroke-dasharray': visible ? null : '6 4', 'stroke-opacity': 0.8 }),
    arrowSvg2D(shape, color, { width: 7, dashed: !visible, opacity: visible ? 1 : 0.85 }),
  );
}

/** 見取図（半透明の立方体と赤・青の矢印） */
export function renderNetArrowSketch(question) {
  const hiddenFaces = FACES.filter((f) => !isVisibleFace(f.normal)).map((f) => f.id);
  const visibleFaces = FACES.filter((f) => isVisibleFace(f.normal));
  const edgeOnVisible = (e) => visibleFaces.some((f) => e.vertices.every((v) => f.vertices.includes(v)));
  const arrows = [
    { ...question.red, color: ARROW_COLORS.red },
    { ...question.blue, color: ARROW_COLORS.blue },
  ];
  const back = arrows.filter((a) => hiddenFaces.includes(a.face));
  const front = arrows.filter((a) => !hiddenFaces.includes(a.face));
  const all = VERTICES.map((v) => P(v.position));
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const pad = 14;
  const viewBox = `${Math.min(...xs) - pad} ${Math.min(...ys) - pad} ${Math.max(...xs) - Math.min(...xs) + pad * 2} ${Math.max(...ys) - Math.min(...ys) + pad * 2}`;
  return svg(
    'svg',
    { viewBox, class: 'trial-sketch', role: 'img', 'aria-label': '赤と青の矢印をかいた立方体の見取図（うら側の面も見える）' },
    // うら側：見えない辺（点線）と、うら側の面の矢印
    EDGES.filter((e) => !edgeOnVisible(e)).map((e) => svg('line', { x1: P(POS[e.vertices[0]])[0], y1: P(POS[e.vertices[0]])[1], x2: P(POS[e.vertices[1]])[0], y2: P(POS[e.vertices[1]])[1], stroke: '#7d8ea8', 'stroke-width': 2, 'stroke-dasharray': '6 5' })),
    back.map((a) => sketchArrow(a, a.color)),
    // 見える面（半透明）と、見える面の矢印
    visibleFaces.map((f) => svg('polygon', { points: fmt(f.vertices.map((id) => P(POS[id]))), fill: '#e6f0fb', 'fill-opacity': 0.45, stroke: '#1f4e9c', 'stroke-width': 2.5, 'stroke-linejoin': 'round' })),
    front.map((a) => sketchArrow(a, a.color)),
  );
}

// ---------------- 展開図 ----------------
const C = 60;

/**
 * 展開図に矢印をかく入力
 * @param {{ question, onChange?: (value) => void }} options
 * @returns {{ el, getValue, setValue, clear, setDisabled, showAnswer }}
 */
export function createNetArrowInput(question, { onChange = () => {} } = {}) {
  const { cells, red } = question;
  const { width, height } = getNetBounds(cells);
  const cellById = new Map(cells.map((c) => [c.id, c]));
  const center = (cell) => [(cell.x + 0.5) * C, (cell.y + 0.5) * C];
  const arrowIn = (cellId, dir, color, options) => arrowSvg2D(arrowShape2D(center(cellById.get(cellId)), ARROW_DIRECTIONS[dir], C * 0.36), color, { width: 5, ...options });

  let value = null;
  let disabled = false;
  let stroke = null;
  const rects = new Map();
  const cellsLayer = svg(
    'g',
    {},
    cells.map((c) => {
      const r = svg('rect', { x: c.x * C, y: c.y * C, width: C, height: C, class: 'trial-arrow-net__cell', 'data-cell': c.id });
      rects.set(c.id, r);
      return r;
    }),
  );
  const answerLayer = svg('g', { 'pointer-events': 'none' });
  const blueLayer = svg('g', { 'pointer-events': 'none' });
  const el = svg(
    'svg',
    { viewBox: `-3 -3 ${width * C + 6} ${height * C + 6}`, class: 'trial-arrow-net', role: 'img', 'aria-label': '展開図。青い矢印をかく面の中をなぞる' },
    cellsLayer,
    svg('g', { 'pointer-events': 'none' }, arrowIn(red.cellId, red.dir, ARROW_COLORS.red)),
    answerLayer,
    blueLayer,
  );
  el.style.setProperty('--cols', String(width));
  el.style.setProperty('--rows', String(height));

  const render = (preview = null) => {
    const v = preview ?? value;
    blueLayer.replaceChildren(v ? arrowIn(v.cellId, v.dir, ARROW_COLORS.blue, { cls: 'trial-arrow-net__blue' }) : '');
    for (const [id, r] of rects) r.classList.toggle('trial-arrow-net__cell--on', Boolean(v && v.cellId === id));
  };

  // 押したマスで「どの面か」を決め、はなしたときになぞった向きで矢印にする（短すぎる動きは矢印にしない）
  const MIN_DRAG = 6;
  el.addEventListener('pointerdown', (e) => {
    if (disabled) return;
    const target = e.target?.closest?.('[data-cell]');
    if (!target) return;
    e.preventDefault();
    stroke = { cellId: target.dataset.cell, x: e.clientX, y: e.clientY };
    try {
      el.setPointerCapture?.(e.pointerId);
    } catch {
      // 捕まえられなくても、なぞる操作は続ける
    }
  });
  el.addEventListener('pointermove', (e) => {
    if (!stroke || disabled) return;
    const dir = snapArrowDirection(e.clientX - stroke.x, e.clientY - stroke.y, MIN_DRAG);
    if (dir) render({ cellId: stroke.cellId, dir });
  });
  const finish = (e) => {
    if (!stroke) return;
    const s = stroke;
    stroke = null;
    const dir = e.type === 'pointercancel' ? null : snapArrowDirection(e.clientX - s.x, e.clientY - s.y, MIN_DRAG);
    if (dir && !disabled) {
      value = { cellId: s.cellId, dir };
      onChange(value);
    }
    render();
  };
  el.addEventListener('pointerup', finish);
  el.addEventListener('pointercancel', finish);

  return {
    el,
    getValue: () => value,
    setValue(v) {
      value = v;
      render();
      onChange(value);
    },
    clear() {
      value = null;
      render();
      onChange(value);
    },
    setDisabled(v) {
      disabled = v;
      el.classList.toggle('trial-arrow-net--disabled', v);
    },
    /** 答え合わせ：正しい青い矢印をかく（まちがえたときは、入力した矢印を灰色の点線にして残す） */
    showAnswer({ isCorrect }) {
      const answer = question.answer;
      blueLayer.replaceChildren(value && !isCorrect ? arrowIn(value.cellId, value.dir, ARROW_COLORS.wrong, { dashed: true, cls: 'trial-arrow-net__wrong' }) : '');
      answerLayer.replaceChildren(arrowIn(answer.cellId, answer.dir, ARROW_COLORS.blue, { cls: 'trial-arrow-net__answer' }));
      for (const [id, r] of rects) {
        r.classList.toggle('trial-arrow-net__cell--on', false);
        r.classList.toggle('trial-arrow-net__cell--answer', id === answer.cellId);
      }
    },
  };
}

/** 選択画面のカードの小さな絵（十字の展開図に赤・青の矢印） */
export function renderNetArrowIcon() {
  const cells = [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2], [1, 3]];
  const s = 20;
  return svg(
    'svg',
    { viewBox: '-2 -2 64 84', class: 'trial-icon', role: 'img', 'aria-hidden': 'true' },
    cells.map(([x, y]) => svg('rect', { x: x * s, y: y * s, width: s, height: s, fill: '#fff', stroke: '#1f4e9c', 'stroke-width': 1.5 })),
    arrowSvg2D(arrowShape2D([1.5 * s, 1.5 * s], [1, -1], s * 0.36), ARROW_COLORS.red, { width: 2.5 }),
    arrowSvg2D(arrowShape2D([1.5 * s, 3.5 * s], [-1, 0], s * 0.36), ARROW_COLORS.blue, { width: 2.5 }),
  );
}

/**
 * 展開図の SVG 描画
 *
 * 問題の展開図・選択肢の展開図のどちらもここで描く。3D の展開図モデルと同じセルのデータから描く。
 *
 * visual = {
 *   type: 'net', cells,
 *   cellLabels?: { [cellId]: 'ア' }, cellFaces?: { [cellId]: 面の装飾 }（マーク・目）,
 *   cellColors?: { [cellId]: '#ffb366' }, marked?: [cellId]（動かすマスなど。オレンジの枠）,
 *   points?: [{ x, y, label, color? }], segments?: [{ a: [x,y], b: [x,y], color? }],
 *   candidates?: [{ x, y, label }]（マスを置く候補。点線）, conflicts?: [cellId]（回答後に赤で示す重なり）,
 * }
 */
import { h } from '../utils/dom.js';
import { cellCorners, pointKey, getNetBounds } from '../core/cubeNet.js';
import { PIP_LAYOUTS, pipRadius, pipColor } from '../core/cubeFaceLabels.js';
import { markShape, hasMarkShape } from './markShape.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const C = 36; // 1マスの大きさ
const PAD = 20; // 点のラベルのための余白

function svg(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) el.setAttribute(k, String(v));
  for (const c of children.flat()) if (c) el.append(c);
  return el;
}
const text = (x, y, value, attrs = {}) =>
  svg('text', { x, y, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-weight': 800, ...attrs }, document.createTextNode(value));

/** 面の装飾（目・マーク）をマスの中に描く */
function decorationIn(cx, cy, face) {
  if (face.kind === 'number' && PIP_LAYOUTS[face.value]) {
    return svg('g', {}, PIP_LAYOUTS[face.value].map(([x, y]) => svg('circle', { cx: cx + x * C, cy: cy + y * C, r: pipRadius(face.value) * C, fill: pipColor(face.value) })));
  }
  if (hasMarkShape(face)) return markShape(face.value, face.textColor ?? '#1b2a41', `translate(${cx} ${cy}) scale(${C})`);
  return text(cx, cy, face.label, { 'font-size': C * 0.55, fill: face.textColor ?? '#1b2a41' });
}

export function renderNetSvg(visual) {
  const { cells, cellLabels = {}, cellFaces = {}, cellColors = {}, marked = [], points = [], segments = [], candidates = [], conflicts = [] } = visual;
  const all = [...cells, ...candidates.map((c) => ({ id: `cand-${c.label}`, x: c.x, y: c.y }))];
  const { minX, minY, width, height } = getNetBounds(all);
  const X = (x) => (x - minX) * C;
  const Y = (y) => (y - minY) * C;

  const parts = [];
  for (const c of cells) {
    const fill = cellColors[c.id] ?? (marked.includes(c.id) ? '#ffd8b0' : '#e6f0fb');
    parts.push(
      svg('rect', {
        x: X(c.x),
        y: Y(c.y),
        width: C,
        height: C,
        fill,
        stroke: marked.includes(c.id) ? '#f06a00' : '#1f4e9c',
        'stroke-width': marked.includes(c.id) ? 3 : 2,
        'data-cell': c.id,
      }),
    );
    const cx = X(c.x) + C / 2;
    const cy = Y(c.y) + C / 2;
    if (cellFaces[c.id]) parts.push(decorationIn(cx, cy, cellFaces[c.id]));
    if (cellLabels[c.id]) parts.push(text(cx, cy, cellLabels[c.id], { 'font-size': C * 0.42, fill: '#1b2a41', 'data-cell-label': c.id }));
    if (conflicts.includes(c.id)) {
      parts.push(
        svg('rect', { x: X(c.x) + 3, y: Y(c.y) + 3, width: C - 6, height: C - 6, fill: 'rgba(229,57,53,0.25)', stroke: '#e53935', 'stroke-width': 3, class: 'net-conflict', 'data-conflict': c.id }),
      );
    }
  }
  // マスを置く候補（点線）
  for (const cand of candidates) {
    parts.push(
      svg('rect', { x: X(cand.x) + 2, y: Y(cand.y) + 2, width: C - 4, height: C - 4, fill: 'rgba(31,111,209,0.06)', stroke: '#1f6fd1', 'stroke-width': 2, 'stroke-dasharray': '5 4', 'data-candidate': cand.label }),
      text(X(cand.x) + C / 2, Y(cand.y) + C / 2, cand.label, { 'font-size': C * 0.4, fill: '#1f6fd1' }),
    );
  }
  // 強調する辺
  for (const s of segments) {
    parts.push(svg('line', { x1: X(s.a[0]), y1: Y(s.a[1]), x2: X(s.b[0]), y2: Y(s.b[1]), stroke: s.color ?? '#f06a00', 'stroke-width': 6, 'stroke-linecap': 'round', 'data-segment': `${pointKey(...s.a)}|${pointKey(...s.b)}` }));
  }
  // 点とラベル（ラベルは、その点に集まるマスと反対側へずらす）
  for (const p of points) {
    const around = cells.filter((c) => cellCorners(c).some(([x, y]) => x === p.x && y === p.y));
    const ax = around.reduce((s, c) => s + c.x + 0.5, 0) / Math.max(1, around.length);
    const ay = around.reduce((s, c) => s + c.y + 0.5, 0) / Math.max(1, around.length);
    let dx = p.x - ax;
    let dy = p.y - ay;
    const len = Math.hypot(dx, dy) || 1;
    [dx, dy] = [dx / len, dy / len];
    parts.push(
      svg('circle', { cx: X(p.x), cy: Y(p.y), r: p.color ? 5 : 3.5, fill: p.color ?? '#1b2a41', 'data-point': pointKey(p.x, p.y) }),
      text(X(p.x) + dx * 13, Y(p.y) + dy * 13, p.label, { 'font-size': 14, fill: p.color ?? '#1b2a41', 'data-point-label': p.label }),
    );
  }
  return svg(
    'svg',
    { viewBox: `${-PAD} ${-PAD} ${width * C + PAD * 2} ${height * C + PAD * 2}`, class: 'figure-svg net-figure', role: 'img', 'aria-hidden': 'true' },
    parts,
  );
}

export function renderNetVisual(visual) {
  if (visual.type !== 'net') return null;
  return h('figure', { class: 'figure figure--net' }, renderNetSvg(visual), visual.caption ? h('figcaption', {}, visual.caption) : null);
}

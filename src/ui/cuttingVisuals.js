/**
 * 切り口の形の図（SVG）
 *
 * 選択肢の図は、core/cubeCutting で計算した切り口（またはそれと相似でない形）を、正面から見た形で描く。
 * どの図も同じ大きさの枠に収めて描く（形だけをくらべる）。
 */
import { h } from '../utils/dom.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function svg(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) el.setAttribute(k, String(v));
  for (const c of children.flat()) if (c) el.append(c);
  return el;
}

/**
 * @param {{ points: number[][] }} visual 大きさ 1 にそろえた多角形（y は上向き）
 */
export function renderSectionSvg({ points }) {
  const S = 80;
  const pts = points.map(([x, y]) => [x * S, -y * S]);
  return svg(
    'svg',
    { viewBox: `${-S * 0.62} ${-S * 0.62} ${S * 1.24} ${S * 1.24}`, class: 'figure-svg section-figure', role: 'img', 'aria-hidden': 'true', 'data-sides': points.length },
    svg('polygon', {
      points: pts.map((p) => p.map((v) => v.toFixed(2)).join(',')).join(' '),
      fill: '#c8eed3',
      stroke: '#17803a',
      'stroke-width': 2.4,
      'stroke-linejoin': 'round',
    }),
    pts.map(([x, y]) => svg('circle', { cx: x.toFixed(2), cy: y.toFixed(2), r: 2.6, fill: '#17803a' })),
  );
}

/** 図（visual）を描く。切り口の図でなければ null */
export function renderSectionVisual(visual) {
  if (visual?.type !== 'section') return null;
  return h('figure', { class: 'figure figure--section' }, renderSectionSvg(visual), visual.caption ? h('figcaption', {}, visual.caption) : null);
}

/**
 * 小立方体に分けた立方体の見取図（SVG）
 *
 * 3D と同じ向き（core/blockGeometry の BLOCK_VIEW_DIRECTION）の正射影で、小立方体を遠い順に描く。
 * 外側の面のうち、色を塗った面だけを着色し、取り除いた小立方体のあとに見える面（切り口）は白いまま。
 * 取り除いた小立方体は、赤い点線の枠で示す（ほかの小立方体と同じ順で描くので、手前の小立方体にかくれる）。
 */
import { h } from '../utils/dom.js';
import { BLOCK_VIEW_DIRECTION } from '../core/blockGeometry.js';
import { createSubdividedCube, subcubeKey, removeSubcubes } from '../core/subdividedCube.js';
import { isPaintedSide } from '../core/cubePainting.js';
import { vecCross, vecDot } from '../core/cubeGeometry.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function svg(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) el.setAttribute(k, String(v));
  for (const c of children.flat()) if (c) el.append(c);
  return el;
}

const normalize = (v) => {
  const len = Math.hypot(...v);
  return v.map((x) => x / len);
};

/** 面の色（上・前・右で明るさを変える）。paint は色を塗った面 */
export const SUBCUBE_COLORS = Object.freeze({
  plain: { top: '#f5f8fc', front: '#dce5f0', right: '#c3cfdd' },
  paint: { top: '#f7a1a1', front: '#ec6f6f', right: '#d65252' },
});
const EDGE_COLOR = '#3f4f62';
const REMOVED_COLOR = '#e0262b';

/** 大きな立方体の一辺（SVG の座標）。分ける数によらず同じ大きさに描く */
const SIZE = 90;

/**
 * @param {{ divisions: number, paintedFaces?: string[], removed?: {x,y,z}[], showGrid?: boolean, viewDirection?: number[], showFront?: boolean }} visual
 *   showGrid: false なら切り分ける前の1つの立方体として描く（分ける数がわからない問題）
 */
export function renderSubcubesSvg({ divisions, paintedFaces = [], removed = [], showGrid = true, viewDirection = BLOCK_VIEW_DIRECTION, showFront = false }) {
  const n = showGrid ? divisions : 1;
  const removedList = showGrid ? removed : [];
  const v = normalize(viewDirection);
  const right = normalize(vecCross([0, 1, 0], v));
  const up = vecCross(v, right);
  const S = SIZE / n;
  const P = (w) => [S * vecDot(w, right), -S * vecDot(w, up)];
  const pts = (list) => list.map((w) => P(w).map((x) => x.toFixed(2)).join(',')).join(' ');

  const cubes = removeSubcubes(createSubdividedCube(n).cubes, removedList);
  const occupied = new Set(cubes.map(subcubeKey));
  const has = (x, y, z) => occupied.has(subcubeKey({ x, y, z }));
  const stroke = Math.max(0.8, 1.5 - n * 0.12);

  // 遠い順に描く（取り除いた小立方体の枠も同じ順で描き、手前の小立方体にかくれるようにする）
  const items = [...cubes.map((c) => ({ c, removed: false })), ...removedList.map((c) => ({ c, removed: true }))];
  items.sort((a, b) => vecDot([a.c.x, a.c.y, a.c.z], v) - vecDot([b.c.x, b.c.y, b.c.z], v) || a.c.y - b.c.y);

  const faces = items.map(({ c, removed: isRemoved }) => {
    const { x, y, z } = c;
    const g = svg('g', { 'data-subcube': subcubeKey(c), ...(isRemoved ? { 'data-removed': '' } : {}) });
    const corners = {
      top: [[x, y + 1, z], [x + 1, y + 1, z], [x + 1, y + 1, z + 1], [x, y + 1, z + 1]],
      front: [[x, y, z + 1], [x + 1, y, z + 1], [x + 1, y + 1, z + 1], [x, y + 1, z + 1]],
      right: [[x + 1, y, z], [x + 1, y, z + 1], [x + 1, y + 1, z + 1], [x + 1, y + 1, z]],
    };
    if (isRemoved) {
      for (const side of ['top', 'front', 'right']) {
        g.append(
          svg('polygon', {
            points: pts(corners[side]),
            fill: 'rgba(224, 38, 43, 0.10)',
            stroke: REMOVED_COLOR,
            'stroke-width': stroke * 1.2,
            'stroke-dasharray': '4 3',
            'stroke-linejoin': 'round',
          }),
        );
      }
      return g;
    }
    const visible = { top: !has(x, y + 1, z), front: !has(x, y, z + 1), right: !has(x + 1, y, z) };
    for (const side of ['top', 'front', 'right']) {
      if (!visible[side]) continue;
      const painted = isPaintedSide(c, n, side, paintedFaces);
      g.append(
        svg('polygon', {
          points: pts(corners[side]),
          fill: SUBCUBE_COLORS[painted ? 'paint' : 'plain'][side],
          stroke: EDGE_COLOR,
          'stroke-width': stroke,
          'stroke-linejoin': 'round',
          ...(painted ? { 'data-painted': side } : {}),
        }),
      );
    }
    return g;
  });

  const corners = [0, n].flatMap((x) => [0, n].flatMap((y) => [0, n].map((z) => P([x, y, z]))));
  let frontLabel = null;
  if (showFront) {
    const [fx, fy] = P([n / 2, 0, n]);
    frontLabel = svg(
      'text',
      { x: fx.toFixed(1), y: (fy + 14).toFixed(1), 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 13, 'font-weight': 800, fill: '#c2410c', 'data-front-label': '' },
      document.createTextNode('正面'),
    );
    corners.push([fx - 16, fy + 6], [fx + 16, fy + 22]);
  }
  const xs = corners.map((p) => p[0]);
  const ys = corners.map((p) => p[1]);
  const pad = 6;
  const viewBox = [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) - Math.min(...xs) + pad * 2, Math.max(...ys) - Math.min(...ys) + pad * 2];
  return svg('svg', { viewBox: viewBox.map((x) => x.toFixed(1)).join(' '), class: 'figure-svg subcube-figure', role: 'img', 'aria-hidden': 'true', 'data-divisions': n }, faces, frontLabel);
}

/** 図（visual）を描く。小立方体の図でなければ null */
export function renderSubcubesVisual(visual) {
  if (visual?.type !== 'subcubes') return null;
  return h('figure', { class: 'figure figure--subcubes' }, renderSubcubesSvg(visual), visual.caption ? h('figcaption', {}, visual.caption) : null);
}

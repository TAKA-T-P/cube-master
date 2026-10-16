/**
 * 積み木の図（見取図・投影図）の SVG 描画
 *
 * 見取図は 3D と同じ向き（core/blockGeometry の BLOCK_VIEW_DIRECTION）の正射影で、
 * 投影図は core/blockProjection の計算結果をそのまま描く。どちらも同じ配置データから作る。
 */
import { h } from '../utils/dom.js';
import { getBlockBounds, cubeKey, arrowPoints, BLOCK_VIEW_DIRECTION } from '../core/blockGeometry.js';
import { PROJECTION_NAMES } from '../core/blockProjection.js';
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

/** 面の色（上・前・右で明るさを変える） */
const FACE_STYLE = {
  top: { fill: '#f5f8fc' },
  front: { fill: '#dce5f0' },
  right: { fill: '#c3cfdd' },
};
const EDGE_COLOR = '#3f4f62';
export const ARROW_COLOR = '#e0262b';

/**
 * 積み木の見取図
 * @param {{ cubes: object[], viewDirection?: number[], arrows?: string[], showFront?: boolean }} visual
 *   arrows: 見る向き（矢印）、showFront: 床の手前の辺の下に「正面」と書く（矢印のない図で、正面の向きを示す）
 */
export function renderBlocksSvg({ cubes, viewDirection = BLOCK_VIEW_DIRECTION, arrows = [], showFront = false }) {
  const v = normalize(viewDirection);
  const right = normalize(vecCross([0, 1, 0], v));
  const up = vecCross(v, right);
  const S = 30;
  const P = (w) => [S * vecDot(w, right), -S * vecDot(w, up)];
  const pts = (list) => list.map((w) => P(w).map((n) => n.toFixed(2)).join(',')).join(' ');
  const { width: W, depth: D } = getBlockBounds(cubes);
  const occupied = new Set(cubes.map(cubeKey));
  const has = (x, y, z) => occupied.has(cubeKey({ x, y, z }));

  // 床のマス目（空いているマスもわかるように）
  const floor = [];
  for (let z = 0; z < D; z++) {
    for (let x = 0; x < W; x++) {
      floor.push(svg('polygon', { points: pts([[x, 0, z], [x + 1, 0, z], [x + 1, 0, z + 1], [x, 0, z + 1]]), fill: '#eef2f7', stroke: '#b8c4d2', 'stroke-width': 1 }));
    }
  }

  // 遠い順に描く（手前の立方体が奥を隠す）
  const sorted = [...cubes].sort((a, b) => vecDot([a.x, a.y, a.z], v) - vecDot([b.x, b.y, b.z], v) || a.y - b.y);
  const faces = [];
  for (const c of sorted) {
    const { x, y, z } = c;
    const g = svg('g', { 'data-cube': cubeKey(c) });
    const face = (name, corners) =>
      g.append(svg('polygon', { points: pts(corners), fill: FACE_STYLE[name].fill, stroke: EDGE_COLOR, 'stroke-width': 1.3, 'stroke-linejoin': 'round' }));
    if (!has(x, y + 1, z)) face('top', [[x, y + 1, z], [x + 1, y + 1, z], [x + 1, y + 1, z + 1], [x, y + 1, z + 1]]);
    if (!has(x, y, z + 1)) face('front', [[x, y, z + 1], [x + 1, y, z + 1], [x + 1, y + 1, z + 1], [x, y + 1, z + 1]]);
    if (!has(x + 1, y, z)) face('right', [[x + 1, y, z], [x + 1, y, z + 1], [x + 1, y + 1, z + 1], [x + 1, y + 1, z]]);
    faces.push(g);
  }

  // 観察の向きを示す赤い矢印（根元が見る人の側）
  const arrowParts = [];
  // 図の範囲は、すべての立方体の8つの角で決める（2つの角だけだと、奥の上の角がはみ出して切れる）
  const corners = (c) => [0, 1].flatMap((dx) => [0, 1].flatMap((dy) => [0, 1].map((dz) => [c.x + dx, c.y + dy, c.z + dz])));
  const all = [...cubes.flatMap(corners), [0, 0, 0], [W, 0, 0], [0, 0, D], [W, 0, D]];
  for (const arrow of arrows) {
    const { from, to } = arrowPoints(cubes, arrow);
    all.push(from, to);
    const [x1, y1] = P(from);
    const [x2, y2] = P(to);
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    const [ux, uy] = [(x2 - x1) / len, (y2 - y1) / len];
    const headLen = Math.min(14, len * 0.5);
    const [bx, by] = [x2 - ux * headLen, y2 - uy * headLen];
    const [nx, ny] = [-uy * 8, ux * 8];
    arrowParts.push(
      svg('g', { class: 'block-arrow', 'data-arrow': arrow },
        svg('line', { x1, y1, x2: bx, y2: by, stroke: ARROW_COLOR, 'stroke-width': 6, 'stroke-linecap': 'round' }),
        svg('polygon', { points: `${x2},${y2} ${bx + nx},${by + ny} ${bx - nx},${by - ny}`, fill: ARROW_COLOR }),
      ),
    );
  }
  const projected = all.map(P);
  // 「正面」の文字：床の手前の辺（z = 奥行き）の真ん中のすぐ下
  let frontLabel = null;
  if (showFront) {
    const [fx, fy] = P([W / 2, 0, D]);
    const [lx, ly] = [fx, fy + 16];
    frontLabel = svg(
      'text',
      { x: lx.toFixed(1), y: ly.toFixed(1), 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 15, 'font-weight': 800, fill: '#c2410c', 'data-front-label': '' },
      document.createTextNode('正面'),
    );
    projected.push([lx - 18, ly - 9], [lx + 18, ly + 9]);
  }
  const xs = projected.map((p) => p[0]);
  const ys = projected.map((p) => p[1]);
  const pad = 10;
  const viewBox = [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) - Math.min(...xs) + pad * 2, Math.max(...ys) - Math.min(...ys) + pad * 2];
  return svg('svg', { viewBox: viewBox.map((n) => n.toFixed(1)).join(' '), class: 'figure-svg block-figure', role: 'img', 'aria-hidden': 'true' }, floor, faces, arrowParts, frontLabel);
}

/**
 * 投影図（マス目の図）
 * @param {{ projection: { direction, width, height, cells } }} visual
 */
export function renderProjectionSvg({ projection }) {
  const { width, height, cells, direction } = projection;
  const C = 22;
  const parts = [];
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const filled = Boolean(cells[r][c]);
      parts.push(
        svg('rect', {
          x: c * C,
          y: r * C,
          width: C,
          height: C,
          fill: filled ? '#6f9fd8' : '#ffffff',
          stroke: filled ? '#1f4e9c' : '#cfd8e3',
          'stroke-width': filled ? 1.6 : 1,
          'data-filled': filled ? 1 : 0,
        }),
      );
    }
  }
  // 上面図は手前が下。向きがわかるように「前」を添える
  const extra =
    direction === 'top'
      ? svg('text', { x: (width * C) / 2, y: height * C + 14, 'text-anchor': 'middle', 'font-size': 11, fill: '#52627a', 'font-weight': 700 }, document.createTextNode('前'))
      : null;
  const extraH = direction === 'top' ? 16 : 0;
  return svg(
    'svg',
    { viewBox: `-3 -3 ${width * C + 6} ${height * C + 6 + extraH}`, class: 'figure-svg projection-figure', role: 'img', 'aria-hidden': 'true', 'data-direction': direction },
    parts,
    extra,
  );
}

/** 図の種類ごとの描画（visualChoices から呼ぶ） */
export function renderBlockVisual(visual) {
  switch (visual.type) {
    case 'blocks':
      return h('figure', { class: 'figure figure--blocks' }, renderBlocksSvg(visual), visual.caption ? h('figcaption', {}, visual.caption) : null);
    case 'projection':
      return h(
        'figure',
        { class: 'figure figure--projection' },
        renderProjectionSvg(visual),
        visual.caption ? h('figcaption', {}, visual.caption) : null,
      );
    case 'projectionPair':
      return h(
        'div',
        { class: 'projection-pair' },
        visual.items.map((item) =>
          h('figure', { class: 'figure figure--projection' }, renderProjectionSvg(item), h('figcaption', {}, item.caption ?? PROJECTION_NAMES[item.projection.direction])),
        ),
      );
    default:
      return null;
  }
}

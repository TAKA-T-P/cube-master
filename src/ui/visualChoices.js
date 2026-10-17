/**
 * 図（見取図・面・サイコロの目・回転の手順・見えていない面）の描画
 *
 * サイコロの面（kind: 'number'）は数字ではなく目（ドット）で描く。
 * 選択肢ごとに 3D シーンを作ると重いので、2D の SVG で描く。
 * 見取図は 3D 本体と同じ「向き・装飾・カメラの向き」のデータから、正射影で描くので 3D と食いちがわない。
 */
import { h } from '../utils/dom.js';
import { DIRECTIONS, DIRECTION_VECTORS, DIRECTION_LABELS, applyMatrix } from '../core/cubeRotations.js';
import { orientationToMatrix } from '../core/cubeOrientation.js';
import { FACE_UP, ARROW_LABELS, PIP_LAYOUTS, FACE_MARKS, pipRadius, pipColor } from '../core/cubeFaceLabels.js';
import { FACES } from '../core/cubeConstants.js';
import { vecCross, vecDot } from '../core/cubeGeometry.js';
import { renderBlockVisual } from './blockVisuals.js';
import { markShape } from './markShape.js';
import { renderNetVisual } from './netVisuals.js';
import { renderSubcubesVisual } from './paintedCubeVisuals.js';
import { renderSectionVisual } from './cuttingVisuals.js';
import { renderPathNetVisual } from './surfacePathVisuals.js';

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

/** 矢印の形（中心 0,0・大きさ 1 の正方形の中。上向き） */
const ARROW_PATH = 'M0,-0.32 L0.22,-0.06 L0.08,-0.06 L0.08,0.3 L-0.08,0.3 L-0.08,-0.06 L-0.22,-0.06 Z';
const ARROW_ROTATION = { up: 0, right: 90, down: 180, left: 270 };

/** サイコロの目で描く面か */
export const isPipFace = (face) => face?.kind === 'number' && Boolean(PIP_LAYOUTS[face.value]);

/**
 * 記号の面（〇◎×●◇◆）か。どれも 90° 回しても同じ形なので、面と一緒にゆがめて描けば
 * 面の上下の向きによらず 3D の面の印と同じ向きに見える
 */
const isMarkFace = (face) => face?.kind === 'symbol' && FACE_MARKS.includes(face.value);

/** サイコロの目（中心 0,0・一辺 1 の正方形の中）。turn は並びの回転（度） */
function pips(n, turn = 0) {
  return svg(
    'g',
    { class: 'pips', 'data-pips': n, transform: turn ? `rotate(${turn})` : undefined },
    PIP_LAYOUTS[n].map(([x, y]) => svg('circle', { cx: x, cy: y, r: pipRadius(n), fill: pipColor(n) })),
  );
}

/** 正方形の面（中心 0,0・一辺 1）の中身 */
function tileContent(face, { arrow, turn = 0, uprightLabel = false } = {}) {
  const parts = [
    svg('rect', { x: -0.5, y: -0.5, width: 1, height: 1, fill: face.color }),
    svg('rect', { x: -0.44, y: -0.44, width: 0.88, height: 0.88, fill: 'none', stroke: 'rgba(0,0,0,0.18)', 'stroke-width': 0.03 }),
  ];
  if (isPipFace(face)) {
    parts.push(pips(face.value, turn));
  } else if (isMarkFace(face)) {
    parts.push(markShape(face.value, face.textColor));
  } else if (arrow) {
    parts.push(svg('path', { d: ARROW_PATH, fill: face.textColor, transform: `rotate(${ARROW_ROTATION[arrow]})` }));
    parts.push(
      svg('text', { x: -0.4, y: -0.3, fill: face.textColor, 'font-size': 0.13, 'font-weight': 700 }, document.createTextNode(face.label)),
    );
  } else if (!uprightLabel) {
    parts.push(labelText(face, 0, 0, 1));
  }
  return parts;
}

function labelText(face, x, y, scale) {
  const label = String(face.label);
  const size = (label.length <= 1 ? 0.5 : label.length <= 2 ? 0.36 : 0.22) * scale;
  return svg(
    'text',
    {
      x,
      y,
      fill: face.textColor,
      'font-size': size,
      'font-weight': 800,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
    },
    document.createTextNode(label),
  );
}

/**
 * 立方体の見取図（3面が見える斜めの図）
 * @param {{ orientation: object, faces: Record<string, object>, viewDirection: number[] }} visual
 */
export function renderCubeSvg({ orientation, faces, viewDirection, showDirections = false }) {
  const v = normalize(viewDirection);
  const right = normalize(vecCross([0, 1, 0], v));
  const up = vecCross(v, right);
  const S = 40;
  const P = (w) => [S * vecDot(w, right), -S * vecDot(w, up)];
  const m = orientationToMatrix(orientation);

  // 見えている面（カメラ側を向いている面）
  const visible = DIRECTIONS.filter((d) => vecDot(DIRECTION_VECTORS[d], v) > 1e-9);
  const corners = [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => P([x, y, z]))));
  // 向きの文字（上・前・右）は立方体の輪郭の外に置く。
  // 横の面（前・右など）は、その面の下の辺の真ん中のすぐ下。上・下の面は、図の中心から面の中心へ向かう方向
  const outline = Math.max(...corners.map(([x, y]) => Math.hypot(x, y))) + 11;
  const labelAt = (d) => {
    const n = DIRECTION_VECTORS[d];
    if (n[1] === 0) {
      const [x, y] = P([n[0], -1, n[2]]);
      return [x, y + 12];
    }
    const [x, y] = P(n);
    const len = Math.hypot(x, y) || 1;
    return [(x / len) * outline, (y / len) * outline];
  };
  if (showDirections) for (const d of visible) corners.push(labelAt(d));
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  const pad = showDirections ? 10 : 6;
  const viewBox = [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) - Math.min(...xs) + pad * 2, Math.max(...ys) - Math.min(...ys) + pad * 2];

  const groups = visible.map((d) => {
    const faceId = orientation[d];
    const face = faces[faceId];
    const n0 = FACES.find((f) => f.id === faceId).normal;
    const upW = applyMatrix(m, FACE_UP[faceId]);
    const rightW = applyMatrix(m, vecCross(FACE_UP[faceId], n0));
    const center = P(DIRECTION_VECTORS[d]);
    const [a, b] = P(rightW).map((x) => x * 2);
    const [c, dd] = P(upW).map((x) => -x * 2);
    const shade = 0.22 * (1 - vecDot(DIRECTION_VECTORS[d], v));
    const tile = svg(
      'g',
      { transform: `matrix(${a} ${b} ${c} ${dd} ${center[0]} ${center[1]})` },
      // 目・矢印・記号は面と一緒にゆがめて描く（3D と同じ向きに見える）
      tileContent(face, { arrow: face.arrow, uprightLabel: !face.arrow && !isPipFace(face) && !isMarkFace(face) }),
      svg('rect', { x: -0.5, y: -0.5, width: 1, height: 1, fill: '#0b1d3a', opacity: shade.toFixed(3) }),
      svg('rect', { x: -0.5, y: -0.5, width: 1, height: 1, fill: 'none', stroke: '#1f4e9c', 'stroke-width': 0.035 }),
    );
    // 文字（「？」など）は読みやすいように、ゆがめずに面の中央へ
    const label = face.arrow || isPipFace(face) || isMarkFace(face) ? null : labelText(face, center[0], center[1], S * 0.9);
    return svg('g', { 'data-direction': d, 'data-face': faceId }, tile, label);
  });

  // 見えている面がどの向きかを、面の外側に書く（どこが「前」かわかるように）
  const directionLabels = showDirections
    ? visible.map((d) => {
        const [x, y] = labelAt(d);
        return svg(
          'text',
          { x, y, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 13, 'font-weight': 800, fill: '#c2410c', 'data-direction-label': d },
          document.createTextNode(DIRECTION_LABELS[d]),
        );
      })
    : [];
  return svg('svg', { viewBox: viewBox.join(' '), class: 'figure-svg', role: 'img', 'aria-hidden': 'true' }, groups, directionLabels);
}

/** 正面から見た1つの面（矢印の向き・目の並びの回転は画面の向き） */
export function renderFaceSvg({ face, arrow, turn = 0 }, className = 'figure-svg') {
  return svg(
    'svg',
    { viewBox: '-0.56 -0.56 1.12 1.12', class: className, role: 'img', 'aria-hidden': 'true' },
    tileContent(face, { arrow, turn }),
    svg('rect', { x: -0.5, y: -0.5, width: 1, height: 1, fill: 'none', stroke: '#1f4e9c', 'stroke-width': 0.035 }),
  );
}

/** 図を描く（種類ごと） */
export function renderVisual(visual) {
  // 積み木の見取図・投影図
  const block = renderBlockVisual(visual);
  if (block) return block;
  // 展開図
  const net = renderNetVisual(visual);
  if (net) return net;
  // 小立方体に分けた立方体
  const subcubes = renderSubcubesVisual(visual);
  if (subcubes) return subcubes;
  // 切り口の形・一部の面の展開図と道
  const section = renderSectionVisual(visual);
  if (section) return section;
  const pathNet = renderPathNetVisual(visual);
  if (pathNet) return pathNet;
  switch (visual.type) {
    case 'cube':
      return h(
        'figure',
        { class: 'figure figure--cube' },
        renderCubeSvg(visual),
        visual.caption ? h('figcaption', {}, visual.caption) : null,
      );
    case 'face':
      return h('figure', { class: 'figure figure--face' }, renderFaceSvg(visual));
    case 'swatch':
      return h('span', { class: 'swatch', style: { background: visual.face.color }, 'aria-hidden': 'true' });
    case 'pip':
      return renderFaceSvg({ face: visual.face }, 'pip-icon');
    case 'moves':
      return h(
        'ol',
        { class: 'moves', 'aria-label': '回転の手順' },
        visual.moves.map((m, i) =>
          h(
            'li',
            { class: 'moves__item' },
            h('span', { class: 'moves__step' }, String(i + 1)),
            h('span', { class: 'moves__icon', 'aria-hidden': 'true' }, m.icon),
            h('span', { class: 'moves__label' }, m.label),
          ),
        ),
      );
    case 'faceList':
      return h(
        'div',
        { class: 'face-list' },
        h('span', { class: 'face-list__title' }, visual.title),
        visual.items.map((item) =>
          h(
            'span',
            { class: 'face-list__item' },
            `${item.label}：`,
            item.face.kind === 'color'
              ? [h('span', { class: 'swatch', style: { background: item.face.color }, 'aria-hidden': 'true' }), item.face.label]
              : [
                  renderFaceSvg({ face: item.face }, 'pip-icon pip-icon--small'),
                  h('span', { class: 'sr-only' }, isPipFace(item.face) ? `${item.face.value}の目` : item.face.label),
                ],
          ),
        ),
      );
    default:
      return h('span', {}, '');
  }
}

/** 選択肢ボタンの中身（記号・図・文字） */
export function renderChoiceContent(choice) {
  const visual = choice.visual;
  if (!visual) return [h('span', { class: 'choice__label' }, choice.label)];
  if (visual.type === 'swatch') return [renderVisual(visual), h('span', { class: 'choice__label' }, choice.label)];
  // サイコロの目の選択肢：目の絵だけを見せ、文字（「3の目」）は読み上げ用
  if (visual.type === 'pip') return [renderVisual(visual), h('span', { class: 'choice__label sr-only' }, choice.label)];
  return [
    h('span', { class: 'choice__label choice__label--mark' }, choice.label),
    renderVisual(visual),
    choice.description ? h('span', { class: 'sr-only' }, choice.description) : null,
  ];
}

export { ARROW_LABELS };

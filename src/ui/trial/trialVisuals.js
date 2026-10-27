/**
 * トライアルの図（SVG）
 *
 * - サイコロの道：マス目（点線）・道の線・到着のマス（赤）と、出発のマスに立てたサイコロ（ui/visualChoices の見取図と同じ向き・同じ縮尺）
 * - 選択画面のカードの小さな絵
 */
import { renderCubeSvg } from '../visualChoices.js';
import { renderBlocksSvg } from '../blockVisuals.js';
import { numberFaces } from '../../core/cubeFaceLabels.js';
import { INITIAL_ORIENTATION } from '../../core/cubeOrientation.js';
import { DEFAULT_VIEW_DIRECTION } from '../../core/cubeConstants.js';
import { projectBoardPoint, cellCenter } from '../../core/trial/diceRollTrial.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) el.setAttribute(k, String(v));
  for (const c of children.flat()) if (c) el.append(c);
  return el;
}

/** renderCubeSvg と同じ縮尺（世界座標 1 = 40） */
const S = 40;
const P = (w) => projectBoardPoint(w, DEFAULT_VIEW_DIRECTION).map((v) => v * S);
const pts = (list) => list.map((w) => P(w).map((n) => n.toFixed(1)).join(',')).join(' ');

/**
 * サイコロの道の図
 * @returns {{ el: SVGElement, setMarker: (index: number|null) => void }} setMarker：答え合わせで、今いるマスを示す
 */
export function renderDiceBoard(question) {
  const { cells, faces, pose } = question;
  const last = cells.length - 1;
  const cellPoly = ([i, k], attrs) => {
    const [x, , z] = cellCenter([i, k]);
    return svg('polygon', { points: pts([[x - 1, -1, z - 1], [x + 1, -1, z - 1], [x + 1, -1, z + 1], [x - 1, -1, z + 1]]), ...attrs });
  };
  const board = cells.map((c, idx) =>
    cellPoly(c, {
      fill: idx === last ? '#f6c9cc' : '#ffffff',
      stroke: '#1b2a41',
      'stroke-width': 2,
      'stroke-dasharray': '7 5',
      'stroke-linejoin': 'round',
      'data-cell': idx,
    }),
  );
  // 道の線（マスの中心を結ぶ）と、向きを示す小さな矢印
  const centers = cells.map((c) => P(cellCenter(c)));
  const route = svg('polyline', { points: centers.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' '), fill: 'none', stroke: '#8aa2bf', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'data-route': '' });
  const arrows = centers.slice(1).map((to, i) => {
    const from = centers[i];
    const mx = (from[0] + to[0]) / 2;
    const my = (from[1] + to[1]) / 2;
    const ang = (Math.atan2(to[1] - from[1], to[0] - from[0]) * 180) / Math.PI;
    return svg('path', { d: 'M -6 -5 L 5 0 L -6 5 Z', fill: '#8aa2bf', transform: `translate(${mx.toFixed(1)},${my.toFixed(1)}) rotate(${ang.toFixed(1)})` });
  });
  const marker = svg('polygon', { points: '', fill: 'none', stroke: '#22b14c', 'stroke-width': 4, 'stroke-linejoin': 'round', visibility: 'hidden', 'data-marker': '' });

  // サイコロ（出発のマスに立てる）
  const dice = renderCubeSvg({ orientation: pose ?? INITIAL_ORIENTATION, faces: numberFaces(faces), viewDirection: [...DEFAULT_VIEW_DIRECTION] });
  const [dx, dy] = P([cellCenter(cells[0])[0], 0, cellCenter(cells[0])[2]]);
  const diceGroup = svg('g', { transform: `translate(${dx.toFixed(1)},${dy.toFixed(1)})`, 'data-dice': '' }, ...[...dice.childNodes]);

  // 図の範囲
  const corners = cells.flatMap((c) => {
    const [x, , z] = cellCenter(c);
    return [[x - 1, -1, z - 1], [x + 1, -1, z - 1], [x + 1, -1, z + 1], [x - 1, -1, z + 1]].map(P);
  });
  const [sx, , sz] = cellCenter(cells[0]);
  corners.push(...[-1, 1].flatMap((a) => [-1, 1].flatMap((b) => [-1, 1].map((c) => P([sx + a, b, sz + c])))));
  const xs = corners.map((p) => p[0]);
  const ys = corners.map((p) => p[1]);
  const pad = 8;
  const viewBox = [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) - Math.min(...xs) + 2 * pad, Math.max(...ys) - Math.min(...ys) + 2 * pad].map((n) => n.toFixed(1)).join(' ');
  const el = svg('svg', { viewBox, class: 'trial-board', role: 'img', 'aria-label': `サイコロを${cells.length - 1}回転がす道` }, board, route, arrows, marker, diceGroup);

  return {
    el,
    setMarker(index) {
      if (index === null || index === undefined) {
        marker.setAttribute('visibility', 'hidden');
        return;
      }
      const [x, , z] = cellCenter(cells[Math.min(index, last)]);
      marker.setAttribute('points', pts([[x - 1, -1, z - 1], [x + 1, -1, z - 1], [x + 1, -1, z + 1], [x - 1, -1, z + 1]]));
      marker.setAttribute('visibility', 'visible');
      // サイコロは出発のマスに描いたままなので、動き出したら隠す（答え合わせは 3D で見る）
      diceGroup.setAttribute('visibility', index > 0 ? 'hidden' : 'visible');
    },
  };
}

/** 選択画面のカードの小さな絵 */
export function renderTrialIcon(modeId) {
  switch (modeId) {
    case 'blockCount':
      return renderBlocksSvg({ cubes: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 1 }, { x: 0, y: 1, z: 1 }, { x: 0, y: 2, z: 0 }] });
    case 'projectionDraw': {
      const cells = [[0, 0, 1], [0, 1, 1], [1, 1, 1], [0, 2, 1], [1, 2, 1], [2, 2, 1]];
      return svg(
        'svg',
        { viewBox: '-2 -2 64 64', class: 'trial-icon', role: 'img', 'aria-hidden': 'true' },
        ...[0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => svg('rect', { x: c * 20, y: r * 20, width: 20, height: 20, fill: cells.some(([cc, rr]) => cc === c && rr === r) ? '#4f8fe0' : '#fff', stroke: '#1f4e9c', 'stroke-width': 1.5 }))),
      );
    }
    case 'diceRoll':
      return renderCubeSvg({ orientation: INITIAL_ORIENTATION, faces: numberFaces({ ABCD: 5, EFGH: 2, ABFE: 4, CDHG: 3, BCGF: 6, DAEH: 1 }), viewDirection: [...DEFAULT_VIEW_DIRECTION] });
    case 'netPartition': {
      const colors = ['#ff4d4d', '#ffc000', '#4fb3ff'];
      const layout = [
        [0, 1, 0], [1, 1, 0], [2, 1, 0], [1, 0, 0], [1, 2, 0], [1, 3, 0],
        [3, 1, 1], [3, 0, 1], [2, 2, 1], [3, 2, 1], [4, 2, 1], [3, 3, 1],
      ];
      return svg(
        'svg',
        { viewBox: '-2 -2 104 84', class: 'trial-icon', role: 'img', 'aria-hidden': 'true' },
        ...layout.map(([x, y, c]) => svg('rect', { x: x * 20, y: y * 20, width: 20, height: 20, fill: colors[c], stroke: '#1b2a41', 'stroke-width': 1.2 })),
      );
    }
    default:
      return null;
  }
}

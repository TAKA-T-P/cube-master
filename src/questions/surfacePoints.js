/**
 * 立方体の表面の点（頂点・辺の中点・面の対角線の交点）と、その呼び方（切断・最短経路で共通）
 *
 * 座標は cubeConstants（中心が原点・一辺 2）なので、どの点も整数の座標になる。
 */
import { VERTICES, EDGES, FACES } from '../core/cubeConstants.js';

const VERTEX_POS = new Map(VERTICES.map((v) => [v.id, v.position]));
const avg = (ids) => [0, 1, 2].map((i) => ids.reduce((s, id) => s + VERTEX_POS.get(id)[i], 0) / ids.length + 0);

/** 頂点 */
export const VERTEX_POINTS = Object.freeze(VERTICES.map((v) => Object.freeze({ kind: 'vertex', id: v.id, position: [...v.position] })));
/** 辺の中点 */
export const MIDPOINTS = Object.freeze(EDGES.map((e) => Object.freeze({ kind: 'midpoint', id: e.id, position: avg(e.vertices) })));
/** 面の対角線の交点（面の中心） */
export const FACE_CENTERS = Object.freeze(FACES.map((f) => Object.freeze({ kind: 'faceCenter', id: f.id, position: avg(f.vertices) })));

export const pointKey = (pt) => `${pt.kind}:${pt.id}`;

/** 座標から表面の点を探す（頂点・辺の中点・面の中心のどれでもなければ null） */
export function findSurfacePoint(position) {
  const same = (p) => p.position.every((x, i) => x === position[i]);
  return [...VERTEX_POINTS, ...MIDPOINTS, ...FACE_CENTERS].find(same) ?? null;
}

/**
 * 点の呼び方
 * @param {{ kind: string, id: string }} pt
 * @param {string|null} label 頂点以外の点につける文字（P・Q・R）
 * @returns {{ text: string, name: string }} text：問題文での説明（「辺ABの中点P」）、name：短い名前（「P」「頂点B」）
 */
export function describePoint(pt, label) {
  if (pt.kind === 'vertex') return { text: `頂点${pt.id}`, name: `頂点${pt.id}`, short: pt.id };
  if (pt.kind === 'midpoint') return { text: `辺${pt.id}の中点${label}`, name: label, short: label };
  return { text: `面${pt.id}の対角線の交点${label}`, name: label, short: label };
}

/** 頂点以外の点に、順に P・Q・R… をつける */
export function labelPoints(points, letters = ['P', 'Q', 'R', 'S']) {
  let i = 0;
  return points.map((pt) => {
    const label = pt.kind === 'vertex' ? null : letters[i++];
    return { ...pt, label, ...describePoint(pt, label) };
  });
}

/** 「頂点B・頂点D・辺AEの中点P」 */
export const joinPointTexts = (points) => points.map((p) => p.text).join('・');

/**
 * 点がよく見えるカメラの向き。点がのっている面がなるべく正面を向く向きを、8つのななめの向きから選ぶ
 * （同じくらいなら上から見下ろす向き。いつもの向き [4,3,5] なら 'default'）
 * @param {number[][]} positions
 */
export function viewDirectionForPoints(positions) {
  const dirs = [
    [4, 3, 5],
    [-4, 3, 5],
    [4, 3, -5],
    [-4, 3, -5],
    [4, -3, 5],
    [-4, -3, 5],
    [4, -3, -5],
    [-4, -3, -5],
  ];
  const normals = (p) => FACES.filter((f) => f.normal.every((n, i) => n === 0 || p[i] === n)).map((f) => f.normal);
  const score = (d) => {
    const len = Math.hypot(...d);
    return Math.min(...positions.map((p) => Math.max(...normals(p).map((n) => (n[0] * d[0] + n[1] * d[1] + n[2] * d[2]) / len))));
  };
  let best = dirs[0];
  for (const d of dirs) if (score(d) > score(best) + 1e-9) best = d;
  return best === dirs[0] ? 'default' : [...best];
}

/** 立方体の回転（24通り）。どれも座標の入れかえと符号の変更で、行列式が 1 */
export const CUBE_ROTATIONS = Object.freeze(
  (() => {
    const perms = [
      [0, 1, 2],
      [0, 2, 1],
      [1, 0, 2],
      [1, 2, 0],
      [2, 0, 1],
      [2, 1, 0],
    ];
    const list = [];
    for (const p of perms) {
      for (let s = 0; s < 8; s++) {
        const signs = [s & 1 ? -1 : 1, s & 2 ? -1 : 1, s & 4 ? -1 : 1];
        const m = [0, 1, 2].map((r) => [0, 1, 2].map((c) => (p[r] === c ? signs[r] : 0)));
        const det =
          m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
        if (det === 1) list.push(Object.freeze(m.map((row) => Object.freeze(row))));
      }
    }
    return list;
  })(),
);

/** 回転を点にかける */
export const rotatePoint = (m, p) => m.map((row) => row[0] * p[0] + row[1] * p[1] + row[2] * p[2] + 0);

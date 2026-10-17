/**
 * 立方体の中の長さ・角度・三角形（Three.js・DOM 非依存）
 *
 * 長さは √ をふくむ正確な数（core/surd）、角度は内積から cos² と符号を正確に求めて、
 * 30°・45°・60°・90°・120°・135°・150° などの角だけを「何度」と答える（近い小数で決めない）。
 * 座標は cubeConstants（中心が原点・一辺 2）。
 */
import { VERTICES } from './cubeConstants.js';
import { Q, qvec, vSub, vDot, vCross, vLength2, vIsZero } from './rational.js';
import { Surd } from './surd.js';

const VERTEX_POSITIONS = new Map(VERTICES.map((v) => [v.id, qvec(v.position)]));

/** 2点の距離（√ をふくむ正確な数） */
export const distance3D = (a, b) => Surd.sqrt(vLength2(vSub(qvec(b), qvec(a))));

/** 面の対角線の長さ（一辺 side）＝ side × √2 */
export const faceDiagonalLength = (side) => new Surd(Q.of(side), 2);
/** 立方体の対角線（空間対角線）の長さ＝ side × √3 */
export const spaceDiagonalLength = (side) => new Surd(Q.of(side), 3);

/** cos² と cos の符号がわかっている、きりのよい角度（度） */
const NICE_ANGLES = [
  { deg: 0, cos2: [1, 1], sign: 1 },
  { deg: 30, cos2: [3, 4], sign: 1 },
  { deg: 45, cos2: [1, 2], sign: 1 },
  { deg: 60, cos2: [1, 4], sign: 1 },
  { deg: 90, cos2: [0, 1], sign: 0 },
  { deg: 120, cos2: [1, 4], sign: -1 },
  { deg: 135, cos2: [1, 2], sign: -1 },
  { deg: 150, cos2: [3, 4], sign: -1 },
  { deg: 180, cos2: [1, 1], sign: -1 },
];

/**
 * 2つのベクトルのなす角（0°〜180°）。きりのよい角度なら度、そうでなければ null（小数の近い値で決めない）
 * @returns {{ degrees: number|null, cos2: Q, sign: number, approx: number }}
 */
export function angleBetweenVectors(u, v) {
  const U = qvec(u);
  const V = qvec(v);
  if (vIsZero(U) || vIsZero(V)) throw new Error('長さ 0 のベクトルです');
  const dot = vDot(U, V);
  const cos2 = dot.mul(dot).div(vLength2(U).mul(vLength2(V)));
  const sign = dot.sign();
  const nice = NICE_ANGLES.find((a) => a.sign === sign && cos2.eq(new Q(a.cos2[0], a.cos2[1])));
  const approx = (Math.acos(Math.max(-1, Math.min(1, dot.toNumber() / Math.sqrt(vLength2(U).toNumber() * vLength2(V).toNumber())))) * 180) / Math.PI;
  return { degrees: nice ? nice.deg : null, cos2, sign, approx };
}

/** 角 ∠QPR（頂点 P）の大きさ */
export const angleAt = (p, q, r) => angleBetweenVectors(vSub(qvec(q), qvec(p)), vSub(qvec(r), qvec(p)));

/** 三角形の3辺の長さ（a = BC・b = CA・c = AB の順。どれも √ をふくむ正確な数） */
export const triangleSideLengths = (a, b, c) => [distance3D(b, c), distance3D(c, a), distance3D(a, b)];

/** 三角形の面積 |(B−A)×(C−A)| / 2 */
export function triangleArea3D(a, b, c) {
  const A = qvec(a);
  const n = vCross(vSub(qvec(b), A), vSub(qvec(c), A));
  return Surd.sqrt(vLength2(n).div(4));
}

/** 名前の、より広い名前（選択肢でまぎらわしくならないように使う） */
export const TRIANGLE_SUPERSETS = Object.freeze({
  正三角形: ['二等辺三角形'],
  直角二等辺三角形: ['直角三角形', '二等辺三角形'],
  直角三角形: [],
  二等辺三角形: [],
  三角形: [],
});

/**
 * 三角形の形（正三角形・直角二等辺三角形・直角三角形・二等辺三角形・三角形）。3点が一直線上なら null
 * @returns {{ name, rightAt: 0|1|2|null, equalPair: [number, number]|null, sides2: Q[] }}
 *   rightAt：直角の頂点（0 = 1つ目の点）、sides2：各頂点の向かいの辺の長さの2乗
 */
export function classifyTriangle(a, b, c) {
  const P = [a, b, c].map((p) => qvec(p));
  if (vIsZero(vCross(vSub(P[1], P[0]), vSub(P[2], P[0])))) return null;
  const sides2 = [vLength2(vSub(P[2], P[1])), vLength2(vSub(P[0], P[2])), vLength2(vSub(P[1], P[0]))];
  const dotAt = (i) => vDot(vSub(P[(i + 1) % 3], P[i]), vSub(P[(i + 2) % 3], P[i]));
  const rightAt = [0, 1, 2].find((i) => dotAt(i).isZero()) ?? null;
  const pairs = [
    [0, 1],
    [1, 2],
    [0, 2],
  ].filter(([i, j]) => sides2[i].eq(sides2[j]));
  const equilateral = sides2[0].eq(sides2[1]) && sides2[1].eq(sides2[2]);
  let name;
  if (equilateral) name = '正三角形';
  else if (rightAt !== null) name = pairs.length ? '直角二等辺三角形' : '直角三角形';
  else name = pairs.length ? '二等辺三角形' : '三角形';
  return { name, rightAt, equalPair: pairs[0] ?? null, sides2, obtuse: [0, 1, 2].some((i) => dotAt(i).sign() < 0) };
}

/** 立方体の2つの頂点を結ぶ線分の種類（辺・面の対角線・立方体の対角線） */
export function classifyVertexSegment(u, v) {
  const l2 = vLength2(vSub(VERTEX_POSITIONS.get(u), VERTEX_POSITIONS.get(v))).toNumber();
  return l2 === 4 ? 'edge' : l2 === 8 ? 'faceDiagonal' : l2 === 12 ? 'spaceDiagonal' : null;
}

/** 立方体の頂点の2つの組すべて（28本）と種類 */
export function allVertexSegments() {
  const ids = VERTICES.map((v) => v.id);
  const list = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) list.push({ id: ids[i] + ids[j], ends: [ids[i], ids[j]], kind: classifyVertexSegment(ids[i], ids[j]) });
  return list;
}

export const vertexPosition = (id) => VERTEX_POSITIONS.get(id);

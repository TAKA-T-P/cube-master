/**
 * 小立方体の着色（Three.js・DOM 非依存）
 *
 * 「着色」は、切り分ける前の大きな立方体の外側の面に塗った色のこと。
 * 切り分けたときに新しく現れた面（切り口）には色がつかない。
 * どの問題も、小立方体を1個ずつ調べて着色面の数を数える（公式は確かめと解説に使う）。
 * こうすることで、外側の一部の面だけを塗った問題や、小立方体を取り除いた問題にもそのまま使える。
 */
import { CUBE_SIDES, getExteriorFaces, createSubdividedCube, subcubeKey } from './subdividedCube.js';

/** すべての面を塗る */
export const ALL_SIDES = CUBE_SIDES;

/**
 * 着色の条件
 * @typedef {{ divisions: number, paintedFaces?: string[], cubes?: {x,y,z}[] }} PaintSpec
 *   paintedFaces：塗った外側の面（省略で6面すべて）、cubes：数える小立方体（省略で n³ 個すべて）
 */

/** 小立方体の色がついた面（塗った外側の面のうち、その小立方体が接している面） */
export function getPaintedFaces(c, n, paintedFaces = ALL_SIDES) {
  return getExteriorFaces(c, n).filter((side) => paintedFaces.includes(side));
}

export const countPaintedFaces = (c, n, paintedFaces = ALL_SIDES) => getPaintedFaces(c, n, paintedFaces).length;

const cubesOf = (spec) => spec.cubes ?? createSubdividedCube(spec.divisions).cubes;

/** 着色面がちょうど count 面の小立方体 */
export function getCubesByPaintCount(spec, count) {
  const { divisions: n, paintedFaces = ALL_SIDES } = spec;
  return cubesOf(spec).filter((c) => countPaintedFaces(c, n, paintedFaces) === count);
}

/** 着色面の数ごとの個数 { 0: …, 1: …, 2: …, 3: … }（合計は小立方体の数） */
export function getCubeCountByPaintCount(spec) {
  const { divisions: n, paintedFaces = ALL_SIDES } = spec;
  const counts = { 0: 0, 1: 0, 2: 0, 3: 0 };
  for (const c of cubesOf(spec)) {
    const k = countPaintedFaces(c, n, paintedFaces);
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
}

/** 着色面の数が counts のどれかに入る小立方体（「0面または1面」など） */
export function getCubesByPaintCounts(spec, counts) {
  const { divisions: n, paintedFaces = ALL_SIDES } = spec;
  return cubesOf(spec).filter((c) => counts.includes(countPaintedFaces(c, n, paintedFaces)));
}

/**
 * 6面すべてを塗ったときの公式（n ≧ 2）。確かめ・解説・逆算に使う
 *   3面：8、2面：12(n-2)、1面：6(n-2)²、0面：(n-2)³（n = 2 のときは 8 個すべてが 3面）
 */
export function paintFormula(n) {
  if (n < 2) return { 0: 0, 1: 0, 2: 0, 3: 0 };
  const m = n - 2;
  return { 3: 8, 2: 12 * m, 1: 6 * m * m, 0: m * m * m };
}

/** 外側の面に色がついているか（見取図・3D の色分け用）。切り口（内側の面）は false */
export const isPaintedSide = (c, n, side, paintedFaces = ALL_SIDES) => getPaintedFaces(c, n, paintedFaces).includes(side);

/** 着色面の数ごとの小立方体のキー（3D の強調に使う） */
export const paintCountKeys = (spec, count) => getCubesByPaintCount(spec, count).map(subcubeKey);

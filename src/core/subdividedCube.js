/**
 * 小立方体に分けた立方体（Three.js・DOM 非依存）
 *
 * 一辺を n 等分した大きな立方体を、n³ 個の小立方体の整数座標 { x, y, z }（各軸 0〜n-1）で表す。
 * 向きは積み木（core/blockGeometry）と同じ：x = 右、y = 上、z = 手前（z = n-1 が前の面）。
 * 3D の座標（中心が原点など）とは分けて扱い、描画側で変換する。
 */

/** 分けられる数の範囲（描画の重さを考えて 6 まで。問題で使うのは主に 2〜5） */
export const MIN_DIVISIONS = 1;
export const MAX_DIVISIONS = 6;

/** 大きな立方体の外側の面（方向 → 外向きの軸と、その面に接する小立方体の条件） */
export const CUBE_SIDES = Object.freeze(['top', 'bottom', 'front', 'back', 'right', 'left']);
export const SIDE_NORMALS = Object.freeze({
  top: [0, 1, 0],
  bottom: [0, -1, 0],
  front: [0, 0, 1],
  back: [0, 0, -1],
  right: [1, 0, 0],
  left: [-1, 0, 0],
});
export const SIDE_NAMES = Object.freeze({ top: '上面', bottom: '下面', front: '前面', back: '後ろの面', right: '右の面', left: '左の面' });

export const subcubeKey = (c) => `${c.x},${c.y},${c.z}`;

export const isValidDivisions = (n) => Number.isInteger(n) && n >= MIN_DIVISIONS && n <= MAX_DIVISIONS;

/**
 * n 等分した立方体（小立方体 n³ 個）
 * @returns {{ divisions: number, cubes: {x,y,z}[] }}
 */
export function createSubdividedCube(n) {
  if (!isValidDivisions(n)) throw new Error(`分ける数は ${MIN_DIVISIONS}〜${MAX_DIVISIONS}: ${n}`);
  const cubes = [];
  for (let y = 0; y < n; y++) for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) cubes.push({ x, y, z });
  return { divisions: n, cubes };
}

/** 小立方体が、大きな立方体のどの外側の面に接しているか（'top' など） */
export function getExteriorFaces(c, n) {
  const sides = [];
  if (c.y === n - 1) sides.push('top');
  if (c.y === 0) sides.push('bottom');
  if (c.z === n - 1) sides.push('front');
  if (c.z === 0) sides.push('back');
  if (c.x === n - 1) sides.push('right');
  if (c.x === 0) sides.push('left');
  return sides;
}

/**
 * 小立方体の場所の種類（外側の面に接する数で決める）
 * corner：角（3面）、edge：辺（2面）、face：面の中央（1面）、inner：内部（0面）
 * n = 1 のときは1個の立方体そのもの（6面）なので 'whole'
 */
export function classifySubcube(c, n) {
  if (n === 1) return 'whole';
  return ['inner', 'face', 'edge', 'corner'][getExteriorFaces(c, n).length];
}

export const isInRange = (c, n) => [c?.x, c?.y, c?.z].every((v) => Number.isInteger(v) && v >= 0 && v < n);

/** 小立方体の一覧のエラー（範囲外・重複）。空なら正常 */
export function getSubcubeListErrors(list, n) {
  if (!Array.isArray(list)) return ['小立方体の一覧が配列ではありません'];
  const errors = [];
  const seen = new Set();
  for (const c of list) {
    if (!isInRange(c, n)) errors.push(`範囲外の小立方体です: ${JSON.stringify(c)}`);
    const k = subcubeKey(c ?? {});
    if (seen.has(k)) errors.push(`小立方体が重複しています: ${k}`);
    seen.add(k);
  }
  return errors;
}

/** 取り除いたあとに残る小立方体 */
export function removeSubcubes(cubes, removed) {
  const gone = new Set(removed.map(subcubeKey));
  return cubes.filter((c) => !gone.has(subcubeKey(c)));
}

/** 重なりをのぞいて1つにまとめる（同じ小立方体を2回数えない） */
export function uniqueSubcubes(list) {
  const map = new Map();
  for (const c of list) map.set(subcubeKey(c), { x: c.x, y: c.y, z: c.z });
  return [...map.values()];
}

/** 大きな立方体の8つの角の小立方体 */
export function cornerSubcubes(n) {
  const ends = n === 1 ? [0] : [0, n - 1];
  return ends.flatMap((y) => ends.flatMap((z) => ends.map((x) => ({ x, y, z }))));
}

/**
 * 大きな立方体の辺にそって並ぶ小立方体（角もふくむ n 個）
 * @param {'topFront'|'topBack'|'topLeft'|'topRight'|'frontRight'|'frontLeft'|'bottomFront'} edge
 */
export function edgeSubcubes(n, edge) {
  const t = n - 1;
  const line = {
    topFront: (i) => ({ x: i, y: t, z: t }),
    topBack: (i) => ({ x: i, y: t, z: 0 }),
    topLeft: (i) => ({ x: 0, y: t, z: i }),
    topRight: (i) => ({ x: t, y: t, z: i }),
    frontRight: (i) => ({ x: t, y: i, z: t }),
    frontLeft: (i) => ({ x: 0, y: i, z: t }),
    bottomFront: (i) => ({ x: i, y: 0, z: t }),
  }[edge];
  if (!line) throw new Error(`辺の指定が不正です: ${edge}`);
  return [...Array(n).keys()].map(line);
}

/** 上から下までまっすぐぬける1列（上面の (x, z) のマスの真下すべて） */
export const columnSubcubes = (n, x, z) => [...Array(n).keys()].map((y) => ({ x, y, z }));

/**
 * 積み木（一辺 1 の小立方体を積んだ立体）の数学データ（Three.js・DOM 非依存）
 *
 * 座標：X = 左右（+X が右）、Y = 上下（y = 0 が最下段）、Z = 前後（+Z が手前）。
 * 小立方体 { x, y, z } は [x, x+1] × [y, y+1] × [z, z+1] を占める（中心は x+0.5, y+0.5, z+0.5）。
 * 高さマップ heights[z][x] は、z = 0 が奥の列、x = 0 が左の列。どの柱も最下段から隙間なく積む。
 *
 * 見取図・3D モデル・投影図は、すべてこの配置データから作る。
 */
import { shuffle } from '../utils/random.js';

/** 見取図を描く向き（右手前の斜め上。3D の初期の視点も同じ向き） */
export const BLOCK_VIEW_DIRECTION = Object.freeze([4, 5, 6]);

export const cubeKey = (c) => `${c.x},${c.y},${c.z}`;

/** 高さマップ → 小立方体の一覧 */
export function heightsToCubes(heights) {
  const cubes = [];
  heights.forEach((row, z) =>
    row.forEach((h, x) => {
      for (let y = 0; y < h; y++) cubes.push({ x, y, z });
    }),
  );
  return cubes;
}

/** 小立方体の一覧 → 高さマップ（重なりや浮きがあっても、各柱のいちばん上の高さ） */
export function cubesToHeights(cubes) {
  const { width, depth } = getBlockBounds(cubes);
  const heights = Array.from({ length: depth }, () => Array(width).fill(0));
  for (const c of cubes) heights[c.z][c.x] = Math.max(heights[c.z][c.x], c.y + 1);
  return heights;
}

/** 大きさ（x・y・z 方向のマスの数）。座標は 0 から始まるものとする */
export function getBlockBounds(cubes) {
  if (cubes.length === 0) return { width: 0, height: 0, depth: 0 };
  return {
    width: Math.max(...cubes.map((c) => c.x)) + 1,
    height: Math.max(...cubes.map((c) => c.y)) + 1,
    depth: Math.max(...cubes.map((c) => c.z)) + 1,
  };
}

/** 座標を 0 から始まるようにずらし、並び順をそろえる（重なりがあればエラー） */
export function normalizeBlocks(cubes) {
  const minX = Math.min(...cubes.map((c) => c.x));
  const minY = Math.min(...cubes.map((c) => c.y));
  const minZ = Math.min(...cubes.map((c) => c.z));
  const result = cubes
    .map((c) => ({ x: c.x - minX, y: c.y - minY, z: c.z - minZ }))
    .sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);
  if (hasDuplicateCubes(result)) throw new Error('同じ位置に小立方体が重なっています');
  return result;
}

export const hasDuplicateCubes = (cubes) => new Set(cubes.map(cubeKey)).size !== cubes.length;

/** 浮いている小立方体がない（y > 0 の小立方体の真下にも小立方体がある） */
export function isGrounded(cubes) {
  const keys = new Set(cubes.map(cubeKey));
  return cubes.every((c) => c.y === 0 || keys.has(cubeKey({ x: c.x, y: c.y - 1, z: c.z })));
}

/** 配置データのエラー一覧（空なら正常） */
export function getBlockErrors(cubes) {
  const errors = [];
  if (!Array.isArray(cubes) || cubes.length === 0) return ['小立方体がありません'];
  if (!cubes.every((c) => [c.x, c.y, c.z].every(Number.isInteger) && c.x >= 0 && c.y >= 0 && c.z >= 0)) {
    errors.push('座標は 0 以上の整数');
  }
  if (hasDuplicateCubes(cubes)) errors.push('同じ位置に小立方体が重なっています');
  if (!isGrounded(cubes)) errors.push('浮いている小立方体があります');
  return errors;
}

export const blocksKey = (cubes) => normalizeBlocks(cubes).map(cubeKey).join(';');

// ---------- 見取図で形が読み取れるか ----------

/** 光線（origin から dir の向き）が、小立方体 c にぶつかるか（スラブ法） */
function rayHitsCube(origin, dir, c) {
  let tMin = 1e-6;
  let tMax = Infinity;
  const lo = [c.x, c.y, c.z];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(dir[i]) < 1e-12) {
      if (origin[i] <= lo[i] || origin[i] >= lo[i] + 1) return false;
      continue;
    }
    let t1 = (lo[i] - origin[i]) / dir[i];
    let t2 = (lo[i] + 1 - origin[i]) / dir[i];
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin >= tMax) return false;
  }
  return true;
}

/**
 * 見取図で形が読み取れるか：
 * すべてのマス（柱のいちばん上の面、空きマスは床）の中心が、見取図の視点から見えている
 */
export function isBlockStructureReadable(cubes, viewDirection = BLOCK_VIEW_DIRECTION) {
  const heights = cubesToHeights(cubes);
  for (let z = 0; z < heights.length; z++) {
    for (let x = 0; x < heights[z].length; x++) {
      const p = [x + 0.5, heights[z][x] + 1e-4, z + 0.5];
      if (cubes.some((c) => rayHitsCube(p, viewDirection, c))) return false;
    }
  }
  return true;
}

// ---------- 観察の向きを示す矢印 ----------

/**
 * 見る向きを示す矢印の、根元（観察者の側）と先端（立体の側）の位置。見取図と 3D で共通。
 * @param {'front'|'right'|'top'|'left'|'back'} direction
 */
export function arrowPoints(cubes, direction) {
  const { width: W, height: H, depth: D } = getBlockBounds(cubes);
  const far = 1.8;
  const near = 0.3;
  switch (direction) {
    case 'front':
      return { from: [W / 2, H / 2, D + far], to: [W / 2, H / 2, D + near] };
    case 'right':
      return { from: [W + far, H / 2, D / 2], to: [W + near, H / 2, D / 2] };
    case 'top':
      return { from: [W / 2, H + far, D / 2], to: [W / 2, H + near, D / 2] };
    case 'left':
      return { from: [-far, H / 2, D / 2], to: [-near, H / 2, D / 2] };
    case 'back':
      return { from: [W / 2, H / 2, -far], to: [W / 2, H / 2, -near] };
    default:
      throw new Error(`無効な向きです: ${direction}`);
  }
}

// ---------- ランダムな積み木 ----------

/** 高さマップの、立方体がある部分がひとつながりか（上下左右でつながる） */
function isFootprintConnected(heights) {
  const cells = [];
  heights.forEach((row, z) => row.forEach((h, x) => h > 0 && cells.push(`${x},${z}`)));
  if (cells.length === 0) return false;
  const set = new Set(cells);
  const seen = new Set([cells[0]]);
  const stack = [cells[0]];
  while (stack.length > 0) {
    const [x, z] = stack.pop().split(',').map(Number);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = `${x + dx},${z + dz}`;
      if (set.has(k) && !seen.has(k)) {
        seen.add(k);
        stack.push(k);
      }
    }
  }
  return seen.size === cells.length;
}

/**
 * 出題用の高さマップをランダムに作る
 * - すべての列・行に立方体がある（図の大きさ = 底面の大きさ）
 * - 底面はひとつながり、高さは2種類以上
 * - 見取図で形が読み取れる
 */
export function generateHeights(rng, { width, depth, maxHeight, minCubes = 4, maxCubes = 25, emptyRate = 0.2 }) {
  for (let attempt = 0; attempt < 5000; attempt++) {
    // 見取図は右手前の斜め上から見るので、手前・右の柱ほど低くなりやすくして、奥の柱が隠れにくくする
    const slope = attempt % 2 === 0 ? 0.5 : 0.8;
    const heights = Array.from({ length: depth }, (_, z) =>
      Array.from({ length: width }, (_, x) => {
        if (rng() < emptyRate) return 0;
        const toFront = (z / Math.max(1, depth - 1) + x / Math.max(1, width - 1)) / 2;
        const cap = Math.max(1, Math.round(maxHeight - slope * (maxHeight - 1) * toFront));
        return 1 + Math.floor(rng() * cap);
      }),
    );
    const total = heights.flat().reduce((s, h) => s + h, 0);
    if (total < minCubes || total > maxCubes) continue;
    if (!heights.every((row) => row.some((h) => h > 0))) continue;
    if (![...Array(width).keys()].every((x) => heights.some((row) => row[x] > 0))) continue;
    if (new Set(heights.flat().filter((h) => h > 0)).size < 2) continue;
    if (!isFootprintConnected(heights)) continue;
    if (!isBlockStructureReadable(heightsToCubes(heights))) continue;
    return heights;
  }
  throw new Error('積み木を作れませんでした');
}

/** 高さマップを少し変えた候補（まちがいの立体を作るとき用） */
export function perturbHeights(heights, rng) {
  const variants = [];
  const depth = heights.length;
  const width = heights[0].length;
  for (let z = 0; z < depth; z++) {
    for (let x = 0; x < width; x++) {
      for (const d of [1, -1]) {
        const h = heights.map((row) => [...row]);
        h[z][x] += d;
        if (h[z][x] >= 0 && h[z][x] <= 4) variants.push(h);
      }
    }
  }
  // 2つの柱を入れかえる
  for (let i = 0; i < 6; i++) {
    const h = heights.map((row) => [...row]);
    const a = [Math.floor(rng() * depth), Math.floor(rng() * width)];
    const b = [Math.floor(rng() * depth), Math.floor(rng() * width)];
    [h[a[0]][a[1]], h[b[0]][b[1]]] = [h[b[0]][b[1]], h[a[0]][a[1]]];
    variants.push(h);
  }
  return shuffle(variants, rng);
}

/**
 * 積み木の個数（Three.js・DOM 非依存）
 *
 * 積み木の配置データ（core/blockGeometry の小立方体の一覧・高さマップ）をそのまま使い、
 * 全体・段ごと・列ごとの個数、見取図の視点から見えない小立方体、取り除いた残りを数える。
 *
 * 見取図だけで個数が決まるか（isCountDetermined）
 *   1. 床から隙間なく積んであり、浮いている小立方体がない（isGrounded）
 *   2. どのマスも、柱のいちばん上の面（空きマスは床）が見取図の視点から見える（isBlockStructureReadable）
 *   3. 見取図の中で、ちがうマス・ちがう高さの上の面が同じ位置に描かれることがない
 *      （見る向き v = (4, 5, 6) と平行な整数のずれは (4, 5, 6) の整数倍だけなので、横・奥行き・高さがどれも 4 以下なら起こらない）
 *   この3つがそろえば、見取図に描かれた上の面の位置から各柱の高さがただ1つに決まり、
 *   見えない小立方体も「上の小立方体を支える下の小立方体」として数がわかる。
 */
import { BLOCK_VIEW_DIRECTION, cubeKey, cubesToHeights, getBlockBounds, isGrounded, isBlockStructureReadable, hasDuplicateCubes } from './blockGeometry.js';

/** 見取図だけで個数が決まると確かめられる大きさの上限（横・奥行き・高さ） */
export const MAX_DETERMINED_SIZE = 4;

export const countAllBlocks = (cubes) => cubes.length;

/** 高さマップの合計（小立方体の一覧から独立に数える確かめ用） */
export const sumHeights = (heights) => heights.flat().reduce((s, h) => s + h, 0);

/**
 * 段ごとの個数（下から 1 段目、2 段目…）
 * @returns {{ layers: { level: number, count: number }[], total: number }}
 */
export function countBlocksByLayer(cubes) {
  const { height } = getBlockBounds(cubes);
  const layers = Array.from({ length: height }, (_, i) => ({ level: i + 1, count: 0 }));
  for (const c of cubes) layers[c.y].count += 1;
  return { layers, total: cubes.length };
}

/** 指定した段（下から level 段目）の小立方体 */
export const blocksInLayer = (cubes, level) => cubes.filter((c) => c.y === level - 1);

/** 柱（マス）ごとの個数。heights[z][x] と同じ並び */
export const countBlocksByColumn = (cubes) => cubesToHeights(cubes);

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

/** 見る向きに対して表を向いている面（外向きの法線・面の上の点） */
function facingFaces(c, v) {
  const faces = [];
  for (let axis = 0; axis < 3; axis++) {
    if (Math.abs(v[axis]) < 1e-12) continue;
    const side = v[axis] > 0 ? 1 : 0;
    faces.push({ axis, value: [c.x, c.y, c.z][axis] + side, sign: v[axis] > 0 ? 1 : -1 });
  }
  return faces;
}

const SAMPLES = 12;

/**
 * 小立方体が見取図の視点から少しでも見えるか
 * 見えている面の上に細かく点をとり、どれか1点でもほかの小立方体にさえぎられずに視点まで届けば「見える」。
 * （面の一部でも見える小立方体を、隠れたものとして数えない）
 */
export function isBlockVisible(c, cubes, viewDirection = BLOCK_VIEW_DIRECTION) {
  const others = cubes.filter((o) => o !== c && cubeKey(o) !== cubeKey(c));
  for (const face of facingFaces(c, viewDirection)) {
    const [a, b] = [0, 1, 2].filter((i) => i !== face.axis);
    for (let i = 0; i < SAMPLES; i++) {
      for (let j = 0; j < SAMPLES; j++) {
        const p = [c.x, c.y, c.z];
        p[face.axis] = face.value + face.sign * 1e-6;
        p[a] = [c.x, c.y, c.z][a] + (i + 0.5) / SAMPLES;
        p[b] = [c.x, c.y, c.z][b] + (j + 0.5) / SAMPLES;
        if (!others.some((o) => rayHitsCube(p, viewDirection, o))) return true;
      }
    }
  }
  return false;
}

/**
 * 見取図の視点から完全に隠れて見えない小立方体
 * @returns {{ count: number, cubes: {x,y,z}[] }}
 */
export function countHiddenBlocks(cubes, viewDirection = BLOCK_VIEW_DIRECTION) {
  const hidden = cubes.filter((c) => !isBlockVisible(c, cubes, viewDirection));
  return { count: hidden.length, cubes: hidden.map((c) => ({ x: c.x, y: c.y, z: c.z })) };
}

/** 取り除いたあとに残る個数（removed は小立方体またはキー 'x,y,z'） */
export function countRemainingBlocks(cubes, removed) {
  const gone = new Set(removed.map((r) => (typeof r === 'string' ? r : cubeKey(r))));
  return cubes.filter((c) => !gone.has(cubeKey(c))).length;
}

/** 見取図で上の面が描かれる位置（2D）。ちがうマス・高さの上の面が同じ位置にならないことの確かめに使う */
export function projectedTopCenter(x, h, z, viewDirection = BLOCK_VIEW_DIRECTION) {
  const v = viewDirection;
  const len = Math.hypot(...v);
  const n = v.map((t) => t / len);
  const rightLen = Math.hypot(n[2], n[0]);
  const right = [n[2] / rightLen, 0, -n[0] / rightLen];
  const up = [n[1] * right[2] - n[2] * right[1], n[2] * right[0] - n[0] * right[2], n[0] * right[1] - n[1] * right[0]];
  const p = [x + 0.5, h, z + 0.5];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return [dot(p, right), dot(p, up)];
}

/**
 * 見取図（床から隙間なく積む・浮きなし、という条件つき）だけで、小立方体の個数がただ1つに決まるか
 * 決まらない配置は出題しない（冒頭の説明を参照）
 */
export function isCountDetermined(cubes, viewDirection = BLOCK_VIEW_DIRECTION) {
  if (cubes.length === 0 || hasDuplicateCubes(cubes) || !isGrounded(cubes)) return false;
  const { width, height, depth } = getBlockBounds(cubes);
  if (Math.max(width, height, depth) > MAX_DETERMINED_SIZE) return false;
  return isBlockStructureReadable(cubes, viewDirection);
}

/** 完成形にするために加える小立方体（完成形にあって今の形にないもの。今の形が完成形にふくまれないときは null） */
export function blocksToAdd(current, target) {
  const targetKeys = new Set(target.map(cubeKey));
  if (!current.every((c) => targetKeys.has(cubeKey(c)))) return null;
  const currentKeys = new Set(current.map(cubeKey));
  return target.filter((c) => !currentKeys.has(cubeKey(c))).map((c) => ({ x: c.x, y: c.y, z: c.z }));
}

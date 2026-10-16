/**
 * 積み木の投影図（Three.js・DOM 非依存）
 *
 * 投影図は 2 次元の配列 cells で表す。cells[r][c]：r = 0 が図のいちばん上、c = 0 が図のいちばん左。
 * どの向きも「その向きから見た人にとっての左右」で並べる。
 *
 *   front 正面図   … 手前（+Z）から奥を見る。図の右 = +X
 *   right 右側面図 … 右（+X）から左を見る。  図の右 = 奥（-Z）。図の左が手前
 *   left  左側面図 … 左（-X）から右を見る。  図の右 = 手前（+Z）
 *   back  背面図   … 奥（-Z）から手前を見る。図の右 = -X
 *   top   上面図   … 真上から見る（手前を下にする）。図の上 = 奥（-Z）、図の右 = +X
 */
import { getBlockBounds } from './blockGeometry.js';

export const PROJECTION_DIRECTIONS = Object.freeze(['front', 'right', 'top', 'left', 'back']);

export const PROJECTION_NAMES = Object.freeze({ front: '正面図', right: '右側面図', top: '上面図', left: '左側面図', back: '背面図' });
export const VIEW_FROM = Object.freeze({ front: '正面から', right: '右から', top: '真上から', left: '左から', back: '後ろから' });
/** 「矢印の方向（正面）から」のような言い方に使う向きの名前 */
export const VIEW_NAMES = Object.freeze({ front: '正面', right: '右', top: '真上', left: '左', back: '後ろ' });

/**
 * 指定した向きの投影図
 * @param {{x:number,y:number,z:number}[]} cubes
 * @param {'front'|'right'|'top'|'left'|'back'} direction
 * @returns {{ direction: string, width: number, height: number, cells: number[][] }}
 */
export function getProjection(cubes, direction) {
  const { width: W, height: H, depth: D } = getBlockBounds(cubes);
  const make = (w, h) => Array.from({ length: h }, () => Array(w).fill(0));
  let cells;
  switch (direction) {
    case 'front':
      cells = make(W, H);
      for (const c of cubes) cells[H - 1 - c.y][c.x] = 1;
      break;
    case 'back':
      cells = make(W, H);
      for (const c of cubes) cells[H - 1 - c.y][W - 1 - c.x] = 1;
      break;
    case 'right':
      cells = make(D, H);
      for (const c of cubes) cells[H - 1 - c.y][D - 1 - c.z] = 1;
      break;
    case 'left':
      cells = make(D, H);
      for (const c of cubes) cells[H - 1 - c.y][c.z] = 1;
      break;
    case 'top':
      cells = make(W, D);
      for (const c of cubes) cells[c.z][c.x] = 1;
      break;
    default:
      throw new Error(`無効な向きです: ${direction}`);
  }
  return { direction, width: cells[0]?.length ?? 0, height: cells.length, cells };
}

export const getFrontProjection = (cubes) => getProjection(cubes, 'front');
export const getRightProjection = (cubes) => getProjection(cubes, 'right');
export const getTopProjection = (cubes) => getProjection(cubes, 'top');

/** 図の形だけの比較キー（向きの名前は含めない） */
export const getShapeKey = (projection) => `${projection.width}x${projection.height}:${projection.cells.map((r) => r.join('')).join('/')}`;

/** 向きを含めた比較キー */
export const getProjectionKey = (projection) => `${projection.direction}|${getShapeKey(projection)}`;

/** cells から投影図を作る */
export const projectionFromCells = (direction, cells) => ({ direction, width: cells[0]?.length ?? 0, height: cells.length, cells: cells.map((r) => [...r]) });

/** 正面図・側面図の各列の高さ（左から） */
export function columnHeights(projection) {
  const { width, height, cells } = projection;
  return Array.from({ length: width }, (_, c) => {
    for (let r = 0; r < height; r++) if (cells[r][c]) return height - r;
    return 0;
  });
}

/** 各列の高さから、正面図・側面図を作る（図の高さ height） */
export function projectionFromHeights(direction, heights, height = Math.max(...heights)) {
  const cells = Array.from({ length: height }, (_, r) => heights.map((h) => (height - r <= h ? 1 : 0)));
  return projectionFromCells(direction, cells);
}

/** 左右を反転した図 */
export const mirrorProjection = (p) => projectionFromCells(p.direction, p.cells.map((r) => [...r].reverse()));

/** 上下（上面図では前後）を反転した図 */
export const flipProjection = (p) => projectionFromCells(p.direction, [...p.cells].reverse());

/** 塗られたマスの数 */
export const filledCount = (p) => p.cells.flat().filter(Boolean).length;

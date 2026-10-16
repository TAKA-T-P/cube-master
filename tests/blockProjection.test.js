import { describe, it, expect } from 'vitest';
import {
  heightsToCubes,
  cubesToHeights,
  getBlockBounds,
  normalizeBlocks,
  getBlockErrors,
  isGrounded,
  hasDuplicateCubes,
  isBlockStructureReadable,
  generateHeights,
  arrowPoints,
} from '../src/core/blockGeometry.js';
import {
  getProjection,
  getFrontProjection,
  getRightProjection,
  getTopProjection,
  getProjectionKey,
  getShapeKey,
  columnHeights,
  projectionFromHeights,
  mirrorProjection,
  PROJECTION_DIRECTIONS,
} from '../src/core/blockProjection.js';
import { createRng } from '../src/utils/random.js';

const draw = (p) => p.cells.map((r) => r.map((v) => (v ? '#' : '.')).join(''));

// heights[z][x]：z = 0 が奥の列、x = 0 が左の列
//   奥   2 1 0
//   手前 1 3 2
const HEIGHTS = [
  [2, 1, 0],
  [1, 3, 2],
];
const cubes = heightsToCubes(HEIGHTS);

describe('積み木の配置データ', () => {
  it('高さマップから小立方体を作り、元に戻せる', () => {
    expect(cubes).toHaveLength(9);
    expect(getBlockBounds(cubes)).toEqual({ width: 3, height: 3, depth: 2 });
    expect(cubesToHeights(cubes)).toEqual(HEIGHTS);
    expect(cubes).toContainEqual({ x: 1, y: 2, z: 1 }); // 手前のまん中の柱の3段目
  });

  it('重なり・浮きのない配置だけを正しいとする', () => {
    expect(getBlockErrors(cubes)).toEqual([]);
    expect(hasDuplicateCubes([{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }])).toBe(true);
    expect(isGrounded([{ x: 0, y: 1, z: 0 }])).toBe(false);
    expect(getBlockErrors([{ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }])).toContain('浮いている小立方体があります');
    expect(() => normalizeBlocks([{ x: 2, y: 0, z: 1 }, { x: 2, y: 0, z: 1 }])).toThrow();
    expect(normalizeBlocks([{ x: 3, y: 0, z: 2 }, { x: 4, y: 0, z: 2 }])).toEqual([{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }]);
  });
});

describe('投影図', () => {
  it('正面図：手前から見て、奥のブロックは重なり、各列のいちばん高いところまで見える', () => {
    expect(draw(getFrontProjection(cubes))).toEqual(['.#.', '###', '###']);
    expect(columnHeights(getFrontProjection(cubes))).toEqual([2, 3, 2]); // x=0 は奥の 2 段が見える
  });

  it('右側面図：右から見て、図の左が手前', () => {
    // 手前の列（いちばん高いのは 3）が図の左、奥の列（2）が図の右
    expect(draw(getRightProjection(cubes))).toEqual(['#.', '##', '##']);
    expect(columnHeights(getRightProjection(cubes))).toEqual([3, 2]);
  });

  it('上面図：真上から見て、手前が下。ブロックがあるマスがぬられる', () => {
    expect(draw(getTopProjection(cubes))).toEqual(['##.', '###']);
  });

  it('左側面図・背面図は、右側面図・正面図の左右反転', () => {
    expect(getProjection(cubes, 'left').cells).toEqual(mirrorProjection(getRightProjection(cubes)).cells);
    expect(getProjection(cubes, 'back').cells).toEqual(mirrorProjection(getFrontProjection(cubes)).cells);
  });

  it('左右の向き：右端だけにある柱は、正面図では右端、上面図でも右端に見える', () => {
    const one = heightsToCubes([[1, 0, 0, 3]]);
    expect(draw(getFrontProjection(one))).toEqual(['...#', '...#', '#..#']);
    expect(draw(getTopProjection(one))).toEqual(['#..#']);
  });

  it('奥に隠れた小立方体は正面図で重なり、手前より高ければ上に見える', () => {
    const hidden = heightsToCubes([[3], [1]]); // 奥が3段、手前が1段
    expect(columnHeights(getFrontProjection(hidden))).toEqual([3]);
    expect(columnHeights(getRightProjection(hidden))).toEqual([1, 3]); // 右から見ると手前（左）が1、奥（右）が3
  });

  it('比較キー・高さからの図・すべての向き', () => {
    expect(getProjectionKey(getFrontProjection(cubes))).toBe('front|3x3:.#./###/###'.replace(/\./g, '0').replace(/#/g, '1'));
    expect(getShapeKey(projectionFromHeights('front', [2, 3, 2]))).toBe(getShapeKey(getFrontProjection(cubes)));
    for (const d of PROJECTION_DIRECTIONS) expect(getProjection(cubes, d).direction).toBe(d);
    expect(() => getProjection(cubes, 'under')).toThrow();
  });
});

describe('ランダムな積み木と見取図', () => {
  it('作った積み木は、重なり・浮きがなく、すべての列と行にブロックがあり、見取図で読み取れる', () => {
    const rng = createRng(11);
    for (const [width, depth, maxHeight] of [[2, 2, 3], [3, 2, 3], [3, 3, 4], [4, 3, 4]]) {
      for (let i = 0; i < 40; i++) {
        const h = generateHeights(rng, { width, depth, maxHeight });
        const cs = heightsToCubes(h);
        expect(getBlockErrors(cs)).toEqual([]);
        expect(getBlockBounds(cs)).toMatchObject({ width, depth });
        expect(cs.length).toBeGreaterThanOrEqual(4);
        expect(cs.length).toBeLessThanOrEqual(25);
        expect(Math.max(...h.flat())).toBeLessThanOrEqual(maxHeight);
        expect(isBlockStructureReadable(cs)).toBe(true);
      }
    }
  });

  it('手前の高い柱が奥の柱を隠す配置は「読み取れない」と判定する', () => {
    expect(isBlockStructureReadable(heightsToCubes([[1], [4]]))).toBe(false); // 奥1段・手前4段
    expect(isBlockStructureReadable(heightsToCubes([[4], [1]]))).toBe(true);
  });

  it('矢印は立体の外側にあり、根元が見る人の側', () => {
    const { from, to } = arrowPoints(cubes, 'front');
    expect(from[2]).toBeGreaterThan(to[2]);
    expect(to[2]).toBeGreaterThan(2); // 手前の面（z = 2）より外
    const right = arrowPoints(cubes, 'right');
    expect(right.from[0]).toBeGreaterThan(right.to[0]);
    const top = arrowPoints(cubes, 'top');
    expect(top.from[1]).toBeGreaterThan(top.to[1]);
  });
});

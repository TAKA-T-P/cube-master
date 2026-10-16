import { describe, it, expect } from 'vitest';
import {
  INITIAL_ORIENTATION,
  ALL_ORIENTATIONS,
  rotateOrientation,
  rotateOrientationSequence,
  getFaceAtDirection,
  getDirectionOfFace,
  getOppositeDirection,
  isValidOrientation,
  orientationKey,
  orientationsEqual,
  orientationToMatrix,
  matrixToOrientation,
  findRotationPath,
} from '../src/core/cubeOrientation.js';
import { MOVE_IDS, ROTATION_MOVES, ALL_ROTATIONS, determinant, DIRECTIONS } from '../src/core/cubeRotations.js';
import { STANDARD_DICE, byDirection, arrowAsSeen, ARROWS, isStandardDice } from '../src/core/cubeFaceLabels.js';
import { canMatchView, mirrorView, viewOf, enumerateLabelings, solveUnique, canSatisfyConditions } from '../src/core/cubePuzzle.js';

const I = INITIAL_ORIENTATION;

describe('はじめの向き', () => {
  it('上 ABCD・下 EFGH・前 ABFE・後ろ CDHG・右 BCGF・左 DAEH', () => {
    expect(I).toEqual({ top: 'ABCD', bottom: 'EFGH', front: 'ABFE', back: 'CDHG', right: 'BCGF', left: 'DAEH' });
    expect(isValidOrientation(I)).toBe(true);
  });
});

describe('90° 回転', () => {
  it('1回の回転で面の向きが仕様どおりに変わる', () => {
    const after = (m) => rotateOrientation(I, m);
    // 右へ：元の上面が右側面に
    expect(getDirectionOfFace(after('right'), 'ABCD')).toBe('right');
    expect(after('right').top).toBe('DAEH'); // 元の左面が上に
    // 左へ：元の上面が左側面に
    expect(getDirectionOfFace(after('left'), 'ABCD')).toBe('left');
    // 前へ（手前）：元の上面が前面に
    expect(getDirectionOfFace(after('forward'), 'ABCD')).toBe('front');
    expect(after('forward').top).toBe('CDHG'); // 元の後ろの面が上に
    // 後ろへ（奥）：元の上面が後面に
    expect(getDirectionOfFace(after('backward'), 'ABCD')).toBe('back');
    // 水平に右へ：元の前面が右側面に。上下は変わらない
    expect(getDirectionOfFace(after('turnRight'), 'ABFE')).toBe('right');
    expect(after('turnRight').top).toBe('ABCD');
    expect(after('turnRight').bottom).toBe('EFGH');
    // 水平に左へ：元の前面が左側面に
    expect(getDirectionOfFace(after('turnLeft'), 'ABFE')).toBe('left');
    // 転がす向きの軸の面は動かない
    expect(after('right').front).toBe('ABFE');
    expect(after('forward').right).toBe('BCGF');
  });

  it.each(MOVE_IDS)('%s：4回で元に戻り、逆回転でも元に戻る', (m) => {
    for (const o of ALL_ORIENTATIONS) {
      expect(orientationsEqual(rotateOrientationSequence(o, [m, m, m, m]), o)).toBe(true);
      expect(orientationsEqual(rotateOrientationSequence(o, [m, ROTATION_MOVES[m].inverse]), o)).toBe(true);
      expect(orientationsEqual(rotateOrientation(o, m), o)).toBe(false);
    }
  });

  it('右 → 左、前 → 後ろ、水平右 → 水平左 で元に戻る', () => {
    expect(rotateOrientationSequence(I, ['right', 'left'])).toEqual(I);
    expect(rotateOrientationSequence(I, ['forward', 'backward'])).toEqual(I);
    expect(rotateOrientationSequence(I, ['turnRight', 'turnLeft'])).toEqual(I);
  });

  it('回転の行列は整数で、行列式は 1（誤差がたまらない・鏡映しでない）', () => {
    for (const m of ALL_ROTATIONS) {
      expect(m.flat().every((x) => Number.isInteger(x) && Math.abs(x) <= 1)).toBe(true);
      expect(determinant(m)).toBe(1);
    }
    // 1000回まわしても正しい向きのまま
    let o = I;
    for (let i = 0; i < 1000; i++) o = rotateOrientation(o, MOVE_IDS[i % 6]);
    expect(isValidOrientation(o)).toBe(true);
  });
});

describe('24通りの姿勢', () => {
  it('24通りを列挙でき、重複がなく、すべて正しい向き', () => {
    expect(ALL_ORIENTATIONS).toHaveLength(24);
    expect(new Set(ALL_ORIENTATIONS.map(orientationKey)).size).toBe(24);
    for (const o of ALL_ORIENTATIONS) expect(isValidOrientation(o)).toBe(true);
  });

  it('どの姿勢をどう回しても24通りの中にとどまる（24通り以外は生まれない）', () => {
    const keys = new Set(ALL_ORIENTATIONS.map(orientationKey));
    for (const o of ALL_ORIENTATIONS) for (const m of MOVE_IDS) expect(keys.has(orientationKey(rotateOrientation(o, m)))).toBe(true);
  });

  it('上下・左右・前後の向かい合う面の関係が保たれる', () => {
    const opposite = { ABCD: 'EFGH', EFGH: 'ABCD', ABFE: 'CDHG', CDHG: 'ABFE', BCGF: 'DAEH', DAEH: 'BCGF' };
    for (const o of ALL_ORIENTATIONS) for (const d of DIRECTIONS) expect(o[getOppositeDirection(d)]).toBe(opposite[o[d]]);
  });

  it('向きと行列は1対1に対応する', () => {
    for (const o of ALL_ORIENTATIONS) expect(matrixToOrientation(orientationToMatrix(o))).toEqual(o);
  });

  it('鏡映しの配置は正しい向きとして扱わない', () => {
    expect(isValidOrientation({ ...I, right: 'DAEH', left: 'BCGF' })).toBe(false);
    expect(isValidOrientation({ ...I, right: 'ABCD' })).toBe(false); // 面の重複
    expect(isValidOrientation(null)).toBe(false);
  });

  it('どの2つの姿勢も、最短の回転手順でつなげる（3手以内）', () => {
    for (const a of ALL_ORIENTATIONS) {
      for (const b of ALL_ORIENTATIONS) {
        const path = findRotationPath(a, b);
        expect(path.length).toBeLessThanOrEqual(3);
        expect(rotateOrientationSequence(a, path)).toEqual(b);
      }
    }
  });

  it('面の取得・方向の取得・無効な値', () => {
    expect(getFaceAtDirection(I, 'top')).toBe('ABCD');
    expect(getDirectionOfFace(I, 'BCGF')).toBe('right');
    expect(getOppositeDirection('front')).toBe('back');
    expect(() => getFaceAtDirection(I, 'up')).toThrow();
    expect(() => getDirectionOfFace(I, 'XYZW')).toThrow();
    expect(() => rotateOrientation(I, 'spin')).toThrow();
  });
});

describe('面の装飾と回転', () => {
  it('回転しても各面の数字は同じ面のまま（向かい合う面の和 7 も保たれる）', () => {
    expect(isStandardDice(STANDARD_DICE)).toBe(true);
    for (const o of ALL_ORIENTATIONS) {
      const byDir = byDirection(STANDARD_DICE, o);
      for (const d of DIRECTIONS) {
        expect(byDir[d]).toBe(STANDARD_DICE[o[d]]);
        expect(byDir[d] + byDir[getOppositeDirection(d)]).toBe(7);
      }
    }
    // 右へ転がすと、元の左（4）が上に
    expect(byDirection(STANDARD_DICE, rotateOrientation(I, 'right')).top).toBe(4);
  });

  it('矢印の見え方：はじめの向きでは描いた向き、水平に右へ回すと上面の矢印は左向きに見える', () => {
    for (const d of DIRECTIONS) for (const a of ARROWS) expect(arrowAsSeen(I[d], a, I, d)).toBe(a);
    const turned = rotateOrientation(I, 'turnRight');
    expect(arrowAsSeen('ABCD', 'up', turned, 'top')).toBe('left');
    // 前の面を右へ回すと右の面になり、右から見ても矢印は上向きのまま
    expect(arrowAsSeen('ABFE', 'up', turned, 'right')).toBe('up');
    // 見えない方向を指定するとエラー
    expect(() => arrowAsSeen('ABCD', 'up', I, 'front')).toThrow();
  });
});

describe('パズルの検証（cubePuzzle）', () => {
  const byDir = byDirection(STANDARD_DICE, I);

  it('回転した見取図は一致し、鏡映しは一致しない', () => {
    for (const o of ALL_ORIENTATIONS) {
      const v = viewOf(byDirection(STANDARD_DICE, o));
      expect(canMatchView(byDir, v)).toBe(true);
      expect(canMatchView(byDir, mirrorView(v))).toBe(false);
    }
  });

  it('見えている3面だけでは配置は6通り、和が7のルールがあれば1通り', () => {
    const known = { top: 1, front: 2, right: 3 };
    expect(enumerateLabelings({ values: [1, 2, 3, 4, 5, 6], known })).toHaveLength(6);
    expect(enumerateLabelings({ values: [1, 2, 3, 4, 5, 6], known, oppositeSum: 7 })).toHaveLength(1);
    // 下の面は、ルールがなければ決まらない
    expect(solveUnique({ values: [1, 2, 3, 4, 5, 6], known }, (l) => l.bottom).unique).toBe(false);
    expect(solveUnique({ values: [1, 2, 3, 4, 5, 6], known, oppositeSum: 7 }, (l) => l.bottom)).toMatchObject({ unique: true, answers: [6] });
  });

  it('条件に合う置き方：わかっている面だけで決まる・決まらない', () => {
    expect(canSatisfyConditions({ top: 'r', front: 'b', right: 'y' }, { top: 'b', front: 'y', right: 'r' })).toBe(true);
    expect(canSatisfyConditions({ top: 'r', front: 'y', right: 'b' }, { top: 'r', front: 'b', right: 'y' })).toBe(false);
    expect(canSatisfyConditions({ top: 'r' }, { top: 'r', front: 'b' })).toBe(null);
  });
});

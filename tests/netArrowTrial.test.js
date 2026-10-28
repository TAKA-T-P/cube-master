// トライアル⑤「展開図に矢印を引け！」：上下左右の4方向・面と向きの変換・難易度ごとの出題・答えがただ1つに決まる・判定・3D の折りたたみと見取図の一致
import { describe, it, expect } from 'vitest';
import {
  ARROW_DIRECTIONS,
  ARROW_DIRECTION_IDS,
  NET_ARROW_LEVELS,
  arrowTo3D,
  arrowFrom3D,
  snapArrowDirection,
  isVisibleFace,
  generateNetArrowQuestion,
  checkNetArrowAnswer,
} from '../src/core/trial/netArrowTrial.js';
import { foldNet } from '../src/core/cubeNetFolding.js';
import { CUBE_NETS } from '../src/core/cubeNetCatalog.js';
import { makeCells, rotateNet, getNetBounds } from '../src/core/cubeNet.js';
import { ALL_ROTATIONS, applyMatrix } from '../src/core/cubeRotations.js';
import { FACES } from '../src/core/cubeConstants.js';
import { createNetModel } from '../src/three/cubeNetModel.js';
import { TRIAL_MODES } from '../src/core/trial/trialRules.js';
import { checkTrialAnswer, generateTrialQuestion } from '../src/core/trial/trialGenerators.js';
import { createRng } from '../src/utils/random.js';

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + 0; // -0 を 0 にする
const normalOf = (faceId) => FACES.find((f) => f.id === faceId).normal;
const same = (a, b) => a.every((v, i) => v === b[i]);

/** 見取図（赤・青の面と向き）と展開図の赤い矢印から考えられる答えを、立方体の置き方 24 通りすべてで調べる */
function possibleAnswers(q) {
  const answers = new Set();
  for (const m of ALL_ROTATIONS) {
    const map = (v) => applyMatrix(m, v).map((n) => (n === 0 ? 0 : n));
    const red = q.frames[q.red.cellId];
    if (!same(map(red.outward), normalOf(q.red.face)) || !same(map(arrowTo3D(red, q.red.dir)), q.red.vector)) continue;
    for (const c of q.cells) {
      if (!same(map(q.frames[c.id].outward), normalOf(q.blue.face))) continue;
      for (const d of ARROW_DIRECTION_IDS) if (same(map(arrowTo3D(q.frames[c.id], d)), q.blue.vector)) answers.add(`${c.id}:${d}`);
    }
  }
  return [...answers];
}

describe('上下左右の4方向', () => {
  it('なぞった向きを、いちばん近い上下左右にする（画面の下が正）。ななめの矢印はない。短すぎる動きは矢印にしない', () => {
    expect(ARROW_DIRECTION_IDS).toEqual(['N', 'E', 'S', 'W']);
    expect(snapArrowDirection(10, 0)).toBe('E');
    expect(snapArrowDirection(0, -10)).toBe('N');
    expect(snapArrowDirection(-10, 0)).toBe('W');
    expect(snapArrowDirection(0, 10)).toBe('S');
    expect(snapArrowDirection(10, 9)).toBe('E'); // ななめになぞっても、近いほうの縦か横
    expect(snapArrowDirection(9, 10)).toBe('S');
    expect(snapArrowDirection(-10, -11)).toBe('N');
    expect(snapArrowDirection(3, 2, 6)).toBeNull();
    expect(snapArrowDirection(0, 0)).toBeNull();
  });

  it('マスの中の向き ⇄ 3D の向き（面の上の向きで、成分は -1・0・1）。すべての展開図・マス・向きで行き来できる', () => {
    for (const net of CUBE_NETS) {
      const fold = foldNet(net.cells);
      for (const c of net.cells) {
        const f = fold.frames[c.id];
        for (const d of ARROW_DIRECTION_IDS) {
          const v = arrowTo3D(f, d);
          expect(dot(v, f.outward)).toBe(0);
          expect(v.every((n) => [-1, 0, 1].includes(n))).toBe(true);
          expect(arrowFrom3D(f, v)).toBe(d);
        }
        expect(arrowFrom3D(f, f.outward)).toBeNull();
      }
    }
  });

  it('同じ面・同じ展開図の向きでも、展開図を回すと立方体の上の向きが変わる', () => {
    const cells = CUBE_NETS[0].cells;
    const turned = rotateNet(cells, 1);
    const { minX, minY } = getNetBounds(turned);
    const shifted = makeCells(turned.map((c) => [c.x - minX, c.y - minY]));
    const a = foldNet(cells);
    const b = foldNet(shifted);
    const differs = FACES.some((face) => {
      const ca = Object.keys(a.cellToFace).find((id) => a.cellToFace[id] === face.id);
      const cb = Object.keys(b.cellToFace).find((id) => b.cellToFace[id] === face.id);
      return !same(arrowTo3D(a.frames[ca], 'N'), arrowTo3D(b.frames[cb], 'N'));
    });
    expect(differs).toBe(true);
  });
});

describe('問題の作り方', () => {
  it('5つ目のトライアル（LEVEL のルールは共通：正解 +1・不正解は2回ごとに −1）', () => {
    expect(TRIAL_MODES.map((m) => m.id)).toEqual(['blockCount', 'projectionDraw', 'diceRoll', 'netPartition', 'netArrow']);
    expect(TRIAL_MODES[4]).toMatchObject({ name: '展開図に矢印を引け！', gain: 1, missesPerLevelDown: 2 });
  });

  it('★〜★★★★：赤と青は別の面、見取図の面・向きと展開図が一致し、答えがただ1つに決まる。難易度の条件を満たす', () => {
    for (const difficulty of [1, 2, 3, 4]) {
      const level = NET_ARROW_LEVELS[difficulty];
      for (let seed = 1; seed <= 40; seed++) {
        const q = generateTrialQuestion('netArrow', difficulty, createRng(seed * 31 + difficulty));
        const fold = foldNet(q.cells, { rootId: q.rootId });
        expect(fold.valid).toBe(true);
        expect(q.red.cellId).not.toBe(q.blue.cellId);
        expect(q.answer).toEqual({ cellId: q.blue.cellId, dir: q.blue.dir });
        // 見取図の矢印は、折りたたんだ立方体の面の上にある
        for (const a of [q.red, q.blue]) {
          expect(a.face).toBe(fold.cellToFace[a.cellId]);
          expect(a.vector).toEqual(arrowTo3D(fold.frames[a.cellId], a.dir));
          expect(dot(a.vector, normalOf(a.face))).toBe(0);
        }
        // 赤い矢印の面と向きで、展開図の置き方がただ1つに決まる
        expect(possibleAnswers(q)).toEqual([`${q.answer.cellId}:${q.answer.dir}`]);
        const rn = normalOf(q.red.face);
        const bn = normalOf(q.blue.face);
        const red = q.cells.find((c) => c.id === q.red.cellId);
        const blue = q.cells.find((c) => c.id === q.blue.cellId);
        const distance = Math.abs(red.x - blue.x) + Math.abs(red.y - blue.y);
        expect(distance).toBeGreaterThanOrEqual(level.minNetDistance);
        expect(distance).toBeLessThanOrEqual(level.maxNetDistance);
        if (difficulty <= 2) {
          expect(dot(rn, bn)).toBe(0); // となり合う面
          expect(isVisibleFace(rn) && isVisibleFace(bn)).toBe(true);
        } else {
          expect(dot(rn, bn) === -1 || !isVisibleFace(bn)).toBe(true); // 向かい合う面か、うら側の面
        }
        // ななめの矢印は出さない
        expect(['N', 'E', 'S', 'W']).toContain(q.red.dir);
        expect(['N', 'E', 'S', 'W']).toContain(q.blue.dir);
        if (difficulty === 3) expect(isVisibleFace(rn)).toBe(true);
        if (difficulty === 4) {
          expect(isVisibleFace(bn)).toBe(false);
          expect(dot(rn, bn) === -1 || !isVisibleFace(rn)).toBe(true);
        }
      }
    }
  });

  it('展開図の形・基準のマスがいろいろ変わる', () => {
    const nets = new Set();
    const roots = new Set();
    for (let seed = 1; seed <= 60; seed++) {
      const q = generateNetArrowQuestion(2, createRng(seed));
      nets.add(q.netId);
      roots.add(q.cells.find((c) => c.id === q.rootId).x + ',' + q.cells.find((c) => c.id === q.rootId).y);
    }
    expect(nets.size).toBeGreaterThanOrEqual(8);
    expect(roots.size).toBeGreaterThanOrEqual(4);
  });
});

describe('判定', () => {
  it('面と向きの両方が合ったときだけ正解。面ちがい・向きちがい・未入力は不正解', () => {
    const q = generateNetArrowQuestion(3, createRng(5));
    const other = q.cells.find((c) => c.id !== q.answer.cellId).id;
    const otherDir = ARROW_DIRECTION_IDS.find((d) => d !== q.answer.dir);
    expect(checkTrialAnswer(q, { ...q.answer })).toMatchObject({ isCorrect: true, reason: null });
    expect(checkNetArrowAnswer(q, { cellId: other, dir: q.answer.dir })).toMatchObject({ isCorrect: false, faceCorrect: false, reason: 'face' });
    expect(checkNetArrowAnswer(q, { cellId: q.answer.cellId, dir: otherDir })).toMatchObject({ isCorrect: false, faceCorrect: true, dirCorrect: false, reason: 'direction' });
    expect(checkNetArrowAnswer(q, null)).toMatchObject({ isCorrect: false, reason: 'empty' });
    expect(checkNetArrowAnswer(q, { cellId: q.answer.cellId, dir: 'UP' })).toMatchObject({ isCorrect: false, reason: 'empty' });
  });
});

describe('答え合わせの 3D', () => {
  it('同じ基準のマスで折りたたむと、赤・青の矢印が見取図と同じ面・同じ向きになる', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const q = generateNetArrowQuestion((seed % 4) + 1, createRng(seed));
      const model = createNetModel();
      model.set({ cells: q.cells, rootId: q.rootId, cellArrows: { [q.red.cellId]: [{ dir: q.red.dir, color: 'red' }], [q.blue.cellId]: [{ dir: q.blue.dir, color: 'blue' }] } });
      model.setProgress(1);
      for (const a of [q.red, q.blue]) {
        const pose = model.getPanelPose(a.cellId);
        expect(pose.normal.toArray().map((n) => Math.round(n) || 0)).toEqual(normalOf(a.face).map((n) => n || 0));
        const [dx, dy] = ARROW_DIRECTIONS[a.dir];
        const v = pose.right.clone().multiplyScalar(dx).add(pose.down.clone().multiplyScalar(dy));
        expect(v.toArray().map((n) => Math.round(n) || 0)).toEqual(a.vector.map((n) => n || 0));
      }
      model.dispose();
    }
  });
});

describe('記録と称号', () => {
  it('⑤の自己ベストはほかの種類と別に保存し、ほかの記録を変えない。称号も10段階', async () => {
    const { createEmptyTrialRecords, recordTrialResult, normalizeTrialRecords } = await import('../src/core/trial/trialRecords.js');
    const { trialTitleFor, TRIAL_TITLES } = await import('../src/core/trial/trialTitles.js');
    const base = createEmptyTrialRecords();
    base.modes.diceRoll = { bestLevel: 9, attempts: 3, lastPlayedAt: null };
    const { records, bestUpdated } = recordTrialResult(base, { mode: 'netArrow', highestLevel: 7, aborted: false });
    expect(bestUpdated).toBe(true);
    expect(records.modes.netArrow).toMatchObject({ bestLevel: 7, attempts: 1 });
    expect(records.modes.diceRoll).toMatchObject({ bestLevel: 9, attempts: 3 });
    // ⑤ がなかった前の保存データも読める
    expect(normalizeTrialRecords({ version: 1, modes: { diceRoll: { bestLevel: 4, attempts: 1 } } }).modes.netArrow).toMatchObject({ bestLevel: 0, attempts: 0 });
    expect(TRIAL_TITLES.netArrow).toHaveLength(10);
    expect(trialTitleFor('netArrow', 1)).toBeNull();
    expect(trialTitleFor('netArrow', 20)).toMatchObject({ rank: 10, emoji: '👑' });
  });
});

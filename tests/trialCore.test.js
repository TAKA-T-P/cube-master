// トライアル（90秒・LEVEL アップ）：LEVEL・難易度・タイマー・記録・4種類の問題と判定・3D との一致
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { TRIAL_RULES, TRIAL_MODES, difficultyForLevel, levelAfter } from '../src/core/trial/trialRules.js';
import { TrialSession } from '../src/core/trial/trialSession.js';
import { createEmptyTrialRecords, normalizeTrialRecords, recordTrialResult } from '../src/core/trial/trialRecords.js';
import { generateTrialQuestion, checkTrialAnswer } from '../src/core/trial/trialGenerators.js';
import { BLOCK_COUNT_LEVELS } from '../src/core/trial/blockCountTrial.js';
import { expectedGrid, checkProjectionAnswer, generateProjectionQuestion } from '../src/core/trial/projectionTrial.js';
import { DICE_ROLL_LEVELS, ROLL_STEPS, diceFromVisible, rollPoses, isHiddenByDice } from '../src/core/trial/diceRollTrial.js';
import { checkNetPartitionAnswer, canPaintColor, isCubeNetPiece, NET_PARTITION_LEVELS, MAX_CELLS_PER_COLOR } from '../src/core/trial/netPartitionTrial.js';
import { isCountDetermined, isCountDeterminedLarge, countBlocksByLayer } from '../src/core/blockCounting.js';
import { isGrounded, getBlockBounds, cubesToHeights } from '../src/core/blockGeometry.js';
import { getProjection, mirrorProjection } from '../src/core/blockProjection.js';
import { STANDARD_DICE, byDirection } from '../src/core/cubeFaceLabels.js';
import { rotateOrientationSequence } from '../src/core/cubeOrientation.js';
import { DIRECTIONS, DIRECTION_VECTORS } from '../src/core/cubeRotations.js';
import { FACES } from '../src/core/cubeConstants.js';
import { createCubeModel } from '../src/three/cubeModel.js';
import { createHighlightManager } from '../src/three/cubeHighlight.js';
import { createOrientationState, createQuestionReveal } from '../src/three/cubeRotationAnimations.js';
import { AnimationManager } from '../src/three/animationManager.js';
import { InputLock } from '../src/core/inputLock.js';
import { createNetModel } from '../src/three/cubeNetModel.js';
import { makeCells } from '../src/core/cubeNet.js';
import { buildFoldTree } from '../src/core/cubeNetFolding.js';
import { createRng } from '../src/utils/random.js';

function fakeClock(start = 1000) {
  let t = start;
  const now = () => t;
  now.advance = (ms) => (t += ms);
  return now;
}

/** 正しい答え（判定に渡す形） */
function correctAnswer(q) {
  switch (q.mode) {
    case 'blockCount':
      return String(q.answer);
    case 'projectionDraw':
      return expectedGrid(q);
    case 'diceRoll':
      return q.answer;
    case 'netPartition':
      return { ...q.solution };
    default:
      throw new Error(q.mode);
  }
}
/** まちがった答え */
function wrongAnswer(q) {
  switch (q.mode) {
    case 'blockCount':
      return String(q.answer + 1);
    case 'projectionDraw':
      return expectedGrid(q).map((row) => row.map(() => false));
    case 'diceRoll':
      return (q.answer % 6) + 1;
    case 'netPartition':
      return Object.fromEntries(q.cells.map((c) => [c.id, 0]));
    default:
      throw new Error(q.mode);
  }
}

describe('LEVEL と難易度', () => {
  it('LEVEL 1 から始まり、正解 +1・不正解 −1・下限 1。「展開図に分けろ！」の正解だけ +2', () => {
    expect(TRIAL_RULES.startLevel).toBe(1);
    expect(levelAfter(1, true, 'blockCount')).toBe(2);
    expect(levelAfter(3, false, 'blockCount')).toBe(2);
    expect(levelAfter(1, false, 'diceRoll')).toBe(1);
    expect(levelAfter(5, true, 'netPartition')).toBe(7);
    expect(levelAfter(5, false, 'netPartition')).toBe(4);
    expect(TRIAL_MODES.map((m) => m.gain)).toEqual([1, 1, 1, 2]);
  });

  it('LEVEL 5 ごとに難易度が変わる（1〜5 ★、6〜10 ★★、11〜15 ★★★、16 以上 ★★★★）', () => {
    expect([1, 5, 6, 10, 11, 15, 16, 30, 100].map(difficultyForLevel)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 4]);
  });

  it('次の問題の難易度は、正解・不正解のあとの LEVEL で決める（5→6 で ★★、6→5 で ★、15→16 で ★★★★）', () => {
    const now = fakeClock();
    const s = new TrialSession({ mode: 'diceRoll', rng: createRng(1), now });
    const play = (correct) => {
      const q = s.nextQuestion();
      s.startAnswering();
      now.advance(1000);
      s.submit(correct ? correctAnswer(q) : wrongAnswer(q));
    };
    for (let i = 0; i < 4; i++) play(true);
    expect(s.level).toBe(5);
    expect(s.nextQuestion().difficulty).toBe(1);
    s.startAnswering();
    s.submit(s.state.currentQuestion.answer);
    expect(s.level).toBe(6);
    expect(s.nextQuestion().difficulty).toBe(2);
    s.startAnswering();
    s.submit(wrongAnswer(s.state.currentQuestion));
    expect(s.level).toBe(5);
    expect(s.nextQuestion().difficulty).toBe(1);
    s._state.level = 15;
    s.startAnswering();
    s.submit(correctAnswer(s.state.currentQuestion));
    expect(s.level).toBe(16);
    expect(s.nextQuestion().difficulty).toBe(4);
    s.startAnswering();
    s.submit(wrongAnswer(s.state.currentQuestion));
    expect(s.nextQuestion().difficulty).toBe(3);
  });

  it('最高到達 LEVEL は下がらない。正式な記録は最高到達 LEVEL（終了時の LEVEL ではない）', () => {
    const now = fakeClock();
    const s = new TrialSession({ mode: 'blockCount', rng: createRng(2), now });
    for (const correct of [true, true, true, false, false]) {
      const q = s.nextQuestion();
      s.startAnswering();
      s.submit(correct ? correctAnswer(q) : wrongAnswer(q));
    }
    expect(s.level).toBe(2);
    expect(s.highestLevel).toBe(4);
    const summary = s.finish();
    expect(summary).toMatchObject({ mode: 'blockCount', highestLevel: 4, finalLevel: 2, correctCount: 3, incorrectCount: 2, answeredCount: 5, aborted: false });
    const { records, bestUpdated } = recordTrialResult(createEmptyTrialRecords(), summary);
    expect(bestUpdated).toBe(true);
    expect(records.modes.blockCount.bestLevel).toBe(4);
  });

  it('挑戦を始めた時点で、最高到達 LEVEL は 1', () => {
    const s = new TrialSession({ mode: 'netPartition', rng: createRng(3), now: fakeClock() });
    expect(s.highestLevel).toBe(1);
    expect(s.getSummary().highestLevel).toBe(1);
  });
});

describe('90秒タイマー', () => {
  it('90秒から。回答できる間だけ減り、回答後の演出・次の問題を作る間は止まる（正解でも不正解でも）', () => {
    const now = fakeClock();
    const s = new TrialSession({ mode: 'blockCount', rng: createRng(4), now });
    expect(s.timer.getRemainingMs()).toBe(90000);
    const q1 = s.nextQuestion();
    now.advance(3000); // 問題を作る・表示する間
    expect(s.timer.getRemainingMs()).toBe(90000);
    s.startAnswering();
    now.advance(5000);
    expect(s.submit(correctAnswer(q1)).isCorrect).toBe(true);
    expect(s.timer.getRemainingMs()).toBe(85000);
    now.advance(8000); // 正解の演出
    expect(s.timer.getRemainingMs()).toBe(85000);
    const q2 = s.nextQuestion();
    now.advance(2000); // 問題の切りかえ
    s.startAnswering();
    now.advance(4000);
    expect(s.submit(wrongAnswer(q2)).isCorrect).toBe(false);
    now.advance(8000); // 不正解の演出も止まる
    expect(s.timer.getRemainingMs()).toBe(81000);
  });

  it('二重に回答できない。時間切れのあとの回答は受け付けない', () => {
    const now = fakeClock();
    const s = new TrialSession({ mode: 'diceRoll', rng: createRng(5), now });
    const q = s.nextQuestion();
    s.startAnswering();
    expect(s.submit(correctAnswer(q))).not.toBeNull();
    expect(s.submit(correctAnswer(q))).toBeNull();
    expect(s.state.answeredCount).toBe(1);
    const q2 = s.nextQuestion();
    s.startAnswering();
    now.advance(90000);
    expect(s.submit(correctAnswer(q2))).toBeNull();
    expect(s.isFinished).toBe(true);
    expect(s.state.answeredCount).toBe(1);
    expect(s.nextQuestion()).toBeNull();
  });

  it('タイマーは二重に止めても・再開してもずれない', () => {
    const now = fakeClock();
    const s = new TrialSession({ mode: 'blockCount', rng: createRng(6), now });
    s.nextQuestion();
    s.startAnswering();
    expect(s.startAnswering()).toBe(true);
    now.advance(1000);
    s.timer.pause();
    s.timer.pause();
    now.advance(5000);
    s.timer.resume();
    s.timer.resume();
    now.advance(1000);
    expect(s.timer.getRemainingMs()).toBe(88000);
  });

  it('中断した挑戦は記録しない', () => {
    const s = new TrialSession({ mode: 'blockCount', rng: createRng(7), now: fakeClock() });
    const q = s.nextQuestion();
    s.startAnswering();
    s.submit(correctAnswer(q));
    s.abort();
    const result = recordTrialResult(createEmptyTrialRecords(), s.getSummary());
    expect(result.recorded).toBe(false);
    expect(result.records.modes.blockCount).toMatchObject({ bestLevel: 0, attempts: 0 });
  });
});

describe('記録', () => {
  it('4種類それぞれに自己ベストを保存し、ほかの種類の記録は変わらない。低い LEVEL では下がらない', () => {
    let records = createEmptyTrialRecords();
    records = recordTrialResult(records, { mode: 'diceRoll', highestLevel: 9, aborted: false }).records;
    const lower = recordTrialResult(records, { mode: 'diceRoll', highestLevel: 5, aborted: false });
    expect(lower.bestUpdated).toBe(false);
    expect(lower.previousBest).toBe(9);
    records = lower.records;
    expect(records.modes.diceRoll).toMatchObject({ bestLevel: 9, attempts: 2 });
    expect(records.modes.blockCount).toMatchObject({ bestLevel: 0, attempts: 0 });
    expect(records.modes.netPartition).toMatchObject({ bestLevel: 0, attempts: 0 });
    // 同じ LEVEL は更新ではない
    expect(recordTrialResult(records, { mode: 'diceRoll', highestLevel: 9, aborted: false }).bestUpdated).toBe(false);
  });

  it('こわれた保存データは直す・捨てる', () => {
    expect(normalizeTrialRecords(null)).toEqual(createEmptyTrialRecords());
    expect(normalizeTrialRecords({ version: 99, modes: {} })).toEqual(createEmptyTrialRecords());
    const fixed = normalizeTrialRecords({ version: 1, modes: { blockCount: { bestLevel: -3, attempts: 'x' }, diceRoll: { bestLevel: 7, attempts: 2, lastPlayedAt: '2026-10-27T00:00:00Z' } } });
    expect(fixed.modes.blockCount).toMatchObject({ bestLevel: 0, attempts: 0 });
    expect(fixed.modes.diceRoll).toMatchObject({ bestLevel: 7, attempts: 2 });
  });
});

describe('① 積み木の数はいくつ？', () => {
  it.each([1, 2, 3, 4])('★%i：浮いた積み木がなく、見取図から個数がただ1つに決まり、大きさ・個数の制限を守る。答えは個数', (d) => {
    const level = BLOCK_COUNT_LEVELS[d];
    const rng = createRng(10 + d);
    for (let i = 0; i < 15; i++) {
      const q = generateTrialQuestion('blockCount', d, rng);
      expect(isGrounded(q.cubes)).toBe(true);
      expect(isCountDeterminedLarge(q.cubes)).toBe(true);
      const { width, height, depth } = getBlockBounds(q.cubes);
      expect(height).toBeLessThanOrEqual(level.maxHeight);
      expect(height).toBeGreaterThanOrEqual(level.minLayers);
      expect(level.bases.some(([w, dd]) => w === width && dd === depth)).toBe(true);
      expect(q.answer).toBe(q.cubes.length);
      expect(q.answer).toBe(cubesToHeights(q.cubes).flat().reduce((a, b) => a + b, 0));
      expect(q.answer).toBeGreaterThanOrEqual(level.minCubes);
      expect(q.answer).toBeLessThanOrEqual(level.maxCubes);
      expect(countBlocksByLayer(q.cubes).total).toBe(q.answer);
      if (level.hidden) expect(q.hidden.length).toBeGreaterThan(0);
      expect(checkTrialAnswer(q, String(q.answer)).isCorrect).toBe(true);
      expect(checkTrialAnswer(q, String(q.answer - 1)).isCorrect).toBe(false);
      expect(checkTrialAnswer(q, '').isCorrect).toBe(false);
    }
  });

  it('大きさの制限をゆるめた判定は、4 以下の積み木ではこれまでの判定と同じ', () => {
    const rng = createRng(3);
    for (let i = 0; i < 20; i++) {
      const q = generateTrialQuestion('blockCount', 2, rng);
      expect(isCountDeterminedLarge(q.cubes)).toBe(isCountDetermined(q.cubes));
    }
  });
});

describe('② 3方向から見ると？', () => {
  it.each([1, 2, 3, 4])('★%i：前・右・上の投影図が正しく、マス目に入る', (d) => {
    const rng = createRng(20 + d);
    const dirs = new Set();
    for (let i = 0; i < 15; i++) {
      const q = generateTrialQuestion('projectionDraw', d, rng);
      dirs.add(q.direction);
      expect(q.projection).toEqual(getProjection(q.cubes, q.direction));
      expect(q.grid.cols).toBeGreaterThan(q.projection.width);
      expect(q.grid.rows).toBeGreaterThanOrEqual(q.projection.height);
      expect(checkTrialAnswer(q, expectedGrid(q)).isCorrect).toBe(true);
    }
    expect(dirs.size).toBeGreaterThan(1);
  });

  it('左右への平行移動は正解。左右反転・上下の移動・何も塗らないのは不正解', () => {
    const rng = createRng(5);
    let checked = 0;
    for (let i = 0; i < 40 && checked < 8; i++) {
      const q = generateProjectionQuestion(2, rng, { direction: 'front' });
      const mirrored = mirrorProjection(q.projection);
      if (mirrored.cells.map((r) => r.join('')).join('/') === q.projection.cells.map((r) => r.join('')).join('/')) continue;
      checked++;
      const maxOffset = q.grid.cols - q.projection.width;
      for (let o = 0; o <= maxOffset; o++) expect(checkProjectionAnswer(q, expectedGrid(q, o)).isCorrect).toBe(true);
      // 左右反転
      const flipped = expectedGrid({ ...q, projection: mirrored });
      expect(checkProjectionAnswer(q, flipped).isCorrect).toBe(false);
      // 上下の移動（形を1段上にずらす）
      if (q.grid.rows > q.projection.height) {
        const up = expectedGrid(q);
        const shifted = [...up.slice(1), up[0].map(() => false)];
        expect(checkProjectionAnswer(q, shifted).isCorrect).toBe(false);
      }
      expect(checkProjectionAnswer(q, expectedGrid(q).map((r) => r.map(() => false))).isCorrect).toBe(false);
    }
    expect(checked).toBe(8);
  });

  it('答え合わせの印：合っている・足りない・よけいなマスを示す（ずれた位置に合わせる）', () => {
    const q = generateProjectionQuestion(1, createRng(8), { direction: 'top' });
    const grid = expectedGrid(q, 0);
    const [r, c] = [grid.findIndex((row) => row.some(Boolean)), 0];
    const filled = grid[r].indexOf(true);
    grid[r][filled] = false; // 1マス足りない
    const emptyCol = q.grid.cols - 1;
    grid[q.grid.rows - 1][emptyCol] = !grid[q.grid.rows - 1][emptyCol];
    const result = checkProjectionAnswer(q, grid);
    expect(result.isCorrect).toBe(false);
    expect(result.offset).toBe(0);
    expect(result.marks.flat()).toContain('missing');
    expect(result.marks[r][filled]).toBe('missing');
    expect(c).toBe(0);
  });
});

describe('③ サイコロを転がすと？', () => {
  it.each([1, 2, 3, 4])('★%i：転がす回数・方向転換。どの移動もとなりのマスへの90°の転がり。道は重ならず、サイコロに隠れない', (d) => {
    const level = DICE_ROLL_LEVELS[d];
    const rng = createRng(30 + d);
    for (let i = 0; i < 20; i++) {
      const q = generateTrialQuestion('diceRoll', d, rng);
      expect(level.moves).toContain(q.moves.length);
      expect(q.cells).toHaveLength(q.moves.length + 1);
      const turns = q.moves.slice(1).filter((m, k) => m !== q.moves[k]).length;
      expect(turns).toBeGreaterThanOrEqual(level.minTurns);
      q.moves.forEach((m, k) => {
        const [di, dk] = ROLL_STEPS[m];
        expect([q.cells[k][0] + di, q.cells[k][1] + dk]).toEqual(q.cells[k + 1]);
      });
      expect(new Set(q.cells.map((c) => c.join())).size).toBe(q.cells.length);
      for (const c of q.cells.slice(1)) expect(isHiddenByDice(q.cells[0], c)).toBe(false);
      // 回転後の上面
      const end = rotateOrientationSequence(q.pose, q.moves);
      expect(q.answer).toBe(byDirection(STANDARD_DICE, end).top);
      expect(rollPoses(q.pose, q.moves).at(-1)).toEqual(end);
      expect(checkTrialAnswer(q, q.answer).isCorrect).toBe(true);
      expect(checkTrialAnswer(q, (q.answer % 6) + 1).isCorrect).toBe(false);
    }
  });

  it('見えている上・前・右の目と「和が7」から、6面すべての目がただ1つに決まり、出題したサイコロと一致する', () => {
    const rng = createRng(9);
    for (let i = 0; i < 20; i++) {
      const q = generateTrialQuestion('diceRoll', 2, rng);
      expect(diceFromVisible(q.visible)).toEqual(byDirection(STANDARD_DICE, q.pose));
      expect(Object.values(q.faces).sort()).toEqual([1, 2, 3, 4, 5, 6]);
    }
  });

  it('3D の転がる演出の最後の向きが、数学の結果と一致する', () => {
    const model = createCubeModel({ labels: false });
    const state = createOrientationState(model.root);
    const manager = new AnimationManager({ inputLock: new InputLock() });
    const highlights = createHighlightManager(model);
    let dir = [4, 3, 5];
    const controls = { setHomeDirection: () => {}, resetCamera: () => (dir = [4, 3, 5]), getViewDirection: () => dir, setViewDirection: (d) => (dir = d), lockInput: () => {}, unlockInput: () => {} };
    const rng = createRng(12);
    const directionOf = (faceId) => {
      model.root.updateMatrixWorld(true);
      const n = new THREE.Vector3(...FACES.find((f) => f.id === faceId).normal).applyQuaternion(model.root.quaternion);
      return DIRECTIONS.find((dd) => new THREE.Vector3(...DIRECTION_VECTORS[dd]).distanceTo(n) < 1e-6);
    };
    for (let i = 0; i < 5; i++) {
      const q = generateTrialQuestion('diceRoll', 3, rng);
      state.set(q.pose);
      const anim = createQuestionReveal({ state, controls, highlights }, { orientation: q.pose, steps: [{ type: 'rotate', moves: q.moves }] });
      manager.play(anim);
      for (let t = 0; manager.isActive() && t < 60000; t += 50) manager.tick(t);
      const end = rotateOrientationSequence(q.pose, q.moves);
      expect(state.orientation).toEqual(end);
      expect(DIRECTIONS.every((dd) => directionOf(end[dd]) === dd)).toBe(true);
      // 上の面の目が答え
      expect(STANDARD_DICE[end.top]).toBe(q.answer);
    }
    model.dispose();
  });
});

describe('④ 展開図に分けろ！', () => {
  it.each([1, 2, 3, 4])('★%i：展開図の数（2〜5）×6マス。つながっていて重ならず、お手本の分け方がある', (d) => {
    const level = NET_PARTITION_LEVELS[d];
    const rng = createRng(40 + d);
    for (let i = 0; i < 10; i++) {
      const q = generateTrialQuestion('netPartition', d, rng);
      expect(q.netCount).toBe(d + 1);
      expect(q.cells).toHaveLength(6 * q.netCount);
      expect(new Set(q.cells.map((c) => `${c.x},${c.y}`)).size).toBe(q.cells.length);
      expect(q.width).toBeLessThanOrEqual(level.maxWidth);
      expect(q.height).toBeLessThanOrEqual(level.maxHeight);
      const all = makeCells(q.cells.map((c) => [c.x, c.y]));
      expect(isCubeNetPiece(all.slice(0, 6))).toBeTypeOf('boolean');
      // お手本：各色ちょうど6マス・つながる・展開図
      expect(checkNetPartitionAnswer(q, q.solution).isCorrect).toBe(true);
      for (const piece of q.pieces) expect(isCubeNetPiece(piece)).toBe(true);
    }
  });

  it('色の番号を入れかえても正解。お手本とちがう有効な分け方も正解', () => {
    const q = generateTrialQuestion('netPartition', 2, createRng(50));
    const swapped = Object.fromEntries(Object.entries(q.solution).map(([id, c]) => [id, 4 - c]));
    expect(checkNetPartitionAnswer(q, swapped).isCorrect).toBe(true);
    // 2つの十字の展開図を左右に並べた図形：真ん中で分けるのがお手本。別の有効な分け方（左右を入れかえた番号）も正解
    const cells = makeCells([[1, 0], [0, 1], [1, 1], [2, 1], [1, 2], [1, 3], [3, 0], [3, 1], [4, 1], [5, 1], [4, 2], [4, 3]].map(([x, y]) => [x, y]));
    const at = (x, y) => cells.find((c) => c.x === x && c.y === y).id;
    const solution = Object.fromEntries(cells.map((c) => [c.id, c.x <= 2 && !(c.x === 2 && c.y === 0) ? 0 : 1]));
    const custom = { netCount: 2, cells, solution };
    expect(checkNetPartitionAnswer(custom, solution).isCorrect).toBe(true);
    // 別の分け方：(2,1) を右の色に、(3,0) を…という入れかえは展開図にならないので不正解
    const broken = { ...solution, [at(2, 1)]: 1, [at(3, 0)]: 0 };
    expect(checkNetPartitionAnswer(custom, broken).isCorrect).toBe(false);
  });

  it('不正解の理由：ぬっていないマス・色の数・6マスでない・はなれている・展開図にならない', () => {
    const q = generateTrialQuestion('netPartition', 1, createRng(60));
    const ids = q.cells.map((c) => c.id);
    expect(checkNetPartitionAnswer(q, { ...q.solution, [ids[0]]: null }).reason).toBe('unpainted');
    expect(checkNetPartitionAnswer(q, Object.fromEntries(ids.map((id) => [id, 0]))).reason).toBe('colors');
    // 3色に分ける（数が合わない）
    const three = { ...q.solution, [ids[0]]: 2 };
    expect(['colors', 'size']).toContain(checkNetPartitionAnswer(q, three).reason);
    // 6マスでない展開図（7マス・5マス）
    const pieceOf = (id) => q.solution[id];
    const other = ids.find((id) => pieceOf(id) !== pieceOf(ids[0]));
    expect(checkNetPartitionAnswer(q, { ...q.solution, [other]: pieceOf(ids[0]) }).reason).toBe('size');
  });

  it('6マスでも、展開図にならない形（2×3）・はなれた形は不正解', () => {
    expect(isCubeNetPiece([[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]].map(([x, y]) => ({ x, y })))).toBe(false);
    expect(isCubeNetPiece([[0, 0], [0, 1], [0, 2], [0, 3], [1, 1], [3, 3]].map(([x, y]) => ({ x, y })))).toBe(false);
    expect(isCubeNetPiece([[1, 0], [0, 1], [1, 1], [2, 1], [1, 2], [1, 3]].map(([x, y]) => ({ x, y })))).toBe(true);
  });

  it('同じ色で7マス以上はぬれない（ぬってある色の上から同じ色はよい）', () => {
    const coloring = { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0, g: null, h: 1 };
    expect(MAX_CELLS_PER_COLOR).toBe(6);
    expect(canPaintColor(coloring, 0, 'g')).toBe(false);
    expect(canPaintColor(coloring, 0, 'a')).toBe(true);
    expect(canPaintColor(coloring, 1, 'g')).toBe(true);
    expect(canPaintColor(coloring, null, 'a')).toBe(true);
  });

  it('折りたたみの 3D（大きさ・位置を変えない展開図）は、分けた6マスがそれぞれ立方体になる', () => {
    const q = generateTrialQuestion('netPartition', 3, createRng(70));
    for (const piece of q.pieces) {
      const cells = makeCells(piece.map((c) => [c.x, c.y]));
      const model = createNetModel();
      model.set({ cells, noFit: true });
      // 平らなとき：根もとのマスからの位置が、図形の中の位置のまま（1マス = 2）
      const root = cells.find((c) => c.id === buildFoldTree(cells).root);
      for (const c of cells) {
        const { center } = model.getPanelPose(c.id);
        expect(center.x).toBeCloseTo(2 * (c.x - root.x), 6);
        expect(center.z).toBeCloseTo(2 * (c.y - root.y), 6);
      }
      model.setProgress(1);
      const normals = cells.map((c) => model.getPanelPose(c.id).center).map((v) => [Math.round(v.x), Math.round(v.y), Math.round(v.z)].join());
      expect(new Set(normals)).toEqual(new Set(['1,0,0', '-1,0,0', '0,1,0', '0,-1,0', '0,0,1', '0,0,-1']));
      model.dispose();
    }
  });
});

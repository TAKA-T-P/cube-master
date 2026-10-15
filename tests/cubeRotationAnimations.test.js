// 回転アニメーションと 3D の向きの同期（WebGL を使わず、シーングラフの状態だけを検証する）
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { createCubeModel } from '../src/three/cubeModel.js';
import { createHighlightManager } from '../src/three/cubeHighlight.js';
import { createFaceDecorations } from '../src/three/faceDecoration.js';
import { AnimationManager } from '../src/three/animationManager.js';
import { createOrientationState, createTurnSequence, createQuestionReveal, orientationToQuaternion } from '../src/three/cubeRotationAnimations.js';
import { InputLock } from '../src/core/inputLock.js';
import { INITIAL_ORIENTATION, ALL_ORIENTATIONS, rotateOrientation, rotateOrientationSequence } from '../src/core/cubeOrientation.js';
import { DIRECTIONS, DIRECTION_VECTORS, MOVE_IDS } from '../src/core/cubeRotations.js';
import { FACES } from '../src/core/cubeConstants.js';
import { numberFaces, STANDARD_DICE } from '../src/core/cubeFaceLabels.js';

/** 3D モデルで、面 faceId がいま向いている方向（ワールド座標の法線から求める） */
function worldDirectionOf(root, faceId) {
  root.updateMatrixWorld(true);
  const n = new THREE.Vector3(...FACES.find((f) => f.id === faceId).normal).applyQuaternion(root.quaternion);
  return DIRECTIONS.find((d) => new THREE.Vector3(...DIRECTION_VECTORS[d]).distanceTo(n) < 1e-6);
}
/** 3D モデルの向きが数学上の向きと一致するか */
const matches3D = (root, orientation) => DIRECTIONS.every((d) => worldDirectionOf(root, orientation[d]) === d);

/** 時間を進めてアニメーションを最後まで再生する */
function runToEnd(manager, from = 0) {
  for (let t = from; manager.isActive() && t < 60000; t += 50) manager.tick(t);
}

describe('立方体の向きと 3D の同期', () => {
  let model;
  let state;
  let manager;
  let inputLock;

  beforeEach(() => {
    model = createCubeModel({ labels: false });
    state = createOrientationState(model.root);
    inputLock = new InputLock();
    manager = new AnimationManager({ inputLock });
  });

  afterEach(() => model.dispose());

  it('24通りの向きを設定すると、3D の面の向きが数学上の向きと一致する', () => {
    for (const o of ALL_ORIENTATIONS) {
      state.set(o);
      expect(matches3D(model.root, o)).toBe(true);
    }
  });

  it.each(MOVE_IDS)('%s：回転アニメーション後の 3D 状態が数学上の回転と一致する', async (move) => {
    for (const start of [INITIAL_ORIENTATION, ALL_ORIENTATIONS[7], ALL_ORIENTATIONS[19]]) {
      state.set(start);
      const done = manager.play(createTurnSequence(state, [move]));
      runToEnd(manager);
      await expect(done).resolves.toEqual({ status: 'completed' });
      const expected = rotateOrientation(start, move);
      expect(state.orientation).toEqual(expected);
      expect(matches3D(model.root, expected)).toBe(true);
      expect(model.root.position.y).toBe(0); // 転がる演出の持ち上げは最後に戻る
      expect(inputLock.isLocked()).toBe(false);
    }
  });

  it('途中の 3D の回転は、回転軸のとおりに少しずつ進む', () => {
    state.set(INITIAL_ORIENTATION);
    manager.play(createTurnSequence(state, ['right'], { durationPerTurn: 800 }));
    manager.tick(0);
    manager.tick(200);
    manager.tick(400); // 半分
    const angle = model.root.quaternion.angleTo(new THREE.Quaternion());
    expect(angle).toBeCloseTo(Math.PI / 4, 1);
    expect(model.root.position.y).toBeGreaterThan(0.3); // 支点の辺を中心に転がるので中心が持ち上がる
    manager.cancel();
  });

  it('3回の連続回転：各段階の向きが正しく、最後の向きも一致する', async () => {
    const moves = ['right', 'forward', 'left'];
    const seen = [];
    state.set(INITIAL_ORIENTATION);
    const anim = createTurnSequence(state, moves, { onUpdate: () => seen.push(state.orientation) });
    const done = manager.play(anim);
    runToEnd(manager);
    await done;
    const expected = rotateOrientationSequence(INITIAL_ORIENTATION, moves);
    expect(state.orientation).toEqual(expected);
    expect(matches3D(model.root, expected)).toBe(true);
    // 途中で、1回目・2回目のあとの向きを通っている
    const keys = seen.map((o) => o.top + o.front);
    for (const k of [1, 2]) {
      const mid = rotateOrientationSequence(INITIAL_ORIENTATION, moves.slice(0, k));
      expect(keys).toContain(mid.top + mid.front);
    }
  });

  it('スキップで最終の向きに、キャンセルで再生前の向きに戻り、操作ロックが残らない', async () => {
    state.set(INITIAL_ORIENTATION);
    let done = manager.play(createTurnSequence(state, ['right', 'forward']));
    manager.tick(0);
    manager.tick(300);
    manager.skip();
    await expect(done).resolves.toEqual({ status: 'skipped' });
    const final = rotateOrientationSequence(INITIAL_ORIENTATION, ['right', 'forward']);
    expect(state.orientation).toEqual(final);
    expect(matches3D(model.root, final)).toBe(true);

    done = manager.play(createTurnSequence(state, ['turnLeft']));
    manager.tick(0);
    manager.tick(300);
    expect(inputLock.isLocked()).toBe(true);
    manager.cancel();
    await expect(done).resolves.toEqual({ status: 'cancelled' });
    expect(state.orientation).toEqual(final);
    expect(matches3D(model.root, final)).toBe(true);
    expect(inputLock.isLocked()).toBe(false);
  });

  it('1000回の回転でも 3D の向きがずれない', () => {
    let o = INITIAL_ORIENTATION;
    for (let i = 0; i < 1000; i++) {
      o = rotateOrientation(o, MOVE_IDS[(i * 7) % 6]);
      state.set(o);
    }
    expect(matches3D(model.root, o)).toBe(true);
    expect(model.root.quaternion.angleTo(orientationToQuaternion(o))).toBeLessThan(1e-9);
  });
});

describe('正解演出（回転・視点移動）', () => {
  let model;
  let state;
  let manager;
  let highlights;
  let controls;

  beforeEach(() => {
    model = createCubeModel({ labels: false });
    state = createOrientationState(model.root);
    highlights = createHighlightManager(model);
    manager = new AnimationManager({ inputLock: new InputLock() });
    let dir = [4, 3, 5];
    controls = {
      setHomeDirection: vi.fn(),
      resetCamera: vi.fn(() => (dir = [4, 3, 5])),
      getViewDirection: vi.fn(() => dir),
      setViewDirection: vi.fn((d) => (dir = d)),
    };
  });

  afterEach(() => {
    highlights.dispose();
    model.dispose();
  });

  const reveal = (spec) => createQuestionReveal({ state, controls, highlights }, spec);

  it('はじめの向きに戻してから回転し、正解の面を緑で示す。リプレイしても重ならない', async () => {
    const start = ALL_ORIENTATIONS[5];
    const spec = { orientation: start, cameraPreset: 'default', steps: [{ type: 'rotate', moves: ['right', 'backward'] }], wrong: ['ABCD'], correct: ['AB', 'BC'] };
    state.set(ALL_ORIENTATIONS[9]); // 別の向きになっていても…
    let done = manager.play(reveal(spec));
    manager.tick(0);
    expect(state.orientation).toEqual(start); // …最初にはじめの向きへ戻る
    expect(controls.resetCamera).toHaveBeenCalledWith({ animate: false });
    runToEnd(manager, 50);
    await done;
    const final = rotateOrientationSequence(start, ['right', 'backward']);
    expect(state.orientation).toEqual(final);
    expect(highlights.getHighlighted('correct')).toEqual(['AB', 'BC']);
    expect(highlights.getHighlighted('wrong')).toEqual(['ABCD']);

    // リプレイ → スキップ：同じ最終状態、強調は増えない
    done = manager.play(reveal(spec));
    manager.skip();
    await expect(done).resolves.toEqual({ status: 'skipped' });
    expect(state.orientation).toEqual(final);
    expect(model.groups.highlightsGroup.children).toHaveLength(3);

    // 途中でキャンセル（次の問題へ）→ はじめの向きに戻る
    done = manager.play(reveal(spec));
    manager.tick(0);
    manager.tick(500);
    manager.cancel();
    await expect(done).resolves.toEqual({ status: 'cancelled' });
    expect(state.orientation).toEqual(start);
  });

  it('視点移動の演出は、カメラを指定の方向へ動かす', async () => {
    const done = manager.play(reveal({ orientation: INITIAL_ORIENTATION, cameraPreset: [4, 3, 5], steps: [{ type: 'camera', direction: [0, 1, 0.05] }] }));
    runToEnd(manager);
    await done;
    const last = controls.setViewDirection.mock.calls.at(-1)[0];
    const v = new THREE.Vector3(...last).normalize();
    expect(v.distanceTo(new THREE.Vector3(0, 1, 0.05).normalize())).toBeLessThan(1e-6);
  });
});

describe('面の装飾', () => {
  it('各面に装飾の板を置き、立方体と一緒に回転する。null でふつうの立方体に戻る', () => {
    const model = createCubeModel({ labels: false });
    const decorations = createFaceDecorations(model);
    const faces = numberFaces(STANDARD_DICE);
    decorations.set(faces);
    expect(decorations.group.visible).toBe(true);
    expect(decorations.group.parent).toBe(model.root); // root の子なので一緒に回る
    for (const f of FACES) {
      const mesh = decorations.getMesh(f.id);
      expect(mesh.userData.decoration.value).toBe(STANDARD_DICE[f.id]);
      expect(mesh.position.clone().normalize().toArray().map(Math.round)).toEqual([...f.normal]);
    }
    // 回転させても、数字の板は同じ面の上にある
    const state = createOrientationState(model.root);
    const o = rotateOrientation(INITIAL_ORIENTATION, 'right');
    state.set(o);
    model.root.updateMatrixWorld(true);
    const topMesh = decorations.getMesh(o.top);
    const pos = topMesh.getWorldPosition(new THREE.Vector3());
    expect(pos.y).toBeGreaterThan(0.9);
    expect(topMesh.userData.decoration.value).toBe(STANDARD_DICE.DAEH); // 左にあった 4 が上に

    decorations.set(null);
    expect(decorations.group.visible).toBe(false);
    expect(decorations.group.children).toHaveLength(0);
    decorations.dispose();
    model.dispose();
  });
});

// 展開図の 3D モデルと折りたたみアニメーション（WebGL を使わず、シーングラフの状態だけを検証する）
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { createNetModel } from '../src/three/cubeNetModel.js';
import { createCubeModel } from '../src/three/cubeModel.js';
import { createHighlightManager } from '../src/three/cubeHighlight.js';
import { AnimationManager, tween } from '../src/three/animationManager.js';
import { createOrientationState, createQuestionReveal } from '../src/three/cubeRotationAnimations.js';
import { InputLock } from '../src/core/inputLock.js';
import { CUBE_NETS } from '../src/core/cubeNetCatalog.js';
import { foldNet } from '../src/core/cubeNetFolding.js';
import { distinctOrientations, parseNet, makeCells } from '../src/core/cubeNet.js';
import { getNetMapping, getCoincidentPoints } from '../src/core/cubeNetMapping.js';
import { FACES } from '../src/core/cubeConstants.js';

const v3 = (a) => new THREE.Vector3(...a);
const CROSS = parseNet(['.#..', '####', '.#..']);

describe('展開図の 3D モデル', () => {
  it('11種類すべて、折りたたむと6面が立方体の正しい位置・向きにくる（数学の計算と一致）', () => {
    const model = createNetModel();
    for (const net of CUBE_NETS) {
      const cells = makeCells(distinctOrientations(net.cells)[1].map((c) => [c.x, c.y]));
      model.set({ cells });
      model.setProgress(1);
      const fold = foldNet(cells);
      const centers = new Set();
      for (const c of cells) {
        const pose = model.getPanelPose(c.id);
        expect(pose.center.distanceTo(v3(fold.frames[c.id].center))).toBeLessThan(1e-9);
        expect(pose.normal.distanceTo(v3(fold.frames[c.id].outward))).toBeLessThan(1e-9);
        centers.add(pose.center.toArray().map((n) => Math.round(n)).join(','));
      }
      // 6つの面の中心は立方体の6面の中心
      expect([...centers].sort()).toEqual(FACES.map((f) => f.normal.join(',')).sort());
    }
    model.dispose();
  });

  it('平らなとき（progress = 0）は、すべてのパネルが同じ平面で上を向く', () => {
    const model = createNetModel();
    model.set({ cells: CROSS });
    const ys = CROSS.map((c) => model.getPanelPose(c.id).center.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(1e-9);
    for (const c of CROSS) expect(model.getPanelPose(c.id).normal.y).toBeCloseTo(1, 9);
    model.dispose();
  });

  it('逆再生（1 → 0）で、展開図の位置にぴったり戻る', () => {
    const model = createNetModel();
    model.set({ cells: CROSS });
    const flat = Object.fromEntries(CROSS.map((c) => [c.id, model.getPanelPose(c.id).center.clone()]));
    model.setProgress(1);
    model.setProgress(0.37);
    model.setProgress(0);
    for (const c of CROSS) expect(model.getPanelPose(c.id).center.distanceTo(flat[c.id])).toBeLessThan(1e-9);
    model.dispose();
  });

  it('重なる点の印は、折りたたむと同じ位置に集まる', () => {
    const model = createNetModel();
    const m = getNetMapping(CROSS);
    const target = [...m.points.values()].find((p) => p.boundary && getCoincidentPoints(m, p.key).length >= 2).key;
    const keys = [target, ...getCoincidentPoints(m, target)];
    model.set({ cells: CROSS, points: keys.map((k) => ({ x: Number(k.split(',')[0]), y: Number(k.split(',')[1]) })) });
    const flat = model.getMarkerPositions();
    expect(flat[keys[0]].distanceTo(flat[keys[1]])).toBeGreaterThan(0.5); // 平らなときははなれている
    model.setProgress(1);
    const folded = model.getMarkerPositions();
    // 印は面から少し浮かせているので、面の向きの差の分（約 0.08）だけずれるが、印の半径 0.13 以内で重なる
    for (const k of keys.slice(1)) expect(folded[k].distanceTo(folded[keys[0]])).toBeLessThan(0.13);
    model.dispose();
  });

  it('null で消える（次の問題に前の展開図が残らない）', () => {
    const model = createNetModel();
    model.set({ cells: CROSS });
    model.set(null);
    expect(model.root.visible).toBe(false);
    expect(model.getPanelPose(CROSS[0].id)).toBeNull();
    model.dispose();
  });
});

describe('折りたたみの演出', () => {
  function setup() {
    const cube = createCubeModel({ labels: false });
    const state = createOrientationState(cube.root);
    const highlights = createHighlightManager(cube);
    const net = createNetModel();
    const inputLock = new InputLock();
    const manager = new AnimationManager({ inputLock });
    let dir = [0, 6, 3.5];
    const controls = {
      setHomeDirection: vi.fn(),
      resetCamera: vi.fn(() => (dir = [0, 6, 3.5])),
      getViewDirection: () => dir,
      setViewDirection: vi.fn((d) => (dir = d)),
    };
    return { state, highlights, net, inputLock, manager, controls };
  }
  const run = (manager) => {
    for (let t = 0; manager.isActive() && t < 60000; t += 50) manager.tick(t);
  };
  const steps = [
    { type: 'pause', ms: 300 },
    { type: 'fold', to: 1, duration: 2400 },
    { type: 'camera', direction: [4, 3, 5] },
  ];

  it('展開図から始まって立方体が完成し、リプレイは必ず展開図から、スキップは完成状態', async () => {
    const { state, highlights, net, inputLock, manager, controls } = setup();
    net.set({ cells: CROSS });
    net.setProgress(1);
    let done = manager.play(createQuestionReveal({ state, controls, highlights, net }, { steps }));
    manager.tick(0);
    expect(net.getProgress()).toBe(0); // 始めに展開図に戻す
    run(manager);
    await done;
    expect(net.getProgress()).toBe(1);
    expect(inputLock.isLocked()).toBe(false);

    done = manager.play(createQuestionReveal({ state, controls, highlights, net }, { steps }));
    manager.skip();
    await expect(done).resolves.toEqual({ status: 'skipped' });
    expect(net.getProgress()).toBe(1);
  });

  it('途中でキャンセルしても操作ロックが残らない', async () => {
    const { state, highlights, net, inputLock, manager, controls } = setup();
    net.set({ cells: CROSS });
    const done = manager.play(createQuestionReveal({ state, controls, highlights, net }, { steps }));
    manager.tick(0);
    manager.tick(800);
    expect(inputLock.isLocked()).toBe(true);
    manager.cancel();
    await expect(done).resolves.toEqual({ status: 'cancelled' });
    expect(inputLock.isLocked()).toBe(false);
  });

  it('「展開図に戻す」の逆再生（1 → 0）', async () => {
    const { net, manager } = setup();
    net.set({ cells: CROSS });
    net.setProgress(1);
    const done = manager.play(tween({ duration: 1000, onUpdate: (t) => net.setProgress(1 - t) }));
    run(manager);
    await done;
    expect(net.getProgress()).toBe(0);
  });
});

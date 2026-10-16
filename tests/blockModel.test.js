// 積み木の 3D モデルと正解演出（WebGL を使わず、シーングラフの状態だけを検証する）
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { createBlockModel } from '../src/three/blockModel.js';
import { createCubeModel } from '../src/three/cubeModel.js';
import { createHighlightManager } from '../src/three/cubeHighlight.js';
import { AnimationManager } from '../src/three/animationManager.js';
import { createOrientationState, createQuestionReveal } from '../src/three/cubeRotationAnimations.js';
import { InputLock } from '../src/core/inputLock.js';
import { INITIAL_ORIENTATION } from '../src/core/cubeOrientation.js';
import { heightsToCubes, cubeKey } from '../src/core/blockGeometry.js';
import { PROJECTION_TEMPLATES, STRAIGHT_VIEWS } from '../src/questions/projection/projectionGenerators.js';
import { createRng } from '../src/utils/random.js';

const cubes = heightsToCubes([
  [2, 1, 0],
  [1, 3, 2],
]);

describe('積み木の 3D モデル', () => {
  it('配置データと同じ位置に小立方体を置き、見る向きの矢印をつける', () => {
    const blocks = createBlockModel();
    blocks.set(cubes, { arrows: ['front'] });
    expect(blocks.root.visible).toBe(true);
    expect(blocks.getCubes()).toEqual(cubes);
    for (const c of cubes) {
      const mesh = blocks.getMesh(c);
      expect(mesh.position.toArray()).toEqual([c.x + 0.5, c.y + 0.5, c.z + 0.5]);
      expect(mesh.userData.cube).toEqual(c);
    }
    expect(blocks.getArrowCount()).toBe(1);
    // 全体が単一の立方体と同じくらいの大きさに収まる
    blocks.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(blocks.root);
    expect(box.getSize(new THREE.Vector3()).length() / 2).toBeLessThan(2.2);
    blocks.dispose();
  });

  it('列の強調と解除、null で消す（次の問題に前の積み木が残らない）', () => {
    const blocks = createBlockModel();
    blocks.set(cubes, { arrows: ['right', 'top'] });
    expect(blocks.getArrowCount()).toBe(2);
    const column = cubes.filter((c) => c.x === 1);
    blocks.highlight(column);
    for (const c of cubes) expect(blocks.isHighlighted(c)).toBe(column.some((k) => cubeKey(k) === cubeKey(c)));
    blocks.clearHighlights();
    expect(cubes.some((c) => blocks.isHighlighted(c))).toBe(false);
    blocks.set(heightsToCubes([[1, 1]]));
    expect(blocks.getCubes()).toHaveLength(2);
    expect(blocks.getArrowCount()).toBe(0);
    blocks.set(null);
    expect(blocks.root.visible).toBe(false);
    expect(blocks.getCubes()).toEqual([]);
    blocks.dispose();
  });
});

describe('積み木の正解演出', () => {
  function setup() {
    const model = createCubeModel({ labels: false });
    const state = createOrientationState(model.root);
    const highlights = createHighlightManager(model);
    const blocks = createBlockModel();
    const manager = new AnimationManager({ inputLock: new InputLock() });
    let dir = [4, 5, 6];
    const controls = {
      setHomeDirection: vi.fn(),
      resetCamera: vi.fn(() => (dir = [4, 5, 6])),
      getViewDirection: vi.fn(() => dir),
      setViewDirection: vi.fn((d) => (dir = d)),
    };
    return { model, state, highlights, blocks, manager, controls, view: () => new THREE.Vector3(...dir).normalize() };
  }
  const run = (manager) => {
    for (let t = 0; manager.isActive() && t < 60000; t += 50) manager.tick(t);
  };

  it('カメラが矢印の方向へ動き、列を強調する。リプレイで初めに戻り、スキップで最終状態', async () => {
    const { model, state, highlights, blocks, manager, controls, view } = setup();
    const q = PROJECTION_TEMPLATES.find((t) => t.id === 'V04').build({ key: 'right-0', refs: [], dir: 'right' }, createRng(3));
    blocks.set(q.scene.blocks, { arrows: q.scene.arrows });
    const spec = { orientation: INITIAL_ORIENTATION, cameraPreset: q.scene.cameraPreset, steps: q.explanation.reveal.steps };
    const column = q.explanation.reveal.steps.find((s) => s.type === 'highlightBlocks').cubes;

    let done = manager.play(createQuestionReveal({ state, controls, highlights, blocks }, spec));
    run(manager);
    await done;
    expect(view().distanceTo(new THREE.Vector3(...STRAIGHT_VIEWS.right).normalize())).toBeLessThan(1e-6);
    for (const c of column) expect(blocks.isHighlighted(c)).toBe(true);

    // リプレイ：最初に視点を戻し、強調も消してから始める
    done = manager.play(createQuestionReveal({ state, controls, highlights, blocks }, spec));
    manager.tick(0);
    expect(controls.resetCamera).toHaveBeenLastCalledWith({ animate: false });
    expect(column.some((c) => blocks.isHighlighted(c))).toBe(false);
    manager.skip();
    await expect(done).resolves.toEqual({ status: 'skipped' });
    for (const c of column) expect(blocks.isHighlighted(c)).toBe(true);
    expect(view().distanceTo(new THREE.Vector3(...STRAIGHT_VIEWS.right).normalize())).toBeLessThan(1e-6);

    blocks.dispose();
    highlights.dispose();
    model.dispose();
  });

  it('真上から見る演出：カメラの向きが上面図の向き（手前が下）になる', async () => {
    const { state, highlights, blocks, manager, controls, view } = setup();
    blocks.set(cubes, { arrows: ['top'] });
    const done = manager.play(createQuestionReveal({ state, controls, highlights, blocks }, { steps: [{ type: 'camera', direction: STRAIGHT_VIEWS.top }] }));
    run(manager);
    await done;
    const v = view();
    expect(v.y).toBeGreaterThan(0.99);
    expect(v.z).toBeGreaterThan(0); // わずかに手前側から見下ろす → 図の下が手前
  });
});

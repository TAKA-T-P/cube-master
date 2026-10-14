// @vitest-environment jsdom
// Raycaster による選択とカメラ操作の検証（WebGL レンダラーを使わず、カメラとシーングラフだけで計算する）
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { createCubeModel, FACE_DISPLAY_MODES } from '../src/three/cubeModel.js';
import { createCubeSelection } from '../src/three/cubeSelection.js';
import { createCubeControls, DEFAULT_VIEW_DIRECTION } from '../src/three/cubeControls.js';
import { SelectionState } from '../src/core/selectionState.js';
import { InputLock } from '../src/core/inputLock.js';

const SIZE = 600;

/** レンダラーなしの sceneManager 相当 */
function createFakeSceneManager() {
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  const canvas = document.createElement('canvas');
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: SIZE, height: SIZE, right: SIZE, bottom: SIZE });
  document.body.append(canvas);
  const updaters = new Set();
  const resizeListeners = new Set();
  return {
    camera,
    canvas,
    requestRender: vi.fn(),
    getSize: () => ({ width: SIZE, height: SIZE, aspect: 1 }),
    onResize: (fn) => (resizeListeners.add(fn), () => resizeListeners.delete(fn)),
    addUpdater: (fn) => (updaters.add(fn), () => updaters.delete(fn)),
    /** 描画ループ1フレーム分 */
    frame(time) {
      for (const fn of updaters) fn(time);
      camera.updateMatrixWorld();
    },
  };
}

function screenPos(object, camera) {
  const p = object.getWorldPosition(new THREE.Vector3()).project(camera);
  return { x: ((p.x + 1) / 2) * SIZE, y: ((1 - p.y) / 2) * SIZE };
}

describe('Raycaster による選択', () => {
  let sm;
  let model;
  let selection;
  let picker;
  let inputLock;

  beforeEach(() => {
    sm = createFakeSceneManager();
    sm.camera.position.set(...DEFAULT_VIEW_DIRECTION);
    sm.camera.lookAt(0, 0, 0);
    sm.camera.updateMatrixWorld();
    model = createCubeModel({ labels: false });
    model.root.updateMatrixWorld(true);
    selection = new SelectionState();
    inputLock = new InputLock();
    picker = createCubeSelection({ sceneManager: sm, model, selection, inputLock });
  });

  afterEach(() => {
    picker.dispose();
    model.dispose();
    sm.canvas.remove();
  });

  const pickAt = (id) => {
    const { x, y } = screenPos(model.getElement(id).mesh, sm.camera);
    return picker.pick(x, y);
  };

  it('見えている頂点・辺・面を正しい ID で選べる', () => {
    picker.setMode('vertex');
    for (const id of ['A', 'B', 'C', 'E', 'F', 'G', 'H']) expect(pickAt(id)).toBe(id);
    picker.setMode('edge');
    for (const id of ['AB', 'BC', 'EF', 'FG', 'GH', 'HE', 'AE', 'BF', 'CG']) expect(pickAt(id)).toBe(id);
    picker.setMode('face');
    for (const id of ['ABFE', 'BCGF', 'EFGH']) expect(pickAt(id)).toBe(id);
  });

  it('不透明のときは裏に隠れた頂点・辺を選べず、半透明なら選べる', () => {
    picker.setMode('vertex');
    expect(pickAt('D')).toBeNull();
    picker.setMode('edge');
    for (const id of ['CD', 'DA']) expect(pickAt(id)).toBeNull();
    model.setFaceDisplayMode(FACE_DISPLAY_MODES.TRANSLUCENT);
    for (const id of ['CD', 'DA']) expect(pickAt(id)).toBe(id);
    picker.setMode('vertex');
    expect(pickAt('D')).toBe('D');
  });

  it('ワイヤーフレームでは面を選べない', () => {
    picker.setMode('face');
    model.setFaceDisplayMode(FACE_DISPLAY_MODES.WIREFRAME);
    expect(pickAt('ABFE')).toBeNull();
  });

  it('頂点・辺は見た目より大きい判定領域を持つ', () => {
    picker.setMode('vertex');
    const { x, y } = screenPos(model.getElement('F').mesh, sm.camera);
    expect(picker.pick(x + 12, y)).toBe('F');
  });

  it('立方体を回転させても数学的 ID で選べる', () => {
    model.root.rotation.y = Math.PI / 2;
    model.root.updateMatrixWorld(true);
    picker.setMode('vertex');
    // 90°回転すると D が手前に来て見えるようになる
    expect(pickAt('D')).toBe('D');
  });

  it('タップで選択・解除し、ドラッグやロック中は選択しない', () => {
    picker.setMode('vertex');
    const { x, y } = screenPos(model.getElement('F').mesh, sm.camera);
    const fire = (type, cx, cy) =>
      sm.canvas.dispatchEvent(Object.assign(new Event(type), { pointerId: 1, pointerType: 'touch', button: 0, clientX: cx, clientY: cy }));
    const tap = (cx, cy) => {
      fire('pointerdown', cx, cy);
      fire('pointerup', cx, cy);
    };

    tap(x, y);
    expect(selection.getSelected()).toEqual(['F']);
    tap(x, y);
    expect(selection.getSelected()).toEqual([]);

    fire('pointerdown', x, y);
    fire('pointerup', x + 40, y);
    expect(selection.getSelected()).toEqual([]);

    inputLock.lock('animation');
    tap(x, y);
    expect(selection.getSelected()).toEqual([]);
    inputLock.unlock('animation');

    picker.setEnabled(false);
    tap(x, y);
    expect(selection.getSelected()).toEqual([]);
  });
});

describe('カメラ操作', () => {
  let sm;
  let controls;
  let inputLock;

  beforeEach(() => {
    sm = createFakeSceneManager();
    inputLock = new InputLock();
    controls = createCubeControls(sm, { boundingRadius: 2, inputLock });
  });

  afterEach(() => {
    controls.dispose();
    sm.canvas.remove();
  });

  it('初期位置は (4,3,5) 方向から原点を見て、立方体が画面に収まる距離', () => {
    const { position, target, distance } = controls.getCameraState();
    expect(target).toEqual([0, 0, 0]);
    const dir = new THREE.Vector3(...position).normalize();
    expect(dir.distanceTo(new THREE.Vector3(...DEFAULT_VIEW_DIRECTION).normalize())).toBeLessThan(1e-9);
    // 外接球（半径2）が視野角40°に収まる距離
    expect(distance).toBeGreaterThan(2 / Math.sin(THREE.MathUtils.degToRad(20)));
    expect(distance).toBeLessThan(10);
  });

  it('視点リセットで初期位置に補間して戻る', () => {
    const initial = controls.getCameraState().position;
    sm.camera.position.set(0, 9, 0.5);
    controls.controls.update();
    controls.resetCamera();
    for (let t = 0; t <= 700; t += 16) sm.frame(t);
    const after = controls.getCameraState().position;
    expect(new THREE.Vector3(...after).distanceTo(new THREE.Vector3(...initial))).toBeLessThan(1e-6);
  });

  it('回転・ズームの禁止と操作ロック', () => {
    const oc = controls.controls;
    expect(oc.enabled && oc.enableRotate && oc.enableZoom).toBe(true);
    expect(oc.enablePan).toBe(false);
    controls.disableRotation();
    expect(oc.enableRotate).toBe(false);
    controls.disableZoom();
    expect(oc.enabled).toBe(false);
    controls.enableRotation();
    controls.enableZoom();
    expect(oc.enabled).toBe(true);

    inputLock.lock('animation');
    expect(oc.enabled).toBe(false);
    inputLock.unlock('animation');
    expect(oc.enabled).toBe(true);
  });
});

/**
 * 3D 立方体ビューア（3D 機能の窓口）
 *
 * シーン・モデル・カメラ操作・選択・強調・アニメーションを組み立て、
 * UI や後続 Phase の問題画面が使う API をまとめて提供する。
 * UI 側はこのオブジェクトの API とイベント（viewer.events）だけを使い、Three.js を直接触らない。
 *
 * イベント：
 *   'selection:change' { selected, added, removed }
 *   'highlight:change' { highlighted }
 *   'camera:change'    { position, target, distance, zoom }
 *   'animation:state'  { playing, paused }
 *   'input-lock:change' { locked }
 */
import { createEventBus } from '../core/eventBus.js';
import { InputLock } from '../core/inputLock.js';
import { SelectionState } from '../core/selectionState.js';
import { createSceneManager } from './sceneManager.js';
import { createCubeModel, FACE_DISPLAY_MODES } from './cubeModel.js';
import { createCubeControls } from './cubeControls.js';
import { createCubeSelection } from './cubeSelection.js';
import { createHighlightManager } from './cubeHighlight.js';
import { AnimationManager } from './animationManager.js';
import { createRotationDemo, createFaceFlash } from './cubeAnimations.js';

/**
 * @param {HTMLElement} container 3D 表示領域
 * @throws {import('./sceneManager.js').WebGLUnavailableError}
 */
export function createCubeViewer(container) {
  const events = createEventBus();
  const inputLock = new InputLock();
  const selection = new SelectionState();

  const sceneManager = createSceneManager(container);
  const model = createCubeModel();
  sceneManager.scene.add(model.root);
  const render = () => sceneManager.requestRender();

  const cameraControls = createCubeControls(sceneManager, {
    boundingRadius: model.boundingRadius,
    inputLock,
    onCameraChange: (state) => events.emit('camera:change', state),
  });

  const picker = createCubeSelection({ sceneManager, model, selection, inputLock });

  const highlights = createHighlightManager(model, {
    onChange: (highlighted) => {
      render();
      events.emit('highlight:change', { highlighted });
    },
  });

  const animations = new AnimationManager({
    requestFrame: render,
    inputLock,
    onStateChange: (state) => events.emit('animation:state', state),
  });
  const offAnimationUpdater = sceneManager.addUpdater((time) => animations.tick(time));

  // 選択状態 → 見た目
  const offSelection = selection.onChange((event) => {
    for (const id of event.removed) model.setSelected(id, false);
    for (const id of event.added) model.setSelected(id, true);
    render();
    events.emit('selection:change', event);
  });

  const offLock = inputLock.onChange((locked) => events.emit('input-lock:change', { locked }));

  let disposed = false;

  return {
    events,
    // 下位モジュール（後続 Phase で直接使う場合用）
    model,
    selection,
    animations,
    inputLock,
    sceneManager,

    // ----- カメラ操作 -----
    enableRotation: cameraControls.enableRotation,
    disableRotation: cameraControls.disableRotation,
    enableZoom: cameraControls.enableZoom,
    disableZoom: cameraControls.disableZoom,
    isRotationEnabled: cameraControls.isRotationEnabled,
    isZoomEnabled: cameraControls.isZoomEnabled,
    resetCamera: cameraControls.resetCamera,
    getCameraState: cameraControls.getCameraState,

    // ----- 選択 -----
    setSelectionMode: picker.setMode,
    getSelectionMode: picker.getMode,
    setSelectionEnabled: picker.setEnabled,
    setMultipleSelection: (multiple) => selection.setMultiple(multiple),
    isMultipleSelection: () => selection.multiple,
    select: (id) => selection.select(id),
    deselect: (id) => selection.deselect(id),
    toggleSelection: (id) => selection.toggle(id),
    clearSelection: (type) => selection.clear(type),
    getSelected: (type) => selection.getSelected(type),
    getSelectedByType: () => selection.getSelectedByType(),
    /** 画面座標にある要素 ID（現在の選択モードの要素のみ） */
    pickAt: picker.pick,

    // ----- 強調表示 -----
    highlightVertex: highlights.highlightVertex,
    highlightEdge: highlights.highlightEdge,
    highlightFace: highlights.highlightFace,
    highlightElements: highlights.highlightElements,
    clearHighlights: highlights.clearHighlights,
    getHighlighted: highlights.getHighlighted,

    // ----- 表示 -----
    setFaceDisplayMode(mode) {
      model.setFaceDisplayMode(mode);
      render();
    },
    getFaceDisplayMode: model.getFaceDisplayMode,
    setLabelsVisible(visible) {
      model.setLabelsVisible(visible);
      render();
    },
    getLabelsVisible: model.getLabelsVisible,

    // ----- アニメーション -----
    /** 立方体を 90° 回転して元に戻すデモ */
    playRotationDemo: (options) => animations.play(createRotationDemo(model.root, { ...options, onUpdate: render })),
    /** 指定面の色を変化させるデモ */
    playFaceFlashDemo: (faceId = 'ABFE', options) =>
      animations.play(createFaceFlash(highlights, faceId, { ...options, onUpdate: render })),

    dispose() {
      if (disposed) return;
      disposed = true;
      animations.dispose();
      offAnimationUpdater();
      offSelection();
      offLock();
      picker.dispose();
      cameraControls.dispose();
      highlights.dispose();
      model.dispose();
      sceneManager.dispose();
      events.clear();
    },
  };
}

export { FACE_DISPLAY_MODES };

/**
 * 3D 立方体ビューア（3D 機能の窓口）
 *
 * シーン・モデル・カメラ操作・選択・強調・アニメーションを組み立て、
 * UI や後続 Phase の問題画面が使う API をまとめて提供する。
 * UI 側はこのオブジェクトの API とイベント（viewer.events）だけを使い、Three.js を直接触らない。
 *
 * イベント：
 *   'selection:change' { selected, added, removed }
 *   'highlight:change' { highlighted }   （すべてのレイヤーの強調中 ID）
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
import { createRotationDemo, createFaceFlash, createAnswerReveal } from './cubeAnimations.js';
import { createFaceDecorations } from './faceDecoration.js';
import { createBlockModel } from './blockModel.js';
import { createNetModel } from './cubeNetModel.js';
import { createSubdividedCubeModel } from './subdividedCubeModel.js';
import { tween } from './animationManager.js';
import { createOrientationState, createTurnSequence, createQuestionReveal, DEFAULT_TURN_DURATION, DEFAULT_TURN_PAUSE } from './cubeRotationAnimations.js';

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

  // 面の装飾（数字・色）と、立方体の向き（数学上の向きと 3D を同期）
  const decorations = createFaceDecorations(model);
  const cubeState = createOrientationState(model.root, render);

  // 積み木（積み木の問題のときだけ表示し、そのあいだ単一の立方体は隠す）
  const blocks = createBlockModel();
  sceneManager.scene.add(blocks.root);

  // 展開図（展開図の問題のときだけ表示し、そのあいだ単一の立方体は隠す）
  const net = createNetModel();
  sceneManager.scene.add(net.root);

  // 小立方体に分けた立方体（小立方体の個数・着色の問題のときだけ表示する）
  const subcubes = createSubdividedCubeModel();
  sceneManager.scene.add(subcubes.root);
  const updateCubeVisibility = () => {
    model.root.visible = !blocks.root.visible && !net.root.visible && !subcubes.root.visible;
  };

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
    setHomeDirection: cameraControls.setHomeDirection,
    /** 視点リセットで戻る向きを変えて、その向きに移動する（問題ごとの初期視点） */
    setCameraPreset(direction = 'default', { animate = true } = {}) {
      cameraControls.setHomeDirection(direction);
      cameraControls.resetCamera({ animate });
    },
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
    clearHighlightLayer: highlights.clearLayer,
    getVisibleHighlightLayer: highlights.getVisibleLayer,
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

    // ----- 面の装飾・立方体の向き（Phase 2） -----
    /**
     * 面の装飾（数字・色・記号）を設定する。null で装飾なしのふつうの立方体に戻る
     * @param {Record<string, object>|null} faces 面 ID → 装飾（core/cubeFaceLabels）
     */
    setFaceDecorations(faces) {
      decorations.set(faces ?? null);
      render();
    },
    getFaceDecorations: decorations.get,
    /** 立方体の向きを設定する（core/cubeOrientation の向き） */
    setCubeOrientation(orientation) {
      cubeState.set(orientation);
    },
    resetCubeOrientation() {
      cubeState.reset();
    },
    getCubeOrientation: () => ({ ...cubeState.orientation }),

    // ----- 積み木 -----
    /**
     * 積み木を表示する（null で消して、ふつうの立方体に戻る）
     * @param {{x,y,z}[]|null} cubes 小立方体の一覧（core/blockGeometry）
     * @param {{ arrows?: string[] }} [options] 見る向きの矢印
     */
    setBlocks(cubes, options) {
      blocks.set(cubes ?? null, options);
      updateCubeVisibility();
      render();
    },

    // ----- 展開図 -----
    /**
     * 展開図を表示する（null で消す）。はじめは平らな展開図
     * @param {object|null} spec three/cubeNetModel の set を参照
     */
    setNet(spec) {
      net.set(spec ?? null);
      updateCubeVisibility();
      render();
    },
    /** 折りたたみの進み具合をすぐに変える（0 = 展開図、1 = 立方体） */
    setNetFold(t) {
      net.setProgress(t);
      render();
    },
    getNetFold: () => net.getProgress(),
    /** 折りたたむ・展開図に戻すアニメーション（to = 1 で組み立て、0 で展開図に戻す） */
    playNetFold: ({ to = 1, duration = 2400 } = {}) => {
      let from = 0;
      return animations.play(
        tween({
          duration,
          onStart: () => {
            from = net.getProgress();
          },
          onUpdate: (t) => {
            net.setProgress(from + (to - from) * t);
            render();
          },
        }),
      );
    },
    // ----- 小立方体（Phase 4） -----
    /**
     * 小立方体に分けた立方体を表示する（null で消す）。はじめは切り分ける前の立方体
     * @param {{ divisions: number, paintedFaces?: string[], removed?: {x,y,z}[] }|null} spec
     */
    setSubcubes(spec) {
      subcubes.set(spec ?? null);
      updateCubeVisibility();
      render();
    },
    getSubcubeState: () => subcubes.getState(),
    getSubcubeSeparation: () => subcubes.getSeparation(),
    /** 小立方体をはなす（to = 1）・もとに戻す（to = 0）アニメーション */
    playSubcubeSeparation: ({ to = 1, duration = 800 } = {}) => {
      let from = 0;
      return animations.play(
        tween({
          duration,
          onStart: () => {
            from = subcubes.getSeparation();
            subcubes.setDivision(1);
          },
          onUpdate: (t) => {
            subcubes.setSeparation(from + (to - from) * t);
            render();
          },
        }),
      );
    },

    highlightBlocks(cubes) {
      blocks.highlight(cubes);
      render();
    },
    clearBlockHighlights() {
      blocks.clearHighlights();
      render();
    },
    getBlocks: blocks.getCubes,

    /**
     * 立方体を 90° ずつ回転させる。完了・スキップで最終の向き、キャンセルで再生前の向きになる
     * @param {{ direction: string, turns?: number, duration?: number }} params
     */
    playCubeRotation: ({ direction, turns = 1, duration = DEFAULT_TURN_DURATION }) =>
      animations.play(createTurnSequence(cubeState, Array(turns).fill(direction), { durationPerTurn: duration, onUpdate: render })),

    /**
     * 回転を続けて行う（回転ごとに少し止まる）
     * @param {{ directions: string[], durationPerTurn?: number, pause?: number }} params
     */
    playCubeRotationSequence: ({ directions, durationPerTurn = DEFAULT_TURN_DURATION, pause = DEFAULT_TURN_PAUSE }) =>
      animations.play(createTurnSequence(cubeState, directions, { durationPerTurn, pause, onUpdate: render })),

    /**
     * 問題の正解演出（はじめの向きに戻す → 誤選択を赤 → 回転・視点移動 → 正解を緑）
     * @param {{ orientation?, cameraPreset?, steps?, wrong?, correct? }} spec cubeRotationAnimations.createQuestionReveal 参照
     */
    playQuestionReveal: (spec) =>
      animations.play(createQuestionReveal({ state: cubeState, controls: cameraControls, highlights, blocks, net, subcubes, onUpdate: render }, spec)),

    /**
     * 回答後の正解演出（誤選択を赤 → 正解を1つずつ緑）。完了時に { status } で解決
     * @param {{ wrong?: string[], correct?: string[] }} params 立方体の要素 ID
     */
    playAnswerReveal: (params) => animations.play(createAnswerReveal(highlights, { ...params, onUpdate: render })),

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
      decorations.dispose();
      blocks.dispose();
      net.dispose();
      subcubes.dispose();
      model.dispose();
      sceneManager.dispose();
      events.clear();
    },
  };
}

export { FACE_DISPLAY_MODES };

/**
 * 立方体の向きの 3D 表示と回転アニメーション
 *
 * 数学上の向き（core/cubeOrientation）を正として、3D モデル（model.root）の回転をそれに合わせる。
 * - 1回の回転アニメーションの最後に、計算した向きの値で 3D の回転を確定させる（誤差がたまらない）
 * - スキップ = 最終の向きに確定 / キャンセル = 再生前の向きに戻す
 * カメラの回転（観察の視点）とは別に管理する。
 */
import * as THREE from 'three';
import { INITIAL_ORIENTATION, orientationToMatrix, rotateOrientation, isValidOrientation } from '../core/cubeOrientation.js';
import { getMove } from '../core/cubeRotations.js';
import { tween, wait, sequence } from './animationManager.js';
import { easeInOutCubic } from '../utils/easing.js';
import { createPop } from './cubeAnimations.js';
import { createLayerCounting, createLayerFocus, createBlockAdding } from './blockCountingAnimations.js';
import { createCutPlane, createCutSection, createCutSplit } from './cubeCuttingAnimations.js';
import { createPathHighlight, createPathTravel, createPathUnfold } from './surfacePathAnimations.js';

/** 回転 1 回の標準の時間（ms） */
export const DEFAULT_TURN_DURATION = 800;
/** 回転と回転のあいだの停止（ms） */
export const DEFAULT_TURN_PAUSE = 350;

const AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };

/** 向き → 3D の回転（クォータニオン） */
export function orientationToQuaternion(orientation) {
  const m = orientationToMatrix(orientation);
  const m4 = new THREE.Matrix4().set(m[0][0], m[0][1], m[0][2], 0, m[1][0], m[1][1], m[1][2], 0, m[2][0], m[2][1], m[2][2], 0, 0, 0, 0, 1);
  return new THREE.Quaternion().setFromRotationMatrix(m4);
}

/**
 * 立方体の向きの状態（数学上の向きと 3D の回転を同期）
 * @param {THREE.Object3D} root 立方体全体のグループ
 * @param {() => void} onChange 再描画要求
 */
export function createOrientationState(root, onChange = () => {}) {
  let orientation = INITIAL_ORIENTATION;
  return {
    root,
    get orientation() {
      return orientation;
    },
    /** 向きを確定させる（3D もその向きにする） */
    set(next) {
      if (!isValidOrientation(next)) throw new Error('無効な向きです');
      orientation = { ...next };
      root.quaternion.copy(orientationToQuaternion(orientation));
      root.position.set(0, 0, 0);
      onChange();
    },
    reset() {
      this.set(INITIAL_ORIENTATION);
    },
  };
}

/**
 * 90° 回転 1 回のアニメーション
 * 転がす動き（roll）は、立方体の中心を少し持ち上げて、底の辺を支点に転がるように見せる。
 */
export function createTurn(state, moveId, { duration = DEFAULT_TURN_DURATION, onUpdate = () => {} } = {}) {
  const move = getMove(moveId);
  const delta = new THREE.Quaternion();
  let from = null;
  let target = null;
  return tween({
    duration,
    easing: easeInOutCubic,
    onStart: () => {
      from = state.root.quaternion.clone();
      target = rotateOrientation(state.orientation, moveId);
    },
    onUpdate: (t) => {
      if (t >= 1) {
        state.set(target); // 計算した向きで確定
        onUpdate();
        return;
      }
      const angle = (move.quarterTurns * Math.PI * t) / 2;
      delta.setFromAxisAngle(AXES[move.axis], angle);
      state.root.quaternion.copy(from).premultiply(delta);
      // 底の辺を支点に転がると、中心の高さは √2·sin(45°+φ) - 1 だけ上がる
      state.root.position.y = move.kind === 'roll' ? Math.SQRT2 * Math.sin(Math.PI / 4 + (Math.PI / 2) * t) - 1 : 0;
      onUpdate();
    },
  });
}

/**
 * 回転を続けて行うアニメーション（回転ごとに少し止まる）
 * キャンセルすると再生前の向きに戻る。
 */
export function createTurnSequence(state, moveIds, { durationPerTurn = DEFAULT_TURN_DURATION, pause = DEFAULT_TURN_PAUSE, onUpdate = () => {} } = {}) {
  const steps = [];
  moveIds.forEach((m, i) => {
    if (i > 0 && pause > 0) steps.push(wait(pause));
    steps.push(createTurn(state, m, { duration: durationPerTurn, onUpdate }));
  });
  if (steps.length === 0) steps.push(wait(0));
  const seq = sequence(steps);
  let start = null;
  return {
    duration: seq.duration,
    start() {
      start = state.orientation;
      seq.start();
    },
    update: seq.update,
    cancel() {
      seq.cancel();
      if (start) state.set(start);
    },
    end: () => onUpdate(),
  };
}

/**
 * カメラを指定した方向へ動かす（見え方の確認用）
 * @param {{ getViewDirection: () => number[], setViewDirection: (v: number[]) => void }} controls
 */
export function createCameraMove(controls, direction, { duration = 900, onUpdate = () => {} } = {}) {
  let from = null;
  const to = new THREE.Vector3(...direction).normalize();
  return tween({
    duration,
    easing: easeInOutCubic,
    onStart: () => {
      from = new THREE.Vector3(...controls.getViewDirection()).normalize();
    },
    onUpdate: (t) => {
      const q = new THREE.Quaternion().setFromUnitVectors(from, to);
      const dir = from.clone().applyQuaternion(new THREE.Quaternion().slerp(q, t));
      controls.setViewDirection(dir.toArray());
      onUpdate();
    },
  });
}

/**
 * 問題の正解演出
 * 1. はじめの向き・視点に戻す → 2. 誤選択を赤 → 3. 回転・視点移動 → 4. 正解の面を緑
 * スキップで最終状態、キャンセルではじめの向きに戻る。リプレイしても必ずはじめから再生する。
 *
 * @param {{ state, controls, highlights, onUpdate }} parts
 * @param {{ orientation?: object, cameraPreset?: 'default'|number[], steps?: object[], wrong?: string[], correct?: string[] }} spec
 *   steps: { type: 'rotate', moves: string[], durationPerTurn?, pause? }
 *        | { type: 'camera', direction: number[], duration? }
 *        | { type: 'pause', ms: number }
 *        | { type: 'highlightBlocks', cubes: {x,y,z}[] }   積み木の小立方体を緑にする
 *        | { type: 'fold', to: 0〜1, duration? }           展開図を折りたたむ（1）・展開図に戻す（0）
 *        | { type: 'divide', duration? }                  小立方体の境界線が現れる（切り分ける）
 *        | { type: 'separate', to: 0〜1, duration? }      小立方体どうしを少しはなす（1）・もとに戻す（0）
 *        | { type: 'highlightSubcubes', cubes, label? }   条件に合う小立方体を緑に・ほかを半透明に・個数を表示
 *        | { type: 'countLayers', hidden? }              積み木を段ごとに分けて、各段の個数と合計を表示（hidden：見えない積み木）
 *        | { type: 'countLayer', level }                 指定した段だけを取り出して1個ずつ数える
 *        | { type: 'addBlocks', cubes }                  加える積み木を1つずつ置いて完成形にする
 *        | { type: 'cutPlane' } / { type: 'cutSection', label? } / { type: 'cutSplit', to, highlightSmall?, label? }  切断（three/cubeCuttingAnimations）
 *        | { type: 'pathHighlight' } / { type: 'pathTravel' } / { type: 'pathUnfold', to }  最短経路（three/surfacePathAnimations）
 */
export function createQuestionReveal({ state, controls, highlights, blocks = null, net = null, subcubes = null, cutting = null, surface = null, onUpdate = () => {} }, spec) {
  const { orientation = INITIAL_ORIENTATION, cameraPreset = 'default', steps = [], wrong = [], correct = [] } = spec;
  const parts = [];
  if (wrong.length > 0) parts.push(createPop(highlights, wrong, { layer: 'wrong', duration: 400, onUpdate }), wait(250));
  for (const step of steps) {
    if (step.type === 'rotate') {
      step.moves.forEach((m, i) => {
        if (i > 0) parts.push(wait(step.pause ?? DEFAULT_TURN_PAUSE));
        parts.push(createTurn(state, m, { duration: step.durationPerTurn ?? DEFAULT_TURN_DURATION, onUpdate }));
      });
      parts.push(wait(step.pauseAfter ?? 500)); // 最終状態で少し止まる
    } else if (step.type === 'camera') {
      parts.push(createCameraMove(controls, step.direction, { duration: step.duration ?? 900, onUpdate }), wait(300));
    } else if (step.type === 'pause') {
      parts.push(wait(step.ms));
    } else if (step.type === 'fold' && net) {
      let from = 0;
      parts.push(
        tween({
          duration: step.duration ?? 2400,
          onStart: () => {
            from = net.getProgress();
          },
          onUpdate: (t) => {
            net.setProgress(from + (step.to - from) * t);
            onUpdate();
          },
        }),
        wait(300),
      );
    } else if (step.type === 'divide' && subcubes) {
      parts.push(tween({ duration: step.duration ?? 900, onUpdate: (t) => (subcubes.setDivision(t), onUpdate()) }), wait(250));
    } else if (step.type === 'separate' && subcubes) {
      let from = 0;
      parts.push(
        tween({
          duration: step.duration ?? 900,
          easing: easeInOutCubic,
          onStart: () => {
            from = subcubes.getSeparation();
          },
          onUpdate: (t) => {
            subcubes.setSeparation(from + (step.to - from) * t);
            onUpdate();
          },
        }),
        wait(300),
      );
    } else if (step.type === 'highlightSubcubes' && subcubes) {
      parts.push(
        tween({
          duration: 300,
          onStart: () => {
            subcubes.highlight(step.cubes, { label: step.label });
            onUpdate();
          },
          onUpdate: () => {},
        }),
        wait(400),
      );
    } else if (step.type === 'countLayers' && blocks) {
      parts.push(createLayerCounting(blocks, { hidden: step.hidden ?? [], onUpdate }), wait(300));
    } else if (step.type === 'countLayer' && blocks) {
      parts.push(createLayerFocus(blocks, { level: step.level, onUpdate }), wait(300));
    } else if (step.type === 'addBlocks' && blocks) {
      parts.push(createBlockAdding(blocks, { cubes: step.cubes, onUpdate }), wait(300));
    } else if (step.type === 'cutPlane' && cutting) {
      parts.push(createCutPlane(cutting, { onUpdate }));
    } else if (step.type === 'cutSection' && cutting) {
      parts.push(createCutSection(cutting, { label: step.label ?? '', onUpdate }));
    } else if (step.type === 'cutSplit' && cutting) {
      parts.push(createCutSplit(cutting, { to: step.to ?? 1, highlightSmall: Boolean(step.highlightSmall), label: step.label ?? '', onUpdate }));
    } else if (step.type === 'pathHighlight' && surface) {
      parts.push(createPathHighlight(surface, { onUpdate }));
    } else if (step.type === 'pathTravel' && surface) {
      parts.push(createPathTravel(surface, { onUpdate }));
    } else if (step.type === 'pathUnfold' && surface) {
      parts.push(createPathUnfold(surface, { to: step.to ?? 1, controls, onUpdate }));
    } else if (step.type === 'highlightBlocks' && blocks) {
      parts.push(
        tween({
          duration: 300,
          onStart: () => {
            blocks.highlight(step.cubes);
            onUpdate();
          },
          onUpdate: () => {},
        }),
        wait(400),
      );
    }
  }
  for (const id of correct) parts.push(createPop(highlights, [id], { layer: 'correct', onUpdate }));
  if (parts.length === 0) parts.push(wait(0));
  const seq = sequence(parts);

  const restart = () => {
    highlights.clearLayer('wrong');
    highlights.clearLayer('correct');
    blocks?.clearHighlights();
    blocks?.resetCounting?.(); // 積み木の個数の演出：段の持ち上げ・半透明・ラベルを戻す
    net?.setProgress(0); // 展開図は平らな状態から
    // 小立方体は、切り分ける前の立方体から
    subcubes?.clearHighlights();
    subcubes?.setDivision(0);
    subcubes?.setSeparation(0);
    cutting?.reset(); // 切断：切る3点だけの状態から
    surface?.reset(); // 最短経路：候補の道だけの状態から
    state.set(orientation);
    controls.setHomeDirection(cameraPreset);
    controls.resetCamera({ animate: false });
    onUpdate();
  };

  return {
    duration: seq.duration,
    start() {
      restart();
      seq.start();
    },
    update: seq.update,
    cancel() {
      seq.cancel();
      state.set(orientation);
      onUpdate();
    },
    end: () => onUpdate(),
  };
}


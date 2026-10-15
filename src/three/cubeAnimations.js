/**
 * 立方体の演出アニメーション（AnimationManager.play() に渡すオブジェクトを作る）
 *
 * Phase 0 では動作確認用の2種類。後続 Phase の展開図・切断演出もこの形式で追加する。
 */
import * as THREE from 'three';
import { tween, wait, sequence } from './animationManager.js';
import { easeInOutCubic } from '../utils/easing.js';

const AXES = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};

/**
 * オブジェクトを軸まわりに回転させる
 * @param {THREE.Object3D} object
 * @param {{ axis?: 'x'|'y'|'z', angle?: number, duration?: number, onUpdate?: () => void }} [options]
 */
export function createRotation(object, { axis = 'y', angle = Math.PI / 2, duration = 900, onUpdate = () => {} } = {}) {
  let from = null;
  const delta = new THREE.Quaternion();
  return tween({
    duration,
    easing: easeInOutCubic,
    onStart: () => {
      from = object.quaternion.clone();
    },
    onUpdate: (t) => {
      delta.setFromAxisAngle(AXES[axis], angle * t);
      object.quaternion.copy(from).premultiply(delta);
      onUpdate();
    },
  });
}

/**
 * 90°回転して少し止まり、元の向きに戻るデモ。キャンセル時も元の向きに戻す。
 * @param {THREE.Object3D} object
 * @param {{ axis?: 'x'|'y'|'z', onUpdate?: () => void }} [options]
 */
export function createRotationDemo(object, { axis = 'y', onUpdate = () => {} } = {}) {
  const initial = object.quaternion.clone();
  const restore = () => {
    object.quaternion.copy(initial);
    onUpdate();
  };
  return sequence(
    [
      createRotation(object, { axis, angle: Math.PI / 2, onUpdate }),
      wait(500),
      createRotation(object, { axis, angle: -Math.PI / 2, onUpdate }),
    ],
    { onCancel: restore, onEnd: (status) => status !== 'cancelled' && restore() },
  );
}

/**
 * 指定面をふわっと色づけて消すデモ（強調表示のオーバーレイを利用）
 * @param {ReturnType<import('./cubeHighlight.js').createHighlightManager>} highlights
 * @param {string} faceId
 * @param {{ color?: string|number, duration?: number, onUpdate?: () => void }} [options]
 */
export function createFaceFlash(highlights, faceId, { color = 'correct', duration = 1600, onUpdate = () => {} } = {}) {
  let entry = null;
  const cleanup = () => {
    if (entry) highlights.clearHighlights([faceId], { layer: 'default' });
    entry = null;
    onUpdate();
  };
  return tween({
    duration,
    onStart: () => {
      entry = highlights.highlightFace(faceId, { color, opacity: 0 });
    },
    onUpdate: (t) => {
      if (!entry) return;
      // 0 → 0.8 → 0 の山なり
      entry.material.opacity = 0.8 * Math.sin(Math.PI * t);
      onUpdate();
    },
    onCancel: cleanup,
    onEnd: cleanup,
  });
}

/**
 * 要素をふわっと表示する（辺・頂点は一瞬ふくらませて目立たせる）
 * @param {ReturnType<import('./cubeHighlight.js').createHighlightManager>} highlights
 */
function createPop(highlights, ids, { layer, duration = 380, onUpdate = () => {} }) {
  let entries = [];
  return tween({
    duration,
    onStart: () => {
      entries = highlights.highlightElements(ids, { layer, opacity: 0 }).map((entry) => ({
        entry,
        target: entry.type === 'face' ? 0.6 : 1,
      }));
    },
    onUpdate: (t) => {
      const pulse = Math.sin(Math.PI * t);
      for (const { entry, target } of entries) {
        entry.material.opacity = Math.min(target, target * t * 1.6 + (entry.type === 'face' ? 0.25 * pulse : 0));
        const s = entry.type === 'face' ? 1 : 1 + 0.7 * pulse;
        if (entry.type === 'edge') entry.object.scale.set(s, 1, s);
        else entry.object.scale.setScalar(s);
      }
      onUpdate();
    },
  });
}

/**
 * 回答後の正解演出：誤って選んだ要素を赤で示し、正解の要素を1つずつ緑で光らせる。
 * 再生のたびに wrong / correct レイヤーを作り直すので、リプレイしても表示が重ならない。
 * スキップすると最終状態（赤・緑がすべて表示）になる。基準要素（reference レイヤー）には触れない。
 * @param {ReturnType<import('./cubeHighlight.js').createHighlightManager>} highlights
 * @param {{ wrong?: string[], correct?: string[], onUpdate?: () => void }} options
 */
export function createAnswerReveal(highlights, { wrong = [], correct = [], onUpdate = () => {} } = {}) {
  const steps = [];
  if (wrong.length > 0) steps.push(createPop(highlights, wrong, { layer: 'wrong', duration: 400, onUpdate }), wait(250));
  for (const id of correct) steps.push(createPop(highlights, [id], { layer: 'correct', onUpdate }));
  if (steps.length === 0) steps.push(wait(0));
  const seq = sequence(steps);
  return {
    duration: seq.duration,
    start() {
      highlights.clearLayer('wrong');
      highlights.clearLayer('correct');
      onUpdate();
      seq.start();
    },
    update: seq.update,
    cancel: seq.cancel,
    end: () => onUpdate(),
  };
}

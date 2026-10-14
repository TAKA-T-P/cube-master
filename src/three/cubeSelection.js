/**
 * Raycaster による頂点・辺・面の選択（ポインター操作）
 *
 * - 現在の選択モード（頂点／辺／面）の要素だけを判定対象にする
 * - ドラッグ（カメラ回転）とタップを区別し、タップのときだけ選択する
 * - 面が不透明のときは、面の裏に隠れた頂点・辺は選択できない
 * - 選択結果は SelectionState（Three.js 非依存）に保存する
 */
import * as THREE from 'three';
import { ELEMENT_TYPES } from '../core/cubeConstants.js';

const TAP_MAX_MOVE = 8; // px（これ以上動いたらドラッグとみなす）
const TAP_MAX_TIME = 600; // ms

/**
 * @param {{ sceneManager: any, model: any, selection: import('../core/selectionState.js').SelectionState,
 *           inputLock?: import('../core/inputLock.js').InputLock }} deps
 */
export function createCubeSelection({ sceneManager, model, selection, inputLock = null }) {
  const { camera, canvas } = sceneManager;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let mode = ELEMENT_TYPES.VERTEX;
  let enabled = true;
  /** @type {Map<number, {x:number, y:number, time:number}>} */
  const downs = new Map();
  let multiTouch = false;

  /**
   * 画面座標の位置にある要素の ID を返す（なければ null）
   * @param {number} clientX
   * @param {number} clientY
   */
  function pick(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);

    const hits = raycaster.intersectObjects(model.getPickTargets(mode), false);
    if (hits.length === 0) return null;
    const hit = hits[0];

    if (mode !== ELEMENT_TYPES.FACE) {
      const occluders = raycaster.intersectObjects(model.getOccluders(), false);
      if (occluders.length > 0 && occluders[0].distance < hit.distance - 1e-6) return null;
    }
    return hit.object.userData.elementId ?? null;
  }

  const onPointerDown = (event) => {
    downs.set(event.pointerId, { x: event.clientX, y: event.clientY, time: performance.now() });
    if (downs.size > 1) multiTouch = true; // ピンチ中は選択しない
  };

  const onPointerUp = (event) => {
    const down = downs.get(event.pointerId);
    downs.delete(event.pointerId);
    const wasMulti = multiTouch;
    if (downs.size === 0) multiTouch = false;
    if (!down || wasMulti || !enabled || inputLock?.isLocked()) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
    if (moved > TAP_MAX_MOVE || performance.now() - down.time > TAP_MAX_TIME) return;

    const id = pick(event.clientX, event.clientY);
    if (id) selection.toggle(id);
  };

  const onPointerCancel = (event) => {
    downs.delete(event.pointerId);
    if (downs.size === 0) multiTouch = false;
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);

  return {
    /** @param {'vertex'|'edge'|'face'} nextMode */
    setMode(nextMode) {
      if (!Object.values(ELEMENT_TYPES).includes(nextMode)) throw new Error(`無効な選択モードです: ${nextMode}`);
      mode = nextMode;
    },
    getMode: () => mode,
    /** ポインターによる選択の可否（問題によっては選択させない） */
    setEnabled(value) {
      enabled = Boolean(value);
    },
    isEnabled: () => enabled,
    pick,
    dispose() {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      downs.clear();
    },
  };
}

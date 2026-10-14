/**
 * シーン・カメラ・レンダラーの管理
 *
 * - 必要なときだけ描画する（requestRender）。requestAnimationFrame は重複予約しない
 * - フレームごとの更新処理は addUpdater で登録し、true を返す間だけ次フレームを予約する
 * - コンテナのリサイズを監視して camera.aspect とレンダラーサイズを更新する
 */
import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { CUBE_COLORS } from '../core/cubeConstants.js';

/** 高解像度端末で描画負荷が増えすぎないようにする上限 */
export const MAX_PIXEL_RATIO = 2;

export class WebGLUnavailableError extends Error {
  constructor(cause) {
    super('この端末・ブラウザでは 3D 表示（WebGL2）を利用できません。');
    this.name = 'WebGLUnavailableError';
    this.cause = cause;
  }
}

/** WebGL2 が使えるか */
export function isWebGL2Available() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(window.WebGL2RenderingContext && canvas.getContext('webgl2'));
  } catch {
    return false;
  }
}

/**
 * @param {HTMLElement} container 3D 表示領域（サイズはこの要素に追従）
 * @param {{ fov?: number }} [options]
 */
export function createSceneManager(container, { fov = 40 } = {}) {
  if (!isWebGL2Available()) throw new WebGLUnavailableError();

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  } catch (err) {
    throw new WebGLUnavailableError(err);
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
  renderer.setClearColor(CUBE_COLORS.background, 1);
  renderer.domElement.classList.add('scene-canvas');
  container.appendChild(renderer.domElement);

  // 頂点ラベル用（HTML 要素なので文字がくっきり表示される）
  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.classList.add('label-layer');
  container.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(CUBE_COLORS.background);

  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 100);

  // やわらかい環境光＋斜め上からの平行光で立体感を出す
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb8c6d8, 1.6));
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
  keyLight.position.set(3, 5, 4);
  scene.add(keyLight);

  /** @type {Set<(time:number) => boolean>} */
  const updaters = new Set();
  const resizeListeners = new Set();
  const renderListeners = new Set();
  let frameId = null;
  let disposed = false;
  let width = 0;
  let height = 0;

  function requestRender() {
    if (disposed || frameId !== null) return;
    frameId = requestAnimationFrame(renderFrame);
  }

  function renderFrame(time) {
    frameId = null;
    if (disposed) return;
    let needsMore = false;
    for (const update of [...updaters]) {
      try {
        if (update(time)) needsMore = true;
      } catch (err) {
        console.error('[sceneManager] 更新処理でエラー', err);
      }
    }
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
    for (const fn of renderListeners) fn();
    if (needsMore) requestRender();
  }

  function resize() {
    const rect = container.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    if (w === width && h === height) return;
    width = w;
    height = h;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    renderer.setSize(w, h, false);
    labelRenderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    for (const fn of resizeListeners) fn({ width: w, height: h, aspect: w / h });
    requestRender();
  }

  const resizeObserver = new ResizeObserver(() => resize());
  resizeObserver.observe(container);
  // 画面回転時は ResizeObserver より先にサイズが確定しないことがあるため念のため
  window.addEventListener('orientationchange', resize);
  resize();

  // WebGL コンテキストが失われても画面が崩れないように通知だけ行う
  const onContextLost = (event) => {
    event.preventDefault();
    console.warn('[sceneManager] WebGL コンテキストが失われました');
  };
  const onContextRestored = () => requestRender();
  renderer.domElement.addEventListener('webglcontextlost', onContextLost);
  renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

  return {
    scene,
    camera,
    renderer,
    canvas: renderer.domElement,
    requestRender,

    /** フレームごとの更新処理を登録。updater(time) が true を返す間、描画を続ける */
    addUpdater(updater) {
      updaters.add(updater);
      requestRender();
      return () => updaters.delete(updater);
    },

    onResize(listener) {
      resizeListeners.add(listener);
      return () => resizeListeners.delete(listener);
    },

    /** 描画のたびに呼ばれる（デバッグ表示用） */
    onRender(listener) {
      renderListeners.add(listener);
      return () => renderListeners.delete(listener);
    },

    getSize: () => ({ width, height, aspect: width / height }),

    dispose() {
      disposed = true;
      if (frameId !== null) cancelAnimationFrame(frameId);
      frameId = null;
      resizeObserver.disconnect();
      window.removeEventListener('orientationchange', resize);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
      updaters.clear();
      resizeListeners.clear();
      renderListeners.clear();
      renderer.dispose();
      renderer.domElement.remove();
      labelRenderer.domElement.remove();
    },
  };
}

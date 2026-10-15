/**
 * ユーザーによるカメラ操作（OrbitControls のラッパー）
 *
 * 立方体そのものではなく、カメラが立方体のまわりを回る。
 * 問題演出用の「立方体オブジェクトの回転」は AnimationManager 側で別に扱う。
 *
 * 回転・ズームの可否は「問題ごとの設定（enable/disable）」と
 * 「InputLock（アニメーション再生中など）」の両方を満たすときだけ有効になる。
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { easeInOutCubic } from '../utils/easing.js';
import { DEFAULT_VIEW_DIRECTION } from '../core/cubeConstants.js';

/** 初期カメラの向き（前面・右側面・上面が見える。定義は core/cubeConstants） */
export { DEFAULT_VIEW_DIRECTION };

const RESET_DURATION = 600; // ms
const MIN_DISTANCE_RATIO = 0.6;
const MAX_DISTANCE_RATIO = 2.2;
const FIT_MARGIN = 1.08;

/**
 * @param {ReturnType<import('./sceneManager.js').createSceneManager>} sceneManager
 * @param {{ boundingRadius: number, inputLock?: import('../core/inputLock.js').InputLock,
 *           onCameraChange?: (state: object) => void }} options
 */
export function createCubeControls(sceneManager, { boundingRadius, inputLock = null, onCameraChange = () => {} }) {
  const { camera, canvas } = sceneManager;
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; // 慣性のある自然な回転
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.9;
  controls.enablePan = false; // パンは無効（立方体を中心に保つ）
  controls.target.set(0, 0, 0);
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };

  const settings = { rotation: true, zoom: true };
  const homeDirection = new THREE.Vector3(...DEFAULT_VIEW_DIRECTION).normalize();
  let fitDistance = computeFitDistance();
  let resetTween = null;

  // 初期位置
  camera.position.copy(homeDirection).multiplyScalar(fitDistance);
  camera.lookAt(controls.target);
  applyDistanceLimits();
  controls.update();

  function computeFitDistance() {
    // 縦・横のうち狭い方の視野角に、立方体（ラベル込み）の外接球が収まる距離
    const { aspect } = sceneManager.getSize();
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * (aspect || 1));
    const fov = Math.min(vFov, hFov);
    return (boundingRadius / Math.sin(fov / 2)) * FIT_MARGIN;
  }

  function applyDistanceLimits() {
    controls.minDistance = fitDistance * MIN_DISTANCE_RATIO;
    controls.maxDistance = fitDistance * MAX_DISTANCE_RATIO;
  }

  function applyEnabled() {
    const locked = inputLock?.isLocked() ?? false;
    controls.enableRotate = settings.rotation;
    controls.enableZoom = settings.zoom;
    controls.enabled = !locked && (settings.rotation || settings.zoom);
  }

  /** 慣性（残っている回転量）を打ち消す */
  function stopInertia() {
    controls.enableDamping = false;
    controls.update();
    controls.enableDamping = true;
  }

  // 画面サイズが変わったら、見た目の大きさが変わらないように距離を比例させる
  const offResize = sceneManager.onResize(() => {
    const prevFit = fitDistance;
    fitDistance = computeFitDistance();
    applyDistanceLimits();
    if (!resetTween) {
      const offset = camera.position.clone().sub(controls.target);
      offset.setLength(THREE.MathUtils.clamp(offset.length() * (fitDistance / prevFit), controls.minDistance, controls.maxDistance));
      camera.position.copy(controls.target).add(offset);
      controls.update();
    }
  });

  const getCameraState = () => ({
    position: camera.position.toArray(),
    target: controls.target.toArray(),
    distance: camera.position.distanceTo(controls.target),
    zoom: camera.zoom,
  });

  const onChange = () => {
    sceneManager.requestRender();
    onCameraChange(getCameraState());
  };
  const onStart = () => {
    resetTween = null; // ユーザーが触ったらリセット演出を中断
  };
  controls.addEventListener('change', onChange);
  controls.addEventListener('start', onStart);

  const offLock = inputLock?.onChange(() => applyEnabled()) ?? (() => {});
  applyEnabled();

  // 描画ループでの更新（慣性・リセット補間）
  const offUpdater = sceneManager.addUpdater((time) => {
    if (resetTween) {
      if (resetTween.startTime === null) resetTween.startTime = time;
      const t = Math.min(1, (time - resetTween.startTime) / RESET_DURATION);
      const e = easeInOutCubic(t);
      // 方向は球面補間、距離は線形補間（カメラが立方体を突き抜けないように）
      const dist = THREE.MathUtils.lerp(resetTween.fromDist, resetTween.toDist, e);
      camera.position.copy(controls.target).add(slerpDirection(resetTween.fromDir, resetTween.toDir, e).multiplyScalar(dist));
      camera.lookAt(controls.target);
      onCameraChange(getCameraState());
      if (t >= 1) {
        resetTween = null;
        controls.update();
        return false;
      }
      return true;
    }
    return controls.update();
  });

  return {
    controls,
    enableRotation() {
      settings.rotation = true;
      applyEnabled();
    },
    disableRotation() {
      settings.rotation = false;
      stopInertia();
      applyEnabled();
    },
    enableZoom() {
      settings.zoom = true;
      applyEnabled();
    },
    disableZoom() {
      settings.zoom = false;
      applyEnabled();
    },
    isRotationEnabled: () => settings.rotation,
    isZoomEnabled: () => settings.zoom,

    /** いまのカメラの向き（注視点からカメラへの単位ベクトル） */
    getViewDirection: () => camera.position.clone().sub(controls.target).normalize().toArray(),

    /** カメラの向きをすぐに変える（距離はそのまま。演出用） */
    setViewDirection(direction) {
      const dir = new THREE.Vector3(...direction).normalize();
      if (!Number.isFinite(dir.x)) return;
      resetTween = null;
      const distance = camera.position.distanceTo(controls.target);
      camera.position.copy(controls.target).addScaledVector(dir, distance);
      camera.lookAt(controls.target);
      stopInertia();
      sceneManager.requestRender();
      onCameraChange(getCameraState());
    },

    /**
     * 視点リセットで戻る向きを変える（問題ごとの見やすい視点）
     * @param {number[]|'default'} direction カメラを置く方向（原点から見た向き）
     */
    setHomeDirection(direction = 'default') {
      const dir = direction === 'default' ? DEFAULT_VIEW_DIRECTION : direction;
      if (!Array.isArray(dir) || dir.length !== 3 || dir.every((v) => v === 0)) throw new Error('無効なカメラの向きです');
      homeDirection.set(dir[0], dir[1], dir[2]).normalize();
    },

    /**
     * 初期のカメラ位置・注視点・ズームに戻す
     * @param {{ animate?: boolean }} [options]
     */
    resetCamera({ animate = true } = {}) {
      stopInertia();
      controls.target.set(0, 0, 0);
      camera.zoom = 1;
      camera.updateProjectionMatrix();
      const toDist = fitDistance;
      const offset = camera.position.clone().sub(controls.target);
      if (!animate || offset.lengthSq() === 0) {
        resetTween = null;
        camera.position.copy(homeDirection).multiplyScalar(toDist);
        controls.update();
        sceneManager.requestRender();
        return;
      }
      resetTween = {
        startTime: null,
        fromDir: offset.clone().normalize(),
        toDir: homeDirection.clone(),
        fromDist: offset.length(),
        toDist,
      };
      sceneManager.requestRender();
    },

    getCameraState,

    dispose() {
      offUpdater();
      offResize();
      offLock();
      controls.removeEventListener('change', onChange);
      controls.removeEventListener('start', onStart);
      controls.dispose();
    },
  };
}

/** 2つの単位ベクトル間の球面線形補間 */
function slerpDirection(from, to, t) {
  const q = new THREE.Quaternion().setFromUnitVectors(from, to);
  const qt = new THREE.Quaternion().slerp(q, t);
  return from.clone().applyQuaternion(qt);
}

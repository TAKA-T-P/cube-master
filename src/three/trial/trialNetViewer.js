/**
 * トライアル「展開図に分けろ！」の答え合わせの 3D：いくつかの展開図を、同時に折りたたんで立方体にする
 *
 * 展開図ごとに three/cubeNetModel を1つ使い（noFit：大きさ・位置を変えない）、つなげた図形の中の位置に置く。
 *   ① つなげた図形のまま表示 → ② 展開図どうしが少しはなれる → ③ それぞれ折りたたむ → ④ できた立方体を横に並べる
 * 折る向き・折り終わった形は、cubeNetModel（数学エンジン core/cubeNetFolding と同じ規則）のまま。
 */
import * as THREE from 'three';
import { createSceneManager } from '../sceneManager.js';
import { createNetModel } from '../cubeNetModel.js';
import { makeCells } from '../../core/cubeNet.js';
import { buildFoldTree } from '../../core/cubeNetFolding.js';
import { easeInOutCubic } from '../../utils/easing.js';

/** 演出の長さ（速さ 1 のとき） */
export const NET_REVEAL_TIMING = Object.freeze({ show: 500, separate: 700, fold: 2200, arrange: 900, hold: 600 });
const SEPARATE = 0.35; // 図形の中心から、展開図の中心をはなす割合
const GAP = 2.9; // 並べた立方体の間かく

/**
 * @param {HTMLElement} container
 */
export function createTrialNetViewer(container) {
  const sm = createSceneManager(container, { fov: 35 });
  const { scene, camera } = sm;
  let pieces = []; // { model, holder, flat: Vector3, apart: Vector3, row: Vector3 }
  let stopAnimation = null;
  let lastFrame = null;
  let applyAt = null; // 再生中の演出の、ある時刻の状態にする関数（seek 用）
  let stopUpdater = null;

  function clear() {
    stopAnimation?.();
    stopAnimation = null;
    for (const p of pieces) {
      p.model.dispose();
      p.holder.removeFromParent();
    }
    pieces = [];
  }

  /** カメラを、点の集まりが入るように斜め上から向ける */
  function frame(points, { tilt = 0.55 } = {}) {
    lastFrame = points;
    // 表示したばかりで大きさがまだ伝わっていないことがあるので、要素の大きさから直接求める
    const rect = container.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      camera.aspect = rect.width / rect.height;
      camera.updateProjectionMatrix();
    }
    const box = new THREE.Box3().setFromPoints(points);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(2.5, size.length() / 2);
    const aspect = Math.max(0.4, camera.aspect || 1);
    const dist = (radius / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * (aspect < 1 ? 1 / aspect : 1) * 0.92;
    camera.position.set(center.x, center.y + dist * Math.sin(tilt + 0.5), center.z + dist * Math.cos(tilt + 0.5));
    camera.lookAt(center);
    camera.updateProjectionMatrix();
  }

  /**
   * 展開図を置く
   * @param {{ x, y }[][]} groups 展開図ごとのマス（つなげた図形の中の座標）
   * @param {string[]} colors 展開図ごとの色
   */
  function set(groups, colors) {
    clear();
    const all = groups.flat();
    const cx = (Math.min(...all.map((c) => c.x)) + Math.max(...all.map((c) => c.x)) + 1) / 2;
    const cy = (Math.min(...all.map((c) => c.y)) + Math.max(...all.map((c) => c.y)) + 1) / 2;
    pieces = groups.map((coords, i) => {
      const cells = makeCells(coords.map((c) => [c.x, c.y]));
      const tree = buildFoldTree(cells);
      const rootCell = cells.find((c) => c.id === tree.root);
      const model = createNetModel();
      model.set({ cells, noFit: true, cellColors: Object.fromEntries(cells.map((c) => [c.id, colors[i % colors.length]])) });
      const holder = new THREE.Group();
      holder.add(model.root);
      scene.add(holder);
      // 図形の中の位置（一辺2のマス。図形の中心を原点に）
      const flat = new THREE.Vector3(2 * (rootCell.x + 0.5 - cx), -1, 2 * (rootCell.y + 0.5 - cy));
      const mx = coords.reduce((s, c) => s + c.x + 0.5, 0) / coords.length - cx;
      const my = coords.reduce((s, c) => s + c.y + 0.5, 0) / coords.length - cy;
      const apart = flat.clone().add(new THREE.Vector3(2 * mx * SEPARATE, 0, 2 * my * SEPARATE));
      const row = new THREE.Vector3((i - (groups.length - 1) / 2) * GAP, 0, 0);
      holder.position.copy(flat);
      // マスの4すみ（はなしたあとの位置もふくめて、カメラに入れる）
      const offset = apart.clone().sub(flat);
      const corners = coords.flatMap((c) => [
        new THREE.Vector3(2 * (c.x - cx), 0, 2 * (c.y - cy)),
        new THREE.Vector3(2 * (c.x + 1 - cx), 0, 2 * (c.y + 1 - cy)),
      ]);
      const extent = [...corners, ...corners.map((v) => v.clone().add(offset))];
      return { model, holder, flat, apart, row, extent };
    });
    frame(pieces.flatMap((p) => p.extent));
    sm.requestRender();
  }

  /**
   * ①〜④ を再生する
   * @returns {Promise<void>} 終わったら（skip でも）解決する
   */
  function play({ speed = 1 } = {}) {
    stopAnimation?.();
    const t = Object.fromEntries(Object.entries(NET_REVEAL_TIMING).map(([k, v]) => [k, v / speed]));
    const total = t.show + t.separate + t.fold + t.arrange + t.hold;
    let start = null;
    let resolveDone;
    const done = new Promise((r) => (resolveDone = r));
    const rowPoints = () => pieces.flatMap((p) => [p.row.clone().add(new THREE.Vector3(-1.9, -1.2, -1.9)), p.row.clone().add(new THREE.Vector3(1.9, 1.2, 1.9))]);
    let framedRow = false;
    const apply = (elapsed) => {
      const sep = easeInOutCubic(Math.min(1, Math.max(0, (elapsed - t.show) / t.separate)));
      const fold = Math.min(1, Math.max(0, (elapsed - t.show - t.separate) / t.fold));
      const arrange = easeInOutCubic(Math.min(1, Math.max(0, (elapsed - t.show - t.separate - t.fold) / t.arrange)));
      for (const p of pieces) {
        p.model.setProgress(fold);
        // 折ると中心が上がる（立方体の中心は高さ0）ので、はなした位置 → 並べた位置へ
        const base = p.flat.clone().lerp(p.apart, sep);
        base.y = -1 + easeInOutCubic(fold);
        p.holder.position.copy(base.lerp(p.row, arrange));
      }
      if (arrange > 0 && !framedRow) {
        framedRow = true;
        frame(rowPoints());
      }
    };
    applyAt = apply;
    stopUpdater = () => off();
    const off = sm.addUpdater((now) => {
      start ??= now;
      const elapsed = now - start;
      apply(elapsed);
      if (elapsed >= total) {
        off();
        resolveDone();
        return false;
      }
      return true;
    });
    stopAnimation = () => {
      off();
      apply(total);
      sm.requestRender();
      resolveDone();
    };
    return done;
  }

  // 画面の大きさが変わったら、同じ範囲が入るように合わせ直す
  sm.onResize(() => {
    if (lastFrame) frame(lastFrame);
    sm.requestRender();
  });

  return {
    set,
    play,
    /** 最後の状態にする */
    skip() {
      stopAnimation?.();
      stopAnimation = null;
    },
    /** 演出の途中の状態を表示する（確認用。elapsed は速さをかけたあとの経過時間） */
    seek(elapsed) {
      stopUpdater?.();
      applyAt?.(elapsed);
      sm.requestRender();
    },
    /** テスト用：それぞれの展開図の折りたたみの進み具合 */
    getProgress: () => pieces.map((p) => p.model.getProgress()),
    dispose() {
      clear();
      sm.dispose();
    },
  };
}

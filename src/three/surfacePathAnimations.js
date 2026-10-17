/**
 * 立方体の表面の最短経路の演出（AnimationManager で再生するアニメーションを作る）
 *
 * 1. 最短経路を緑で強調（pathHighlight）→ 2. 道にそって点が動く（pathTravel）
 * → 3. 道が通る面を平面に広げ、道が一直線になることを見せる（pathUnfold to: 1）→ 4. 立方体に戻す（pathUnfold to: 0）
 * どれも完了・スキップで最終の状態になる。
 */
import { tween, wait, sequence } from './animationManager.js';
import { easeInOutCubic } from '../utils/easing.js';
import { createCameraMove } from './cubeRotationAnimations.js';

export const createPathHighlight = (surface, { onUpdate = () => {} } = {}) =>
  sequence([
    tween({
      duration: 400,
      onStart: () => (surface.setHighlight(true), onUpdate()),
      onUpdate: () => {},
    }),
    wait(300),
  ]);

export const createPathTravel = (surface, { duration = 1600, onUpdate = () => {} } = {}) =>
  sequence([tween({ duration, onUpdate: (t) => (surface.setTravel(t), onUpdate()) }), wait(200)]);

/** 広げた面がよく見える向き（はじめの面の法線の向きから、少しななめ） */
export function unfoldViewDirection(normal) {
  const n = normal;
  const tilt = [4, 3, 5];
  const d = tilt[0] * n[0] + tilt[1] * n[1] + tilt[2] * n[2];
  const side = tilt.map((x, i) => (x - d * n[i]) * 0.18);
  return n.map((x, i) => x * 6 + side[i]);
}

/**
 * 面を広げる（to = 1）・立方体に戻す（to = 0）。広げるときは、先にカメラを広げた面の正面へ動かす
 */
export function createPathUnfold(surface, { to = 1, controls = null, duration = 1800, onUpdate = () => {} } = {}) {
  const parts = [];
  const normal = surface.getUnfoldNormal?.();
  if (to > 0 && controls && normal) parts.push(createCameraMove(controls, unfoldViewDirection(normal), { duration: 700, onUpdate }));
  let from = 0;
  parts.push(
    tween({
      duration,
      easing: easeInOutCubic,
      onStart: () => {
        from = surface.getUnfold();
      },
      onUpdate: (t) => {
        surface.setUnfold(from + (to - from) * t);
        onUpdate();
      },
    }),
    wait(300),
  );
  return sequence(parts);
}

/**
 * 内接立体・長さと角度の演出（AnimationManager で再生するアニメーションを作る）
 * どれも完了で最終の状態になり（update(1)）、「もう一度見る」でははじめから再生する。
 */
import { tween, wait, sequence } from './animationManager.js';
import { easeInOutCubic } from '../utils/easing.js';

/** 進み具合 0 → 1 の tween（終わったら label を図の右側に出す） */
function step(set, { duration, label = '', setInfo = null, pause = 300, easing = easeInOutCubic, onUpdate }) {
  return sequence([
    tween({
      duration,
      easing,
      onUpdate: (t) => {
        set(t);
        if (t >= 1 && label && setInfo) setInfo(label);
        onUpdate();
      },
    }),
    wait(label ? 600 : pause),
  ]);
}

// ---------- 内接立体（three/inscribedSolidModel） ----------
export const createSolidBuild = (solid, { onUpdate = () => {} } = {}) => step(solid.setBuild, { duration: 1800, onUpdate, easing: (t) => t });
export const createSolidFade = (solid, { onUpdate = () => {} } = {}) => step(solid.setFade, { duration: 600, onUpdate });
export const createSolidLift = (solid, { to = 1, label = '', onUpdate = () => {} } = {}) => step((t) => solid.setLift(t * to), { duration: 700, label, setInfo: solid.setInfo, onUpdate });
export const createSolidSplit = (solid, { label = '', onUpdate = () => {} } = {}) => step(solid.setSplit, { duration: 1200, label, setInfo: solid.setInfo, onUpdate });
export const createSolidRemove = (solid, { label = '', onUpdate = () => {} } = {}) => step(solid.setRemove, { duration: 1500, label, setInfo: solid.setInfo, onUpdate });

// ---------- 長さ・角度（three/cubeMetricModel） ----------
export const createMetricSegments = (metric, { onUpdate = () => {} } = {}) => step(metric.setSegments, { duration: 1200, onUpdate, easing: (t) => t });
export const createMetricTriangle = (metric, { index = 0, label = '', onUpdate = () => {} } = {}) =>
  step((t) => metric.setTriangle(index, t), { duration: 700, label, setInfo: metric.setInfo, onUpdate });
export const createMetricAngle = (metric, { label = '', onUpdate = () => {} } = {}) => step(metric.setAngle, { duration: 900, label, setInfo: metric.setInfo, onUpdate });
export const createMetricExtract = (metric, { label = '', onUpdate = () => {} } = {}) => step(metric.setExtract, { duration: 1400, label, setInfo: metric.setInfo, onUpdate });

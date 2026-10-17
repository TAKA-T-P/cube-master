/**
 * 立方体の切断の演出（AnimationManager で再生するアニメーションを作る）
 *
 * 1. 平面が立方体へ入る（cutPlane）→ 2. 切り口が緑で現れる（cutSection）→ 3. 2つの立体に分かれる（cutSplit）
 * どれも完了・スキップで最終の状態になる（update(1) で最終状態）。
 */
import { tween, wait, sequence } from './animationManager.js';
import { easeInOutCubic } from '../utils/easing.js';

/** 平面が入ってくる */
export const createCutPlane = (cutting, { duration = 1000, onUpdate = () => {} } = {}) =>
  sequence([tween({ duration, easing: easeInOutCubic, onUpdate: (t) => (cutting.setPlane(t), onUpdate()) }), wait(250)]);

/** 切り口が現れる（label：切り口に表示する面積など） */
export const createCutSection = (cutting, { duration = 800, label = '', onUpdate = () => {} } = {}) =>
  sequence([
    tween({
      duration,
      onStart: () => cutting.setValue(label, { at: 'section' }),
      onUpdate: (t) => (cutting.setSection(t), onUpdate()),
    }),
    wait(label ? 700 : 300),
  ]);

/** 2つの立体に分ける（highlightSmall：小さいほうを緑に、label：体積などを表示） */
export function createCutSplit(cutting, { to = 1, duration = 1100, highlightSmall = false, label = '', onUpdate = () => {} } = {}) {
  let from = 0;
  return sequence([
    tween({
      duration,
      easing: easeInOutCubic,
      onStart: () => {
        from = cutting.getSplit();
        if (label) cutting.setValue('', { at: 'piece' });
      },
      onUpdate: (t) => {
        cutting.setSplit(from + (to - from) * t);
        if (t >= 1) {
          cutting.setHighlightSmall(highlightSmall);
          if (label) cutting.setValue(label, { at: 'piece' });
        }
        onUpdate();
      },
    }),
    wait(400),
  ]);
}

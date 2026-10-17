/**
 * 立方体の切断の演出（AnimationManager で再生するアニメーションを作る）
 *
 * 1. 平面（刃）が上から振り下ろされ、切り口が上から順に現れる（cutPlane）→ 2. 板が消えて切り口が残る（cutSection）→ 3. 2つの立体に分かれる（cutSplit）
 * どれも完了・スキップで最終の状態になる（update(1) で最終状態）。
 */
import { tween, wait, sequence } from './animationManager.js';
import { easeInOutCubic, easeInQuad } from '../utils/easing.js';

/** 平面（刃）が上から下へ振り下ろされ、通ったところから切り口が現れる */
export const createCutPlane = (cutting, { duration = 1300, onUpdate = () => {} } = {}) =>
  sequence([tween({ duration, easing: easeInQuad, onUpdate: (t) => (cutting.setPlane(t), onUpdate()) }), wait(300)]);

/** 平面の板が消えて、切り口だけが残る（label：切り口に表示する面積など） */
export const createCutSection = (cutting, { duration = 500, label = '', onUpdate = () => {} } = {}) =>
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

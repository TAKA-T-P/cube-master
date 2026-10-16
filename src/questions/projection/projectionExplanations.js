/**
 * 立方体の見え方の解説文
 */
import { DIRECTION_LABELS } from '../../core/cubeRotations.js';
import { pipLabel } from '../../core/cubeFaceLabels.js';
import { moveEffect } from '../dice/diceExplanations.js';

/** 「真上から」「右側から」などの言い方 */
export const VIEW_PHRASES = Object.freeze({
  top: '真上から',
  bottom: '真下から',
  front: '正面から',
  back: '後ろから',
  right: '右側から',
  left: '左側から',
});

export const explainSingleView = (dir, faceLabel) =>
  `${VIEW_PHRASES[dir]}見ると、${DIRECTION_LABELS[dir]}の面だけがまっすぐ正面に見えます。` +
  `このサイコロの${DIRECTION_LABELS[dir]}の面は${faceLabel}です。ほかの面は真横を向いているので見えません。`;

/** 2・3・6 の目の並び方の言い方（turn = 0 / 90） */
export function pipArrangement(n, turn) {
  if (n === 6) return turn === 0 ? 'たてに2列に並ぶ' : 'よこに2列に並ぶ';
  return turn === 0 ? '右上から左下へななめに並ぶ' : '左上から右下へななめに並ぶ';
}

export function explainPipView(dir, n, turn) {
  const hint =
    dir === 'top'
      ? '真上から見るときは、前の辺が下にくるように向きを考えます。'
      : '真横から見るときは、サイコロの上が上にくるように向きを考えます。';
  return `${hint}${VIEW_PHRASES[dir]}見ると${pipLabel(n)}の面がまっすぐ見え、目は${pipArrangement(n, turn)}ように見えます。`;
}

export const explainTurnedCube = (moveId, view) =>
  `${moveEffect(moveId)}そのため、上は${view.top}、前は${view.front}、右は${view.right}になります。`;

export const explainCornerOrder = (c1, c2, c3) =>
  `${c1}・${c2}・${c3}の3つの面は、1つの頂点に集まっています。` +
  `上 → 前 → 右 と回る順に読んだ並び（${c1} → ${c2} → ${c3}）が同じなら、回して条件どおりに置けます。` +
  '並びが反対回りの図は鏡に映した配置なので、どのように回しても条件どおりにはなりません。';

export const explainImpossible = (mirror) =>
  '3つの図は、もとのサイコロを回すと同じ向きにできます（「もう一度見る」で順番に確かめられます）。' +
  `上 ${mirror.top}・前 ${mirror.front}・右 ${mirror.right} の図だけは、面の並び方が反対回りの、鏡に映した配置です。` +
  '鏡に映した配置は、どのように回しても作れません。';

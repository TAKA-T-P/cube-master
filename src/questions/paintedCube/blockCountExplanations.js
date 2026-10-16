/**
 * 積み木の個数（B09〜B12）の解説文・ヒント。合計の式は問題の配置データから作る
 */

/** 「1段目6個＋2段目4個＋3段目2個＝12個」 */
export const layerFormula = (layers, total) => `${layers.map((l) => `${l.level}段目${l.count}個`).join('＋')}＝${total}個`;

export const explainTotal = (layers, total) =>
  `下の段から順に数えます。${layerFormula(layers, total)}です。積み木は床から隙間なく積んであるので、上に積み木がある場所には、その下にも必ず積み木があります。`;

export const explainHidden = (layers, total, hidden) =>
  `この図では${hidden}個の積み木が、ほかの積み木にかくれて見えません。上に積み木がある場所には、それを支える積み木が下にもあるので、それも数えます。` +
  `段ごとに数えると、${layerFormula(layers, total)}です。`;

export const explainLayer = (level, count, layers) =>
  `下から${level}段目だけを取り出して考えます。${level}段目の積み木は${count}個です。` +
  `（ほかの段は、${layers.filter((l) => l.level !== level).map((l) => `${l.level}段目${l.count}個`).join('・')}）`;

export const explainAdd = (current, target, add) =>
  `完成形は${target}個、今の形は${current}個です。足りない場所に加える積み木は、${target}−${current}＝${add}個です。`;

export const HINTS = Object.freeze({
  B09: 'まず、いちばん下の段に何個あるか数えてみよう。',
  B10: '上に積み木がある場所には、それを支える積み木も必要だよ。',
  B11: '指定された段だけを取り出したつもりで数えてみよう。',
  B12: '完成した形と今の形を比べて、足りない場所を探そう。',
});

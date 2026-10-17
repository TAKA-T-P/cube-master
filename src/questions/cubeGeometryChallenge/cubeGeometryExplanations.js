/**
 * 立方体に隠れた図形・長さ・角度（G01〜G06）の解説文・ヒント
 * 長さ・角度・面積はすべて問題のデータ（core/cubeMetricGeometry の計算結果）から作る。
 */

/** 2乗の表し方（「4²」「(2√5)²」） */
export const sq = (x) => (x.isRational() ? `${x}²` : `(${x})²`);

export const explainFaceDiagonals = ({ face, answers }) =>
  `面${face}の対角線は、面の上で向かい合う頂点を結ぶ線分で、${answers.map((a) => `線分${a}`).join('と')}の2本です。面の辺（となり合う頂点を結ぶ線分）や、立方体の内部を通る線分は、面の対角線ではありません。`;

export const explainMixedFaceDiagonals = ({ answers }) =>
  `面の対角線は、1つの面の上で向かい合う頂点を結ぶ線分です。選択肢の中では${answers.map((a) => `線分${a}`).join('・')}が面の対角線です。立方体の辺や、立方体の内部を通る対角線とは区別しましょう。`;

export const explainSpaceDiagonals = ({ answers }) =>
  `立方体の対角線は、どの面も共有しない（いちばん遠い）2つの頂点を結ぶ線分で、立方体の内部を通ります。立方体の対角線はAG・BH・CE・DFの4本で、選択肢の中では${answers.map((a) => `線分${a}`).join('・')}です。`;

export const explainFaceDiagonalLength = ({ seg, s, length }) =>
  `線分${seg}は面の対角線です。直角をはさむ2辺がどちらも${s}cmの直角二等辺三角形の斜辺なので、三平方の定理から ${seg}²＝${s}²＋${s}²＝${2 * s * s}、${seg}＝${length.format('cm')}です。`;

export const explainSpaceDiagonalLength = ({ seg, mid, s, face, length }) =>
  `線分${seg}は立方体の対角線です。まず面の対角線${mid}の長さは、${mid}²＝${s}²＋${s}²＝${2 * s * s} より${face.format('cm')}。三角形${seg[0]}${mid[1]}${seg[1]}は、頂点${mid[1]}が直角の直角三角形なので、` +
  `${seg}²＝${mid}²＋${mid[1]}${seg[1]}²＝${2 * s * s}＋${s * s}＝${3 * s * s}、${seg}＝${length.format('cm')}です。`;

/** 三角形の形の理由 */
export function explainTriangle({ name, sides, names }) {
  const [a, b, c] = sides.map((x) => x.format('cm'));
  const head = `三角形${names}の3辺の長さは、立方体の1辺を2cmとすると${a}・${b}・${c}です。`;
  if (name === '正三角形') return `${head}3辺がすべて等しいので、正三角形です。`;
  if (name === '直角二等辺三角形') return `${head}2辺が等しく、長い辺の2乗が、ほかの2辺の2乗の和に等しい（三平方の定理）ので、直角二等辺三角形です。`;
  if (name === '直角三角形') return `${head}長い辺の2乗が、ほかの2辺の2乗の和に等しい（三平方の定理）ので直角三角形で、3辺の長さはすべてちがいます。`;
  return `${head}2辺が等しく、どの角も直角ではないので、（直角ではない）二等辺三角形です。`;
}

/** 角の大きさの理由 */
export function explainAngle({ angle, deg, triangle, reason }) {
  return `線分を結んで三角形${triangle}を作ると、${reason}ので、${angle}＝${deg}°です。`;
}

/** 三角形の面積 */
export const explainArea = ({ text }) => text;

// ---------- ヒント（答えそのものは書かない） ----------
export const HINTS = Object.freeze({
  G01: '面の対角線は、1つの面の上で、となり合っていない2つの頂点を結ぶ線分です。',
  G02: '立方体の内部を通る対角線は、同じ面の上にない2つの頂点を結びます。',
  G03: 'その線分を斜辺とする直角三角形を探そう。三平方の定理が使えるよ。',
  G04: '3つの辺の長さを、立方体の辺・面の対角線などと比べてみよう。',
  G05: '角をつくる2本の線分の先を結んで、三角形を作ってみよう。どんな三角形かな？',
  G06: '三角形の形を調べて、底辺と高さを見つけよう。高さは三平方の定理で求められます。',
});

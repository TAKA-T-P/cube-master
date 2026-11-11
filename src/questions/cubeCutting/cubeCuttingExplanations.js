/**
 * 立方体の切断（K01〜K06）の解説文・ヒント
 * 数・長さはすべて問題のデータ（core/cubeCutting の計算結果）から作る。
 */
import { describeEdgePoint } from '../../core/cubeCutting.js';
import { vEq, qvec } from '../../core/rational.js';
import { Surd } from '../../core/surd.js';

/** 形の名前になる理由（「〜ので、正三角形です」） */
export const SHAPE_REASONS = Object.freeze({
  正三角形: '3つの辺の長さがすべて等しい',
  二等辺三角形: '2つの辺の長さが等しい',
  直角三角形: '1つの角が直角な',
  三角形: '辺が3本ある',
  正方形: '4つの辺の長さが等しく、4つの角がすべて直角な',
  長方形: '向かい合う辺がそれぞれ平行で、4つの角がすべて直角な',
  ひし形: '4つの辺の長さは等しいが、角が直角ではない',
  平行四辺形: '向かい合う2組の辺がそれぞれ平行な',
  台形: '向かい合う1組の辺だけが平行な',
  四角形: '辺が4本ある',
  五角形: '5つの面を切って、辺が5本できる',
  正六角形: '6つの辺の長さも、6つの角も、すべて等しい',
  六角形: '6つの面を切って、辺が6本できる',
});

/** 面の名前（「面ABCD・面BCGF」） */
export const facesText = (faces) => faces.map((f) => `面${f}`).join('・');

/**
 * 切り口の頂点の呼び方（問題で示した点はその名前、立方体の頂点は「頂点C」、辺の上の点は「辺CGの中点」など）
 * @param {{ position, edges, vertex }[]} polygon
 * @param {{ position: number[], name: string }[]} given 問題で示した点
 */
export function sectionVertexNames(polygon, given) {
  return polygon.map((v) => {
    const g = given.find((p) => vEq(qvec(p.position), v.position));
    if (g) return g.name;
    if (v.vertex) return `頂点${v.vertex}`;
    const d = describeEdgePoint(v.position, v.edges[0]);
    if (d.kind === 'midpoint') return `辺${d.edge}の中点`;
    if (d.kind === 'vertex') return `頂点${d.vertex}`;
    return `辺${d.edge}を${d.from}側から${d.ratio[0]}:${d.ratio[1]}に分ける点`;
  });
}

/** 長さの一覧（立方体の1辺を2cmとしたとき） */
export function sideLengthsText(sideLengths2) {
  return sideLengths2.map((l2) => Surd.sqrt(l2).format('cm')).join('・');
}

/** 辺の長さに √ が要るか（立方体の1辺を2cmとしたとき） */
export const lengthsNeedRoots = (sideLengths2) => sideLengths2.some((l2) => !Surd.sqrt(l2).isRational());

/**
 * 長さの数を使わずに、どの辺が等しいかを言う（三平方の定理・√ を使わない設定のときの解説）
 * 例：「4つの辺の長さはすべて等しくなります」「向かい合う辺の長さがそれぞれ等しくなります」
 */
export function equalSidesText(sideLengths2) {
  const n = sideLengths2.length;
  const same = (i, j) => sideLengths2[i].eq(sideLengths2[j]);
  if (sideLengths2.every((_, i) => same(i, 0))) return `${n}つの辺の長さはすべて等しくなります`;
  if (n === 4 && same(0, 2) && same(1, 3)) return '向かい合う辺の長さがそれぞれ等しくなります';
  const groups = [];
  sideLengths2.forEach((l, i) => {
    const g = groups.find((x) => sideLengths2[x[0]].eq(l));
    if (g) g.push(i);
    else groups.push([i]);
  });
  const equal = groups.filter((g) => g.length >= 2).map((g) => `${g.length}本`);
  return equal.length === 0 ? 'どの辺も長さがちがいます' : `長さの等しい辺が${equal.join('と')}あります`;
}

/** 2乗の表し方（「4²」「(2√5)²」） */
export const sq = (x) => (x.isRational() ? `${x}²` : `(${x})²`);

/** K01：何角形か */
export function explainSides({ faces, names, polygonName, hasOpposite }) {
  return (
    `3点を通る平面は、立方体の${facesText(faces)}の${faces.length}つの面を切ります。` +
    `切り口の辺は、切った面に1本ずつできるので、切り口は${polygonName}です（頂点は${names.join('・')}）。` +
    (hasOpposite ? '向かい合う面にできる切り口の辺は、平行になります。' : '')
  );
}

/** K02：切り口の頂点がある辺 */
export function explainEdges({ names, extraEdges, givenNames }) {
  return (
    `切り口の頂点は${names.join('・')}の${names.length}つです。${givenNames.join('・')}のある辺のほかに、` +
    `${extraEdges.map((e) => `辺${e}`).join('・')}の上に頂点があります。` +
    '同じ面の上にある2点は直線で結べること、向かい合う面にできる切り口の辺は平行になることを使って、切り口をかいてみましょう。'
  );
}

/** K03：切り口の形の図（equalSides があれば、長さの数の代わりに使う＝√ を出さない） */
export function explainFigure({ name, lengths, equalSides, choiceId }) {
  const head = equalSides ? `切り口は${name}で、${equalSides}。` : `切り口は${name}です。立方体の1辺を2cmとすると、切り口の辺の長さは順に${lengths}です。`;
  return `${head}辺の長さと角の大きさが合っている図は〔choice:${choiceId}〕です。`;
}

/** K04：切り口の形の名前（equalSides があれば、長さの数の代わりに使う＝√ を出さない） */
export function explainShape({ name, names, lengths, equalSides }) {
  // equalSides のときは、形の理由（辺の長さが等しいか・平行か・直角か）だけを書く
  const sides = equalSides ? '' : `立方体の1辺を2cmとすると、切り口の辺の長さは順に${lengths}で、`;
  return `切り口の頂点は${names.join('・')}です。${sides}${SHAPE_REASONS[name]}ので、${name}です。`;
}

// ---------- ヒント（答えそのものは書かない） ----------
export const HINTS = Object.freeze({
  K01: '同じ面の上にある2点を直線で結んでみよう。切り口の辺は、平面が切る面1つに1本ずつできます。',
  K02: '平面が通る辺を探そう。向かい合う面にできる切り口の辺は、平行になります。',
  K03: '切り口の辺の長さを、面の対角線や辺の長さと比べてみよう。等しい辺や直角の角があるかに注目します。',
  K04: '切り口の辺の長さが等しいか、向かい合う辺が平行か、角が直角かを調べよう。',
  K05: '切り口の形を見つけてから、辺の長さを三平方の定理で求めよう。高さや対角線が求められると、面積がわかります。',
  K07: '小さいほうの立体の体積を、1辺を2cmなどの長さにして求めてみよう。立方体の体積でわると、何分の1かがわかります。',
  K06: '小さいほうの立体は、どんな立体になっているかな？ 立方体の辺の上にある長さを使って、底面積と高さを考えよう。',
});

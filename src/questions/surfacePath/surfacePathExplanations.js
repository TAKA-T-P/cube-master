/**
 * 立方体の表面の最短経路（S01〜S06）の解説文・ヒント
 * 長さはすべて問題のデータ（core/cubeSurfacePath の計算結果）から作る。
 */

/** 面の名前（「面ABCDと面BCGF」「面ABCD・面BCGF・面CDHG」） */
export const facesText = (faces) => (faces.length === 2 ? `面${faces[0]}と面${faces[1]}` : faces.map((f) => `面${f}`).join('・'));

/** 2乗の表し方 */
const sq = (x) => `${x}²`;

/** 直角三角形の2辺から長さを求める式 */
export function pythagorasText({ a, b, length2, length, unit = 'cm' }) {
  if (a === 0 || b === 0) return `この直線の長さは${length.format(unit)}です。`;
  return `この直線を斜辺とする直角三角形の、直角をはさむ2辺は${a}${unit}と${b}${unit}なので、三平方の定理から、長さの2乗は${sq(a)}＋${sq(b)}＝${length2}、長さは${length.format(unit)}です。`;
}

/** S03・S05：最短距離 */
export function explainDistance({ faces, from, to, a, b, length2, length, count }) {
  const more = count > 1 ? `（同じ長さの最短経路は${count}本あります）` : '';
  return (
    `${facesText(faces)}を1つの平面に広げると、${from}から${to}までの最短経路は、2点を結ぶ直線になります${more}。` +
    pythagorasText({ a, b, length2, length })
  );
}

/** S05：2面を通る道と3面以上を通る道をくらべる */
export function explainRoutes({ two, many, shortestIsMany, detail }) {
  if (!two) return `2点は向かい合う面の上にあるので、2つの面だけを通って行くことはできません。3つ以上の面を通る道を考えます。${detail}`;
  return (
    `通る面の組み合わせをくらべます。2つの面を通る道でいちばん短いのは${facesText(two.faces)}を通る${two.length}、` +
    `3つ以上の面を通る道でいちばん短いのは${facesText(many.faces)}を通る${many.length}なので、${shortestIsMany ? '3つ以上の面を通る道' : '2つの面を通る道'}のほうが短くなります。` +
    detail
  );
}

/** S01：最短経路が通る辺 */
export function explainEdge({ faces, from, to, edge, where, length, other }) {
  return (
    `${facesText(faces)}を1つの平面に広げると、${from}と${to}を結ぶ直線は、辺${edge}の${where}を通ります。これが最短経路で、立方体の1辺を2cmとすると長さは${length}です。` +
    (other ? `ほかの辺（たとえば辺${other.edge}）を通る道は、いちばん短いものでも${other.length}で、長くなります。` : '')
  );
}

/** S06：最短経路の道を選ぶ */
export function explainChoice({ correctLabels, faces, lengths, unitNote = '立方体の1辺を2cmとすると' }) {
  return (
    `最短経路は、通る面を広げた図の上で一直線になる道です。${correctLabels.join('・')}は、${facesText(faces)}を広げると一直線になります。` +
    `${unitNote}、道の長さは${lengths.map(({ label, length }) => `${label}が${length}`).join('、')}です。`
  );
}

/** S02：2つの道の長さくらべ */
export function explainCompare({ a, b, answer }) {
  const result = answer === 'same' ? 'どちらも同じ長さです' : answer === 'a' ? 'アのほうが短くなります' : 'イのほうが短くなります';
  return (
    `展開図にかいたとき一直線になる道は、その面を通る道の中でいちばん短くなります。` +
    `立方体の1辺を2cmとすると、アの長さは${a}、イの長さは${b}なので、${result}。`
  );
}

/** S04：展開図の上の最短経路 */
export function explainNet({ choiceId, faces, from, to, kinds }) {
  const notes = [];
  if (kinds.includes('bent')) notes.push('途中で折れ曲がっている図は、直線より長くなります');
  if (kinds.includes('longer')) notes.push('別の面を通って一直線になる図は、遠回りで長くなります');
  if (kinds.includes('outside')) notes.push('直線が面からはみ出している図は、立方体の表面の上の道になりません');
  return (
    `最短経路は、通る面を広げた図の上で、2点を結ぶ直線になります。〔choice:${choiceId}〕は、${facesText(faces)}を広げて、${from}と${to}を直線で結んでいます。` +
    (notes.length ? `${notes.join('。')}。` : '')
  );
}

// ---------- ヒント（答えそのものは書かない） ----------
export const HINTS = Object.freeze({
  S01: '2点がのっている面を平面に広げて、2点を直線で結んでみよう。その直線は、どの辺と交わるかな？',
  S02: '2つの道が通る面を、それぞれ展開図にかいてみよう。まっすぐな道はどちらかな？',
  S03: '2つの面を1つの平面に広げて、2点を直線で結ぼう。直角三角形が見つかるかな？',
  S04: '最短経路は、展開図の上でどんな線になるかな？ 面からはみ出していないかも確かめよう。',
  S05: '通る3つの面を平面に広げて、2点を直線で結ぼう。通る面の組み合わせは1通りではありません。',
  S06: '道が通る面を平面に広げたら、どの道がまっすぐになるか考えよう。通る面の組み合わせを変えると、同じ長さの道がほかにもできることがあるよ。',
});

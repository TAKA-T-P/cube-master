/**
 * 立方体に内接する立体と体積（I01〜I06）の解説文・ヒント
 * 数はすべて問題のデータ（core/inscribedSolids の計算結果）から作る。
 */

/** 立体の名前になる理由 */
export const SOLID_REASONS = Object.freeze({
  三角すい: '底面が三角形で、ほかの面がすべて1つの頂点に集まる',
  四角すい: '底面が四角形で、ほかの面がすべて1つの頂点に集まる',
  三角柱: '向かい合う2つの面が平行で合同な三角形で、まわりの面が四角形の',
  四角柱: '向かい合う2つの面が平行で合同な四角形で、まわりの面が四角形の',
});

export function explainName({ count, name, faces, vertices, regular }) {
  return (
    `${count}つの点を結ぶと、頂点が${vertices}つ・面が${faces}つの立体ができます。${SOLID_REASONS[name]}立体なので、${name}です。` +
    (regular ? 'この三角すいは、6本の辺の長さがすべて等しい（どれも面の対角線）ので、正四面体ともいいます。' : '')
  );
}

export const explainOctahedron = () =>
  '6つの面の中心を結ぶと、頂点が6つ・辺が12本・面が8つの立体ができます。8つの面はどれも合同な正三角形（1辺は立方体の1辺の√2/2倍）で、' +
  'どの頂点にも4つの面が集まるので、正八面体です。';

export const explainPyramid = ({ name, baseText, base, height, volume }) =>
  `${name}の底面は${baseText}で、面積は${base}cm²です。高さは、頂点から底面までの距離の${height}cmです。角すいの体積は「底面積×高さ÷3」なので、${base}×${height}÷3＝${volume}cm³です。`;

export const explainRatio = ({ inverse }) =>
  '正八面体は、立方体の中心をはさんで、上下2つの合同な四角すいに分けられます。1つの四角すいの底面は面の中心を結んだ正方形で、面積は立方体の1つの面の1/2、' +
  '高さは立方体の1辺の1/2です。四角すい1つの体積は（立方体の体積）×1/2×1/2÷3＝（立方体の体積）×1/12、2つ合わせて（立方体の体積）×1/6 です' +
  (inverse ? '。だから、立方体の体積は正八面体の体積の6倍です。' : '。');

export const explainRegularTetra = ({ s, corner, cube, volume }) =>
  `この四面体は、立方体から、まわりの4つの三角すいを取り除いた立体です。取り除く三角すいは、どれも直角をはさむ3辺が${s}cmで、体積は${s}×${s}÷2×${s}÷3＝${corner}cm³。` +
  `残りの体積は${cube}−${corner}×4＝${volume}cm³です（立方体の体積の1/3）。`;

export const explainTetra = ({ baseVertices, base, height, volume }) =>
  `この四面体の面${baseVertices}は立方体の面の上にある直角三角形で、面積は${base}cm²です。高さは、残りの頂点からその面までの距離の${height}cmなので、体積は${base}×${height}÷3＝${volume}cm³です。`;

export const explainRemoval = ({ removedText, removed, cube, volume }) => `${removedText}残りの体積は、${cube}−${removed}＝${volume}cm³です。`;

// ---------- ヒント（答えそのものは書かない） ----------
export const HINTS = Object.freeze({
  I01: '点を結んでできる立体の、底面の形と、まわりの面がどう集まっているかを考えよう。',
  I02: '面の中心をとなりどうし結ぶと、どんな形の面がいくつできるかな？',
  I03: '角すいの体積は「底面積×高さ÷3」。高さは、頂点から底面までのまっすぐな距離です。',
  I04: '正八面体を、上と下の2つの四角すいに分けて考えよう。',
  I05: '四面体の1つの面が立方体の面の上にないか探そう。なければ、立方体からまわりの部分を取り除いて考えよう。',
  I06: 'まず、取り除いた立体の体積を「底面積×高さ÷3」で求めよう。',
});

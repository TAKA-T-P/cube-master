/**
 * 小立方体の個数・着色の解説文・ヒント
 */
import { SIDE_NAMES } from '../../core/subdividedCube.js';

export const PAINT_PHRASES = Object.freeze({
  0: '1面も色がついていない',
  1: 'ちょうど1面だけ色がついている',
  2: 'ちょうど2面に色がついている',
  3: '3面に色がついている',
});

/** 塗った面の名前（「上面と前面」「上面・前面・右の面」） */
export function sidesPhrase(sides) {
  const names = sides.map((s) => SIDE_NAMES[s]);
  return names.length === 2 ? `${names[0]}と${names[1]}` : names.join('・');
}

export const size = (n) => `${n}×${n}×${n}`;

/** 6面すべてを塗ったときの、着色面の数ごとの説明 */
export function explainAllSides(n, k, answer) {
  const m = n - 2;
  if (k === 3) return `3面に色がつくのは、大きな立方体の角にある小立方体です。立方体の角は8つあるので、何等分しても${answer}個です。`;
  if (k === 2) {
    return `2面に色がつくのは、大きな立方体の辺にそって並ぶ小立方体のうち、両はしの角をのぞいたものです。` +
      `1本の辺に${m}個ずつあり、辺は12本あるので、12×${m}＝${answer}個です。`;
  }
  if (k === 1) {
    return `1面だけに色がつくのは、大きな立方体の6つの面それぞれの、まわりをのぞいた中央の部分です。` +
      `1つの面に${m}×${m}＝${m * m}個ずつあり、面は6つあるので、6×${m * m}＝${answer}個です。`;
  }
  return `色がつかないのは、表面にふれていない内側の小立方体です。外側を1まわりずつのぞくと、一辺が${n}−2＝${m}個の立方体が残るので、` +
    `${m}×${m}×${m}＝${answer}個です。`;
}

/** 一部の面だけを塗ったとき */
export function explainSomeSides(sides, n, k, answer) {
  const base = `色を塗ったのは${sidesPhrase(sides)}だけです。ほかの面と、切り分けたときの切り口には色がつきません。`;
  if (k === 0) return `${base}塗った面にふれていない小立方体を数えると、${answer}個です。`;
  return `${base}${PAINT_PHRASES[k]}のは、塗った面のうち${k}つにふれている小立方体です。1個ずつ確かめて数えると、${answer}個です。`;
}

/** 2つ以上の条件の合計 */
export function explainCombined(n, counts, parts, answer) {
  const items = counts.map((k, i) => `${k}面の小立方体は${parts[i]}個`).join('、');
  return `${items}です。どちらかにあてはまる小立方体は、合わせて${parts.join('＋')}＝${answer}個です。` +
    `全部で${n * n * n}個の小立方体を、色のついた面の数で分けて考えましょう。`;
}

/** 取り除いたあとの個数 */
export function explainRemoval(n, removedCount, overlap, answer) {
  const total = n * n * n;
  const dup = overlap > 0 ? `取り除いたものの中には、両方に入っている小立方体が${overlap}個あるので、2回数えないようにします。` : '';
  return `はじめは${n}×${n}×${n}＝${total}個です。${dup}取り除いた小立方体は${removedCount}個なので、残りは${total}−${removedCount}＝${answer}個です。`;
}

/** 分けた数を逆算する */
export function explainReverse(k, count, n) {
  const m = n - 2;
  if (k === 2) return `2面に色がつく小立方体は、12本の辺に同じ数ずつ並んでいます。${count}÷12＝${m}なので、1本の辺には角をのぞいて${m}個。両はしの角を加えると、1辺は${m}＋2＝${n}等分です。`;
  if (k === 1) return `1面だけに色がつく小立方体は、6つの面の中央に同じ数ずつあります。${count}÷6＝${m * m}＝${m}×${m}なので、角をのぞいた1列は${m}個。1辺は${m}＋2＝${n}等分です。`;
  return `色がつかない小立方体は、内側の立方体をつくっています。${count}＝${m}×${m}×${m}なので、内側の一辺は${m}個。外側を加えると、1辺は${m}＋2＝${n}等分です。`;
}

// ---------- ヒント（答えそのものは書かない） ----------
export const HINTS = Object.freeze({
  B01: '3つの面が集まるところ（立方体の角）にある小立方体を考えよう。',
  B02: '2面に色がつくのは、立方体の辺の部分です。角の小立方体は3面に色がつくので、数に入れません。',
  B03: '1面だけ色がつくのは、それぞれの面の、まわりをのぞいた中央の部分です。',
  B04: '表面にふれていない内側の部分は、どんな形になっているかな？',
  B05: '色を塗った面がどこで交わっているかに注目しよう。塗っていない面と切り口には色がつきません。',
  B06: '色のついた面の数（0〜3面）ごとに個数を求めてから、条件に合うものを合わせよう。',
  B07: '取り除いた小立方体の中に、2回数えているものがないか確かめよう。',
  B08: 'その数の小立方体が、立方体のどこ（辺・面の中央・内側）に、どのように並んでいるかを考えよう。',
});

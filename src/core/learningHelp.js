/**
 * 学習ヘルプの内容（Three.js・DOM 非依存）
 *
 * 角柱・角すいの体積、立体の種類、正多面体、ねじれの位置のように、問題を解くのに使うけれど、
 * まだ習っていないかもしれない知識を、短い説明と図で確かめられるようにする。
 * 図はどれも一般的な例で、出題中の問題の頂点・辺・答えは使わない（答えがわからないように）。
 *
 * 問題の prerequisites（core/learningPrerequisites）から、その問題で開けるヘルプを決める。
 * 三平方の定理・√ のヘルプはない（その問題は、設定で出題しないことができる）。
 */
import { PREREQUISITES as P } from './learningPrerequisites.js';

export const HELP_TOPICS = Object.freeze([
  {
    id: 'prismVolume',
    title: '角柱の体積の求め方',
    lead: '底面の面積に、高さをかけると体積になります。',
    formula: '体積＝底面積×高さ',
    points: ['底面は、向かい合う2つの合同な面のうちの1つです（図の青い面）。', '高さは、2つの底面のあいだの、底面に垂直な長さです（図のオレンジの線）。', '三角柱でも四角柱でも、同じ式で求められます。'],
    figures: ['prism'],
  },
  {
    id: 'pyramidVolume',
    title: '三角錐・四角錐の体積',
    lead: '角錐の体積は、底面積×高さ÷3で求めます。',
    formula: '体積＝底面積×高さ÷3',
    points: [
      '高さは、頂点から底面に垂直に下ろした線の長さです（図のオレンジの点線）。',
      'ななめの辺の長さを、高さとまちがえないようにしましょう。',
      '同じ底面・同じ高さの角柱とくらべると、体積はちょうど3分の1です。',
    ],
    figures: ['pyramid'],
  },
  {
    id: 'solidTypes',
    title: 'いろいろな立体',
    lead: '立体は、底面の形や、面の数で名前が決まります。',
    points: [
      '角柱：向かい合う2つの底面が合同で平行な立体（三角柱・四角柱など）。',
      '角錐：底面が多角形で、まわりの面が1つの頂点に集まる立体（三角錐・四角錐など）。',
      '面の数で、四面体（面が4つ）・六面体（面が6つ）・八面体（面が8つ）ともいいます。',
      '三角錐は面が4つなので、四面体ともいいます（同じ立体の種類の、べつの呼び方です）。立方体は六面体の1つです。',
    ],
    figures: ['triPrism', 'quadPrism', 'triPyramid', 'quadPyramid', 'hexahedron', 'octahedron'],
  },
  {
    id: 'regularPolyhedra',
    title: '正多面体とは？',
    lead: 'すべての面が同じ正多角形で、どの頂点にも同じ数の面が集まる立体です。',
    points: [
      '正四面体：正三角形の面が4つ（どの頂点にも3つの面が集まる）。',
      '立方体（正六面体）：正方形の面が6つ（どの頂点にも3つの面が集まる）。立方体も正多面体の1つです。',
      '正八面体：正三角形の面が8つ（どの頂点にも4つの面が集まる）。',
      '正多面体は、このほかに正十二面体・正二十面体があり、全部で5種類です。',
    ],
    figures: ['regTetra', 'cube', 'regOcta'],
  },
  {
    id: 'skewLines',
    title: 'ねじれの位置とは？',
    lead: '2本の直線が交わらず、平行でもなく、同じ平面上にもない関係を「ねじれの位置」といいます。',
    points: [
      '平行（青）：同じ向きで、どこまでのばしても交わらない。',
      '交わる（緑）：1つの点で交わる。',
      'ねじれの位置（赤）：交わらず、平行でもない。2本をふくむ平面がない。',
      '見取図では交わって見えても、空間の中では交わっていないことがあります。立方体を回して確かめましょう。',
    ],
    figures: ['skew'],
  },
]);

const TOPIC_BY_PREREQUISITE = Object.freeze({
  [P.PRISM_VOLUME]: 'prismVolume',
  [P.PYRAMID_VOLUME]: 'pyramidVolume',
  [P.SOLID_TYPES]: 'solidTypes',
  [P.REGULAR_POLYHEDRA]: 'regularPolyhedra',
  [P.SKEW_LINES]: 'skewLines',
});

export const getHelpTopic = (id) => HELP_TOPICS.find((t) => t.id === id) ?? null;

/** 問題で開ける学習ヘルプ（問題の prerequisites から。並びは HELP_TOPICS の順） */
export function helpTopicsForQuestion(question) {
  const ids = new Set((question?.prerequisites ?? []).map((p) => TOPIC_BY_PREREQUISITE[p]).filter(Boolean));
  return HELP_TOPICS.filter((t) => ids.has(t.id));
}

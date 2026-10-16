/**
 * 小立方体の個数・着色の問題テンプレート（B01〜B08）
 *
 * 大きな立方体を n 等分した小立方体（core/subdividedCube）と、外側の面の着色（core/cubePainting）から
 *   - 回答前に表示する見取図（scene.preview。type: 'subcubes'）
 *   - 回答後の 3D（scene.subcubes）と、分割 → 分離 → 条件に合う小立方体の強調の演出
 *   - 正解（小立方体を1個ずつ調べて数える）
 * をすべて同じデータから作る。積み木の見え方（投影図）とは別のカテゴリで、投影図は扱わない。
 */
import { BLOCK_VIEW_DIRECTION } from '../../core/blockGeometry.js';
import { createSubdividedCube, cornerSubcubes, edgeSubcubes, columnSubcubes, uniqueSubcubes, removeSubcubes } from '../../core/subdividedCube.js';
import { getCubesByPaintCount, getCubesByPaintCounts, getCubeCountByPaintCount, paintFormula, ALL_SIDES } from '../../core/cubePainting.js';
import { LOCKED_INTERACTION } from '../decoratedCube.js';
import { shuffle } from '../../utils/random.js';
import * as X from './paintedCubeExplanations.js';

export const PAINTED_CUBE_CATEGORY = 'paintedCube';

const plain = (list) => list.map(({ x, y, z }) => ({ x, y, z }));

/**
 * 個数の選択肢（正解 + まぎらわしい数。0 以上・重複なし・4つ）
 * @param {number} answer
 * @param {number[]} candidates まちがえやすい数（先にあるものから使う）
 */
export function countChoices(answer, candidates, { unit = '個', min = 0 } = {}) {
  const options = [answer];
  for (const v of candidates) if (Number.isInteger(v) && v >= min && !options.includes(v) && options.length < 4) options.push(v);
  for (let d = 1; options.length < 4; d++) {
    for (const v of [answer + d, answer - d]) if (v >= min && !options.includes(v) && options.length < 4) options.push(v);
  }
  return options.map((v) => ({ id: String(v), label: `${v}${unit}` }));
}

/** 見取図（回答前に 3D の場所へ出す） */
const subcubeVisual = ({ divisions, paintedFaces = ALL_SIDES, removed = [], showGrid = true, showFront = false }) => ({
  type: 'subcubes',
  divisions,
  paintedFaces: [...paintedFaces],
  removed: plain(removed),
  showGrid,
  viewDirection: [...BLOCK_VIEW_DIRECTION],
  ...(showFront ? { showFront: true } : {}),
});

/** 正解演出：境界線が現れて分かれる → 少しはなれる → 条件に合う小立方体を緑に（ほかは半透明）・個数を表示 */
const revealSteps = (cubes, label) => [
  { type: 'pause', ms: 300 },
  { type: 'divide', duration: 900 },
  { type: 'separate', to: 1, duration: 900 },
  { type: 'highlightSubcubes', cubes: plain(cubes), label },
];

/** 問題オブジェクトを組み立てる（id はエンジンが付ける） */
function assemble(template, base, { question, divisions, paintedFaces = ALL_SIDES, removed = [], preview, choices, answer, explanation, highlight, label }) {
  return {
    templateId: template.id,
    key: `${template.id}:${base.key}`,
    category: PAINTED_CUBE_CATEGORY,
    difficulty: template.difficulty,
    type: 'single',
    question,
    hint: { text: X.HINTS[template.id] },
    scene: {
      model: 'subcubes',
      referenceElements: [],
      cameraPreset: [...BLOCK_VIEW_DIRECTION],
      subcubes: { divisions, paintedFaces: [...paintedFaces], removed: plain(removed) },
      preview: preview ?? subcubeVisual({ divisions, paintedFaces, removed }),
      showLabels: false,
      interaction: { ...LOCKED_INTERACTION },
    },
    choices,
    correctAnswers: [String(answer)],
    explanation: { text: explanation, highlightElements: [], animation: 'highlightElements', reveal: { steps: revealSteps(highlight, label) } },
  };
}

/** 6面すべてを塗った n 等分の立方体で、ちょうど k 面に色がつく小立方体の個数を問う */
function allSidesQuestion(template, base, k, candidates) {
  const n = base.n;
  const spec = { divisions: n };
  const cubes = getCubesByPaintCount(spec, k);
  const answer = cubes.length;
  return assemble(template, base, {
    question: `大きな立方体の表面全体に色を塗り、${X.size(n)}に切り分けました。${X.PAINT_PHRASES[k]}小立方体は何個ですか。`,
    divisions: n,
    choices: countChoices(answer, candidates(n, answer)),
    answer,
    explanation: X.explainAllSides(n, k, answer),
    highlight: cubes,
    label: `${answer}個`,
  });
}

const sizes = (list) => list.map((n) => ({ key: `n${n}`, refs: [], n }));

/** 一部だけ塗る面の組み合わせ（となり合う2面・向かい合う2面・1つの角に集まる3面など） */
const PARTIAL_SIDES = [
  ['top', 'front'],
  ['top', 'right'],
  ['top', 'bottom'],
  ['front', 'back'],
  ['top', 'front', 'right'],
  ['top', 'front', 'back'],
  ['top', 'bottom', 'front'],
];

/** B05 の基準：答えが 1 個以上になる「塗る面 × 数える面の数 × 大きさ」 */
function partialBases() {
  const bases = [];
  for (const sides of PARTIAL_SIDES) {
    for (const n of [3, 4]) {
      const counts = getCubeCountByPaintCount({ divisions: n, paintedFaces: sides });
      for (const k of [1, 2, 3]) {
        if (counts[k] > 0) bases.push({ key: `${sides.join('-')}-${k}-n${n}`, refs: [], sides, k, n, group: `k${k}` });
      }
    }
  }
  return bases;
}

/** B06 の条件 */
const COMBINED = [
  { counts: [0, 1], phrase: '色のついた面が0面または1面である' },
  { counts: [2, 3], phrase: '色のついた面が2面以上である' },
  { counts: [1, 2], phrase: '色のついた面が1面または2面である' },
  { counts: [0, 3], phrase: '色のついた面が0面または3面である' },
];

/** B07 の取り除き方（n = 3, 4） */
function removalPlans(n) {
  const topCorners = cornerSubcubes(n).filter((c) => c.y === n - 1);
  const mid = Math.floor((n - 1) / 2);
  return [
    { key: 'corners2', removed: topCorners.filter((c) => c.z === n - 1), parts: [topCorners.filter((c) => c.z === n - 1)], text: '上の段の、手前の2つの角' },
    { key: 'corners4', removed: topCorners, parts: [topCorners], text: '上の段の4つの角' },
    { key: 'edge', removed: edgeSubcubes(n, 'topFront'), parts: [edgeSubcubes(n, 'topFront')], text: '上の面と前の面が交わる辺にそって並ぶ1列' },
    {
      key: 'cornersEdge',
      removed: uniqueSubcubes([...topCorners, ...edgeSubcubes(n, 'topFront')]),
      parts: [topCorners, edgeSubcubes(n, 'topFront')],
      text: '上の段の4つの角と、上の面と前の面が交わる辺にそって並ぶ1列',
    },
    { key: 'column', removed: columnSubcubes(n, mid, mid), parts: [columnSubcubes(n, mid, mid)], text: '上の面の中央から真下に、下の面までつきぬける1列' },
  ];
}

/** B08：着色面の数と個数から、分けた数がただ1つに決まる組み合わせ */
function reverseBases() {
  const bases = [];
  for (const k of [2, 1, 0]) {
    for (const n of [3, 4, 5]) {
      const count = paintFormula(n)[k];
      // 同じ個数になる別の分け方（2〜8等分）がないものだけ
      const same = [2, 3, 4, 5, 6, 7, 8].filter((m) => paintFormula(m)[k] === count);
      if (count > 0 && same.length === 1) bases.push({ key: `k${k}-n${n}`, refs: [], k, n, count, group: `k${k}` });
    }
  }
  return bases;
}

export const PAINTED_CUBE_TEMPLATES = [
  // ---------------- ★1 基本 ----------------
  {
    id: 'B01',
    difficulty: 1,
    title: '3面に色がつく小立方体',
    bases: () => sizes([2, 3, 4]),
    build(base) {
      return allSidesQuestion(this, base, 3, (n) => [6, 12, 4, 24, n * n, 2 * n]);
    },
  },
  {
    id: 'B02',
    difficulty: 1,
    title: '2面に色がつく小立方体',
    bases: () => sizes([3, 4]),
    build(base) {
      return allSidesQuestion(this, base, 2, (n, a) => [12 * n, 12 * (n - 1), 8, a + 8, a / 2]);
    },
  },
  // ---------------- ★2 標準 ----------------
  {
    id: 'B03',
    difficulty: 2,
    title: '1面だけ色がつく小立方体',
    bases: () => sizes([3, 4, 5]),
    build(base) {
      return allSidesQuestion(this, base, 1, (n) => [6 * n * n, 6 * (n - 1) ** 2, 4 * (n - 2) ** 2, (n - 2) ** 2, 6 * (n - 2)]);
    },
  },
  {
    id: 'B04',
    difficulty: 2,
    title: '色がついていない小立方体',
    bases: () => sizes([3, 4, 5]),
    build(base) {
      return allSidesQuestion(this, base, 0, (n) => [(n - 1) ** 3, (n - 2) ** 2, 6 * (n - 2) ** 2, (n - 2) ** 3 + 1, n]);
    },
  },
  {
    id: 'B05',
    difficulty: 2,
    title: '一部の面だけ着色',
    bases: partialBases,
    build(base) {
      const { sides, k, n } = base;
      const spec = { divisions: n, paintedFaces: sides };
      const cubes = getCubesByPaintCount(spec, k);
      const answer = cubes.length;
      const counts = getCubeCountByPaintCount(spec);
      // まちがい：6面すべてを塗ったときの個数・ほかの面の数の個数・1列の数
      const all = getCubeCountByPaintCount({ divisions: n });
      return assemble(this, base, {
        question: `大きな立方体の${X.sidesPhrase(sides)}だけに色を塗り、${X.size(n)}に切り分けました。${X.PAINT_PHRASES[k]}小立方体は何個ですか。`,
        divisions: n,
        paintedFaces: sides,
        preview: subcubeVisual({ divisions: n, paintedFaces: sides, showFront: true }),
        choices: countChoices(answer, [all[k], counts[k === 3 ? 2 : k + 1], counts[k - 1], n, n - 2, n * n]),
        answer,
        explanation: X.explainSomeSides(sides, n, k, answer),
        highlight: cubes,
        label: `${answer}個`,
      });
    },
  },
  // ---------------- ★3 応用 ----------------
  {
    id: 'B06',
    difficulty: 3,
    title: '条件を満たす小立方体の組み合わせ',
    bases: () => COMBINED.flatMap((c, i) => [4, 5].map((n) => ({ key: `c${i}-n${n}`, refs: [], cond: i, n, group: `c${i}` }))),
    build(base) {
      const { n } = base;
      const cond = COMBINED[base.cond];
      const spec = { divisions: n };
      const cubes = getCubesByPaintCounts(spec, cond.counts);
      const answer = cubes.length;
      const all = getCubeCountByPaintCount(spec);
      const parts = cond.counts.map((k) => all[k]);
      return assemble(this, base, {
        question: `大きな立方体の表面全体に色を塗り、${X.size(n)}に切り分けました。${cond.phrase}小立方体は何個ですか。`,
        divisions: n,
        choices: countChoices(answer, [...parts, n ** 3 - answer, answer + 8, Math.abs(parts[0] - parts[1])], { min: 1 }),
        answer,
        explanation: X.explainCombined(n, cond.counts, parts, answer),
        highlight: cubes,
        label: `${answer}個`,
      });
    },
  },
  {
    id: 'B07',
    difficulty: 3,
    title: '小立方体を取り除く',
    bases: () => [3, 4].flatMap((n) => removalPlans(n).map((p) => ({ key: `${p.key}-n${n}`, refs: [], plan: p.key, n, group: p.key }))),
    build(base) {
      const { n } = base;
      const plan = removalPlans(n).find((p) => p.key === base.plan);
      const all = createSubdividedCube(n).cubes;
      const remaining = removeSubcubes(all, plan.removed);
      const answer = remaining.length;
      const naive = plan.parts.reduce((s, p) => s + p.length, 0); // 重なりを2回数えた数
      const overlap = naive - plan.removed.length;
      return assemble(this, base, {
        question: `${X.size(n)}に分けた立方体から、図の赤い点線で示した${plan.text}の小立方体を取り除きました。残りの小立方体は何個ですか。`,
        divisions: n,
        paintedFaces: [],
        removed: plan.removed,
        choices: countChoices(answer, [n ** 3 - naive, n ** 3, answer + 1, answer - 1, plan.removed.length], { min: 1 }),
        answer,
        explanation: X.explainRemoval(n, plan.removed.length, overlap, answer),
        highlight: [],
        label: `残り${answer}個`,
      });
    },
  },
  {
    id: 'B08',
    difficulty: 3,
    title: '着色面数から分割数を逆算',
    bases: reverseBases,
    build(base, rng) {
      const { k, n, count } = base;
      const cubes = getCubesByPaintCount({ divisions: n }, k);
      const pool = shuffle([n + 1, n - 1, n + 2, n - 2, n + 3].filter((m) => m >= 2), rng);
      return assemble(this, base, {
        question: `表面全体に色を塗った立方体を、同じ大きさの小立方体に切り分けたところ、${X.PAINT_PHRASES[k]}小立方体は${count}個でした。1辺を何等分しましたか。`,
        divisions: n,
        // 回答前は分け方がわからないように、切り分ける前の立方体だけを表示する
        preview: subcubeVisual({ divisions: 1, showGrid: false }),
        choices: countChoices(n, pool, { unit: '等分', min: 2 }),
        answer: n,
        explanation: X.explainReverse(k, count, n),
        highlight: cubes,
        label: `${count}個`,
      });
    },
  },
];

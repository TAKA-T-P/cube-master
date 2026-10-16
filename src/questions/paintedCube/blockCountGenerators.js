/**
 * 立方体の個数・着色：積み木の個数の問題テンプレート（B09〜B12）
 *
 * 積み木の配置データは、積み木の見え方（⑩）と同じ core/blockGeometry の高さマップ・小立方体の一覧を使う。
 * ⑦では投影図ではなく「個数」を問う。見取図（床から隙間なく積む・浮きなし、という条件つき）だけで
 * 個数がただ1つに決まる配置（core/blockCounting の isCountDetermined）だけを出題する。
 *
 * 回答後の 3D では、積み木を段ごとに分けて、各段の個数と合計を表示する（three/blockCountingAnimations）。
 */
import { BLOCK_VIEW_DIRECTION, heightsToCubes, generateHeights, cubesToHeights } from '../../core/blockGeometry.js';
import { countBlocksByLayer, countHiddenBlocks, isCountDetermined, blocksInLayer, blocksToAdd, sumHeights } from '../../core/blockCounting.js';
import { LOCKED_INTERACTION } from '../decoratedCube.js';
import { countChoices, PAINTED_CUBE_CATEGORY } from './paintedCubeGenerators.js';
import { pick } from '../../utils/random.js';
import * as X from './blockCountExplanations.js';

const plain = (list) => list.map(({ x, y, z }) => ({ x, y, z }));

/** 少し回りこんで見る向き（正解演出のはじめに、積み木全体を少し回す） */
export const COUNT_VIEW_DIRECTION = Object.freeze([6.5, 5, 3.5]);

const STATEMENT = '積み木は床から隙間なく積んであり、浮いている積み木はありません。';

const blocksVisual = (cubes, caption) => ({
  type: 'blocks',
  cubes: plain(cubes),
  viewDirection: [...BLOCK_VIEW_DIRECTION],
  arrows: [],
  ...(caption ? { caption } : {}),
});

/**
 * 見取図だけで個数が決まる積み木を作る
 * @param {(cubes) => boolean} accept 追加の条件
 */
function makeCountBlocks(rng, { bases, maxHeight, minCubes, maxCubes, accept = () => true }) {
  for (let attempt = 0; attempt < 400; attempt++) {
    const [width, depth] = pick(bases, rng);
    const heights = generateHeights(rng, { width, depth, maxHeight, minCubes, maxCubes, emptyRate: 0.12 });
    const cubes = heightsToCubes(heights);
    if (isCountDetermined(cubes) && accept(cubes, heights)) return { heights, cubes };
  }
  throw new Error('個数がただ1つに決まる積み木を作れませんでした');
}

function assemble(template, base, { question, cubes, preview, choices, answer, explanation, steps }) {
  return {
    templateId: template.id,
    key: `${template.id}:${base.key}`,
    category: PAINTED_CUBE_CATEGORY,
    difficulty: template.difficulty,
    type: 'single',
    question,
    hint: { text: X.HINTS[template.id] },
    scene: {
      model: 'blocks',
      referenceElements: [],
      cameraPreset: [...BLOCK_VIEW_DIRECTION],
      blocks: plain(cubes),
      arrows: [],
      counting: true, // 段ごとに持ち上げる演出のため、上に余白をとる
      preview: preview ?? blocksVisual(cubes),
      showLabels: false,
      interaction: { ...LOCKED_INTERACTION },
    },
    choices,
    correctAnswers: [String(answer)],
    explanation: { text: explanation, highlightElements: [], animation: 'highlightElements', reveal: { steps } },
  };
}

const variants = (n) => [...Array(n).keys()].map((v) => ({ key: `${v}`, refs: [] }));

export const BLOCK_COUNT_TEMPLATES = [
  {
    id: 'B09',
    difficulty: 1,
    title: '積み木は全部で何個？',
    bases: () => variants(12),
    build(base, rng) {
      const { cubes } = makeCountBlocks(rng, { bases: [[2, 2], [3, 2]], maxHeight: 3, minCubes: 5, maxCubes: 15 });
      const { layers, total } = countBlocksByLayer(cubes);
      const hidden = countHiddenBlocks(cubes).count;
      const visibleTops = cubesToHeights(cubes).flat().filter((h) => h > 0).length;
      return assemble(this, base, {
        question: `この積み木は、小さな立方体を全部で何個使って作られていますか。${STATEMENT}`,
        cubes,
        choices: countChoices(total, [total - hidden, total + 1, total - 1, visibleTops, total + 2], { min: 1 }),
        answer: total,
        explanation: X.explainTotal(layers, total),
        steps: [
          { type: 'camera', direction: [...COUNT_VIEW_DIRECTION], duration: 700 },
          { type: 'countLayers', hidden: [] },
        ],
      });
    },
  },
  {
    id: 'B10',
    difficulty: 2,
    title: '見えない積み木も含めて何個？',
    bases: () => variants(12),
    build(base, rng) {
      const { cubes } = makeCountBlocks(rng, {
        bases: [[3, 3]],
        maxHeight: 4,
        minCubes: 9,
        maxCubes: 24,
        accept: (cs) => countHiddenBlocks(cs).count >= 1 && Math.max(...cs.map((c) => c.y)) >= 1,
      });
      const { layers, total } = countBlocksByLayer(cubes);
      const hidden = countHiddenBlocks(cubes);
      return assemble(this, base, {
        question: `見えていない積み木も含めると、全部で何個ありますか。${STATEMENT}上に積み木がある場所には、その下にも必ず積み木があります。`,
        cubes,
        // まちがい：見えている積み木だけを数えた数・1つちがい
        choices: countChoices(total, [total - hidden.count, total + 1, total - 1, total - hidden.count - 1, total + 2], { min: 1 }),
        answer: total,
        explanation: X.explainHidden(layers, total, hidden.count),
        steps: [
          { type: 'camera', direction: [...COUNT_VIEW_DIRECTION], duration: 700 },
          { type: 'countLayers', hidden: hidden.cubes },
        ],
      });
    },
  },
  {
    id: 'B11',
    difficulty: 2,
    title: '段ごとの個数',
    bases: () => [1, 2, 3].flatMap((level) => [0, 1, 2, 3].map((v) => ({ key: `L${level}-${v}`, refs: [], level, group: `L${level}` }))),
    build(base, rng) {
      const { level } = base;
      const { cubes } = makeCountBlocks(rng, {
        bases: [[3, 3], [3, 2]],
        maxHeight: 4,
        minCubes: 8,
        maxCubes: 22,
        // 2〜4段で、指定する段に積み木があり、段によって個数がちがう
        accept: (cs) => {
          const { layers } = countBlocksByLayer(cs);
          return layers.length >= Math.max(2, level) && layers.length <= 4 && new Set(layers.map((l) => l.count)).size >= 2;
        },
      });
      const { layers, total } = countBlocksByLayer(cubes);
      const answer = layers[level - 1].count;
      return assemble(this, base, {
        question: `この積み木の、下から${level}段目には何個の立方体がありますか。${STATEMENT}`,
        cubes,
        choices: countChoices(answer, [...layers.filter((l) => l.level !== level).map((l) => l.count), answer + 1, answer - 1, total], { min: 1 }),
        answer,
        explanation: X.explainLayer(level, answer, layers),
        steps: [
          { type: 'camera', direction: [...COUNT_VIEW_DIRECTION], duration: 700 },
          { type: 'countLayer', level, cubes: plain(blocksInLayer(cubes, level)) },
        ],
      });
    },
  },
  {
    id: 'B12',
    difficulty: 3,
    title: '完成形にするには、あと何個？',
    bases: () => [2, 3, 4, 5].flatMap((add) => [0, 1, 2].map((v) => ({ key: `a${add}-${v}`, refs: [], add, group: `a${add}` }))),
    build(base, rng) {
      for (let attempt = 0; attempt < 300; attempt++) {
        const { heights } = makeCountBlocks(rng, { bases: [[3, 2], [3, 3]], maxHeight: 3, minCubes: 5, maxCubes: 14 });
        // 完成形：いくつかの柱に積み足す（今の形をふくむ）
        const target = heights.map((row) => [...row]);
        let added = 0;
        for (let guard = 0; added < base.add && guard < 50; guard++) {
          const z = Math.floor(rng() * target.length);
          const x = Math.floor(rng() * target[0].length);
          if (target[z][x] < 4) {
            target[z][x] += 1;
            added += 1;
          }
        }
        if (added !== base.add) continue;
        const current = heightsToCubes(heights);
        const goal = heightsToCubes(target);
        if (!isCountDetermined(goal)) continue;
        const add = blocksToAdd(current, goal);
        if (!add || add.length !== base.add || sumHeights(target) - sumHeights(heights) !== base.add) continue;
        const changedColumns = target.flat().filter((h, i) => h !== heights.flat()[i]).length;
        return assemble(this, base, {
          question: `左の積み木（今の形）に小立方体を加えて、右の完成形にします。あと何個加えればよいですか。どちらも${STATEMENT}`,
          cubes: goal,
          // 2つの図は同じ範囲で描き、小立方体を同じ大きさにする
          preview: { type: 'blocksPair', items: [{ ...blocksVisual(current, '今の形'), fitTo: plain(goal) }, blocksVisual(goal, '完成形')] },
          choices: countChoices(base.add, [base.add + 1, base.add - 1, changedColumns, goal.length, base.add + 2], { min: 1 }),
          answer: base.add,
          explanation: X.explainAdd(current.length, goal.length, base.add),
          steps: [
            { type: 'addBlocks', cubes: add.sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x) },
            { type: 'pause', ms: 300 },
          ],
        });
      }
      throw new Error('完成形の問題を作れませんでした');
    },
  },
];

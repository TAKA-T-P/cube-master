/**
 * 積み木の見え方・投影図の問題テンプレート（V01〜V06）
 *
 * 1つの積み木の配置データ（core/blockGeometry）から、
 *   - 回答前に表示する見取図（scene.preview）
 *   - 回答後の 3D モデル（scene.blocks）
 *   - 正解の投影図（core/blockProjection）
 * をすべて作る。まちがいの図は「左右の反転」「奥の列の見落とし」「高さの1マスちがい」など、
 * よくある考えちがいから作り、正解と同じ形にならないことを確かめる。
 */
import { BLOCK_VIEW_DIRECTION, heightsToCubes, generateHeights, perturbHeights, isBlockStructureReadable, getBlockBounds, blocksKey } from '../../core/blockGeometry.js';
import {
  getProjection,
  getShapeKey,
  columnHeights,
  projectionFromHeights,
  projectionFromCells,
  mirrorProjection,
  flipProjection,
  VIEW_FROM,
  VIEW_NAMES,
  PROJECTION_NAMES,
} from '../../core/blockProjection.js';
import { LOCKED_INTERACTION, figureChoice } from '../decoratedCube.js';
import { relabelByPosition } from '../../core/questionEngine.js';
import { shuffle, pick } from '../../utils/random.js';
import * as X from './projectionExplanations.js';

export const PROJECTION_CATEGORY = 'projection';

/** 真正面から見るカメラの向き（真上はわずかに手前へずらして、手前が下になるようにする） */
export const STRAIGHT_VIEWS = Object.freeze({
  front: [0, 0.02, 1],
  right: [1, 0.02, 0],
  top: [0, 1, 0.05],
  left: [-1, 0.02, 0],
  back: [0, 0.02, -1],
});

/** 難易度ごとの大きさ（底面 横×奥行き・最大の高さ） */
const SIZES = {
  1: { bases: [[2, 2], [3, 2]], maxHeight: 3 },
  2: { bases: [[3, 3]], maxHeight: 4 },
  3: { bases: [[3, 3], [4, 3]], maxHeight: 4 },
};

function makeBlocks(rng, level) {
  const { bases, maxHeight } = SIZES[level];
  const [width, depth] = pick(bases, rng);
  const heights = generateHeights(rng, { width, depth, maxHeight, minCubes: 4, maxCubes: 25 });
  return { heights, cubes: heightsToCubes(heights) };
}

/** 積み木の見取図。矢印のない図は、どちらが正面かわかるように「正面」の文字をつける */
const blocksVisual = (cubes, arrows = [], caption) => ({
  type: 'blocks',
  cubes: cubes.map((c) => ({ ...c })),
  viewDirection: [...BLOCK_VIEW_DIRECTION],
  arrows: [...arrows],
  ...(arrows.length === 0 ? { showFront: true } : {}),
  ...(caption ? { caption } : {}),
});
const projectionVisual = (projection, caption) => ({ type: 'projection', projection, ...(caption ? { caption } : {}) });

/** 問題オブジェクトを組み立てる（id はエンジンが付ける） */
function assemble(template, base, { question, cubes, arrows, preview, visuals = [], choices, correctAnswers, explanation, steps }) {
  return {
    templateId: template.id,
    key: `${template.id}:${base.key}`,
    category: PROJECTION_CATEGORY,
    difficulty: template.difficulty,
    type: 'single',
    question,
    visuals,
    scene: {
      model: 'blocks',
      referenceElements: [],
      cameraPreset: [...BLOCK_VIEW_DIRECTION],
      blocks: cubes.map((c) => ({ ...c })),
      arrows: [...arrows],
      preview: preview ?? blocksVisual(cubes, arrows),
      showLabels: false,
      interaction: { ...LOCKED_INTERACTION },
    },
    choices: relabelByPosition(choices),
    correctAnswers: [...correctAnswers],
    explanation: { text: explanation, highlightElements: [], animation: 'highlightElements', reveal: { steps } },
  };
}

// ---------- まちがいの図 ----------

/** 正面図・側面図のまちがい：左右反転・いちばん手前の列だけ・高さの1マスちがい・ほかの向きの図 */
function sideViewMistakes(cubes, direction) {
  const correct = getProjection(cubes, direction);
  const heights = columnHeights(correct);
  const list = [{ reason: '左右が反対になっています。', projection: mirrorProjection(correct) }];
  // いちばん手前の列だけを見て、奥の高いブロックを見落としたとき
  const nearHeights = nearestLayerHeights(cubes, direction);
  if (nearHeights.some((h) => h > 0)) {
    list.push({ reason: '奥にあるブロックを見落としています。', projection: projectionFromHeights(direction, nearHeights, correct.height) });
  }
  heights.forEach((h, i) => {
    for (const d of [1, -1]) {
      const hs = [...heights];
      hs[i] = h + d;
      if (hs[i] < 0 || hs.every((x) => x === 0)) continue;
      list.push({ reason: `左から${i + 1}列目の高さがちがいます。`, projection: projectionFromHeights(direction, hs, Math.max(correct.height, ...hs)) });
    }
  });
  const other = getProjection(cubes, direction === 'front' ? 'right' : 'front');
  if (other.width === correct.width) list.push({ reason: '別の方向から見た形になっています。', projection: projectionFromCells(direction, other.cells) });
  return uniqueMistakes(correct, list);
}

/** 見る人にいちばん近い列だけの、各列の高さ（正面図・右側面図の並び） */
function nearestLayerHeights(cubes, direction) {
  const { width: W, depth: D } = getBlockBounds(cubes);
  if (direction === 'front') {
    return [...Array(W).keys()].map((x) => Math.max(0, ...cubes.filter((c) => c.z === D - 1 && c.x === x).map((c) => c.y + 1)));
  }
  // 右から見ると、図の左が手前（z = D - 1）
  return [...Array(D).keys()].map((i) => Math.max(0, ...cubes.filter((c) => c.x === W - 1 && c.z === D - 1 - i).map((c) => c.y + 1)));
}

/** 上面図のまちがい：左右反転・前後反転・1マス多い／少ない */
function topViewMistakes(cubes) {
  const correct = getProjection(cubes, 'top');
  const list = [
    { reason: '左右が反対になっています。', projection: mirrorProjection(correct) },
    { reason: '手前と奥が反対になっています。', projection: flipProjection(correct) },
  ];
  correct.cells.forEach((row, r) =>
    row.forEach((v, c) => {
      const cells = correct.cells.map((x) => [...x]);
      cells[r][c] = v ? 0 : 1;
      if (cells.flat().some(Boolean)) list.push({ reason: v ? 'ブロックのあるマスが1つ足りません。' : 'ブロックのないマスまでぬられています。', projection: projectionFromCells('top', cells) });
    }),
  );
  return uniqueMistakes(correct, list);
}

/** 正解と同じ形・同じ形どうしの重なりを除く */
function uniqueMistakes(correct, list) {
  const seen = new Set([getShapeKey(correct)]);
  return list.filter((m) => {
    const key = getShapeKey(m.projection);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** まちがいを3つ選ぶ（最初の理由の種類を優先し、残りはランダム） */
function pickMistakes(mistakes, rng, count = 3) {
  const [first, ...rest] = mistakes;
  return [first, ...shuffle(rest, rng)].filter(Boolean).slice(0, count);
}

export const PROJECTION_TEMPLATES = [
  // ---------------- ★1 きほん ----------------
  {
    id: 'V01',
    difficulty: 1,
    title: '矢印の方向から見た形',
    bases: () => ['front', 'right'].flatMap((dir) => [0, 1, 2, 3, 4, 5, 6, 7].map((v) => ({ key: `${dir}-${v}`, refs: [], dir, group: dir }))),
    build(base, rng) {
      const { cubes } = makeBlocks(rng, 1);
      const correct = getProjection(cubes, base.dir);
      const mistakes = pickMistakes(sideViewMistakes(cubes, base.dir), rng);
      const choices = [
        figureChoice('correct', projectionVisual(correct), `正しい形`),
        ...mistakes.map((m, i) => figureChoice(`mistake-${i}`, projectionVisual(m.projection), m.reason)),
      ];
      return assemble(this, base, {
        question: `矢印の方向（${VIEW_NAMES[base.dir]}）から見たとき、どの形に見えますか。`,
        cubes,
        arrows: [base.dir],
        choices,
        correctAnswers: ['correct'],
        explanation: X.explainSideView(base.dir, columnHeights(correct)),
        steps: [{ type: 'camera', direction: STRAIGHT_VIEWS[base.dir] }],
      });
    },
  },
  {
    id: 'V02',
    difficulty: 1,
    title: '真上から見た形',
    bases: () => [...Array(12).keys()].map((v) => ({ key: `${v}`, refs: [] })),
    build(base, rng) {
      const { cubes } = makeBlocks(rng, 1);
      const correct = getProjection(cubes, 'top');
      const mistakes = pickMistakes(topViewMistakes(cubes), rng);
      const choices = [
        figureChoice('correct', projectionVisual(correct), '正しい形'),
        ...mistakes.map((m, i) => figureChoice(`mistake-${i}`, projectionVisual(m.projection), m.reason)),
      ];
      return assemble(this, base, {
        question: 'この積み木を矢印の方向（真上）から見ると、どの形に見えますか。図は手前が下になるように見たものです。',
        cubes,
        arrows: ['top'],
        choices,
        correctAnswers: ['correct'],
        explanation: X.explainTopView(),
        steps: [{ type: 'camera', direction: STRAIGHT_VIEWS.top }],
      });
    },
  },

  // ---------------- ★2 標準 ----------------
  {
    id: 'V03',
    difficulty: 2,
    title: '正面図と右側面図の組み合わせ',
    bases: () => [...Array(12).keys()].map((v) => ({ key: `${v}`, refs: [] })),
    build(base, rng) {
      const { cubes } = makeBlocks(rng, 2);
      const front = getProjection(cubes, 'front');
      const right = getProjection(cubes, 'right');
      const [wf1, wf2] = pickMistakes(sideViewMistakes(cubes, 'front'), rng, 2);
      const [wr1, wr2] = pickMistakes(sideViewMistakes(cubes, 'right'), rng, 2);
      const pair = (f, r) => ({
        type: 'projectionPair',
        items: [
          { projection: f, caption: '正面図' },
          { projection: r, caption: '右側面図' },
        ],
      });
      const choices = [
        figureChoice('both', pair(front, right), '正面図も右側面図も正しい'),
        figureChoice('frontOnly', pair(front, wr1.projection), '正面図だけ正しい'),
        figureChoice('rightOnly', pair(wf1.projection, right), '右側面図だけ正しい'),
        figureChoice('neither', pair((wf2 ?? wf1).projection, (wr2 ?? wr1).projection), 'どちらもまちがい'),
      ];
      return assemble(this, base, {
        question: 'この積み木の正面図（手前から見た図）と右側面図（右から見た図）の組み合わせとして、正しいものはどれですか。',
        cubes,
        arrows: ['front', 'right'],
        choices,
        correctAnswers: ['both'],
        explanation: X.explainPair(columnHeights(front), columnHeights(right)),
        steps: [
          { type: 'camera', direction: STRAIGHT_VIEWS.front },
          { type: 'pause', ms: 700 },
          { type: 'camera', direction: STRAIGHT_VIEWS.right },
        ],
      });
    },
  },
  {
    id: 'V04',
    difficulty: 2,
    title: '指定方向からの高さ',
    bases: () => ['front', 'right'].flatMap((dir) => [0, 1, 2, 3, 4, 5].map((v) => ({ key: `${dir}-${v}`, refs: [], dir, group: dir }))),
    build(base, rng) {
      const { cubes } = makeBlocks(rng, 2);
      const projection = getProjection(cubes, base.dir);
      const heights = columnHeights(projection);
      const index = Math.floor(rng() * heights.length);
      const k = index + 1;
      const answer = heights[index];
      // まちがい：1マスちがい・左右を反対に数えた列・いちばん高い列
      const candidates = [answer + 1, answer - 1, heights[heights.length - 1 - index], Math.max(...heights), answer + 2, 1, 2, 3, 4];
      const options = [answer];
      for (const n of candidates) if (n >= 1 && n <= 5 && !options.includes(n) && options.length < 4) options.push(n);
      // その列の小立方体（演出で強調する）
      const { depth: D } = getBlockBounds(cubes);
      const columnCubes = base.dir === 'front' ? cubes.filter((c) => c.x === index) : cubes.filter((c) => c.z === D - 1 - index);
      return assemble(this, base, {
        question: `矢印の方向（${VIEW_NAMES[base.dir]}）から見たとき、左から${k}列目の高さは何マスですか。左右は、矢印の方向から見たときの向きで数えます。`,
        cubes,
        arrows: [base.dir],
        choices: shuffle(options, rng).map((n) => ({ id: String(n), label: `${n}マス` })),
        correctAnswers: [String(answer)],
        explanation: X.explainColumnHeight(base.dir, k, answer),
        steps: [
          { type: 'camera', direction: STRAIGHT_VIEWS[base.dir] },
          { type: 'highlightBlocks', cubes: columnCubes },
        ],
      });
    },
  },

  // ---------------- ★3 チャレンジ ----------------
  {
    id: 'V05',
    difficulty: 3,
    title: '3方向の図から立体を推理',
    bases: () => [...Array(12).keys()].map((v) => ({ key: `${v}`, refs: [] })),
    build(base, rng) {
      const { heights, cubes } = makeBlocks(rng, 3);
      const views = ['front', 'right', 'top'];
      const target = views.map((d) => getShapeKey(getProjection(cubes, d)));
      const matches = (cs) => views.filter((d, i) => getShapeKey(getProjection(cs, d)) === target[i]).length;

      // まちがいの積み木：形が読み取れ、3つの図のどれかが合わないもの（2つ合うものを優先）
      const seen = new Set([blocksKey(cubes)]);
      const candidates = [];
      for (const h of perturbHeights(heights, rng)) {
        if (h.some((row) => row.every((v) => v === 0)) || h[0].some((_, x) => h.every((row) => row[x] === 0))) continue;
        const cs = heightsToCubes(h);
        if (cs.length === 0 || !isBlockStructureReadable(cs)) continue;
        const key = blocksKey(cs);
        if (seen.has(key)) continue;
        const m = matches(cs);
        if (m === 3) continue; // 3方向の図が同じ別の立体は、選択肢に入れない
        seen.add(key);
        candidates.push({ cubes: cs, m });
      }
      candidates.sort((a, b) => b.m - a.m);
      const wrong = candidates.slice(0, 3);
      if (wrong.length < 3) throw new Error('まちがいの積み木を作れませんでした');
      const choices = [
        figureChoice('correct', blocksVisual(cubes), '3つの図すべてに合う'),
        ...wrong.map((w, i) => figureChoice(`wrong-${i}`, blocksVisual(w.cubes), `図が${3 - w.m}つ合わない`)),
      ];
      return assemble(this, base, {
        question: '正面図・右側面図・上面図がこのようになる積み木はどれですか。',
        cubes,
        arrows: [],
        preview: {
          type: 'projectionPair',
          items: views.map((d) => ({ projection: getProjection(cubes, d), caption: PROJECTION_NAMES[d] })),
        },
        choices,
        correctAnswers: ['correct'],
        explanation: X.explainThreeViews(),
        steps: [
          { type: 'camera', direction: STRAIGHT_VIEWS.front },
          { type: 'pause', ms: 600 },
          { type: 'camera', direction: STRAIGHT_VIEWS.right },
          { type: 'pause', ms: 600 },
          { type: 'camera', direction: STRAIGHT_VIEWS.top },
        ],
      });
    },
  },
  {
    id: 'V06',
    difficulty: 3,
    title: 'ありえない投影図',
    bases: () => [...Array(12).keys()].map((v) => ({ key: `${v}`, refs: [] })),
    build(base, rng) {
      const { cubes } = makeBlocks(rng, 3);
      const directions = ['front', 'right', 'top', pick(['left', 'back'], rng)];
      const wrongDir = pick(directions, rng);
      const mistakes = wrongDir === 'top' ? topViewMistakes(cubes) : sideViewMistakesFor(cubes, wrongDir);
      const mistake = mistakes[0];
      const choices = directions.map((d) =>
        figureChoice(d, projectionVisual(d === wrongDir ? mistake.projection : getProjection(cubes, d), `${VIEW_FROM[d]}見た図`), `${VIEW_FROM[d]}見た図`),
      );
      return assemble(this, base, {
        question: 'この積み木について、ありえない図はどれですか。',
        cubes,
        arrows: [],
        choices,
        correctAnswers: [wrongDir],
        explanation: X.explainImpossibleView(wrongDir, mistake.reason),
        steps: [{ type: 'camera', direction: STRAIGHT_VIEWS[wrongDir] }],
      });
    },
  },
];

/** 左・後ろから見た図のまちがい（正面図・右側面図と同じ考え方） */
function sideViewMistakesFor(cubes, direction) {
  if (direction === 'front' || direction === 'right') return sideViewMistakes(cubes, direction);
  const correct = getProjection(cubes, direction);
  const heights = columnHeights(correct);
  const list = [{ reason: '左右が反対になっています。', projection: mirrorProjection(correct) }];
  heights.forEach((h, i) => {
    const hs = [...heights];
    hs[i] = h + 1;
    list.push({ reason: `左から${i + 1}列目の高さがちがいます。`, projection: projectionFromHeights(direction, hs, Math.max(correct.height, ...hs)) });
  });
  return uniqueMistakes(correct, list);
}

/**
 * トライアル①「積み木の数はいくつ？」の問題（Three.js・DOM 非依存）
 *
 * 床からすき間なく積んだ積み木（core/blockGeometry の高さマップ）の見取図を見て、小立方体の数を数字で答える。
 * 見取図だけで個数がただ1つに決まる配置だけを出題する（core/blockCounting の isCountDeterminedLarge）。
 */
import { generateHeights, heightsToCubes, getBlockBounds } from '../blockGeometry.js';
import { countBlocksByLayer, countHiddenBlocks, isCountDeterminedLarge } from '../blockCounting.js';
import { pick } from '../../utils/random.js';

/** 難易度ごとの大きさ（底面 横×奥行き・最大の高さ・個数の範囲・見えない積み木が要るか） */
export const BLOCK_COUNT_LEVELS = Object.freeze({
  1: { bases: [[2, 2], [3, 2]], maxHeight: 3, minCubes: 5, maxCubes: 10, minLayers: 2, hidden: false },
  2: { bases: [[3, 2], [3, 3]], maxHeight: 4, minCubes: 8, maxCubes: 16, minLayers: 3, hidden: false },
  3: { bases: [[3, 3], [4, 3]], maxHeight: 5, minCubes: 12, maxCubes: 24, minLayers: 4, hidden: true },
  4: { bases: [[4, 3], [4, 4]], maxHeight: 6, minCubes: 20, maxCubes: 35, minLayers: 4, hidden: true },
});

export const BLOCK_COUNT_STATEMENT = '積み木は床からすき間なく積んであり、浮いている積み木はありません。';

export function generateBlockCountQuestion(difficulty, rng) {
  const level = BLOCK_COUNT_LEVELS[difficulty] ?? BLOCK_COUNT_LEVELS[4];
  for (let attempt = 0; attempt < 200; attempt++) {
    const [width, depth] = pick(level.bases, rng);
    let heights;
    try {
      heights = generateHeights(rng, { width, depth, maxHeight: level.maxHeight, minCubes: level.minCubes, maxCubes: level.maxCubes, emptyRate: 0.1 });
    } catch {
      continue;
    }
    const cubes = heightsToCubes(heights);
    if (getBlockBounds(cubes).height < level.minLayers) continue;
    if (!isCountDeterminedLarge(cubes)) continue;
    const hidden = countHiddenBlocks(cubes);
    if (level.hidden && hidden.count === 0) continue;
    const { layers, total } = countBlocksByLayer(cubes);
    return {
      mode: 'blockCount',
      text: `積み木は全部で何個ありますか。${BLOCK_COUNT_STATEMENT}`,
      heights,
      cubes,
      layers,
      hidden: hidden.cubes,
      answer: total,
    };
  }
  throw new Error('積み木の問題を作れませんでした');
}

/** 入力した数（文字列でもよい）が正しいか */
export function checkBlockCountAnswer(question, answer) {
  const value = typeof answer === 'number' ? answer : /^\d+$/.test(String(answer ?? '').trim()) ? Number(String(answer).trim()) : NaN;
  return { isCorrect: value === question.answer, value: Number.isNaN(value) ? null : value, answer: question.answer };
}

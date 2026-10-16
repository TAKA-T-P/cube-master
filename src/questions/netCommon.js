/**
 * 展開図の問題で共通に使う部品（Three.js・DOM 非依存）
 *
 * 2D の展開図（図・選択肢）と 3D の折りたたみ（scene.net）は、同じセルのデータから作る。
 */
import { CUBE_NETS } from '../core/cubeNetCatalog.js';
import { distinctOrientations, makeCells } from '../core/cubeNet.js';
import { LOCKED_INTERACTION } from './decoratedCube.js';
import { relabelByPosition } from '../core/questionEngine.js';
import { pick } from '../utils/random.js';

/** 平らな展開図を見下ろすカメラの向き（手前が下） */
export const NET_VIEW_DIRECTION = Object.freeze([0, 6, 3.5]);
/** 組み立てた立方体を見る向き */
export const CUBE_VIEW_DIRECTION = Object.freeze([4, 3, 5]);

/** 点のラベル */
export const POINT_LETTERS = Object.freeze('ABCDEFGHIJKLMN'.split(''));
/** 面（マス）のラベル */
export const CELL_LETTERS = Object.freeze(['ア', 'イ', 'ウ', 'エ', 'オ', 'カ', 'キ', 'ク']);

/** 正解の色（3D・図） */
export const TARGET_COLOR = '#f06a00';
export const ANSWER_COLOR = '#22b14c';
export const TARGET_FILL = '#ffd8b0';
export const ANSWER_FILL = '#bfe8c9';

/** 解説で選択肢の記号（ア・イ…）を指す目印。画面に出すときに記号に置きかわる */
export const choiceRef = (id) => `〔choice:${id}〕`;

/** 11種類のうち1つを、ランダムな向きで（セル ID は上の行から f0, f1, …） */
export function randomNet(rng, netId) {
  const net = netId ? CUBE_NETS.find((n) => n.id === netId) : pick(CUBE_NETS, rng);
  const orientation = pick(distinctOrientations(net.cells), rng);
  return { net, cells: makeCells(orientation.map((c) => [c.x, c.y])) };
}

/** 11種類が偏らないように、テンプレートの基準を展開図の種類で作る */
export const netBases = (variants = 2) =>
  CUBE_NETS.flatMap((n) => [...Array(variants).keys()].map((v) => ({ key: `${n.id}-${v}`, refs: [], netId: n.id, group: n.group })));

export const netVisual = (cells, extra = {}) => ({ type: 'net', cells: cells.map((c) => ({ ...c })), ...extra });

/** 回答後の演出：少し止まってから折りたたみ、組み立てた立方体を斜めから見る */
export const FOLD_STEPS = Object.freeze([
  { type: 'pause', ms: 500 },
  { type: 'fold', to: 1, duration: 2600 },
  { type: 'camera', direction: [...CUBE_VIEW_DIRECTION], duration: 900 },
]);

/**
 * 問題オブジェクトを組み立てる（id はエンジンが付ける）
 * @param {{ net?: object|null }} fields net: 3D で折りたたむ展開図（なければ回答後も 3D を出さない）
 */
export function assembleNetQuestion(template, base, category, fields) {
  const { type = 'single', question, preview = null, visuals = [], choices, correctAnswers, explanation, net, steps = FOLD_STEPS } = fields;
  return {
    templateId: template.id,
    key: `${template.id}:${base.key}`,
    category,
    difficulty: template.difficulty,
    type,
    question,
    visuals,
    scene: {
      model: 'net',
      referenceElements: [],
      cameraPreset: [...NET_VIEW_DIRECTION],
      net,
      ...(preview ? { preview } : {}),
      showLabels: false,
      interaction: { ...LOCKED_INTERACTION },
    },
    choices: relabelByPosition(choices),
    correctAnswers: [...correctAnswers],
    explanation: { text: explanation, highlightElements: [], animation: 'highlightElements', reveal: { steps: steps.map((s) => ({ ...s })) } },
  };
}

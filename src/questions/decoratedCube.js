/**
 * 数字・色つき立方体の問題で共通に使うヘルパー（Three.js・DOM 非依存）
 *
 * 「図」（visual）はデータだけを作り、描画は ui/visualChoices.js が行う。
 * 3D 本体と同じ向き・装飾のデータから図を作るので、3D と図が食いちがわない。
 */
import { ROTATION_MOVES, DIRECTION_LABELS, DIRECTIONS } from '../core/cubeRotations.js';
import { byDirection, unknownFace } from '../core/cubeFaceLabels.js';
import { INITIAL_ORIENTATION } from '../core/cubeOrientation.js';
import { DEFAULT_VIEW_DIRECTION } from '../core/cubeConstants.js';
import { relabelByPosition } from '../core/questionEngine.js';

/** 回答前は視点を回せない（答えが見えてしまうため）。回答後は自由に観察できる */
export const LOCKED_INTERACTION = Object.freeze({
  allowCameraRotationBeforeAnswer: false,
  allowZoomBeforeAnswer: true,
  allowCameraRotationAfterAnswer: true,
});

/** 選択肢の記号（並べ替えたあとの位置で付ける） */
export const CHOICE_MARKS = Object.freeze(['ア', 'イ', 'ウ', 'エ', 'オ', 'カ']);

/**
 * 立方体の見取図
 * @param {object} orientation 向き（方向 → 面 ID）
 * @param {Record<string, object>} faces 面 ID → 装飾
 * @param {{ caption?: string, viewDirection?: number[] }} [options]
 */
export const cubeVisual = (orientation, faces, { caption, viewDirection = DEFAULT_VIEW_DIRECTION } = {}) => ({
  type: 'cube',
  orientation: { ...orientation },
  faces: { ...faces },
  viewDirection: [...viewDirection],
  ...(caption ? { caption } : {}),
});

/**
 * 見えている3面（上・前・右）だけの見取図。ほかの面は「？」にする。
 * 鏡に映した配置など、実際の向きでは表せない図に使う。
 * @param {{ top: object, front: object, right: object }} view 装飾
 */
export function viewOnlyVisual(view, options) {
  const faces = Object.fromEntries(DIRECTIONS.map((d) => [INITIAL_ORIENTATION[d], view[d] ?? unknownFace()]));
  return cubeVisual(INITIAL_ORIENTATION, faces, options);
}

/** 回転の手順（矢印つき） */
export const movesVisual = (moveIds) => ({
  type: 'moves',
  moves: moveIds.map((id) => ({ id, icon: ROTATION_MOVES[id].icon, label: ROTATION_MOVES[id].short })),
});

/** 見えていない面の一覧 */
export function hiddenFacesVisual(faces, orientation, directions = ['bottom', 'back', 'left']) {
  const byDir = byDirection(faces, orientation);
  return {
    type: 'faceList',
    title: '見えていない面',
    items: directions.map((d) => ({ direction: d, label: DIRECTION_LABELS[d], face: byDir[d] })),
  };
}

/** 面の色見本つきの選択肢（色の問題） */
export const swatchChoice = (id, decoration, extra = {}) => ({
  id,
  label: decoration.label,
  visual: { type: 'swatch', face: decoration },
  ...extra,
});

/** 図の選択肢（ア〜エは並べ替えたあとに付け直す） */
export const figureChoice = (id, visual, description) => ({
  id,
  label: 'ア',
  labelByPosition: true,
  visual,
  ...(description ? { description } : {}),
});

/**
 * 問題オブジェクトを組み立てる（id はエンジンが付ける）
 */
export function assembleQuestion(template, base, category, fields) {
  const {
    type = 'single',
    question,
    visuals = [],
    choices,
    correctAnswers,
    explanation,
    highlight = [],
    reveal = null,
    scene,
  } = fields;
  return {
    templateId: template.id,
    key: `${template.id}:${base.key}`,
    category,
    difficulty: template.difficulty,
    type,
    question,
    visuals,
    scene: {
      model: scene.model,
      referenceElements: scene.referenceElements ?? [],
      cameraPreset: scene.cameraPreset ?? 'default',
      faces: scene.faces,
      orientation: { ...scene.orientation },
      showLabels: false,
      interaction: { ...LOCKED_INTERACTION, ...(scene.interaction ?? {}) },
    },
    choices: relabelByPosition(choices),
    correctAnswers: [...correctAnswers],
    explanation: {
      text: explanation,
      highlightElements: [...highlight],
      animation: highlight.length > 0 || reveal ? 'highlightElements' : 'none',
      ...(reveal ? { reveal } : {}),
    },
  };
}

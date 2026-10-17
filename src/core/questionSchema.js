/**
 * 問題データの共通スキーマとバリデーション（カテゴリ共通）
 *
 * {
 *   id: string,                    // 出題ごとに一意
 *   templateId: string,            // 問題テンプレート（例 'P01'）
 *   key: string,                   // 重複判定用（テンプレート + 基準要素。例 'P01:AB'）
 *   category: string,              // 'position' など
 *   difficulty: 1 | 2 | 3,
 *   type: 'single' | 'multiple',
 *   question: string,
 *   scene: {
 *     model: 'cube',
 *     referenceElements: string[], // 問題の基準になる頂点・辺・面（オレンジで常時強調）
 *     cameraPreset: 'default' | [x, y, z],  // 初期視点の向き
 *   },
 *   choices: [{ id: string, label: string, elementId?: string, fixed?: boolean }],
 *     // id は任意の文字列（立方体の要素 ID に限らない）
 *     // elementId: 3D 上で対応する要素（誤選択の赤表示に使う）
 *     // fixed: true ならシャッフルせず末尾に置く（「あてはまるものはない」など）
 *   correctAnswers: string[],      // 正解の選択肢 ID
 *   explanation: {
 *     text: string,
 *     highlightElements: string[], // 解説で緑に強調する要素（順番に光る）
 *     animation: 'highlightElements' | 'none',
 *     reveal?: { steps: [...] },   // 正解演出（回転・視点移動）。three/cubeRotationAnimations 参照
 *   },
 * }
 *
 * Phase 2 で追加した項目（すべて省略可。省略時は Phase 1 と同じ動き）
 *   scene.model        : 'cube'（ふつうの立方体） | 'dice'（サイコロ） | 'colorCube'（色） | 'blocks'（積み木）
 *   scene.blocks       : 積み木の小立方体の一覧（blocks のとき必須。core/blockGeometry）
 *   scene.arrows       : 積み木を見る向きの矢印の一覧（'front' | 'right' | 'top' | 'left' | 'back'）
 *   scene.preview      : 回答前に 3D の代わりに表示する静的な図（積み木の見取図・展開図など）
 *   scene.net          : 3D で折りたたむ展開図 { cells, rootId?, cellLabels?, cellFaces?, cellColors?, points?, segments? }
 *   scene.faces        : 面 ID → 装飾（core/cubeFaceLabels）。dice / colorCube では必須
 *   scene.orientation  : はじめの向き（core/cubeOrientation）。dice / colorCube では必須
 *   scene.showLabels   : 頂点ラベル A〜H を表示するか（既定 true）
 *   scene.interaction  : { allowCameraRotationBeforeAnswer, allowZoomBeforeAnswer, allowCameraRotationAfterAnswer }
 *   visuals            : 問題文と一緒に表示する図（見取図・回転の手順・見えていない面の一覧）
 *   choices[].visual   : 選択肢の図（見取図・面・色見本）。図の選択肢は labelByPosition でア〜エを付ける
 *
 * Phase 4 で追加した項目（省略可）
 *   scene.model: 'subcubes' と scene.subcubes { divisions, paintedFaces, removed }（小立方体に分けた立方体。core/subdividedCube）
 *   図の種類 'subcubes'、演出 { type: 'divide' } { type: 'separate', to } { type: 'highlightSubcubes', cubes, label }
 *   hint: { text }  回答前に「ヒントを見る」で表示する短いヒント（答えそのものは書かない）
 *   積み木の個数：scene.counting（段ごとに持ち上げる演出の余白）、図の種類 'blocksPair'（今の形と完成形）、
 *     演出 { type: 'countLayers', hidden } { type: 'countLayer', level, cubes } { type: 'addBlocks', cubes }
 *
 * Phase 7 で追加した項目（省略可）
 *   scene.model: 'cutting' と scene.cutting { points: [{ kind, id, label, position }] }（切る平面を決める3点。core/cubeCutting）
 *     演出 { type: 'cutPlane' } { type: 'cutSection', label? } { type: 'cutSplit', to, highlightSmall?, label? }、図の種類 'section'（切り口の形）
 *   scene.model: 'surfacePath' と scene.surfacePath { points, candidates, solution }（表面の道。core/cubeSurfacePath）
 *     演出 { type: 'pathHighlight' } { type: 'pathTravel' } { type: 'pathUnfold', to }、図の種類 'pathNet'（一部の面の展開図と道）
 *
 * QUESTION_SCHEMA_VERSION：ブラウザに保存した復習用の問題が、今の形と合うかを確かめるための番号。
 * 問題データの形を互換性のない形に変えたときは、この番号を上げる（古い保存データは読み込まずに除外する）。
 */
import { isValidElementId } from './cubeGeometry.js';
import { FACES } from './cubeConstants.js';
import { isValidOrientation } from './cubeOrientation.js';
import { MOVE_IDS } from './cubeRotations.js';
import { getBlockErrors } from './blockGeometry.js';
import { foldNet } from './cubeNetFolding.js';
import { PROJECTION_DIRECTIONS } from './blockProjection.js';
import { isValidDivisions, getSubcubeListErrors, CUBE_SIDES } from './subdividedCube.js';
import { planeFromThreePoints, intersectPlaneWithCube } from './cubeCutting.js';
import { isOnCubeSurface, sharedEdge } from './cubeSurfaceUnfolding.js';
import { isSurfacePolyline } from './cubeSurfacePath.js';

export const QUESTION_SCHEMA_VERSION = 1;

export const SCENE_MODELS = Object.freeze(['cube', 'dice', 'colorCube', 'blocks', 'net', 'subcubes', 'cutting', 'surfacePath']);
export const VISUAL_TYPES = Object.freeze(['cube', 'face', 'swatch', 'pip', 'moves', 'faceList', 'blocks', 'projection', 'projectionPair', 'net', 'subcubes', 'blocksPair', 'section', 'pathNet']);

/** 立方体の表面の点の一覧として正しいか */
const surfacePointsValid = (points, count) => Array.isArray(points) && (count === undefined || points.length === count) && points.every((p) => isOnCubeSurface(p?.position));

/** 切断の 3D：3点が表面の上にあり、立方体を2つに分ける平面が決まる */
function getCuttingErrors(cutting) {
  if (!cutting || !surfacePointsValid(cutting.points, 3)) return ['scene.cutting.points は表面の上の3点'];
  const plane = planeFromThreePoints(...cutting.points.map((p) => p.position));
  if (!plane || !intersectPlaneWithCube(plane).valid) return ['scene.cutting の3点で、立方体を切る平面が決まりません'];
  return [];
}

/** 最短経路の 3D：点・道が表面の上にあり、広げる面がとなり合って並んでいる */
function getSurfacePathErrors(sp) {
  const errors = [];
  if (!sp || !surfacePointsValid(sp.points)) return ['scene.surfacePath.points は表面の上の点'];
  const lines = [...(sp.candidates ?? []).map((c) => c?.polyline), ...(sp.solution?.polylines ?? [])];
  for (const line of lines) {
    if (!Array.isArray(line) || !line.every((p) => isOnCubeSurface(p)) || !isSurfacePolyline(line)) errors.push('scene.surfacePath の道が表面の上にありません');
  }
  const faces = sp.solution?.unfold?.faces;
  if (faces !== undefined && (!Array.isArray(faces) || faces.length === 0 || faces.some((f, i) => i > 0 && !sharedEdge(faces[i - 1], f)))) errors.push('scene.surfacePath の広げる面が不正です');
  return errors;
}
const INTERACTION_KEYS = ['allowCameraRotationBeforeAnswer', 'allowZoomBeforeAnswer', 'allowCameraRotationAfterAnswer'];

export class QuestionValidationError extends Error {
  constructor(errors, question) {
    super(`問題データが不正です（${question?.id ?? 'id なし'}）: ${errors.join(' / ')}`);
    this.name = 'QuestionValidationError';
    this.errors = errors;
  }
}

const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;

/** 問題データのエラー一覧（空配列なら正常） */
export function getQuestionErrors(q) {
  const errors = [];
  if (!q || typeof q !== 'object') return ['問題がオブジェクトではありません'];

  for (const key of ['id', 'templateId', 'key', 'category', 'question']) {
    if (!isNonEmptyString(q[key])) errors.push(`${key} が空です`);
  }
  if (![1, 2, 3].includes(q.difficulty)) errors.push('difficulty は 1〜3');
  if (!['single', 'multiple'].includes(q.type)) errors.push('type は single / multiple');

  // 選択肢
  const choices = Array.isArray(q.choices) ? q.choices : [];
  if (choices.length < 2) errors.push('選択肢は2つ以上必要です');
  const ids = choices.map((c) => c?.id);
  if (new Set(ids).size !== ids.length) errors.push('選択肢 ID が重複しています');
  for (const c of choices) {
    if (!isNonEmptyString(c?.id) || !isNonEmptyString(c?.label)) errors.push('選択肢に id / label がありません');
    if (c?.elementId !== undefined && !isValidElementId(c.elementId)) errors.push(`選択肢の elementId が無効です: ${c.elementId}`);
  }
  const labels = choices.map((c) => c?.label);
  if (new Set(labels).size !== labels.length) errors.push('選択肢の表示名が重複しています');

  // 正解
  const correct = Array.isArray(q.correctAnswers) ? q.correctAnswers : [];
  if (correct.length === 0) errors.push('正解がありません');
  if (new Set(correct).size !== correct.length) errors.push('正解が重複しています');
  for (const a of correct) if (!ids.includes(a)) errors.push(`正解 ${a} が選択肢にありません`);
  if (q.type === 'single' && correct.length !== 1) errors.push('single 問題の正解は1つです');
  if (q.type === 'multiple' && correct.length >= choices.length) errors.push('すべての選択肢が正解になっています');

  for (const c of choices) {
    if (c?.visual !== undefined && !VISUAL_TYPES.includes(c.visual?.type)) errors.push(`選択肢の図の種類が不正です: ${c.visual?.type}`);
  }

  // 3D シーン
  const scene = q.scene;
  if (!scene || !SCENE_MODELS.includes(scene.model)) errors.push(`scene.model は ${SCENE_MODELS.join(' / ')}`);
  if (scene?.model === 'net') {
    // 3D で折りたたむ展開図は、立方体の展開図でなければならない
    if (!scene.net || !Array.isArray(scene.net.cells) || !foldNet(scene.net.cells, { rootId: scene.net.rootId }).valid) errors.push('scene.net が立方体の展開図ではありません');
    if (scene.preview !== undefined && !VISUAL_TYPES.includes(scene.preview?.type)) errors.push('scene.preview が不正です');
  } else if (scene?.model === 'blocks') {
    for (const e of getBlockErrors(scene.blocks)) errors.push(`scene.blocks: ${e}`);
    if (!Array.isArray(scene.arrows) || !scene.arrows.every((a) => PROJECTION_DIRECTIONS.includes(a))) errors.push('scene.arrows が不正です');
    if (scene.counting !== undefined && typeof scene.counting !== 'boolean') errors.push('scene.counting は true / false');
    if (scene.preview !== undefined && !VISUAL_TYPES.includes(scene.preview?.type)) errors.push('scene.preview が不正です');
  } else if (scene?.model === 'subcubes') {
    const sc = scene.subcubes;
    if (!sc || !isValidDivisions(sc.divisions)) errors.push('scene.subcubes.divisions が不正です');
    else {
      if (!Array.isArray(sc.paintedFaces) || !sc.paintedFaces.every((f) => CUBE_SIDES.includes(f))) errors.push('scene.subcubes.paintedFaces が不正です');
      for (const e of getSubcubeListErrors(sc.removed ?? [], sc.divisions)) errors.push(`scene.subcubes.removed: ${e}`);
    }
    if (scene.preview !== undefined && !VISUAL_TYPES.includes(scene.preview?.type)) errors.push('scene.preview が不正です');
  } else if (scene?.model === 'cutting') {
    errors.push(...getCuttingErrors(scene.cutting));
  } else if (scene?.model === 'surfacePath') {
    errors.push(...getSurfacePathErrors(scene.surfacePath));
  } else if (scene && scene.model !== 'cube') {
    const faces = scene.faces ?? {};
    for (const f of FACES) {
      const d = faces[f.id];
      if (!d || !isNonEmptyString(d.label) || !isNonEmptyString(d.color)) errors.push(`面 ${f.id} の装飾がありません`);
    }
    if (!isValidOrientation(scene.orientation)) errors.push('scene.orientation が正しい向きではありません');
  }
  if (scene?.interaction !== undefined) {
    for (const k of INTERACTION_KEYS) if (typeof scene.interaction[k] !== 'boolean') errors.push(`scene.interaction.${k} は true / false`);
  }

  // 問題の図
  if (q.visuals !== undefined) {
    if (!Array.isArray(q.visuals)) errors.push('visuals は配列');
    else for (const v of q.visuals) if (!VISUAL_TYPES.includes(v?.type)) errors.push(`図の種類が不正です: ${v?.type}`);
  }
  for (const id of scene?.referenceElements ?? []) {
    if (!isValidElementId(id)) errors.push(`基準要素が無効です: ${id}`);
  }
  const preset = scene?.cameraPreset;
  if (!(preset === 'default' || (Array.isArray(preset) && preset.length === 3 && preset.every(Number.isFinite)))) {
    errors.push('cameraPreset が不正です');
  }

  // 解説
  if (!isNonEmptyString(q.explanation?.text)) errors.push('解説文がありません');
  for (const id of q.explanation?.highlightElements ?? []) {
    if (!isValidElementId(id)) errors.push(`解説の強調要素が無効です: ${id}`);
  }
  const reveal = q.explanation?.reveal;
  if (reveal !== undefined) {
    if (!Array.isArray(reveal?.steps)) errors.push('reveal.steps は配列');
    for (const step of reveal?.steps ?? []) {
      if (step.type === 'rotate') {
        if (!Array.isArray(step.moves) || !step.moves.every((m) => MOVE_IDS.includes(m))) errors.push('reveal の回転が不正です');
      } else if (step.type === 'camera') {
        if (!Array.isArray(step.direction) || step.direction.length !== 3 || !step.direction.every(Number.isFinite)) errors.push('reveal のカメラの向きが不正です');
      } else if (step.type === 'fold') {
        if (!(step.to >= 0 && step.to <= 1)) errors.push('reveal の折りたたみが不正です');
      } else if (step.type === 'highlightBlocks') {
        if (!Array.isArray(step.cubes)) errors.push('reveal の強調する小立方体が不正です');
      } else if (step.type === 'separate') {
        if (!(step.to >= 0 && step.to <= 1)) errors.push('reveal の分離が不正です');
      } else if (step.type === 'highlightSubcubes') {
        if (!Array.isArray(step.cubes) || getSubcubeListErrors(step.cubes, scene?.subcubes?.divisions ?? 0).length > 0) errors.push('reveal の強調する小立方体が不正です');
      } else if (step.type === 'countLayers' || step.type === 'countLayer' || step.type === 'addBlocks') {
        // 積み木の個数の演出：対象の小立方体は、どれも scene.blocks の中にある
        const keys = new Set((scene?.blocks ?? []).map((c) => `${c.x},${c.y},${c.z}`));
        const list = step.type === 'countLayers' ? step.hidden ?? [] : step.cubes;
        if (scene?.model !== 'blocks' || !Array.isArray(list) || !list.every((c) => keys.has(`${c?.x},${c?.y},${c?.z}`))) errors.push(`reveal の ${step.type} が不正です`);
        if (step.type === 'countLayer' && !(Number.isInteger(step.level) && step.level >= 1)) errors.push('reveal の段の指定が不正です');
      } else if (step.type === 'cutPlane' || step.type === 'cutSection' || step.type === 'cutSplit') {
        if (scene?.model !== 'cutting') errors.push(`reveal の ${step.type} は切断の問題だけ`);
        if (step.type === 'cutSplit' && !(step.to >= 0 && step.to <= 1)) errors.push('reveal の切り分けが不正です');
      } else if (step.type === 'pathHighlight' || step.type === 'pathTravel' || step.type === 'pathUnfold') {
        if (scene?.model !== 'surfacePath') errors.push(`reveal の ${step.type} は最短経路の問題だけ`);
        if (step.type === 'pathUnfold' && !(step.to >= 0 && step.to <= 1)) errors.push('reveal の展開が不正です');
      } else if (step.type !== 'pause' && step.type !== 'divide') errors.push(`reveal の種類が不正です: ${step.type}`);
    }
  }
  // ヒント
  if (q.hint !== undefined && !isNonEmptyString(q.hint?.text)) errors.push('hint.text が空です');
  return errors;
}

/** 不正なら QuestionValidationError を投げる */
export function assertValidQuestion(q) {
  const errors = getQuestionErrors(q);
  if (errors.length > 0) throw new QuestionValidationError(errors, q);
  return q;
}

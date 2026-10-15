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
 *   },
 * }
 */
import { isValidElementId } from './cubeGeometry.js';

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

  // 3D シーン
  const scene = q.scene;
  if (!scene || scene.model !== 'cube') errors.push('scene.model は cube');
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
  return errors;
}

/** 不正なら QuestionValidationError を投げる */
export function assertValidQuestion(q) {
  const errors = getQuestionErrors(q);
  if (errors.length > 0) throw new QuestionValidationError(errors, q);
  return q;
}

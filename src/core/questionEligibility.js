/**
 * 出題してよい問題かどうかの判定（プレイ形式 × 問題に必要な知識。Three.js・DOM 非依存）
 *
 * - 通常トレーニング：タイトル画面の「三平方の定理・√を使う問題」の設定に従う（出題しない＝初期値）
 * - 1分チャレンジ・段位認定：設定にかかわらず、三平方の定理・√ が必要な問題は出題しない
 *   （限られた時間で立体の構造・位置関係を判断するゲームなので、計算の量で有利・不利が出ないようにする）
 * - 復習：一度出題した問題をそのまま解き直すので、判定しない
 *
 * 判定は問題ごと（生成した問題の prerequisites）に行う。同じテンプレートでも、√ が要る問題と要らない問題がある。
 * テンプレートの advanced：'always'（いつも √ が要る。出題しないなら候補から外す）・'sometimes'（問題によって要る）
 */
import { ADVANCED_MATH } from './learningPrerequisites.js';

export const PLAY_MODES = Object.freeze({ TRAINING: 'training', CHALLENGE: 'timedChallenge', CERTIFICATION: 'certification' });

/** 三平方の定理・√ が必要な問題か */
export const requiresAdvancedMath = (question) => (question?.prerequisites ?? []).some((p) => ADVANCED_MATH.includes(p));

/** このプレイ形式・設定で、三平方の定理・√ が必要な問題を出してよいか（設定を見るのは通常トレーニングだけ） */
export function allowsAdvancedMath(mode, settings) {
  return mode === PLAY_MODES.TRAINING && Boolean(settings?.allowPythagoreanQuestions);
}

/** 出題してよい問題か */
export const isQuestionEligible = (question, mode, settings) => allowsAdvancedMath(mode, settings) || !requiresAdvancedMath(question);

/** テンプレートを候補に入れてよいか（いつも √ が要るテンプレートは、出してよくなければ外す） */
export const isTemplateAvailable = (template, allowAdvanced) => allowAdvanced || template.advanced !== 'always';

/** 出題できる問題がないとき（難易度を勝手に変えたり、設定を勝手に変えたりしない） */
export class NoEligibleQuestionError extends Error {
  constructor(message = 'この条件で出題できる問題がありません') {
    super(message);
    this.name = 'NoEligibleQuestionError';
  }
}

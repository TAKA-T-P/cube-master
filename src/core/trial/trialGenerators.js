/**
 * トライアルの問題の作り方と判定（4種類をまとめる窓口。Three.js・DOM 非依存）
 */
import { generateBlockCountQuestion, checkBlockCountAnswer } from './blockCountTrial.js';
import { generateProjectionQuestion, checkProjectionAnswer } from './projectionTrial.js';
import { generateDiceRollQuestion, checkDiceRollAnswer } from './diceRollTrial.js';
import { generateNetPartitionQuestion, checkNetPartitionAnswer } from './netPartitionTrial.js';

const MODES = {
  blockCount: { generate: generateBlockCountQuestion, check: checkBlockCountAnswer },
  projectionDraw: { generate: generateProjectionQuestion, check: checkProjectionAnswer },
  diceRoll: { generate: generateDiceRollQuestion, check: checkDiceRollAnswer },
  netPartition: { generate: generateNetPartitionQuestion, check: checkNetPartitionAnswer },
};

/** 問題を作る（difficulty：1〜4） */
export function generateTrialQuestion(mode, difficulty, rng = Math.random) {
  const m = MODES[mode];
  if (!m) throw new Error(`トライアルの種類が不正です: ${mode}`);
  return m.generate(difficulty, rng);
}

/** 回答を判定する（{ isCorrect, ... }） */
export function checkTrialAnswer(question, answer) {
  const m = MODES[question?.mode];
  if (!m) throw new Error(`トライアルの問題が不正です: ${question?.mode}`);
  return m.check(question, answer);
}

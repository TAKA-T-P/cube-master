/**
 * 回答後の演出の速さ（プレイ形式ごと。Three.js・DOM 非依存）
 *
 * - TRAINING_REVEAL：通常トレーニング。学習を優先し、折りたたみ・回転の途中を十分に見られるふつうの速さ
 * - TIMED_REVEAL：1分チャレンジ・段位認定。テンポを優先し、途中の動きは省かずに速く再生する。長い演出も revealMaxMs で最終状態にする
 *
 * どちらも演出の間はタイマーが止まっているので、演出の長さで考える時間が変わることはない。
 */
export const TRAINING_REVEAL = Object.freeze({
  splashMs: 1000, // 「○△×」の表示
  revealSpeed: 1,
});

export const TIMED_REVEAL = Object.freeze({
  countdownMs: 3000, // 3・2・1・START!
  splashMs: 500,
  revealSpeed: 2.5,
  revealMaxMs: 3200,
  advanceDelayMs: 600, // 演出のあと、次の問題へ進むまで
});

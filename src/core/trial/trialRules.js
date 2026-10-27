/**
 * トライアル（90秒・LEVEL アップチャレンジ）のルール（Three.js・DOM 非依存）
 *
 * 4種類のトライアルから1つを選び、その種類の問題だけを90秒間出題する。
 * スコアは LEVEL だけ：LEVEL 1 から始め、正解で +1（展開図に分けろ！だけ +2）、不正解で −1（1 より下がらない・上限なし）。
 * そのプレイで到達した最大の LEVEL（highestLevel）が正式な記録。
 * 問題の難易度は、正解・不正解のあとに変わった LEVEL で決める（LEVEL 5 ごとに ★〜★★★★）。
 */

export const TRIAL_RULES = Object.freeze({
  durationMs: 90000,
  countdownMs: 3000, // 3・2・1・START!
  splashMs: 500, // 回答直後の「○×」
  revealSpeed: 2, // 3D の演出の速さ（途中の動きは省かない）
  revealMaxMs: 6000, // 演出がこれより長ければ最終状態にして次の問題へ
  advanceDelayMs: 900, // 演出のあと、次の問題へ進むまで（正しい答えを読む時間）
  startLevel: 1,
  minLevel: 1,
});

/** 4種類のトライアル（表示の順） */
export const TRIAL_MODES = Object.freeze([
  Object.freeze({
    id: 'blockCount',
    name: '積み木の数はいくつ？',
    description: '見取図から、積み木の数を数字で答えよう。',
    rules: ['積み木は床からすき間なく積んであり、浮いている積み木はありません。', '見えない積み木も数えて、全部で何個かを数字で入力します。'],
    gain: 1,
  }),
  Object.freeze({
    id: 'projectionDraw',
    name: '3方向から見ると？',
    description: '前・右・上から見た形を、マスを塗ってかこう。',
    rules: ['積み木を、指定された方向（前・右・上）から見た形をマスに塗ります。', '左右にずれていても形が合っていれば正解です（上下の位置・向きは変えません）。'],
    gain: 1,
  }),
  Object.freeze({
    id: 'diceRoll',
    name: 'サイコロを転がすと？',
    description: '道にそって転がしたあと、上の面の目を答えよう。',
    rules: ['サイコロを、点線のマスにそって1マスずつ転がします。', '最後のマス（赤いマス）に着いたとき、上になる面の目を答えます。', 'サイコロの向かい合う面の目をたすと、7になります。'],
    gain: 1,
  }),
  Object.freeze({
    id: 'netPartition',
    name: '展開図に分けろ！',
    description: '図形を色でぬり分けて、立方体の展開図に分けよう。',
    rules: ['いくつかの立方体の展開図をつなげた図形です。', '色をえらんでマスをぬり、同じ色の6マスがそれぞれ立方体の展開図になるように分けます（1色は6マスまで）。', 'お手本とちがう分け方でも、どれも展開図になっていれば正解です。正解すると LEVEL +2！'],
    gain: 2,
  }),
]);

export const TRIAL_MODE_IDS = Object.freeze(TRIAL_MODES.map((m) => m.id));
export const getTrialMode = (id) => TRIAL_MODES.find((m) => m.id === id) ?? null;
export const isTrialMode = (id) => TRIAL_MODE_IDS.includes(id);

/** LEVEL の難易度（1：★ LEVEL 1〜5、2：★★ 6〜10、3：★★★ 11〜15、4：★★★★ 16 以上） */
export function difficultyForLevel(level) {
  if (level <= 5) return 1;
  if (level <= 10) return 2;
  if (level <= 15) return 3;
  return 4;
}

export const difficultyStars = (difficulty) => '★'.repeat(difficulty);

/** 回答したあとの LEVEL（正解で +gain、不正解で −1。下限は minLevel） */
export function levelAfter(level, isCorrect, modeId, rules = TRIAL_RULES) {
  const gain = getTrialMode(modeId)?.gain ?? 1;
  return isCorrect ? level + gain : Math.max(rules.minLevel, level - 1);
}

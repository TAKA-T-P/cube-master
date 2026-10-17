/**
 * 段位認定の 90 秒タイマー（Three.js・DOM 非依存）
 *
 * 回答できる状態だった時間だけを数える。setInterval の回数ではなく、単調に増える時計（performance.now など）の
 * 差から計算するので、画面の更新が遅れても時間がずれない。
 *
 *   残り時間 = durationMs + ボーナス − ペナルティ − （止めているあいだを除いた経過時間）   … 0 未満にはならない
 *
 * state：'ready'（まだ始めていない）| 'running'（進んでいる）| 'paused'（止まっている）| 'finished'（終了）
 * pause / resume を2回続けて呼んでも、時間はずれない（2回目は何もしない）。
 */
const defaultNow = () => (globalThis.performance?.now ? globalThis.performance.now() : Date.now());

export function createCertificationTimer({ durationMs, now = defaultNow } = {}) {
  let state = 'ready';
  let elapsedActiveMs = 0;
  let runningSince = null;
  let penaltyMs = 0;
  let bonusMs = 0;

  const activeMs = (t = now()) => elapsedActiveMs + (state === 'running' ? Math.max(0, t - runningSince) : 0);
  const remainingAt = (t) => Math.max(0, durationMs + bonusMs - penaltyMs - activeMs(t));

  const timer = {
    get state() {
      return state;
    },
    durationMs,
    /** 始める（ready のときだけ） */
    start() {
      if (state !== 'ready') return false;
      state = 'running';
      runningSince = now();
      return true;
    },
    /** 止める（進んでいるときだけ。止めた時点の時刻で時間を確定する） */
    pause() {
      if (state !== 'running') return false;
      const t = now();
      elapsedActiveMs += Math.max(0, t - runningSince);
      runningSince = null;
      state = 'paused';
      if (remainingAt(t) <= 0) state = 'finished';
      return true;
    },
    /** 再開する（止まっているときだけ。時間が残っていなければ終了） */
    resume() {
      if (state !== 'paused') return false;
      if (remainingAt(now()) <= 0) {
        state = 'finished';
        return false;
      }
      state = 'running';
      runningSince = now();
      return true;
    },
    /** 終了する（どの状態からでも。終了したあとは時間が変わらない） */
    stop() {
      if (state === 'running') {
        elapsedActiveMs += Math.max(0, now() - runningSince);
        runningSince = null;
      }
      state = 'finished';
    },
    /** 残り時間を減らす（誤答のペナルティ。0 未満にはならない） */
    penalize(ms) {
      if (state === 'finished') return;
      penaltyMs += Math.max(0, ms);
      if (remainingAt(now()) <= 0 && state !== 'running') state = 'finished';
    },
    /** 残り時間を増やす（多答問題の正解ボーナス。終了したあとは増やさない） */
    addTime(ms) {
      if (state === 'finished') return;
      bonusMs += Math.max(0, ms);
    },
    getRemainingMs: () => remainingAt(now()),
    getBonusMs: () => bonusMs,
    /** 回答できる状態だった時間（止めていたあいだはふくまない） */
    getElapsedActiveMs: () => activeMs(),
    getPenaltyMs: () => penaltyMs,
    /** 時間切れか（進んでいる途中で 0 になったときは、ここで終了にする） */
    isExpired() {
      if (state === 'finished') return true;
      if (remainingAt(now()) > 0) return false;
      timer.stop();
      return true;
    },
  };
  return timer;
}

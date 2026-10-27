/**
 * 制限時間のタイマー（段位認定・1分チャレンジ・トライアル。Three.js・DOM 非依存）
 *
 * 回答できる状態だった時間だけを数える。setInterval の回数ではなく、単調に増える時計（performance.now など）の
 * 差から計算するので、画面の更新が遅れても時間がずれない。
 *
 *   残り時間 = durationMs + ボーナス − ペナルティ − （止めているあいだを除いた経過時間）   … 0 未満にはならない
 *
 * state：'ready'（まだ始めていない）| 'running'（進んでいる）| 'paused'（止まっている）| 'finished'（終了）
 * pause / resume を2回続けて呼んでも、時間はずれない（2回目は何もしない）。
 *
 * ロスタイム（overtimeMs）：残り時間が 0 になっても、すぐには終わらない。そのとき回答している問題（最終問題）を、
 * 回答できる時間でさらに overtimeMs まで続けられる。ロスタイムも使い切ったら時間切れ（isExpired）。
 * 残り時間が 0 になったのが止まっている間（ペナルティなど）なら、次に再開したときからロスタイムを数える。
 */
const defaultNow = () => (globalThis.performance?.now ? globalThis.performance.now() : Date.now());

export function createCertificationTimer({ durationMs, overtimeMs = 0, now = defaultNow } = {}) {
  let state = 'ready';
  let elapsedActiveMs = 0;
  let runningSince = null;
  let penaltyMs = 0;
  let bonusMs = 0;
  let overtimeStart = null; // ロスタイムが始まった時点の「回答できた時間」

  const activeMs = (t = now()) => elapsedActiveMs + (state === 'running' ? Math.max(0, t - runningSince) : 0);
  const limitMs = () => durationMs + bonusMs - penaltyMs;
  const remainingAt = (t) => Math.max(0, limitMs() - activeMs(t));
  /** 進んでいる途中で 0 になったら、ロスタイムの始まりを決める（止まっている間に 0 になったときは再開した時点から） */
  const syncOvertime = (t) => {
    if (overtimeStart === null && state === 'running' && activeMs(t) >= limitMs()) overtimeStart = Math.max(limitMs(), elapsedActiveMs);
  };
  const overtimeLeftAt = (t) => {
    syncOvertime(t);
    return overtimeStart === null ? overtimeMs : Math.max(0, overtimeMs - (activeMs(t) - overtimeStart));
  };
  const expiredAt = (t) => remainingAt(t) <= 0 && overtimeLeftAt(t) <= 0;

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
      syncOvertime(t);
      elapsedActiveMs += Math.max(0, t - runningSince);
      runningSince = null;
      state = 'paused';
      if (expiredAt(t)) state = 'finished';
      return true;
    },
    /** 再開する（止まっているときだけ。時間もロスタイムも残っていなければ終了） */
    resume() {
      if (state !== 'paused') return false;
      if (expiredAt(now())) {
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
        syncOvertime(now());
        elapsedActiveMs += Math.max(0, now() - runningSince);
        runningSince = null;
      }
      state = 'finished';
    },
    /** 残り時間を減らす（誤答のペナルティ。0 未満にはならない） */
    penalize(ms) {
      if (state === 'finished') return;
      penaltyMs += Math.max(0, ms);
      if (state !== 'running' && expiredAt(now())) state = 'finished';
    },
    /** 残り時間を増やす（多答問題の正解ボーナス。終了したあとは増やさない） */
    addTime(ms) {
      if (state === 'finished') return;
      bonusMs += Math.max(0, ms);
    },
    getRemainingMs: () => remainingAt(now()),
    overtimeMs,
    /** ロスタイムの残り（まだ始まっていなければ overtimeMs） */
    getOvertimeRemainingMs: () => (state === 'finished' && overtimeStart === null ? 0 : overtimeLeftAt(now())),
    /** 残り時間が 0 で、ロスタイムが残っているか（最終問題） */
    isOvertime() {
      const t = now();
      return state !== 'finished' && remainingAt(t) <= 0 && !expiredAt(t);
    },
    getBonusMs: () => bonusMs,
    /** 回答できる状態だった時間（止めていたあいだはふくまない） */
    getElapsedActiveMs: () => activeMs(),
    getPenaltyMs: () => penaltyMs,
    /** 時間切れか（ロスタイムも使い切ったら、ここで終了にする） */
    isExpired() {
      if (state === 'finished') return true;
      if (!expiredAt(now())) return false;
      timer.stop();
      return true;
    },
  };
  return timer;
}

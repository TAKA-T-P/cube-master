/**
 * アニメーション共通基盤
 *
 * 立方体の回転・展開図の組み立て・切断などの演出を、同じ仕組みで再生する。
 * Three.js には依存せず、描画ループから tick(time) を呼んでもらう方式。
 *
 * アニメーションオブジェクトの形：
 *   {
 *     duration: number,            // ミリ秒
 *     start?():  void,             // 再生開始時
 *     update(progress: number),    // progress は 0〜1（イージングは各アニメーション側で適用）
 *     cancel?(): void,             // cancel() されたとき（状態の巻き戻しなど）
 *     end?(status): void,          // 終了時（completed / skipped / cancelled / error）
 *   }
 *
 * play() は Promise を返し、終了時に { status } で解決される（reject はしない）。
 */
import { linear } from '../utils/easing.js';

export const ANIMATION_STATUS = Object.freeze({
  COMPLETED: 'completed',
  SKIPPED: 'skipped',
  CANCELLED: 'cancelled',
  ERROR: 'error',
});

const LOCK_KEY = 'animation';
// タブ非表示などでフレームが大きく空いても、演出が一気に飛ばないようにする上限（ms）
const MAX_FRAME_DELTA = 250;

export class AnimationManager {
  /**
   * @param {object} [options]
   * @param {() => void} [options.requestFrame] 次フレームの描画を要求する関数
   * @param {{lock(key:string):void, unlock(key:string):void}} [options.inputLock] 操作ロック
   * @param {(state: {playing:boolean, paused:boolean}) => void} [options.onStateChange]
   */
  constructor({ requestFrame = () => {}, inputLock = null, onStateChange = () => {} } = {}) {
    this._requestFrame = requestFrame;
    this._inputLock = inputLock;
    this._onStateChange = onStateChange;
    this._current = null;
  }

  /**
   * アニメーションを再生する。再生中のものがあればキャンセルしてから開始する。
   * @param {object} animation
   * @param {{ lockInput?: boolean }} [options] lockInput=true で再生中はユーザー操作を禁止
   * @returns {Promise<{status: string}>}
   */
  play(animation, { lockInput = true } = {}) {
    if (!animation || typeof animation.update !== 'function') {
      return Promise.reject(new TypeError('animation.update() が必要です'));
    }
    if (this._current) this.cancel();

    return new Promise((resolve) => {
      const current = {
        animation,
        resolve,
        duration: Math.max(0, Number(animation.duration) || 0),
        elapsed: 0,
        lastTime: null,
        paused: false,
        lockInput,
      };
      this._current = current;
      if (lockInput) this._inputLock?.lock(LOCK_KEY);
      try {
        animation.start?.();
      } catch (err) {
        this._finish(current, ANIMATION_STATUS.ERROR, err);
        return;
      }
      this._emitState();
      this._requestFrame();
    });
  }

  /** 描画ループから毎フレーム呼ぶ。続きのフレームが必要なら true */
  tick(time) {
    const current = this._current;
    if (!current || current.paused) return false;
    if (current.lastTime === null) current.lastTime = time;
    current.elapsed += Math.min(MAX_FRAME_DELTA, Math.max(0, time - current.lastTime));
    current.lastTime = time;

    const progress = current.duration === 0 ? 1 : Math.min(1, current.elapsed / current.duration);
    try {
      current.animation.update(progress);
    } catch (err) {
      this._finish(current, ANIMATION_STATUS.ERROR, err);
      return false;
    }
    if (progress >= 1) {
      this._finish(current, ANIMATION_STATUS.COMPLETED);
      return false;
    }
    return true;
  }

  pause() {
    if (!this._current || this._current.paused) return;
    this._current.paused = true;
    this._emitState();
  }

  resume() {
    if (!this._current || !this._current.paused) return;
    this._current.paused = false;
    this._current.lastTime = null;
    this._emitState();
    this._requestFrame();
  }

  /** 最終状態まで一気に進めて終了する */
  skip() {
    const current = this._current;
    if (!current) return;
    try {
      current.animation.update(1);
    } catch (err) {
      this._finish(current, ANIMATION_STATUS.ERROR, err);
      return;
    }
    this._finish(current, ANIMATION_STATUS.SKIPPED);
  }

  /** 途中で中止する（animation.cancel() があれば呼ぶ） */
  cancel() {
    const current = this._current;
    if (!current) return;
    try {
      current.animation.cancel?.();
    } catch (err) {
      this._finish(current, ANIMATION_STATUS.ERROR, err);
      return;
    }
    this._finish(current, ANIMATION_STATUS.CANCELLED);
  }

  /** 再生中（一時停止中は false） */
  isPlaying() {
    return Boolean(this._current) && !this._current.paused;
  }

  isPaused() {
    return Boolean(this._current?.paused);
  }

  /** 再生中または一時停止中 */
  isActive() {
    return Boolean(this._current);
  }

  dispose() {
    this.cancel();
  }

  _finish(current, status, error) {
    if (this._current !== current) return;
    this._current = null;
    if (error) console.error('[AnimationManager] アニメーションでエラーが発生しました', error);
    try {
      current.animation.end?.(status);
    } catch (err) {
      console.error('[AnimationManager] end() でエラーが発生しました', err);
    } finally {
      // どの終わり方でも操作ロックを必ず解除する
      if (current.lockInput) this._inputLock?.unlock(LOCK_KEY);
      this._emitState();
      this._requestFrame();
      current.resolve({ status });
    }
  }

  _emitState() {
    this._onStateChange({ playing: this.isPlaying(), paused: this.isPaused() });
  }
}

// ---------- アニメーション作成ヘルパー ----------

/**
 * 値を補間するアニメーション
 * @param {{ duration:number, easing?:(t:number)=>number, onUpdate:(t:number)=>void,
 *           onStart?:()=>void, onCancel?:()=>void, onEnd?:(status:string)=>void }} params
 */
export function tween({ duration, easing = linear, onUpdate, onStart, onCancel, onEnd }) {
  return {
    duration,
    start: onStart,
    update: (p) => onUpdate(easing(p)),
    cancel: onCancel,
    end: onEnd,
  };
}

/** 何もしない待ち時間 */
export function wait(duration) {
  return { duration, update() {} };
}

/**
 * 複数のアニメーションを順番に再生する1つのアニメーションにまとめる。
 * skip 時は残りすべての update(1) が順に呼ばれ、最終状態になる。
 */
export function sequence(animations, { onCancel, onEnd } = {}) {
  const total = animations.reduce((sum, a) => sum + Math.max(0, a.duration || 0), 0);
  let index = 0;
  let started = false;

  const startCurrent = () => {
    if (!started) {
      animations[index].start?.();
      started = true;
    }
  };

  return {
    duration: total,
    start() {
      index = 0;
      started = false;
    },
    update(progress) {
      const elapsed = progress * total;
      let offset = animations.slice(0, index).reduce((s, a) => s + Math.max(0, a.duration || 0), 0);
      while (index < animations.length) {
        const a = animations[index];
        const d = Math.max(0, a.duration || 0);
        startCurrent();
        if (elapsed < offset + d && progress < 1) {
          a.update(d === 0 ? 1 : (elapsed - offset) / d);
          return;
        }
        a.update(1);
        a.end?.('completed');
        offset += d;
        index += 1;
        started = false;
      }
    },
    cancel() {
      if (index < animations.length) animations[index].cancel?.();
      onCancel?.();
    },
    end: onEnd,
  };
}

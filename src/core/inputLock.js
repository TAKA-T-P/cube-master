/**
 * ユーザー操作のロック管理
 *
 * 複数の理由（アニメーション再生中、問題演出中など）で同時にロックできるよう、
 * 理由キーごとにロックを保持する。すべてのキーが解除されたときだけ操作可能になる。
 */
export class InputLock {
  constructor() {
    this._keys = new Set();
    this._listeners = new Set();
  }

  lock(key) {
    const wasLocked = this.isLocked();
    this._keys.add(key);
    if (!wasLocked) this._notify();
  }

  unlock(key) {
    if (!this._keys.delete(key)) return;
    if (!this.isLocked()) this._notify();
  }

  isLocked() {
    return this._keys.size > 0;
  }

  /** ロック状態の変化を購読する。戻り値で購読解除 */
  onChange(listener) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  _notify() {
    const locked = this.isLocked();
    for (const fn of [...this._listeners]) fn(locked);
  }
}

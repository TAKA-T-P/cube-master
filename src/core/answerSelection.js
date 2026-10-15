/**
 * 回答の選択状態（表示 UI から独立）
 *
 * 選択肢ボタンでも、将来の「3D モデルをタップして回答」でも、同じこの状態を操作する。
 * - single  : 1つだけ（ラジオ形式。別の選択肢を選ぶと入れ替わる）
 * - multiple: いくつでも（チェック形式）
 * 回答確定後は lock() で変更を禁止する。
 */
import { canSubmitAnswer } from './answerValidator.js';

export class AnswerSelection {
  /**
   * @param {{ type: 'single'|'multiple', choiceIds: string[] }} options
   */
  constructor({ type, choiceIds }) {
    if (type !== 'single' && type !== 'multiple') throw new Error(`無効な回答形式です: ${type}`);
    this.type = type;
    this._choiceIds = [...choiceIds];
    this._selected = new Set();
    this._locked = false;
    this._listeners = new Set();
  }

  /** 選択・解除を切り替える。ロック中や無効な ID は何もしない。戻り値は変化したか */
  toggle(choiceId) {
    if (this._locked || !this._choiceIds.includes(choiceId)) return false;
    if (this._selected.has(choiceId)) {
      this._selected.delete(choiceId);
    } else {
      if (this.type === 'single') this._selected.clear();
      this._selected.add(choiceId);
    }
    this._notify();
    return true;
  }

  isSelected(choiceId) {
    return this._selected.has(choiceId);
  }

  /** 選択中の ID（選択肢の並び順） */
  getSelected() {
    return this._choiceIds.filter((id) => this._selected.has(id));
  }

  clear() {
    if (this._locked || this._selected.size === 0) return;
    this._selected.clear();
    this._notify();
  }

  canSubmit() {
    return !this._locked && canSubmitAnswer(this.getSelected(), this.type);
  }

  lock() {
    if (this._locked) return;
    this._locked = true;
    this._notify();
  }

  isLocked() {
    return this._locked;
  }

  onChange(listener) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  _notify() {
    const state = { selected: this.getSelected(), locked: this._locked, canSubmit: this.canSubmit() };
    for (const fn of [...this._listeners]) fn(state);
  }
}

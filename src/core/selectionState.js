/**
 * 頂点・辺・面の選択状態（Three.js 非依存）
 *
 * - 選択は正規 ID の Set で保持し、選択順には依存しない
 * - 頂点・辺・面を同時に選択できる（Phase 1 の複数回答用）
 * - 単一選択モードでは、新しく選択すると他の選択はすべて解除される
 */
import { resolveElement, sortElementIds } from './cubeGeometry.js';
import { ELEMENT_TYPES } from './cubeConstants.js';

export class SelectionState {
  constructor({ multiple = false } = {}) {
    this._multiple = multiple;
    /** @type {Set<string>} 正規 ID */
    this._ids = new Set();
    /** @type {Map<string, string>} 正規 ID → 種類 */
    this._types = new Map();
    this._listeners = new Set();
  }

  get multiple() {
    return this._multiple;
  }

  /** 複数選択の可否を切り替える。単一選択に戻したときは最後に選んだ1つだけ残す */
  setMultiple(multiple) {
    this._multiple = Boolean(multiple);
    if (!this._multiple && this._ids.size > 1) {
      const last = [...this._ids].at(-1);
      this._replace(new Set([last]));
    }
  }

  /**
   * 選択する。無効な ID の場合は CubeElementError を投げる。
   * @returns {string} 正規 ID
   */
  select(input) {
    const { id, type } = resolveElement(input);
    if (this._ids.has(id)) return id;
    const next = this._multiple ? new Set(this._ids) : new Set();
    next.add(id);
    this._types.set(id, type);
    this._replace(next);
    return id;
  }

  /** 選択解除する。無効な ID の場合は CubeElementError */
  deselect(input) {
    const { id } = resolveElement(input);
    if (!this._ids.has(id)) return id;
    const next = new Set(this._ids);
    next.delete(id);
    this._replace(next);
    return id;
  }

  /** 選択・解除を切り替える。戻り値は切り替え後に選択されているか */
  toggle(input) {
    const { id } = resolveElement(input);
    if (this._ids.has(id)) {
      this.deselect(id);
      return false;
    }
    this.select(id);
    return true;
  }

  isSelected(input) {
    try {
      return this._ids.has(resolveElement(input).id);
    } catch {
      return false;
    }
  }

  /** 選択をクリアする。type を指定するとその種類だけクリア */
  clear(type) {
    if (this._ids.size === 0) return;
    const next = type ? new Set([...this._ids].filter((id) => this._types.get(id) !== type)) : new Set();
    this._replace(next);
  }

  /** 選択中の正規 ID（標準順序）。type を指定するとその種類だけ */
  getSelected(type) {
    const ids = type ? [...this._ids].filter((id) => this._types.get(id) === type) : [...this._ids];
    return sortElementIds(ids);
  }

  /** 種類別の選択内容 */
  getSelectedByType() {
    return {
      vertex: this.getSelected(ELEMENT_TYPES.VERTEX),
      edge: this.getSelected(ELEMENT_TYPES.EDGE),
      face: this.getSelected(ELEMENT_TYPES.FACE),
    };
  }

  /** 変更を購読する。listener({ selected, added, removed })。戻り値で購読解除 */
  onChange(listener) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  _replace(next) {
    const added = [...next].filter((id) => !this._ids.has(id));
    const removed = [...this._ids].filter((id) => !next.has(id));
    if (added.length === 0 && removed.length === 0) return;
    this._ids = next;
    for (const id of removed) this._types.delete(id);
    const event = { selected: this.getSelected(), added: sortElementIds(added), removed: sortElementIds(removed) };
    for (const fn of [...this._listeners]) fn(event);
  }
}

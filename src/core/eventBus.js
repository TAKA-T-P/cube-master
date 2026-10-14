/**
 * シンプルなイベントバス（publish / subscribe）
 *
 * 3D 描画層と UI 層を疎結合にするために使う。
 * グローバルな単一インスタンスではなく、ビューアごとに生成して破棄できるようにする。
 */
export function createEventBus() {
  /** @type {Map<string, Set<Function>>} */
  const listeners = new Map();

  return {
    /** 購読する。戻り値の関数を呼ぶと購読解除 */
    on(type, handler) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(handler);
      return () => this.off(type, handler);
    },
    off(type, handler) {
      listeners.get(type)?.delete(handler);
    },
    emit(type, payload) {
      for (const handler of [...(listeners.get(type) ?? [])]) {
        try {
          handler(payload);
        } catch (err) {
          // 1つの購読者のエラーで他の購読者や描画が止まらないようにする
          console.error(`[eventBus] "${type}" のハンドラでエラー`, err);
        }
      }
    },
    clear() {
      listeners.clear();
    },
  };
}

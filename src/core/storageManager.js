/**
 * ブラウザ保存（localStorage など）の安全な窓口（Three.js・DOM 非依存）
 *
 * - CUBE MASTER のデータは、すべて STORAGE_PREFIX で始まるキーに保存する（ほかのサイト・アプリのデータにはさわらない）
 * - 保存先が使えない（プライベートモード・容量不足・ブロック）ときは、エラーを投げずに false / null を返す
 * - JSON にできない値・大きすぎる値は保存しない
 * - 保存先（backend）は外から渡す。localStorage と同じ getItem / setItem / removeItem / key / length を持つもの
 */
export const STORAGE_PREFIX = 'cubeMaster:';

/** 1つのキーに保存できる文字数の上限（localStorage はおよそ 5MB。ほかのキーの分を残す） */
export const MAX_VALUE_CHARS = 1_500_000;

/** メモリだけの保存先（localStorage が使えないとき・テスト用） */
export function createMemoryBackend() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
}

/**
 * @param {object|null} backend localStorage など（null なら保存しない）
 * @returns {{ available: boolean, read(name): any, write(name, value): boolean, remove(name): void, clearAll(): number, lastError: () => Error|null }}
 */
export function createStorage(backend) {
  let lastError = null;
  const available = (() => {
    if (!backend) return false;
    try {
      const probe = `${STORAGE_PREFIX}__probe__`;
      backend.setItem(probe, '1');
      backend.removeItem(probe);
      return true;
    } catch (err) {
      lastError = err;
      return false;
    }
  })();
  const keyOf = (name) => `${STORAGE_PREFIX}${name}`;

  return {
    available,
    /** 保存した値（なければ・こわれていれば null） */
    read(name) {
      if (!available) return null;
      try {
        const text = backend.getItem(keyOf(name));
        return text == null ? null : JSON.parse(text);
      } catch (err) {
        lastError = err;
        return null;
      }
    },
    /** 保存する。できなければ false（練習はそのまま続けられる） */
    write(name, value) {
      if (!available) return false;
      try {
        const text = JSON.stringify(value);
        if (text === undefined || text.length > MAX_VALUE_CHARS) throw new Error(`保存するデータが大きすぎます（${text?.length ?? 0} 文字）`);
        backend.setItem(keyOf(name), text);
        return true;
      } catch (err) {
        lastError = err;
        return false;
      }
    },
    remove(name) {
      if (!available) return;
      try {
        backend.removeItem(keyOf(name));
      } catch (err) {
        lastError = err;
      }
    },
    /** CUBE MASTER のデータ（STORAGE_PREFIX で始まるキー）だけをすべて消す。消した数を返す */
    clearAll() {
      if (!available) return 0;
      try {
        const keys = [];
        for (let i = 0; i < backend.length; i++) {
          const k = backend.key(i);
          if (k?.startsWith(STORAGE_PREFIX)) keys.push(k);
        }
        for (const k of keys) backend.removeItem(k);
        return keys.length;
      } catch (err) {
        lastError = err;
        return 0;
      }
    },
    lastError: () => lastError,
  };
}

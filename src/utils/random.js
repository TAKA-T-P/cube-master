/**
 * 乱数ユーティリティ
 * rng は () => [0, 1) の関数。テストではシード付きの createRng(seed) で結果を再現できる。
 */

/** シード付き乱数（mulberry32） */
export function createRng(seed = Date.now()) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 新しい配列としてシャッフル（Fisher–Yates） */
export function shuffle(array, rng = Math.random) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** 1つ選ぶ */
export function pick(array, rng = Math.random) {
  return array[Math.floor(rng() * array.length)];
}

/** 重複なしで n 個選ぶ */
export function sample(array, n, rng = Math.random) {
  return shuffle(array, rng).slice(0, Math.max(0, n));
}

/**
 * 有理数と有理数のベクトル（切断・最短経路の計算を、小数の誤差なしで行うため。Three.js・DOM 非依存）
 *
 * 立方体の座標（cubeConstants：中心が原点・一辺 2）の頂点・辺の中点・面の中心はどれも整数なので、
 * それらを通る平面と辺の交点、展開図の上の点は、すべて有理数で正確に表せる。
 * 長さ・面積は「有理数の平方根」になるので、core/surd で √ をふくむ数として扱う。
 */

const gcd = (a, b) => {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
};

export class Q {
  /**
   * @param {number} n 分子（整数）
   * @param {number} [d] 分母（0 以外の整数）
   */
  constructor(n, d = 1) {
    if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d) || d === 0) throw new RangeError(`有理数が不正です: ${n}/${d}`);
    if (d < 0) {
      n = -n;
      d = -d;
    }
    const g = gcd(n, d) || 1;
    this.n = n / g + 0; // -0 にしない
    this.d = d / g;
    Object.freeze(this);
  }

  /** 整数・有理数を Q にする */
  static of(x) {
    if (x instanceof Q) return x;
    if (Number.isInteger(x)) return new Q(x, 1);
    throw new TypeError(`整数か有理数ではありません: ${x}`);
  }

  add(o) {
    o = Q.of(o);
    return new Q(this.n * o.d + o.n * this.d, this.d * o.d);
  }

  sub(o) {
    o = Q.of(o);
    return new Q(this.n * o.d - o.n * this.d, this.d * o.d);
  }

  mul(o) {
    o = Q.of(o);
    return new Q(this.n * o.n, this.d * o.d);
  }

  div(o) {
    o = Q.of(o);
    if (o.n === 0) throw new RangeError('0 で割ることはできません');
    return new Q(this.n * o.d, this.d * o.n);
  }

  neg() {
    return new Q(-this.n, this.d);
  }

  abs() {
    return new Q(Math.abs(this.n), this.d);
  }

  sign() {
    return Math.sign(this.n);
  }

  isZero() {
    return this.n === 0;
  }

  isInteger() {
    return this.d === 1;
  }

  /** 大小（-1・0・1） */
  cmp(o) {
    o = Q.of(o);
    return Math.sign(this.n * o.d - o.n * this.d);
  }

  eq(o) {
    return this.cmp(o) === 0;
  }

  toNumber() {
    return this.n / this.d;
  }

  toString() {
    return this.d === 1 ? `${this.n}` : `${this.n}/${this.d}`;
  }
}

export const Q0 = new Q(0);
export const Q1 = new Q(1);

// ---------- 有理数のベクトル（[Q, Q, Q]） ----------

/** 数の配列（整数）や Q の配列を、有理数のベクトルにする */
export const qvec = (v) => v.map((x) => Q.of(x));
export const vAdd = (a, b) => a.map((x, i) => x.add(b[i]));
export const vSub = (a, b) => a.map((x, i) => x.sub(b[i]));
export const vScale = (a, s) => a.map((x) => x.mul(s));
export const vDot = (a, b) => a.reduce((s, x, i) => s.add(x.mul(b[i])), Q0);
export const vCross = (a, b) => [a[1].mul(b[2]).sub(a[2].mul(b[1])), a[2].mul(b[0]).sub(a[0].mul(b[2])), a[0].mul(b[1]).sub(a[1].mul(b[0]))];
export const vIsZero = (a) => a.every((x) => x.isZero());
export const vEq = (a, b) => a.every((x, i) => x.eq(b[i]));
/** 長さの2乗 */
export const vLength2 = (a) => vDot(a, a);
/** 同じ点かどうかを調べるための文字列 */
export const vKey = (a) => a.map(String).join(',');
/** 表示・3D 用の小数の配列 */
export const vToNumbers = (a) => a.map((x) => x.toNumber());
/** 2点の真ん中 */
export const vMid = (a, b) => vScale(vAdd(a, b), new Q(1, 2));
/** 点の平均（重心） */
export const vAverage = (list) => vScale(list.reduce((s, p) => vAdd(s, p), qvec([0, 0, 0])), new Q(1, list.length));

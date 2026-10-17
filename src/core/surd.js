/**
 * √ をふくむ数（c√r。c は有理数、r は平方因子をふくまない正の整数。Three.js・DOM 非依存）
 *
 * 長さ・面積・体積の答えを、小数ではなく「2√2」「9√3」のような正確な形で持つ。
 * √8 と 2√2 は同じ数として、同じ形（2√2）にそろえる。選択肢の重複判定は key() で行う（小数の比較にたよらない）。
 *
 * 経路の長さのように「√ をふくむ数の和」（例：2＋2√5）は、SurdSum（√ の中身ごとの係数の組）で表す。
 * 平方因子をふくまない √ どうしは有理数の範囲で独立なので、√ の中身ごとの係数が同じときだけ等しい。
 */
import { Q, Q0 } from './rational.js';

/** n（正の整数）を a²·r（r は平方因子をふくまない）に分ける */
export function splitSquare(n) {
  if (!Number.isSafeInteger(n) || n <= 0) throw new RangeError(`正の整数ではありません: ${n}`);
  let a = 1;
  let r = n;
  for (let i = 2; i * i <= r; i++) {
    while (r % (i * i) === 0) {
      r /= i * i;
      a *= i;
    }
  }
  return { a, r };
}

export class Surd {
  /**
   * @param {Q|number} c 係数
   * @param {number} [r] √ の中身（正の整数。平方因子は係数に出す）
   */
  constructor(c, r = 1) {
    let coef = Q.of(c);
    let rad = r;
    if (coef.isZero()) rad = 1;
    else if (rad !== 1) {
      const { a, r: rest } = splitSquare(rad);
      coef = coef.mul(a);
      rad = rest;
    }
    this.c = coef;
    this.r = rad;
    Object.freeze(this);
  }

  /** 有理数の平方根（√(n/d) = √(n·d)/d） */
  static sqrt(q) {
    q = Q.of(q);
    if (q.sign() < 0) throw new RangeError('負の数の平方根です');
    if (q.isZero()) return new Surd(0);
    const { a, r } = splitSquare(q.n * q.d);
    return new Surd(new Q(a, q.d), r);
  }

  static of(x) {
    return x instanceof Surd ? x : new Surd(Q.of(x));
  }

  mul(o) {
    o = Surd.of(o);
    return new Surd(this.c.mul(o.c), this.r * o.r);
  }

  /** 有理数倍 */
  scale(q) {
    return new Surd(this.c.mul(q), this.r);
  }

  div(o) {
    o = Surd.of(o);
    // c1√r1 / (c2√r2) = (c1 / (c2·r2))·√(r1·r2)
    return new Surd(this.c.div(o.c.mul(o.r)), this.r * o.r);
  }

  /** 同じ √ の中身どうしの和（ちがうときは null） */
  add(o) {
    o = Surd.of(o);
    if (this.c.isZero()) return o;
    if (o.c.isZero()) return this;
    if (this.r !== o.r) return null;
    return new Surd(this.c.add(o.c), this.r);
  }

  sub(o) {
    return this.add(Surd.of(o).scale(-1));
  }

  /** 2乗（有理数） */
  square() {
    return this.c.mul(this.c).mul(this.r);
  }

  sign() {
    return this.c.sign();
  }

  isZero() {
    return this.c.isZero();
  }

  isRational() {
    return this.r === 1;
  }

  /** 係数が整数か（選択肢を分数のない形にそろえるため） */
  hasIntegerCoef() {
    return this.c.isInteger();
  }

  eq(o) {
    o = Surd.of(o);
    return this.r === o.r && this.c.eq(o.c);
  }

  /** 大小（-1・0・1） */
  cmp(o) {
    o = Surd.of(o);
    const s1 = this.sign();
    const s2 = o.sign();
    if (s1 !== s2) return Math.sign(s1 - s2);
    // 同じ符号なら2乗で比べる
    const c = this.square().cmp(o.square());
    return s1 >= 0 ? c : -c;
  }

  /** 同じ値なら同じ文字列（重複判定用） */
  key() {
    return `${this.c}|${this.r}`;
  }

  toNumber() {
    return this.c.toNumber() * Math.sqrt(this.r);
  }

  /** 表示（「4√5」「12」「√2」「3/2」。unit は単位） */
  format(unit = '') {
    return `${formatSurd(this)}${unit}`;
  }

  toString() {
    return formatSurd(this);
  }
}

function formatSurd(x) {
  const { c, r } = x;
  if (r === 1) return c.toString();
  const n = c.n === 1 ? '' : c.n === -1 ? '-' : String(c.n);
  const body = `${n}√${r}`;
  return c.d === 1 ? body : `${body}/${c.d}`;
}

/**
 * √ をふくむ数の和（例：2 + 2√5）。経路の長さ（直線の長さの和）に使う
 */
export class SurdSum {
  /** @param {Surd[]} [terms] */
  constructor(terms = []) {
    const map = new Map();
    for (const t of terms) {
      if (t.isZero()) continue;
      map.set(t.r, (map.get(t.r) ?? Q0).add(t.c));
    }
    for (const [r, c] of map) if (c.isZero()) map.delete(r);
    this.terms = new Map([...map].sort((a, b) => a[0] - b[0]));
    Object.freeze(this);
  }

  add(o) {
    const list = o instanceof SurdSum ? [...o.terms].map(([r, c]) => new Surd(c, r)) : [Surd.of(o)];
    return new SurdSum([...this.toSurds(), ...list]);
  }

  toSurds() {
    return [...this.terms].map(([r, c]) => new Surd(c, r));
  }

  /** 1つの √ の数で表せるならそれを返す（2 + 2√5 のようなら null） */
  asSurd() {
    if (this.terms.size === 0) return new Surd(0);
    if (this.terms.size > 1) return null;
    const [[r, c]] = [...this.terms];
    return new Surd(c, r);
  }

  eq(o) {
    const other = o instanceof SurdSum ? o : new SurdSum([Surd.of(o)]);
    if (this.terms.size !== other.terms.size) return false;
    for (const [r, c] of this.terms) if (!other.terms.get(r)?.eq(c)) return false;
    return true;
  }

  toNumber() {
    let s = 0;
    for (const [r, c] of this.terms) s += c.toNumber() * Math.sqrt(r);
    return s;
  }

  /** 大小（等しいときは正確に 0。ちがうときは小数で比べる） */
  cmp(o) {
    if (this.eq(o)) return 0;
    const other = o instanceof SurdSum ? o : new SurdSum([Surd.of(o)]);
    return Math.sign(this.toNumber() - other.toNumber());
  }

  key() {
    return [...this.terms].map(([r, c]) => `${c}|${r}`).join('+') || '0';
  }

  format(unit = '') {
    const s = this.toSurds();
    if (s.length === 0) return `0${unit}`;
    // 有理数の項を先に（「2＋2√5」）
    s.sort((a, b) => a.r - b.r);
    const body = s.map((x) => formatSurd(x)).join('＋');
    // 単位をつけるときは、和をかっこでくくる（「(1＋√2)cm」）
    return s.length > 1 && unit ? `(${body})${unit}` : `${body}${unit}`;
  }
}

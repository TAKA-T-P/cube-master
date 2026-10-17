/**
 * タイトル画面の立方体の回転（水平方向だけ。DOM 非依存）
 *
 * - ふだんは baseSpeed（度／秒）でゆっくり回り続ける
 * - 指で押さえている間は止まり、左右になぞると指について回る
 * - 指をはなしたときのなぞる速さが、そのまま回転の速さ・向きになる
 *   （右へ速くスワイプ → 右回りで速く、左へスワイプ → 左回り（逆向き））。そのあと少しずつ baseSpeed にもどる
 * - そっとはなした（ほとんど動かさなかった）ときは、それまでの向きのまま baseSpeed にもどる
 */
export const SPIN = Object.freeze({
  baseSpeed: 24, // 度／秒
  maxSpeed: 900, // スワイプで出せるいちばん速い回転（度／秒）
  settle: 0.8, // baseSpeed にもどる速さ（1秒あたり）
  minFlick: 60, // これより遅いなぞり方は「そっとはなした」とみなす（度／秒）
  sampleMs: 120, // はなす直前の、この時間のなぞり方で速さを決める
});

/**
 * @param {{ baseSpeed?: number }} [options] baseSpeed: 0 で自動では回らない（アニメーションを減らす設定のとき）
 */
export function createSpinModel({ baseSpeed = SPIN.baseSpeed } = {}) {
  const state = { angle: 0, velocity: baseSpeed, direction: 1, held: false };
  let samples = [];

  return {
    state,
    /** dt 秒すすめて、今の角度（度）を返す */
    step(dt) {
      if (state.held) return state.angle;
      const target = state.direction * baseSpeed;
      state.velocity += (target - state.velocity) * (1 - Math.exp(-SPIN.settle * dt));
      state.angle = (state.angle + state.velocity * dt) % 360;
      return state.angle;
    },
    /** 指で押さえる：回転を止める */
    press() {
      state.held = true;
      state.velocity = 0;
      samples = [];
    },
    /** 押さえたまま左右になぞる（右が +） */
    drag(deltaDeg, timeMs) {
      if (!state.held) return;
      state.angle = (state.angle + deltaDeg) % 360;
      samples.push({ t: timeMs, d: deltaDeg });
    },
    /** 指をはなす：なぞる速さで回りだす */
    release(timeMs) {
      if (!state.held) return;
      state.held = false;
      const recent = samples.filter((s) => timeMs - s.t <= SPIN.sampleMs);
      samples = [];
      if (recent.length === 0) return;
      const span = Math.max(16, timeMs - recent[0].t) / 1000;
      const speed = recent.reduce((sum, s) => sum + s.d, 0) / span;
      if (Math.abs(speed) < SPIN.minFlick) return;
      state.direction = Math.sign(speed);
      state.velocity = Math.max(-SPIN.maxSpeed, Math.min(SPIN.maxSpeed, speed));
    },
  };
}

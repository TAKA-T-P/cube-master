/**
 * タイトル画面の、水平に回り続ける立方体（CSS の 3D 変形で描く。Three.js は使わない）
 *
 * 位置は動かさず、回転の向きと速さだけが操作で変わる（core/spinModel）。
 *   指で押さえる → 止まる／左右になぞる → 指について回る／右へスワイプ → 速く回る／左へスワイプ → 逆向きに回る
 * 横の面は、光の向きに対する角度で明るさを変えて、立体らしく見せる。
 * OS の「視差効果を減らす」設定のときは、自動では回さない（さわったときだけ動く）。
 */
import { h } from '../utils/dom.js';
import { createSpinModel } from '../core/spinModel.js';

const DEG_PER_PX = 0.6; // なぞった距離 1px あたりの回転
const SIDES = [0, 90, 180, 270];
const LIGHT = -35; // 光の来る向き（度、左前から）
const DARK = [0x5a, 0xa6, 0xdc];
const LIGHTEST = [0xc4, 0xe6, 0xfa];

const shade = (faceAngle, angle) => {
  const t = (Math.cos(((faceAngle + angle - LIGHT) * Math.PI) / 180) + 1) / 2;
  const [r, g, b] = DARK.map((d, i) => Math.round(d + (LIGHTEST[i] - d) * t));
  return `rgb(${r} ${g} ${b})`;
};

/** @returns {{ el: HTMLElement, destroy(): void, model: ReturnType<typeof createSpinModel> }} */
export function createHomeCube() {
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const model = createSpinModel(reduced ? { baseSpeed: 0 } : {});

  const sides = SIDES.map((a) => h('div', { class: 'home-cube__face', style: { transform: `rotateY(${a}deg) translateZ(var(--half))` } }));
  const top = h('div', { class: 'home-cube__face home-cube__face--top', style: { transform: 'rotateX(90deg) translateZ(var(--half))' } });
  const body = h('div', { class: 'home-cube__body' }, sides, top);
  const el = h('div', { class: 'home-cube', role: 'img', 'aria-label': '回転する立方体', 'data-testid': 'home-cube' }, h('div', { class: 'home-cube__tilt' }, body));

  const render = (angle) => {
    body.style.transform = `rotateY(${angle}deg)`;
    sides.forEach((face, i) => (face.style.background = shade(SIDES[i], angle)));
  };
  render(0);

  // 操作：押さえる・なぞる・はなす
  let lastX = 0;
  let pointerId = null;
  el.addEventListener('pointerdown', (e) => {
    pointerId = e.pointerId;
    lastX = e.clientX;
    el.setPointerCapture?.(e.pointerId);
    model.press();
    el.classList.add('is-held');
  });
  el.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pointerId) return;
    model.drag((e.clientX - lastX) * DEG_PER_PX, e.timeStamp);
    lastX = e.clientX;
    render(model.state.angle);
  });
  const end = (e) => {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    model.release(e.timeStamp);
    el.classList.remove('is-held');
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);

  // アニメーション（タブが見えない間は requestAnimationFrame が止まるので、dt は大きくなりすぎないようにする）
  let frame = 0;
  let last = null;
  const tick = (now) => {
    const dt = last === null ? 0 : Math.min(0.1, (now - last) / 1000);
    last = now;
    render(model.step(dt));
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);

  return {
    el,
    model,
    destroy() {
      cancelAnimationFrame(frame);
    },
  };
}

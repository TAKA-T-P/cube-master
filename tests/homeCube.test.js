// @vitest-environment jsdom
// タイトル画面の、水平に回り続ける立方体（回転のしかたと画面）
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createSpinModel, SPIN } from '../src/core/spinModel.js';

const run = (model, seconds, fps = 60) => {
  for (let i = 0; i < seconds * fps; i += 1) model.step(1 / fps);
};
const swipe = (model, totalDeg, ms = 100, steps = 5) => {
  model.press();
  for (let i = 1; i <= steps; i += 1) model.drag(totalDeg / steps, (ms / steps) * i);
  model.release(ms);
};

describe('立方体の回転（spinModel）', () => {
  it('ふだんはゆっくり同じ向きに回り続ける', () => {
    const m = createSpinModel();
    run(m, 1);
    expect(m.state.angle).toBeCloseTo(SPIN.baseSpeed, 0);
  });

  it('押さえている間は止まり、なぞると指について回る', () => {
    const m = createSpinModel();
    m.press();
    const a = m.state.angle;
    run(m, 1);
    expect(m.state.angle).toBe(a);
    m.drag(30, 0);
    expect(m.state.angle).toBe(a + 30);
  });

  it('右へスワイプすると速く回り、少しずつもとの速さにもどる', () => {
    const m = createSpinModel();
    swipe(m, 60);
    expect(m.state.velocity).toBeGreaterThan(SPIN.baseSpeed * 5);
    run(m, 12);
    expect(m.state.velocity).toBeCloseTo(SPIN.baseSpeed, 0);
  });

  it('左へスワイプすると逆向きに回り、そのまま逆向きで回り続ける', () => {
    const m = createSpinModel();
    swipe(m, -60);
    expect(m.state.velocity).toBeLessThan(0);
    run(m, 12);
    expect(m.state.velocity).toBeCloseTo(-SPIN.baseSpeed, 0);
  });

  it('そっとはなすと、それまでの向きのまま回りだす。速すぎるスワイプは上限で止める', () => {
    const m = createSpinModel();
    swipe(m, -60);
    m.press();
    m.release(5000);
    expect(m.state.velocity).toBe(0);
    run(m, 8);
    expect(m.state.velocity).toBeLessThan(0);
    swipe(m, 3000, 50);
    expect(m.state.velocity).toBe(SPIN.maxSpeed);
  });

  it('アニメーションを減らす設定（baseSpeed 0）では自動では回らない', () => {
    const m = createSpinModel({ baseSpeed: 0 });
    run(m, 2);
    expect(m.state.angle).toBe(0);
  });
});

describe('タイトル画面の立方体', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('回る立方体が表示され、画面を閉じるとアニメーションを止める', async () => {
    const cancel = vi.spyOn(window, 'cancelAnimationFrame');
    const { mountHomeScreen } = await import('../src/ui/homeScreen.js');
    const container = document.createElement('main');
    document.body.append(container);
    const screen = mountHomeScreen(container, { navigate: vi.fn(), version: '0.7.0' });
    const cube = container.querySelector('[data-testid="home-cube"]');
    expect(cube).not.toBeNull();
    expect(cube.querySelectorAll('.home-cube__face')).toHaveLength(5);
    expect(container.querySelector('img.home-logo')).toBeNull();
    screen.unmount();
    expect(cancel).toHaveBeenCalled();
  });
});

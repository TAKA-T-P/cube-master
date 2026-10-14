import { describe, it, expect, vi } from 'vitest';
import { AnimationManager, tween, sequence, wait } from '../src/three/animationManager.js';
import { InputLock } from '../src/core/inputLock.js';
import * as THREE from 'three';
import { createRotationDemo } from '../src/three/cubeAnimations.js';

function setup() {
  const inputLock = new InputLock();
  const manager = new AnimationManager({ inputLock, requestFrame: vi.fn() });
  return { inputLock, manager };
}

describe('AnimationManager', () => {
  it('最後まで再生すると completed で解決し、操作ロックが解除される', async () => {
    const { inputLock, manager } = setup();
    const values = [];
    const done = manager.play(tween({ duration: 100, onUpdate: (t) => values.push(t) }));
    expect(manager.isPlaying()).toBe(true);
    expect(inputLock.isLocked()).toBe(true);

    manager.tick(0);
    manager.tick(50);
    manager.tick(120);
    await expect(done).resolves.toEqual({ status: 'completed' });
    expect(values).toEqual([0, 0.5, 1]);
    expect(manager.isPlaying()).toBe(false);
    expect(inputLock.isLocked()).toBe(false);
  });

  it('cancel すると cancelled で解決し、操作ロックが残らない', async () => {
    const { inputLock, manager } = setup();
    const onCancel = vi.fn();
    const done = manager.play(tween({ duration: 100, onUpdate: () => {}, onCancel }));
    manager.tick(0);
    manager.tick(30);
    manager.cancel();
    await expect(done).resolves.toEqual({ status: 'cancelled' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(inputLock.isLocked()).toBe(false);
  });

  it('skip すると最終状態になって skipped で解決する', async () => {
    const { inputLock, manager } = setup();
    let last = null;
    const done = manager.play(tween({ duration: 1000, onUpdate: (t) => (last = t) }));
    manager.skip();
    await expect(done).resolves.toEqual({ status: 'skipped' });
    expect(last).toBe(1);
    expect(inputLock.isLocked()).toBe(false);
  });

  it('pause 中は進まず、resume で続きから再生する', () => {
    const { manager } = setup();
    let last = null;
    manager.play(tween({ duration: 100, onUpdate: (t) => (last = t) }));
    manager.tick(0);
    manager.tick(40);
    manager.pause();
    expect(manager.isPlaying()).toBe(false);
    expect(manager.isPaused()).toBe(true);
    manager.tick(5000);
    expect(last).toBeCloseTo(0.4);
    manager.resume();
    manager.tick(6000);
    manager.tick(6030);
    expect(last).toBeCloseTo(0.7);
  });

  it('再生中に別のアニメーションを再生すると前のものはキャンセルされる', async () => {
    const { inputLock, manager } = setup();
    const first = manager.play(tween({ duration: 100, onUpdate: () => {} }));
    const second = manager.play(tween({ duration: 100, onUpdate: () => {} }));
    await expect(first).resolves.toEqual({ status: 'cancelled' });
    expect(inputLock.isLocked()).toBe(true);
    manager.skip();
    await expect(second).resolves.toEqual({ status: 'skipped' });
    expect(inputLock.isLocked()).toBe(false);
  });

  it('アニメーション内でエラーが起きても操作ロックが残らない', async () => {
    const { inputLock, manager } = setup();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const done = manager.play({
      duration: 100,
      update() {
        throw new Error('boom');
      },
    });
    manager.tick(0);
    await expect(done).resolves.toEqual({ status: 'error' });
    expect(inputLock.isLocked()).toBe(false);
    spy.mockRestore();
  });

  it('lockInput: false なら操作ロックしない', () => {
    const { inputLock, manager } = setup();
    manager.play(wait(100), { lockInput: false });
    expect(inputLock.isLocked()).toBe(false);
  });

  it('他の理由のロックはアニメーション終了後も維持される', () => {
    const { inputLock, manager } = setup();
    inputLock.lock('question');
    manager.play(wait(100));
    manager.cancel();
    expect(inputLock.isLocked()).toBe(true);
    inputLock.unlock('question');
    expect(inputLock.isLocked()).toBe(false);
  });
});

describe('sequence', () => {
  it('順番に再生し、skip で全要素が最終状態になる', () => {
    const a = [];
    const b = [];
    const seq = sequence([tween({ duration: 100, onUpdate: (t) => a.push(t) }), wait(50), tween({ duration: 100, onUpdate: (t) => b.push(t) })]);
    expect(seq.duration).toBe(250);
    seq.start();
    seq.update(0.2); // 50ms
    expect(a.at(-1)).toBe(0.5);
    expect(b).toEqual([]);
    seq.update(1);
    expect(a.at(-1)).toBe(1);
    expect(b.at(-1)).toBe(1);
  });
});

describe('90°回転デモ', () => {
  it('途中で90°回転し、完了・キャンセルどちらでも元の向きに戻る', async () => {
    const { inputLock, manager } = setup();
    const object = new THREE.Object3D();
    const initial = object.quaternion.clone();

    const done = manager.play(createRotationDemo(object));
    for (let t = 0; t <= 900; t += 100) manager.tick(t); // 1回目の回転が終わる
    const angle = object.quaternion.angleTo(initial);
    expect(angle).toBeCloseTo(Math.PI / 2, 5);
    for (let t = 1000; t <= 2400; t += 100) manager.tick(t);
    await expect(done).resolves.toEqual({ status: 'completed' });
    expect(object.quaternion.angleTo(initial)).toBeCloseTo(0, 5);

    const again = manager.play(createRotationDemo(object));
    manager.tick(0);
    manager.tick(200);
    expect(object.quaternion.angleTo(initial)).toBeGreaterThan(0);
    manager.cancel();
    await expect(again).resolves.toEqual({ status: 'cancelled' });
    expect(object.quaternion.angleTo(initial)).toBeCloseTo(0, 5);
    expect(inputLock.isLocked()).toBe(false);
  });
});

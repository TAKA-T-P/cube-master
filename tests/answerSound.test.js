// 回答後の効果音（Web Audio をモックにして、鳴らす音の数と種類だけを確かめる）
import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(() => {
  delete globalThis.AudioContext;
  vi.resetModules();
});

function fakeAudioContext() {
  const oscillators = [];
  class FakeAudioContext {
    constructor() {
      this.state = 'suspended';
      this.currentTime = 0;
      this.destination = {};
      this.resume = vi.fn();
    }
    createOscillator() {
      const osc = { type: 'sine', frequency: {}, connect: (g) => g, start: vi.fn(), stop: vi.fn() };
      oscillators.push(osc);
      return osc;
    }
    createGain() {
      return { gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: (d) => d };
    }
  }
  return { FakeAudioContext, oscillators };
}

describe('効果音', () => {
  it('Web Audio が使えない環境では何もしない（エラーにならない）', async () => {
    const { playAnswerSound } = await import('../src/ui/answerSound.js');
    expect(() => playAnswerSound('correct')).not.toThrow();
  });

  it('正解・おしい・不正解で音を2つずつ鳴らし、不正解は低いブザー音', async () => {
    const { FakeAudioContext, oscillators } = fakeAudioContext();
    globalThis.AudioContext = FakeAudioContext;
    const { playAnswerSound } = await import('../src/ui/answerSound.js');
    playAnswerSound('correct');
    expect(oscillators).toHaveLength(2);
    expect(oscillators[1].frequency.value).toBeGreaterThan(oscillators[0].frequency.value); // ピンポーン（上がる）
    playAnswerSound('partial');
    expect(oscillators).toHaveLength(4);
    playAnswerSound('incorrect');
    expect(oscillators.slice(4).map((o) => o.type)).toEqual(['square', 'square']);
    expect(oscillators[4].frequency.value).toBeLessThan(300);
    for (const o of oscillators) expect(o.start).toHaveBeenCalled();
  });
});

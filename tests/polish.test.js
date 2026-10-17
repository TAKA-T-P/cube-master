// @vitest-environment jsdom
// Phase 6：現行ルールの固定（変えてはいけない値）・効果音の設定・あそびかたのタブ・プレイ形式の表示
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CERTIFICATION_RULES as R, LEVELS, MAX_RANK } from '../src/core/certificationRules.js';
import { CHALLENGE_RULES } from '../src/core/timedChallengeSession.js';
import { TIMED_REVEAL, TRAINING_REVEAL } from '../src/core/revealSettings.js';
import { createMemoryBackend } from '../src/core/storageManager.js';
import { answerSplash } from '../src/ui/answerSplash.js';

describe('現行ルール（Phase 6 で維持する値）', () => {
  it('1分チャレンジ：60秒・不正解 −10秒', () => {
    expect(CHALLENGE_RULES).toMatchObject({ durationMs: 60000, mistakePenaltyMs: 10000 });
  });

  it('段位認定：100秒・★1 100／★2 160／★3 240点・誤答 50×n（6回まで）・多答 +3秒・パス 2×n秒・連続ボーナス', () => {
    expect(R.durationMs).toBe(100000);
    expect(R.points).toEqual({ 1: 100, 2: 160, 3: 240 });
    expect(R.mistakePenalty).toEqual({ perMistake: 50, maxMultiplier: 6 });
    expect(R.multipleAnswerTimeBonusMs).toBe(3000);
    expect(R.passPenalty).toEqual({ perPassMs: 2000 });
    expect(R.streakBonus).toEqual([{ min: 5, bonus: 40 }, { min: 3, bonus: 20 }]);
  });

  it('段位：21段階・3レベル共通の必要スコア・皆伝 2500点・rulesVersion 3', () => {
    const expected = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1450, 1600, 1750, 1900, 2050, 2200, 2350, 2500];
    expect(MAX_RANK).toBe(21);
    for (const l of LEVELS) expect([...R.levels[l].thresholds]).toEqual(expected);
    expect(R.rulesVersion).toBe(3);
  });

  it('演出の速さは設定でまとめて管理（トレーニングはふつうの速さ、時間制の2モードは同じ速さ）', () => {
    expect(TRAINING_REVEAL.revealSpeed).toBe(1);
    expect(answerSplash.duration === TRAINING_REVEAL.splashMs || answerSplash.duration === 0).toBe(true);
    for (const k of ['countdownMs', 'splashMs', 'revealSpeed', 'revealMaxMs', 'advanceDelayMs']) {
      expect(R[k]).toBe(TIMED_REVEAL[k]);
      expect(CHALLENGE_RULES[k]).toBe(TIMED_REVEAL[k]);
    }
    expect(TIMED_REVEAL).toMatchObject({ revealSpeed: 2.5, revealMaxMs: 3200 });
  });
});

describe('効果音の設定', () => {
  afterEach(() => {
    delete globalThis.AudioContext;
    vi.resetModules();
  });

  async function setup() {
    const oscillators = [];
    const gains = [];
    globalThis.AudioContext = class {
      constructor() {
        this.state = 'running';
        this.currentTime = 0;
        this.destination = {};
      }
      createOscillator() {
        const o = { frequency: {}, connect: (g) => g, start: vi.fn(), stop: vi.fn() };
        oscillators.push(o);
        return o;
      }
      createGain() {
        const g = { gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: (d) => d };
        gains.push(g);
        return g;
      }
    };
    const settings = await import('../src/ui/soundSettings.js');
    const backend = createMemoryBackend();
    settings.configureSoundSettingsStorage(backend);
    const sound = await import('../src/ui/answerSound.js');
    return { settings, sound, oscillators, gains, backend };
  }

  it('オフにすると鳴らない。オンに戻すと鳴る。設定はブラウザに保存される', async () => {
    const { settings, sound, oscillators, backend } = await setup();
    expect(settings.isSoundEnabled()).toBe(true);
    settings.setSoundEnabled(false);
    sound.playAnswerSound('correct');
    sound.playCountdownSound(true);
    expect(oscillators).toHaveLength(0);
    expect(JSON.parse(backend.getItem('cubeMaster:settings')).soundEnabled).toBe(false);
    settings.setSoundEnabled(true);
    sound.playAnswerSound('correct');
    expect(oscillators.length).toBeGreaterThan(0);
  });

  it('音量で大きさが変わり、0 なら鳴らない。こわれた保存値は既定値にもどす', async () => {
    const { settings, sound, oscillators, gains, backend } = await setup();
    settings.setSoundVolume(0.5);
    sound.playAnswerSound('partial');
    const half = gains[0].gain.exponentialRampToValueAtTime.mock.calls[0][0];
    settings.setSoundVolume(1);
    sound.playAnswerSound('partial');
    const full = gains[2].gain.exponentialRampToValueAtTime.mock.calls[0][0];
    expect(half).toBeCloseTo(full / 2, 6);
    const count = oscillators.length;
    settings.setSoundVolume(0);
    sound.playAnswerSound('partial');
    expect(oscillators).toHaveLength(count);
    backend.setItem('cubeMaster:settings', '{"soundEnabled":"yes","soundVolume":9}');
    settings.configureSoundSettingsStorage(backend);
    expect(settings.getSoundSettings()).toEqual({ soundEnabled: true, soundVolume: 1 });
  });
});

describe('画面', () => {
  let container;
  beforeEach(async () => {
    vi.resetModules();
    container = document.createElement('main');
    document.body.append(container);
  });
  afterEach(() => {
    container.remove();
    document.body.replaceChildren();
  });

  it('あそびかた：7つのタブで切りかえて読める（矢印キーでも移れる）。効果音の設定と記録の消去がある', async () => {
    const { mountHelpScreen } = await import('../src/ui/helpScreen.js');
    mountHelpScreen(container, { navigate: vi.fn() });
    const tabs = [...container.querySelectorAll('[role="tab"]')];
    expect(tabs.map((t) => t.textContent)).toEqual(['CUBE MASTERとは？', 'トレーニング', '1分チャレンジ', '段位認定', '3Dの操作', 'ヒント・復習・学習記録', '記録と設定']);
    const visible = () => [...container.querySelectorAll('[role="tabpanel"]')].filter((p) => !p.hidden).map((p) => p.dataset.tab);
    expect(visible()).toEqual(['about']);
    tabs[2].click();
    expect(visible()).toEqual(['challenge']);
    const challenge = container.querySelector('#help-challenge').textContent;
    for (const text of ['60秒', '10秒', 'ヒントとパスは使えません', '最高記録']) expect(challenge).toContain(text);
    tabs[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(visible()).toEqual(['certification']);
    const cert = container.querySelector('#help-certification').textContent;
    for (const text of ['100秒', '240点', '3秒ふえます', '2500点で皆伝', '五段★']) expect(cert).toContain(text);
    tabs[6].click();
    expect(container.querySelector('[data-testid="sound-toggle"]')).not.toBeNull();
    expect([...container.querySelectorAll('button')].some((b) => b.textContent === '学習記録を消去')).toBe(true);
  });

  it('トップ画面に効果音のオン／オフ（押すと切りかわる）', async () => {
    const settings = await import('../src/ui/soundSettings.js');
    settings.configureSoundSettingsStorage(createMemoryBackend());
    const { mountHomeScreen } = await import('../src/ui/homeScreen.js');
    mountHomeScreen(container, { navigate: vi.fn(), version: '0.7.0' });
    const toggle = container.querySelector('[data-testid="sound-toggle"]');
    expect(toggle.textContent).toBe('効果音：オン');
    toggle.click();
    expect(toggle.textContent).toBe('効果音：オフ');
    expect(settings.isSoundEnabled()).toBe(false);
  });
});

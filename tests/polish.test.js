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
        const o = { frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: (g) => g, start: vi.fn(), stop: vi.fn() };
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

  it('ボタンを押すと「ポッ」と鳴る（高さを下げる短い音）。無効なボタン・ボタン以外・オフのときは鳴らない', async () => {
    const { settings, sound, oscillators } = await setup();
    const root = document.createElement('div');
    const btn = document.createElement('button');
    btn.append(document.createElement('span'));
    const off = document.createElement('button');
    off.disabled = true;
    const text = document.createElement('p');
    root.append(btn, off, text);
    document.body.append(root);
    const remove = sound.installButtonSound(root);
    btn.firstChild.click();
    expect(oscillators).toHaveLength(1);
    expect(oscillators[0].frequency.value).toBeLessThan(400);
    off.click();
    text.click();
    expect(oscillators).toHaveLength(1);
    btn.dataset.clickSound = 'off';
    btn.click();
    expect(oscillators).toHaveLength(1);
    delete btn.dataset.clickSound;
    settings.setSoundEnabled(false);
    btn.click();
    expect(oscillators).toHaveLength(1);
    settings.setSoundEnabled(true);
    remove();
    btn.click();
    expect(oscillators).toHaveLength(1);
    root.remove();
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

  it('あそびかた：9つのタブで切りかえて読める（矢印キーでも移れる）。効果音の設定と記録の消去がある', async () => {
    const { mountHelpScreen } = await import('../src/ui/helpScreen.js');
    mountHelpScreen(container, { navigate: vi.fn() });
    const tabs = [...container.querySelectorAll('[role="tab"]')];
    expect(tabs.map((t) => t.textContent)).toEqual(['CUBE MASTERとは？', 'トライアル', 'ドリルモード', '1分チャレンジ', '段位認定', '3Dの操作', 'ヒント・復習・学習記録', '学習ヘルプ', '記録と設定']);
    const visible = () => [...container.querySelectorAll('[role="tabpanel"]')].filter((p) => !p.hidden).map((p) => p.dataset.tab);
    expect(visible()).toEqual(['about']);
    tabs[1].click();
    expect(visible()).toEqual(['trial']);
    const trial = container.querySelector('#help-trial').textContent;
    for (const text of ['100秒', '積み木の数はいくつ？', '3方向から見ると？', 'サイコロを転がすと？', '展開図に分けろ！', 'LEVEL＋1', '＋2', '最高到達LEVEL', '左右にずれていても正解', '中断']) expect(trial).toContain(text);
    tabs[3].click();
    expect(visible()).toEqual(['challenge']);
    const challenge = container.querySelector('#help-challenge').textContent;
    for (const text of ['60秒', '10秒', 'ヒントとパスは使えません', '最高記録']) expect(challenge).toContain(text);
    tabs[3].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(visible()).toEqual(['certification']);
    const cert = container.querySelector('#help-certification').textContent;
    for (const text of ['100秒', '240点', '3秒ふえます', '2500点で皆伝', '五段★']) expect(cert).toContain(text);
    tabs[8].click();
    expect(container.querySelector('[data-testid="sound-toggle"]')).not.toBeNull();
    expect([...container.querySelectorAll('button')].some((b) => b.textContent === '学習記録を消去')).toBe(true);
  });

  it('あそびかたの下は「タイトルに戻る」「KEC数学科ラボへ」。ラボへは確かめてから移動する', async () => {
    const { mountHelpScreen, MATH_LAB_URL } = await import('../src/ui/helpScreen.js');
    const navigate = vi.fn();
    mountHelpScreen(container, { navigate });
    const actions = [...container.querySelectorAll('.help-actions button')];
    expect(actions.map((b) => b.textContent)).toEqual(['タイトルに戻る', 'KEC数学科ラボへ']);
    actions[0].click();
    expect(navigate).toHaveBeenCalledWith('home');
    const assign = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...original, assign } });
    try {
      const pick = async (label) => {
        actions[1].click();
        const dialog = document.querySelector('.dialog');
        expect(dialog.querySelector('.dialog__title').textContent).toBe('KEC数学科ラボへ移動しますか？');
        [...dialog.querySelectorAll('button')].find((b) => b.textContent === label).click();
        await new Promise((r) => setTimeout(r, 0));
      };
      await pick('いいえ');
      expect(assign).not.toHaveBeenCalled();
      await pick('はい');
      expect(assign).toHaveBeenCalledWith(MATH_LAB_URL);
      expect(MATH_LAB_URL).toBe('https://taka-t-p.github.io/math-app-portal/');
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original });
    }
  });

  it('トップ画面に効果音のオン／オフ（押すと切りかわる）', async () => {
    const settings = await import('../src/ui/soundSettings.js');
    settings.configureSoundSettingsStorage(createMemoryBackend());
    const { mountHomeScreen } = await import('../src/ui/homeScreen.js');
    mountHomeScreen(container, { navigate: vi.fn(), version: '0.7.0' });
    const toggle = container.querySelector('[data-testid="sound-toggle"]');
    expect([...container.querySelectorAll('.home-menu button')].map((b) => b.textContent)).toEqual(['トライアル', 'ドリルモード', '段位認定', '3D立方体をためす', 'あそびかた']);
    expect(container.querySelector('[data-testid="copyright"]').textContent).toBe('©2026 T.TAKEMOTO / KEC Glows');
    expect(toggle.closest('.home-corner')).not.toBeNull();
    expect(toggle.querySelector('svg')).not.toBeNull();
    expect(toggle.getAttribute('aria-label')).toBe('効果音：オン');
    toggle.click();
    expect(toggle.getAttribute('aria-label')).toBe('効果音：オフ');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(settings.isSoundEnabled()).toBe(false);
  });
});

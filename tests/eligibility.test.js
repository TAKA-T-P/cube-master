// @vitest-environment jsdom
// 出題範囲（三平方の定理・√）の設定・モードごとの出題・カテゴリ順・学習ヘルプ
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createEventBus } from '../src/core/eventBus.js';
import { createRng } from '../src/utils/random.js';

vi.mock('../src/ui/answerSound.js', () => ({ playAnswerSound: vi.fn(), playFinishSound: vi.fn(), playRankUpSound: vi.fn(), playTimeUpSound: vi.fn(), playCountdownSound: vi.fn() }));
vi.mock('../src/three/cubeViewer.js', () => ({
  FACE_DISPLAY_MODES: { OPAQUE: 'opaque', TRANSLUCENT: 'translucent', WIREFRAME: 'wireframe' },
  createCubeViewer: () => globalThis.__createFakeViewer(),
}));
vi.mock('../src/ui/homeCube.js', () => ({ createHomeCube: () => ({ el: document.createElement('div'), destroy: () => {} }) }));

const { PREREQUISITE_IDS, ADVANCED_MATH, isValidPrerequisites } = await import('../src/core/learningPrerequisites.js');
const { PLAY_MODES, allowsAdvancedMath, requiresAdvancedMath, isQuestionEligible, isTemplateAvailable, NoEligibleQuestionError } = await import('../src/core/questionEligibility.js');
const { QuestionPicker, MAX_ELIGIBLE_ATTEMPTS } = await import('../src/core/questionEngine.js');
const { TimedChallengeSession } = await import('../src/core/timedChallengeSession.js');
const { CertificationSession } = await import('../src/core/certificationSession.js');
const { CERTIFICATION_RULES } = await import('../src/core/certificationRules.js');
const { CATEGORIES, getTemplates, categoryNumber } = await import('../src/questions/questionRegistry.js');
const { getQuestionErrors } = await import('../src/core/questionSchema.js');
const { HELP_TOPICS, getHelpTopic, helpTopicsForQuestion } = await import('../src/core/learningHelp.js');
const { renderHelpTopic } = await import('../src/ui/learningHelpVisuals.js');
const settings = await import('../src/ui/soundSettings.js');
const store = await import('../src/ui/trainingStore.js');
const { mountHomeScreen, SETTING_NOTE } = await import('../src/ui/homeScreen.js');
const { mountQuestionScreen } = await import('../src/ui/questionScreen.js');
const { mountHelpScreen } = await import('../src/ui/helpScreen.js');
const { answerSplash } = await import('../src/ui/answerSplash.js');
const { createMemoryBackend } = await import('../src/core/storageManager.js');

answerSplash.duration = 0;

globalThis.__createFakeViewer = () => ({
  events: createEventBus(),
  animations: { cancel: vi.fn(), skip: vi.fn(), setSpeed: vi.fn() },
  ...Object.fromEntries(
    ['setFigureOnly', 'setSelectionEnabled', 'setFaceDisplayMode', 'clearHighlights', 'clearSelection', 'highlightElements', 'setCameraPreset', 'resetCamera', 'dispose', 'setFaceDecorations', 'setCubeOrientation', 'setLabelsVisible', 'enableRotation', 'disableRotation', 'enableZoom', 'disableZoom', 'setBlocks', 'setNet', 'playNetFold', 'setSubcubes', 'playSubcubeSeparation', 'setCutting', 'setSurfacePath', 'setSolid', 'setMetric'].map((k) => [k, vi.fn()]),
  ),
  playAnswerReveal: vi.fn(() => Promise.resolve({ status: 'completed' })),
  playQuestionReveal: vi.fn(() => Promise.resolve({ status: 'completed' })),
  getNetFold: vi.fn(() => 1),
  getSubcubeSeparation: vi.fn(() => 1),
  isFigureOnly: vi.fn(() => false),
});

const ALL_TEMPLATES = CATEGORIES.flatMap((c) => c.templates);
/** 三平方の定理・√ を使う問題があるテンプレート（always：すべて／sometimes：一部の問題だけ） */
const ADVANCED = { always: ['G03', 'S03'], sometimes: ['K05', 'G04', 'G05', 'G06', 'S02', 'S05', 'S06'] };

/** テンプレートから n 問作る */
function generate(template, { allowAdvanced, n = 25, seed = 1 }) {
  const picker = new QuestionPicker({ templates: [template], rng: createRng(seed), allowAdvanced });
  return Array.from({ length: n }, () => picker.next());
}

const buttonByText = (root, text) => [...root.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
let container;
let backend;
beforeEach(() => {
  backend = createMemoryBackend();
  settings.configureSoundSettingsStorage(backend);
  store.resetTrainingStore();
  container = document.createElement('main');
  document.body.append(container);
});
afterEach(() => {
  container.remove();
  document.body.replaceChildren();
  settings.configureSoundSettingsStorage(undefined);
});

describe('前提知識（prerequisites）', () => {
  it('三平方の定理・√ だけが「出題しない」の対象。ほかの前提知識（体積・立体の名前・ねじれの位置）は対象にしない', () => {
    expect(ADVANCED_MATH).toEqual(['pythagorean', 'squareRoot']);
    expect(PREREQUISITE_IDS).toEqual(expect.arrayContaining(['pythagorean', 'squareRoot', 'prismVolume', 'pyramidVolume', 'solidTypes', 'regularPolyhedra', 'skewLines']));
    expect(requiresAdvancedMath({ prerequisites: ['pyramidVolume', 'skewLines'] })).toBe(false);
    expect(requiresAdvancedMath({ prerequisites: ['squareRoot'] })).toBe(true);
    expect(requiresAdvancedMath({ prerequisites: ['pythagorean'] })).toBe(true);
    expect(requiresAdvancedMath({})).toBe(false);
    expect(isValidPrerequisites(['pyramidVolume'])).toBe(true);
    expect(isValidPrerequisites(['unknown'])).toBe(false);
  });

  it('設定を見るのは通常トレーニングだけ。1分チャレンジ・段位認定は設定にかかわらず出題しない', () => {
    for (const allowPythagoreanQuestions of [true, false]) {
      expect(allowsAdvancedMath(PLAY_MODES.TRAINING, { allowPythagoreanQuestions })).toBe(allowPythagoreanQuestions);
      expect(allowsAdvancedMath(PLAY_MODES.CHALLENGE, { allowPythagoreanQuestions })).toBe(false);
      expect(allowsAdvancedMath(PLAY_MODES.CERTIFICATION, { allowPythagoreanQuestions })).toBe(false);
    }
    expect(allowsAdvancedMath(PLAY_MODES.TRAINING, {})).toBe(false);
    const q = { prerequisites: ['pythagorean', 'squareRoot'] };
    expect(isQuestionEligible(q, PLAY_MODES.TRAINING, { allowPythagoreanQuestions: true })).toBe(true);
    expect(isQuestionEligible(q, PLAY_MODES.TRAINING, { allowPythagoreanQuestions: false })).toBe(false);
    expect(isQuestionEligible(q, PLAY_MODES.CHALLENGE, { allowPythagoreanQuestions: true })).toBe(false);
  });

  it('全75テンプレート：対象のテンプレートだけが advanced を持ち、作った問題には正しい prerequisites が付く', () => {
    expect(ALL_TEMPLATES).toHaveLength(75);
    expect(ALL_TEMPLATES.filter((t) => t.advanced === 'always').map((t) => t.id).sort()).toEqual(ADVANCED.always);
    expect(ALL_TEMPLATES.filter((t) => t.advanced === 'sometimes').map((t) => t.id).sort()).toEqual([...ADVANCED.sometimes].sort());
    for (const t of ALL_TEMPLATES) {
      for (const q of generate(t, { allowAdvanced: true, n: 6 })) {
        expect(Array.isArray(q.prerequisites), t.id).toBe(true);
        expect(isValidPrerequisites(q.prerequisites), t.id).toBe(true);
        expect(getQuestionErrors(q), t.id).toEqual([]);
        // 対象外のテンプレートの問題が、三平方の定理・√ を要求することはない
        if (!t.advanced) expect(requiresAdvancedMath(q), t.id).toBe(false);
      }
    }
  });

  it('いつも三平方の定理・√ を使うテンプレート（G03・S03）は、出題する設定のときだけ出る', () => {
    for (const id of ADVANCED.always) {
      const t = ALL_TEMPLATES.find((x) => x.id === id);
      expect(isTemplateAvailable(t, false)).toBe(false);
      expect(generate(t, { allowAdvanced: true, n: 5 }).every(requiresAdvancedMath)).toBe(true);
      expect(() => new QuestionPicker({ templates: [t], allowAdvanced: false })).toThrow(NoEligibleQuestionError);
    }
  });

  it('同じテンプレートでも問題ごとに判定する：設定 ON では √ の問題も出て、OFF では √ を使わない問題だけが出る', () => {
    for (const id of ADVANCED.sometimes) {
      const t = ALL_TEMPLATES.find((x) => x.id === id);
      expect(isTemplateAvailable(t, false)).toBe(true);
      const on = generate(t, { allowAdvanced: true, n: 40, seed: 5 });
      const off = generate(t, { allowAdvanced: false, n: 25, seed: 5 });
      expect(on.some(requiresAdvancedMath), `${id} ON`).toBe(true);
      expect(off.some(requiresAdvancedMath), `${id} OFF`).toBe(false);
      for (const q of off) expect(getQuestionErrors(q), id).toEqual([]);
    }
  });

  it('出題できる問題がないときは、作り直しを上限で止めて NoEligibleQuestionError（難易度や設定を勝手に変えない）', () => {
    const build = vi.fn(() => ({ ...generate(getTemplates('dice')[0], { allowAdvanced: true, n: 1 })[0], prerequisites: ['squareRoot'] }));
    const fake = { ...getTemplates('dice')[0], id: 'X99', advanced: 'sometimes', build };
    const picker = new QuestionPicker({ templates: [fake], difficulty: fake.difficulty, rng: createRng(1), allowAdvanced: false });
    expect(() => picker.next()).toThrow(NoEligibleQuestionError);
    expect(build.mock.calls.length).toBeLessThanOrEqual(MAX_ELIGIBLE_ATTEMPTS);
    expect(picker.difficulty).toBe(fake.difficulty);
    expect(new NoEligibleQuestionError().message).not.toBe('');
  });

  it('どのカテゴリ・どの難易度でも、設定 OFF で出題できる問題がある', () => {
    for (const c of CATEGORIES) {
      for (const difficulty of ['all', 1, 2, 3]) {
        expect(() => new QuestionPicker({ templates: c.templates, difficulty, rng: createRng(2), allowAdvanced: false }).next(), `${c.id} ${difficulty}`).not.toThrow();
      }
    }
  });
});

describe('タイトル画面の設定', () => {
  it('初期値は「出題しない」。古い保存データ（項目なし）も「出題しない」として読む', () => {
    expect(settings.isPythagoreanAllowed()).toBe(false);
    backend.setItem('cubeMaster:settings', JSON.stringify({ soundEnabled: false, soundVolume: 0.5 }));
    settings.configureSoundSettingsStorage(backend);
    expect(settings.isPythagoreanAllowed()).toBe(false);
    expect(settings.getSoundSettings()).toEqual({ soundEnabled: false, soundVolume: 0.5 });
  });

  it('cubeMaster:settings に allowPythagoreanQuestions として保存し、読み直しても同じ。効果音の設定は消えない', () => {
    settings.setSoundVolume(0.3);
    settings.setPythagoreanAllowed(true);
    settings.configureSoundSettingsStorage(backend);
    expect(settings.isPythagoreanAllowed()).toBe(true);
    expect(settings.getSoundVolume()).toBe(0.3);
    expect(JSON.parse(backend.getItem('cubeMaster:settings'))).toMatchObject({ allowPythagoreanQuestions: true, soundVolume: 0.3 });
  });

  it('あそびかたの下に2択だけを置く（説明文は「？」の中）。選ぶと保存される', () => {
    mountHomeScreen(container, { navigate: vi.fn(), version: 'test' });
    const section = container.querySelector('[data-testid="pythagorean-setting"]');
    expect(container.querySelector('.home-menu').nextElementSibling).toBe(section);
    const [off, on] = section.querySelectorAll('.home-setting__option');
    expect([off, on].map((b) => b.textContent)).toEqual(['出題しない（おすすめ）', '出題する']);
    // ボタンの下に説明文は出さない
    expect(section.querySelectorAll('p')).toHaveLength(0);
    expect(off.getAttribute('aria-checked')).toBe('true');
    on.click();
    expect(on.getAttribute('aria-checked')).toBe('true');
    expect(off.getAttribute('aria-checked')).toBe('false');
    expect(settings.isPythagoreanAllowed()).toBe(true);
    // 「？」で、2つの選択肢の説明と注意書きを読める
    section.querySelector('.home-setting__head button').click();
    const dialog = document.body.textContent;
    expect(dialog).toContain('三平方の定理や√を使う問題も出題します。');
    expect(dialog).toContain(SETTING_NOTE);
    expect(SETTING_NOTE).toBe('※この設定はドリルモードにのみ反映されます。1分チャレンジ・段位認定では、どちらの設定でも出題されません。');
  });
});

describe('モードごとの出題', () => {
  const answerAll = (session, count) => {
    const out = [];
    for (let i = 0; i < count && !session.isComplete(); i++) {
      const q = session.nextQuestion();
      out.push(q);
      session.submit(q.correctAnswers);
    }
    return out;
  };

  it('通常トレーニング：設定 OFF では √ の問題が出ず、ON では出る。設定は始めたときの値で固定', () => {
    for (const category of ['cubeGeometryChallenge', 'surfacePath']) {
      const off = store.startTraining({ category, difficulty: 'all', questionLimit: 'endless' }, { rng: createRng(3) });
      expect(store.getSettings().allowPythagoreanQuestions).toBe(false);
      settings.setPythagoreanAllowed(true); // 途中で変えても、このプレイには反映しない
      expect(answerAll(off, 40).some(requiresAdvancedMath)).toBe(false);
      const on = store.startTraining({ category, difficulty: 'all', questionLimit: 'endless' }, { rng: createRng(3) });
      expect(store.getSettings().allowPythagoreanQuestions).toBe(true);
      expect(answerAll(on, 60).some(requiresAdvancedMath)).toBe(true);
      settings.setPythagoreanAllowed(false);
    }
  });

  it('1分チャレンジ：設定が ON でも √ の問題は出ない', () => {
    settings.setPythagoreanAllowed(true);
    for (const category of ['cubeCutting', 'cubeGeometryChallenge', 'surfacePath']) {
      const s = new TimedChallengeSession({ category, templates: getTemplates(category), rng: createRng(7), now: () => 0 });
      for (let i = 0; i < 40; i++) {
        const q = s.nextQuestion();
        expect(requiresAdvancedMath(q), `${category} ${q.templateId}`).toBe(false);
        s.startAnswering();
        s.submit(q.correctAnswers);
      }
      expect(s.state.history.some((h) => ADVANCED.always.includes(h.question?.templateId))).toBe(false);
    }
  });

  it('段位認定：設定が ON でも √ の問題は出ない。カテゴリ・ルールは変えない', () => {
    settings.setPythagoreanAllowed(true);
    expect(CERTIFICATION_RULES.categories).toHaveLength(6);
    expect(CERTIFICATION_RULES.rulesVersion).toBe(3);
    const templatesByCategory = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.templates]));
    for (const level of ['basic', 'standard', 'expert']) {
      const s = new CertificationSession({ level, templatesByCategory, rng: createRng(4), now: () => 0 });
      expect(s.categories.every((c) => CERTIFICATION_RULES.categories.includes(c))).toBe(true);
      for (let i = 0; i < 30; i++) {
        const q = s.nextQuestion();
        if (!q) break;
        expect(requiresAdvancedMath(q)).toBe(false);
        s.startAnswering();
        s.submit(q.correctAnswers);
      }
    }
  });
});

describe('カテゴリの順序', () => {
  it('①〜⑩ の順に並び、内部の id・テンプレート id は変えない', () => {
    expect(CATEGORIES.map((c) => `${categoryNumber(c.id)}${c.name}`)).toEqual([
      '①立方体の個数・着色',
      '②サイコロ・回転',
      '③積み木の見え方・投影図',
      '④展開図パズル',
      '⑤展開図と頂点・辺',
      '⑥立方体の切断',
      '⑦位置関係',
      '⑧立方体に内接する立体と体積',
      '⑨立方体に隠れた図形・長さ・角度',
      '⑩立方体の表面の最短経路',
    ]);
    expect(getTemplates('cubeCutting').map((t) => t.id)[0]).toBe('K01');
    expect(getTemplates('surfacePath').map((t) => t.id)[0]).toBe('S01');
  });
});

describe('学習ヘルプ', () => {
  it('5つの項目（角柱の体積・角錐の体積・いろいろな立体・正多面体・ねじれの位置）。三角錐＝四面体の説明がある', () => {
    expect(HELP_TOPICS.map((t) => t.id)).toEqual(['prismVolume', 'pyramidVolume', 'solidTypes', 'regularPolyhedra', 'skewLines']);
    expect(getHelpTopic('prismVolume').formula).toBe('体積＝底面積×高さ');
    expect(getHelpTopic('pyramidVolume').formula).toBe('体積＝底面積×高さ÷3');
    expect(getHelpTopic('solidTypes').points.join('')).toContain('三角錐は面が4つなので、四面体ともいいます');
    expect(getHelpTopic('regularPolyhedra').points.join('')).toContain('全部で5種類');
    expect(getHelpTopic('skewLines').lead).toContain('ねじれの位置');
  });

  it('図（SVG）を描く。どの項目にも図がある', () => {
    for (const t of HELP_TOPICS) {
      const el = renderHelpTopic(t.id);
      expect(el.querySelectorAll('svg').length, t.id).toBe(t.figures.length);
      expect(el.querySelector('.help-topic__lead').textContent).toBe(t.lead);
    }
    expect(renderHelpTopic('skewLines').querySelectorAll('[data-pair]')).toHaveLength(4);
  });

  it('問題の prerequisites から開けるヘルプが決まる（三平方の定理・√ のヘルプはない）', () => {
    expect(helpTopicsForQuestion({ prerequisites: ['pyramidVolume', 'regularPolyhedra'] }).map((t) => t.id)).toEqual(['pyramidVolume', 'regularPolyhedra']);
    expect(helpTopicsForQuestion({ prerequisites: ['pythagorean', 'squareRoot'] })).toEqual([]);
    expect(helpTopicsForQuestion({})).toEqual([]);
    expect(helpTopicsForQuestion({ prerequisites: ['skewLines'] }).map((t) => t.id)).toEqual(['skewLines']);
  });

  it('ヘルプの文に、問題の答えや頂点の名前は出ない（一般的な説明だけ）', () => {
    const t = getTemplates('inscribedSolid').find((x) => x.id === 'I03');
    for (const q of generate(t, { allowAdvanced: false, n: 8 })) {
      const text = helpTopicsForQuestion(q).map((h) => renderHelpTopic(h.id).textContent).join('');
      expect(text).not.toBe('');
      for (const id of q.correctAnswers) {
        const label = q.choices.find((c) => c.id === id).label;
        if (/\d/.test(label)) expect(text).not.toContain(label);
      }
    }
  });

  it('あそびかたに「学習ヘルプ」のタブがあり、5つの項目を読める', () => {
    mountHelpScreen(container, { navigate: vi.fn() });
    buttonByText(container, '学習ヘルプ').click();
    for (const t of HELP_TOPICS) expect(container.textContent).toContain(t.title);
    expect(container.querySelectorAll('.help-topic')).toHaveLength(5);
  });

  it('通常トレーニングの問題画面では「？」ボタンでヘルプを開ける', () => {
    store.startTraining({ category: 'inscribedSolid', difficulty: 'all', questionLimit: 3 }, { rng: createRng(4) });
    mountQuestionScreen(container, { navigate: vi.fn(), params: {} });
    const q = store.getSession().state.currentQuestion;
    const buttons = [...container.querySelectorAll('.btn--learning-help')];
    expect(buttons.map((b) => b.textContent)).toEqual(helpTopicsForQuestion(q).map((t) => `？ ${t.title}`));
    expect(buttons.length).toBeGreaterThan(0);
    buttons[0].click();
    expect(document.querySelector('.dialog--wide .help-topic')).not.toBeNull();
  });

  it('時間制限のあるモード（1分チャレンジ・段位認定）の問題画面には、ヘルプのボタンを出さない', () => {
    store.startTraining({ category: 'inscribedSolid', difficulty: 'all', questionLimit: 3 }, { rng: createRng(4) });
    const session = new TimedChallengeSession({ category: 'inscribedSolid', templates: getTemplates('inscribedSolid'), rng: createRng(4), now: () => 0 });
    const mode = { kind: 'certification', session, headerItems: [], onQuit: vi.fn(), onQuestionShown: vi.fn(), onAnswered: vi.fn(), onFinish: vi.fn() };
    mountQuestionScreen(container, { navigate: vi.fn(), params: {}, mode });
    expect(helpTopicsForQuestion(session.state.currentQuestion).length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.btn--learning-help')).toHaveLength(0);
  });
});

describe('選択肢の √', () => {
  it('√ を使わない問題では、まちがいの選択肢にも √ を出さない（K05・G06・S05 など数を答える問題）', () => {
    for (const t of ALL_TEMPLATES) {
      if (t.advanced === 'always') continue;
      for (const q of generate(t, { allowAdvanced: false, n: 20, seed: 8 })) {
        if (requiresAdvancedMath(q)) continue;
        for (const c of q.choices) expect(c.label ?? '', `${t.id} ${q.question}`).not.toContain('√');
        expect(new Set(q.choices.map((c) => c.id)).size).toBe(q.choices.length);
      }
    }
  });
});

describe('「回答する」の位置', () => {
  it('「ヒントを見る」の右どなりに「回答する」がある（ヒントのない時間制のモードでも同じ行）', () => {
    store.startTraining({ category: 'position', difficulty: 1, questionLimit: 2 }, { rng: createRng(3) });
    mountQuestionScreen(container, { navigate: vi.fn(), params: {} });
    const row = container.querySelector('.quiz-hint-row');
    expect(row.children[0].textContent).toBe('ヒントを見る');
    expect(row.querySelector('.quiz-actions .btn--primary').textContent).toBe('回答する');
    expect(container.querySelector('.quiz-answer .quiz-actions')).toBeNull();
  });
});

describe('解説の分数', () => {
  it('1/2・9/2・√2/2・2√10/3 を縦型の分数（上が分子・下が分母）で表示し、文字としては「1/2」のまま', async () => {
    const { renderMathText } = await import('../src/ui/mathText.js');
    const el = document.createElement('p');
    el.append(renderMathText('高さは1/2、面積は9/2cm²、1辺の√2/2倍、長さは2√10/3cmです。'));
    const fracs = [...el.querySelectorAll('.frac')];
    expect(fracs.map((f) => [f.querySelector('.frac__num').textContent, f.querySelector('.frac__den').textContent])).toEqual([
      ['1', '2'],
      ['9', '2'],
      ['√2', '2'],
      ['2√10', '3'],
    ]);
    expect(el.textContent).toBe('高さは1/2、面積は9/2cm²、1辺の√2/2倍、長さは2√10/3cmです。');
    const plain = document.createElement('p');
    plain.append(renderMathText('分数のない文'));
    expect(plain.querySelector('.frac')).toBeNull();
  });
});

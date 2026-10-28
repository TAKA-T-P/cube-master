// @vitest-environment jsdom
// 問題テンプレート図鑑（開発者の確認用）：隠し操作・一覧・1つのテンプレートの確認（正解で回答・別の問題・記録に残さない）
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createEventBus } from '../src/core/eventBus.js';

vi.mock('../src/ui/answerSound.js', () => ({ playAnswerSound: vi.fn(), playFinishSound: vi.fn(), playRankUpSound: vi.fn(), playTimeUpSound: vi.fn(), playCountdownSound: vi.fn() }));
vi.mock('../src/three/cubeViewer.js', () => ({
  FACE_DISPLAY_MODES: { OPAQUE: 'opaque', TRANSLUCENT: 'translucent', WIREFRAME: 'wireframe' },
  createCubeViewer: () => globalThis.__createFakeViewer(),
}));
vi.mock('../src/ui/homeCube.js', () => ({ createHomeCube: () => ({ el: document.createElement('div'), destroy: () => {} }) }));

const { mountTemplateCatalogScreen, mountTemplateViewScreen } = await import('../src/ui/templateCatalogScreen.js');
const { mountHomeScreen, CATALOG_TAPS } = await import('../src/ui/homeScreen.js');
const { CATEGORIES } = await import('../src/questions/questionRegistry.js');
const { answerSplash } = await import('../src/ui/answerSplash.js');
const learning = await import('../src/ui/learningStore.js');
const { createMemoryBackend } = await import('../src/core/storageManager.js');

answerSplash.duration = 0;

let viewer;
globalThis.__createFakeViewer = () => {
  viewer = {
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
  };
  return viewer;
};

const ALL = CATEGORIES.flatMap((c) => c.templates);
const buttonByText = (root, text) => [...root.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
let container;
let screens;
beforeEach(() => {
  learning.configureLearningStorage(createMemoryBackend());
  container = document.createElement('main');
  document.body.append(container);
  screens = [];
});
afterEach(() => {
  for (const s of screens) s.unmount();
  container.remove();
  document.body.replaceChildren();
  vi.useRealTimers();
});
const mount = (fn, params) => {
  container.replaceChildren();
  const navigate = vi.fn();
  screens.push(fn(container, { navigate, params, version: 'test' }));
  return navigate;
};

describe('隠し操作', () => {
  it('タイトル画面のバージョン表示を続けて5回押すと図鑑が開く（4回では開かない）', () => {
    const navigate = mount(mountHomeScreen);
    const version = container.querySelector('[data-testid="version"]');
    for (let i = 0; i < CATALOG_TAPS - 1; i++) version.click();
    expect(navigate).not.toHaveBeenCalled();
    version.click();
    expect(navigate).toHaveBeenCalledWith('catalog');
    // メニューに図鑑のボタンは出さない
    expect(container.textContent).not.toContain('図鑑');
  });

  it('間があくと数え直す', () => {
    vi.useFakeTimers();
    const navigate = mount(mountHomeScreen);
    const version = container.querySelector('[data-testid="version"]');
    for (let i = 0; i < CATALOG_TAPS - 1; i++) version.click();
    vi.advanceTimersByTime(5000);
    version.click();
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('一覧', () => {
  it('全75テンプレートを、カテゴリ①〜⑩ごとに ID・難易度・内容・√ の扱い・時間制のモードと一緒に並べる', () => {
    mount(mountTemplateCatalogScreen, {});
    const rows = [...container.querySelectorAll('.catalog-row')];
    expect(rows.map((r) => r.dataset.template)).toEqual(ALL.map((t) => t.id));
    expect(container.querySelectorAll('.catalog-section')).toHaveLength(10);
    expect(container.querySelector('.catalog-section__title').textContent).toBe('① 立方体の個数・着色（12）');
    const g03 = rows.find((r) => r.dataset.template === 'G03');
    expect(g03.textContent).toContain('いつも');
    // G03 は √ を使うので、1分チャレンジ・段位認定には出ない
    expect(g03.lastElementChild.textContent).toBe('—');
    expect(rows.find((r) => r.dataset.template === 'P01').lastElementChild.textContent).toBe('1分・段位');
    expect(rows.find((r) => r.dataset.template === 'K01').lastElementChild.textContent).toBe('1分');
  });

  it('基準の数・前提知識・回答の形は、表示したあとで少しずつ数える', async () => {
    mount(mountTemplateCatalogScreen, {});
    const row = () => container.querySelector('[data-template="B01"]');
    expect(row().textContent).toContain('…');
    await vi.waitFor(() => expect(row().textContent).not.toContain('…'), { timeout: 5000 });
    expect(row().children[3].textContent).toBe('1つ');
    expect(row().children[5].textContent).toMatch(/^\d+ \/ \d+$/);
  });

  it('カテゴリ・ID で絞りこめる。行を押すとそのテンプレートの確認画面へ（√ の設定も渡す）', () => {
    const navigate = mount(mountTemplateCatalogScreen, { adv: '1' });
    const select = container.querySelector('.catalog-select');
    select.value = 'cubeCutting';
    select.dispatchEvent(new Event('change'));
    expect([...container.querySelectorAll('.catalog-section')].filter((s) => !s.hidden).map((s) => s.dataset.category)).toEqual(['cubeCutting']);
    const search = container.querySelector('.catalog-search');
    search.value = 'k05';
    search.dispatchEvent(new Event('input'));
    expect([...container.querySelectorAll('[data-category="cubeCutting"] .catalog-row')].filter((r) => !r.hidden).map((r) => r.dataset.template)).toEqual(['K05']);
    container.querySelector('[data-template="K05"]').click();
    expect(navigate).toHaveBeenCalledWith('catalog-view', { template: 'K05', seed: '1', adv: '1' });
  });
});

describe('テンプレートの確認', () => {
  it('問題の図・選択肢を出し、「正解で回答」で正解・解説・3D の演出を見られる。学習記録には残さない', async () => {
    const navigate = mount(mountTemplateViewScreen, { template: 'K05', seed: '3', adv: '1' });
    expect(container.querySelector('[data-testid="catalog-id"]').textContent).toBe('K05 #3');
    expect(container.querySelectorAll('.choice').length).toBeGreaterThan(1);
    buttonByText(container, '正解で回答').click();
    await new Promise((r) => setTimeout(r, 0));
    expect(container.querySelector('.feedback__title').textContent).toBe('正解！');
    expect(container.querySelector('.feedback__explanation').textContent).not.toBe('');
    expect(viewer.playQuestionReveal).toHaveBeenCalled();
    expect(learning.getLearningStats('cubeCutting')).toBeNull();
    // 回答後は「別の問題」（次のシード）
    buttonByText(container, '別の問題').click();
    expect(navigate).toHaveBeenLastCalledWith('catalog-view', { template: 'K05', seed: '4', adv: '1' });
    buttonByText(container, '図鑑に戻る').click();
    expect(navigate).toHaveBeenLastCalledWith('catalog', { category: 'cubeCutting', adv: '1' });
  });

  it('自分で選んで回答もできる。シードの ◀ ▶ と「情報」（キー・前提知識・正解）', () => {
    const navigate = mount(mountTemplateViewScreen, { template: 'P01', seed: '1', adv: '0' });
    const prev = container.querySelector('[aria-label="前のシード"]');
    expect(prev.disabled).toBe(true);
    container.querySelector('[aria-label="次のシード"]').click();
    expect(navigate).toHaveBeenLastCalledWith('catalog-view', { template: 'P01', seed: '2', adv: '0' });
    buttonByText(container, '情報').click();
    const text = document.body.textContent;
    expect(text).toContain('問題のキー：P01:');
    expect(text).toContain('正解：');
    expect(container.querySelector('.choice')).not.toBeNull();
  });

  it('まちがえても、復習の問題・学習記録には残さない', async () => {
    mount(mountTemplateViewScreen, { template: 'P03', seed: '1', adv: '0' });
    const wrong = [...container.querySelectorAll('.choice')].find((el) => !el.textContent.includes('○'));
    // 正解でない選択肢を1つ選んで回答する（P03 は正解が1つ）
    const ids = [...container.querySelectorAll('.choice')].map((el) => el.dataset.choice);
    buttonByText(container, '情報').click();
    const correct = document.body.textContent.match(/正解：(.+?)出題/)[1];
    const target = [...container.querySelectorAll('.choice')].find((el) => !el.textContent.includes(correct)) ?? wrong;
    expect(ids.length).toBeGreaterThan(1);
    target.click();
    buttonByText(container, '回答する').click();
    await new Promise((r) => setTimeout(r, 0));
    expect(container.querySelector('.feedback__title').textContent).toBe('不正解');
    expect(learning.getSavedReviewCount('position')).toBe(0);
    expect(learning.getLearningStats('position')).toBeNull();
  });

  it('√ を出さない設定で作れないテンプレート（G03）は、理由を出す。ないテンプレートは一覧へ戻す', () => {
    mount(mountTemplateViewScreen, { template: 'G03', seed: '1', adv: '0' });
    expect(container.querySelector('[role="alert"]').textContent).toContain('この設定では問題を作れません');
    const navigate = mount(mountTemplateViewScreen, { template: 'Z99' });
    expect(navigate).toHaveBeenCalledWith('catalog');
  });

  it('全75テンプレートを開いて、正解で回答できる', async () => {
    for (const t of ALL) {
      mount(mountTemplateViewScreen, { template: t.id, seed: '2', adv: '1' });
      buttonByText(container, '正解で回答').click();
      await new Promise((r) => setTimeout(r, 0));
      expect(container.querySelector('.feedback__title').textContent, t.id).toBe('正解！');
      screens.pop().unmount();
    }
  }, 20000); // 75 問を作って開くので、ほかのテストと並んで動くときは時間がかかる
});

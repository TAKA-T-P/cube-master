/**
 * カテゴリと問題テンプレートの登録
 *
 * 新しいカテゴリを追加するときは、テンプレートを作って CATEGORIES の templates に設定し、
 * enabled を true にする。
 */
import { POSITION_TEMPLATES } from './position/positionGenerators.js';
import { DICE_TEMPLATES } from './dice/diceGenerators.js';
import { PROJECTION_TEMPLATES } from './projection/projectionGenerators.js';
import { NET_MAPPING_TEMPLATES } from './netMapping/netMappingGenerators.js';
import { NET_PUZZLE_TEMPLATES } from './netPuzzle/netPuzzleGenerators.js';
import { PAINTED_CUBE_TEMPLATES } from './paintedCube/paintedCubeGenerators.js';
import { withHints } from './hints.js';

export const DIFFICULTIES = Object.freeze([
  { value: 1, label: '基本' },
  { value: 2, label: '標準' },
  { value: 3, label: '応用' },
  { value: 'all', label: 'すべて' },
]);

/** 問題数（スライダーで 1〜20 問） */
export const QUESTION_LIMIT_RANGE = Object.freeze({ min: 1, max: 20 });

export const DEFAULT_SETTINGS = Object.freeze({ difficulty: 'all', questionLimit: 5 });

/** 難易度の表示名（'基本' など） */
export function difficultyLabel(value) {
  return DIFFICULTIES.find((x) => x.value === value)?.label ?? String(value);
}

/**
 * カテゴリ一覧（10）。levelNotes は設定画面に出す難易度の説明。
 */
export const CATEGORIES = Object.freeze([
  // ① 展開図と頂点・辺
  {
    id: 'netMapping',
    name: '展開図と頂点・辺',
    description: '展開図を折りたたむと、どの点や辺が重なる？立方体のつながりを見抜こう！',
    grades: '小学5年生～中学1年生',
    enabled: true,
    templates: withHints(NET_MAPPING_TEMPLATES),
    levelNotes: ['基本：重なる点・向かい合う面', '標準：重なる辺・となり合う面', '応用：完成した立方体・点と辺の組み合わせ'],
  },
  // ②
  { id: 'cutting', name: '切断', description: '立方体を平面で切ったときの切り口を考えよう。', grades: '中学1年生～中学3年生', enabled: false },
  // ③
  {
    id: 'position',
    name: '位置関係',
    description: '立方体の辺と面の「平行・垂直・ねじれ」を見抜こう！',
    grades: '小学6年生～中学1年生',
    enabled: true,
    templates: withHints(POSITION_TEMPLATES),
    levelNotes: ['基本：辺と辺・面と面の平行・垂直など', '標準：辺と面の関係・ねじれの位置', '応用：2つの条件を組み合わせた問題'],
  },
  // ④ 展開図パズル
  {
    id: 'netPuzzle',
    name: '展開図パズル',
    description: '立方体になる展開図はどれ？マスを足したり動かしたりして完成させよう！',
    grades: '小学4年生～中学1年生',
    enabled: true,
    templates: withHints(NET_PUZZLE_TEMPLATES),
    levelNotes: ['基本：立方体になる展開図・あと1マス', '標準：いらない1マス・1マスを動かす', '応用：同じ種類・ちがう種類の展開図'],
  },
  // ⑤
  { id: 'volume', name: '体積・表面積', description: '立体の大きさを計算しよう。', grades: '小学5年生～中学1年生', enabled: false },
  // ⑥
  {
    id: 'dice',
    name: 'サイコロ・回転',
    description: 'サイコロを頭の中でクルッと回そう！目の位置を見抜けるかな？',
    grades: '小学4年生以上',
    enabled: true,
    templates: withHints(DICE_TEMPLATES),
    levelNotes: ['基本：1回転がしたときの上の面・向かい合う面', '標準：見えなかった面・2回転', '応用：同じサイコロ探し・3回転'],
  },
  // ⑦ 小立方体の個数・着色（Phase 4。準備中だった「色ぬり立方体」の内容をふくむ）
  {
    id: 'paintedCube',
    name: '小立方体の個数・着色',
    description: '立方体を小さく分けるとどうなる？色のついた面や、小立方体の数を考えよう！',
    grades: '小学5年生～中学2年生',
    enabled: true,
    templates: PAINTED_CUBE_TEMPLATES,
    levelNotes: ['基本：3面・2面に色がつく小立方体', '標準：1面だけ・色がつかない・一部の面だけ塗る', '応用：条件の組み合わせ・取り除く・分けた数の逆算'],
  },
  // ⑧〜⑨
  { id: 'stacking', name: '積み木', description: '積み重ねた立方体の数を数えよう。', grades: '小学4年生～小学6年生', enabled: false },
  { id: 'path', name: '最短経路', description: '立方体の表面を通る一番短い道を探そう。', grades: '中学1年生～中学3年生', enabled: false },
  // ⑩
  {
    id: 'projection',
    name: '積み木の見え方・投影図',
    description: '積み木を前・横・上から見ると、どんな形に見える？立体の形を見抜こう！',
    grades: '小学4年生～中学2年生',
    enabled: true,
    templates: withHints(PROJECTION_TEMPLATES),
    levelNotes: ['基本：矢印の方向・真上から見た形', '標準：正面図と右側面図・列の高さ', '応用：3方向の図から立体を推理・ありえない図'],
  },
]);

export const getCategory = (id) => CATEGORIES.find((c) => c.id === id) ?? null;

/** 遊べるカテゴリのテンプレート（難易度で絞り込み） */
export function getTemplates(categoryId, difficulty = 'all') {
  const category = getCategory(categoryId);
  if (!category?.enabled) return [];
  return category.templates.filter((t) => difficulty === 'all' || t.difficulty === difficulty);
}

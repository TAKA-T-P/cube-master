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

export const DIFFICULTIES = Object.freeze([
  { value: 1, label: '★1', name: 'きほん' },
  { value: 2, label: '★2', name: '標準' },
  { value: 3, label: '★3', name: 'チャレンジ' },
  { value: 'all', label: 'すべて', name: '混合出題' },
]);

export const QUESTION_LIMITS = Object.freeze([
  { value: 5, label: '5問' },
  { value: 10, label: '10問' },
  { value: 20, label: '20問' },
  { value: 'endless', label: 'エンドレス' },
]);

export const DEFAULT_SETTINGS = Object.freeze({ difficulty: 'all', questionLimit: 10 });

/** 難易度の表示名（'★1 きほん' など） */
export function difficultyLabel(value) {
  const d = DIFFICULTIES.find((x) => x.value === value);
  return d ? (d.value === 'all' ? d.label : `${d.label} ${d.name}`) : String(value);
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
    templates: NET_MAPPING_TEMPLATES,
    levelNotes: ['★1 きほん：重なる点・向かい合う面', '★2 標準：重なる辺・となり合う面', '★3 チャレンジ：完成した立方体・点と辺の組み合わせ'],
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
    templates: POSITION_TEMPLATES,
    levelNotes: ['★1 きほん：辺と辺・面と面の平行・垂直など', '★2 標準：辺と面の関係・ねじれの位置', '★3 チャレンジ：2つの条件を組み合わせた問題'],
  },
  // ④ 展開図パズル
  {
    id: 'netPuzzle',
    name: '展開図パズル',
    description: '立方体になる展開図はどれ？マスを足したり動かしたりして完成させよう！',
    grades: '小学4年生～中学1年生',
    enabled: true,
    templates: NET_PUZZLE_TEMPLATES,
    levelNotes: ['★1 きほん：立方体になる展開図・あと1マス', '★2 標準：いらない1マス・1マスを動かす', '★3 チャレンジ：同じ種類・ちがう種類の展開図'],
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
    templates: DICE_TEMPLATES,
    levelNotes: ['★1 きほん：1回転がしたときの上の面・向かい合う面', '★2 標準：見えなかった面・2回転', '★3 チャレンジ：同じサイコロ探し・3回転'],
  },
  // ⑦〜⑨
  { id: 'stacking', name: '積み木', description: '積み重ねた立方体の数を数えよう。', grades: '小学4年生～小学6年生', enabled: false },
  { id: 'painting', name: '色ぬり立方体', description: '色がぬられた面の数を数えよう。', grades: '小学5年生～中学2年生', enabled: false },
  { id: 'path', name: '最短経路', description: '立方体の表面を通る一番短い道を探そう。', grades: '中学1年生～中学3年生', enabled: false },
  // ⑩
  {
    id: 'projection',
    name: '積み木の見え方・投影図',
    description: '積み木を前・横・上から見ると、どんな形に見える？立体の形を見抜こう！',
    grades: '小学4年生～中学2年生',
    enabled: true,
    templates: PROJECTION_TEMPLATES,
    levelNotes: ['★1 きほん：矢印の方向・真上から見た形', '★2 標準：正面図と右側面図・列の高さ', '★3 チャレンジ：3方向の図から立体を推理・ありえない図'],
  },
]);

export const getCategory = (id) => CATEGORIES.find((c) => c.id === id) ?? null;

/** 遊べるカテゴリのテンプレート（難易度で絞り込み） */
export function getTemplates(categoryId, difficulty = 'all') {
  const category = getCategory(categoryId);
  if (!category?.enabled) return [];
  return category.templates.filter((t) => difficulty === 'all' || t.difficulty === difficulty);
}

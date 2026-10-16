/**
 * カテゴリと問題テンプレートの登録
 *
 * 新しいカテゴリを追加するときは、テンプレートを作って CATEGORIES の templates に設定し、
 * enabled を true にする。
 */
import { POSITION_TEMPLATES } from './position/positionGenerators.js';
import { DICE_TEMPLATES } from './dice/diceGenerators.js';
import { PROJECTION_TEMPLATES } from './projection/projectionGenerators.js';

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
  {
    id: 'position',
    name: '位置関係',
    description: '立方体の辺と面の「平行・垂直・ねじれ」を見抜こう！',
    grades: '小学6年生～中学1年生',
    enabled: true,
    templates: POSITION_TEMPLATES,
    levelNotes: ['★1 きほん：辺と辺・面と面の平行・垂直など', '★2 標準：辺と面の関係・ねじれの位置', '★3 チャレンジ：2つの条件を組み合わせた問題'],
  },
  { id: 'net', name: '展開図', description: '開いた形と組み立てた形を結びつけよう。', grades: '小学4年生～中学1年生', enabled: false },
  { id: 'cutting', name: '切断', description: '立方体を平面で切ったときの切り口を考えよう。', grades: '中学1年生～中学3年生', enabled: false },
  { id: 'volume', name: '体積・表面積', description: '立体の大きさを計算しよう。', grades: '小学5年生～中学1年生', enabled: false },
  { id: 'stacking', name: '積み木', description: '積み重ねた立方体の数を数えよう。', grades: '小学4年生～小学6年生', enabled: false },
  {
    id: 'dice',
    name: 'サイコロ・回転',
    description: 'サイコロを頭の中でクルッと回そう！目の位置を見抜けるかな？',
    grades: '小学4年生以上',
    enabled: true,
    templates: DICE_TEMPLATES,
    levelNotes: ['★1 きほん：1回転がしたときの上の面・向かい合う面', '★2 標準：見えなかった面・2回転', '★3 チャレンジ：同じサイコロ探し・3回転'],
  },
  { id: 'painting', name: '色ぬり立方体', description: '色がぬられた面の数を数えよう。', grades: '小学5年生～中学2年生', enabled: false },
  { id: 'path', name: '最短経路', description: '立方体の表面を通る一番短い道を探そう。', grades: '中学1年生～中学3年生', enabled: false },
  { id: 'division', name: '立方体の分割', description: '小さな立方体に分けて数えよう。', grades: '小学5年生～中学1年生', enabled: false },
  {
    id: 'projection',
    name: '立方体の見え方',
    description: '上から、横から、回してみると？見る方向による違いを見抜こう！',
    grades: '小学5年生以上',
    enabled: true,
    templates: PROJECTION_TEMPLATES,
    levelNotes: ['★1 きほん：上・横から見える面', '★2 標準：目の並び方・回したあとの図', '★3 チャレンジ：条件に合うサイコロ・ありえない配置'],
  },
]);

export const getCategory = (id) => CATEGORIES.find((c) => c.id === id) ?? null;

/** 遊べるカテゴリのテンプレート（難易度で絞り込み） */
export function getTemplates(categoryId, difficulty = 'all') {
  const category = getCategory(categoryId);
  if (!category?.enabled) return [];
  return category.templates.filter((t) => difficulty === 'all' || t.difficulty === difficulty);
}

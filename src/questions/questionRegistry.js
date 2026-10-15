/**
 * カテゴリと問題テンプレートの登録
 *
 * 新しいカテゴリを追加するときは、テンプレートを作って CATEGORIES の templates に設定し、
 * enabled を true にする。
 */
import { POSITION_TEMPLATES } from './position/positionGenerators.js';

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

export const CATEGORIES = Object.freeze([
  {
    id: 'position',
    name: '位置関係',
    description: '立方体の辺と面の「平行・垂直・ねじれ」を見抜こう！',
    grades: '小学6年生～中学1年生',
    enabled: true,
    templates: POSITION_TEMPLATES,
  },
  { id: 'net', name: '展開図', description: '開いた形と組み立てた形を結びつけよう。', grades: '小学4年生～中学1年生', enabled: false },
  { id: 'dice', name: 'サイコロ', description: '転がしたサイコロの目を読み取ろう。', grades: '小学4年生～小学6年生', enabled: false },
  { id: 'rotation', name: '回転', description: '回した立方体の向きを想像しよう。', grades: '小学5年生～中学1年生', enabled: false },
  { id: 'cutting', name: '切断', description: '立方体を平面で切ったときの切り口を考えよう。', grades: '中学1年生～中学3年生', enabled: false },
  { id: 'volume', name: '体積・表面積', description: '立体の大きさを計算しよう。', grades: '小学5年生～中学1年生', enabled: false },
  { id: 'stacking', name: '積み木', description: '積み重ねた立方体の数を数えよう。', grades: '小学4年生～小学6年生', enabled: false },
  { id: 'projection', name: '投影図', description: '正面・真上から見た形を考えよう。', grades: '中学1年生', enabled: false },
  { id: 'painting', name: '色ぬり立方体', description: '色がぬられた面の数を数えよう。', grades: '小学5年生～中学2年生', enabled: false },
  { id: 'path', name: '最短経路', description: '立方体の表面を通る一番短い道を探そう。', grades: '中学1年生～中学3年生', enabled: false },
]);

export const getCategory = (id) => CATEGORIES.find((c) => c.id === id) ?? null;

/** 遊べるカテゴリのテンプレート（難易度で絞り込み） */
export function getTemplates(categoryId, difficulty = 'all') {
  const category = getCategory(categoryId);
  if (!category?.enabled) return [];
  return category.templates.filter((t) => difficulty === 'all' || t.difficulty === difficulty);
}

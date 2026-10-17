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
import { BLOCK_COUNT_TEMPLATES } from './paintedCube/blockCountGenerators.js';
import { CUTTING_TEMPLATES } from './cubeCutting/cubeCuttingGenerators.js';
import { SURFACE_PATH_TEMPLATES } from './surfacePath/surfacePathGenerators.js';
import { INSCRIBED_TEMPLATES } from './inscribedSolid/inscribedSolidGenerators.js';
import { GEOMETRY_TEMPLATES } from './cubeGeometryChallenge/cubeGeometryGenerators.js';
import { withHints } from './hints.js';
import { PREREQUISITES } from '../core/learningPrerequisites.js';

/** テンプレートに、問題を解くのに必要な知識（core/learningPrerequisites）を付ける（問題が持っていなければこれを使う） */
const withPrerequisites = (templates, map) => templates.map((t) => (map[t.id] ? { ...t, prerequisites: [...map[t.id]] } : t));

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
 * カテゴリ一覧（10）。並び順が画面の番号（①〜⑩）になる。小学生でも取り組みやすい順（数える → 回す → 見る → 展開図 → 切断 → 位置関係 → 体積 → 長さ・角度 → 最短経路）。
 * 内部の id・テンプレート ID は変えない（学習記録・復習・1分チャレンジ・段位認定の保存データは id で管理する）。
 * levelNotes は設定画面に出す難易度の説明。
 */
export const CATEGORIES = Object.freeze([
  // ① 立方体の個数・着色
  {
    id: 'paintedCube',
    name: '立方体の個数・着色',
    description: '積み木は全部で何個？色がついた小立方体はいくつ？立方体の数を見抜こう！',
    grades: '小学5年生～中学2年生',
    enabled: true,
    templates: [...PAINTED_CUBE_TEMPLATES, ...BLOCK_COUNT_TEMPLATES],
    levelNotes: [
      '基本：3面・2面に色がつく小立方体・積み木は全部で何個',
      '標準：1面だけ・色がつかない・一部の面だけ塗る・見えない積み木・段ごとの個数',
      '応用：条件の組み合わせ・取り除く・分けた数の逆算・完成形まであと何個',
    ],
  },
  // ② サイコロ・回転
  {
    id: 'dice',
    name: 'サイコロ・回転',
    description: 'サイコロを頭の中でクルッと回そう！目の位置を見抜けるかな？',
    grades: '小学4年生以上',
    enabled: true,
    templates: withHints(DICE_TEMPLATES),
    levelNotes: ['基本：1回転がしたときの上の面・向かい合う面', '標準：見えなかった面・2回転', '応用：同じサイコロ探し・3回転'],
  },
  // ③ 積み木の見え方・投影図
  {
    id: 'projection',
    name: '積み木の見え方・投影図',
    description: '積み木を前・横・上から見ると、どんな形に見える？立体の形を見抜こう！',
    grades: '小学4年生～中学2年生',
    enabled: true,
    templates: withHints(PROJECTION_TEMPLATES),
    levelNotes: ['基本：矢印の方向・真上から見た形', '標準：正面図と右側面図・列の高さ', '応用：3方向の図から立体を推理・ありえない図'],
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
  // ⑤ 展開図と頂点・辺
  {
    id: 'netMapping',
    name: '展開図と頂点・辺',
    description: '展開図を折りたたむと、どの点や辺が重なる？立方体のつながりを見抜こう！',
    grades: '小学5年生～中学1年生',
    enabled: true,
    templates: withHints(NET_MAPPING_TEMPLATES),
    levelNotes: ['基本：重なる点・向かい合う面', '標準：重なる辺・となり合う面', '応用：完成した立方体・点と辺の組み合わせ'],
  },
  // ⑥ 立方体の切断
  {
    id: 'cubeCutting',
    name: '立方体の切断',
    description: '立方体をスパッと切ると、どんな形になる？切り口を予想しよう！',
    grades: '中学1年生～中学3年生',
    enabled: true,
    templates: CUTTING_TEMPLATES,
    levelNotes: ['基本：切り口は何角形・切り口が通る辺', '標準：切り口の形の図・中点を通る切り口の形', '応用：切り口の面積・切り分けた立体の体積'],
  },
  // ⑦ 位置関係
  {
    id: 'position',
    name: '位置関係',
    description: '立方体の辺と面の「平行・垂直・ねじれ」を見抜こう！',
    grades: '小学6年生～中学1年生',
    enabled: true,
    templates: withPrerequisites(withHints(POSITION_TEMPLATES), { P08: [PREREQUISITES.SKEW_LINES], P10: [PREREQUISITES.SKEW_LINES], P13: [PREREQUISITES.SKEW_LINES] }),
    levelNotes: ['基本：辺と辺・面と面の平行・垂直など', '標準：辺と面の関係・ねじれの位置', '応用：2つの条件を組み合わせた問題'],
  },
  // ⑧ 立方体に内接する立体と体積
  {
    id: 'inscribedSolid',
    name: '立方体に内接する立体と体積',
    description: '立方体の中に隠れた立体を見つけよう！四面体や八面体の形と体積を考えよう！',
    grades: '小学5年生～中学3年生',
    enabled: true,
    templates: INSCRIBED_TEMPLATES,
    levelNotes: ['基本：点を結んでできる立体の名前・面の中心を結んだ立体', '標準：角すいの体積・正八面体と立方体の体積比', '応用：4つの頂点の四面体の体積・取り除いた残りの体積'],
  },
  // ⑨ 立方体に隠れた図形・長さ・角度
  {
    id: 'cubeGeometryChallenge',
    name: '立方体に隠れた図形・長さ・角度',
    description: '立方体の中の三角形や対角線を見つけよう！長さや角度のなぞに挑戦！',
    grades: '小学5年生～中学3年生',
    enabled: true,
    templates: GEOMETRY_TEMPLATES,
    levelNotes: ['基本：面の対角線・立方体の対角線を探す', '標準：対角線の長さ・3つの点を結んだ三角形の形', '応用：立方体の中の角度・三角形の面積'],
  },
  // ⑩ 立方体の表面の最短経路
  {
    id: 'surfacePath',
    name: '立方体の表面の最短経路',
    description: '立方体の表面を進むとき、いちばん短い道はどれ？展開図で考えよう！',
    grades: '中学1年生～中学3年生',
    enabled: true,
    templates: SURFACE_PATH_TEMPLATES,
    levelNotes: ['基本：最短経路が通る辺・2つの道の長さくらべ', '標準：2面を通る最短距離・展開図の上の最短経路', '応用：3面以上を通る最短距離・最短経路をすべて選ぶ'],
  },
]);

export const getCategory = (id) => CATEGORIES.find((c) => c.id === id) ?? null;

const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];
/** 画面に出すカテゴリの番号（①〜⑩。並び順から決める） */
export const categoryNumber = (id) => CIRCLED[CATEGORIES.findIndex((c) => c.id === id)] ?? '';

/** 遊べるカテゴリのテンプレート（難易度で絞り込み） */
export function getTemplates(categoryId, difficulty = 'all') {
  const category = getCategory(categoryId);
  if (!category?.enabled) return [];
  return category.templates.filter((t) => difficulty === 'all' || t.difficulty === difficulty);
}

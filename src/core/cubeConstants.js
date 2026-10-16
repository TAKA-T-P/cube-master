/**
 * 立方体の数学的定義（すべての Phase で共有する唯一のデータソース）
 *
 * 座標系：Three.js の右手系
 *   X軸 = 左右, Y軸 = 上下, Z軸 = 奥行き（+Z が手前）
 * 立方体の中心は原点、一辺の長さは 2（各座標は -1 または +1）。
 *
 * 頂点 A〜H・辺・面の ID は後続 Phase でも変更しないこと。
 * 表示用の 3D オブジェクトはこのデータから生成し、正解判定もこのデータを使う。
 */

/** 立方体の一辺の長さ */
export const CUBE_SIZE = 2;

/** 立方体の半分の長さ（中心から面までの距離） */
export const HALF_SIZE = CUBE_SIZE / 2;

/** 要素の種類 */
export const ELEMENT_TYPES = Object.freeze({
  VERTEX: 'vertex',
  EDGE: 'edge',
  FACE: 'face',
});

/** 画面表示用の要素種別名 */
export const ELEMENT_TYPE_LABELS = Object.freeze({
  vertex: '頂点',
  edge: '辺',
  face: '面',
});

const freezeVec = (x, y, z) => Object.freeze([x, y, z]);

/**
 * 頂点（上面 ABCD・底面 EFGH。A の真下が E、B の真下が F …）
 * 配列の並び順が ID の標準順序になる。
 */
export const VERTICES = Object.freeze([
  Object.freeze({ id: 'A', position: freezeVec(-1, +1, +1) }),
  Object.freeze({ id: 'B', position: freezeVec(+1, +1, +1) }),
  Object.freeze({ id: 'C', position: freezeVec(+1, +1, -1) }),
  Object.freeze({ id: 'D', position: freezeVec(-1, +1, -1) }),
  Object.freeze({ id: 'E', position: freezeVec(-1, -1, +1) }),
  Object.freeze({ id: 'F', position: freezeVec(+1, -1, +1) }),
  Object.freeze({ id: 'G', position: freezeVec(+1, -1, -1) }),
  Object.freeze({ id: 'H', position: freezeVec(-1, -1, -1) }),
]);

/**
 * 辺（12本）。ID は両端の頂点 ID を連結したもの。
 * 逆順指定（例："BA"）は cubeGeometry.resolveElement で正規化される。
 */
export const EDGES = Object.freeze(
  [
    // 上面
    ['A', 'B'],
    ['B', 'C'],
    ['C', 'D'],
    ['D', 'A'],
    // 底面
    ['E', 'F'],
    ['F', 'G'],
    ['G', 'H'],
    ['H', 'E'],
    // 縦方向
    ['A', 'E'],
    ['B', 'F'],
    ['C', 'G'],
    ['D', 'H'],
  ].map(([a, b]) => Object.freeze({ id: a + b, vertices: Object.freeze([a, b]) })),
);

/**
 * 面（6面）。構成頂点は面の周に沿った順序で保持する。
 * normal は立方体の外向き単位法線。
 */
export const FACES = Object.freeze([
  Object.freeze({ id: 'ABCD', vertices: Object.freeze(['A', 'B', 'C', 'D']), normal: freezeVec(0, +1, 0) }),
  Object.freeze({ id: 'EFGH', vertices: Object.freeze(['E', 'F', 'G', 'H']), normal: freezeVec(0, -1, 0) }),
  Object.freeze({ id: 'ABFE', vertices: Object.freeze(['A', 'B', 'F', 'E']), normal: freezeVec(0, 0, +1) }),
  Object.freeze({ id: 'BCGF', vertices: Object.freeze(['B', 'C', 'G', 'F']), normal: freezeVec(+1, 0, 0) }),
  Object.freeze({ id: 'CDHG', vertices: Object.freeze(['C', 'D', 'H', 'G']), normal: freezeVec(0, 0, -1) }),
  Object.freeze({ id: 'DAEH', vertices: Object.freeze(['D', 'A', 'E', 'H']), normal: freezeVec(-1, 0, 0) }),
]);

/** 初期のカメラの向き（前面・右側面・上面が見える。2D の見取図も同じ向きで描く） */
export const DEFAULT_VIEW_DIRECTION = Object.freeze([4, 3, 5]);

/** 表示色（3D 描画用） */
export const CUBE_COLORS = Object.freeze({
  background: 0xf3f7fb,
  face: 0x9fd3f5,
  edge: 0x1f4e9c,
  vertex: 0x163a75,
  selected: 0xff8c1a, // ユーザーの選択（3D プレビュー）
  correct: 0x22b14c, // 正解・解説
  reference: 0xf06a00, // 問題の基準要素
  wrong: 0xe53935, // 誤って選んだ要素
});

/**
 * 積み木の見え方・投影図の解説文
 */
import { VIEW_FROM, PROJECTION_NAMES } from '../../core/blockProjection.js';

const list = (heights) => heights.join('・');

/** 正面・横から見た形（列ごとの高さ） */
export const explainSideView = (direction, heights) =>
  `${VIEW_FROM[direction]}見ると、手前と奥のブロックは重なって見えるので、それぞれの列のいちばん高いところまでが見えます。` +
  `${VIEW_FROM[direction]}見たときの左から、${list(heights)}段の高さになります。`;

/** 真上から見た形 */
export const explainTopView = () =>
  '真上から見ると、高さに関係なく、ブロックが1個でもあるマスがすべて見えます。' +
  '図は手前が下になるように見たものです。ブロックのないマスは空いて見えます。';

/** 正面図と右側面図の組み合わせ */
export const explainPair = (front, right) =>
  `正面から見ると左から${list(front)}段、右から見ると左（手前）から${list(right)}段に見えます。` +
  '両方の図が正しいものを選びます。片方だけ合っている図にも注意しましょう。';

/** ある列の高さ */
export const explainColumnHeight = (direction, k, n) =>
  `${VIEW_FROM[direction]}見ると、左から${k}列目には、手前から奥までのブロックが重なって見えます。` +
  `その列でいちばん高いところは${n}段なので、高さは${n}マスです。`;

/** 3方向の図から立体を推理 */
export const explainThreeViews = () =>
  '正面図で左右の高さ、右側面図で前後の高さ、上面図でブロックのあるマスがわかります。' +
  '3つの図すべてに合う積み木は1つだけです。ほかの積み木は、どれかの図が合いません。';

/** ありえない図 */
export const explainImpossibleView = (direction, reason) =>
  `${PROJECTION_NAMES[direction]}（${VIEW_FROM[direction]}見た図）が、この積み木とは合いません。${reason}` +
  'ほかの3つの図は、この積み木をその方向から見た形と一致します。';

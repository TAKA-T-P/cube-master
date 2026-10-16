/**
 * 展開図と頂点・辺の解説文（小学5年生にもわかる言葉で）
 */
const join = (list) => list.join('・');

export const explainCoincidentPoints = (target, others) =>
  `点${target}と点${join(others)}は、組み立てると同じ頂点（角）に集まります。` +
  '展開図ではなれている点でも、折ると1つの角に重なることがあります。';

export function explainOppositeFace(target, answer, inLine) {
  const hint = inLine ? `展開図で面${target}と面${answer}は、1つのマスをはさんで一直線に並んでいます。このように並ぶ面は向かい合います。` : '';
  return `${hint}組み立てると、面${target}と面${answer}は向かい合う面になります。向かい合う面どうしは、辺を共有しません。`;
}

export const explainCoincidentSegments = (target, answer) =>
  `辺${target}と辺${answer}は、組み立てると同じ位置に重なって、立方体の1本の辺になります。`;

export function explainCubeNeighbors(target, netNeighbors, foldNeighbors, opposite) {
  const parts = [];
  if (netNeighbors.length) parts.push(`展開図でとなりにある面${join(netNeighbors)}`);
  if (foldNeighbors.length) parts.push(`組み立てると初めてとなり合う面${join(foldNeighbors)}`);
  return `面${target}と辺を共有するのは、${parts.join('と、')}の4つです。向かい合う面${opposite}だけは辺を共有しません。`;
}

export const explainCompletedCube = () =>
  '展開図を折りたたんで、それぞれのマークがどの面にくるかを確かめます。' +
  '向かい合う面のマークは、同時に見えることはありません。正しい図以外は、マークの並び方が組み立てた立方体と合いません。';

export const explainEdgesAtPoint = (target, answers) =>
  `点${target}は組み立てると立方体の1つの頂点（角）になり、その頂点には3本の辺が集まります。` +
  `選択肢の中でその頂点を端にもつのは、辺${join(answers)}です。`;

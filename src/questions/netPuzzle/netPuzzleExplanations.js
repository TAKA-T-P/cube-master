/**
 * 展開図パズルの解説文（小学4年生にもわかる言葉で）
 * 〔choice:ID〕は、画面に出すときに選択肢の記号（ア・イ…）に置きかわる。
 */
import { choiceRef } from '../netCommon.js';

const refs = (ids) => ids.map(choiceRef).join('・');

export const explainWhichAreNets = (valid, invalid) =>
  `立方体の展開図になるのは${refs(valid)}です。` +
  (invalid.length
    ? `${refs(invalid)}は、折りたたむと2つの面が同じ場所に重なってしまう（赤くぬったマス）ので、立方体になりません。`
    : '') +
  '立方体の展開図は、向きや裏返しのちがいを同じとみなすと11種類あります。';

export const explainAddCell = (answers) =>
  `${answers.join('・')}にマスを加えると、6つの面がすべて別々の場所にきて、立方体になります。` +
  'ほかの場所に加えると、折りたたんだときに面が重なったり、すき間ができたりします。';

export const explainRemoveCell = (answers) =>
  `${answers.join('・')}のマスを取ると、立方体の展開図になります。` +
  '7つのマスのうち2つは、組み立てると同じ面の場所に重なるので、そのどちらかを取ります（取ってもマスがはなれないものだけ）。';

export const explainMoveCell = (answers) =>
  `オレンジのマスを${answers.join('・')}へ動かすと、立方体の展開図になります。` +
  'いまの場所のままでは、折りたたんだときにほかの面と重なってしまいます。';

export const explainSameNet = () =>
  `${choiceRef('same')}は、もとの展開図を回したり裏返したりすると、ぴったり重なります。` +
  'ほかの展開図は、マスのつながり方がちがいます。';

export const explainOddNet = () =>
  `${choiceRef('odd')}だけ、ほかの4つとマスのつながり方がちがいます。` +
  'ほかの4つは、同じ展開図を回したり裏返したりしたものです。';

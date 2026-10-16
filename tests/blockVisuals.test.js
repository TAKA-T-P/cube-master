// @vitest-environment jsdom
// 積み木の見取図・投影図の SVG が、配置データと投影図の計算どおりに描かれるか
import { describe, it, expect } from 'vitest';
import { renderBlocksSvg, renderProjectionSvg, renderBlockVisual } from '../src/ui/blockVisuals.js';
import { renderVisual } from '../src/ui/visualChoices.js';
import { heightsToCubes, cubeKey } from '../src/core/blockGeometry.js';
import { getProjection } from '../src/core/blockProjection.js';

const cubes = heightsToCubes([
  [2, 1, 0],
  [1, 3, 2],
]);

describe('積み木の見取図', () => {
  it('配置データの小立方体をすべて描き、床のマス目と矢印をつける', () => {
    const el = renderBlocksSvg({ cubes, arrows: ['front', 'right'] });
    const drawn = [...el.querySelectorAll('[data-cube]')].map((g) => g.dataset.cube).sort();
    expect(drawn).toEqual(cubes.map(cubeKey).sort());
    expect([...el.querySelectorAll('.block-arrow')].map((a) => a.dataset.arrow)).toEqual(['front', 'right']);
    // 床のマス目は 横3 × 奥行き2
    expect(el.querySelectorAll(':scope > polygon')).toHaveLength(6);
  });

  it('矢印なしでも描ける', () => {
    expect(renderBlocksSvg({ cubes }).querySelectorAll('.block-arrow')).toHaveLength(0);
  });
});

describe('投影図', () => {
  it('ぬるマスが投影図の計算と一致する（左右・上下の向きもそのまま）', () => {
    for (const d of ['front', 'right', 'top']) {
      const p = getProjection(cubes, d);
      const el = renderProjectionSvg({ projection: p });
      const rects = [...el.querySelectorAll('rect')];
      expect(rects).toHaveLength(p.width * p.height);
      expect(rects.map((r) => Number(r.dataset.filled))).toEqual(p.cells.flat());
    }
  });

  it('上面図には手前を示す「前」を添え、見出しは指定したときだけ表示する', () => {
    expect(renderProjectionSvg({ projection: getProjection(cubes, 'top') }).textContent).toBe('前');
    const noCaption = renderBlockVisual({ type: 'projection', projection: getProjection(cubes, 'front') });
    expect(noCaption.querySelector('figcaption')).toBeNull();
    const pair = renderVisual({
      type: 'projectionPair',
      items: [
        { projection: getProjection(cubes, 'front'), caption: '正面図' },
        { projection: getProjection(cubes, 'right'), caption: '右側面図' },
      ],
    });
    expect([...pair.querySelectorAll('figcaption')].map((f) => f.textContent)).toEqual(['正面図', '右側面図']);
  });
});

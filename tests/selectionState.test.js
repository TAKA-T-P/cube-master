import { describe, it, expect, vi } from 'vitest';
import { SelectionState } from '../src/core/selectionState.js';
import { CubeElementError } from '../src/core/cubeGeometry.js';

describe('SelectionState', () => {
  it('正しいIDを指定して選択できる（表記ゆれは正規化される）', () => {
    const s = new SelectionState();
    expect(s.select('ba')).toBe('AB');
    expect(s.isSelected('AB')).toBe(true);
    expect(s.isSelected('BA')).toBe(true);
    expect(s.getSelected()).toEqual(['AB']);
  });

  it('単一選択では新しい選択で前の選択が解除される', () => {
    const s = new SelectionState();
    s.select('A');
    s.select('BCGF');
    expect(s.getSelected()).toEqual(['BCGF']);
  });

  it('複数選択できる（頂点・辺・面の混在も可、選択順に依存しない）', () => {
    const s1 = new SelectionState({ multiple: true });
    const s2 = new SelectionState({ multiple: true });
    ['G', 'AB', 'A', 'EFGH'].forEach((id) => s1.select(id));
    ['EFGH', 'A', 'AB', 'G'].forEach((id) => s2.select(id));
    expect(s1.getSelected()).toEqual(['A', 'G', 'AB', 'EFGH']);
    expect(s1.getSelected()).toEqual(s2.getSelected());
    expect(s1.getSelectedByType()).toEqual({ vertex: ['A', 'G'], edge: ['AB'], face: ['EFGH'] });
  });

  it('選択解除できる（deselect / toggle / clear）', () => {
    const s = new SelectionState({ multiple: true });
    s.select('A');
    s.select('B');
    s.select('AB');
    s.deselect('A');
    expect(s.getSelected()).toEqual(['B', 'AB']);
    expect(s.toggle('B')).toBe(false);
    expect(s.toggle('C')).toBe(true);
    expect(s.getSelected()).toEqual(['C', 'AB']);
    s.clear('vertex');
    expect(s.getSelected()).toEqual(['AB']);
    s.clear();
    expect(s.getSelected()).toEqual([]);
  });

  it('単一選択に戻すと最後に選んだ1つだけ残る', () => {
    const s = new SelectionState({ multiple: true });
    s.select('A');
    s.select('C');
    s.setMultiple(false);
    expect(s.getSelected()).toEqual(['C']);
  });

  it('変更を通知する（変化がなければ通知しない）', () => {
    const s = new SelectionState();
    const listener = vi.fn();
    s.onChange(listener);
    s.select('A');
    s.select('A');
    s.select('B');
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenLastCalledWith({ selected: ['B'], added: ['B'], removed: ['A'] });
  });

  it('無効なIDはエラーになり、状態は変わらない', () => {
    const s = new SelectionState({ multiple: true });
    const listener = vi.fn();
    s.select('A');
    s.onChange(listener);
    expect(() => s.select('AC')).toThrow(CubeElementError);
    expect(() => s.toggle('X')).toThrow(CubeElementError);
    expect(() => s.deselect('')).toThrow(CubeElementError);
    expect(s.isSelected('XYZ')).toBe(false);
    expect(s.getSelected()).toEqual(['A']);
    expect(listener).not.toHaveBeenCalled();
  });
});

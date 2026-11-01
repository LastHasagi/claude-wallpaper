import { describe, expect, it } from 'vitest';
import { ashWednesday, seasonOn, seasonOverride } from '../../src/shared/season';

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day, 12);

describe('ashWednesday', () => {
  it('matches known years', () => {
    expect(ashWednesday(2026)).toEqual([2, 18]);
    expect(ashWednesday(2027)).toEqual([2, 10]);
    expect(ashWednesday(2028)).toEqual([3, 1]);
  });
});

describe('seasonOn', () => {
  it('Halloween: 15/out a 15/nov', () => {
    expect(seasonOn(d(2026, 10, 14))).toBeNull();
    expect(seasonOn(d(2026, 10, 15))).toBe('halloween');
    expect(seasonOn(d(2026, 11, 15))).toBe('halloween');
  });

  it('Natal: 16/nov a 15/jan, atravessando o ano', () => {
    expect(seasonOn(d(2026, 11, 16))).toBe('natal');
    expect(seasonOn(d(2026, 12, 31))).toBe('natal');
    expect(seasonOn(d(2027, 1, 1))).toBe('natal');
    expect(seasonOn(d(2027, 1, 15))).toBe('natal');
  });

  it('Carnaval: 16/jan até a Quarta-feira de Cinzas', () => {
    expect(seasonOn(d(2027, 1, 16))).toBe('carnaval');
    expect(seasonOn(d(2027, 2, 10))).toBe('carnaval');
    expect(seasonOn(d(2027, 2, 11))).toBeNull();
    expect(seasonOn(d(2028, 3, 1))).toBe('carnaval');
    expect(seasonOn(d(2028, 3, 2))).toBeNull();
  });

  it('resto do ano: cenário normal', () => {
    expect(seasonOn(d(2027, 6, 1))).toBeNull();
    expect(seasonOn(d(2027, 10, 1))).toBeNull();
  });
});

describe('seasonOverride', () => {
  it('forces a season, forces none, or follows the date', () => {
    expect(seasonOverride('natal')).toBe('natal');
    expect(seasonOverride('none')).toBeNull();
    expect(seasonOverride(null)).toBeUndefined();
    expect(seasonOverride('pascoa')).toBeUndefined();
  });
});

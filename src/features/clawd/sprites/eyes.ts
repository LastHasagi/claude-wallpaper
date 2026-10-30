import { parseSprite, type Sprite } from '../../../shared/render/sprite';
import { PALETTE } from './palette';

export type EyeState = 'open' | 'blink' | 'happy' | 'closed' | 'wide' | 'angry' | 'dizzy';

/** 18×6 blocks; left eye around columns 0–3, right eye around columns 14–17. */
const ROWS: Record<EyeState, string[]> = {
  open: [
    '..................',
    '.KW............KW.',
    '.KK............KK.',
    '.KK............KK.',
    '.KK............KK.',
    '..................',
  ],
  blink: [
    '..................',
    '..................',
    '..................',
    'KKKK..........KKKK',
    '..................',
    '..................',
  ],
  happy: [
    '..................',
    '..................',
    '.KK............KK.',
    'K..K..........K..K',
    '..................',
    'PPP............PPP',
  ],
  closed: [
    '..................',
    '..................',
    'K..K..........K..K',
    '.KK............KK.',
    '..................',
    '..................',
  ],
  wide: [
    'WWWW..........WWWW',
    'WKKW..........WKKW',
    'WKKW..........WKKW',
    'WWWW..........WWWW',
    '..................',
    '..................',
  ],
  angry: [
    'KK..............KK',
    '..KK..........KK..',
    '.KK............KK.',
    '.KK............KK.',
    '..................',
    '..................',
  ],
  dizzy: [
    '..................',
    'K..K..........K..K',
    '.KK............KK.',
    'K..K..........K..K',
    '..................',
    '..................',
  ],
};

export const EYES: Record<EyeState, Sprite> = Object.fromEntries(
  Object.entries(ROWS).map(([k, rows]) => [k, parseSprite(rows, PALETTE)]),
) as Record<EyeState, Sprite>;

export const EYES_W = 18;
export const EYES_H = 6;

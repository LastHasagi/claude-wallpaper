import { parseSprite, type Sprite } from '../../../shared/render/sprite';
import { PALETTE } from './palette';

/** Clawd has no mouth until he needs one: wide open (inhaling), open (chewing), "o" (spitting). */
export type MouthState = 'wide' | 'open' | 'o';

const ROWS: Record<MouthState, string[]> = {
  wide: ['.KKKK.', 'KKKKKK', 'KKKKKK', 'KPPPPK', '.KKKK.'],
  open: ['KKKK', 'KPPK', '.KK.'],
  o: ['KK', 'KK'],
};

export const MOUTHS: Record<MouthState, Sprite> = Object.fromEntries(
  Object.entries(ROWS).map(([k, rows]) => [k, parseSprite(rows, PALETTE)]),
) as Record<MouthState, Sprite>;

/** Mouth top, in rows below the top of the eyes block. */
export const MOUTH_DY = 6;

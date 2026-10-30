import { parseSprite, type Sprite } from '../../../shared/render/sprite';
import { PALETTE } from './palette';

export type HeldItem = 'binoculars' | 'book' | 'laptop' | 'notepad';

export interface HeldItemDef {
  frames: Sprite[];
  /** Which pose anchor it attaches to. */
  anchor: 'eyes' | 'hand';
  /** Offset of the item's top-left from the anchor, in sprite pixels (facing right). */
  ox: number;
  oy: number;
  /** Hides the eyes layer while held (e.g. binoculars cover them). */
  coversEyes: boolean;
}

const s = (rows: string[]) => parseSprite(rows, PALETTE);

export const HELD_ITEMS: Record<HeldItem, HeldItemDef> = {
  binoculars: {
    anchor: 'eyes',
    ox: 1,
    oy: -1,
    coversEyes: true,
    frames: [
      s([
        'DDDDDD........DDDDDD',
        'DBBBBD........DBBBBD',
        'DGBBBDDDDDDDDDDGBBBD',
        'DBBBBDDDDDDDDDDBBBBD',
        'DBBBBD........DBBBBD',
        'DDDDDD........DDDDDD',
      ]),
    ],
  },
  book: {
    anchor: 'hand',
    ox: -8,
    oy: -1,
    coversEyes: false,
    frames: [
      s([
        'NQQQQQQNNQQQQQQN',
        'NQTTTTQNNQTTTTQN',
        'NQQQQQQNNQQQQQQN',
        'NQTTTQQNNQTTTQQN',
        'NQQQQQQNNQQQQQQN',
        'NQTTTTQNNQTTQQQN',
        'NNNNNNNNNNNNNNNN',
      ]),
      s([
        'NQQQQQQNQ.......',
        'NQTTTTQNQQ......',
        'NQQQQQQNQQQ.....',
        'NQTTTQQNQQQQ....',
        'NQQQQQQNQQQQQQQN',
        'NQTTTTQNNQTTQQQN',
        'NNNNNNNNNNNNNNNN',
      ]),
    ],
  },
  laptop: {
    anchor: 'hand',
    ox: -9,
    oy: -2,
    coversEyes: false,
    frames: [
      s([
        '..MMMMMMMMMMMMMM..',
        '..MMMMMMMMMMMMMM..',
        '..MMMMMMOOMMMMMM..',
        '..MMMMMMOOMMMMMM..',
        '..MMMMMMMMMMMMMM..',
        '..MMMMMMMMMMMMMM..',
        'VVVVVVVVVVVVVVVVVV',
        'VVVVVVVVVVVVVVVVVV',
      ]),
    ],
  },
  notepad: {
    anchor: 'hand',
    ox: -5,
    oy: -3,
    coversEyes: false,
    frames: [
      s([
        'R.R.R.R.R.',
        'YYYYYYYYYY',
        'YTTTTTTTYY',
        'YYYYYYYYYY',
        'YTTTTTYYYY',
        'YYYYYYYYYY',
        'YTTTTTTYYY',
        'YYYYYYYYYY',
      ]),
    ],
  },
};

import { parseSprite, type Sprite } from '../../../shared/render/sprite';
import type { FaceItem, HeadItem } from '../../settings/index';
import { PALETTE } from './palette';

export interface WearDef {
  sprite: Sprite;
  /** Top-left offset from the pose's eyes anchor, in sprite pixels (facing right). */
  ox: number;
  oy: number;
}

const s = (rows: string[]) => parseSprite(rows, PALETTE);

/**
 * The body's top row is 3 rows above the eyes anchor and its centre 9 columns right of it, so a hat
 * `w` × `h` resting on the head sits at ox = 9 − w/2, oy = −3 − (h − 1).
 */
const onHead = (rows: string[], dx = 0): WearDef => {
  const sprite = s(rows);
  return { sprite, ox: 9 - Math.floor(sprite.w / 2) + dx, oy: -3 - (sprite.h - 1) };
};

export const HEAD_WEAR: Record<HeadItem, WearDef> = {
  witch: onHead([
    '.........XX.....',
    '........XXX.....',
    '.......XXXX.....',
    '......XXXXX.....',
    '.....XXXXXXX....',
    '.....XXXXXXX....',
    '....XZZZZZZZX...',
    'XXXXXXXXXXXXXXXX',
  ]),
  santa: onHead([
    '................ww..',
    '.............rrrww..',
    '..........rrrrrr....',
    '.......rrrrrrrrr....',
    '.....rrrrrrrrrrr....',
    '...rrrrrrrrrrrrrr...',
    'wwwwwwwwwwwwwwwwwwww',
    'wwwwwwwwwwwwwwwwwwww',
  ]),
  crown: onHead([
    'g.....gg.....g',
    'gg...gggg...gg',
    'gggggggggggggg',
    'ggjggggjggggjg',
    'gggggggggggggg',
  ]),
  cap: onHead(
    [
      '......cccccccc..........',
      '....cccccccccccc........',
      '...cccccccccccccc.......',
      '..ccccccccccccccccc.....',
      '..cccccccccccccccccccccc',
    ],
    2,
  ),
  bow: { ...onHead(['bb......bb', 'bbbb..bbbb', 'bbbbbbbbbb', 'bbbb..bbbb', 'bb......bb'], 7), oy: -6 },
};

/** Face pieces cover the 18×6 eyes block (eyes at columns 1–2 and 15–16, rows 1–4). */
export const FACE_WEAR: Record<FaceItem, WearDef> = {
  shades: {
    ox: -1,
    oy: 1,
    sprite: s([
      'KKKKKKKKKKKKKKKKKKKK',
      '.KKKKW........KKKKW.',
      '.KKKKK........KKKKK.',
      '..KKK..........KKK..',
    ]),
  },
  mask: {
    ox: -3,
    oy: 0,
    sprite: s([
      'gm....................mg',
      '.mmmmmmmmmmmmmmmmmmmmmm.',
      '.mmm..mmmmmgmmmmmm..mmm.',
      '..mmm..mmmmmmmmmm..mmm..',
      '...mmmmmm......mmmmmm...',
    ]),
  },
  mustache: {
    ox: 2,
    oy: 6,
    sprite: s(['..nnnn..nnnn..', '.nnnnnnnnnnnn.', 'nnn........nnn']),
  },
};

import { PixelGrid } from '../../../shared/render/pixel-grid';
import type { Sprite } from '../../../shared/render/sprite';
import { PALETTE } from '../../clawd/index';
import type { SnackKind } from '../model/belly-model';

/** Desktop icons as they fly into (and out of) Clawd's mouth. */
const file = new PixelGrid(9, 11)
  .shape(['#####..', '######.', '#######', '#######', '#######', '#######', '#######', '#######', '#######'], 1, 1, 'Q')
  .set(6, 1, 'T')
  .rect(2, 4, 4, 1, 'T')
  .rect(2, 6, 5, 1, 'T')
  .rect(2, 8, 3, 1, 'T')
  .outline()
  .sprite(PALETTE);

const folder = new PixelGrid(12, 10)
  .shape(['####......', '##########', '##########', '##########', '##########', '##########', '##########'], 1, 1, 'Y')
  .rect(1, 3, 10, 1, 'T')
  .outline()
  .sprite(PALETTE);

export const SNACKS: Readonly<Record<SnackKind, Sprite>> = { file, folder };

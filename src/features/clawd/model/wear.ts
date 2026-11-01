import type { Season } from '../../../shared/season';
import type { FaceItem, HeadItem } from '../../settings/index';

/** What Clawd has on right now. */
export interface Wear {
  head: HeadItem | null;
  face: FaceItem | null;
}

const NOTHING: Wear = { head: null, face: null };

/** What 'auto' means in each season. */
const SEASONAL: Record<Season, Wear> = {
  halloween: { head: 'witch', face: null },
  natal: { head: 'santa', face: null },
  carnaval: { head: null, face: 'mask' },
};

/** 'auto' follows the season, 'none' wears nothing, anything else is the user's pick (all year). */
export function resolveWear(head: 'auto' | 'none' | HeadItem, face: 'auto' | 'none' | FaceItem, season: Season | null): Wear {
  const auto = season ? SEASONAL[season] : NOTHING;
  return {
    head: head === 'auto' ? auto.head : head === 'none' ? null : head,
    face: face === 'auto' ? auto.face : face === 'none' ? null : face,
  };
}

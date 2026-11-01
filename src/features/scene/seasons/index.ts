import type { Season } from '../../../shared/season';
import { carnaval } from './carnaval';
import type { SeasonDecor } from './decor';
import { halloween } from './halloween';
import { natal } from './natal';

export const DECOR: Record<Season, SeasonDecor> = { halloween, natal, carnaval };
export type { SeasonDecor } from './decor';

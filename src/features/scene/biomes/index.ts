import { mountains } from './mountains';
import { park } from './park';
import { room } from './room';
import type { BiomeDef, BiomeId } from './types';

export const BIOMES: Record<BiomeId, BiomeDef> = { mountains, park, room };
export type { BiomeDef, BiomeId } from './types';
export type { BiomeCtx } from './layers';

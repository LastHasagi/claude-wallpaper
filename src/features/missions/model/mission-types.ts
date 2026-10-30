import type { Lang, Localized } from '../../../shared/i18n';
import type { ColorRole } from '../../../shared/render/roles';
import type { Rng } from '../../../shared/rng';
import type { ClawdApi } from '../../clawd/index';
import type { BiomeId, SceneApi } from '../../scene/index';

export type MissionId = 'birdwatching' | 'reading-bench' | 'coding';
export type Frequency = 'often' | 'normal' | 'rare';

export interface TerminalApi {
  /** Types a line into the little terminal bubble; resolves once fully typed. */
  type(text: string, role?: ColorRole): Promise<void>;
  clear(): void;
}

export interface MissionContext {
  clawd: ClawdApi;
  scene: SceneApi;
  terminal: TerminalApi;
  rng: Rng;
  lang: Lang;
  signal: AbortSignal;
  /** Waits simulated seconds (respects time scale; rejects on abort). */
  wait(seconds: number): Promise<void>;
  /** CSS px above the ground of the bottom edge of row `artRow` of a shown prop. */
  surface(propId: string, artRow: number): number;
}

export interface MissionDef {
  id: MissionId;
  /** Shown in the scene label: "[ missão 08: … ]". */
  number: number;
  title: Localized;
  biome: BiomeId;
  prefers: 'day' | 'night' | 'any';
  noteTopic: string;
  run(ctx: MissionContext): Promise<void>;
}

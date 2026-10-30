import type { MissionDef } from '../model/mission-types';
import { birdwatching } from './birdwatching';
import { coding } from './coding';
import { readingBench } from './reading-bench';

export const MISSIONS: readonly MissionDef[] = [birdwatching, coding, readingBench];

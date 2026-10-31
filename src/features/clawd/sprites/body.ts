import type { Point } from '../../../shared/geometry';
import { parseSprite, type Sprite } from '../../../shared/render/sprite';
import { PALETTE, PixelCanvas } from './palette';

/** Every pose frame shares this canvas; feet touch the bottom edge at the horizontal centre. */
export const BODY_W = 36;
export const BODY_H = 22;
export const FEET: Point = { x: BODY_W / 2, y: BODY_H };

export type PoseName =
  | 'idle' | 'walk' | 'run' | 'sit' | 'sleep' | 'jump' | 'laugh' | 'dizzy'
  | 'startle' | 'wave' | 'angry' | 'hold' | 'read' | 'type' | 'carry'
  | 'inhale' | 'chew' | 'gulp' | 'spit';

export interface PoseFrame {
  sprite: Sprite;
  /** Top-left of the 18×6 eyes block, in sprite pixels. */
  eyes: Point;
  /** Where held items attach (centre of the hands), in sprite pixels. */
  hand: Point;
}

export interface Pose {
  frames: PoseFrame[];
  fps: number;
}

type Arm = 'down' | 'mid' | 'midLow' | 'up' | 'high';
type Legs = 'stand' | 'stepA' | 'stepB' | 'sit' | 'tuck' | 'lie';

interface Parts {
  armL: Arm;
  armR: Arm;
  legs: Legs;
  /** Horizontal shake. */
  dx?: number;
  /** Lowers the whole body (sitting / lying). */
  dy?: number;
  /** Lowers only the top of the body (breathing, lying flat); negative stretches him up. */
  squash?: number;
}

const ARM_Y: Record<Arm, number> = { down: 10, mid: 7, midLow: 8, up: 3, high: 0 };
const LEG_X = [8, 12, 22, 26];

function build(p: Parts): PoseFrame {
  const dx = p.dx ?? 0, dy = p.dy ?? 0, squash = p.squash ?? 0;
  const c = new PixelCanvas(BODY_W, BODY_H);
  const top = 2 + dy + squash;
  const bottom = 17 + dy;

  // Legs first so the body overlaps their tops.
  LEG_X.forEach((lx, i) => {
    let from = 18, to = 21;
    if (p.legs === 'stepA' && i % 2 === 1) to = 19;
    if (p.legs === 'stepB' && i % 2 === 0) to = 19;
    if (p.legs === 'tuck') to = 19;
    if (p.legs === 'sit' || p.legs === 'lie') from = bottom + 1;
    if (from <= to) c.rect(lx + dx, from, 2, to - from + 1, 'L');
  });

  c.rect(6 + dx, top, 24, 1, 'H');
  c.rect(6 + dx, top + 1, 1, bottom - top - 1, 'h');
  c.rect(7 + dx, top + 1, 22, bottom - top - 1, 'O');
  c.rect(29 + dx, top + 1, 1, bottom - top - 1, 'S');
  c.rect(6 + dx, bottom, 24, 1, 'S');

  const arm = (x: number, kind: Arm) => {
    const y = Math.max(ARM_Y[kind] + dy, kind === 'high' ? 0 : top);
    c.rect(x + dx, y, 4, 3, 'O');
    c.rect(x + dx, y + 3, 4, 1, 'S');
  };
  arm(2, p.armL);
  arm(30, p.armR);

  return {
    sprite: parseSprite(c.rows(), PALETTE),
    eyes: { x: 9 + dx, y: 5 + dy + squash },
    hand: { x: 18 + dx, y: 11 + dy },
  };
}

const stand = (over: Partial<Parts> = {}): PoseFrame => build({ armL: 'down', armR: 'down', legs: 'stand', ...over });

export const POSES: Record<PoseName, Pose> = {
  idle: { fps: 1.6, frames: [stand(), stand({ squash: 1 })] },
  walk: { fps: 6, frames: [stand({ legs: 'stepA' }), stand({ legs: 'stepB' })] },
  run: { fps: 11, frames: [stand({ legs: 'stepA', armL: 'mid', armR: 'midLow' }), stand({ legs: 'stepB', armL: 'midLow', armR: 'mid' })] },
  sit: { fps: 1, frames: [stand({ legs: 'sit', dy: 2 })] },
  sleep: { fps: 0.8, frames: [stand({ legs: 'lie', dy: 3, squash: 2 }), stand({ legs: 'lie', dy: 3, squash: 3 })] },
  jump: { fps: 1, frames: [stand({ legs: 'tuck', armL: 'up', armR: 'up' })] },
  laugh: { fps: 6, frames: [stand({ armL: 'up', armR: 'up' }), stand({ armL: 'up', armR: 'up', squash: 1 })] },
  dizzy: { fps: 4, frames: [stand({ dx: -1 }), stand({ dx: 1 })] },
  startle: { fps: 1, frames: [stand({ armL: 'high', armR: 'high', legs: 'tuck' })] },
  wave: { fps: 4, frames: [stand({ armR: 'high' }), stand({ armR: 'up' })] },
  angry: { fps: 8, frames: [stand({ armL: 'mid', armR: 'mid', dx: -1 }), stand({ armL: 'mid', armR: 'mid', dx: 1 })] },
  hold: { fps: 1, frames: [stand({ armL: 'mid', armR: 'mid' })] },
  read: { fps: 1, frames: [stand({ legs: 'sit', dy: 2, armL: 'mid', armR: 'mid' })] },
  type: { fps: 9, frames: [stand({ legs: 'sit', dy: 2, armL: 'mid', armR: 'midLow' }), stand({ legs: 'sit', dy: 2, armL: 'midLow', armR: 'mid' })] },
  carry: { fps: 6, frames: [stand({ legs: 'stepA', armL: 'mid', armR: 'mid' }), stand({ legs: 'stepB', armL: 'mid', armR: 'mid' })] },
  // Eating the user's pointer: stretches up sucking it in, chomps, squashes swallowing, spits.
  inhale: { fps: 6, frames: [stand({ armL: 'up', armR: 'up', squash: -2 }), stand({ armL: 'up', armR: 'up', squash: -1 })] },
  chew: { fps: 7, frames: [stand({ armL: 'midLow', armR: 'midLow', squash: 1 }), stand({ armL: 'midLow', armR: 'midLow' })] },
  gulp: { fps: 1, frames: [stand({ legs: 'tuck', squash: 3 })] },
  spit: { fps: 1, frames: [stand({ armL: 'down', armR: 'down', squash: -2 })] },
};

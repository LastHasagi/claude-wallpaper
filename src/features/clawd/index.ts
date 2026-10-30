export { ClawdController, type ClawdApi, type ClawdEvents, type MoveOptions } from './controller/clawd-controller';
export { ClawdView } from './view/clawd-view';
export { isAbort, AbortError, type PlayOptions } from './model/actions';
export type { Floor, Stage } from './model/clawd-model';
export { BODY_W, BODY_H, type PoseName } from './sprites/body';
export { portrait } from './sprites/portrait';
export type { EyeState } from './sprites/eyes';
export type { HeldItem } from './sprites/props';
export type { ReactionKind } from './controller/brain';

import factsData from './data/facts.json';
import type { Fact } from './model/note-picker';

export const FACTS: readonly Fact[] = factsData;
export { NotesController, type NotesDeps, type NotesEvents, type NotesSetting } from './controller/notes-controller';
export { NoteView } from './view/note-view';
export { NotePicker, wrap, factText, SEEN_KEY, type Fact } from './model/note-picker';

import { parsePropArt } from '../../../shared/render/prop-art';

/** Lookout rock; Clawd stands on the flat top (bottom edge of row 0). */
export const ROCK = parsePropArt({
  frames: [[
    '      _________      ',
    '   __/  .   .  \\__   ',
    ' _/   .    :     . \\_ ',
    '/___________________\\',
  ]],
  role: 'strong',
  mask: [[
    '                     ',
    '       d   d         ',
    '      d    d     d   ',
    '                     ',
  ]],
  roles: { d: 'dim' },
});
export const ROCK_TOP_ROW = 0;

/** Park bench; the seat surface is the bottom edge of row 2. */
export const BENCH = parsePropArt({
  frames: [[
    '  ________________  ',
    ' |________________| ',
    ' |________________| ',
    '  ||            ||  ',
    '  ||            ||  ',
  ]],
  role: 'strong',
});
export const BENCH_SEAT_ROW = 2;

/** Desk with a mug; steam rises from the mug at column MUG_COL, above row 0. */
export const DESK = parsePropArt({
  frames: [[
    '                 c[_]   ',
    ' ______________________ ',
    '|______________________|',
    ' ||                  || ',
    ' ||                  || ',
  ]],
  role: 'strong',
  mask: [[
    '                 aaaa   ',
    '                        ',
    '                        ',
    '                        ',
    '                        ',
  ]],
  roles: { a: 'accent' },
});
export const MUG_COL = 19;

/**
 * The `ansiToJson` half of the `anser` package (MIT, originally ansi_up by
 * @drudru), re-implemented so this project carries no `anser` dependency.
 * Behavior matches anser 2.x for the SGR subset dsh consumed: text splits on
 * CSI, each chunk after a sequence carries the state that sequence left, a
 * non-SGR final byte passes its text through unstyled without touching state,
 * and `reverse` swaps the run's colors (defaulting a missing side to
 * black/white) instead of reaching the emitted decorations.
 */

/** One text run plus the SGR state in force for it, as anser reports it. */
export interface AnsiJsonChunk {
  /** Run text with its escape sequences removed. */
  content: string;
  /** Foreground as an `r, g, b` triple, or null when the run sets none. */
  fg: string | null;
  /** Background as an `r, g, b` triple, or null when the run sets none. */
  bg: string | null;
  /** SGR attributes in effect for the run, in the order they were declared. */
  decorations: readonly string[];
}

/** The 8/16 basic colors, indexed [bright][color % 8]; values as anser spells them. */
const ANSI_COLORS: readonly (readonly string[])[] = [
  ['0, 0, 0', '187, 0, 0', '0, 187, 0', '187, 187, 0', '0, 0, 187', '187, 0, 187', '0, 187, 187', '255,255,255'],
  [
    '85, 85, 85', '255, 85, 85', '0, 255, 0', '255, 255, 85',
    '85, 85, 255', '255, 85, 255', '85, 255, 255', '255, 255, 255',
  ],
];

/** The full 256-color palette: 16 system + 216 cube + 24 grayscale. */
const PALETTE_COLORS: readonly string[] = (() => {
  const palette: string[] = [...(ANSI_COLORS[0] ?? []), ...(ANSI_COLORS[1] ?? [])];
  const levels = [0, 95, 135, 175, 215, 255];
  for (let r = 0; r < 6; ++r) {
    for (let g = 0; g < 6; ++g) {
      for (let b = 0; b < 6; ++b) {
        palette.push(`${String(levels[r])}, ${String(levels[g])}, ${String(levels[b])}`);
      }
    }
  }
  for (let i = 0, level = 8; i < 24; ++i, level += 10) {
    palette.push(`${String(level)}, ${String(level)}, ${String(level)}`);
  }
  return palette;
})();

/** Mutable SGR state threaded across the chunks of one input. */
interface SgrParserState {
  fg: string | null;
  bg: string | null;
  decorations: string[];
}

function removeDecoration(state: SgrParserState, decoration: string): void {
  const index = state.decorations.indexOf(decoration);
  if (index >= 0) state.decorations.splice(index, 1);
}

/** Apply one SGR parameter string (`31`, `1;4`, `38;5;208`) to the running state. */
function applySgr(state: SgrParserState, params: string): void {
  const nums = params.split(';');
  while (nums.length > 0) {
    const numStr = nums.shift() ?? '';
    const num = Number.parseInt(numStr);
    if (Number.isNaN(num) || num === 0) {
      state.fg = null;
      state.bg = null;
      state.decorations = [];
    } else if (num === 1) {
      state.decorations.push('bold');
    } else if (num === 2) {
      state.decorations.push('dim');
    } else if (num === 3) {
      state.decorations.push('italic');
    } else if (num === 4) {
      state.decorations.push('underline');
    } else if (num === 5) {
      state.decorations.push('blink');
    } else if (num === 7) {
      state.decorations.push('reverse');
    } else if (num === 8) {
      state.decorations.push('hidden');
    } else if (num === 9) {
      state.decorations.push('strikethrough');
    } else if (num === 21) {
      removeDecoration(state, 'bold');
    } else if (num === 22) {
      removeDecoration(state, 'bold');
      removeDecoration(state, 'dim');
    } else if (num === 23) {
      removeDecoration(state, 'italic');
    } else if (num === 24) {
      removeDecoration(state, 'underline');
    } else if (num === 25) {
      removeDecoration(state, 'blink');
    } else if (num === 27) {
      removeDecoration(state, 'reverse');
    } else if (num === 28) {
      removeDecoration(state, 'hidden');
    } else if (num === 29) {
      removeDecoration(state, 'strikethrough');
    } else if (num === 39) {
      state.fg = null;
    } else if (num === 49) {
      state.bg = null;
    } else if (num >= 30 && num < 38) {
      state.fg = ANSI_COLORS[0]?.[num % 10] ?? null;
    } else if (num >= 90 && num < 98) {
      state.fg = ANSI_COLORS[1]?.[num % 10] ?? null;
    } else if (num >= 40 && num < 48) {
      state.bg = ANSI_COLORS[0]?.[num % 10] ?? null;
    } else if (num >= 100 && num < 108) {
      state.bg = ANSI_COLORS[1]?.[num % 10] ?? null;
    } else if (num === 38 || num === 48) {
      // Extended color (38=fg, 48=bg): `5;N` palette or `2;R;G;B` truecolor.
      const isForeground = num === 38;
      if (nums.length >= 1) {
        const mode = nums.shift();
        if (mode === '5' && nums.length >= 1) {
          const paletteIndex = Number.parseInt(nums.shift() ?? '');
          if (paletteIndex >= 0 && paletteIndex <= 255) {
            const color = PALETTE_COLORS[paletteIndex];
            if (color !== undefined) {
              if (isForeground) state.fg = color;
              else state.bg = color;
            }
          }
        } else if (mode === '2' && nums.length >= 3) {
          const r = Number.parseInt(nums.shift() ?? '');
          const g = Number.parseInt(nums.shift() ?? '');
          const b = Number.parseInt(nums.shift() ?? '');
          if (r >= 0 && r <= 255 && g >= 0 && g <= 255 && b >= 0 && b <= 255) {
            const color = `${String(r)}, ${String(g)}, ${String(b)}`;
            if (isForeground) state.fg = color;
            else state.bg = color;
          }
        }
      }
    }
  }
}

/**
 * Parse terminal text into styled chunks the way anser's
 * `ansiToJson(text, { json: true, remove_empty: true })` does: the text before
 * the first CSI is one unstyled chunk, every later chunk is the text following
 * one CSI sequence styled by the state accumulated so far, and empty chunks
 * are dropped.
 * @param text - text whose remaining escapes are CSI sequences.
 * @returns the styled chunks, in order.
 */
export function ansiToJson(text: string): AnsiJsonChunk[] {
  const state: SgrParserState = { fg: null, bg: null, decorations: [] };
  const rawChunks = text.split(/\x1b\[/);
  const firstContent = rawChunks.shift() ?? '';
  const chunks: AnsiJsonChunk[] = [{ content: firstContent, fg: null, bg: null, decorations: [] }];
  for (const raw of rawChunks) {
    // Four groups: parameter introducer, numeric parameters, the final byte
    // (with intermediates), and the text the sequence styles.
    const matches = raw.match(/^([!\x3c-\x3f]*)([\d;]*)([\x20-\x2c]*[\x40-\x7e])([\s\S]*)/m);
    const content = matches?.[4] ?? raw;
    if (matches === null || matches[1] !== '' || matches[3] !== 'm') {
      // Not an SGR sequence: the text passes through unstyled and the state
      // carries on untouched.
      chunks.push({ content, fg: null, bg: null, decorations: [] });
      continue;
    }
    applySgr(state, matches[2] ?? '');
    if (state.fg === null && state.bg === null && state.decorations.length === 0) {
      chunks.push({ content, fg: null, bg: null, decorations: [] });
      continue;
    }
    let fg = state.fg;
    let bg = state.bg;
    // `reverse` swaps the run's colors instead of reaching the output;
    // a missing side defaults to white (fg) and black (bg) first.
    const decorations = state.decorations.filter((decoration) => {
      if (decoration !== 'reverse') return true;
      fg ??= ANSI_COLORS[0]?.[7] ?? null;
      bg ??= ANSI_COLORS[0]?.[0] ?? null;
      const swap = fg;
      fg = bg;
      bg = swap;
      return false;
    });
    chunks.push({ content, fg, bg, decorations });
  }
  return chunks.filter((chunk) => chunk.content !== '');
}

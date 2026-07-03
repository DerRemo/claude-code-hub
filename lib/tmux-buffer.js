// tmux paste-buffer read — powers the touch "Copy" button on the iOS PWA.
// Express-frei, unit-testbar. Argv-Array → kein Shell-Interp.
//
// tmux-Buffer sind server-global (nicht pro Session): eine Maus-Drag-Selektion
// im Pane kopiert bei Release in einen NEUEN Top-Buffer. `show-buffer` (ohne
// Args) liefert genau den jüngsten — also die gerade gezogene Selektion. Für
// den Single-User-Hub ist das die richtige Semantik ("kopiere, was ich eben
// markiert habe"). Kein -t nötig / möglich.
import { execFileSync } from 'node:child_process';

export function showBuffer(opts = {}) {
  const tmux = opts.tmux || process.env.TMUX_PATH || 'tmux';
  try {
    return execFileSync(tmux, ['show-buffer'], {
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
    });
  } catch {
    return ''; // kein Buffer / kein Server → exit ≠ 0
  }
}

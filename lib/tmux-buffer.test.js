import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { showBuffer } from './tmux-buffer.js';

const TMUX = process.env.TMUX_PATH || 'tmux';

// 1) Argv deterministisch: genau `tmux show-buffer`.
test('showBuffer invokes `tmux show-buffer`', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tb-'));
  try {
    const fake = join(dir, 'fake-tmux.sh');
    writeFileSync(fake, '#!/bin/sh\nfor a in "$@"; do printf "%s\\n" "$a"; done\n');
    chmodSync(fake, 0o755);
    const args = showBuffer({ tmux: fake }).split('\n');
    assert.deepEqual(args.filter(Boolean), ['show-buffer']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// 2) Echter tmux auf isoliertem Socket: set-buffer → show-buffer round-trip.
test('showBuffer returns the newest tmux buffer contents', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tb-'));
  const sock = `pen-buf-${process.pid}`;
  const wrap = join(dir, 'tmux-wrap.sh');
  writeFileSync(wrap, `#!/bin/sh\nexec ${TMUX} -L ${sock} "$@"\n`);
  chmodSync(wrap, 0o755);
  try {
    execFileSync(wrap, ['new-session', '-d', '-s', 'x', 'sh']);
    execFileSync(wrap, ['set-buffer', 'HELLO-TMUX-BUFFER']);
    const out = showBuffer({ tmux: wrap });
    assert.ok(out.includes('HELLO-TMUX-BUFFER'), 'jüngster Buffer muss zurückkommen');
  } finally {
    try { execFileSync(wrap, ['kill-server']); } catch {}
    rmSync(dir, { recursive: true, force: true });
  }
});

// 3) Kein Buffer / kein Server → '' (best-effort, kein Throw).
test('showBuffer returns empty string when show-buffer fails', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tb-'));
  try {
    const fake = join(dir, 'fail-tmux.sh');
    writeFileSync(fake, '#!/bin/sh\nexit 1\n');
    chmodSync(fake, 0o755);
    assert.equal(showBuffer({ tmux: fake }), '');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

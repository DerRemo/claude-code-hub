import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLIS, cliFromCommand } from './clis.js';

test('cliFromCommand maps first token to cli id', () => {
  assert.equal(cliFromCommand('claude'), 'claude');
  assert.equal(cliFromCommand('claude --dangerously-skip-permissions'), 'claude');
  assert.equal(cliFromCommand('codex --dangerously-bypass-approvals-and-sandbox'), 'codex');
  assert.equal(cliFromCommand('agy --dangerously-skip-permissions'), 'antigravity');
  assert.equal(cliFromCommand('opencode'), 'opencode');
  assert.equal(cliFromCommand('opencode --continue'), 'opencode');
});

test('cliFromCommand strips a path prefix from the binary', () => {
  assert.equal(cliFromCommand('/opt/homebrew/bin/agy'), 'antigravity');
  assert.equal(cliFromCommand('/usr/local/bin/codex --sandbox workspace-write'), 'codex');
});

test('cliFromCommand returns null for unknown or empty', () => {
  assert.equal(cliFromCommand('aider'), null);
  assert.equal(cliFromCommand(''), null);
  assert.equal(cliFromCommand(null), null);
  assert.equal(cliFromCommand(undefined), null);
});

test('CLIS registry integrity', () => {
  assert.ok(Array.isArray(CLIS) && CLIS.length === 4);
  const ids = CLIS.map(c => c.id);
  assert.deepEqual(ids, ['claude', 'codex', 'antigravity', 'opencode']);
  for (const c of CLIS) {
    assert.ok(c.id && c.label && c.binary && c.color, `cli ${c.id} has core fields`);
    assert.ok(Array.isArray(c.variants) && c.variants.length >= 1, `cli ${c.id} has variants`);
    for (const v of c.variants) {
      assert.ok(v.label && v.command, `variant of ${c.id} has label+command`);
      assert.equal(v.command.split(/\s+/)[0], c.binary, `variant command starts with ${c.binary}`);
    }
  }
});

test('each CLI has a non-trivial inline SVG logo', () => {
  for (const c of CLIS) {
    assert.equal(typeof c.logo, 'string', `cli ${c.id} has a logo string`);
    assert.ok(c.logo.includes('<svg'), `cli ${c.id} logo is inline svg`);
    assert.ok(c.logo.includes('</svg>'), `cli ${c.id} logo svg is closed`);
    assert.ok(c.logo.length > 80, `cli ${c.id} logo is non-trivial`);
  }
});

test('claude logo is the Claude sunburst, not the Anthropic A', () => {
  const claude = CLIS.find(c => c.id === 'claude');
  // Das Claude-Sunburst (svgl claude-ai-icon) hat viewBox "0 0 256 257";
  // das Anthropic-"A" (simple-icons) hat "0 0 24 24". So bleibt die
  // Entscheidung "Claude-Logo, nicht Anthropic" im Test verankert.
  assert.ok(claude.logo.includes('256 257'), 'claude uses the sunburst viewBox');
  assert.ok(claude.logo.includes('#D97757'), 'claude uses the brand orange');
});

// Task 1: tier field on variants
test('every variant carries a tier; first is safe, last is danger (or safe-only)', () => {
  for (const c of CLIS) {
    const tiers = c.variants.map(v => v.tier);
    assert.ok(tiers.every(Boolean), `${c.id}: every variant has a tier`);
    assert.equal(tiers[0], 'safe', `${c.id}: first variant is safe`);
    if (c.variants.length === 1) {
      assert.equal(tiers[0], 'safe', `${c.id}: single variant is safe`);
    } else {
      assert.equal(tiers[tiers.length - 1], 'danger', `${c.id}: last variant is danger`);
    }
  }
});

test('claude has an Auto variant = "claude --permission-mode auto"', () => {
  const claude = CLIS.find(c => c.id === 'claude');
  const auto = claude.variants.find(v => v.tier === 'auto');
  assert.ok(auto, 'claude has an auto-tier variant');
  assert.equal(auto.command, 'claude --permission-mode auto');
});

test('codex auto tier is Full-Auto, danger is YOLO', () => {
  const codex = CLIS.find(c => c.id === 'codex');
  // codex 0.135+: --full-auto entfernt → workspace-write + on-request; --yolo nur
  // noch verstecktes Alias → explizites --dangerously-bypass-approvals-and-sandbox.
  assert.equal(codex.variants.find(v => v.tier === 'auto').command, 'codex --sandbox workspace-write --ask-for-approval on-request');
  assert.equal(codex.variants.find(v => v.tier === 'danger').command, 'codex --dangerously-bypass-approvals-and-sandbox');
});

test('antigravity has no auto tier (safe + danger only)', () => {
  const agy = CLIS.find(c => c.id === 'antigravity');
  assert.equal(agy.variants.some(v => v.tier === 'auto'), false);
  assert.deepEqual(agy.variants.map(v => v.tier), ['safe', 'danger']);
});

test('opencode has a single safe Standard variant = "opencode"', () => {
  const oc = CLIS.find(c => c.id === 'opencode');
  assert.ok(oc, 'opencode is registered');
  assert.equal(oc.binary, 'opencode');
  assert.deepEqual(oc.variants.map(v => v.tier), ['safe']);
  assert.equal(oc.variants[0].command, 'opencode');
});

// Task 2: defaultVariant + variantByTier helpers
import { defaultVariant, variantByTier } from './clis.js';

test('defaultVariant prefers the auto tier, else the first variant', () => {
  assert.equal(defaultVariant('claude').command, 'claude --permission-mode auto');
  assert.equal(defaultVariant('codex').command, 'codex --sandbox workspace-write --ask-for-approval on-request');
  assert.equal(defaultVariant('antigravity').command, 'agy');      // no auto → first (safe)
  assert.equal(defaultVariant('opencode').command, 'opencode');   // no auto → first (safe)
  assert.equal(defaultVariant('nope'), null);
});

test('variantByTier returns the matching variant or null', () => {
  assert.equal(variantByTier('claude', 'danger').command, 'claude --dangerously-skip-permissions');
  assert.equal(variantByTier('antigravity', 'auto'), null);        // no such tier
  assert.equal(variantByTier('nope', 'safe'), null);
  assert.equal(variantByTier('opencode', 'safe').command, 'opencode');
  assert.equal(variantByTier('opencode', 'danger'), null);        // no such tier
});

import { continueCommand } from './clis.js';

test('continueCommand: claude inserts --continue after binary, keeps flags', () => {
  assert.equal(continueCommand('claude'), 'claude --continue');
  assert.equal(continueCommand('claude --permission-mode auto'), 'claude --continue --permission-mode auto');
});
test('continueCommand: codex first token → "codex resume --last", keeps flags', () => {
  assert.equal(continueCommand('codex'), 'codex resume --last');
  assert.equal(continueCommand('codex --sandbox workspace-write --ask-for-approval on-request'),
    'codex resume --last --sandbox workspace-write --ask-for-approval on-request');
});
test('continueCommand: agy inserts --continue after binary', () => {
  assert.equal(continueCommand('agy'), 'agy --continue');
  assert.equal(continueCommand('agy --dangerously-skip-permissions'), 'agy --continue --dangerously-skip-permissions');
});
test('continueCommand: opencode inserts --continue after binary, idempotent', () => {
  assert.equal(continueCommand('opencode'), 'opencode --continue');
  assert.equal(continueCommand('opencode --continue'), 'opencode --continue');
  assert.equal(continueCommand('opencode -c'), 'opencode -c');
});
test('continueCommand: path-binary keeps the original token', () => {
  assert.equal(continueCommand('/opt/homebrew/bin/claude --permission-mode auto'),
    '/opt/homebrew/bin/claude --continue --permission-mode auto');
  assert.equal(continueCommand('/usr/local/bin/codex'), '/usr/local/bin/codex resume --last');
});
test('continueCommand: idempotent (double call == single)', () => {
  assert.equal(continueCommand('claude --continue --permission-mode auto'), 'claude --continue --permission-mode auto');
  assert.equal(continueCommand(continueCommand('claude --permission-mode auto')), continueCommand('claude --permission-mode auto'));
  assert.equal(continueCommand('codex resume --last --sandbox workspace-write'), 'codex resume --last --sandbox workspace-write');
  assert.equal(continueCommand('agy --continue'), 'agy --continue');
});
test('continueCommand: unknown CLI / empty / null → null', () => {
  assert.equal(continueCommand('bash -lc whatever'), null);
  assert.equal(continueCommand(''), null);
  assert.equal(continueCommand(null), null);
  assert.equal(continueCommand(undefined), null);
});

// ── Channels (Claude Code channels feature) ──────────────────────
import { CHANNELS, withChannel, channelsFromCommand } from './clis.js';

test('CHANNELS registry integrity', () => {
  assert.ok(Array.isArray(CHANNELS) && CHANNELS.length === 3);
  assert.deepEqual(CHANNELS.map(c => c.id), ['telegram', 'discord', 'imessage']);
  for (const c of CHANNELS) {
    assert.ok(c.id && c.label && c.plugin && c.color, `channel ${c.id} has core fields`);
    assert.ok(c.plugin.endsWith('@claude-plugins-official'), `channel ${c.id} plugin ref is official`);
    assert.equal(c.plugin.split('@')[0], c.id, `channel ${c.id} plugin name matches id`);
  }
});

test('each channel has a non-trivial inline SVG logo', () => {
  for (const c of CHANNELS) {
    assert.equal(typeof c.logo, 'string', `channel ${c.id} has a logo string`);
    assert.ok(c.logo.includes('<svg') && c.logo.includes('</svg>'), `channel ${c.id} logo is closed svg`);
    assert.ok(c.logo.length > 80, `channel ${c.id} logo is non-trivial`);
  }
});

test('withChannel appends --channels flag to a bare claude command', () => {
  assert.equal(withChannel('claude', 'telegram'),
    'claude --channels plugin:telegram@claude-plugins-official');
  assert.equal(withChannel('claude --permission-mode auto', 'discord'),
    'claude --permission-mode auto --channels plugin:discord@claude-plugins-official');
  assert.equal(withChannel('claude --dangerously-skip-permissions', 'imessage'),
    'claude --dangerously-skip-permissions --channels plugin:imessage@claude-plugins-official');
});

test('withChannel replaces an existing channel (idempotent per id)', () => {
  const once = withChannel('claude --permission-mode auto', 'telegram');
  assert.equal(withChannel(once, 'telegram'), once);            // same id → unchanged
  assert.equal(withChannel(once, 'discord'),                    // switch id → replaced
    'claude --permission-mode auto --channels plugin:discord@claude-plugins-official');
});

test('withChannel with null/unknown id strips channels, returns bare command', () => {
  assert.equal(withChannel('claude --permission-mode auto', null), 'claude --permission-mode auto');
  assert.equal(withChannel('claude --channels plugin:telegram@claude-plugins-official', null), 'claude');
  assert.equal(withChannel('claude --permission-mode auto', 'nope'), 'claude --permission-mode auto');
  assert.equal(withChannel('claude', undefined), 'claude');
});

test('withChannel preserves flags that follow --channels when stripping', () => {
  // --channels consumes only the plugin: tokens; a trailing non-plugin flag survives.
  assert.equal(
    withChannel('claude --channels plugin:telegram@claude-plugins-official --permission-mode auto', null),
    'claude --permission-mode auto');
  assert.equal(
    withChannel('claude --channels plugin:telegram@claude-plugins-official --permission-mode auto', 'discord'),
    'claude --permission-mode auto --channels plugin:discord@claude-plugins-official');
});

test('channelsFromCommand parses a single channel', () => {
  assert.deepEqual(channelsFromCommand('claude --channels plugin:telegram@claude-plugins-official'), ['telegram']);
  assert.deepEqual(channelsFromCommand('claude --permission-mode auto --channels plugin:discord@claude-plugins-official'), ['discord']);
});

test('channelsFromCommand parses multiple space-separated channels', () => {
  assert.deepEqual(
    channelsFromCommand('claude --channels plugin:telegram@claude-plugins-official plugin:imessage@claude-plugins-official'),
    ['telegram', 'imessage']);
});

test('channelsFromCommand: none / unknown-plugin filtered / empty / null → []', () => {
  assert.deepEqual(channelsFromCommand('claude --permission-mode auto'), []);
  assert.deepEqual(channelsFromCommand('claude --channels plugin:mystery@claude-plugins-official'), []);
  assert.deepEqual(channelsFromCommand('codex'), []);
  assert.deepEqual(channelsFromCommand(''), []);
  assert.deepEqual(channelsFromCommand(null), []);
  assert.deepEqual(channelsFromCommand(undefined), []);
});

test('withChannel and channelsFromCommand round-trip', () => {
  for (const c of CHANNELS) {
    assert.deepEqual(channelsFromCommand(withChannel('claude --permission-mode auto', c.id)), [c.id]);
  }
});

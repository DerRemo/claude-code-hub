import { test, expect } from './fixtures.js';

// Claude-Code-Channels-Support: New-Session-Picker (Claude-only) verdrahtet das
// --channels-Flag in den Command; Overview-Cards zeigen ein Anbieter-Symbol.
// Der Card-Pfad wird per route-Mock von /api/sessions geprüft (kein echter Spawn).

function mockSessions(page, sessions) {
  return page.route('**/api/sessions', route => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sessions) });
    }
    return route.continue();
  });
}

test.describe('Channels — new-session picker', () => {
  test('claude shows the channel picker; selecting one wires --channels into the command', async ({ authedPage: page }) => {
    await page.click('#new-session-btn');
    await expect(page.locator('#new-session-modal')).toHaveClass(/open/, { timeout: 5_000 });

    // Default CLI = claude → Channel-Gruppe sichtbar, alle vier Optionen da.
    await expect(page.locator('#channel-group')).toBeVisible();
    await expect(page.locator('.channel-pick-btn[data-channel=""]')).toBeVisible();       // None
    for (const id of ['telegram', 'discord', 'imessage']) {
      await expect(page.locator(`.channel-pick-btn[data-channel="${id}"]`)).toBeVisible();
    }
    // None ist die Default-Auswahl → Command trägt kein --channels.
    await expect.poll(() => page.locator('#new-session-cmd').inputValue())
      .not.toContain('--channels');

    // Telegram wählen → Flag hängt hinten am Claude-Command.
    await page.click('.channel-pick-btn[data-channel="telegram"]');
    await expect.poll(() => page.locator('#new-session-cmd').inputValue())
      .toBe('claude --permission-mode auto --channels plugin:telegram@claude-plugins-official');

    // Auf eine andere CLI wechseln → Picker weg, Flag entfällt (Channels sind Claude-only).
    await page.click('.cli-pick-btn[data-cli="codex"]');
    await expect(page.locator('#channel-group')).toBeHidden();
    await expect.poll(() => page.locator('#new-session-cmd').inputValue())
      .not.toContain('--channels');

    // Zurück zu Claude → Picker wieder da, gemerkte Telegram-Wahl re-applied.
    await page.click('.cli-pick-btn[data-cli="claude"]');
    await expect(page.locator('#channel-group')).toBeVisible();
    await expect(page.locator('.channel-pick-btn[data-channel="telegram"]')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => page.locator('#new-session-cmd').inputValue())
      .toContain('--channels plugin:telegram@claude-plugins-official');
  });
});

test.describe('Channels — overview card icon', () => {
  test('a session using a channel shows the provider badge; a plain one does not', async ({ authedPage: page }) => {
    await mockSessions(page, [
      { name: 'cc-with-channel', status: 'running', attached: false, windows: 1, activity: 'idle',
        command: 'claude --permission-mode auto --channels plugin:discord@claude-plugins-official',
        path: '/tmp', muted: false, pinned: false, boardCard: null },
      { name: 'cc-plain', status: 'running', attached: false, windows: 1, activity: 'idle',
        command: 'claude', path: '/tmp', muted: false, pinned: false, boardCard: null },
    ]);
    await page.reload();
    await page.waitForSelector('body[data-current-view="dashboard"]', { timeout: 10_000 });

    const withCh = page.locator('.session-card[data-name="cc-with-channel"]');
    await expect(withCh).toBeVisible({ timeout: 10_000 });
    const badge = withCh.locator('.channel-badge');
    await expect(badge).toHaveCount(1);
    await expect(badge).toHaveAttribute('title', 'Discord');

    const plain = page.locator('.session-card[data-name="cc-plain"]');
    await expect(plain).toBeVisible();
    await expect(plain.locator('.channel-badge')).toHaveCount(0);
  });
});

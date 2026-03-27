/**
 * Auth setup — run this once to save your login session.
 *
 * Usage:
 *   npx playwright test e2e/auth.setup.ts --headed
 *
 * This opens a browser window where you log in manually via Clerk.
 * Once logged in, it saves the session to e2e/.auth/state.json.
 * All other tests reuse this saved session.
 *
 * Re-run when the session expires (you'll see auth errors in tests).
 */
import { test as setup } from '@playwright/test';

setup.use({ storageState: undefined });

setup('authenticate', async ({ page }) => {
  await page.goto('/');

  // Wait for you to complete the Clerk login manually
  // The test will wait up to 2 minutes for the authenticated app to load
  console.log('\n=== Log in via the browser window. Waiting up to 2 minutes... ===\n');
  await page.waitForSelector('text=Now Playing', { timeout: 120000 });

  // Save the authenticated session
  await page.context().storageState({ path: 'e2e/.auth/state.json' });
  console.log('\n=== Auth state saved to e2e/.auth/state.json ===\n');
});

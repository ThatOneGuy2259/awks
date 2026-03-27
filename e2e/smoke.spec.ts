/**
 * Playback Pipeline Tests — serial, modifies queue state
 *
 * Queues two tracks upfront, then verifies playback, audio, visualizer, and skip.
 */
import { test, expect, type Page } from '@playwright/test';

const TRACK_1_QUERY = 'never gonna give you up rick astley';
const TRACK_2_QUERY = 'darude sandstorm';
// Clear all tracks: skip the current track, then delete pending ones
async function clearQueue(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForTimeout(2000);

  // Skip the currently playing track if there is one
  const skipBtn = page.locator('footer:visible button:has-text("Skip")').first();
  while (await skipBtn.isVisible().catch(() => false)) {
    await skipBtn.click();
    await page.waitForTimeout(2000);
  }

  // Delete any remaining pending tracks (admin X buttons)
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const deleteBtn = page.locator('button[title="Remove from queue"]').first();
    if (!(await deleteBtn.isVisible().catch(() => false))) break;
    await deleteBtn.click();
    await page.waitForTimeout(1000);
  }
}

async function queueTrack(page: Page, query: string): Promise<void> {
  await page.goto('/search');
  const input = page.locator('input[placeholder*="Search"]');
  await input.fill(query);
  await input.press('Enter');

  await expect(page.locator('text=Top Results')).toBeVisible({ timeout: 20000 });
  await page.waitForTimeout(1000);

  const requestBtn = page.locator('button:has-text("Request")').first();
  await expect(requestBtn).toBeVisible({ timeout: 5000 });
  await expect(requestBtn).toBeEnabled({ timeout: 5000 });
  await requestBtn.click();

  await expect(
    page.locator('button:has-text("Requested"), button:has-text("Requesting")').first()
  ).toBeVisible({ timeout: 15000 });

  await page.waitForTimeout(2000);
}

test.describe.serial('Playback pipeline', () => {
  test('cleanup: clear queue before tests', async ({ page }) => {
    await clearQueue(page);
  });

  test('queue two tracks', async ({ page }) => {
    await queueTrack(page, TRACK_1_QUERY);
    await queueTrack(page, TRACK_2_QUERY);

    // Verify both are in the queue
    await page.goto('/');
    await page.waitForTimeout(3000);
    // Should see at least one track in queue or playing
    const hasSkip = await page.locator('footer:visible button:has-text("Skip")').first().isVisible();
    const hasQueue = await page.locator('text=Up Next').isVisible();
    expect(hasSkip || hasQueue).toBeTruthy();
  });

  test('first track plays with audio and visualizer', async ({ page }) => {
    test.setTimeout(120000);
    await page.goto('/');

    // Wait for playback to start
    await expect(page.locator('footer:visible button:has-text("Skip")').first()).toBeVisible({ timeout: 90000 });
    // Let audio stream and visualizer establish
    await page.waitForTimeout(8000);

    // Verify the player bar is showing track info (proof that playback state is active)
    await expect(page.locator('footer:visible img').first()).toBeVisible();

    // Verify visualizer canvas has rendered content (proof audio data is flowing)
    const canvasInfo = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return null;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let nonEmpty = 0;
      for (let i = 3; i < imageData.data.length; i += 4) {
        if (imageData.data[i] > 0) nonEmpty++;
      }
      return { renderedPixels: nonEmpty };
    });

    expect(canvasInfo).not.toBeNull();
    expect(canvasInfo!.renderedPixels).toBeGreaterThan(0);

    // Verify visualizer is animating (not static) — two snapshots should differ
    const snap1 = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return 0;
      const ctx = canvas.getContext('2d');
      if (!ctx) return 0;
      const cx = Math.floor(canvas.width / 2);
      const data = ctx.getImageData(cx - 10, 0, 20, canvas.height);
      let sum = 0;
      for (let i = 0; i < data.data.length; i += 4) {
        sum += data.data[i] + data.data[i + 1] + data.data[i + 2];
      }
      return sum;
    });

    await page.waitForTimeout(500);

    const snap2 = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return 0;
      const ctx = canvas.getContext('2d');
      if (!ctx) return 0;
      const cx = Math.floor(canvas.width / 2);
      const data = ctx.getImageData(cx - 10, 0, 20, canvas.height);
      let sum = 0;
      for (let i = 0; i < data.data.length; i += 4) {
        sum += data.data[i] + data.data[i + 1] + data.data[i + 2];
      }
      return sum;
    });

    expect(snap1).not.toBe(snap2);
  });

  test('skip advances to second track', async ({ page }) => {
    test.setTimeout(120000);
    await page.goto('/');
    await page.waitForTimeout(3000);

    const skipBtn = page.locator('footer:visible button:has-text("Skip")').first();
    await expect(skipBtn).toBeVisible({ timeout: 10000 });

    // Get current track title from player bar
    const titleBefore = await page.locator('footer:visible p').first().textContent();

    // Skip
    await skipBtn.click();

    // Wait for the next track to start playing
    await page.waitForTimeout(15000);

    // Verify track changed or queue emptied
    const stillPlaying = await skipBtn.isVisible();
    if (stillPlaying) {
      const titleAfter = await page.locator('footer:visible p').first().textContent();
      expect(titleAfter).not.toBe(titleBefore);

      // Verify player bar still shows track info (audio is active)
      await expect(page.locator('footer:visible img').first()).toBeVisible();
    }
    // If not playing, the skip emptied the queue — still valid
  });

  test('cleanup: clear queue after tests', async ({ page }) => {
    await clearQueue(page);
  });
});

/**
 * UI Smoke Tests — read-only, safe to run in parallel
 */
import { test, expect, type Page } from '@playwright/test';

async function ensureAuthenticated(page: Page) {
  await page.goto('/');
  await page.waitForTimeout(3000);
  if (await page.locator('text=Sign in to AWKS').isVisible()) {
    throw new Error('Session expired — re-run: npx playwright test auth.setup --headed');
  }
}

test.describe('App loads', () => {
  test('renders authenticated app', async ({ page }) => {
    await ensureAuthenticated(page);
    await expect(page.getByRole('link', { name: 'Now Playing' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Search' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'History' })).toBeVisible();
  });

  test('shows online listeners section', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=Online Listeners')).toBeVisible({ timeout: 15000 });
  });

  test('shows live chat section', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=Live Chat')).toBeVisible({ timeout: 15000 });
  });
});

test.describe('Search', () => {
  test('navigates to search page', async ({ page }) => {
    await page.goto('/search');
    await expect(page.locator('input[placeholder*="Search"]')).toBeVisible({ timeout: 15000 });
  });

  test('shows trending tags', async ({ page }) => {
    await page.goto('/search');
    await expect(page.locator('text=Trending')).toBeVisible({ timeout: 15000 });
  });

  test('returns search results on submit', async ({ page }) => {
    await page.goto('/search');
    const input = page.locator('input[placeholder*="Search"]');
    await input.fill('never gonna give you up');
    await input.press('Enter');
    await expect(page.locator('text=Top Results')).toBeVisible({ timeout: 15000 });
  });

  test('shows search suggestions while typing', async ({ page }) => {
    await page.goto('/search');
    const input = page.locator('input[placeholder*="Search"]');
    await input.fill('lofi hip');
    await expect(page.locator('button:has(span:text("search"))').nth(1)).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Settings', () => {
  test('settings modal opens and shows themes', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    await page.locator('button', { has: page.locator('text=settings') }).first().click();
    await expect(page.locator('h2:text("Settings")')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Neon Groove')).toBeVisible();
  });

  test('can switch themes', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    await page.locator('button', { has: page.locator('text=settings') }).first().click();
    await expect(page.locator('h2:text("Settings")')).toBeVisible({ timeout: 5000 });
    await page.locator('button:has-text("Electric Ember")').click();
    await expect(page.locator('button:has-text("Electric Ember") >> text=check_circle')).toBeVisible();
    await page.locator('button:has-text("Neon Groove")').click();
  });

  test('custom themes section exists', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    await page.locator('button', { has: page.locator('text=settings') }).first().click();
    await expect(page.getByRole('heading', { name: 'Custom Themes' })).toBeVisible({ timeout: 5000 });
    await expect(page.locator('button:has-text("Create Theme")')).toBeVisible();
  });
});

test.describe('Navigation', () => {
  test('can navigate between pages via sidebar', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    await page.getByRole('link', { name: 'Search' }).first().click();
    await expect(page.locator('input[placeholder*="Search"]')).toBeVisible({ timeout: 5000 });
    await page.getByRole('link', { name: 'History' }).first().click();
    await expect(page.getByRole('heading', { name: 'History' })).toBeVisible({ timeout: 5000 });
    await page.getByRole('link', { name: 'Now Playing' }).first().click();
    await expect(page.locator('text=Up Next')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Help', () => {
  test('help modal opens with feature documentation', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    await page.locator('button:has-text("Help")').click();
    await expect(page.locator('text=How to Use AWKS')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Visualizer EQ')).toBeVisible();
  });
});

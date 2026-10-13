import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function statusTheme(page: Page) {
  const script = await readFile(new URL('../../Backend/public/api-status-theme.js', import.meta.url), 'utf8');
  await page.route('**/api-status-theme.js', (route) => route.fulfill({ contentType: 'application/javascript', body: script }));
  await page.route('**/api-status-test', (route) => route.fulfill({ contentType: 'text/html',
    headers: { 'Content-Security-Policy': "default-src 'none'; script-src 'self'" },
    body: '<!doctype html><html><head><script src="/api-status-theme.js"></script></head><body><button id="api-theme-toggle" type="button" aria-label="Switch to black theme" aria-pressed="false">Theme</button></body></html>',
  }));
  await page.goto('/api-status-test');
}

test('backend appearance toggles between light and black and persists through reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await statusTheme(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Switch to black theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: 'Switch to light theme' })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => localStorage.getItem('portal-api-theme'))).toBe('dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('button', { name: 'Switch to black theme' })).toHaveAttribute('aria-pressed', 'false');
});

test('backend appearance follows native system changes until a choice is made', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await statusTheme(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Switch to black theme' }).click();
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('backend toggle works when browser storage is unavailable', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException('Storage unavailable', 'SecurityError'); };
    Storage.prototype.setItem = () => { throw new DOMException('Storage unavailable', 'SecurityError'); };
  });
  await statusTheme(page);
  await page.getByRole('button', { name: 'Switch to black theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(errors).toEqual([]);
});

test('invalid saved appearance falls back to native preference', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() => localStorage.setItem('portal-api-theme', 'invalid-theme'));
  await statusTheme(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: 'Switch to light theme' })).toHaveAttribute('title', 'Switch to light theme');
});

test('appearance updates from other tabs and returns to native preference when cleared', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await statusTheme(page);
  await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'portal-api-theme', newValue: 'dark' })));
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'portal-api-theme', newValue: null })));
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

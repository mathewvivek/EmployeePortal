import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { Employee, SalaryChange } from '../src/api';

async function workspace(page: Page) {
  const names = ['Dianne Russell', 'Jane Cooper', 'Kristin Watson', 'Marvin McKinney', 'Eleanor Pena', 'Priya Sharma', 'Charles Zhao', 'Devon Lane', 'Alice Morgan', 'Bob Chen', 'Carla Jones', 'David Singh'];
  const records: Employee[] = names.map((name, index) => ({
    id: index + 1, employee_id: `EMP${2001 + index}`, name,
    department: ['Engineering', 'Design', 'People', 'Finance'][index % 4],
    designation: 'Software Engineer', status: index % 4 === 3 ? 'inactive' : 'active',
    country: ['United States', 'India', 'United Kingdom'][index % 3],
    currency: ['USD', 'INR', 'GBP'][index % 3],
    base_salary: String(72000 + index * 2500), effective_date: '2026-10-01',
  }));
  const metric = { headcount: 4, total_base_salary: '400000.00', average_base_salary: '100000.00', median_base_salary: '95000.00' };
  const summary = {
    headcount: 12,
    currencies: Object.fromEntries(['USD', 'INR', 'GBP'].map((currency, index) => [currency, {
      ...metric,
      by_country: { [(['United States', 'India', 'United Kingdom'][index])]: metric },
      by_department: Object.fromEntries(['Engineering', 'Design', 'People', 'Finance'].map((department) => [department, { ...metric, headcount: 1, total_base_salary: '100000.00' }])),
    }])),
  };
  const changes: SalaryChange[] = [];
  const updates: Record<string, unknown>[] = [];
  const queries: URLSearchParams[] = [];
  let fail = false;

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith('/compensation_insights')) return route.fulfill({ json: { data: summary } });
    if (url.pathname.endsWith('/salary_history')) return route.fulfill({ json: { data: changes } });
    if (request.method() === 'PATCH') {
      const salary = request.postDataJSON().salary;
      updates.push(salary);
      const employee = records.find((record) => url.pathname === `/api/v1/employees/${record.id}/salary`)!;
      changes.unshift({ id: changes.length + 1, old_base_salary: employee.base_salary, new_base_salary: salary.base_salary,
        old_currency: employee.currency, new_currency: salary.currency, old_effective_date: employee.effective_date,
        effective_date: salary.effective_date, changed_at: '2026-10-12T12:00:00Z' });
      Object.assign(employee, salary);
      return route.fulfill({ json: { data: salary } });
    }
    if (fail) return route.fulfill({ status: 503, json: { errors: ['Workspace temporarily unavailable'] } });
    queries.push(url.searchParams);
    let results = records.filter((employee) => {
      const query = (url.searchParams.get('q') || '').toLowerCase();
      return `${employee.name} ${employee.employee_id}`.toLowerCase().includes(query) &&
        ['country', 'department', 'status'].every((field) => !url.searchParams.get(field) || employee[field as keyof Employee] === url.searchParams.get(field));
    });
    if (url.searchParams.get('sort') === 'base_salary') {
      const direction = url.searchParams.get('direction') === 'desc' ? -1 : 1;
      results = [...results].sort((a, b) => (Number(a.base_salary) - Number(b.base_salary)) * direction);
    }
    const current = Number(url.searchParams.get('page') || 1);
    const size = Number(url.searchParams.get('per_page') || 25);
    return route.fulfill({ json: { data: results.slice((current - 1) * size, current * size),
      meta: { page: current, per_page: size, total_count: results.length, total_pages: Math.ceil(results.length / size) } } });
  });
  return { updates, queries, setFailure: (value: boolean) => { fail = value; } };
}

async function navigate(page: Page, label: string) {
  if (await page.getByRole('button', { name: 'Open navigation' }).isVisible()) {
    await page.getByRole('button', { name: 'Open navigation' }).click();
  }
  await page.locator('.main-navigation').getByRole('button', { name: label, exact: true }).click();
}

test('directory renders, avatars load and pagination works without page overflow', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await workspace(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Employee directory' })).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(8);
  await expect(page.locator('.profile img')).toHaveJSProperty('naturalWidth', 96);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('directory.png'), fullPage: true });
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByText('Showing 9-12 of 12')).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(4);
  await page.getByRole('button', { name: 'Previous page' }).click();
  await expect(page.getByText('Showing 1-8 of 12')).toBeVisible();
  expect(errors).toEqual([]);
});

test('search and combined filters request and render the correct records', async ({ page }) => {
  const state = await workspace(page);
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Search employees' }).fill('Jane');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /^Jane Cooper/ })).toBeVisible();
  expect(state.queries.some((query) => query.get('q') === 'Jane')).toBe(true);
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(8);
  await page.getByRole('button', { name: /^Filter/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Filter employees' });
  await dialog.getByRole('combobox', { name: 'Country', exact: true }).selectOption('India');
  await dialog.getByRole('combobox', { name: 'Department', exact: true }).selectOption('Finance');
  await dialog.getByRole('combobox', { name: 'Status', exact: true }).selectOption('inactive');
  await dialog.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /^Devon Lane/ })).toBeVisible();
  expect(state.queries.some((query) => query.get('country') === 'India' && query.get('department') === 'Finance' && query.get('status') === 'inactive')).toBe(true);
});

test('salary sorting sends its direction and shows the sorted response', async ({ page }) => {
  const state = await workspace(page);
  await page.goto('/');
  await expect(page.locator('tbody tr')).toHaveCount(8);
  await page.getByRole('button', { name: 'Sort', exact: true }).click();
  await page.getByRole('radio', { name: 'Salary: high to low' }).click();
  await expect(page.locator('tbody tr').first()).toContainText('David Singh');
  expect(state.queries.some((query) => query.get('sort') === 'base_salary' && query.get('direction') === 'desc')).toBe(true);
});

test('salary editing requires review and confirmation and shows the new audit record', async ({ page }) => {
  const state = await workspace(page);
  await page.goto('/');
  await page.getByRole('button', { name: /^Dianne Russell/ }).click();
  let dialog = page.getByRole('dialog', { name: 'Employee compensation' });
  await dialog.getByLabel('Base salary', { exact: true }).fill('85000.25');
  await dialog.getByLabel('Effective date', { exact: true }).fill('2026-11-01');
  await dialog.getByRole('button', { name: 'Review change' }).click();
  await expect(dialog.getByRole('heading', { name: 'Confirm salary change' })).toBeVisible();
  expect(state.updates).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Confirm update' }).click();
  await expect(page.getByText('Salary updated successfully')).toBeVisible();
  expect(state.updates[0]).toMatchObject({ base_salary: '85000.25', currency: 'USD', effective_date: '2026-11-01', confirmed: true });
  await page.getByRole('button', { name: /^Dianne Russell/ }).click();
  dialog = page.getByRole('dialog', { name: 'Employee compensation' });
  await dialog.getByRole('tab', { name: 'Salary history' }).click();
  await expect(dialog.getByText('Effective 1 Nov 2026')).toBeVisible();
  await expect(dialog.getByText('$85,000.25')).toBeVisible();
});

test('compensation stays separated by currency and history navigation works', async ({ page }) => {
  await workspace(page);
  await page.goto('/');
  await navigate(page, 'Compensation');
  await expect(page.getByRole('heading', { name: 'Compensation insights' })).toBeVisible();
  await page.getByRole('tab', { name: 'INR', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'INR', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.compensation-metrics')).toContainText('₹400,000.00');
  await navigate(page, 'Salary history');
  await expect(page.getByRole('combobox', { name: 'Employee', exact: true })).toHaveValue('1');
  await expect(page.getByText('No salary changes yet')).toBeVisible();
});

test('errors can be retried and empty search can be reset', async ({ page }) => {
  const state = await workspace(page);
  state.setFailure(true);
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Workspace temporarily unavailable');
  state.setFailure(false);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(8);
  await page.getByRole('textbox', { name: 'Search employees' }).fill('Nobody');
  await expect(page.getByText('No employees found')).toBeVisible();
  await page.getByRole('button', { name: 'Reset search' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(8);
});

test('appearance settings persist and the dialog closes using Escape', async ({ page }) => {
  await workspace(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Workspace settings', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Light', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

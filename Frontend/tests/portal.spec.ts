import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { AnomalyDetails, DataQualityScan, Employee, EmployeeInput, Insights, Metrics, RoleComparison, SalaryChange, SalaryDataAnomaly, SalaryReviewEmployee } from '../src/api';

function summarize(records: Employee[]): Insights {
  const country_headcounts: Record<string, number> = {};
  const currencies: Insights['currencies'] = {};
  const metrics = (employees: Employee[], currency: string): Metrics => {
    const salaries = employees.map((employee) => Number(employee.base_salary)).sort((a, b) => a - b);
    const limits = currency === 'INR' ? [500000, 1000000, 2000000] : [50000, 100000, 150000];
    const bounds = [0, ...limits, null];
    const total = salaries.reduce((sum, salary) => sum + salary, 0);
    return { headcount: employees.length, total_base_salary: total.toFixed(2), average_base_salary: (total / salaries.length).toFixed(2),
      monthly_payroll_estimate: (total / 12).toFixed(2), minimum_base_salary: salaries[0].toFixed(2), maximum_base_salary: salaries.at(-1)!.toFixed(2),
      median_base_salary: ((salaries[Math.floor((salaries.length - 1) / 2)] + salaries[Math.floor(salaries.length / 2)]) / 2).toFixed(2),
      salary_bands: bounds.slice(0, -1).map((lower, index) => ({ lower_bound: lower!.toFixed(2), upper_bound: bounds[index + 1]?.toFixed(2) ?? null,
        headcount: salaries.filter((salary) => salary >= lower! && (bounds[index + 1] === null || salary < bounds[index + 1]!)).length })),
    };
  };
  for (const record of records) country_headcounts[record.country] = (country_headcounts[record.country] || 0) + 1;
  for (const currency of new Set(records.map((record) => record.currency))) {
    const employees = records.filter((record) => record.currency === currency);
    const breakdown = (field: 'country' | 'department') => Object.fromEntries([...new Set(employees.map((employee) => employee[field]))]
      .map((value) => [value, metrics(employees.filter((employee) => employee[field] === value), currency)]));
    currencies[currency] = { ...metrics(employees, currency), by_country: breakdown('country'), by_department: breakdown('department') };
  }
  return { headcount: records.length, country_headcounts, currencies };
}

async function workspace(page: Page, signedIn = true) {
  const user = { id: 1, email: 'hr@employeeportal.test', name: 'HR Administrator', role: 'superadmin' };
  const token = 'ab'.repeat(32);
  const session = { user, token, expires_at: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString() };
  let validSession = true;
  let failVerification = false;
  const logins: { email: string; password: string }[] = [];
  if (signedIn) await page.addInitScript((value) => {
    sessionStorage.setItem('portal-session', JSON.stringify(value));
    localStorage.setItem('portal-view', 'employees');
  }, session);
  const names = ['Dianne Russell', 'Jane Cooper', 'Kristin Watson', 'Marvin McKinney', 'Eleanor Pena', 'Priya Sharma', 'Charles Zhao', 'Devon Lane', 'Alice Morgan', 'Bob Chen', 'Carla Jones', 'David Singh'];
  const records: Employee[] = names.map((name, index) => ({
    id: index + 1, employee_id: `EMP${2001 + index}`, name,
    department: ['Engineering', 'Design', 'People', 'Finance'][index % 4],
    designation: 'Software Engineer', status: index % 4 === 3 ? 'inactive' : 'active',
    country: index === 0 ? 'India' : ['United States', 'India', 'United Kingdom'][index % 3],
    currency: index === 4 ? 'USD' : ['USD', 'INR', 'GBP'][index % 3],
    base_salary: String(72000 + index * 2500), effective_date: '2026-10-01',
  }));
  const changes: SalaryChange[] = [];
  const reviewRecords: Employee[] = [100, 200, 300, 400, 1000].map((salary, index) => ({
    id: 201 + index, employee_id: `REVIEW${index}`, name: index === 4 ? 'Taylor Review' : `Review Employee ${index}`,
    department: 'Engineering', country: 'United States', designation: 'Software Engineer', status: 'active',
    base_salary: salary.toFixed(2), currency: 'USD', effective_date: '2026-10-01',
  }));
  for (let index = 0; index < 10; index++) reviewRecords.push({ ...reviewRecords[0], id: 300 + index, employee_id: `ROLE${index}`,
    name: `Role Employee ${index}`, country: 'India', department: 'Finance', currency: 'INR', designation: `Analyst ${index}`, base_salary: (25000 + index * 1000).toFixed(2) });
  const analysisQueries: URLSearchParams[] = [];
  let failAnalysis = false;
  const qualityRecords = records.map((record, index) => ({ ...record, id: 601 + index,
    employee_id: `CHECK${index}`, name: `Quality Employee ${index}`, base_salary: '0.00', status: 'active' as const }));
  const findings: SalaryDataAnomaly[] = [];
  const reviewEvents = new Map<number, AnomalyDetails['reviews']['data']>();
  const qualityQueries: URLSearchParams[] = [];
  let lastScan: DataQualityScan | null = null;
  let scanCalls = 0;
  let scanFailure = false;
  let qualityFailure = false;
  let reviewConflict = false;
  const updates: Record<string, unknown>[] = [];
  const creations: EmployeeInput[] = [];
  const queries: URLSearchParams[] = [];
  const insightQueries: URLSearchParams[] = [];
  let insightsOverride: Insights | undefined;
  let fail = false;

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/v1/session') {
      if (request.method() === 'POST') {
        const credentials = request.postDataJSON().session;
        logins.push(credentials);
        if (credentials.email !== user.email || credentials.password !== 'HrDemo!2026Access') {
          return route.fulfill({ status: 401, json: { errors: ['Email or password is incorrect'] } });
        }
        validSession = true;
        return route.fulfill({ status: 201, json: { data: session } });
      }
      if (!validSession || request.headers().authorization !== `Bearer ${token}`) {
        return route.fulfill({ status: 401, json: { errors: ['Please sign in to continue'] } });
      }
      if (request.method() === 'GET' && failVerification) return route.fulfill({ status: 503, json: { errors: ['Sign-in verification unavailable'] } });
      if (request.method() === 'DELETE') { validSession = false; return route.fulfill({ status: 204, body: '' }); }
      return route.fulfill({ json: { data: { user, expires_at: session.expires_at } } });
    }
    if (!validSession || request.headers().authorization !== `Bearer ${token}`) {
      return route.fulfill({ status: 401, json: { errors: ['Please sign in to continue'] } });
    }
    if (url.pathname.endsWith('/salary_data_quality_scans')) {
      scanCalls++;
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (scanFailure) return route.fulfill({ status: 503, json: { errors: ['Salary checks unavailable'] } });
      let added = 0; let cleared = 0;
      for (const employee of qualityRecords) {
        const existing = findings.find((finding) => finding.employee.id === employee.id && finding.active);
        if (Number(employee.base_salary) !== 0 && existing) { existing.active = false; existing.cleared_at = '2026-10-13T12:00:00Z'; cleared++; }
        if (Number(employee.base_salary) === 0 && !existing) {
          added++;
          findings.push({ id: findings.length + 1, employee: { ...employee }, rule_code: 'active_zero_salary',
            rule_name: 'Zero salary on an active employee', severity: 'warning',
            snapshot: { ...employee, updated_at: '2026-10-13T10:00:00Z' }, observed: { salary: '0.00', status: 'active' },
            reference: { expected: 'Review whether this active role is paid' }, active: true, source_stale: false,
            review_status: 'pending', review_notes: null, reviewed_by: null, reviewed_at: null,
            first_detected_at: '2026-10-13T12:00:00Z', last_checked_at: '2026-10-13T12:00:00Z', cleared_at: null });
        }
      }
      lastScan = { id: scanCalls, checked_employees: qualityRecords.length, detected_findings: findings.filter((finding) => finding.active).length,
        new_findings: added, affected_employees: findings.filter((finding) => finding.active).length, cleared_findings: cleared,
        started_at: '2026-10-13T12:00:00Z', completed_at: '2026-10-13T12:00:00Z' };
      return route.fulfill({ status: 201, json: { data: lastScan } });
    }
    if (url.pathname.includes('/salary_data_anomalies')) {
      if (qualityFailure) return route.fulfill({ status: 503, json: { errors: ['Data quality unavailable'] } });
      const id = Number(url.pathname.split('/')[4]);
      const current = Number(url.searchParams.get('page') || 1); const size = Number(url.searchParams.get('per_page') || 8);
      const meta = (count: number) => ({ page: current, per_page: size, total_count: count, total_pages: Math.ceil(count / size) });
      if (id) {
        const finding = findings.find((item) => item.id === id)!;
        if (request.method() === 'PATCH') {
          if (reviewConflict || finding.source_stale || !finding.active) return route.fulfill({ status: 409, json: { errors: ['Employee data changed. Run checks again before reviewing.'] } });
          const review = request.postDataJSON().review;
          const events = reviewEvents.get(id) || [];
          events.unshift({ id: events.length + 1, status: review.status, notes: review.notes, reviewed_at: '2026-10-13T12:05:00Z', reviewed_by: user });
          reviewEvents.set(id, events);
          Object.assign(finding, { review_status: review.status, review_notes: review.notes, reviewed_by: user, reviewed_at: '2026-10-13T12:05:00Z' });
          return route.fulfill({ json: { data: finding } });
        }
        const events = reviewEvents.get(id) || [];
        return route.fulfill({ json: { data: finding, reviews: { data: events.slice((current - 1) * size, current * size), meta: meta(events.length) } } });
      }
      qualityQueries.push(url.searchParams);
      const filtered = findings.filter((finding) => (finding.active || url.searchParams.get('include_cleared') === 'true') &&
        (!url.searchParams.get('review_status') || finding.review_status === url.searchParams.get('review_status')) &&
        ['country', 'department', 'status', 'currency'].every((field) => !url.searchParams.get(field) || finding.employee[field as keyof Employee] === url.searchParams.get(field)));
      return route.fulfill({ json: { data: filtered.slice((current - 1) * size, current * size), meta: { ...meta(filtered.length), last_scan: lastScan } } });
    }
    if (url.pathname.endsWith('/compensation_insights')) {
      insightQueries.push(url.searchParams);
      const filtered = records.filter((employee) => ['country', 'department', 'status'].every((field) =>
        !url.searchParams.get(field) || employee[field as keyof Employee] === url.searchParams.get(field)));
      return route.fulfill({ json: { data: insightsOverride || summarize(filtered) } });
    }
    if (url.pathname.endsWith('/salary_analysis')) {
      analysisQueries.push(url.searchParams);
      if (failAnalysis) return route.fulfill({ status: 503, json: { errors: ['Salary analysis temporarily unavailable'] } });
      const report = url.searchParams.get('report') || 'roles';
      const filtered = reviewRecords.filter((employee) => ['country', 'department', 'status', 'currency'].every((field) =>
        !url.searchParams.get(field) || employee[field as keyof Employee] === url.searchParams.get(field)));
      const groups = new Map<string, Employee[]>();
      for (const employee of filtered) {
        const key = JSON.stringify(report === 'below_department_average' ? [employee.department, employee.currency] : [employee.country, employee.designation, employee.currency]);
        groups.set(key, [...(groups.get(key) || []), employee]);
      }
      const rows: (RoleComparison | SalaryReviewEmployee)[] = [];
      for (const employees of groups.values()) {
        const metrics = summarize(employees).currencies[employees[0].currency];
        if (report === 'roles') {
          rows.push({ country: employees[0].country, designation: employees[0].designation, currency: employees[0].currency,
            headcount: employees.length, average_base_salary: metrics.average_base_salary, median_base_salary: metrics.median_base_salary,
            minimum_base_salary: metrics.minimum_base_salary, maximum_base_salary: metrics.maximum_base_salary,
            salary_gap: (Number(metrics.maximum_base_salary) - Number(metrics.minimum_base_salary)).toFixed(2) });
        } else {
          const salaries = employees.map((employee) => Number(employee.base_salary)).sort((a, b) => a - b);
          const q1 = salaries[Math.ceil(salaries.length * 0.25) - 1]; const q3 = salaries[Math.ceil(salaries.length * 0.75) - 1];
          const threshold = q3 > q1 ? q3 + 1.5 * (q3 - q1) : q3 * 1.5;
          const average = Number(metrics.average_base_salary);
          for (const employee of employees) {
            const salary = Number(employee.base_salary);
            if (report === 'outliers' ? employees.length >= 5 && salary > threshold : salary < average) {
              rows.push({ ...employee, comparison_headcount: employees.length, comparison_average: metrics.average_base_salary,
                comparison_threshold: report === 'outliers' ? threshold.toFixed(2) : undefined,
                salary_difference: (report === 'outliers' ? salary - threshold : average - salary).toFixed(2) });
            }
          }
        }
      }
      rows.sort((a, b) => 'id' in a && 'id' in b ? Number(b.base_salary) - Number(a.base_salary) || a.employee_id.localeCompare(b.employee_id)
        : `${a.country} ${a.designation} ${a.currency}`.localeCompare(`${b.country} ${b.designation} ${b.currency}`));
      const current = Number(url.searchParams.get('page') || 1); const size = Number(url.searchParams.get('per_page') || 25);
      return route.fulfill({ json: { data: rows.slice((current - 1) * size, current * size), meta: {
        report, page: current, per_page: size, total_count: rows.length, total_pages: Math.ceil(rows.length / size), minimum_peer_count: report === 'outliers' ? 5 : null,
      } } });
    }
    if (url.pathname.endsWith('/salary_history')) return route.fulfill({ json: { data: changes } });
    if (request.method() === 'POST' && url.pathname === '/api/v1/employees') {
      const employee = request.postDataJSON().employee as EmployeeInput;
      creations.push(employee);
      if (records.some((record) => record.employee_id === employee.employee_id)) {
        return route.fulfill({ status: 422, json: { errors: { employee_id: ['has already been taken'] } } });
      }
      const record = { ...employee, id: records.length + 1 };
      records.push(record);
      return route.fulfill({ status: 201, json: { data: record } });
    }
    if (request.method() === 'PATCH') {
      const salary = request.postDataJSON().salary;
      updates.push(salary);
      const employee = [...records, ...reviewRecords, ...qualityRecords].find((record) => url.pathname === `/api/v1/employees/${record.id}/salary`)!;
      changes.unshift({ id: changes.length + 1, old_base_salary: employee.base_salary, new_base_salary: salary.base_salary,
        old_currency: employee.currency, new_currency: salary.currency, old_effective_date: employee.effective_date,
        effective_date: salary.effective_date, changed_at: '2026-10-12T12:00:00Z' });
      Object.assign(employee, salary);
      for (const finding of findings.filter((finding) => finding.employee.id === employee.id)) { finding.employee = { ...employee }; finding.source_stale = true; }
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
  return { updates, creations, queries, insightQueries, logins, expireSession: () => { validSession = false; },
    findings, reviewEvents, qualityQueries, getScanCalls: () => scanCalls,
    setScanFailure: (value: boolean) => { scanFailure = value; }, setQualityFailure: (value: boolean) => { qualityFailure = value; },
    setReviewConflict: (value: boolean) => { reviewConflict = value; },
    analysisQueries, setAnalysisFailure: (value: boolean) => { failAnalysis = value; },
    setInsights: (value: Insights) => { insightsOverride = value; },
    setVerificationFailure: (value: boolean) => { failVerification = value; }, setFailure: (value: boolean) => { fail = value; } };
}

async function navigate(page: Page, label: string) {
  if (await page.getByRole('button', { name: 'Open navigation' }).isVisible()) {
    await page.getByRole('button', { name: 'Open navigation' }).click();
  }
  await page.locator('.main-navigation').getByRole('button', { name: label, exact: true }).click();
}

async function checkedQuality(page: Page) {
  const state = await workspace(page);
  await page.goto('/');
  await navigate(page, 'Data quality');
  await expect(page.getByText('No checks run yet', { exact: true })).toBeVisible();
  expect(state.getScanCalls()).toBe(0);
  await page.getByRole('button', { name: 'Run checks', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Salary data findings' })).toBeVisible();
  return state;
}

test('salary data checks run manually, paginate and preserve findings on repeat scans', async ({ page }, info) => {
  const state = await checkedQuality(page);
  await expect(page.getByText('Checks complete: 12 new, 0 cleared.', { exact: true })).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(8);
  await page.getByRole('button', { name: 'Next findings page' }).click();
  await expect(page.getByText('Showing 9-12 of 12')).toBeVisible();
  await page.getByRole('button', { name: 'Run checks', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Checking...', exact: true })).toBeDisabled();
  await expect(page.getByText('Checks complete: 0 new, 0 cleared.', { exact: true })).toBeVisible();
  expect(state.getScanCalls()).toBe(2);
  expect(state.findings).toHaveLength(12);
  await expect(page.getByText('Showing 1-8 of 12')).toBeVisible();
  for (const width of [1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const reviewButton = page.getByRole('button', { name: 'Review Quality Employee 0: Zero salary on an active employee', exact: true });
    const bounds = await reviewButton.boundingBox();
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: info.outputPath(`data-quality-${width}.png`), fullPage: true });
  }
});

test('HR decisions require notes, persist, and display the review audit history', async ({ page }, info) => {
  const state = await checkedQuality(page);
  await page.getByRole('button', { name: 'Review Quality Employee 0: Zero salary on an active employee', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Salary data review' });
  await expect(dialog.getByRole('heading', { name: 'Observed', exact: true })).toBeVisible();
  await dialog.getByRole('combobox', { name: 'Decision', exact: true }).selectOption('legitimate');
  await dialog.getByRole('button', { name: 'Save decision' }).click();
  await expect(dialog).toBeVisible();
  expect(state.reviewEvents.size).toBe(0);
  await dialog.getByRole('textbox', { name: 'Review notes', exact: true }).fill('   ');
  await dialog.getByRole('button', { name: 'Save decision' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Notes are required for this decision.');
  expect(state.reviewEvents.size).toBe(0);
  await dialog.getByRole('textbox', { name: 'Review notes', exact: true }).fill('Unpaid placement verified by HR');
  await dialog.getByRole('button', { name: 'Save decision' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('HR decision saved.', { exact: true })).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(8);
  expect(state.reviewEvents.get(1)).toHaveLength(1);
  await page.getByRole('combobox', { name: 'Review status' }).selectOption('legitimate');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: 'Review Quality Employee 0: Zero salary on an active employee', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: 'Review notes', exact: true })).toHaveValue('Unpaid placement verified by HR');
  await expect(dialog.locator('.quality-audit')).toContainText('Unpaid placement verified by HR');
  await expect(dialog.locator('.quality-audit')).toContainText('HR Administrator');
  await dialog.getByRole('textbox', { name: 'Review notes', exact: true }).focus();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('combobox', { name: 'Decision', exact: true })).toBeFocused();
  await page.screenshot({ path: info.outputPath('data-quality-review.png'), fullPage: true });
  await dialog.getByRole('button', { name: 'Close Salary data review' }).click();
  await page.getByRole('button', { name: 'Run checks', exact: true }).click();
  await expect(page.getByText('Checks complete: 0 new, 0 cleared.', { exact: true })).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(1);
});

test('data-quality filters combine currency, country, department and employee status', async ({ page }) => {
  const state = await checkedQuality(page);
  await page.getByRole('combobox', { name: 'Data quality currency' }).selectOption('USD');
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Filter employees' });
  await dialog.getByRole('combobox', { name: 'Country', exact: true }).selectOption('United States');
  await dialog.getByRole('combobox', { name: 'Department', exact: true }).selectOption('Engineering');
  await dialog.getByRole('combobox', { name: 'Status', exact: true }).selectOption('active');
  await dialog.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByText('No findings match these filters', { exact: true })).toBeVisible();
  expect(state.qualityQueries.some((query) => query.get('currency') === 'USD' && query.get('country') === 'United States' && query.get('department') === 'Engineering' && query.get('status') === 'active')).toBe(true);
});

test('correcting a salary clears its flag only after a rescan and retains the finding for review', async ({ page }) => {
  const state = await checkedQuality(page);
  await page.getByRole('button', { name: 'Review Quality Employee 0: Zero salary on an active employee', exact: true }).click();
  await page.getByRole('dialog', { name: 'Salary data review' }).getByRole('button', { name: 'Employee salary', exact: true }).click();
  const salary = page.getByRole('dialog', { name: 'Employee compensation' });
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await salary.getByRole('spinbutton', { name: 'Base salary', exact: true }).fill('100');
  await salary.getByRole('button', { name: 'Review change' }).click();
  await salary.getByRole('button', { name: 'Confirm update' }).click();
  await expect(salary).toHaveCount(0);
  await expect(page.getByText('Needs rescan', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Review Quality Employee 0: Zero salary on an active employee', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Save decision' })).toBeDisabled();
  await page.getByRole('button', { name: 'Close Salary data review' }).click();
  await page.getByRole('button', { name: 'Run checks', exact: true }).click();
  await expect(page.getByText('Checks complete: 0 new, 1 cleared.', { exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Include cleared' }).check();
  await expect(page.getByText('Cleared', { exact: true })).toBeVisible();
  expect(state.findings[0].active).toBe(false);
  expect(state.updates).toHaveLength(1);
});

test('a stale review conflict preserves the draft and disables further review submissions', async ({ page }) => {
  const state = await checkedQuality(page);
  state.setReviewConflict(true);
  await page.getByRole('button', { name: 'Review Quality Employee 0: Zero salary on an active employee', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Salary data review' });
  await dialog.getByRole('combobox', { name: 'Decision', exact: true }).selectOption('investigating');
  await dialog.getByRole('textbox', { name: 'Review notes', exact: true }).fill('Please verify the source');
  await dialog.getByRole('button', { name: 'Save decision' }).click();
  await expect(dialog.getByRole('button', { name: 'Save decision' })).toBeDisabled();
  await expect(dialog.getByRole('textbox', { name: 'Review notes', exact: true })).toHaveValue('Please verify the source');
  expect(state.reviewEvents.size).toBe(0);
});

test('salary checks and list failures can be retried without losing existing results', async ({ page }) => {
  const state = await checkedQuality(page);
  state.setScanFailure(true);
  await page.getByRole('button', { name: 'Run checks', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Salary checks unavailable');
  await expect(page.locator('tbody tr')).toHaveCount(8);
  state.setScanFailure(false);
  await page.getByRole('button', { name: 'Run checks', exact: true }).click();
  await expect(page.getByText('Checks complete: 0 new, 0 cleared.', { exact: true })).toBeVisible();
  state.setQualityFailure(true);
  await page.getByRole('button', { name: 'Refresh workspace' }).click();
  await expect(page.getByRole('alert')).toContainText('Data quality unavailable');
  await expect(page.getByRole('table')).toHaveCount(0);
  state.setQualityFailure(false);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('table', { name: 'Salary data findings' })).toBeVisible();
});

test('session expiry removes the protected data-quality screen', async ({ page }) => {
  const state = await checkedQuality(page);
  state.expireSession();
  await page.getByRole('button', { name: 'Run checks', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Salary data findings' })).toHaveCount(0);
  expect(state.getScanCalls()).toBe(1);
});

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
  await expect(page.locator('.compensation-metrics')).toContainText('₹261,000.00');
  await navigate(page, 'Salary history');
  await expect(page.getByRole('combobox', { name: 'Employee', exact: true })).toHaveValue('1');
  await expect(page.getByText('No salary changes yet')).toBeVisible();
});

test('overview reports annual averages per currency and consolidated country headcounts', async ({ page }) => {
  await workspace(page);
  await page.goto('/');
  await navigate(page, 'Overview');
  const currencies = page.locator('.overview-currencies tbody');
  await expect(currencies.getByRole('row').filter({ hasText: 'USD' })).toContainText('$83,000.00');
  await expect(currencies.getByRole('row').filter({ hasText: 'INR' })).toContainText('₹87,000.00');
  const counts = page.getByRole('table', { name: 'Country headcount', exact: true });
  await expect(counts.locator('tbody tr').first()).toContainText('India');
  await expect(counts.locator('tbody tr').first().locator('td').nth(1)).toHaveText('5');
  await expect(counts.locator('tfoot')).toContainText('12');
  await expect(counts.locator('tbody')).toContainText('41.7%');
});

test('monthly estimates and lowest/highest salaries are visible in overview and compensation', async ({ page }) => {
  await workspace(page);
  await page.goto('/');
  await navigate(page, 'Overview');
  const usd = page.getByRole('table', { name: 'Compensation summary' }).locator('tbody tr').filter({ hasText: 'USD' });
  await expect(usd).toContainText('$34,583.33');
  await expect(usd).toContainText('$72,000.00');
  await expect(usd).toContainText('$94,500.00');
  await navigate(page, 'Compensation');
  const range = page.getByRole('region', { name: 'Payroll estimate and salary range' });
  await expect(range).toContainText('$34,583.33');
  await expect(range).toContainText('$72,000.00');
  await expect(range).toContainText('$94,500.00');
  await page.getByRole('tab', { name: 'INR', exact: true }).click();
  await expect(range).toContainText('₹21,750.00');
  await expect(range).toContainText('₹74,500.00');
  await expect(range).not.toContainText('$');
});

test('role comparisons paginate groups and expose same-role salary ranges without mixing currencies', async ({ page }, info) => {
  const state = await workspace(page);
  await page.goto('/');
  await navigate(page, 'Salary analysis');
  const table = page.getByRole('table', { name: 'Role comparisons', exact: true });
  await expect(table.locator('tbody tr')).toHaveCount(8);
  await expect(page.getByText('Showing 1-8 of 11', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next analysis page' }).click();
  await expect(page.getByText('Showing 9-11 of 11', { exact: true })).toBeVisible();
  await expect(table.locator('tbody tr')).toHaveCount(3);
  await page.getByRole('combobox', { name: 'Analysis currency' }).selectOption('USD');
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table.locator('tbody')).toContainText('Software Engineer');
  await expect(table.locator('tbody')).toContainText('$400.00');
  await expect(table.locator('tbody')).toContainText('$900.00');
  await expect(page.getByText('Page 1 of 1', { exact: true })).toBeVisible();
  expect(state.analysisQueries.some((query) => query.get('page') === '2')).toBe(true);
  await page.screenshot({ path: info.outputPath('role-comparisons.png'), fullPage: true });
});

test('high salary outliers show a threshold and can be reviewed through the existing salary drawer', async ({ page }, info) => {
  const state = await workspace(page);
  await page.goto('/');
  await navigate(page, 'Salary analysis');
  await page.getByRole('tab', { name: 'High salary outliers', exact: true }).click();
  const table = page.getByRole('table', { name: 'High salary outliers', exact: true });
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table.locator('tbody')).toContainText('Taylor Review');
  await expect(table.locator('tbody')).toContainText('$700.00');
  await expect(table.locator('tbody')).toContainText('$300.00');
  await expect(page.getByText('HR review indicators, not conclusions about unfair pay.')).toBeVisible();
  await page.screenshot({ path: info.outputPath('salary-outliers.png'), fullPage: true });
  await page.getByRole('button', { name: /^Taylor Review/ }).click();
  const drawer = page.getByRole('dialog', { name: 'Employee compensation' });
  await expect(drawer.getByLabel('Base salary', { exact: true })).toHaveValue('1000.00');
  await drawer.getByLabel('Base salary', { exact: true }).fill('400');
  await drawer.getByLabel('Effective date', { exact: true }).fill('2026-11-01');
  await drawer.getByRole('button', { name: 'Review change' }).click();
  await drawer.getByRole('button', { name: 'Confirm update' }).click();
  await expect(drawer).toHaveCount(0);
  await expect(page.getByText('No high salary outliers found')).toBeVisible();
  expect(state.updates).toHaveLength(1);
});

test('below-average employees have a currency-specific baseline and support combined filters', async ({ page }) => {
  const state = await workspace(page);
  await page.goto('/');
  await navigate(page, 'Salary analysis');
  await page.getByRole('combobox', { name: 'Analysis currency' }).selectOption('USD');
  await page.getByRole('tab', { name: 'Below department average', exact: true }).click();
  const table = page.getByRole('table', { name: 'Below department average', exact: true });
  await expect(table.locator('tbody tr')).toHaveCount(3);
  await expect(table.locator('tbody tr').first()).toContainText('$400.00');
  await expect(table.locator('tbody tr').first()).toContainText('$100.00');
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Filter employees' });
  await dialog.getByRole('combobox', { name: 'Country', exact: true }).selectOption('United States');
  await dialog.getByRole('combobox', { name: 'Department', exact: true }).selectOption('Engineering');
  await dialog.getByRole('combobox', { name: 'Status', exact: true }).selectOption('active');
  await dialog.getByRole('button', { name: 'Apply filters' }).click();
  await expect(table.locator('tbody tr')).toHaveCount(3);
  expect(state.analysisQueries.some((query) => query.get('currency') === 'USD' && query.get('country') === 'United States' && query.get('department') === 'Engineering' && query.get('status') === 'active')).toBe(true);
  await page.getByRole('tab', { name: 'High salary outliers', exact: true }).click();
  await page.getByRole('combobox', { name: 'Analysis currency' }).selectOption('GBP');
  await expect(page.getByText('No high salary outliers found')).toBeVisible();
});

test('salary analysis network errors can be retried without exposing a stale report', async ({ page }) => {
  const state = await workspace(page);
  state.setAnalysisFailure(true);
  await page.goto('/');
  await navigate(page, 'Salary analysis');
  await expect(page.getByRole('alert')).toContainText('Salary analysis temporarily unavailable');
  await expect(page.getByRole('table')).toHaveCount(0);
  state.setAnalysisFailure(false);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('table', { name: 'Role comparisons' })).toBeVisible();
});

test('country and department rankings switch between expenditure, average salary and headcount', async ({ page }, info) => {
  await workspace(page);
  await page.goto('/');
  await navigate(page, 'Compensation');
  const departments = page.getByRole('table', { name: 'Department salary rankings', exact: true });
  const countries = page.getByRole('table', { name: 'Country salary rankings', exact: true });
  await expect(departments.locator('tbody tr').first()).toContainText('Engineering');
  await expect(departments.locator('tbody tr').first()).toContainText('$154,000.00');
  await expect(countries.locator('tbody tr').first()).toContainText('United States');
  await page.getByRole('combobox', { name: 'Rank departments by' }).selectOption('average_base_salary');
  await expect(departments.locator('tbody tr').first()).toContainText('Design');
  await expect(departments.locator('tbody tr').first()).toContainText('$94,500.00');
  await expect(departments.locator('tbody tr').first().locator('td').first()).toHaveText('1');
  await page.getByRole('combobox', { name: 'Rank departments by' }).selectOption('headcount');
  await expect(departments.locator('tbody tr').first()).toContainText('Engineering');
  await page.getByRole('combobox', { name: 'Rank countries by' }).selectOption('average_base_salary');
  await expect(countries.locator('tbody tr').first()).toContainText('$87,000.00');
  await page.screenshot({ path: info.outputPath('compensation-rankings.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('department salary bands keep currency boundaries and include zero-count bands', async ({ page }) => {
  await workspace(page);
  await page.goto('/');
  await navigate(page, 'Compensation');
  const bands = page.getByRole('table', { name: 'Department salary bands', exact: true });
  await expect(bands.locator('thead')).toContainText('Under $50,000.00');
  const engineering = bands.locator('tbody tr').filter({ hasText: 'Engineering' });
  await expect(engineering.locator('td')).toHaveText(['Engineering', '2', '0', '2', '0', '0']);
  await expect(bands.locator('tfoot td')).toHaveText(['5', '0', '5', '0', '0']);
  await page.getByRole('tab', { name: 'INR', exact: true }).click();
  await expect(bands.locator('thead')).toContainText('Under ₹500,000.00');
  await expect(bands.locator('tfoot td')).toHaveText(['3', '3', '0', '0', '0']);
  await expect(page.locator('.compensation-metrics')).toContainText('Annual average | INR');
  const counts = page.getByRole('table', { name: 'Country headcount', exact: true });
  await expect(counts.locator('tfoot')).toContainText('12');
});

test('rankings retain cent precision for large amounts and break equal-value ties by name', async ({ page }) => {
  const state = await workspace(page);
  const summary = summarize([{ id: 1, employee_id: 'EMP1', name: 'Test User', department: 'Engineering', country: 'India',
    designation: 'Engineer', status: 'active', currency: 'USD', base_salary: '72000.00', effective_date: '2026-10-01' }]);
  const group = summary.currencies.USD;
  const low = { ...group.by_department.Engineering, total_base_salary: '9007199254740992.01', average_base_salary: '9007199254740992.01' };
  const high = { ...low, total_base_salary: '9007199254740992.02', average_base_salary: '9007199254740992.02' };
  group.by_department = { Engineering: low, Sales: high, Finance: high };
  state.setInsights(summary);
  await page.goto('/');
  await navigate(page, 'Compensation');
  const rows = page.getByRole('table', { name: 'Department salary rankings', exact: true }).locator('tbody tr td:nth-child(2)');
  await expect(rows).toHaveText(['Finance', 'Sales', 'Engineering']);
  await page.getByRole('combobox', { name: 'Rank departments by' }).selectOption('average_base_salary');
  await expect(rows).toHaveText(['Finance', 'Sales', 'Engineering']);
  await page.getByRole('combobox', { name: 'Rank departments by' }).selectOption('headcount');
  await expect(rows).toHaveText(['Engineering', 'Finance', 'Sales']);
});

test('compensation filters update every report and recover from an empty scope', async ({ page }) => {
  const state = await workspace(page);
  await page.goto('/');
  await navigate(page, 'Compensation');
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Filter employees' });
  await dialog.getByRole('combobox', { name: 'Country', exact: true }).selectOption('India');
  await dialog.getByRole('combobox', { name: 'Department', exact: true }).selectOption('Engineering');
  await dialog.getByRole('combobox', { name: 'Status', exact: true }).selectOption('active');
  await dialog.getByRole('button', { name: 'Apply filters' }).click();
  const counts = page.getByRole('table', { name: 'Country headcount', exact: true });
  await expect(counts.locator('tbody td')).toHaveText(['India', '2', '100.0%']);
  await expect(page.getByRole('table', { name: 'Department salary bands' }).locator('tfoot td')).toHaveText(['2', '0', '2', '0', '0']);
  expect(state.insightQueries.some((query) => query.get('country') === 'India' && query.get('department') === 'Engineering' && query.get('status') === 'active')).toBe(true);
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Filter employees' });
  await dialog.getByRole('combobox', { name: 'Status', exact: true }).selectOption('inactive');
  await dialog.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByText('No compensation records found')).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Filter employees' });
  await dialog.getByRole('button', { name: 'Reset', exact: true }).click();
  await dialog.getByRole('button', { name: 'Apply filters' }).click();
  await expect(counts.locator('tfoot')).toContainText('12');
});

test('a confirmed salary update refreshes department bands and average rankings', async ({ page }) => {
  await workspace(page);
  await page.goto('/');
  await page.getByRole('button', { name: /^Dianne Russell/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Employee compensation' });
  await dialog.getByLabel('Base salary', { exact: true }).fill('150000');
  await dialog.getByLabel('Effective date', { exact: true }).fill('2026-11-01');
  await dialog.getByRole('button', { name: 'Review change' }).click();
  await dialog.getByRole('button', { name: 'Confirm update' }).click();
  await expect(dialog).toHaveCount(0);
  await navigate(page, 'Compensation');
  const engineering = page.getByRole('table', { name: 'Department salary bands' }).locator('tbody tr').filter({ hasText: 'Engineering' });
  await expect(engineering.locator('td')).toHaveText(['Engineering', '2', '0', '1', '0', '1']);
  await page.getByRole('combobox', { name: 'Rank departments by' }).selectOption('average_base_salary');
  await expect(page.getByRole('table', { name: 'Department salary rankings' }).locator('tbody tr').first()).toContainText('$116,000.00');
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

async function fillEmployee(page: Page, employeeId = 'EMP3001') {
  const dialog = page.getByRole('dialog', { name: 'New employee', exact: true });
  await dialog.getByRole('textbox', { name: 'Employee ID', exact: true }).fill(employeeId);
  await dialog.getByRole('textbox', { name: 'Full name', exact: true }).fill('  Nora Patel  ');
  await dialog.getByRole('textbox', { name: 'Department', exact: true }).fill('Engineering');
  await dialog.getByRole('textbox', { name: 'Designation', exact: true }).fill('Software Engineer');
  await dialog.getByRole('textbox', { name: 'Country', exact: true }).fill('India');
  await dialog.getByRole('combobox', { name: 'Status', exact: true }).selectOption('inactive');
  await dialog.getByRole('spinbutton', { name: 'Base salary', exact: true }).fill('85000.25');
  await dialog.getByRole('combobox', { name: 'Currency', exact: true }).selectOption('INR');
  await dialog.getByLabel('Effective date', { exact: true }).fill('2026-11-01');
  return dialog;
}

test('new employee is saved and displayed after clearing previous directory filters', async ({ page }, info) => {
  const state = await workspace(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByText('Showing 9-12 of 12')).toBeVisible();
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('dialog').getByRole('combobox', { name: 'Country', exact: true }).selectOption('United States');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await page.getByRole('button', { name: 'New employee', exact: true }).click();
  const dialog = await fillEmployee(page);
  await page.screenshot({ path: info.outputPath('new-employee.png'), fullPage: true });
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await dialog.getByRole('button', { name: 'Add employee', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Nora Patel added successfully')).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody tr')).toContainText('Nora Patel');
  await expect(page.locator('tbody tr')).toContainText('Inactive');
  expect(state.creations).toEqual([{ employee_id: 'EMP3001', name: 'Nora Patel', department: 'Engineering',
    designation: 'Software Engineer', country: 'India', status: 'inactive', base_salary: '85000.25',
    currency: 'INR', effective_date: '2026-11-01' }]);
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(page.getByRole('heading', { name: '13 employees', exact: true })).toBeVisible();
  await navigate(page, 'Overview');
  await expect(page.locator('.metric').first()).toContainText('13');
});

test('creation validates required and whitespace-only details without sending requests', async ({ page }) => {
  const state = await workspace(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'New employee', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New employee', exact: true });
  await dialog.getByRole('button', { name: 'Add employee', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: 'Employee ID', exact: true })).toBeFocused();
  await fillEmployee(page, '   ');
  await dialog.getByRole('button', { name: 'Add employee', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: 'Employee ID', exact: true })).toHaveAttribute('aria-invalid', 'true');
  expect(state.creations).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.creations).toHaveLength(0);
});

test('duplicate ID errors preserve the form and allow a corrected submission', async ({ page }) => {
  const state = await workspace(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'New employee', exact: true }).click();
  const dialog = await fillEmployee(page, 'EMP2001');
  await dialog.getByRole('button', { name: 'Add employee', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('has already been taken');
  await expect(dialog.getByRole('textbox', { name: 'Employee ID', exact: true })).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog.getByRole('textbox', { name: 'Employee ID', exact: true })).toBeFocused();
  await expect(dialog.getByRole('textbox', { name: 'Full name', exact: true })).toHaveValue('  Nora Patel  ');
  await dialog.getByRole('textbox', { name: 'Employee ID', exact: true }).fill('EMP3002');
  await dialog.getByRole('button', { name: 'Add employee', exact: true }).click();
  await expect(page.getByText('Nora Patel added successfully')).toBeVisible();
  expect(state.creations).toHaveLength(2);
});

test('signed-out visitors see the login screen without fetching employee data', async ({ page }, info) => {
  const state = await workspace(page, false);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Email', exact: true })).toBeVisible();
  await expect(page.locator('.workspace')).toHaveCount(0);
  expect(state.queries).toHaveLength(0);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  expect(state.logins).toHaveLength(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('login.png'), fullPage: true });
});

test('HR login reports invalid credentials then opens the dashboard with an authenticated session', async ({ page }) => {
  const state = await workspace(page, false);
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('hr@employeeportal.test');
  await page.getByLabel('Password', { exact: true }).fill('wrong password');
  await page.getByRole('button', { name: 'Show password', exact: true }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide password', exact: true }).click();
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Email or password is incorrect');
  await page.getByLabel('Password', { exact: true }).fill('HrDemo!2026Access');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('.page-heading h1')).toHaveText('Overview');
  await expect(page.locator('.metric').first()).toContainText('12');
  await expect(page.locator('.profile')).toContainText('HR Administrator');
  expect(state.logins).toHaveLength(2);
  await navigate(page, 'Employees');
  await expect(page.locator('tbody tr')).toHaveCount(8);
  await page.reload();
  await expect(page.locator('tbody tr')).toHaveCount(8);
  expect(await page.evaluate(() => localStorage.getItem('portal-session'))).toBeNull();
});

test('signing out revokes the session and hides cached employee data', async ({ page }) => {
  await workspace(page, false);
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('hr@employeeportal.test');
  await page.getByLabel('Password', { exact: true }).fill('HrDemo!2026Access');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('.metric').first()).toContainText('12');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByText('You have signed out.')).toBeVisible();
  await expect(page.locator('.workspace')).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem('portal-session'))).toBeNull();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
});

test('an expired server session returns to sign-in and clears cached credentials', async ({ page }) => {
  const state = await workspace(page);
  await page.goto('/');
  await expect(page.locator('tbody tr')).toHaveCount(8);
  state.expireSession();
  await page.getByRole('button', { name: 'Refresh workspace', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('session has expired');
  await expect(page.locator('tbody')).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem('portal-session'))).toBeNull();
});

test('restored sessions do not expose the workspace until server verification succeeds', async ({ page }) => {
  const state = await workspace(page);
  state.setVerificationFailure(true);
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Sign-in verification unavailable');
  await expect(page.locator('.workspace')).toHaveCount(0);
  expect(state.queries).toHaveLength(0);
  state.setVerificationFailure(false);
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(8);
});

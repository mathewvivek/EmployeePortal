import { expect, test } from '@playwright/test';
import { build } from 'vite';
import type { RollupOutput } from 'rollup';
import type { api as apiClient } from '../src/api';
import { fileURLToPath } from 'node:url';

async function loadApi(baseUrl?: string): Promise<{ api: typeof apiClient; setAuthToken: (token?: string) => void }> {
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    define: { 'import.meta.env.VITE_API_BASE_URL': baseUrl === undefined ? 'undefined' : JSON.stringify(baseUrl) },
    build: {
      write: false,
      minify: false,
      lib: { entry: fileURLToPath(new URL('../src/api.ts', import.meta.url)), formats: ['es'] },
    },
  });
  const output = (result as RollupOutput[])[0].output;
  const chunk = output.find((item) => item.type === 'chunk');
  if (!chunk || chunk.type !== 'chunk') throw new Error('API build did not produce JavaScript');
  const module = await import(`data:text/javascript;base64,${Buffer.from(chunk.code).toString('base64')}`);
  return module;
}

async function requests(baseUrl: string | undefined, run: (api: typeof apiClient) => Promise<void>, token?: string) {
  const { api, setAuthToken } = await loadApi(baseUrl);
  setAuthToken(token);
  const calls: { url: string; options?: RequestInit }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (input, options) => {
    calls.push({ url: String(input), options });
    if (options?.method === 'DELETE') return new Response(null, { status: 204 });
    return new Response(JSON.stringify({ data: [], meta: {} }), { headers: { 'Content-Type': 'application/json' } });
  };
  try { await run(api); } finally { globalThis.fetch = original; }
  return calls;
}

for (const baseUrl of [undefined, '', '   ']) {
  test(`API uses the same-origin proxy when its base URL is ${JSON.stringify(baseUrl)}`, async () => {
    const calls = await requests(baseUrl, (api) => api.employees({ page: 1 }).then(() => undefined));
    expect(calls[0].url).toBe('/api/v1/employees?page=1');
  });
}

test('all API operations use the configured prefix without duplicate slashes', async () => {
  const calls = await requests(' https://api.example.invalid/api/v1/ ', async (api) => {
    await api.employees({ q: 'Alice Morgan', page: 2 });
    await api.insights();
    await api.history(7);
    await api.createEmployee({ employee_id: 'EMP_NEW', name: 'Alice Morgan', department: 'Engineering',
      country: 'India', designation: 'Engineer', status: 'active', base_salary: '100.25', currency: 'INR', effective_date: '2026-10-12' });
    await api.updateSalary(7, { base_salary: '200.50', currency: 'INR', effective_date: '2026-11-01', confirmed: true });
  });
  expect(calls.map(({ url }) => url)).toEqual([
    'https://api.example.invalid/api/v1/employees?q=Alice+Morgan&page=2',
    'https://api.example.invalid/api/v1/compensation_insights?',
    'https://api.example.invalid/api/v1/employees/7/salary_history',
    'https://api.example.invalid/api/v1/employees',
    'https://api.example.invalid/api/v1/employees/7/salary',
  ]);
  expect(calls[3].options?.method).toBe('POST');
  expect(JSON.parse(calls[3].options?.body as string).employee.employee_id).toBe('EMP_NEW');
  expect(calls[4].options?.method).toBe('PATCH');
  expect(JSON.parse(calls[4].options?.body as string).salary.confirmed).toBe(true);
});

test('authenticated requests carry bearer tokens but login never sends an old token', async () => {
  const calls = await requests('https://api.example.invalid/api/v1', async (api) => {
    await api.login('hr@example.com', 'ExampleHR!2026Access');
    await api.session();
    await api.employees({});
    await api.logout();
  }, 'test-token');
  expect(new Headers(calls[0].options?.headers).get('Authorization')).toBeNull();
  expect(JSON.parse(calls[0].options?.body as string).session.email).toBe('hr@example.com');
  for (const call of calls.slice(1)) expect(new Headers(call.options?.headers).get('Authorization')).toBe('Bearer test-token');
  expect(calls[3].options?.method).toBe('DELETE');
});

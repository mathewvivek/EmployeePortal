export interface Employee {
  id: number;
  employee_id: string;
  name: string;
  department: string;
  country: string;
  designation: string;
  status: 'active' | 'inactive';
  base_salary: string;
  currency: string;
  effective_date: string;
}

export type EmployeeInput = Omit<Employee, 'id'>;

export class ApiError extends Error {
  constructor(message: string, public fieldErrors: Record<string, string[]> = {}) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface SalaryChange {
  id: number;
  old_base_salary: string;
  new_base_salary: string;
  old_currency: string;
  new_currency: string;
  old_effective_date: string;
  effective_date: string;
  changed_at: string;
}

export interface Metrics {
  headcount: number;
  total_base_salary: string;
  average_base_salary: string;
  median_base_salary: string;
}

export interface CurrencyMetrics extends Metrics {
  by_country: Record<string, Metrics>;
  by_department: Record<string, Metrics>;
}

export interface Insights {
  headcount: number;
  currencies: Record<string, CurrencyMetrics>;
}

export interface Filters { country: string; department: string; status: string }
export interface Directory {
  data: Employee[];
  meta: { page: number; per_page: number; total_count: number; total_pages: number };
}

type Query = Record<string, string | number | undefined>;

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const apiBaseUrl = (API_BASE_URL?.trim() || '/api/v1').replace(/\/+$/, '');

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, options);
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch {
    throw new Error('The workspace is unavailable. Please try again.');
  }
  if (!response.ok) {
    const errors = body.errors;
    const message = Array.isArray(errors) ? errors.join(', ')
      : errors && typeof errors === 'object'
        ? Object.entries(errors).map(([field, values]) => `${field.replaceAll('_', ' ')} ${Array.isArray(values) ? values.join(', ') : values}`).join('; ')
        : 'The request could not be completed.';
    throw new ApiError(message, errors && !Array.isArray(errors) && typeof errors === 'object' ? errors : {});
  }
  return body as T;
}

function queryString(params: Query): string {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  return query.toString();
}

export const api = {
  createEmployee: (employee: EmployeeInput) => request<{ data: Employee }>('/employees', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employee }),
  }),
  employees: (params: Query, signal?: AbortSignal) => request<Directory>(`/employees?${queryString(params)}`, { signal }),
  insights: (params: Query = {}, signal?: AbortSignal) => request<{ data: Insights }>(`/compensation_insights?${queryString(params)}`, { signal }),
  history: (id: number, signal?: AbortSignal) => request<{ data: SalaryChange[] }>(`/employees/${id}/salary_history`, { signal }),
  updateSalary: (id: number, salary: { base_salary: string; currency: string; effective_date: string; confirmed: true }) =>
    request<{ data: Pick<Employee, 'base_salary' | 'currency' | 'effective_date'> }>(`/employees/${id}/salary`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ salary }),
    }),
};

export const currencies = ['INR', 'USD', 'GBP', 'EUR', 'JPY'];
export const emptyFilters: Filters = { country: '', department: '', status: '' };
export const money = (amount: string, currency: string) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(Number(amount));
export const dateLabel = (date: string) => new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric',
}).format(new Date(`${date}T12:00:00`));
export const initials = (name: string) => name.split(' ').map((part) => part[0]).slice(0, 2).join('');

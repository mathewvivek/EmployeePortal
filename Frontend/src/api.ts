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
export type EmployeeDetails = Pick<EmployeeInput, 'employee_id' | 'name' | 'department' | 'country' | 'designation' | 'status'>;
export interface EmployeeFormOptions { countries: string[]; departments: string[] }

export interface AuthUser { id: number; email: string; name: string; role: 'superadmin' }
export interface AuthSession { user: AuthUser; token: string; expires_at: string }

let authToken: string | undefined;
export function setAuthToken(token?: string) { authToken = token; }

export class ApiError extends Error {
  constructor(message: string, public fieldErrors: Record<string, string[]> = {}, public status = 0) {
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

export interface SalaryBand {
  lower_bound: string;
  upper_bound: string | null;
  headcount: number;
}

export interface Metrics {
  headcount: number;
  total_base_salary: string;
  monthly_payroll_estimate: string;
  average_base_salary: string;
  median_base_salary: string;
  minimum_base_salary: string;
  maximum_base_salary: string;
  salary_bands: SalaryBand[];
}

export interface CurrencyMetrics extends Metrics {
  by_country: Record<string, Metrics>;
  by_department: Record<string, Metrics>;
}

export interface Insights {
  headcount: number;
  country_headcounts: Record<string, number>;
  currencies: Record<string, CurrencyMetrics>;
}

export interface Filters { country: string; department: string; status: string }
export interface Directory {
  data: Employee[];
  meta: { page: number; per_page: number; total_count: number; total_pages: number };
}

export type AnalysisReport = 'roles' | 'outliers' | 'below_department_average';
export interface RoleComparison {
  country: string; designation: string; currency: string; headcount: number;
  average_base_salary: string; median_base_salary: string;
  minimum_base_salary: string; maximum_base_salary: string; salary_gap: string;
}
export interface SalaryReviewEmployee extends Employee {
  comparison_headcount: number; comparison_average: string;
  comparison_threshold?: string; salary_difference: string;
}
export interface SalaryAnalysisResponse {
  data: (RoleComparison | SalaryReviewEmployee)[];
  meta: Directory['meta'] & { report: AnalysisReport; minimum_peer_count?: number | null };
}

type Query = Record<string, string | number | undefined>;

export type ReviewStatus = 'pending' | 'investigating' | 'confirmed_error' | 'legitimate';
export interface DataQualityScan {
  id: number; checked_employees: number; detected_findings: number; new_findings: number;
  affected_employees: number; cleared_findings: number; started_at: string; completed_at: string;
}
export interface SalaryDataAnomaly {
  id: number; employee: Employee; rule_code: string; rule_name: string; severity: 'warning' | 'info';
  snapshot: Record<string, unknown>; observed: Record<string, unknown>; reference: Record<string, unknown>;
  active: boolean; source_stale: boolean; review_status: ReviewStatus; review_notes: string | null;
  reviewed_by: { id: number; name: string } | null; reviewed_at: string | null;
  first_detected_at: string; last_checked_at: string; cleared_at: string | null;
}
export interface AnomalyDirectory {
  data: SalaryDataAnomaly[];
  meta: Directory['meta'] & { last_scan: DataQualityScan | null };
}
export interface AnomalyDetails {
  data: SalaryDataAnomaly;
  reviews: { data: { id: number; status: ReviewStatus; notes: string | null; reviewed_at: string;
    reviewed_by: { id: number; name: string } }[]; meta: Directory['meta'] };
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const apiBaseUrl = (API_BASE_URL?.trim() || '/api/v1').replace(/\/+$/, '');

async function request<T>(path: string, options?: RequestInit, authenticated = true): Promise<T> {
  const token = authenticated ? authToken : undefined;
  const headers = new Headers(options?.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${apiBaseUrl}${path}`, { ...options, headers });
  if (response.status === 401 && token && token === authToken) {
    authToken = undefined;
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('portal:session-expired'));
  }
  if (response.status === 204) return undefined as T;
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
    throw new ApiError(message, errors && !Array.isArray(errors) && typeof errors === 'object' ? errors : {}, response.status);
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
  login: (email: string, password: string) => request<{ data: AuthSession }>('/session', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session: { email, password } }),
  }, false),
  session: (signal?: AbortSignal) => request<{ data: Omit<AuthSession, 'token'> }>('/session', { signal }),
  logout: () => request<void>('/session', { method: 'DELETE' }),
  createEmployee: (employee: EmployeeInput) => request<{ data: Employee }>('/employees', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employee }),
  }),
  employees: (params: Query, signal?: AbortSignal) => request<Directory>(`/employees?${queryString(params)}`, { signal }),
  employeeOptions: (signal?: AbortSignal) => request<{ data: EmployeeFormOptions }>('/employees/options', { signal }),
  updateEmployee: (id: number, employee: EmployeeDetails) => request<{ data: Employee }>(`/employees/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employee }),
  }),
  insights: (params: Query = {}, signal?: AbortSignal) => request<{ data: Insights }>(`/compensation_insights?${queryString(params)}`, { signal }),
  salaryAnalysis: (params: Query, signal?: AbortSignal) => request<SalaryAnalysisResponse>(`/salary_analysis?${queryString(params)}`, { signal }),
  dataAnomalies: (params: Query, signal?: AbortSignal) => request<AnomalyDirectory>(`/salary_data_anomalies?${queryString(params)}`, { signal }),
  dataAnomaly: (id: number, params: Query = {}, signal?: AbortSignal) => request<AnomalyDetails>(`/salary_data_anomalies/${id}?${queryString(params)}`, { signal }),
  runSalaryChecks: () => request<{ data: DataQualityScan }>('/salary_data_quality_scans', { method: 'POST' }),
  reviewDataAnomaly: (id: number, status: ReviewStatus, notes: string) => request<{ data: SalaryDataAnomaly }>(`/salary_data_anomalies/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ review: { status, notes } }),
  }),
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

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Filter, ShieldAlert } from 'lucide-react';
import { api, currencies, money } from './api';
import type { AnalysisReport, Employee, Filters, Insights, RoleComparison, SalaryReviewEmployee } from './api';
import { FilterDialog, FilterTags } from './DirectoryView';
import { Avatar, State, useResource } from './ui';

const reports: { key: AnalysisReport; label: string }[] = [
  { key: 'roles', label: 'Role comparisons' },
  { key: 'outliers', label: 'High salary outliers' },
  { key: 'below_department_average', label: 'Below department average' },
];

export default function SalaryAnalysisView({ filters, changeFilters, options, revision, pageSize, selectEmployee }: {
  filters: Filters; changeFilters: (filters: Filters) => void; options?: Insights;
  revision: number; pageSize: number; selectEmployee: (employee: Employee) => void;
}) {
  const [report, setReport] = useState<AnalysisReport>('roles');
  const [currency, setCurrency] = useState('');
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  useEffect(() => { setPage(1); }, [report, currency, filters.country, filters.department, filters.status, pageSize, revision]);
  const requestKey = JSON.stringify([report, currency, page, pageSize, filters.country, filters.department, filters.status, revision]);
  const result = useResource(async (signal) => ({ key: requestKey,
    response: await api.salaryAnalysis({ ...filters, report, currency, page, per_page: pageSize }, signal) }),
    [report, currency, page, pageSize, filters.country, filters.department, filters.status, revision]);
  const data = result.data?.key === requestKey ? result.data.response : undefined;
  const meta = data?.meta;
  const start = meta?.total_count ? (meta.page - 1) * meta.per_page + 1 : 0;
  const employeeRows = data?.data as SalaryReviewEmployee[] | undefined;
  const countLabel = report === 'roles' ? (meta?.total_count === 1 ? 'group' : 'groups') : (meta?.total_count === 1 ? 'employee' : 'employees');
  return <>
    <div className="section-toolbar"><div className="section-heading"><h2>Salary analysis</h2><span className="muted">{meta?.total_count.toLocaleString() || 0} {countLabel}</span></div>
      <div className="toolbar-actions"><label className="analysis-currency"><span className="sr-only">Analysis currency</span><select aria-label="Analysis currency" value={currency} onChange={(event) => setCurrency(event.target.value)}><option value="">All currencies</option>{currencies.map((code) => <option key={code}>{code}</option>)}</select></label>
        <button className={`button ${Object.values(filters).some(Boolean) ? 'selected' : ''}`} onClick={() => setShowFilters(true)}><Filter size={17} />Filter</button></div>
    </div>
    <div className="tabs analysis-tabs" role="tablist" aria-label="Salary analysis reports">{reports.map(({ key, label }) => <button role="tab" aria-selected={key === report} className={key === report ? 'active' : ''} key={key} onClick={() => setReport(key)}>{label}</button>)}</div>
    <div className="analysis-notice"><ShieldAlert size={17} /><span>HR review indicators, not conclusions about unfair pay.</span><span className="muted">{report === 'outliers' ? 'Same role, country and currency | At least 5 employees' : report === 'roles' ? 'Same role, country and currency' : 'Department average | Same currency'}</span></div>
    <FilterTags filters={filters} change={changeFilters} />
    {result.error ? <State error={result.error} retry={result.reload} /> : result.loading || !data ? <State loading /> : !data.data.length ? <State empty={report === 'roles' ? 'No role groups found' : report === 'outliers' ? 'No high salary outliers found' : 'No employees below department average'} /> : <div>
      <div className="table-wrap"><table className="salary-analysis-table" aria-label={reports.find((item) => item.key === report)?.label}>
        {report === 'roles' ? <><thead><tr><th>Role</th><th>Country</th><th>Currency</th><th className="numeric">People</th><th className="numeric">Annual average</th><th className="numeric">Median</th><th className="numeric">Lowest</th><th className="numeric">Highest</th><th className="numeric">Salary gap</th></tr></thead>
          <tbody>{(data.data as RoleComparison[]).map((row) => <tr key={`${row.country}-${row.designation}-${row.currency}`}><td>{row.designation}</td><td>{row.country}</td><td><span className="currency-symbol">{row.currency}</span></td><td className="numeric">{row.headcount.toLocaleString()}</td><td className="numeric">{money(row.average_base_salary, row.currency)}</td><td className="numeric">{money(row.median_base_salary, row.currency)}</td><td className="numeric">{money(row.minimum_base_salary, row.currency)}</td><td className="numeric">{money(row.maximum_base_salary, row.currency)}</td><td className="numeric">{money(row.salary_gap, row.currency)}</td></tr>)}</tbody>
        </> : <><thead><tr><th>Employee</th><th>Role</th><th>Country</th><th>Department</th><th>Currency</th><th className="numeric">Annual salary</th><th className="numeric">{report === 'outliers' ? 'Peer average' : 'Department average'}</th>{report === 'outliers' && <th className="numeric">Review threshold</th>}<th className="numeric">{report === 'outliers' ? 'Above threshold' : 'Below average'}</th><th className="numeric">Group size</th></tr></thead>
          <tbody>{employeeRows?.map((row) => <tr key={row.id}><td><button className="person-button" onClick={() => selectEmployee(row)}><Avatar name={row.name} id={row.id} /><span><strong>{row.name}</strong><small>{row.employee_id}</small></span></button></td><td>{row.designation}</td><td>{row.country}</td><td>{row.department}</td><td><span className="currency-symbol">{row.currency}</span></td><td className="numeric">{money(row.base_salary, row.currency)}</td><td className="numeric">{money(row.comparison_average, row.currency)}</td>{report === 'outliers' && <td className="numeric">{money(row.comparison_threshold!, row.currency)}</td>}<td className="numeric">{money(row.salary_difference, row.currency)}</td><td className="numeric">{row.comparison_headcount.toLocaleString()}</td></tr>)}</tbody>
        </>}
      </table></div>
      <div className="table-footer"><span>Showing {start}-{Math.min(meta!.page * meta!.per_page, meta!.total_count)} of {meta!.total_count.toLocaleString()}</span><div className="pagination"><button className="icon-button" aria-label="Previous analysis page" title="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={18} /></button><span>Page {page} of {meta!.total_pages}</span><button className="icon-button" aria-label="Next analysis page" title="Next page" disabled={page >= meta!.total_pages} onClick={() => setPage(page + 1)}><ChevronRight size={18} /></button></div></div>
    </div>}
    {showFilters && <FilterDialog filters={filters} options={options} apply={changeFilters} close={() => setShowFilters(false)} />}
  </>;
}

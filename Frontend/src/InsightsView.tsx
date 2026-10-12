import { useEffect, useState } from 'react';
import { Banknote, Building2, Filter, Globe2, UsersRound, Wallet } from 'lucide-react';
import { api, money } from './api';
import type { Filters, Insights, Metrics } from './api';
import { FilterDialog, FilterTags } from './DirectoryView';
import { State, useResource } from './ui';

export default function InsightsView({ overview, filters, changeFilters, options, revision, defaultCurrency }: {
  overview: boolean; filters: Filters; changeFilters: (filters: Filters) => void; options?: Insights;
  revision: number; defaultCurrency: string;
}) {
  const [currency, setCurrency] = useState(defaultCurrency);
  const [showFilters, setShowFilters] = useState(false);
  const summary = useResource((signal) => api.insights({ ...filters }, signal), [filters.country, filters.department, filters.status, revision]);
  const data = summary.data?.data;
  const available = Object.keys(data?.currencies || {}).sort();
  const group = data?.currencies[currency];
  useEffect(() => { setCurrency(defaultCurrency); }, [defaultCurrency]);
  useEffect(() => { if (data && !data.currencies[currency] && available.length) setCurrency(available[0]); }, [data, currency, available]);
  const countryCount = new Set(Object.values(data?.currencies || {}).flatMap((entry) => Object.keys(entry.by_country))).size;
  const departmentCount = new Set(Object.values(data?.currencies || {}).flatMap((entry) => Object.keys(entry.by_department))).size;

  const distribution = (title: string, entries: Record<string, Metrics>, country: boolean) => {
    const rows = Object.entries(entries).sort((a, b) => Number(b[1].total_base_salary) - Number(a[1].total_base_salary));
    const max = Math.max(...rows.map(([, value]) => Number(value.total_base_salary)), 1);
    return <section className="distribution"><h3>{title}<span className="muted">{currency}</span></h3><div className="table-wrap"><table className="distribution-table"><thead><tr><th>{country ? 'Country' : 'Department'}</th><th className="numeric">People</th><th className="numeric">Total base salary</th></tr></thead><tbody>{rows.map(([label, metrics]) => <tr key={label}><td><strong>{label}</strong><div className="bar-track"><span style={{ width: `${Math.max(Number(metrics.total_base_salary) / max * 100, 1)}%` }} /></div></td><td className="numeric">{metrics.headcount}</td><td className="numeric">{money(metrics.total_base_salary, currency)}</td></tr>)}</tbody></table></div></section>;
  };

  return <>
    <div className="section-toolbar"><div className="section-heading"><h2>{overview ? 'Workforce overview' : 'Compensation insights'}</h2><span className="muted">{data?.headcount.toLocaleString() || 0} employees</span></div><button className={`button ${Object.values(filters).some(Boolean) ? 'selected' : ''}`} onClick={() => setShowFilters(true)}><Filter size={17} />Filter</button></div>
    <FilterTags filters={filters} change={changeFilters} />
    {summary.error ? <State error={summary.error} retry={summary.reload} /> : summary.loading && !data ? <State loading /> : !data?.headcount ? <State empty="No compensation records found" /> : <div aria-busy={summary.loading} className={summary.loading ? 'refreshing' : ''}>
      {overview ? <>
        <div className="metric-band">{[[UsersRound, 'Total employees', data.headcount], [Globe2, 'Countries', countryCount], [Building2, 'Departments', departmentCount], [Wallet, 'Currencies', available.length]].map(([Icon, label, value]) => {
          const Symbol = Icon as typeof UsersRound;
          return <div className="metric" key={String(label)}><span><Symbol size={17} />{String(label)}</span><strong>{String(value)}</strong></div>;
        })}</div>
        <section className="overview-currencies"><h3>Annual compensation by currency</h3><div className="table-wrap"><table><thead><tr><th>Currency</th><th className="numeric">Employees</th><th className="numeric">Total base salary</th><th className="numeric">Average</th><th className="numeric">Median</th></tr></thead><tbody>{available.map((code) => {
          const metrics = data.currencies[code];
          return <tr key={code}><td><span className="currency-symbol">{code}</span></td><td className="numeric">{metrics.headcount}</td><td className="numeric">{money(metrics.total_base_salary, code)}</td><td className="numeric">{money(metrics.average_base_salary, code)}</td><td className="numeric">{money(metrics.median_base_salary, code)}</td></tr>;
        })}</tbody></table></div></section>
      </> : <>
        <div className="currency-toolbar"><div className="tabs" role="tablist" aria-label="Compensation currency">{available.map((code) => <button role="tab" aria-selected={code === currency} className={code === currency ? 'active' : ''} key={code} onClick={() => setCurrency(code)}>{code}</button>)}</div></div>
        {group && <><div className="metric-band compensation-metrics"><div className="metric"><span><UsersRound size={17} />Headcount</span><strong>{group.headcount}</strong></div><div className="metric"><span><Banknote size={17} />Total base salary</span><strong>{money(group.total_base_salary, currency)}</strong></div><div className="metric"><span>Average base salary</span><strong>{money(group.average_base_salary, currency)}</strong></div><div className="metric"><span>Median base salary</span><strong>{money(group.median_base_salary, currency)}</strong></div></div><div className="distribution-grid">{distribution('By department', group.by_department, false)}{distribution('By country', group.by_country, true)}</div></>}
      </>}
    </div>}
    {showFilters && <FilterDialog filters={filters} options={options} apply={changeFilters} close={() => setShowFilters(false)} />}
  </>;
}

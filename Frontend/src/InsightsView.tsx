import { useEffect, useState } from 'react';
import { ArrowDownWideNarrow, Banknote, Building2, Filter, Globe2, UsersRound, Wallet } from 'lucide-react';
import { api, money } from './api';
import type { CurrencyMetrics, Filters, Insights, Metrics, SalaryBand } from './api';
import { FilterDialog, FilterTags } from './DirectoryView';
import { State, useResource } from './ui';

type RankingMetric = 'total_base_salary' | 'average_base_salary' | 'headcount';

function SalaryRanking({ entries, currency, country }: { entries: Record<string, Metrics>; currency: string; country: boolean }) {
  const [rankBy, setRankBy] = useState<RankingMetric>('total_base_salary');
  const label = country ? 'Country' : 'Department';
  const rankValue = (metrics: Metrics) => rankBy === 'headcount' ? BigInt(metrics.headcount) : BigInt(metrics[rankBy].replace('.', ''));
  const rows = Object.entries(entries).sort((a, b) => {
    const left = rankValue(a[1]); const right = rankValue(b[1]);
    return left === right ? a[0].localeCompare(b[0]) : left > right ? -1 : 1;
  });
  const max = Math.max(...rows.map(([, value]) => Number(value[rankBy])), 1);
  return <section className="distribution" aria-label={`${label} salary rankings`}>
    <div className="analysis-heading"><h3>{label} salary rankings<span className="muted">{currency}</span></h3>
      <label className="ranking-select"><ArrowDownWideNarrow size={16} /><select aria-label={`Rank ${country ? 'countries' : 'departments'} by`} value={rankBy} onChange={(event) => setRankBy(event.target.value as RankingMetric)}>
        <option value="total_base_salary">Total salary</option><option value="average_base_salary">Average salary</option><option value="headcount">Headcount</option>
      </select></label>
    </div>
    <div className="table-wrap"><table className="distribution-table" aria-label={`${label} salary rankings`}><thead><tr><th>Rank</th><th>{label}</th><th className="numeric">People</th><th className="numeric">Annual total</th><th className="numeric">Annual average</th></tr></thead><tbody>{rows.map(([name, metrics], index) => <tr key={name}>
      <td className="rank-number">{index + 1}</td><td><strong>{name}</strong><div className="bar-track"><span style={{ width: `${Number(metrics[rankBy]) / max * 100}%` }} /></div></td>
      <td className="numeric">{metrics.headcount.toLocaleString()}</td><td className="numeric">{money(metrics.total_base_salary, currency)}</td><td className="numeric">{money(metrics.average_base_salary, currency)}</td>
    </tr>)}</tbody></table></div>
  </section>;
}

function bandLabel(band: SalaryBand, currency: string) {
  if (band.upper_bound === null) return `${money(band.lower_bound, currency)} and above`;
  if (Number(band.lower_bound) === 0) return `Under ${money(band.upper_bound, currency)}`;
  return `${money(band.lower_bound, currency)} to <${money(band.upper_bound, currency)}`;
}

function DepartmentBands({ group, currency }: { group: CurrencyMetrics; currency: string }) {
  const rows = Object.entries(group.by_department).sort(([a], [b]) => a.localeCompare(b));
  return <section className="analysis-section" aria-label="Department salary bands">
    <div className="analysis-heading"><h3>Department salary bands</h3><span className="muted">Annual base salary | {currency}</span></div>
    <div className="table-wrap"><table className="salary-bands-table" aria-label="Department salary bands"><thead><tr><th>Department</th><th className="numeric">People</th>{group.salary_bands.map((band) => <th key={band.lower_bound} className="numeric band-heading">{bandLabel(band, currency)}</th>)}</tr></thead>
      <tbody>{rows.map(([department, metrics]) => <tr key={department}><td>{department}</td><td className="numeric">{metrics.headcount.toLocaleString()}</td>{metrics.salary_bands.map((band) => <td key={band.lower_bound} className="numeric"><span className={`band-count ${band.headcount ? 'populated' : ''}`}>{band.headcount.toLocaleString()}</span></td>)}</tr>)}</tbody>
      <tfoot><tr><th scope="row">All departments</th><td className="numeric">{group.headcount.toLocaleString()}</td>{group.salary_bands.map((band) => <td key={band.lower_bound} className="numeric">{band.headcount.toLocaleString()}</td>)}</tr></tfoot>
    </table></div>
  </section>;
}

function CountryHeadcounts({ counts }: { counts: Record<string, number> }) {
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const total = rows.reduce((sum, [, count]) => sum + count, 0);
  return <section className="analysis-section" aria-label="Country headcount">
    <div className="analysis-heading"><h3>Country headcount</h3><span className="muted">All currencies</span></div>
    <div className="table-wrap"><table aria-label="Country headcount"><thead><tr><th>Country</th><th className="numeric">Employees</th><th className="numeric">Workforce share</th></tr></thead>
      <tbody>{rows.map(([country, count]) => <tr key={country}><td>{country}</td><td className="numeric">{count.toLocaleString()}</td><td className="numeric">{(count / total * 100).toFixed(1)}%</td></tr>)}</tbody>
      <tfoot><tr><th scope="row">Total employees</th><td className="numeric">{total.toLocaleString()}</td><td className="numeric">100.0%</td></tr></tfoot>
    </table></div>
  </section>;
}

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
  const countryCount = Object.keys(data?.country_headcounts || {}).length;
  const departmentCount = new Set(Object.values(data?.currencies || {}).flatMap((entry) => Object.keys(entry.by_department))).size;

  return <>
    <div className="section-toolbar"><div className="section-heading"><h2>{overview ? 'Workforce overview' : 'Compensation insights'}</h2><span className="muted">{data?.headcount.toLocaleString() || 0} employees</span></div><button className={`button ${Object.values(filters).some(Boolean) ? 'selected' : ''}`} onClick={() => setShowFilters(true)}><Filter size={17} />Filter</button></div>
    <FilterTags filters={filters} change={changeFilters} />
    {summary.error ? <State error={summary.error} retry={summary.reload} /> : summary.loading && !data ? <State loading /> : !data?.headcount ? <State empty="No compensation records found" /> : <div aria-busy={summary.loading} className={summary.loading ? 'refreshing' : ''}>
      {overview ? <>
        <div className="metric-band">{[[UsersRound, 'Total employees', data.headcount], [Globe2, 'Countries', countryCount], [Building2, 'Departments', departmentCount], [Wallet, 'Currencies', available.length]].map(([Icon, label, value]) => {
          const Symbol = Icon as typeof UsersRound;
          return <div className="metric" key={String(label)}><span><Symbol size={17} />{String(label)}</span><strong>{String(value)}</strong></div>;
        })}</div>
        <section className="overview-currencies"><h3>Annual compensation by currency</h3><div className="table-wrap"><table aria-label="Compensation summary"><thead><tr><th>Currency</th><th className="numeric">Employees</th><th className="numeric">Annual total</th><th className="numeric">Monthly estimate</th><th className="numeric">Annual average</th><th className="numeric">Median</th><th className="numeric">Lowest salary</th><th className="numeric">Highest salary</th></tr></thead><tbody>{available.map((code) => {
          const metrics = data.currencies[code];
          return <tr key={code}><td><span className="currency-symbol">{code}</span></td><td className="numeric">{metrics.headcount}</td><td className="numeric">{money(metrics.total_base_salary, code)}</td><td className="numeric">{money(metrics.monthly_payroll_estimate, code)}</td><td className="numeric">{money(metrics.average_base_salary, code)}</td><td className="numeric">{money(metrics.median_base_salary, code)}</td><td className="numeric">{money(metrics.minimum_base_salary, code)}</td><td className="numeric">{money(metrics.maximum_base_salary, code)}</td></tr>;
        })}</tbody></table></div></section>
      </> : <>
        <div className="currency-toolbar"><div className="tabs" role="tablist" aria-label="Compensation currency">{available.map((code) => <button role="tab" aria-selected={code === currency} className={code === currency ? 'active' : ''} key={code} onClick={() => setCurrency(code)}>{code}</button>)}</div></div>
        {group && <><div className="metric-band compensation-metrics"><div className="metric"><span><UsersRound size={17} />Headcount | {currency}</span><strong>{group.headcount.toLocaleString()}</strong></div><div className="metric"><span><Banknote size={17} />Annual total | {currency}</span><strong>{money(group.total_base_salary, currency)}</strong></div><div className="metric"><span>Annual average | {currency}</span><strong>{money(group.average_base_salary, currency)}</strong></div><div className="metric"><span>Median | {currency}</span><strong>{money(group.median_base_salary, currency)}</strong></div></div>
          <div className="distribution-grid"><SalaryRanking entries={group.by_department} currency={currency} country={false} /><SalaryRanking entries={group.by_country} currency={currency} country /></div>
          <DepartmentBands group={group} currency={currency} />
          <section className="analysis-section" aria-label="Payroll estimate and salary range"><div className="analysis-heading"><h3>Payroll estimate and salary range</h3><span className="muted">{currency}</span></div>
            <div className="metric-band salary-range-metrics"><div className="metric"><span>Monthly base payroll | {currency}</span><strong>{money(group.monthly_payroll_estimate, currency)}</strong></div><div className="metric"><span>Lowest annual salary</span><strong>{money(group.minimum_base_salary, currency)}</strong></div><div className="metric"><span>Highest annual salary</span><strong>{money(group.maximum_base_salary, currency)}</strong></div></div>
          </section>
        </>}
      </>}
      <CountryHeadcounts counts={data.country_headcounts} />
    </div>}
    {showFilters && <FilterDialog filters={filters} options={options} apply={changeFilters} close={() => setShowFilters(false)} />}
  </>;
}

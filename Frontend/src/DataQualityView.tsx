import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ChevronLeft, ChevronRight, ClipboardCheck, Filter, LoaderCircle, ScanSearch, Wallet } from 'lucide-react';
import { api, currencies, money } from './api';
import type { Employee, Filters, Insights, ReviewStatus, SalaryDataAnomaly } from './api';
import { FilterDialog, FilterTags } from './DirectoryView';
import { Avatar, Modal, State, useResource } from './ui';

const decisions: Record<ReviewStatus, string> = {
  pending: 'Pending', investigating: 'Investigating', confirmed_error: 'Confirmed error', legitimate: 'Legitimate',
};
const timestamp = (value: string) => new Date(value).toLocaleString('en-GB');

function Evidence({ title, values }: { title: string; values: Record<string, unknown> }) {
  return <section className="quality-evidence"><h3>{title}</h3><dl>{Object.entries(values).map(([key, value]) => <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd>{Array.isArray(value) ? value.join(', ') : value && typeof value === 'object' ? JSON.stringify(value) : String(value ?? '-')}</dd></div>)}</dl></section>;
}

function FindingReview({ id, close, saved, selectEmployee }: {
  id: number; close: () => void; saved: () => void; selectEmployee: (employee: Employee) => void;
}) {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<ReviewStatus>('pending');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const initialized = useRef(false);
  const result = useResource(async (signal) => ({ page, response: await api.dataAnomaly(id, { page, per_page: 5 }, signal) }), [id, page]);
  const data = result.data?.page === page ? result.data.response : undefined;
  const finding = data?.data;
  useEffect(() => {
    if (finding && !initialized.current) {
      setStatus(finding.review_status); setNotes(finding.review_notes || ''); initialized.current = true;
    }
  }, [finding]);
  const needsNotes = status === 'confirmed_error' || status === 'legitimate';
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || !finding || conflict || !finding.active || finding.source_stale) return;
    if (needsNotes && !notes.trim()) { setError('Notes are required for this decision.'); return; }
    setSaving(true); setError('');
    try { await api.reviewDataAnomaly(id, status, notes.trim()); saved(); close(); }
    catch (failure) {
      setError((failure as Error).message);
      if ((failure as { status?: number }).status === 409) setConflict(true);
    } finally { setSaving(false); }
  };
  return <Modal title="Salary data review" close={() => { if (!saving) close(); }} drawer>
    {result.error ? <State error={result.error} retry={result.reload} /> : result.loading || !data ? <State loading /> : finding && <div className="drawer-body quality-review">
      <div className="quality-person"><Avatar name={finding.employee.name} id={finding.employee.id} /><div><h3>{finding.employee.name}</h3><span className="muted">{finding.employee.employee_id} | {finding.employee.department}</span></div></div>
      <h3 className="quality-rule">{finding.rule_name}</h3>
      <div className="analysis-notice"><ClipboardCheck size={17} /><span>Review indicator, not a confirmed data error.</span></div>
      <p className="muted quality-date">Detected {timestamp(finding.first_detected_at)}<br />Last checked {timestamp(finding.last_checked_at)}</p>
      {(!finding.active || finding.source_stale || conflict) && <p role="alert" className="error-message quality-warning">{!finding.active ? 'This finding has cleared.' : 'Employee data changed. Run checks again before reviewing.'}</p>}
      <Evidence title="Observed" values={finding.observed} />
      <Evidence title="Check reference" values={finding.reference} />
      <Evidence title="Employee at detection" values={Object.fromEntries(Object.entries(finding.snapshot).filter(([key]) => key !== 'latest_change'))} />
      <button className="button" onClick={() => { close(); selectEmployee(finding.employee); }} disabled={saving}><Wallet size={17} />Employee salary</button>
      <form onSubmit={submit} className="quality-decision">
        <h3>HR decision</h3>
        <div className="form-fields"><label>Decision<select value={status} onChange={(event) => setStatus(event.target.value as ReviewStatus)} disabled={saving || !finding.active || finding.source_stale || conflict}>{Object.entries(decisions).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label>Review notes{needsNotes ? ' (required)' : ''}<textarea aria-label="Review notes" rows={4} maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} required={needsNotes} disabled={saving || !finding.active || finding.source_stale || conflict} /></label>
          {error && <p className="error-message" role="alert">{error}</p>}
          <button className="button primary" type="submit" disabled={saving || !finding.active || finding.source_stale || conflict}>{saving ? <LoaderCircle size={17} className="spin" /> : <ClipboardCheck size={17} />}{saving ? 'Saving...' : 'Save decision'}</button></div>
      </form>
      <section className="quality-audit"><h3>Review history</h3>{data.reviews.data.length ? <ol>{data.reviews.data.map((review) => <li key={review.id}><strong>{decisions[review.status]}</strong><span className="muted">{review.reviewed_by.name} | {timestamp(review.reviewed_at)}</span><p>{review.notes || 'No notes recorded'}</p></li>)}</ol> : <p className="muted">No decisions recorded</p>}
        {data.reviews.meta.total_pages > 1 && <div className="pagination"><button className="icon-button" aria-label="Previous review history page" title="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={18} /></button><span>Page {page} of {data.reviews.meta.total_pages}</span><button className="icon-button" aria-label="Next review history page" title="Next page" disabled={page >= data.reviews.meta.total_pages} onClick={() => setPage(page + 1)}><ChevronRight size={18} /></button></div>}
      </section>
    </div>}
  </Modal>;
}

export default function DataQualityView({ filters, changeFilters, options, revision, pageSize, selectEmployee }: {
  filters: Filters; changeFilters: (filters: Filters) => void; options?: Insights;
  revision: number; pageSize: number; selectEmployee: (employee: Employee) => void;
}) {
  const [currency, setCurrency] = useState('');
  const [status, setStatus] = useState('pending');
  const [includeCleared, setIncludeCleared] = useState(false);
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState<number>();
  const [running, setRunning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [notice, setNotice] = useState('');
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { setPage(1); }, [currency, status, includeCleared, filters.country, filters.department, filters.status, pageSize, revision, refresh]);
  const key = JSON.stringify([currency, status, includeCleared, page, pageSize, filters, revision, refresh]);
  const result = useResource(async (signal) => ({ key, response: await api.dataAnomalies({ ...filters, currency,
    review_status: status, include_cleared: String(includeCleared), page, per_page: pageSize }, signal) }),
    [currency, status, includeCleared, page, pageSize, filters.country, filters.department, filters.status, revision, refresh]);
  const data = result.data?.key === key ? result.data.response : undefined;
  const scan = data?.meta.last_scan;
  const run = async () => {
    if (running) return;
    setRunning(true); setScanError(''); setNotice('');
    try {
      const { data: completed } = await api.runSalaryChecks();
      if (mounted.current) { setNotice(`Checks complete: ${completed.new_findings} new, ${completed.cleared_findings} cleared.`); setRefresh((value) => value + 1); }
    } catch (failure) { if (mounted.current) setScanError((failure as Error).message); }
    finally { if (mounted.current) setRunning(false); }
  };
  return <>
    <div className="section-toolbar"><div className="section-heading"><h2>Salary data quality</h2><span className="muted">{data?.meta.total_count.toLocaleString() || 0} findings</span></div><button className="button primary" onClick={() => void run()} disabled={running}>{running ? <LoaderCircle size={17} className="spin" /> : <ScanSearch size={17} />}{running ? 'Checking...' : 'Run checks'}</button></div>
    <div className="quality-scan-summary">{scan ? <><span>Last checked <strong>{timestamp(scan.completed_at)}</strong></span><span><strong>{scan.checked_employees.toLocaleString()}</strong> employees checked</span><span><strong>{scan.affected_employees.toLocaleString()}</strong> employees flagged</span><span><strong>{scan.detected_findings.toLocaleString()}</strong> findings</span></> : <span>No checks run yet</span>}</div>
    <div className="analysis-notice"><ClipboardCheck size={17} /><span>Flags require HR review. Salaries are not changed by these checks.</span></div>
    {scanError && <p role="alert" className="error-message quality-warning">{scanError}</p>}{notice && <p role="status" className="quality-notice">{notice}</p>}
    <div className="quality-controls"><label>Decision<select aria-label="Review status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All decisions</option>{Object.entries(decisions).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>Currency<select aria-label="Data quality currency" value={currency} onChange={(event) => setCurrency(event.target.value)}><option value="">All currencies</option>{currencies.map((code) => <option key={code}>{code}</option>)}</select></label><label className="quality-checkbox"><input type="checkbox" checked={includeCleared} onChange={(event) => setIncludeCleared(event.target.checked)} />Include cleared</label><button className="button" onClick={() => setShowFilters(true)}><Filter size={17} />Filter</button></div>
    <FilterTags filters={filters} change={changeFilters} />
    {result.error ? <State error={result.error} retry={result.reload} /> : result.loading || !data ? <State loading /> : !data.data.length ? <State empty={scan ? 'No findings match these filters' : 'No salary checks run yet'} /> : <>
      <div className="table-wrap"><table className="quality-table" aria-label="Salary data findings"><thead><tr><th>Employee</th><th>Check</th><th className="numeric">Salary at detection</th><th>Severity</th><th>Decision</th><th>Finding</th><th><span className="sr-only">Review</span></th></tr></thead><tbody>{data.data.map((row: SalaryDataAnomaly) => <tr key={row.id}><td><button className="person-button" onClick={() => selectEmployee(row.employee)}><Avatar name={row.employee.name} id={row.employee.id} /><span><strong>{row.employee.name}</strong><small>{row.employee.employee_id}</small></span></button></td><td className="quality-rule-cell">{row.rule_name}</td><td className="numeric">{money(String(row.snapshot.base_salary), String(row.snapshot.currency))}<small className="currency-label">{String(row.snapshot.currency)}</small></td><td><span className={`quality-severity ${row.severity}`}>{row.severity === 'warning' ? 'Warning' : 'Info'}</span></td><td>{decisions[row.review_status]}</td><td>{!row.active ? 'Cleared' : row.source_stale ? 'Needs rescan' : 'Active'}</td><td><button className="icon-button" aria-label={`Review ${row.employee.name}: ${row.rule_name}`} title="Review finding" onClick={() => setSelected(row.id)}><ClipboardCheck size={19} /></button></td></tr>)}</tbody></table></div>
      <div className="table-footer"><span>Showing {(data.meta.page - 1) * data.meta.per_page + 1}-{Math.min(data.meta.page * data.meta.per_page, data.meta.total_count)} of {data.meta.total_count.toLocaleString()}</span><div className="pagination"><button className="icon-button" aria-label="Previous findings page" title="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={18} /></button><span>Page {page} of {data.meta.total_pages}</span><button className="icon-button" aria-label="Next findings page" title="Next page" disabled={page >= data.meta.total_pages} onClick={() => setPage(page + 1)}><ChevronRight size={18} /></button></div></div>
    </>}
    {showFilters && <FilterDialog filters={filters} options={options} apply={changeFilters} close={() => setShowFilters(false)} />}
    {selected !== undefined && <FindingReview key={selected} id={selected} close={() => setSelected(undefined)} saved={() => { setRefresh((value) => value + 1); setNotice('HR decision saved.'); }} selectEmployee={selectEmployee} />}
  </>;
}

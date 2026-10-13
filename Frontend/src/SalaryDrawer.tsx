import { useState } from 'react';
import { ArrowRight, CalendarDays, Check, CheckCircle2, LoaderCircle, Pencil } from 'lucide-react';
import { api, currencies, dateLabel, money } from './api';
import type { Employee, SalaryChange } from './api';
import { Avatar, Modal, State, Status, useResource } from './ui';

export function HistoryList({ changes }: { changes: SalaryChange[] }) {
  if (!changes.length) return <State empty="No salary changes yet" />;
  return <ol className="history-list">{changes.map((change) => <li key={change.id}><span className="timeline-dot"><Check size={12} /></span><div><div className="history-amounts"><strong>{money(change.old_base_salary, change.old_currency)}</strong><ArrowRight size={15} /><strong>{money(change.new_base_salary, change.new_currency)}</strong></div><div className="history-detail">{change.old_currency} <ArrowRight size={12} /> {change.new_currency}</div><p><CalendarDays size={14} />Effective {dateLabel(change.effective_date)}</p><time dateTime={change.changed_at}>{new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(change.changed_at))}</time></div></li>)}</ol>;
}

export default function SalaryDrawer({ employee, close, updated, edit }: { employee: Employee; close: () => void; updated: () => void; edit: () => void }) {
  const [tab, setTab] = useState('salary');
  const [salary, setSalary] = useState({ base_salary: employee.base_salary, currency: employee.currency, effective_date: employee.effective_date });
  const [review, setReview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const history = useResource((signal) => api.history(employee.id, signal), [employee.id]);
  const changed = Number(salary.base_salary) !== Number(employee.base_salary) || salary.currency !== employee.currency || salary.effective_date !== employee.effective_date;
  const submit = async () => {
    setSaving(true); setError('');
    try { await api.updateSalary(employee.id, { ...salary, confirmed: true }); updated(); }
    catch (failure) { setError((failure as Error).message); }
    finally { setSaving(false); }
  };

  return <Modal title="Employee compensation" drawer close={() => { if (!saving) close(); }}>
    <div className="drawer-person"><Avatar name={employee.name} id={employee.id} large /><div><h3>{employee.name}</h3><p>{employee.designation}</p><span className="muted">{employee.employee_id}</span></div><Status status={employee.status} /></div>
    <dl className="employee-facts"><div><dt>Department</dt><dd>{employee.department}</dd></div><div><dt>Country</dt><dd>{employee.country}</dd></div></dl>
    <div className="employee-edit-link"><button className="button" disabled={saving} onClick={edit}><Pencil size={16} />Edit employee</button></div>
    <div className="tabs drawer-tabs" role="tablist"><button role="tab" aria-selected={tab === 'salary'} className={tab === 'salary' ? 'active' : ''} onClick={() => setTab('salary')}>Base salary</button><button role="tab" aria-selected={tab === 'history'} className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>Salary history</button></div>
    {tab === 'history' ? <div className="drawer-body">{history.loading ? <State loading /> : history.error ? <State error={history.error} retry={history.reload} /> : <HistoryList changes={history.data?.data || []} />}</div> : review ? <div className="drawer-body review"><CheckCircle2 size={26} className="accent" /><h3>Confirm salary change</h3><div className="comparison"><div><span className="muted">Current salary</span><strong>{money(employee.base_salary, employee.currency)}</strong><small>{employee.currency}</small></div><ArrowRight size={20} /><div><span className="muted">New salary</span><strong>{money(salary.base_salary, salary.currency)}</strong><small>{salary.currency}</small></div></div><dl className="review-date"><dt>Effective date</dt><dd>{dateLabel(salary.effective_date)}</dd></dl>{error && <p role="alert" className="error-message">{error}</p>}<div className="form-actions"><button className="button" disabled={saving} onClick={() => setReview(false)}>Back</button><button className="button primary" disabled={saving} onClick={submit}>{saving ? <LoaderCircle size={17} className="spin" /> : <Check size={17} />}Confirm update</button></div></div> : <form onSubmit={(event) => { event.preventDefault(); setReview(true); setError(''); }}>
      <div className="drawer-body"><div className="current-salary"><span className="muted">Annual base salary</span><strong>{money(employee.base_salary, employee.currency)}</strong><span className="muted">Effective {dateLabel(employee.effective_date)}</span></div><div className="form-fields"><label>Base salary<input type="number" min="0" step="0.01" required value={salary.base_salary} onChange={(event) => setSalary({ ...salary, base_salary: event.target.value })} /></label><div className="form-row"><label>Currency<select value={salary.currency} onChange={(event) => setSalary({ ...salary, currency: event.target.value })}>{currencies.map((currency) => <option key={currency}>{currency}</option>)}</select></label><label>Effective date<input type="date" required value={salary.effective_date} onChange={(event) => setSalary({ ...salary, effective_date: event.target.value })} /></label></div></div></div><footer className="modal-footer"><button type="button" className="button" onClick={close}>Cancel</button><button className="button primary" disabled={!changed}>Review change<ArrowRight size={16} /></button></footer>
    </form>}
  </Modal>;
}

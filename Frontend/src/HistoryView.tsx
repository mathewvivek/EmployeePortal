import { useEffect, useState } from 'react';
import { ArrowRight, History, Search } from 'lucide-react';
import { api, dateLabel, money } from './api';
import type { Employee, SalaryChange } from './api';
import { Avatar, State, useResource } from './ui';

export default function HistoryView({ revision }: { revision: number }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Employee>();
  const people = useResource((signal) => api.employees({ q: query, per_page: 100 }, signal), [query, revision]);
  useEffect(() => { if (!selected && people.data?.data.length) setSelected(people.data.data[0]); }, [people.data, selected]);
  const history = useResource<{ data: SalaryChange[] }>((signal) => selected ? api.history(selected.id, signal) : Promise.resolve({ data: [] }), [selected?.id, revision]);
  const employees = people.data?.data || [];

  return <>
    <div className="section-toolbar"><div className="section-heading"><h2>Salary history</h2><span className="muted">Compensation changes</span></div></div>
    <div className="history-picker"><label className="search-field"><Search size={17} /><input aria-label="Find employee for history" placeholder="Find an employee" value={query} onChange={(event) => setQuery(event.target.value)} /></label><label className="picker-select">Employee<select value={selected?.id || ''} onChange={(event) => setSelected(employees.find((employee) => employee.id === Number(event.target.value)))}>
      {!selected && <option value="">Select an employee</option>}
      {selected && !employees.some((employee) => employee.id === selected.id) && <option value={selected.id}>{selected.name}</option>}
      {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} - {employee.employee_id}</option>)}
    </select></label></div>
    {people.error ? <State error={people.error} retry={people.reload} /> : people.loading && !selected ? <State loading /> : !selected ? <State empty="No employees found" /> : <>
      <div className="history-person"><Avatar name={selected.name} id={selected.id} /><div><strong>{selected.name}</strong><span className="muted">{selected.department} <span className="inline-dot">/</span> {selected.employee_id}</span></div><span className="history-count"><History size={16} />{history.data?.data.length || 0} changes</span></div>
      {history.loading ? <State loading /> : history.error ? <State error={history.error} retry={history.reload} /> : !history.data?.data.length ? <State empty="No salary changes yet" /> : <div className="table-wrap"><table className="history-table"><thead><tr><th>Changed on</th><th>Salary change</th><th>Currency</th><th>Effective date</th></tr></thead><tbody>{history.data.data.map((change) => <tr key={change.id}><td>{new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(change.changed_at))}</td><td><span className="history-amounts">{money(change.old_base_salary, change.old_currency)}<ArrowRight size={15} /><strong>{money(change.new_base_salary, change.new_currency)}</strong></span></td><td>{change.old_currency} <span className="muted">to</span> {change.new_currency}</td><td>{dateLabel(change.effective_date)}</td></tr>)}</tbody></table></div>}
    </>}
  </>;
}

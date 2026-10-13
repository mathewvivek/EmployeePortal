import { useEffect, useState } from 'react';
import { ArrowDownWideNarrow, ArrowUpRight, Banknote, ChevronLeft, ChevronRight, Filter, IdCard, MapPin, Pencil, UserPlus, UsersRound, X } from 'lucide-react';
import { api, emptyFilters, money } from './api';
import type { Employee, Filters, Insights } from './api';
import { Avatar, Modal, State, Status, useResource } from './ui';

export function FilterDialog({ filters, options, apply, close }: { filters: Filters; options?: Insights; apply: (filters: Filters) => void; close: () => void }) {
  const [draft, setDraft] = useState(filters);
  const countries = [...new Set(Object.values(options?.currencies || {}).flatMap((group) => Object.keys(group.by_country)))].sort();
  const departments = [...new Set(Object.values(options?.currencies || {}).flatMap((group) => Object.keys(group.by_department)))].sort();
  return <Modal title="Filter employees" close={close}>
    <form onSubmit={(event) => { event.preventDefault(); apply(draft); close(); }}>
      <div className="form-fields">
        <label>Country<select value={draft.country} onChange={(event) => setDraft({ ...draft, country: event.target.value })}><option value="">All countries</option>{countries.map((country) => <option key={country}>{country}</option>)}</select></label>
        <label>Department<select value={draft.department} onChange={(event) => setDraft({ ...draft, department: event.target.value })}><option value="">All departments</option>{departments.map((department) => <option key={department}>{department}</option>)}</select></label>
        <label>Status<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
      </div>
      <footer className="modal-footer"><button type="button" className="button" onClick={() => setDraft(emptyFilters)}>Reset</button><button className="button primary">Apply filters</button></footer>
    </form>
  </Modal>;
}

export function FilterTags({ filters, change }: { filters: Filters; change: (filters: Filters) => void }) {
  return <div className="filter-tags">{Object.entries(filters).filter(([, value]) => value).map(([key, value]) => <button className="filter-tag" key={key} onClick={() => change({ ...filters, [key]: '' })}>{value}<X size={13} aria-label={`Remove ${value} filter`} /></button>)}</div>;
}

export default function DirectoryView({ query, filters, changeFilters, clearSearch, options, revision, pageSize, selectEmployee, addEmployee, editEmployee }: {
  query: string; filters: Filters; changeFilters: (filters: Filters) => void; options?: Insights;
  revision: number; pageSize: number; selectEmployee: (employee: Employee) => void;
  clearSearch: () => void;
  addEmployee: () => void;
  editEmployee: (employee: Employee) => void;
}) {
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(pageSize);
  const [sort, setSort] = useState('id');
  const [showFilters, setShowFilters] = useState(false);
  const [showSort, setShowSort] = useState(false);
  useEffect(() => { setPage(1); }, [query, filters.country, filters.department, filters.status, size, sort]);
  useEffect(() => setSize(pageSize), [pageSize]);
  const directory = useResource((signal) => api.employees({ q: query, ...filters, page, per_page: size,
    sort: sort === 'id' ? undefined : 'base_salary', direction: sort === 'desc' ? 'desc' : 'asc' }, signal),
  [query, filters.country, filters.department, filters.status, page, size, sort, revision]);
  const meta = directory.data?.meta;
  const total = meta?.total_count || 0;
  const pages = meta?.total_pages || 0;
  const pageNumbers = [...new Set([1, page - 1, page, page + 1, pages])].filter((value) => value >= 1 && value <= pages).sort((a, b) => a - b);
  const count = Object.values(filters).filter(Boolean).length;

  return <>
    <div className="section-toolbar"><div className="section-heading"><h2>{total.toLocaleString()} employees</h2><span className="muted">Directory</span></div><div className="toolbar-actions">
      <button className="button primary" onClick={addEmployee}><UserPlus size={17} />New employee</button>
      <div className="popover-anchor"><button className={`button ${sort !== 'id' ? 'selected' : ''}`} onClick={() => setShowSort(!showSort)} aria-expanded={showSort}><ArrowDownWideNarrow size={17} />Sort</button>
        {showSort && <><button className="popover-dismiss" aria-label="Close sort menu" onClick={() => setShowSort(false)} /><fieldset className="popover"><legend>Sort employees</legend>{[['id', 'Employee ID'], ['asc', 'Salary: low to high'], ['desc', 'Salary: high to low']].map(([value, label]) => <label className="radio-option" key={value}><input type="radio" name="sort" checked={sort === value} onChange={() => { setSort(value); setShowSort(false); }} />{label}</label>)}</fieldset></>}
      </div>
      <button className={`button ${count ? 'selected' : ''}`} onClick={() => setShowFilters(true)}><Filter size={17} />Filter{count > 0 && <span className="count-badge">{count}</span>}</button>
    </div></div>
    <FilterTags filters={filters} change={changeFilters} />
    {directory.error ? <State error={directory.error} retry={directory.reload} /> : directory.loading && !directory.data ? <State loading /> : total === 0 ? <div className="empty-directory"><State empty="No employees found" />{(query || count > 0) && <button className="button" onClick={() => { changeFilters(emptyFilters); clearSearch(); }}>Reset search</button>}</div> : <div className={`table-wrap ${directory.loading ? 'refreshing' : ''}`} aria-busy={directory.loading}>
      <table className="employee-table"><thead><tr><th><span><IdCard size={17} />Employee ID</span></th><th><span><UsersRound size={17} />Employee</span></th><th>Department</th><th><span><MapPin size={16} />Country</span></th><th className="numeric"><span><Banknote size={18} />Base salary</span></th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{directory.data?.data.map((employee) => <tr key={employee.id}><td className="employee-id">{employee.employee_id}</td><td><button className="person-button" onClick={() => selectEmployee(employee)}><Avatar name={employee.name} id={employee.id} /><span><strong>{employee.name}</strong><small>{employee.designation}</small></span></button></td><td>{employee.department}</td><td className="country-cell">{employee.country}</td><td className="numeric"><strong className="salary-value">{money(employee.base_salary, employee.currency)}</strong><small className="currency-label">{employee.currency} / year</small></td><td><Status status={employee.status} /></td><td><div className="employee-row-actions"><button className="icon-button row-action" title={`Edit ${employee.name}'s details`} aria-label={`Edit ${employee.name}'s details`} onClick={() => editEmployee(employee)}><Pencil size={17} /></button><button className="icon-button row-action" title={`View ${employee.name}'s salary`} aria-label={`View ${employee.name}'s salary`} onClick={() => selectEmployee(employee)}><ArrowUpRight size={18} /></button></div></td></tr>)}</tbody>
      </table>
    </div>}
    {meta && total > 0 && <footer className="table-footer"><span className="muted">Showing {(page - 1) * size + 1}-{Math.min(page * size, total)} of {total}</span><nav className="pagination" aria-label="Employee pages"><button className="page-button" title="Previous page" aria-label="Previous page" disabled={page <= 1 || directory.loading} onClick={() => setPage(page - 1)}><ChevronLeft size={19} /></button>{pageNumbers.map((number, index) => <span className="page-slot" key={number}>{index > 0 && number - pageNumbers[index - 1] > 1 && <span className="page-ellipsis">...</span>}<button className={`page-button ${number === page ? 'current' : ''}`} aria-label={`Page ${number}`} aria-current={number === page ? 'page' : undefined} onClick={() => setPage(number)}>{number}</button></span>)}<button className="page-button" title="Next page" aria-label="Next page" disabled={page >= pages || directory.loading} onClick={() => setPage(page + 1)}><ChevronRight size={19} /></button></nav><label className="rows-label">Rows<select aria-label="Rows per page" value={size} onChange={(event) => setSize(Number(event.target.value))}>{[8, 16, 25, 50].map((value) => <option key={value}>{value}</option>)}</select></label></footer>}
    {showFilters && <FilterDialog filters={filters} options={options} apply={changeFilters} close={() => setShowFilters(false)} />}
  </>;
}

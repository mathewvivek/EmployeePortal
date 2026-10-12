import { useEffect, useState } from 'react';
import { CheckCircle2, ChevronRight, History, LayoutDashboard, Menu, Moon, RefreshCw, Search, Settings2, Sun, UsersRound, Wallet, X } from 'lucide-react';
import { api, currencies, emptyFilters } from './api';
import type { Employee } from './api';
import DirectoryView from './DirectoryView';
import HistoryView from './HistoryView';
import InsightsView from './InsightsView';
import SalaryDrawer from './SalaryDrawer';
import NewEmployeeDrawer from './NewEmployeeDrawer';
import { Modal, useResource } from './ui';

type View = 'overview' | 'employees' | 'compensation' | 'history';
type Theme = 'dark' | 'light' | 'system';
const navigation = [
  { key: 'overview' as const, label: 'Overview', icon: LayoutDashboard },
  { key: 'employees' as const, label: 'Employees', icon: UsersRound },
  { key: 'compensation' as const, label: 'Compensation', icon: Wallet },
  { key: 'history' as const, label: 'Salary history', icon: History },
];

function readPreference(key: string, fallback: string) {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}

export default function App() {
  const [view, setView] = useState<View>('employees');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState(emptyFilters);
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<Employee>();
  const [newEmployee, setNewEmployee] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [settings, setSettings] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = readPreference('portal-theme', 'dark');
    return saved === 'light' || saved === 'system' ? saved : 'dark';
  });
  const [pageSize, setPageSize] = useState(() => {
    const saved = Number(readPreference('portal-page-size', '8'));
    return [8, 16, 25, 50].includes(saved) ? saved : 8;
  });
  const [currency, setCurrency] = useState(() => readPreference('portal-currency', 'USD'));
  const [notice, setNotice] = useState('');
  const options = useResource((signal) => api.insights({}, signal), [revision]);

  useEffect(() => { const timeout = setTimeout(() => setSearch(query.trim()), 300); return () => clearTimeout(timeout); }, [query]);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => document.documentElement.setAttribute('data-theme', theme === 'system' ? (media.matches ? 'dark' : 'light') : theme);
    update(); media.addEventListener('change', update);
    try { localStorage.setItem('portal-theme', theme); localStorage.setItem('portal-page-size', String(pageSize)); localStorage.setItem('portal-currency', currency); } catch { /* Preferences are optional in private browsing. */ }
    return () => media.removeEventListener('change', update);
  }, [theme, pageSize, currency]);
  useEffect(() => { if (!notice) return; const timeout = setTimeout(() => setNotice(''), 5000); return () => clearTimeout(timeout); }, [notice]);

  const navigate = (next: View) => { setView(next); setMobileMenu(false); };
  const title = navigation.find((item) => item.key === view)?.label || 'Employees';

  return <div className="app-shell">
    {mobileMenu && <button className="mobile-shade" aria-label="Close navigation" onClick={() => setMobileMenu(false)} />}
    <aside className={`sidebar ${mobileMenu ? 'open' : ''}`} aria-label="Main navigation">
      <button className="brand" onClick={() => navigate('overview')}><span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span><span><strong>Employee Portal</strong><small>People & compensation</small></span></button>
      <div className="workspace-label">WORKSPACE</div>
      <nav className="main-navigation">{navigation.map(({ key, label, icon: Icon }) => <button key={key} className={view === key ? 'active' : ''} aria-current={view === key ? 'page' : undefined} onClick={() => navigate(key)}><span className="nav-icon"><Icon size={19} /></span>{label}{view === key && <span className="nav-active-dot" />}</button>)}</nav>
      <div className="sidebar-bottom"><button className="settings-link" onClick={() => { setSettings(true); setMobileMenu(false); }}><Settings2 size={20} />Settings</button><div className="workspace-status"><span className={options.error ? 'offline-dot' : 'online-dot'} /><span>{options.error ? 'Workspace unavailable' : 'People workspace'}</span></div></div>
    </aside>
    <div className="workspace">
      <header className="topbar"><button className="icon-button mobile-menu-button" aria-label="Open navigation" title="Navigation" onClick={() => setMobileMenu(true)}><Menu size={22} /></button><label className="search-field global-search"><Search size={20} /><input aria-label="Search employees" placeholder="Search employees..." value={query} onChange={(event) => { setQuery(event.target.value); if (view !== 'employees') setView('employees'); }} />{query && <button className="search-clear" title="Clear search" aria-label="Clear search" onClick={() => setQuery('')}><X size={15} /></button>}</label><div className="header-actions"><button className="icon-button round-button" title="Refresh workspace" aria-label="Refresh workspace" onClick={() => setRevision((value) => value + 1)}><RefreshCw size={18} className={options.loading ? 'spin' : ''} /></button><button className="icon-button round-button theme-toggle" title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button><button className="profile" onClick={() => setSettings(true)} aria-label="Workspace settings"><img src="/hr-avatar.jpg" width="40" height="40" alt="" /><span><strong>People team</strong><small>HR workspace</small></span></button></div></header>
      <main><div className="breadcrumb">Workspace<ChevronRight size={13} /><span>{title}</span></div><div className="page-heading"><h1>{view === 'employees' ? 'Employee directory' : view === 'compensation' ? 'Employee compensation' : title}</h1><span className="workspace-pill"><span />People operations</span></div><div className="tabs section-tabs" role="tablist" aria-label="Workspace views">{navigation.slice(1).map(({ key, label }) => <button key={key} role="tab" aria-selected={view === key} className={view === key ? 'active' : ''} onClick={() => navigate(key)}>{label}</button>)}</div>
        {view === 'employees' && <DirectoryView query={search} filters={filters} changeFilters={setFilters} clearSearch={() => setQuery('')} options={options.data?.data} revision={revision} pageSize={pageSize} selectEmployee={setSelected} addEmployee={() => setNewEmployee(true)} />}
        {(view === 'overview' || view === 'compensation') && <InsightsView overview={view === 'overview'} filters={filters} changeFilters={setFilters} options={options.data?.data} revision={revision} defaultCurrency={currency} />}
        {view === 'history' && <HistoryView revision={revision} />}
        <footer className="workspace-footer"><span>Employee Portal</span><span>People operations</span></footer>
      </main>
    </div>
    {selected && <SalaryDrawer key={selected.id} employee={selected} close={() => setSelected(undefined)} updated={() => { setSelected(undefined); setRevision((value) => value + 1); setNotice('Salary updated successfully'); }} />}
    {newEmployee && <NewEmployeeDrawer preferredCurrency={currency} close={() => setNewEmployee(false)} created={(employee) => {
      setNewEmployee(false); setFilters(emptyFilters); setQuery(employee.employee_id); setSearch(employee.employee_id);
      setRevision((value) => value + 1); setNotice(`${employee.name} added successfully`);
    }} />}
    {settings && <Modal title="Workspace settings" close={() => setSettings(false)}><div className="form-fields"><fieldset className="theme-setting"><legend>Appearance</legend><div className="tabs">{(['dark', 'light', 'system'] as const).map((value) => <button className={theme === value ? 'active' : ''} key={value} onClick={() => setTheme(value)}>{value[0].toUpperCase() + value.slice(1)}</button>)}</div></fieldset><label>Default rows per page<select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>{[8, 16, 25, 50].map((value) => <option key={value}>{value}</option>)}</select></label><label>Preferred currency<select value={currency} onChange={(event) => setCurrency(event.target.value)}>{currencies.map((code) => <option key={code}>{code}</option>)}</select></label></div><footer className="modal-footer"><button className="button primary" onClick={() => setSettings(false)}><CheckCircle2 size={17} />Done</button></footer></Modal>}
    {notice && <div className="toast" role="status"><CheckCircle2 size={19} />{notice}<button className="icon-button" title="Dismiss notification" aria-label="Dismiss notification" onClick={() => setNotice('')}><X size={16} /></button></div>}
  </div>;
}

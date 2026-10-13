import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, Save, UserPlus } from 'lucide-react';
import { api, ApiError, currencies } from './api';
import type { Employee, EmployeeDetails, EmployeeInput } from './api';
import { Modal, State, useResource } from './ui';

const textFields = [['employee_id', 'Employee ID'], ['name', 'Full name'], ['designation', 'Designation']] as const;
const requiredDetails = ['employee_id', 'name', 'department', 'country', 'designation'] as const;

export default function EmployeeFormDrawer({ employee: initial, preferredCurrency = 'USD', close, saved }: {
  employee?: Employee; preferredCurrency?: string; close: () => void; saved: (employee: Employee) => void;
}) {
  const editing = !!initial;
  const prefix = editing ? 'edit' : 'new';
  const form = useRef<HTMLFormElement>(null);
  const submitting = useRef(false);
  const options = useResource((signal) => api.employeeOptions(signal), []);
  const [employee, setEmployee] = useState<EmployeeInput>(() => {
    if (initial) return { ...initial };
    const today = new Date();
    const effective_date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return { employee_id: '', name: '', department: '', country: '', designation: '', status: 'active',
      base_salary: '', currency: currencies.includes(preferredCurrency) ? preferredCurrency : 'USD', effective_date };
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const countries = [...new Set([...(options.data?.data.countries || []), employee.country].filter(Boolean))].sort();
  const departments = [...new Set([...(options.data?.data.departments || []), employee.department].filter(Boolean))].sort();
  const unchanged = initial && [...requiredDetails, 'status' as const].every((field) => employee[field] === initial[field]);
  useEffect(() => {
    if (saving) return;
    const first = Object.keys(errors).find((field) => errors[field]?.length);
    const control = first && form.current?.elements.namedItem(first);
    if (control instanceof HTMLElement) control.focus();
  }, [errors, saving]);
  const change = (field: keyof EmployeeInput, value: string) => {
    setEmployee((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => ({ ...previous, [field]: [] })); setError('');
  };
  const attributes = (field: keyof EmployeeInput) => ({
    name: field, disabled: saving, required: true, value: employee[field],
    'aria-labelledby': `${prefix}-${field}-label`,
    'aria-invalid': errors[field]?.length ? true : undefined,
    'aria-describedby': errors[field]?.length ? `${prefix}-${field}-error` : undefined,
  });
  const fieldError = (field: keyof EmployeeInput) => errors[field]?.length
    ? <span className="field-error" id={`${prefix}-${field}-error`}>{errors[field].join(', ')}</span> : null;
  const submit = async () => {
    if (submitting.current || options.loading || !options.data) return;
    const draft = { ...employee };
    const blanks: Record<string, string[]> = {};
    requiredDetails.forEach((field) => { draft[field] = draft[field].trim(); if (!draft[field]) blanks[field] = ["can't be blank"]; });
    if (Object.keys(blanks).length) { setErrors(blanks); return; }
    submitting.current = true; setSaving(true); setErrors({}); setError('');
    try {
      const details: EmployeeDetails = { employee_id: draft.employee_id, name: draft.name, department: draft.department,
        country: draft.country, designation: draft.designation, status: draft.status };
      const result = initial ? await api.updateEmployee(initial.id, details) : await api.createEmployee(draft);
      saved(result.data);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The employee could not be saved.');
      if (failure instanceof ApiError) setErrors(failure.fieldErrors);
    } finally { submitting.current = false; setSaving(false); }
  };
  return <Modal title={editing ? 'Edit employee' : 'New employee'} drawer close={() => { if (!submitting.current) close(); }}>
    <form ref={form} onSubmit={(event) => { event.preventDefault(); void submit(); }} aria-busy={saving}>
      <div className="drawer-body new-employee-body">
        <h3>Employee details</h3>
        {options.error && <State error={options.error} retry={options.reload} />}
        <div className="form-fields">
          {textFields.map(([field, label]) => <label key={field}><span id={`${prefix}-${field}-label`}>{label}</span><input {...attributes(field)} onChange={(event) => change(field, event.target.value)} />{fieldError(field)}</label>)}
          {([['department', 'Department', departments], ['country', 'Country', countries]] as const).map(([field, label, values]) => <label key={field}><span id={`${prefix}-${field}-label`}>{label}</span><select {...attributes(field)} disabled={saving || options.loading || !options.data} onChange={(event) => change(field, event.target.value)}><option value="">{options.loading ? 'Loading...' : `Select ${label.toLowerCase()}`}</option>{values.map((value) => <option key={value}>{value}</option>)}</select>{fieldError(field)}</label>)}
          <label><span id={`${prefix}-status-label`}>Status</span><select {...attributes('status')} onChange={(event) => change('status', event.target.value)}><option value="active">Active</option><option value="inactive">Inactive</option></select>{fieldError('status')}</label>
        </div>
        {!editing && <><h3>Compensation</h3><div className="form-fields">
          <label><span id="new-base_salary-label">Base salary</span><input {...attributes('base_salary')} type="number" min="0" step="0.01" onChange={(event) => change('base_salary', event.target.value)} />{fieldError('base_salary')}</label>
          <div className="form-row"><label><span id="new-currency-label">Currency</span><select {...attributes('currency')} onChange={(event) => change('currency', event.target.value)}>{currencies.map((code) => <option key={code}>{code}</option>)}</select>{fieldError('currency')}</label>
            <label><span id="new-effective_date-label">Effective date</span><input {...attributes('effective_date')} type="date" onChange={(event) => change('effective_date', event.target.value)} />{fieldError('effective_date')}</label></div>
        </div></>}
        {error && <p role="alert" className="error-message">{error}</p>}
      </div>
      <footer className="modal-footer"><button type="button" className="button" disabled={saving} onClick={close}>Cancel</button><button className="button primary" disabled={saving || options.loading || !options.data || !!unchanged}>{saving ? <LoaderCircle size={17} className="spin" /> : editing ? <Save size={17} /> : <UserPlus size={17} />}{saving ? 'Saving employee...' : editing ? 'Save changes' : 'Add employee'}</button></footer>
    </form>
  </Modal>;
}

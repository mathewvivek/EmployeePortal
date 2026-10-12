import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, UserPlus } from 'lucide-react';
import { api, ApiError, currencies } from './api';
import type { Employee, EmployeeInput } from './api';
import { Modal } from './ui';

const textFields = [
  ['employee_id', 'Employee ID'], ['name', 'Full name'], ['department', 'Department'],
  ['designation', 'Designation'], ['country', 'Country'],
] as const;

export default function NewEmployeeDrawer({ preferredCurrency, close, created }: {
  preferredCurrency: string; close: () => void; created: (employee: Employee) => void;
}) {
  const form = useRef<HTMLFormElement>(null);
  const submitting = useRef(false);
  const [employee, setEmployee] = useState<EmployeeInput>(() => {
    const today = new Date();
    const effective_date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return { employee_id: '', name: '', department: '', country: '', designation: '', status: 'active',
      base_salary: '', currency: currencies.includes(preferredCurrency) ? preferredCurrency : 'USD', effective_date };
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  useEffect(() => {
    if (saving) return;
    const first = Object.keys(errors).find((field) => errors[field]?.length);
    if (!first) return;
    const control = form.current?.elements.namedItem(first);
    if (control instanceof HTMLElement) control.focus();
  }, [errors, saving]);
  const change = (field: keyof EmployeeInput, value: string) => {
    setEmployee((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => ({ ...previous, [field]: [] }));
    setError('');
  };
  const showErrors = (fields: Record<string, string[]>) => {
    setErrors(fields);
  };
  const attributes = (field: keyof EmployeeInput) => ({
    name: field, disabled: saving, required: true, value: employee[field],
    'aria-labelledby': `new-${field}-label`,
    'aria-invalid': errors[field]?.length ? true : undefined,
    'aria-describedby': errors[field]?.length ? `new-${field}-error` : undefined,
  });
  const fieldError = (field: keyof EmployeeInput) => errors[field]?.length
    ? <span className="field-error" id={`new-${field}-error`}>{errors[field].join(', ')}</span> : null;
  const submit = async () => {
    if (submitting.current) return;
    const draft = { ...employee };
    const blanks: Record<string, string[]> = {};
    textFields.forEach(([field]) => {
      draft[field] = draft[field].trim();
      if (!draft[field]) blanks[field] = ["can't be blank"];
    });
    if (Object.keys(blanks).length) { showErrors(blanks); return; }
    submitting.current = true; setSaving(true); setErrors({}); setError('');
    try { const result = await api.createEmployee(draft); created(result.data); }
    catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The employee could not be added.');
      if (failure instanceof ApiError) showErrors(failure.fieldErrors);
    } finally { submitting.current = false; setSaving(false); }
  };

  return <Modal title="New employee" drawer close={() => { if (!submitting.current) close(); }}>
    <form ref={form} onSubmit={(event) => { event.preventDefault(); void submit(); }} aria-busy={saving}>
      <div className="drawer-body new-employee-body">
        <h3>Employee details</h3>
        <div className="form-fields">
          {textFields.map(([field, label]) => <label key={field}><span id={`new-${field}-label`}>{label}</span><input {...attributes(field)} onChange={(event) => change(field, event.target.value)} />{fieldError(field)}</label>)}
          <label><span id="new-status-label">Status</span><select {...attributes('status')} onChange={(event) => change('status', event.target.value)}><option value="active">Active</option><option value="inactive">Inactive</option></select>{fieldError('status')}</label>
        </div>
        <h3>Compensation</h3>
        <div className="form-fields">
          <label><span id="new-base_salary-label">Base salary</span><input {...attributes('base_salary')} type="number" min="0" step="0.01" onChange={(event) => change('base_salary', event.target.value)} />{fieldError('base_salary')}</label>
          <div className="form-row"><label><span id="new-currency-label">Currency</span><select {...attributes('currency')} onChange={(event) => change('currency', event.target.value)}>{currencies.map((code) => <option key={code}>{code}</option>)}</select>{fieldError('currency')}</label>
            <label><span id="new-effective_date-label">Effective date</span><input {...attributes('effective_date')} type="date" onChange={(event) => change('effective_date', event.target.value)} />{fieldError('effective_date')}</label></div>
        </div>
        {error && <p role="alert" className="error-message">{error}</p>}
      </div>
      <footer className="modal-footer"><button type="button" className="button" disabled={saving} onClick={close}>Cancel</button><button className="button primary" disabled={saving}>{saving ? <LoaderCircle size={17} className="spin" /> : <UserPlus size={17} />}{saving ? 'Adding employee...' : 'Add employee'}</button></footer>
    </form>
  </Modal>;
}

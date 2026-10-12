import { useRef, useState } from 'react';
import { Eye, EyeOff, LoaderCircle, LogIn, ShieldCheck } from 'lucide-react';
import { api } from './api';
import type { AuthSession } from './api';

export default function Login({ signedIn, notice }: { signedIn: (session: AuthSession) => void; notice?: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);

  const submit = async () => {
    if (submitting.current) return;
    submitting.current = true;
    setSaving(true); setError('');
    try { const result = await api.login(email.trim(), password); signedIn(result.data); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Sign-in could not be completed.'); }
    finally { submitting.current = false; setSaving(false); }
  };

  return <div className="login-page">
    <header className="login-header"><div className="brand"><span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span><span><strong>Employee Portal</strong><small>People & compensation</small></span></div><span className="login-workspace"><ShieldCheck size={17} />HR workspace</span></header>
    <main className="login-main"><div className="login-form-wrap"><span className="login-icon"><ShieldCheck size={25} /></span><h1>Sign in</h1><p className="muted">Employee Portal</p>
      {notice && <p className="login-notice" role="status">{notice}</p>}
      <form onSubmit={(event) => { event.preventDefault(); void submit(); }} aria-busy={saving}>
        <div className="form-fields"><label>Email<input type="email" name="email" autoComplete="username" required value={email} disabled={saving} onChange={(event) => { setEmail(event.target.value); setError(''); }} /></label>
          <label><span id="login-password-label">Password</span><div className="password-field"><input aria-labelledby="login-password-label" type={visible ? 'text' : 'password'} name="password" autoComplete="current-password" required value={password} disabled={saving} onChange={(event) => { setPassword(event.target.value); setError(''); }} /><button type="button" className="icon-button" title={visible ? 'Hide password' : 'Show password'} aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible} disabled={saving} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
        </div>
        {error && <p className="error-message login-error" role="alert">{error}</p>}
        <button className="button primary login-submit" disabled={saving}>{saving ? <LoaderCircle size={18} className="spin" /> : <LogIn size={18} />}{saving ? 'Signing in...' : 'Sign in'}</button>
      </form>
    </div></main>
    <footer className="login-footer">Employee Portal<span>People operations</span></footer>
  </div>;
}

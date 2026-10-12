import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { api, ApiError, setAuthToken } from './api';
import type { AuthSession, AuthUser } from './api';
import Login from './Login';
import { State } from './ui';

const sessionKey = 'portal-session';

function storedSession(): AuthSession | undefined {
  try {
    const raw = sessionStorage.getItem(sessionKey);
    if (!raw) return;
    const session = JSON.parse(raw);
    if (typeof session.token === 'string' && Date.parse(session.expires_at) > Date.now()) return session;
    sessionStorage.removeItem(sessionKey);
  } catch { /* Authentication can still work without browser storage. */ }
}

function persist(session?: AuthSession) {
  setAuthToken(session?.token);
  try {
    if (session) sessionStorage.setItem(sessionKey, JSON.stringify(session));
    else sessionStorage.removeItem(sessionKey);
  } catch { /* A private-browsing session remains usable until reload. */ }
}

export default function AuthGate({ children }: { children: (user: AuthUser, logout: () => Promise<void>) => ReactNode }) {
  const [restore, setRestore] = useState(storedSession);
  const [session, setSession] = useState<AuthSession>();
  const [checking, setChecking] = useState(!!restore);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const clear = () => { persist(); setSession(undefined); setRestore(undefined); setChecking(false); setError(''); };

  useEffect(() => {
    const expired = () => { clear(); setNotice('Your session has expired. Please sign in again.'); };
    window.addEventListener('portal:session-expired', expired);
    return () => window.removeEventListener('portal:session-expired', expired);
  }, []);

  useEffect(() => {
    if (!restore) return;
    const controller = new AbortController();
    setAuthToken(restore.token); setChecking(true); setError('');
    api.session(controller.signal).then(({ data }) => {
      if (controller.signal.aborted) return;
      const verified = { ...data, token: restore.token };
      persist(verified); setSession(verified); setChecking(false);
    }).catch((failure: Error) => {
      if (controller.signal.aborted) return;
      setChecking(false);
      if (failure instanceof ApiError && failure.status === 401) { clear(); setNotice('Please sign in again.'); }
      else setError(failure.message);
    });
    return () => controller.abort();
  }, [restore, revision]);

  useEffect(() => {
    if (!session) return;
    const delay = Date.parse(session.expires_at) - Date.now();
    const timeout = setTimeout(() => { clear(); setNotice('Your session has expired. Please sign in again.'); }, Math.max(0, delay));
    return () => clearTimeout(timeout);
  }, [session]);

  if (checking) return <div className="auth-check"><State loading /></div>;
  if (error && restore) return <div className="auth-check"><State error={error} retry={() => setRevision((value) => value + 1)} /><button className="button" onClick={clear}>Back to sign in</button></div>;
  if (!session) return <Login notice={notice} signedIn={(next) => { persist(next); setRestore(undefined); setSession(next); setNotice(''); }} />;
  return children(session.user, async () => { await api.logout(); clear(); setNotice('You have signed out.'); });
}

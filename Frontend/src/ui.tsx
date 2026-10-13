import { useEffect, useRef, useState } from 'react';
import type { DependencyList, ReactNode } from 'react';
import { AlertCircle, LoaderCircle, SearchX, X } from 'lucide-react';
import { initials } from './api';

export function useResource<T>(load: (signal: AbortSignal) => Promise<T>, dependencies: DependencyList) {
  const [state, setState] = useState<{ data?: T; loading: boolean; error: string }>({ loading: true, error: '' });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState((previous) => ({ ...previous, loading: true, error: '' }));
    load(controller.signal).then((data) => {
      if (!controller.signal.aborted) setState({ data, loading: false, error: '' });
    }).catch((error: Error) => {
      if (!controller.signal.aborted) setState((previous) => ({ ...previous, loading: false, error: error.message }));
    });
    return () => controller.abort();
    // Callers provide the inputs used by their request, including refresh revisions.
  }, [...dependencies, revision]);
  return { ...state, reload: () => setRevision((value) => value + 1) };
}

export function Avatar({ name, id = 0, large = false }: { name: string; id?: number; large?: boolean }) {
  return <span aria-hidden="true" className={`avatar avatar-${id % 6} ${large ? 'avatar-large' : ''}`}>{initials(name)}</span>;
}

export function Status({ status }: { status: string }) {
  return <span className={`status status-${status}`}><span />{status === 'active' ? 'Active' : 'Inactive'}</span>;
}

export function State({ loading, error, empty, retry }: { loading?: boolean; error?: string; empty?: string; retry?: () => void }) {
  return <div className="state" role={error ? 'alert' : 'status'}>
    {loading ? <LoaderCircle className="spin" size={28} /> : error ? <AlertCircle size={28} /> : <SearchX size={28} />}
    <strong>{loading ? 'Loading workspace' : error ? 'Something went wrong' : empty || 'No results found'}</strong>
    {error && <><p>{error}</p><button className="button" onClick={retry}>Try again</button></>}
  </div>;
}

export function Modal({ title, children, close, drawer = false }: { title: string; children: ReactNode; close: () => void; drawer?: boolean }) {
  const panel = useRef<HTMLDivElement>(null);
  const onClose = useRef(close);
  onClose.current = close;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose.current();
      if (event.key !== 'Tab') return;
      const controls = [...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') || [])];
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) {
        event.preventDefault(); first?.focus();
      }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, []);
  return <div className={`overlay ${drawer ? 'drawer-overlay' : ''}`} onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <div className={`modal ${drawer ? 'drawer' : ''}`} ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}>
      <header className="modal-header"><h2>{title}</h2><button className="icon-button" aria-label={`Close ${title}`} title="Close" onClick={close}><X size={20} /></button></header>
      {children}
    </div>
  </div>;
}

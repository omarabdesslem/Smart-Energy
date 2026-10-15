import { useEffect, useRef, type ReactNode } from 'react';
import { AlertCircle, ArrowUpRight, LoaderCircle, X } from 'lucide-react';

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'green' | 'orange' | 'red' }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  if (!error) return null;
  return <div className="error-box" role="alert"><AlertCircle size={17}/><span>{error instanceof Error ? error.message : 'Something went wrong.'}</span>{retry && <button onClick={retry}>Try again</button>}</div>;
}
export function Loading() { return <div className="loading" role="status"><LoaderCircle size={22} className="spin"/> Loading workspace…</div>; }
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty"><div className="empty-icon"><ArrowUpRight size={24}/></div><h3>{title}</h3>{children}</div>;
}
export function Modal({ title, description, onClose, children }: { title: string; description?: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return <dialog ref={ref} className="modal" aria-labelledby="modal-title" onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="modal-heading"><div><h2 id="modal-title">{title}</h2>{description && <p>{description}</p>}</div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={20}/></button></div>{children}
  </dialog>;
}
export const date = (value: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));

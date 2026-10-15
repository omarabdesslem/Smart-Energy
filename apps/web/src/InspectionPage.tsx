import { useRef, useState, type PointerEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowDownToLine, ArrowLeft, Check, CheckCircle2, ChevronRight, Clock3, LoaderCircle, Maximize, MousePointer2, Plus, RotateCcw, ScanLine, UploadCloud, X } from 'lucide-react';
import { checklistLabels, labels, type Box, type Finding, type InspectionDetail, type Photo } from '@energy/contracts';
import { api, uploadPhoto, useAction } from './api';
import { Badge, date, Empty, ErrorBox, Loading, Modal } from './ui';

type Upload = { file: File; progress: number; state: 'queued' | 'uploading' | 'done' | 'failed'; error?: string };
function Uploader({ inspectionId, disabled }: { inspectionId: string; disabled: boolean }) {
  const [uploads, setUploads] = useState<Upload[]>([]), [dragging, setDragging] = useState(false);
  const busy = useRef(false), input = useRef<HTMLInputElement>(null);
  const cache = useQueryClient();
  const update = (index: number, patch: Partial<Upload>) => setUploads(old => old.map((u, n) => n === index ? { ...u, ...patch } : u));
  async function run(items: Upload[], indices: number[]) {
    if (busy.current || disabled) return;
    busy.current = true;
    try {
      for (const index of indices) {
        const file = items[index].file;
        if (file.size > 15 * 1024 * 1024 || !['image/jpeg', 'image/png'].includes(file.type)) {
          update(index, { state: 'failed', error: 'Choose a JPEG or PNG up to 15 MB.' }); continue;
        }
        update(index, { state: 'uploading', progress: 0, error: undefined });
        try { await uploadPhoto(inspectionId, file, progress => update(index, { progress })); update(index, { state: 'done', progress: 100 }); await cache.invalidateQueries(); }
        catch (error) { update(index, { state: 'failed', error: error instanceof Error ? error.message : 'Upload failed.' }); }
      }
    } finally { busy.current = false; }
  }
  function choose(files: FileList | null) {
    if (!files?.length || busy.current || disabled) return;
    const items: Upload[] = Array.from(files).map(file => ({ file, progress: 0, state: 'queued' }));
    setUploads(items); void run(items, items.map((_, n) => n));
  }
  const active = uploads.some(u => u.state === 'uploading' || u.state === 'queued');
  return <div className="upload-section"><input ref={input} id="photo-upload" aria-label="Upload installation photos" className="sr-only" type="file" accept="image/jpeg,image/png" multiple disabled={disabled || active} onChange={e => { choose(e.target.files); e.target.value = ''; }}/>
    <button className={`drop-zone ${dragging ? 'dragging' : ''}`} disabled={disabled || active} onClick={() => input.current?.click()} onDragOver={e => { e.preventDefault(); if (!disabled) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); choose(e.dataTransfer.files); }}>
      <span className="upload-icon">{active ? <LoaderCircle size={23} className="spin"/> : <UploadCloud size={23}/>}</span><span><strong>{disabled ? 'Inspection completed' : active ? 'Uploading installation photos…' : 'Drop installation photos here, or browse'}<span className="upload-subtitle">{disabled ? 'Reopen to add photos or edit findings.' : 'JPEG or PNG · Up to 15 MB each · 40 megapixels maximum'}</span></strong></span>{!disabled && !active && <Plus size={19}/>}</button>
    {!!uploads.length && <div className="upload-progress" aria-live="polite">{uploads.map((u, n) => <div key={`${n}-${u.file.name}`}><span className="upload-filename">{u.state === 'done' ? <CheckCircle2 size={15}/> : u.state === 'failed' ? <AlertTriangle size={15}/> : <LoaderCircle size={15} className="spin"/>}{u.file.name}</span>{u.state === 'uploading' && <span>{u.progress === 100 ? 'Saving…' : `${u.progress}%`}</span>}{u.state === 'done' && <span className="success-text">Uploaded</span>}{u.state === 'failed' && <><span className="upload-error">{u.error}</span><button className="text-link" disabled={active || disabled} onClick={() => void run(uploads, [n])}>Retry</button></>}</div>)}</div>}
  </div>;
}

function PhotoViewer({ photo, selected, onSelect, disabled }: { photo: Photo; selected: string | null; onSelect: (id: string) => void; disabled: boolean }) {
  const [drawing, setDrawing] = useState(false), [draft, setDraft] = useState<Box | null>(null), [pendingBox, setPendingBox] = useState<Box | null>(null), [zoom, setZoom] = useState(100);
  const start = useRef<{ x: number; y: number } | null>(null);
  const [imageError, setImageError] = useState(false), [loaded, setLoaded] = useState(false);
  const action = useAction(async (data: { label: string; notes: string }) => api<{ id: string }>(`/photos/${photo.id}/findings`, { method: 'POST', body: JSON.stringify({ ...data, box: pendingBox }) }));
  function point(e: PointerEvent<HTMLDivElement>) { const r = e.currentTarget.getBoundingClientRect(); return { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) }; }
  function down(e: PointerEvent<HTMLDivElement>) {
    if (!drawing || disabled || !loaded || e.button !== 0) return;
    e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); start.current = point(e); setDraft(null);
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    if (!start.current || !drawing) return;
    const p = point(e), s = start.current;
    setDraft({ x: Math.min(p.x, s.x), y: Math.min(p.y, s.y), width: Math.abs(p.x - s.x), height: Math.abs(p.y - s.y) });
  }
  function up(e: PointerEvent<HTMLDivElement>) {
    if (!start.current) return;
    const p = point(e), s = start.current;
    const box = { x: Math.min(p.x, s.x), y: Math.min(p.y, s.y), width: Math.abs(p.x - s.x), height: Math.abs(p.y - s.y) };
    if (box.width > .01 && box.height > .01) setPendingBox(box);
    start.current = null; setDraft(null);
  }
  const position = (b: Box) => ({ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.width * 100}%`, height: `${b.height * 100}%` });
  return <><div className="viewer-toolbar"><span><ScanLine size={17}/>Photo review</span><div><button className={`button compact ${drawing ? 'primary' : 'secondary'}`} disabled={disabled || !loaded} onClick={() => setDrawing(!drawing)}><MousePointer2 size={14}/>{drawing ? 'Drawing enabled' : 'Draw finding'}</button><label className="zoom-label"><span className="sr-only">Photo zoom</span><select value={zoom} onChange={e => setZoom(Number(e.target.value))}><option value={100}>Fit</option><option value={150}>150%</option><option value={200}>200%</option></select></label></div></div>
    {drawing && <div className="draw-hint">Drag a box around the area to annotate.<button className="text-link" disabled={disabled || !loaded} onClick={() => setPendingBox({ x: 0, y: 0, width: 1, height: 1 })}>Use whole photo</button></div>}
    <div className="photo-scroll"><div className={`photo-stage ${drawing ? 'drawing' : ''}`} style={{ width: `${zoom}%` }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { start.current = null; setDraft(null); }}>
      {imageError ? <ErrorBox error={new Error('Photo could not be loaded. Check the API and photo storage.')}/> : <img src={`/api/photos/${photo.id}/file`} alt={`Installation photo: ${photo.filename}`} draggable={false} onLoad={() => setLoaded(true)} onError={() => setImageError(true)}/>}
      {loaded && photo.findings.map((f, n) => <button key={f.id} className={`finding-box ${selected === f.id ? 'selected' : ''} ${f.decision === 'rejected' ? 'rejected' : f.resolved ? 'resolved' : ''}`} style={position(f.box)} disabled={drawing} onClick={() => onSelect(f.id)} aria-label={`Select finding ${n + 1}: ${f.label}`}><span>{n + 1}</span></button>)}
      {draft && <div className="finding-box draft" style={position(draft)}/>}</div></div>
    <div className="photo-caption"><span>{photo.filename}</span><span>{photo.width} × {photo.height}{photo.is_demo ? ' · Synthetic demo image' : ' · Manual review'}</span></div>
    {!drawing && !disabled && <div className="keyboard-annotation"><button className="text-link" disabled={!loaded} onClick={() => setPendingBox({ x: 0, y: 0, width: 1, height: 1 })}><Plus size={14}/>Add a finding for the whole photo</button></div>}
    {pendingBox && <Modal title="Add a finding" description="Record what you can observe in this image." onClose={() => { setPendingBox(null); action.reset(); }}><form onSubmit={e => { e.preventDefault(); const form = new FormData(e.currentTarget); action.mutate({ label: String(form.get('label')), notes: String(form.get('notes')) }, { onSuccess: result => { setPendingBox(null); setDrawing(false); onSelect(result.id); } }); }}>
      <label>Finding type<select name="label">{labels.map(l => <option key={l}>{l}</option>)}</select></label><label>Observation<textarea name="notes" maxLength={2000} placeholder="Describe the visible issue and any context…"/></label><p className="footnote">This is a manual observation. It does not establish electrical performance.</p><ErrorBox error={action.error}/><div className="form-actions"><button className="button secondary" type="button" onClick={() => setPendingBox(null)}>Cancel</button><button className="button primary" disabled={action.isPending}>{action.isPending ? 'Saving…' : 'Save finding'}</button></div>
    </form></Modal>}
  </>;
}

function ReviewForm({ finding: f, disabled }: { finding: Finding; disabled: boolean }) {
  const [decision, setDecision] = useState(f.decision || 'accepted'), [priority, setPriority] = useState(f.priority || 'medium'), [notes, setNotes] = useState(f.review_notes || '');
  const [resolutionNotes, setResolutionNotes] = useState(f.resolution_notes || '');
  const review = useAction(async () => api(`/findings/${f.id}/reviews`, { method: 'POST', body: JSON.stringify({ decision, priority, notes }) }));
  const resolution = useAction(async () => api(`/findings/${f.id}/resolution`, { method: 'PATCH', body: JSON.stringify({ resolved: !f.resolved, notes: resolutionNotes }) }));
  return <div className="review-form"><div className="section-heading"><h3>Review decision</h3>{f.source === 'demo' && <Badge tone="orange">Demo finding</Badge>}</div>
    <p className="finding-observation">{f.notes || 'No observation notes provided.'}</p>
    <form onSubmit={e => { e.preventDefault(); review.mutate(); }}><fieldset disabled={disabled || review.isPending}><legend className="sr-only">Review this finding</legend><div className="decision-options"><label className={decision === 'accepted' ? 'chosen' : ''}><input type="radio" name="decision" value="accepted" checked={decision === 'accepted'} onChange={() => setDecision('accepted')}/><Check size={15}/>Confirm issue</label><label className={decision === 'rejected' ? 'chosen' : ''}><input type="radio" name="decision" value="rejected" checked={decision === 'rejected'} onChange={() => setDecision('rejected')}/><X size={15}/>Dismiss</label></div>
      <label>Review priority<select value={priority} onChange={e => setPriority(e.target.value as typeof priority)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label><label>Review notes<textarea maxLength={2000} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Explain your decision…"/></label><button className="button primary full-width" disabled={disabled || review.isPending}>{review.isPending ? 'Saving…' : f.decision ? 'Update review' : 'Save review'}<Check size={15}/></button></fieldset></form>
    <ErrorBox error={review.error}/>{f.decision && <p className="review-audit"><CheckCircle2 size={13}/>{f.reviewer} · {f.reviewed_at ? date(f.reviewed_at) : ''}</p>}
    {f.decision === 'accepted' && <div className="resolution-panel"><div><h4>{f.resolved ? 'Issue resolved' : 'Resolution needed'}</h4><Badge tone={f.resolved ? 'green' : 'orange'}>{f.resolved ? 'Resolved' : 'Open issue'}</Badge></div><p>{f.resolved ? 'This finding is ready for handover.' : 'Record the fix before completing this inspection.'}</p><label>Resolution notes<textarea aria-label="Resolution notes" value={resolutionNotes} maxLength={2000} disabled={disabled} onChange={e => setResolutionNotes(e.target.value)} placeholder="What was checked or corrected?"/></label><button className="button secondary full-width" disabled={disabled || resolution.isPending} onClick={() => resolution.mutate()}>{resolution.isPending ? 'Saving…' : f.resolved ? 'Reopen issue' : 'Mark as resolved'}<CheckCircle2 size={15}/></button><ErrorBox error={resolution.error}/></div>}
  </div>;
}

type Activity = { id: string; actor: string; action: string; created_at: string };
export function InspectionPage() {
  const { id } = useParams<{ id: string }>();
  const query = useQuery({ queryKey: ['inspection', id], queryFn: () => api<InspectionDetail>(`/inspections/${id}`) });
  const activity = useQuery({ queryKey: ['activity', id], queryFn: () => api<Activity[]>(`/inspections/${id}/activity`) });
  const [photoId, setPhotoId] = useState<string | null>(null), [findingId, setFindingId] = useState<string | null>(null), [tab, setTab] = useState<'photos' | 'activity'>('photos');
  const [optimisticChecklist, setOptimisticChecklist] = useState<InspectionDetail['checklist'] | null>(null);
  const status = useAction(async (next: string) => api(`/inspections/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: next }) }));
  const checklist = useAction(async (next: InspectionDetail['checklist']) => api(`/inspections/${id}/checklist`, { method: 'PATCH', body: JSON.stringify(next) }));
  if (query.isPending) return <Loading/>;
  if (query.error || !query.data) return <ErrorBox error={query.error} retry={() => void query.refetch()}/>;
  const inspection = query.data, completed = inspection.status === 'completed';
  const photo = inspection.photos.find(p => p.id === photoId) || inspection.photos[0];
  const finding = photo?.findings.find(f => f.id === findingId) || photo?.findings[0];
  const shownChecklist = optimisticChecklist || inspection.checklist;
  const checklistDone = Object.values(shownChecklist).filter(Boolean).length;
  const ready = inspection.photo_count > 0 && inspection.pending_count === 0 && inspection.open_count === 0 && checklistDone === 3 && !checklist.isPending;
  return <><Link to="/inspections" className="back-link"><ArrowLeft size={15}/>All inspections</Link><div className="page-heading detail-heading"><div><div className="inline-badges"><Badge tone={completed ? 'green' : 'orange'}>{completed ? 'Completed' : 'In review'}</Badge>{inspection.is_demo && <Badge>Sample project</Badge>}</div><h1>{inspection.site_name}</h1><p className="subtitle">{inspection.title} <span className="separator">/</span> {inspection.customer}</p></div><div className="heading-actions"><Link className="button secondary" to={`/inspections/${id}/handover`}><ArrowDownToLine size={16}/>Handover report</Link>{completed ? <button className="button secondary" disabled={status.isPending} onClick={() => status.mutate('draft')}><RotateCcw size={15}/>Reopen</button> : <button className="button primary" disabled={status.isPending || !ready} title={!ready ? 'Review findings, resolve issues, and finish the checklist first.' : 'Complete this quality review'} onClick={() => status.mutate('completed')}><CheckCheckIcon/>{status.isPending ? 'Saving…' : 'Complete review'}</button>}</div></div>
    <ErrorBox error={status.error}/><div className="inspection-meta"><span><SunIcon/>{inspection.capacity_kw} kWp solar PV</span><span>{inspection.location}</span><span><Clock3 size={14}/>{date(inspection.created_at)}</span><span>Installer: {inspection.assigned_to}</span></div>
    {inspection.is_demo && <div className="info-banner"><ScanLine size={17}/><span><strong>Sample inspection.</strong> The illustration and findings are demo data. Your own uploads support manual review; automated analysis is not connected.</span></div>}
    <div className="inspection-layout"><section className="inspection-main"><div className="card"><div className="tabs"><button className={tab === 'photos' ? 'active' : ''} onClick={() => setTab('photos')}>Installation photos<span>{inspection.photo_count}</span></button><button className={tab === 'activity' ? 'active' : ''} onClick={() => setTab('activity')}>Activity log</button></div>
      {tab === 'activity' ? <div className="activity-list">{activity.isPending ? <Loading/> : activity.error ? <ErrorBox error={activity.error}/> : activity.data?.map(a => <div className="activity-item" key={a.id}><span className="activity-dot"/><div><strong>{a.action}</strong><p>{a.actor}</p></div><time>{new Date(a.created_at).toLocaleString('en-GB')}</time></div>)}</div> : <><Uploader inspectionId={inspection.id} disabled={completed}/>{photo ? <><div className="photo-strip">{inspection.photos.map((p, n) => <button className={p.id === photo.id ? 'active' : ''} key={p.id} onClick={() => { setPhotoId(p.id); setFindingId(null); }}><img src={`/api/photos/${p.id}/file`} alt=""/><span>Photo {n + 1}</span>{p.findings.length > 0 && <small>{p.findings.length}</small>}</button>)}</div><PhotoViewer key={photo.id} photo={photo} selected={finding?.id || null} onSelect={setFindingId} disabled={completed}/></> : <Empty title="The review starts with a photo"><p>Upload an installation image to inspect it and add observations.</p></Empty>}</>}
    </div>{inspection.notes && <section className="card inspection-notes"><h3>Inspection notes</h3><p>{inspection.notes}</p></section>}</section>
    <aside className="inspection-aside"><section className="card findings-panel"><div className="section-heading"><h2>Findings</h2><Badge>{photo?.findings.length || 0}</Badge></div><div className="analysis-state"><span className="status-dot"/>Manual review · AI not connected</div>{!photo?.findings.length ? <Empty title="No findings recorded"><p>Use “Draw finding” to flag a visible issue. A photo without findings has not been certified defect-free.</p></Empty> : <><div className="finding-list">{photo.findings.map((f, n) => <button key={f.id} onClick={() => setFindingId(f.id)} className={finding?.id === f.id ? 'active' : ''}><span className={`finding-number ${f.resolved || f.decision === 'rejected' ? 'done' : ''}`}>{n + 1}</span><span><strong>{f.label}</strong><small>{f.resolved ? 'Resolved' : f.decision === 'rejected' ? 'Dismissed' : f.decision === 'accepted' ? 'Confirmed · needs resolution' : 'Awaiting review'} · {f.source}</small></span><ChevronRight size={15}/></button>)}</div>{finding && <ReviewForm key={`${finding.id}-${finding.reviewed_at}-${finding.resolved}`} finding={finding} disabled={completed}/>}</>}</section>
      <section className="card checklist-card"><div className="section-heading"><h3>Handover checklist</h3><span>{checklistDone}/3</span></div>{(Object.keys(checklistLabels) as (keyof typeof checklistLabels)[]).map(key => <label className="checklist-item" key={key}><input type="checkbox" checked={shownChecklist[key]} disabled={completed || checklist.isPending} onChange={e => { const next = { ...inspection.checklist, [key]: e.target.checked }; setOptimisticChecklist(next); checklist.mutate(next, { onSettled: () => setOptimisticChecklist(null) }); }}/><span>{checklistLabels[key]}</span></label>)}<ErrorBox error={checklist.error}/><p className="footnote">{completed ? 'Inspection completed and locked for editing.' : ready ? 'All checks are complete. Ready for handover.' : `${inspection.pending_count} pending review · ${inspection.open_count} open issues`}</p></section>
    </aside></div>
  </>;
}
function CheckCheckIcon() { return <CheckCircle2 size={16}/>; }
function SunIcon() { return <Maximize size={14}/>; }

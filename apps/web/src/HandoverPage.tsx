import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownToLine, ArrowLeft, Leaf, Printer } from 'lucide-react';
import { checklistLabels, type InspectionDetail } from '@energy/contracts';
import { api } from './api';
import { Badge, date, ErrorBox, Loading } from './ui';

export function HandoverPage() {
  const { id } = useParams();
  const query = useQuery({ queryKey: ['inspection', id], queryFn: () => api<InspectionDetail>(`/inspections/${id}`) });
  if (query.isPending) return <Loading/>;
  if (!query.data || query.error) return <ErrorBox error={query.error} retry={() => void query.refetch()}/>;
  const i = query.data;
  return <><div className="report-tools"><Link to={`/inspections/${id}`} className="back-link"><ArrowLeft size={15}/>Back to inspection</Link><div><a href={`/api/inspections/${id}/report.csv`} className="button secondary"><ArrowDownToLine size={16}/>Download CSV</a><button className="button primary" onClick={() => window.print()}><Printer size={16}/>Print / Save PDF</button></div></div>
    <article className="handover-document"><header><div className="report-brand"><Leaf size={23}/>fieldwork.</div><Badge tone={i.status === 'completed' ? 'green' : 'orange'}>{i.status === 'completed' ? 'Completed review' : 'Draft · review incomplete'}</Badge></header><p className="eyebrow">INSTALLATION QUALITY & HANDOVER</p><h1>{i.site_name}</h1><p className="subtitle">{i.title}</p><dl className="report-details"><div><dt>Customer</dt><dd>{i.customer}</dd></div><div><dt>Location</dt><dd>{i.location}</dd></div><div><dt>System capacity</dt><dd>{i.capacity_kw} kWp</dd></div><div><dt>Inspection created</dt><dd>{date(i.created_at)}</dd></div></dl>
      <p className="footnote">Assigned installer: {i.assigned_to}</p>
      {i.is_demo && <div className="info-banner">Demonstration inspection: synthetic images and sample findings. Not a real installation report.</div>}
      <h2>Handover checklist</h2><ul className="report-checklist">{(Object.keys(checklistLabels) as (keyof typeof checklistLabels)[]).map(key => <li key={key}><span>{i.checklist[key] ? '✓' : '○'}</span>{checklistLabels[key]}<strong>{i.checklist[key] ? 'Done' : 'Outstanding'}</strong></li>)}</ul>
      {i.notes && <><h2>Inspection notes</h2><p className="preserve-lines">{i.notes}</p></>}
      <h2>Photo documentation</h2>{!i.photos.length && <p>No photos uploaded.</p>}{i.photos.map((p, n) => <section className="report-photo" key={p.id}><h3>Photo {n + 1} · {p.filename}</h3><div className="report-image"><img src={`/api/photos/${p.id}/file`} alt={`Installation documentation: ${p.filename}`}/>{p.findings.map((f, m) => <span className="finding-box selected" key={f.id} style={{ left: `${f.box.x * 100}%`, top: `${f.box.y * 100}%`, width: `${f.box.width * 100}%`, height: `${f.box.height * 100}%` }}><span>{m + 1}</span></span>)}</div>{p.is_demo && <p className="footnote">Synthetic demonstration illustration.</p>}{!p.findings.length && <p>No findings recorded. This does not establish that the installation is defect-free.</p>}{p.findings.map((f, m) => <div className="report-finding" key={f.id}><div><h4>{m + 1}. {f.label}</h4><Badge tone={f.resolved || f.decision === 'rejected' ? 'green' : 'orange'}>{f.resolved ? 'Resolved' : f.decision === 'rejected' ? 'Dismissed' : f.decision === 'accepted' ? 'Open issue' : 'Pending review'}</Badge></div><p>{f.notes}</p><dl><dt>Source</dt><dd>{f.source}{f.model_version ? ` · ${f.model_version}` : ''}</dd><dt>Priority</dt><dd>{f.priority || 'Not assigned'}</dd><dt>Review</dt><dd>{f.review_notes || 'No review notes'}{f.reviewer ? ` · ${f.reviewer}` : ''}{f.reviewed_at ? ` · ${date(f.reviewed_at)}` : ''}</dd><dt>Resolution</dt><dd>{f.resolution_notes || 'No resolution notes'}</dd></dl></div>)}</section>)}
      <footer><p>This report records visible observations and human review decisions. Automated image analysis is not connected; electrical performance has not been assessed.</p><span>Independent prototype · Inspection {i.id}</span></footer>
    </article></>;
}

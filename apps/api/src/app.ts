import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { z, ZodError } from 'zod';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, unlink, writeFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
import type { PoolClient } from 'pg';
import { checklistInput, findingInput, inspectionInput, reviewInput, siteInput, type InspectionDetail } from '@energy/contracts';
import { pool, editable, transaction, ApiError, inspectionSelect, findingSelect } from './db.js';

const uuid = z.string().uuid();
const actor = 'Local reviewer';
const idParam = (params: unknown) => z.object({ id: uuid }).parse(params).id;
const resolutionInput = z.object({ resolved: z.boolean(), notes: z.string().trim().max(2000).default('') });
export function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
async function audit(client: PoolClient, inspectionId: string, action: string, detail: object = {}) {
  await client.query('INSERT INTO audit_events(id,inspection_id,actor,action,detail) VALUES($1,$2,$3,$4,$5)', [randomUUID(), inspectionId, actor, action, JSON.stringify(detail)]);
}
async function parentId(kind: 'photo' | 'finding', id: string): Promise<string> {
  const sql = kind === 'photo' ? 'SELECT inspection_id FROM photos WHERE id=$1' : 'SELECT p.inspection_id FROM findings f JOIN photos p ON p.id=f.photo_id WHERE f.id=$1';
  const { rows } = await pool.query(sql, [id]);
  if (!rows.length) throw new ApiError(404, `${kind === 'photo' ? 'Photo' : 'Finding'} not found.`);
  return rows[0].inspection_id;
}
export async function inspectionDetail(id: string): Promise<InspectionDetail> {
  const { rows } = await pool.query(`${inspectionSelect} WHERE i.id=$1`, [id]);
  if (!rows.length) throw new ApiError(404, 'Inspection not found.');
  const photos = await pool.query('SELECT id,inspection_id,filename,width,height,is_demo,created_at FROM photos WHERE inspection_id=$1 ORDER BY created_at,id', [id]);
  const findings = await pool.query(`${findingSelect} JOIN photos p ON p.id=f.photo_id WHERE p.inspection_id=$1 ORDER BY f.created_at,f.id`, [id]);
  return { ...rows[0], photos: photos.rows.map(photo => ({ ...photo, findings: findings.rows.filter(f => f.photo_id === photo.id) })) };
}

export async function buildApp(options: { logger?: boolean; uploadDir?: string } = {}) {
  const app = Fastify({ logger: options.logger ?? true, bodyLimit: 100_000 });
  const uploadDir = resolve(options.uploadDir || process.env.UPLOAD_DIR || './uploads');
  await mkdir(uploadDir, { recursive: true });
  await app.register(cors, { origin: process.env.WEB_ORIGIN || 'http://localhost:5173' });
  await app.register(multipart, { limits: { files: 1, fileSize: 15 * 1024 * 1024, fields: 0, parts: 1 } });
  app.addHook('onSend', async (_req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Cache-Control', 'no-store');
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) return reply.code(400).send({ message: error.issues.map(i => `${i.path.join('.') || 'Request'}: ${i.message}`).join('; ') });
    if (error instanceof ApiError) return reply.code(error.statusCode).send({ message: error.message });
    const e = error as { statusCode?: number; code?: string; message?: string };
    if (e.code === '23503') return reply.code(400).send({ message: 'The referenced project does not exist.' });
    if (e.statusCode && e.statusCode < 500) return reply.code(e.statusCode).send({ message: e.statusCode === 413 ? 'Image is too large. Maximum upload size is 15 MB.' : e.message });
    request.log.error(error);
    return reply.code(500).send({ message: 'Something went wrong. Please try again.' });
  });

  app.get('/api/health', async () => { await pool.query('SELECT 1'); return { status: 'ok', mode: 'local-development', analysis: 'not-connected' }; });
  app.get('/api/sites', async () => (await pool.query(`SELECT s.*,
    (SELECT count(*)::int FROM inspections i WHERE i.site_id=s.id) AS inspection_count,
    (SELECT count(*)::int FROM inspections i WHERE i.site_id=s.id AND i.status='draft') AS open_count
    FROM sites s ORDER BY s.created_at,s.id`)).rows);
  app.post('/api/sites', async (request, reply) => {
    const data = siteInput.parse(request.body);
    const { rows } = await pool.query('INSERT INTO sites(id,name,customer,location,capacity_kw) VALUES($1,$2,$3,$4,$5) RETURNING *', [randomUUID(), data.name, data.customer, data.location, data.capacity_kw]);
    return reply.code(201).send({ ...rows[0], inspection_count: 0, open_count: 0 });
  });
  app.get('/api/dashboard', async () => {
    const counts = await pool.query(`SELECT
      (SELECT count(*)::int FROM sites) AS sites,
      (SELECT count(*)::int FROM inspections) AS inspections,
      (SELECT count(*)::int FROM inspections WHERE status='completed') AS completed,
      (SELECT count(*)::int FROM findings f WHERE NOT EXISTS (SELECT 1 FROM reviews r WHERE r.finding_id=f.id)) AS pending`);
    return { ...counts.rows[0], recent: (await pool.query(`${inspectionSelect} ORDER BY i.created_at DESC,i.id LIMIT 6`)).rows };
  });
  app.get('/api/inspections', async request => {
    const query = z.object({ site_id: uuid.optional(), status: z.enum(['draft', 'completed']).optional(), q: z.string().max(120).optional(), limit: z.coerce.number().int().min(1).max(100).default(50), offset: z.coerce.number().int().min(0).default(0) }).parse(request.query);
    const values = [query.site_id || null, query.status || null, query.q ? `%${query.q.replace(/[\\%_]/g, '\\$&')}%` : null, query.limit, query.offset];
    return (await pool.query(`${inspectionSelect} WHERE ($1::uuid IS NULL OR i.site_id=$1) AND ($2::text IS NULL OR i.status=$2)
      AND ($3::text IS NULL OR i.title ILIKE $3 OR s.name ILIKE $3 OR s.customer ILIKE $3)
      ORDER BY i.created_at DESC,i.id LIMIT $4 OFFSET $5`, values)).rows;
  });
  app.post('/api/inspections', async (request, reply) => {
    const data = inspectionInput.parse(request.body), id = randomUUID();
    await transaction(async client => {
      await client.query('INSERT INTO inspections(id,site_id,title,notes) VALUES($1,$2,$3,$4)', [id, data.site_id, data.title, data.notes]);
      await audit(client, id, 'Created inspection');
    });
    return reply.code(201).send(await inspectionDetail(id));
  });
  app.get('/api/inspections/:id', async request => inspectionDetail(idParam(request.params)));
  app.get('/api/inspections/:id/activity', async request => {
    const id = idParam(request.params);
    await inspectionDetail(id);
    return (await pool.query('SELECT id,actor,action,detail,created_at FROM audit_events WHERE inspection_id=$1 ORDER BY created_at DESC,id DESC LIMIT 50', [id])).rows;
  });
  app.patch('/api/inspections/:id/checklist', async request => {
    const id = idParam(request.params), data = checklistInput.parse(request.body);
    await editable(id, async client => {
      await client.query('UPDATE inspections SET checklist=$2 WHERE id=$1', [id, JSON.stringify(data)]);
      await audit(client, id, 'Updated handover checklist', data);
    });
    return inspectionDetail(id);
  });
  app.patch('/api/inspections/:id/status', async request => {
    const id = idParam(request.params), { status } = z.object({ status: z.enum(['draft', 'completed']) }).parse(request.body);
    await transaction(async client => {
      const { rows } = await client.query('SELECT * FROM inspections WHERE id=$1 FOR UPDATE', [id]);
      if (!rows.length) throw new ApiError(404, 'Inspection not found.');
      if (rows[0].status === status) return;
      if (status === 'completed') {
        const counts = await client.query(`SELECT
          (SELECT count(*)::int FROM photos WHERE inspection_id=$1) AS photos,
          (SELECT count(*)::int FROM findings f JOIN photos p ON p.id=f.photo_id
            LEFT JOIN LATERAL (SELECT decision FROM reviews WHERE finding_id=f.id ORDER BY sequence DESC LIMIT 1) r ON true
            WHERE p.inspection_id=$1 AND (r.decision IS NULL OR (r.decision='accepted' AND NOT f.resolved))) AS blockers`, [id]);
        if (!counts.rows[0].photos) throw new ApiError(409, 'Upload at least one installation photo before completing.');
        if (counts.rows[0].blockers) throw new ApiError(409, 'Review every finding and resolve confirmed issues before completing.');
        if (!Object.values(checklistInput.parse(rows[0].checklist)).every(Boolean)) throw new ApiError(409, 'Finish all handover checklist items before completing.');
      }
      await client.query('UPDATE inspections SET status=$2 WHERE id=$1', [id, status]);
      await audit(client, id, status === 'completed' ? 'Completed inspection' : 'Reopened inspection');
    });
    return inspectionDetail(id);
  });
  app.post('/api/inspections/:id/photos', async (request, reply) => {
    const inspectionId = idParam(request.params);
    const data = await request.file();
    if (!data) throw new ApiError(400, 'Choose a JPEG or PNG image.');
    const buffer = await data.toBuffer();
    let image: Buffer, width: number, height: number;
    try {
      const input = sharp(buffer, { limitInputPixels: 40_000_000, animated: false });
      const metadata = await input.metadata();
      if (!['jpeg', 'png'].includes(metadata.format || '') || (metadata.pages || 1) > 1) throw new Error('Unsupported image');
      const result = await input.rotate().jpeg({ quality: 90 }).toBuffer({ resolveWithObject: true });
      image = result.data; width = result.info.width; height = result.info.height;
    } catch { throw new ApiError(400, 'Upload a valid, single-frame JPEG or PNG under 40 megapixels.'); }
    const photoId = randomUUID(), objectKey = `${photoId}.jpg`, path = resolve(uploadDir, objectKey);
    const filename = data.filename.replace(/[\x00-\x1f\x7f]/g, '').split(/[\\/]/).pop()?.slice(0, 160) || 'Installation photo';
    try {
      await editable(inspectionId, async client => {
        await writeFile(path, image, { flag: 'wx' });
        await client.query('INSERT INTO photos(id,inspection_id,filename,object_key,width,height) VALUES($1,$2,$3,$4,$5,$6)', [photoId, inspectionId, filename, objectKey, width, height]);
        await audit(client, inspectionId, 'Uploaded installation photo', { filename });
      });
    } catch (error) { await unlink(path).catch(() => {}); throw error; }
    return reply.code(201).send({ id: photoId });
  });
  app.get('/api/photos/:id/file', async (request, reply) => {
    const id = idParam(request.params);
    const { rows } = await pool.query('SELECT object_key FROM photos WHERE id=$1', [id]);
    if (!rows.length) throw new ApiError(404, 'Photo not found.');
    const path = resolve(uploadDir, rows[0].object_key);
    if (!path.startsWith(`${uploadDir}/`)) throw new ApiError(404, 'Photo not found.');
    try { await access(path); } catch { throw new ApiError(404, 'Photo file is missing. Restore the photo storage volume.'); }
    return reply.type('image/jpeg').send(createReadStream(path));
  });
  app.post('/api/photos/:id/findings', async (request, reply) => {
    const photoId = idParam(request.params), data = findingInput.parse(request.body), inspectionId = await parentId('photo', photoId), id = randomUUID();
    await editable(inspectionId, async client => {
      await client.query("INSERT INTO findings(id,photo_id,label,box,notes,source) VALUES($1,$2,$3,$4,$5,'manual')", [id, photoId, data.label, JSON.stringify(data.box), data.notes]);
      await audit(client, inspectionId, 'Added manual finding', { findingId: id, label: data.label });
    });
    return reply.code(201).send({ id });
  });
  app.post('/api/findings/:id/reviews', async (request, reply) => {
    const id = idParam(request.params), data = reviewInput.parse(request.body), inspectionId = await parentId('finding', id);
    await editable(inspectionId, async client => {
      await client.query('INSERT INTO reviews(id,finding_id,decision,priority,notes,reviewer) VALUES($1,$2,$3,$4,$5,$6)', [randomUUID(), id, data.decision, data.priority, data.notes, actor]);
      // A new review invalidates any previous resolution; history is retained in audit_events.
      await client.query("UPDATE findings SET resolved=false,resolution_notes='' WHERE id=$1", [id]);
      await audit(client, inspectionId, 'Reviewed finding', { findingId: id, ...data });
    });
    return reply.code(201).send({ ok: true });
  });
  app.patch('/api/findings/:id/resolution', async request => {
    const id = idParam(request.params), data = resolutionInput.parse(request.body), inspectionId = await parentId('finding', id);
    await editable(inspectionId, async client => {
      const { rows } = await client.query('SELECT decision FROM reviews WHERE finding_id=$1 ORDER BY sequence DESC LIMIT 1', [id]);
      if (rows[0]?.decision !== 'accepted') throw new ApiError(409, 'Confirm the finding before resolving it.');
      await client.query('UPDATE findings SET resolved=$2,resolution_notes=$3 WHERE id=$1', [id, data.resolved, data.notes]);
      await audit(client, inspectionId, data.resolved ? 'Resolved finding' : 'Reopened finding', { findingId: id, notes: data.notes });
    });
    return { ok: true };
  });
  app.get('/api/inspections/:id/report.csv', async (request, reply) => {
    const detail = await inspectionDetail(idParam(request.params));
    const rows: unknown[][] = [['Project', 'Customer', 'Inspection', 'Status', 'Inspection source', 'Photo', 'Photo source', 'Finding', 'Finding source', 'Review', 'Priority', 'Resolved', 'Notes', 'Reviewer', 'Reviewed at']];
    const prefix = [detail.site_name, detail.customer, detail.title, detail.status, detail.is_demo ? 'demo' : 'user'];
    for (const photo of detail.photos) {
      const p = [...prefix, photo.filename, photo.is_demo ? 'demo' : 'user'];
      if (!photo.findings.length) rows.push([...p, 'No findings recorded', '', 'Not assessed', '', '', '', '', '']);
      for (const f of photo.findings) rows.push([...p, f.label, f.source, f.decision || 'pending', f.priority, f.resolved ? 'yes' : 'no', [f.notes, f.review_notes, f.resolution_notes].filter(Boolean).join(' | '), f.reviewer, f.reviewed_at ? new Date(f.reviewed_at).toISOString() : '']);
    }
    if (!detail.photos.length) rows.push([...prefix, 'No photos uploaded', '', '', '', '', '', '', '', '', '']);
    reply.header('Content-Disposition', `attachment; filename="inspection-${detail.id}.csv"`);
    return reply.type('text/csv; charset=utf-8').send('\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n'));
  });
  return app;
}

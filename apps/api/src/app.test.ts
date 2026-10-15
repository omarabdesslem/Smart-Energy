import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import sharp from 'sharp';
import type { FastifyInstance } from 'fastify';

if (!process.env.TEST_DATABASE_URL) throw new Error('Set TEST_DATABASE_URL. Tests use a temporary, isolated schema and never truncate existing tables.');
const schema = `test_${randomUUID().replaceAll('-', '')}`;
const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
const url = new URL(process.env.TEST_DATABASE_URL);
url.searchParams.set('options', `-c search_path=${schema}`);
process.env.DATABASE_URL = url.toString();
const { buildApp, csvCell } = await import('./app.js');
const { pool } = await import('./db.js');
let app: FastifyInstance, directory: string;

before(async () => {
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const migrations = new URL('../../../database/', import.meta.url);
  for (const name of (await readdir(migrations)).filter(name => /^\d+_.+\.sql$/.test(name)).sort()) await pool.query(await readFile(new URL(name, migrations), 'utf8'));
  directory = await mkdtemp(join(tmpdir(), 'fieldwork-test-'));
  app = await buildApp({ logger: false, uploadDir: directory });
});
after(async () => {
  if (app) await app.close();
  await pool.end();
  await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.end();
  if (directory) await rm(directory, { recursive: true, force: true });
});
function multipart(buffer: Buffer, filename = 'roof.png') {
  const boundary = 'fieldwork-test-boundary';
  return { headers: { 'content-type': `multipart/form-data; boundary=${boundary}` }, payload: Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: image/png\r\n\r\n`), buffer, Buffer.from(`\r\n--${boundary}--\r\n`)]) };
}
async function fixture() {
  const site = await app.inject({ method: 'POST', url: '/api/sites', payload: { name: '=HYPERLINK("example")', customer: 'Test Customer', location: 'Augsburg', capacity_kw: 12.4 } });
  assert.equal(site.statusCode, 201, site.body);
  const inspection = await app.inject({ method: 'POST', url: '/api/inspections', payload: { site_id: site.json().id, title: 'Installation quality check', assigned_to: 'Test Installer' } });
  assert.equal(inspection.statusCode, 201, inspection.body);
  assert.equal(inspection.json().assigned_to, 'Test Installer');
  return inspection.json().id as string;
}

test('complete workflow: upload, annotate, review, resolve, complete, export and reopen', async () => {
  const id = await fixture();
  let result = await app.inject({ method: 'PATCH', url: `/api/inspections/${id}/status`, payload: { status: 'completed' } });
  assert.equal(result.statusCode, 409, 'Empty inspections cannot be completed');
  const image = await sharp({ create: { width: 80, height: 60, channels: 3, background: '#567a6f' } }).png().toBuffer();
  result = await app.inject({ method: 'POST', url: `/api/inspections/${id}/photos`, ...multipart(image) });
  assert.equal(result.statusCode, 201, result.body);
  const photoId = result.json().id;
  result = await app.inject(`/api/photos/${photoId}/file`);
  assert.equal(result.statusCode, 200);
  assert.match(result.headers['content-type'] as string, /image\/jpeg/);
  assert.equal((await sharp(result.rawPayload).metadata()).width, 80);
  result = await app.inject({ method: 'POST', url: `/api/photos/${photoId}/findings`, payload: { label: 'Visible damage', box: { x: .1, y: .1, width: .4, height: .5 }, notes: 'Test observation' } });
  assert.equal(result.statusCode, 201, result.body);
  const findingId = result.json().id;
  let detail = (await app.inject(`/api/inspections/${id}`)).json();
  assert.equal(detail.pending_count, 1);
  assert.equal(detail.photos[0].findings[0].source, 'manual');
  assert.equal(detail.photos[0].findings[0].score, null, 'Manual findings have no invented model score');
  result = await app.inject({ method: 'PATCH', url: `/api/findings/${findingId}/resolution`, payload: { resolved: true } });
  assert.equal(result.statusCode, 409, 'Unreviewed findings cannot be resolved');
  result = await app.inject({ method: 'POST', url: `/api/findings/${findingId}/reviews`, payload: { decision: 'accepted', priority: 'high', notes: 'Confirmed' } });
  assert.equal(result.statusCode, 201, result.body);
  result = await app.inject({ method: 'PATCH', url: `/api/inspections/${id}/checklist`, payload: { photos: true, components: true, handover: true } });
  assert.equal(result.statusCode, 200, result.body);
  result = await app.inject({ method: 'PATCH', url: `/api/inspections/${id}/status`, payload: { status: 'completed' } });
  assert.equal(result.statusCode, 409, 'Confirmed issues must be resolved');
  result = await app.inject({ method: 'PATCH', url: `/api/findings/${findingId}/resolution`, payload: { resolved: true, notes: 'Module replaced' } });
  assert.equal(result.statusCode, 200, result.body);
  result = await app.inject({ method: 'PATCH', url: `/api/inspections/${id}/status`, payload: { status: 'completed' } });
  assert.equal(result.statusCode, 200, result.body);
  assert.equal(result.json().status, 'completed');
  result = await app.inject({ method: 'POST', url: `/api/photos/${photoId}/findings`, payload: { label: 'Other', box: { x: 0, y: 0, width: 1, height: 1 } } });
  assert.equal(result.statusCode, 409, 'Completed inspections are locked');
  result = await app.inject({ method: 'POST', url: `/api/findings/${findingId}/reviews`, payload: { decision: 'rejected', priority: 'low' } });
  assert.equal(result.statusCode, 409);
  result = await app.inject(`/api/inspections/${id}/report.csv`);
  assert.equal(result.statusCode, 200);
  assert.match(result.body, /'=?HYPERLINK/);
  assert.match(result.body, /Module replaced/);
  assert.match(result.body, /manual/);
  result = await app.inject({ method: 'PATCH', url: `/api/inspections/${id}/status`, payload: { status: 'draft' } });
  assert.equal(result.statusCode, 200);
  // Updating a review clears resolution while retaining historical review records.
  await app.inject({ method: 'POST', url: `/api/findings/${findingId}/reviews`, payload: { decision: 'rejected', priority: 'low', notes: 'Reassessed' } });
  detail = (await app.inject(`/api/inspections/${id}`)).json();
  assert.equal(detail.photos[0].findings[0].resolved, false);
  assert.equal(detail.photos[0].findings[0].decision, 'rejected');
  const history = await pool.query('SELECT * FROM reviews WHERE finding_id=$1', [findingId]);
  assert.equal(history.rowCount, 2);
  const events = (await app.inject(`/api/inspections/${id}/activity`)).json();
  assert.ok(events.some((e: { action: string }) => e.action === 'Completed inspection'));
  assert.ok(events.some((e: { action: string }) => e.action === 'Reopened inspection'));
});

test('upload validation, EXIF normalization, and bounding-box validation', async () => {
  const id = await fixture();
  let result = await app.inject({ method: 'POST', url: `/api/inspections/${id}/photos`, ...multipart(Buffer.from('not an image')) });
  assert.equal(result.statusCode, 400);
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100"/></svg>');
  result = await app.inject({ method: 'POST', url: `/api/inspections/${id}/photos`, ...multipart(svg, 'fake.png') });
  assert.equal(result.statusCode, 400, 'Content validation rejects disguised SVG');
  result = await app.inject({ method: 'POST', url: `/api/inspections/${id}/photos`, ...multipart(Buffer.alloc(15 * 1024 * 1024 + 1)) });
  assert.equal(result.statusCode, 413, result.body);
  const image = await sharp({ create: { width: 80, height: 60, channels: 3, background: '#cdd5bd' } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  result = await app.inject({ method: 'POST', url: `/api/inspections/${id}/photos`, ...multipart(image) });
  assert.equal(result.statusCode, 201, result.body);
  const photoId = result.json().id;
  const detail = (await app.inject(`/api/inspections/${id}`)).json();
  assert.equal(detail.photos[0].width, 60);
  assert.equal(detail.photos[0].height, 80, 'Dimensions follow EXIF-rotated stored image');
  assert.equal(detail.photos[0].findings.length, 0, 'Uploads never get invented detections');
  result = await app.inject({ method: 'POST', url: `/api/photos/${photoId}/findings`, payload: { label: 'Other', box: { x: .9, y: 0, width: .3, height: .5 } } });
  assert.equal(result.statusCode, 400, 'Bounding boxes cannot extend beyond the image');
  result = await app.inject(`/api/inspections/not-a-uuid`);
  assert.equal(result.statusCode, 400);
  result = await app.inject(`/api/inspections/${randomUUID()}`);
  assert.equal(result.statusCode, 404);
  result = await app.inject({ method: 'POST', url: '/api/inspections', payload: { site_id: randomUUID(), title: 'Missing parent' } });
  assert.equal(result.statusCode, 400);
  result = await app.inject(`/api/inspections?q=${encodeURIComponent("' OR 1=1 --")}`);
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.json(), [], 'Search strings are parameterized');
});

test('CSV formula neutralization and quote escaping', () => {
  assert.equal(csvCell('=1+1'), '"\'=1+1"');
  assert.equal(csvCell('  @SUM(1)'), '"\'  @SUM(1)"');
  assert.equal(csvCell('a"b'), '"a""b"');
  assert.equal(csvCell(null), '""');
});

test('solar layouts persist, validate roof slots, and reject stale revisions', async () => {
  const { initialDesign } = await import('@energy/contracts');
  let result = await app.inject('/api/design');
  assert.equal(result.statusCode, 200);
  assert.equal(result.json(), null);
  result = await app.inject({ method: 'PUT', url: '/api/design', payload: { ...initialDesign, panels: [0, 1, 2] } });
  assert.equal(result.statusCode, 200, result.body);
  assert.equal(result.json().revision, 1);
  assert.deepEqual(result.json().panels, [0, 1, 2]);
  assert.ok(result.json().updatedAt);
  result = await app.inject('/api/design');
  assert.equal(result.json().customer, initialDesign.customer);
  assert.equal(result.json().roofColor, 'dark-grey');
  // Existing saved documents predate the color selector.
  await pool.query("UPDATE pv_designs SET content=content-'roofColor'");
  result = await app.inject('/api/design');
  assert.equal(result.json().roofColor, 'dark-grey');
  const saved = result.json();
  result = await app.inject({ method: 'PUT', url: '/api/design', payload: { ...saved, panels: [29], panelWatts: 475, roofColor: 'red' } });
  assert.equal(result.statusCode, 200, result.body);
  assert.equal(result.json().revision, 2);
  assert.equal(result.json().panelWatts, 475);
  assert.equal(result.json().roofColor, 'red');
  result = await app.inject({ method: 'PUT', url: '/api/design', payload: { ...saved, revision: 2, roofColor: 'blue' } });
  assert.equal(result.statusCode, 400, 'Unsupported roof colors are rejected');
  result = await app.inject({ method: 'PUT', url: '/api/design', payload: { ...saved, panels: [4] } });
  assert.equal(result.statusCode, 409, 'A stale tab must not overwrite a more recent layout');
  for (const panels of [[30], [-1], [1, 1], [.5]]) {
    result = await app.inject({ method: 'PUT', url: '/api/design', payload: { ...saved, revision: 2, panels } });
    assert.equal(result.statusCode, 400, 'Invalid or duplicate roof sections are rejected');
  }
  result = await app.inject('/api/design');
  assert.equal(result.json().roofColor, 'red');
  assert.deepEqual(result.json().panels, [29], 'Rejected requests leave the last saved layout intact');
});

import pg, { type PoolClient } from 'pg';

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgres://energy:energy_local@127.0.0.1:5432/energy', max: 10 });
export class ApiError extends Error {
  constructor(public statusCode: number, message: string) { super(message); }
}
export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
export async function editable<T>(id: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return transaction(async client => {
    const { rows } = await client.query('SELECT status FROM inspections WHERE id=$1 FOR UPDATE', [id]);
    if (!rows.length) throw new ApiError(404, 'Inspection not found.');
    if (rows[0].status === 'completed') throw new ApiError(409, 'Reopen the inspection before making changes.');
    return fn(client);
  });
}
export const inspectionSelect = `SELECT i.*, s.name AS site_name, s.customer, s.location, s.capacity_kw,
  (SELECT count(*)::int FROM photos p WHERE p.inspection_id=i.id) AS photo_count,
  (SELECT count(*)::int FROM findings f JOIN photos p ON p.id=f.photo_id WHERE p.inspection_id=i.id) AS finding_count,
  (SELECT count(*)::int FROM findings f JOIN photos p ON p.id=f.photo_id WHERE p.inspection_id=i.id
    AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.finding_id=f.id)) AS pending_count,
  (SELECT count(*)::int FROM findings f JOIN photos p ON p.id=f.photo_id WHERE p.inspection_id=i.id AND NOT f.resolved
    AND (SELECT r.decision FROM reviews r WHERE r.finding_id=f.id ORDER BY r.sequence DESC LIMIT 1)='accepted') AS open_count
  FROM inspections i JOIN sites s ON s.id=i.site_id`;
export const findingSelect = `SELECT f.*, r.decision, r.priority, r.notes AS review_notes, r.reviewer, r.created_at AS reviewed_at
  FROM findings f LEFT JOIN LATERAL (SELECT * FROM reviews WHERE finding_id=f.id ORDER BY sequence DESC LIMIT 1) r ON true`;

import type { FastifyInstance } from 'fastify';
import { designInput, type Design } from '@energy/contracts';
import { ApiError, pool, transaction } from './db.js';

const designId = '16000000-0000-4000-8000-000000000001';
function toDesign(row: { content: object; revision: number; updated_at: Date }): Design {
  return { ...designInput.parse({ ...row.content, revision: row.revision }), updatedAt: row.updated_at.toISOString() };
}
export function registerDesignRoutes(app: FastifyInstance) {
  app.get('/api/design', async () => {
    const { rows } = await pool.query('SELECT * FROM pv_designs WHERE id=$1', [designId]);
    return rows.length ? toDesign(rows[0]) : null;
  });
  app.put('/api/design', async request => {
    const { revision, ...content } = designInput.parse(request.body);
    return transaction(async client => {
      await client.query('SELECT pg_advisory_xact_lock(1602026)');
      const { rows } = await client.query('SELECT revision FROM pv_designs WHERE id=$1 FOR UPDATE', [designId]);
      if ((rows[0]?.revision || 0) !== revision) throw new ApiError(409, 'This design changed in another tab. Reload the latest saved design before saving.');
      const result = await client.query(`INSERT INTO pv_designs(id,content,revision) VALUES($1,$2,1)
        ON CONFLICT(id) DO UPDATE SET content=EXCLUDED.content,revision=pv_designs.revision+1,updated_at=now() RETURNING *`, [designId, JSON.stringify(content)]);
      return toDesign(result.rows[0]);
    });
  });
}

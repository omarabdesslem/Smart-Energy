import { buildApp } from './app.js';
import { pool } from './db.js';

if (process.env.NODE_ENV === 'production') throw new Error('This local prototype requires authentication and production storage configuration before public deployment.');
const app = await buildApp();
const shutdown = async () => { await app.close(); await pool.end(); process.exit(0); };
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
try { await app.listen({ port: Number(process.env.PORT || 3001), host: process.env.HOST || '127.0.0.1' }); }
catch (error) { app.log.error(error); await pool.end(); process.exit(1); }

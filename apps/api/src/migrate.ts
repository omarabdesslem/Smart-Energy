import { readFile, readdir } from 'node:fs/promises';
import { pool, transaction } from './db.js';

try {
  await transaction(async client => {
    await client.query('SELECT pg_advisory_xact_lock(1492026)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz DEFAULT now())');
    const directory = new URL('../../../database/', import.meta.url);
    const migrations = (await readdir(directory)).filter(name => /^\d+_.+\.sql$/.test(name)).sort();
    for (const name of migrations) {
      const { rowCount } = await client.query('SELECT name FROM schema_migrations WHERE name=$1', [name]);
      if (!rowCount) {
        await client.query(await readFile(new URL(name, directory), 'utf8'));
        await client.query('INSERT INTO schema_migrations(name) VALUES($1)', [name]);
        console.log(`Applied ${name}`);
      }
    }
    console.log('Database is up to date.');
  });
} finally { await pool.end(); }

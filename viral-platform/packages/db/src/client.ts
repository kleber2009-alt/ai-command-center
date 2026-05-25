import { type PostgresJsDatabase, drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

export type DB = PostgresJsDatabase<typeof schema>;

// Lazily initialised so importing this module (e.g. during `next build`,
// which traces route handlers) doesn't require DATABASE_URL — only using the
// DB does. One client per process: workers and the web server each get their own.
let instance: DB | undefined;

function init(): DB {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  return drizzle(postgres(connectionString, { max: 10 }), { schema });
}

export const db: DB = new Proxy({} as DB, {
  get(_target, prop, receiver) {
    instance ??= init();
    return Reflect.get(instance, prop, receiver);
  },
});

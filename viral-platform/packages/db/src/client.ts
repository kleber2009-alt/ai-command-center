import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

// Single shared pool. Workers and the web server each get their own process,
// so one client per process is correct.
const queryClient = postgres(connectionString, { max: 10 });

export const db = drizzle(queryClient, { schema });
export type DB = typeof db;

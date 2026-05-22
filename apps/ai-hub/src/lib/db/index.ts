import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

// postgres-js opens connections lazily on first query, so we can construct
// the client at module-load even with a stub URL. The stub fallback lets
// `next build` collect page data without requiring real env at build time —
// queries that actually run hit the real DATABASE_URL set at runtime.

const url = process.env.DATABASE_URL ?? "postgres://build-stub:build-stub@localhost:5432/build-stub";

const client = postgres(url, { max: 10, prepare: false });
export const db = drizzle(client, { schema });
export { schema };
export type DB = typeof db;

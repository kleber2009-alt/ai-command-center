import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://viral:viral@localhost:5432/viral_platform',
  },
  // pgvector extension is created by an explicit migration; see migrations/.
  verbose: true,
  strict: true,
});

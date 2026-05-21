// Apply all SQL files from drizzle/migrations/ in lexical order.
// Idempotent: each migration file uses IF NOT EXISTS / CREATE OR REPLACE.
//
// Usage:  npm run db:migrate

import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const DIR = path.resolve(process.cwd(), "drizzle/migrations");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const sql = postgres(url, { max: 1, prepare: false });
  const files = (await fs.readdir(DIR)).filter((f) => f.endsWith(".sql")).sort();

  console.log(`Applying ${files.length} migration(s) to ${new URL(url).host}…`);
  for (const file of files) {
    const sqlText = await fs.readFile(path.join(DIR, file), "utf8");
    console.log(`  → ${file}`);
    await sql.unsafe(sqlText);
  }

  await sql.end();
  console.log("Done.");
}

main().catch((err) => { console.error(err); process.exit(1); });

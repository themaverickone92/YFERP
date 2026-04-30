import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";
import fs from 'fs';
import path from 'path';

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const caPath = path.join(process.cwd(), 'yandex-ca.pem');
const sslConfig = fs.existsSync(caPath)
  ? { ca: fs.readFileSync(caPath).toString(), rejectUnauthorized: true }
  : { rejectUnauthorized: false };

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfig
});
export const db = drizzle({ client: pool, schema });
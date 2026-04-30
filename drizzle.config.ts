import { defineConfig } from "drizzle-kit";
import fs from "fs";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

const caPath = "./yandex-ca.pem";

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
    ssl: fs.existsSync(caPath)
      ? { ca: fs.readFileSync(caPath).toString(), rejectUnauthorized: true }
      : undefined,
  },
});

const { Client } = require("pg");

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS sales_plans (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id),
      ssku TEXT NOT NULL,
      ssku_name TEXT,
      value_stream TEXT,
      category TEXT,
      channel TEXT NOT NULL,
      year INTEGER NOT NULL,
      jan INTEGER, feb INTEGER, mar INTEGER, apr INTEGER,
      may INTEGER, jun INTEGER, jul INTEGER, aug INTEGER,
      sep INTEGER, oct INTEGER, nov INTEGER, dec INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS sales_plans_uniq_idx
      ON sales_plans(company_id, ssku, channel, year);
    CREATE INDEX IF NOT EXISTS idx_sales_plans_company
      ON sales_plans(company_id);
  `);
  console.log("Migration done: sales_plans table created");
  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });

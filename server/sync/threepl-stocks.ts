import { storage } from "../storage";
import { db } from "../db";
import { warehouses } from "@shared/schema";
import { eq, and } from "drizzle-orm";

const API_BASE = "http://it.fresh-logic.ru/api/v1";
const BATCH_DELAY = 50;

interface StockDetail {
  itemCondition: number;
  count: number;
}

interface StockSection {
  totalCount: number;
  details: StockDetail[];
}

interface StockItem {
  code: string;
  active?: StockSection;
  reserved?: StockSection;
  expected?: StockSection;
}

async function fetchWarehousePage(
  username: string,
  password: string,
  page: number
): Promise<StockItem[]> {
  const credentials = Buffer.from(`${username}:${password}`).toString("base64");
  const res = await fetch(`${API_BASE}/reports/stock?page=${page}&mode=extended`, {
    headers: {
      Authorization: `Basic ${credentials}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`3PL API error ${res.status}: ${text}`);
  }

  const data = await res.json() as any;
  return (data.stockItems || []) as StockItem[];
}

interface WarehouseStockRow {
  code: string;
  qtyNew: number;
  qtyDefect: number;
  qtyReserved: number;
  qtyExpected: number;
}

async function fetchAllWarehouseStock(
  username: string,
  password: string,
  warehouseName: string
): Promise<WarehouseStockRow[]> {
  const result: WarehouseStockRow[] = [];
  let page = 1;

  while (true) {
    const items = await fetchWarehousePage(username, password, page);
    if (items.length === 0) break;

    for (const item of items) {
      if (!item.code) continue;
      const activeDetails = item.active?.details || [];
      const qtyNew = activeDetails
        .filter(d => d.itemCondition === 1)
        .reduce((s, d) => s + (d.count || 0), 0);
      const qtyDefect = activeDetails
        .filter(d => d.itemCondition !== 1)
        .reduce((s, d) => s + (d.count || 0), 0);
      const qtyReserved = item.reserved?.totalCount ?? 0;
      const qtyExpected = item.expected?.totalCount ?? 0;

      if (qtyNew + qtyDefect + qtyReserved + qtyExpected > 0) {
        result.push({ code: item.code, qtyNew, qtyDefect, qtyReserved, qtyExpected });
      }
    }

    page++;
    await new Promise(r => setTimeout(r, BATCH_DELAY));
  }

  console.log(`[3PL sync] ${warehouseName}: fetched ${result.length} SKUs`);
  return result;
}

export async function syncThreeplStocksForCompany(companyId: number): Promise<{ synced: number; error?: string }> {
  try {
    // Get all 3PL warehouses for this company (integrationType = "api")
    const allWarehouses = await db
      .select()
      .from(warehouses)
      .where(and(eq(warehouses.companyId, companyId), eq(warehouses.isActive, true)));

    const apiWarehouses = allWarehouses.filter(
      (w: any) => w.settings?.integrationType === "api" && w.settings?.username && w.settings?.password
    );

    if (apiWarehouses.length === 0) {
      return { synced: 0, error: "No active 3PL warehouses with API credentials" };
    }

    const companyProducts = await storage.getCompanyProducts(companyId);
    if (companyProducts.length === 0) {
      return { synced: 0 };
    }

    const skuSet = new Set(companyProducts.map(p => p.sku));

    // Aggregate qty_new per SKU across all warehouses (used for stock_available)
    const stockMap = new Map<string, number>();
    // Detail per (sku, warehouseId)
    const detailMap = new Map<string, {
      sku: string; warehouseId: number; warehouseName: string;
      qtyNew: number; qtyDefect: number; qtyReserved: number; qtyExpected: number;
    }>();

    const warehouseResults = await Promise.all(
      apiWarehouses.map(async (wh) => {
        const { username, password } = wh.settings as { username: string; password: string };
        try {
          const items = await fetchAllWarehouseStock(username, password, wh.name);
          return { wh, items };
        } catch (err: any) {
          console.error(`[3PL sync] warehouse=${wh.name} error:`, err.message);
          return { wh, items: [] as WarehouseStockRow[] };
        }
      })
    );

    for (const { wh, items } of warehouseResults) {
      for (const item of items) {
        const sku = item.code;
        if (!skuSet.has(sku)) continue;

        stockMap.set(sku, (stockMap.get(sku) ?? 0) + item.qtyNew);

        const key = `${sku}|${wh.id}`;
        const existing = detailMap.get(key);
        if (existing) {
          existing.qtyNew += item.qtyNew;
          existing.qtyDefect += item.qtyDefect;
          existing.qtyReserved += item.qtyReserved;
          existing.qtyExpected += item.qtyExpected;
        } else {
          detailMap.set(key, {
            sku, warehouseId: wh.id, warehouseName: wh.name,
            qtyNew: item.qtyNew, qtyDefect: item.qtyDefect,
            qtyReserved: item.qtyReserved, qtyExpected: item.qtyExpected,
          });
        }
      }
    }

    // Ensure all company SKUs have an entry
    for (const sku of skuSet) {
      if (!stockMap.has(sku)) stockMap.set(sku, 0);
    }

    const rows = Array.from(stockMap.entries()).map(([sku, qty]) => ({
      sku,
      stockAvailable: qty,
    }));
    await storage.upsertThreeplStocks(companyId, rows);

    const detailRows = Array.from(detailMap.values());
    if (detailRows.length > 0) {
      await storage.upsertThreeplStockDetails(companyId, detailRows);
    }

    console.log(`[3PL sync] company=${companyId} synced ${rows.length} SKUs, ${detailRows.length} detail rows`);
    return { synced: rows.length };
  } catch (err: any) {
    console.error(`[3PL sync] company=${companyId} error:`, err.message);
    return { synced: 0, error: err.message };
  }
}

export async function hasActiveThreeplWarehouses(companyId?: number): Promise<boolean> {
  const allWarehouses = await db.select().from(warehouses).where(eq(warehouses.isActive, true));
  return allWarehouses.some(
    (w: any) => w.settings?.integrationType === "api" && w.settings?.username
      && (companyId == null || w.companyId === companyId)
  );
}

export async function syncAllCompaniesThreepl(): Promise<void> {
  try {
    const allWarehouses = await db.select().from(warehouses).where(eq(warehouses.isActive, true));
    const companyIds = [...new Set(
      allWarehouses
        .filter((w: any) => w.settings?.integrationType === "api" && w.settings?.username)
        .map((w: any) => w.companyId)
    )];

    if (companyIds.length === 0) return;

    console.log(`[3PL sync] Starting sync for ${companyIds.length} company(ies)`);
    for (const companyId of companyIds) {
      const result = await syncThreeplStocksForCompany(companyId as number);
      storage.logActivity({ companyId: companyId as number, userId: null, actionType: "sync", entityType: "sync_3pl", description: `Auto sync 3PL: ${result.synced} records`, metadata: result }).catch(console.error);
    }
  } catch (err: any) {
    console.error("[3PL sync] Global sync error:", err.message);
  }
}

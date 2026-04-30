import { storage } from "../storage";
import { db } from "../db";
import { marketplaceIntegrations } from "@shared/schema";
import { eq, and } from "drizzle-orm";

const WB_STATS_API = "https://statistics-api.wildberries.ru";
// Fetch all supplier stocks; dateFrom far in past to get complete snapshot
const DATE_FROM = "2019-01-01";

interface WBStockItem {
  supplierArticle: string;
  barcode: string;
  warehouseName: string;
  quantityFull: number;
  quantityNotInOrders: number;
  inWayToClient: number;
  inWayFromClient: number;
}

async function fetchAllStocks(apiKey: string): Promise<WBStockItem[]> {
  const url = `${WB_STATS_API}/api/v1/supplier/stocks?dateFrom=${DATE_FROM}`;
  const res = await fetch(url, {
    headers: { Authorization: apiKey },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WB Statistics API error ${res.status}: ${text}`);
  }

  const data = await res.json() as any[];
  return (data || []).map((item: any) => ({
    supplierArticle: String(item.supplierArticle || ""),
    barcode: String(item.barcode || ""),
    warehouseName: String(item.warehouseName || ""),
    quantityFull: Number(item.quantityFull) || 0,
    quantityNotInOrders: Number(item.quantityNotInOrders) || 0,
    inWayToClient: Number(item.inWayToClient) || 0,
    inWayFromClient: Number(item.inWayFromClient) || 0,
  }));
}

export async function syncWildberriesStocksForCompany(companyId: number): Promise<{ synced: number; error?: string }> {
  try {
    const [integration] = await db
      .select()
      .from(marketplaceIntegrations)
      .where(
        and(
          eq(marketplaceIntegrations.companyId, companyId),
          eq(marketplaceIntegrations.marketplace, "wildberries"),
          eq(marketplaceIntegrations.isEnabled, true)
        )
      );

    if (!integration?.apiKey) {
      return { synced: 0, error: "No active Wildberries integration with API key" };
    }

    const companyProducts = await storage.getCompanyProducts(companyId);
    if (companyProducts.length === 0) {
      return { synced: 0 };
    }

    const skuSet = new Set(companyProducts.map(p => p.sku));
    // barcode → sku fallback map (skip products without barcode)
    const barcodeToSku = new Map<string, string>();
    for (const p of companyProducts) {
      if (p.barcode) barcodeToSku.set(p.barcode, p.sku);
    }

    const allItems = await fetchAllStocks(integration.apiKey);

    // Aggregate per SKU
    const stockMap = new Map<string, { available: number; inTransit: number }>();
    // Detail per (sku, warehouseName)
    type DetailKey = string;
    const detailMap = new Map<DetailKey, {
      sku: string; warehouseName: string;
      quantityFull: number; quantityNotInOrders: number;
      inWayToClient: number; inWayFromClient: number;
    }>();

    for (const item of allItems) {
      // Match by supplierArticle first, fall back to barcode
      let sku = skuSet.has(item.supplierArticle) ? item.supplierArticle : (barcodeToSku.get(item.barcode) ?? null);
      if (!sku) continue;

      const agg = stockMap.get(sku) ?? { available: 0, inTransit: 0 };
      agg.available += item.quantityFull - item.inWayToClient - item.inWayFromClient;
      agg.inTransit += item.inWayToClient;
      stockMap.set(sku, agg);

      const key = `${sku}|${item.warehouseName}`;
      const existing = detailMap.get(key);
      if (existing) {
        existing.quantityFull += item.quantityFull;
        existing.quantityNotInOrders += item.quantityNotInOrders;
        existing.inWayToClient += item.inWayToClient;
        existing.inWayFromClient += item.inWayFromClient;
      } else {
        detailMap.set(key, {
          sku,
          warehouseName: item.warehouseName,
          quantityFull: item.quantityFull,
          quantityNotInOrders: item.quantityNotInOrders,
          inWayToClient: item.inWayToClient,
          inWayFromClient: item.inWayFromClient,
        });
      }
    }

    // Ensure all company SKUs have an entry (even if zero)
    for (const sku of skuSet) {
      if (!stockMap.has(sku)) stockMap.set(sku, { available: 0, inTransit: 0 });
    }

    const rows = Array.from(stockMap.entries()).map(([sku, s]) => ({
      sku,
      stockAvailable: s.available,
      stockInTransit: s.inTransit,
    }));
    await storage.upsertWildberriesStocks(companyId, rows);

    const detailRows = Array.from(detailMap.values());
    if (detailRows.length > 0) {
      await storage.upsertWildberriesStockDetails(companyId, detailRows);
    }

    console.log(`[WB sync] company=${companyId} synced ${rows.length} SKUs, ${detailRows.length} detail rows`);
    return { synced: rows.length };
  } catch (err: any) {
    console.error(`[WB sync] company=${companyId} error:`, err.message);
    return { synced: 0, error: err.message };
  }
}

export async function hasActiveWBIntegrations(): Promise<boolean> {
  const rows = await db
    .select({ companyId: marketplaceIntegrations.companyId })
    .from(marketplaceIntegrations)
    .where(
      and(
        eq(marketplaceIntegrations.marketplace, "wildberries"),
        eq(marketplaceIntegrations.isEnabled, true)
      )
    )
    .limit(1);
  return rows.length > 0;
}

export async function syncAllCompaniesWildberries(): Promise<void> {
  try {
    const integrations = await db
      .select({ companyId: marketplaceIntegrations.companyId })
      .from(marketplaceIntegrations)
      .where(
        and(
          eq(marketplaceIntegrations.marketplace, "wildberries"),
          eq(marketplaceIntegrations.isEnabled, true)
        )
      );

    if (integrations.length === 0) return;

    console.log(`[WB sync] Starting sync for ${integrations.length} company(ies)`);

    for (const { companyId } of integrations) {
      const result = await syncWildberriesStocksForCompany(companyId);
      storage.logActivity({ companyId, userId: null, actionType: "sync", entityType: "sync_wb", description: `Auto sync WB: ${result.synced} records`, metadata: result }).catch(console.error);
    }
  } catch (err: any) {
    console.error("[WB sync] Global sync error:", err.message);
  }
}

import { storage } from "../storage";
import { db } from "../db";
import { marketplaceIntegrations } from "@shared/schema";
import { eq, and } from "drizzle-orm";

const OZON_API_BASE = "https://api-seller.ozon.ru";
const SKU_BATCH_SIZE = 100;    // analytics/stocks: max 100 per request
const INFO_BATCH_SIZE = 1000;  // product/info/list: max 1000 per request

interface OzonStockItem {
  sku: string;
  offer_id: string;
  warehouse_id: string;
  warehouse_name: string;
  cluster_name: string;
  available_stock_count: number;
  valid_stock_count: number;
  waiting_docs_stock_count: number;
  expiring_stock_count: number;
  transit_defect_stock_count: number;
  stock_defect_stock_count: number;
  excess_stock_count: number;
  other_stock_count: number;
  requested_stock_count: number;
  transit_stock_count: number;
  return_from_customer_stock_count: number;
  return_to_seller_stock_count: number;
}

// Step 1: call /v3/product/info/list with our offer_ids → get Ozon internal sku values
// Returns map: ozon_sku (number) → offer_id (our SKU)
async function fetchOzonSkuMap(
  clientId: string,
  apiKey: string,
  offerIds: string[]
): Promise<Map<number, string>> {
  const result = new Map<number, string>();

  for (let i = 0; i < offerIds.length; i += INFO_BATCH_SIZE) {
    const batch = offerIds.slice(i, i + INFO_BATCH_SIZE);
    const res = await fetch(`${OZON_API_BASE}/v3/product/info/list`, {
      method: "POST",
      headers: {
        "Client-Id": clientId,
        "Api-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ offer_id: batch, product_id: [], sku: [] }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ozon /v3/product/info/list error ${res.status}: ${text}`);
    }

    const data = await res.json() as any;
    const items: any[] = data?.items || [];

    for (const item of items) {
      const offerId: string = item.offer_id;
      const ozonSku = Number(item.sku); // top-level sku field
      if (ozonSku > 0 && offerId) {
        result.set(ozonSku, offerId);
      }
    }

    if (i + INFO_BATCH_SIZE < offerIds.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return result;
}

// Step 2: fetch analytics/stocks for a batch of Ozon sku IDs, retry on 429
async function fetchStocksBatch(
  clientId: string,
  apiKey: string,
  skus: number[]
): Promise<OzonStockItem[]> {
  const MAX_RETRIES = 4;
  let delay = 2000;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(`${OZON_API_BASE}/v1/analytics/stocks`, {
      method: "POST",
      headers: {
        "Client-Id": clientId,
        "Api-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        skus: skus.map(String),
        cluster_ids: [],
        item_tags: [],
        turnover_grades: [],
        warehouse_ids: [],
      }),
    });

    if (res.status === 429 || res.status === 500) {
      if (attempt === MAX_RETRIES) {
        const text = await res.text();
        throw new Error(`Ozon /v1/analytics/stocks error ${res.status} after ${MAX_RETRIES} retries: ${text}`);
      }
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
      continue;
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ozon /v1/analytics/stocks error ${res.status}: ${text}`);
    }

    const data = await res.json() as any;
    return data?.items || [];
  }

  return [];
}

export async function syncOzonStocksForCompany(companyId: number): Promise<{ synced: number; error?: string }> {
  try {
    const [integration] = await db
      .select()
      .from(marketplaceIntegrations)
      .where(
        and(
          eq(marketplaceIntegrations.companyId, companyId),
          eq(marketplaceIntegrations.marketplace, "ozon"),
          eq(marketplaceIntegrations.isEnabled, true)
        )
      );

    if (!integration?.apiKey || !integration?.clientId) {
      return { synced: 0, error: "No active Ozon integration with API key and client ID" };
    }

    // Step 1: get offer_ids from our DB, convert to Ozon sku map via product/info/list
    const ourProducts = await storage.getCompanyProducts(companyId);
    if (ourProducts.length === 0) return { synced: 0 };

    const offerIds = ourProducts.map(p => p.sku);
    const ozonSkuToOfferId = await fetchOzonSkuMap(integration.clientId, integration.apiKey, offerIds);
    const ozonSkus = Array.from(ozonSkuToOfferId.keys());

    console.log(`[Ozon sync] company=${companyId} products=${ourProducts.length} ozon_skus=${ozonSkus.length} sample=${ozonSkus.slice(0, 5).join(',')}`);
    if (ozonSkus.length === 0) return { synced: 0 };

    // Step 2: fetch analytics/stocks in batches of 100
    const stockMap = new Map<string, { available: number; inTransit: number }>();
    const detailMap = new Map<string, OzonStockItem & { resolvedOfferId: string }>();

    for (let i = 0; i < ozonSkus.length; i += SKU_BATCH_SIZE) {
      const batch = ozonSkus.slice(i, i + SKU_BATCH_SIZE);
      const items = await fetchStocksBatch(integration.clientId, integration.apiKey, batch);

      for (const item of items) {
        const offerId = item.offer_id || ozonSkuToOfferId.get(Number(item.sku));
        if (!offerId) continue;

        const agg = stockMap.get(offerId) || { available: 0, inTransit: 0 };
        agg.available += item.available_stock_count || 0;
        agg.inTransit += item.transit_stock_count || 0;
        stockMap.set(offerId, agg);

        const key = `${offerId}|${item.warehouse_id}`;
        detailMap.set(key, { ...item, resolvedOfferId: offerId });
      }

      if (i + SKU_BATCH_SIZE < ozonSkus.length) {
        await new Promise(r => setTimeout(r, 1100));
      }
    }

    const stockRows = Array.from(stockMap.entries()).map(([sku, s]) => ({
      sku,
      availableStockCount: s.available,
      transitStockCount: s.inTransit,
    }));
    await storage.upsertOzonStocks(companyId, stockRows);

    const detailRows = Array.from(detailMap.values()).map(item => ({
      sku: item.resolvedOfferId,
      ozonSku: item.sku,
      warehouseId: String(item.warehouse_id),
      warehouseName: item.warehouse_name,
      clusterName: item.cluster_name,
      availableStockCount: item.available_stock_count || 0,
      validStockCount: item.valid_stock_count || 0,
      waitingDocsStockCount: item.waiting_docs_stock_count || 0,
      expiringStockCount: item.expiring_stock_count || 0,
      transitDefectStockCount: item.transit_defect_stock_count || 0,
      stockDefectStockCount: item.stock_defect_stock_count || 0,
      excessStockCount: item.excess_stock_count || 0,
      otherStockCount: item.other_stock_count || 0,
      requestedStockCount: item.requested_stock_count || 0,
      transitStockCount: item.transit_stock_count || 0,
      returnFromCustomerStockCount: item.return_from_customer_stock_count || 0,
      returnToSellerStockCount: item.return_to_seller_stock_count || 0,
    }));
    await storage.upsertOzonStockDetails(companyId, detailRows);

    console.log(`[Ozon sync] company=${companyId} synced ${stockRows.length} SKUs, ${detailRows.length} detail rows`);
    return { synced: stockRows.length };
  } catch (err: any) {
    console.error(`[Ozon sync] company=${companyId} error:`, err.message);
    return { synced: 0, error: err.message };
  }
}

export async function hasActiveOzonIntegrations(): Promise<boolean> {
  const rows = await db
    .select({ companyId: marketplaceIntegrations.companyId })
    .from(marketplaceIntegrations)
    .where(
      and(
        eq(marketplaceIntegrations.marketplace, "ozon"),
        eq(marketplaceIntegrations.isEnabled, true)
      )
    )
    .limit(1);
  return rows.length > 0;
}

export async function syncAllCompaniesOzon(): Promise<void> {
  try {
    const integrations = await db
      .select({ companyId: marketplaceIntegrations.companyId })
      .from(marketplaceIntegrations)
      .where(
        and(
          eq(marketplaceIntegrations.marketplace, "ozon"),
          eq(marketplaceIntegrations.isEnabled, true)
        )
      );

    if (integrations.length === 0) return;

    console.log(`[Ozon sync] Starting sync for ${integrations.length} company(ies)`);
    for (const { companyId } of integrations) {
      const result = await syncOzonStocksForCompany(companyId);
      storage.logActivity({ companyId, userId: null, actionType: "sync", entityType: "sync_ozon", description: `Auto sync Ozon: ${result.synced} records`, metadata: result }).catch(console.error);
    }
  } catch (err: any) {
    console.error("[Ozon sync] Global sync error:", err.message);
  }
}

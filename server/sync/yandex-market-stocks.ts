import { storage } from "../storage";
import { db } from "../db";
import { marketplaceIntegrations, companies } from "@shared/schema";
import { eq, and } from "drizzle-orm";

const YM_API_BASE = "https://api.partner.market.yandex.ru";
const BATCH_SIZE = 500;

// Warehouse names containing this string are considered "in transit to YM warehouse"
const TRANSIT_KEYWORD = "транзитн";

// Warehouses physically belonging to 3PL — excluded from YM stock counts, attributed to 3PL instead
// key = YM warehouseId, value = display name to use in threepl_stock_details
const THREEPL_ATTRIBUTED_WAREHOUSES: Record<number, string> = {
  308: "Яндекс.Маркет (Суперсклад)",
};

interface YMOffer {
  offerId: string;
  updatedAt?: string;
  stocks: { type: string; count: number }[];
}

interface YMWarehouse {
  warehouseId: number;
  warehouseName?: string;
  offers: YMOffer[];
}

async function fetchStocksPage(
  campaignId: string,
  apiKey: string,
  offerIds: string[]
): Promise<YMWarehouse[]> {
  const res = await fetch(`${YM_API_BASE}/campaigns/${campaignId}/offers/stocks`, {
    method: "POST",
    headers: {
      "Api-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ offerIds, withTurnover: false }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`YM API error ${res.status}: ${text}`);
  }

  const data = await res.json() as any;
  if (data.status !== "OK" || !data.result?.warehouses) {
    throw new Error(`Unexpected YM response: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return data.result.warehouses as YMWarehouse[];
}

export async function syncYandexMarketStocksForCompany(companyId: number): Promise<{ synced: number; error?: string }> {
  try {
    const [integration] = await db
      .select()
      .from(marketplaceIntegrations)
      .where(
        and(
          eq(marketplaceIntegrations.companyId, companyId),
          eq(marketplaceIntegrations.marketplace, "yandex_market"),
          eq(marketplaceIntegrations.isEnabled, true)
        )
      );

    if (!integration?.apiKey) {
      return { synced: 0, error: "No active Yandex Market integration with API key" };
    }

    const settings = (integration as any).settings as { campaignIds?: string[] } | null;
    const campaignIdsRaw: string[] = Array.isArray(settings?.campaignIds) && settings!.campaignIds!.length > 0
      ? settings!.campaignIds!
      : (integration.campaignId ? [integration.campaignId] : []);
    const campaignIds = Array.from(new Set(campaignIdsRaw.map(c => String(c).trim()).filter(Boolean)));

    if (campaignIds.length === 0) {
      return { synced: 0, error: "No active Yandex Market integration with campaign ID(s)" };
    }

    const companyProducts = await storage.getCompanyProducts(companyId);
    if (companyProducts.length === 0) {
      return { synced: 0 };
    }

    const offerIds = companyProducts.map(p => p.sku);

    // Aggregated totals per SKU
    const stockMap = new Map<string, { available: number; inTransit: number }>();
    for (const sku of offerIds) {
      stockMap.set(sku, { available: 0, inTransit: 0 });
    }

    // Per-warehouse per-type details: key = "sku|warehouseId|stockType"
    type DetailKey = string;
    const detailMap = new Map<DetailKey, { sku: string; warehouseId: number; warehouseName: string; stockType: string; count: number }>();

    // 3PL-attributed warehouse data: key = "sku|warehouseName"
    type ThreeplKey = string;
    const threeplMap = new Map<ThreeplKey, { sku: string; warehouseName: string; qtyNew: number; qtyDefect: number; qtyReserved: number }>();

    // Stocks from multiple campaigns (cabinets) are summed per (sku, warehouseId, stockType).
    for (const campaignId of campaignIds) {
      for (let i = 0; i < offerIds.length; i += BATCH_SIZE) {
        const batch = offerIds.slice(i, i + BATCH_SIZE);
        const warehouses = await fetchStocksPage(campaignId, integration.apiKey, batch);

        for (const warehouse of warehouses) {
          const wId = warehouse.warehouseId;
          const threeplName = THREEPL_ATTRIBUTED_WAREHOUSES[wId];
          if (threeplName !== undefined) {
            // This warehouse belongs to 3PL — collect its stock for threepl_stock_details
            for (const offer of warehouse.offers || []) {
              const sku = String(offer.offerId);
              const key: ThreeplKey = `${sku}|${threeplName}`;
              if (!threeplMap.has(key)) threeplMap.set(key, { sku, warehouseName: threeplName, qtyNew: 0, qtyDefect: 0, qtyReserved: 0 });
              const entry = threeplMap.get(key)!;
              for (const s of offer.stocks || []) {
                const cnt = s.count || 0;
                if (cnt === 0) continue;
                if (s.type === "AVAILABLE") entry.qtyNew += cnt;
                else if (s.type === "DEFECT" || s.type === "QUARANTINE") entry.qtyDefect += cnt;
                else if (s.type === "FREEZE") entry.qtyReserved += cnt;
              }
            }
            continue; // do NOT include in YM aggregates or YM details
          }
          const isTransit = (warehouse.warehouseName || "").toLowerCase().includes(TRANSIT_KEYWORD);
          const wName = warehouse.warehouseName || String(wId);

          for (const offer of warehouse.offers || []) {
            const sku = String(offer.offerId);
            if (!stockMap.has(sku)) stockMap.set(sku, { available: 0, inTransit: 0 });
            const entry = stockMap.get(sku)!;

            for (const s of offer.stocks || []) {
              const cnt = s.count || 0;
              if (cnt === 0) continue;

              // Aggregate totals (summed across campaigns)
              if (isTransit) {
                entry.inTransit += cnt;
              } else if (s.type === "AVAILABLE") {
                entry.available += cnt;
              }

              // Per-warehouse detail — sum if same key appears from another campaign
              const key = `${sku}|${wId}|${s.type}`;
              const existing = detailMap.get(key);
              if (existing) {
                existing.count += cnt;
              } else {
                detailMap.set(key, { sku, warehouseId: wId, warehouseName: wName, stockType: s.type, count: cnt });
              }
            }
          }
        }

        if (i + BATCH_SIZE < offerIds.length) {
          await new Promise(r => setTimeout(r, 300));
        }
      }
    }

    // Persist aggregated stocks
    const rows = Array.from(stockMap.entries()).map(([sku, s]) => ({
      sku,
      stockAvailable: s.available,
      stockInTransit: s.inTransit,
    }));
    await storage.upsertYandexMarketStocks(companyId, rows);

    // Persist details
    const detailRows = Array.from(detailMap.values());
    if (detailRows.length > 0) {
      await storage.upsertYandexMarketStockDetails(companyId, detailRows);
    }

    // Save 3PL-attributed warehouse data into threepl_stock_details
    if (threeplMap.size > 0) {
      const threeplDetailRows = Array.from(threeplMap.values()).map(r => ({
        sku: r.sku,
        warehouseId: null as null,
        warehouseName: r.warehouseName,
        qtyNew: r.qtyNew,
        qtyDefect: r.qtyDefect,
        qtyReserved: r.qtyReserved,
        qtyExpected: 0,
      }));
      await storage.upsertThreeplStockDetails(companyId, threeplDetailRows);
      console.log(`[YM sync] company=${companyId} saved ${threeplDetailRows.length} rows to 3PL details (attributed warehouses)`);
    }

    console.log(`[YM sync] company=${companyId} synced ${rows.length} SKUs, ${detailRows.length} detail rows across ${campaignIds.length} campaign(s)`);
    return { synced: rows.length };
  } catch (err: any) {
    console.error(`[YM sync] company=${companyId} error:`, err.message);
    return { synced: 0, error: err.message };
  }
}

export async function hasActiveYMIntegrations(): Promise<boolean> {
  const rows = await db
    .select({ companyId: marketplaceIntegrations.companyId })
    .from(marketplaceIntegrations)
    .where(
      and(
        eq(marketplaceIntegrations.marketplace, "yandex_market"),
        eq(marketplaceIntegrations.isEnabled, true)
      )
    )
    .limit(1);
  return rows.length > 0;
}

export async function syncAllCompaniesYandexMarket(): Promise<void> {
  try {
    // Find all companies with active YM integration
    const integrations = await db
      .select({ companyId: marketplaceIntegrations.companyId })
      .from(marketplaceIntegrations)
      .where(
        and(
          eq(marketplaceIntegrations.marketplace, "yandex_market"),
          eq(marketplaceIntegrations.isEnabled, true)
        )
      );

    if (integrations.length === 0) return;

    console.log(`[YM sync] Starting sync for ${integrations.length} company(ies)`);

    for (const { companyId } of integrations) {
      const result = await syncYandexMarketStocksForCompany(companyId);
      storage.logActivity({ companyId, userId: null, actionType: "sync", entityType: "sync_ym", description: `Auto sync YM: ${result.synced} records`, metadata: result }).catch(console.error);
    }
  } catch (err: any) {
    console.error("[YM sync] Global sync error:", err.message);
  }
}

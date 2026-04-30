import { storage } from "../storage";
import { db } from "../db";
import { marketplaceIntegrations } from "@shared/schema";
import { eq, and } from "drizzle-orm";

const WB_SUPPLIES_API = "https://supplies-api.wildberries.ru";

interface WBSupplyListItem {
  supplyID?: number;
  preorderID?: number;
  statusID?: number;
  boxTypeID?: number;
  phone?: string;
  createDate?: string;
  supplyDate?: string;
  factDate?: string;
  updatedDate?: string;
  isBoxOnPallet?: boolean;
}

interface WBSupplyDetail {
  supplyID?: number;
  preorderID?: number;
  statusID: number;
  boxTypeID?: number;
  phone?: string;
  createDate?: string;
  supplyDate?: string;
  factDate?: string;
  updatedDate?: string;
  warehouseID?: number;
  warehouseName?: string;
  actualWarehouseID?: number;
  actualWarehouseName?: string;
  transitWarehouseID?: number;
  transitWarehouseName?: string;
  acceptanceCost?: number;
  paidAcceptanceCoefficient?: number;
  rejectReason?: string | null;
  supplierAssignName?: string;
  storageCoef?: string;
  deliveryCoef?: string;
  quantity?: number;
  acceptedQuantity?: number;
  readyForSaleQuantity?: number;
  unloadingQuantity?: number;
  depersonalizedQuantity?: number;
  isBoxOnPallet?: boolean;
}

interface WBSupplyGood {
  vendorCode: string;
  barcode?: string;
  nmID?: number;
  techSize?: string;
  color?: string;
  needKiz?: boolean;
  tnved?: string;
  supplierBoxAmount?: number;
  quantity: number;
  readyForSaleQuantity: number;
  unloadingQuantity: number;
  acceptedQuantity: number;
}

const ACTIVE_STATUS_IDS = [2, 3, 4, 6];

// In-memory lock: prevents concurrent syncs for the same company
const syncLocks = new Set<number>();

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, options);
    if (res.status !== 429) return res;
    const retryAfter = Number(res.headers.get("Retry-After") || "0") * 1000 || attempt * 3000;
    console.warn(`[WB transit] 429 on ${url}, retrying in ${retryAfter}ms (attempt ${attempt}/${maxRetries})`);
    await sleep(retryAfter);
  }
  return fetch(url, options);
}

async function fetchSuppliesList(apiKey: string): Promise<WBSupplyListItem[]> {
  const today = new Date();
  const windowDaysAgo = new Date(today);
  windowDaysAgo.setDate(today.getDate() - 30);
  const fmt = (d: Date) => d.toISOString().split("T")[0];

  const res = await fetchWithRetry(`${WB_SUPPLIES_API}/api/v1/supplies`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      statusIDs: ACTIVE_STATUS_IDS,
      dates: [{ from: fmt(windowDaysAgo), till: fmt(today), type: "createDate" }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WB Supplies list API error ${res.status}: ${text}`);
  }

  const data = await res.json() as any;
  return Array.isArray(data) ? data : [];
}

async function fetchSupplyDetail(apiKey: string, supplyId: number): Promise<WBSupplyDetail | null> {
  const res = await fetchWithRetry(`${WB_SUPPLIES_API}/api/v1/supplies/${supplyId}?isUnplanned=false`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    if (res.status === 404) return null;
    const text = await res.text();
    throw new Error(`WB Supply detail API error ${res.status}: ${text}`);
  }

  const data = await res.json() as any;
  return data as WBSupplyDetail;
}

async function fetchSupplyGoods(apiKey: string, supplyId: number): Promise<WBSupplyGood[]> {
  const url = `${WB_SUPPLIES_API}/api/v1/supplies/${supplyId}/goods?isUnplanned=false&limit=1000`;
  const res = await fetchWithRetry(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    if (res.status === 404) return [];
    const text = await res.text();
    throw new Error(`WB Supply goods API error ${res.status}: ${text}`);
  }

  const data = await res.json() as any;
  return Array.isArray(data)
    ? data.map((item: any) => ({
        vendorCode: String(item.vendorCode || ""),
        barcode: item.barcode ? String(item.barcode) : undefined,
        nmID: item.nmID != null ? Number(item.nmID) : undefined,
        techSize: item.techSize ? String(item.techSize) : undefined,
        color: item.color ? String(item.color) : undefined,
        needKiz: item.needKiz != null ? Boolean(item.needKiz) : undefined,
        tnved: item.tnved ? String(item.tnved) : undefined,
        supplierBoxAmount: item.supplierBoxAmount != null ? Number(item.supplierBoxAmount) : undefined,
        quantity: Number(item.quantity) || 0,
        readyForSaleQuantity: Number(item.readyForSaleQuantity) || 0,
        unloadingQuantity: Number(item.unloadingQuantity) || 0,
        acceptedQuantity: Number(item.acceptedQuantity) || 0,
      }))
    : [];
}

export async function syncWBSuppliesForCompany(companyId: number): Promise<{ synced: number; error?: string }> {
  if (syncLocks.has(companyId)) {
    console.warn(`[WB transit] company=${companyId} sync already running, skipping`);
    return { synced: 0, error: "Sync already in progress" };
  }
  syncLocks.add(companyId);

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
    const skuSet = new Set(companyProducts.map(p => p.sku));
    const barcodeToSku = new Map<string, string>();
    for (const p of companyProducts) {
      if (p.barcode) barcodeToSku.set(p.barcode, p.sku);
    }

    const supplies = await fetchSuppliesList(integration.apiKey);
    const activeSupplies = supplies.filter((s) => s.supplyID != null);
    console.log(`[WB transit] company=${companyId} found ${activeSupplies.length} active supplies (statusIDs=[2,3,4,6])`);

    const supplyRows: Parameters<typeof storage.upsertWBSupplies>[1] = [];
    const goodRows: Parameters<typeof storage.upsertWBSupplyGoods>[1] = [];
    const transitMap = new Map<string, number>();

    for (const item of activeSupplies) {
      try {
        // Sequential requests, 2100ms between each call (API limit: 30 req/min, 2 sec interval)
        const detail = await fetchSupplyDetail(integration.apiKey, item.supplyID!);
        await sleep(2100);
        const goods = await fetchSupplyGoods(integration.apiKey, item.supplyID!);

        if (detail) {
          supplyRows.push({
            supplyId: detail.supplyID ?? item.supplyID!,
            preorderId: detail.preorderID ?? item.preorderID ?? null,
            statusId: detail.statusID ?? item.statusID ?? 0,
            boxTypeId: detail.boxTypeID ?? item.boxTypeID ?? null,
            phone: detail.phone ?? item.phone ?? null,
            createDate: detail.createDate ? new Date(detail.createDate) : (item.createDate ? new Date(item.createDate) : null),
            supplyDate: detail.supplyDate ? new Date(detail.supplyDate) : (item.supplyDate ? new Date(item.supplyDate) : null),
            factDate: detail.factDate ? new Date(detail.factDate) : (item.factDate ? new Date(item.factDate) : null),
            updatedDate: detail.updatedDate ? new Date(detail.updatedDate) : (item.updatedDate ? new Date(item.updatedDate) : null),
            warehouseId: detail.warehouseID ?? null,
            warehouseName: detail.warehouseName ?? null,
            actualWarehouseId: detail.actualWarehouseID ?? null,
            actualWarehouseName: detail.actualWarehouseName ?? null,
            transitWarehouseId: detail.transitWarehouseID ?? null,
            transitWarehouseName: detail.transitWarehouseName ?? null,
            acceptanceCost: detail.acceptanceCost ?? null,
            paidAcceptanceCoefficient: detail.paidAcceptanceCoefficient ?? null,
            rejectReason: detail.rejectReason ?? null,
            supplierAssignName: detail.supplierAssignName ?? null,
            storageCoef: detail.storageCoef ?? null,
            deliveryCoef: detail.deliveryCoef ?? null,
            quantity: detail.quantity ?? 0,
            acceptedQuantity: detail.acceptedQuantity ?? 0,
            readyForSaleQuantity: detail.readyForSaleQuantity ?? 0,
            unloadingQuantity: detail.unloadingQuantity ?? 0,
            depersonalizedQuantity: detail.depersonalizedQuantity ?? 0,
            isBoxOnPallet: detail.isBoxOnPallet ?? item.isBoxOnPallet ?? null,
          });
        }

        const warehouseName = detail?.warehouseName ?? null;

        for (const good of goods) {
          if (!good.vendorCode) continue;
          goodRows.push({
            supplyId: item.supplyID!,
            warehouseName,
            vendorCode: good.vendorCode,
            barcode: good.barcode ?? null,
            nmId: good.nmID ?? null,
            techSize: good.techSize ?? null,
            color: good.color ?? null,
            needKiz: good.needKiz ?? null,
            tnved: good.tnved ?? null,
            supplierBoxAmount: good.supplierBoxAmount ?? null,
            quantity: good.quantity,
            readyForSaleQuantity: good.readyForSaleQuantity,
            unloadingQuantity: good.unloadingQuantity,
            acceptedQuantity: good.acceptedQuantity,
          });

          const inTransit = Math.max(0, good.quantity - good.readyForSaleQuantity);
          if (inTransit > 0) {
            const sku = skuSet.has(good.vendorCode)
              ? good.vendorCode
              : (good.barcode ? (barcodeToSku.get(good.barcode) ?? null) : null);
            if (sku) transitMap.set(sku, (transitMap.get(sku) ?? 0) + inTransit);
          }
        }
      } catch (err: any) {
        console.warn(`[WB transit] supply ${item.supplyID} error: ${err.message}`);
      }
      await sleep(2100);
    }

    if (supplyRows.length === 0) {
      console.warn(`[WB transit] company=${companyId} 0 supplies fetched successfully — preserving existing data`);
      return { synced: 0, error: "All supply requests failed, data preserved" };
    }

    await storage.upsertWBSupplies(companyId, supplyRows);
    await storage.upsertWBSupplyGoods(companyId, goodRows);

    const transitRows = Array.from(transitMap.entries()).map(([sku, qtyInTransit]) => ({ sku, qtyInTransit }));
    await storage.upsertWBTransitStocks(companyId, transitRows);

    console.log(`[WB transit] company=${companyId} synced ${supplyRows.length} supplies, ${goodRows.length} goods, ${transitRows.length} SKUs in transit`);
    return { synced: transitRows.length };
  } catch (err: any) {
    console.error(`[WB transit] company=${companyId} error:`, err.message);
    return { synced: 0, error: err.message };
  } finally {
    syncLocks.delete(companyId);
  }
}

export async function syncAllCompaniesWBTransit(): Promise<void> {
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

    console.log(`[WB transit] Starting sync for ${integrations.length} company(ies)`);

    for (const { companyId } of integrations) {
      const result = await syncWBSuppliesForCompany(companyId);
      storage.logActivity({ companyId, userId: null, actionType: "sync", entityType: "sync_wb_transit", description: `Auto sync WB transit: ${result.synced} records`, metadata: result }).catch(console.error);
    }
  } catch (err: any) {
    console.error("[WB transit] Global sync error:", err.message);
  }
}

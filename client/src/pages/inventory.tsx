import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import Sidebar from "@/components/dashboard/sidebar";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Search, Package, ChevronsLeft, ChevronsRight, ShoppingCart, Download, MoreHorizontal, Info } from "lucide-react";
import * as XLSX from "xlsx";
import type { Product } from "@shared/schema";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
import { CategoryFilter } from "@/components/ui/category-filter";

const ITEMS_PER_PAGE = 30;

type StockEntry = { available: number; inTransit: number; syncedAt: string | null };
type StocksMap = Record<string, StockEntry>;

type StockDetail = {
  warehouseId: number;
  warehouseName: string | null;
  stockType: string;
  count: number;
};

type OzonStockDetail = {
  warehouseId: string;
  warehouseName: string | null;
  clusterName: string | null;
  availableStockCount: number;
  validStockCount: number;
  waitingDocsStockCount: number;
  expiringStockCount: number;
  transitDefectStockCount: number;
  stockDefectStockCount: number;
  excessStockCount: number;
  otherStockCount: number;
  requestedStockCount: number;
  transitStockCount: number;
  returnFromCustomerStockCount: number;
  returnToSellerStockCount: number;
};

const WAREHOUSE_NAMES: Record<string, string> = {
  "1933422": "KZ Боралдай",
  "424": "CEL_FBP",
  "163": "Лаборатория Контента",
  "700": "Склад Алис",
  "618": "3PL Домодедово",
  "617": "3PL Жуковский",
  "601": "3PL Софьино",
  "597": "3PL Сынково",
  "658": "3PL Чехов",
  "312": "Яндекс.Маркет (Домодедово КГТ)",
  "501": "Яндекс.Маркет (Домодедово возвратный)",
  "300": "Яндекс.Маркет (Екатеринбург)",
  "306": "Яндекс.Маркет (Пущино)",
  "305": "Яндекс.Маркет (Ростов-на-Дону КГТ)",
  "302": "Яндекс.Маркет (Самара)",
  "313": "Яндекс.Маркет (Санкт-Петербург Фортис)",
  "301": "Яндекс.Маркет (Санкт-Петербург)",
  "304": "Яндекс.Маркет (Софьино КГТ)",
  "308": "Яндекс.Маркет (Софьино Суперсклад)",
  "172": "Яндекс.Маркет (Софьино)",
  "311": "Яндекс.Маркет (Ташкент)",
};

function resolveWarehouseName(warehouseId: number, fallback: string | null): string {
  return WAREHOUSE_NAMES[String(warehouseId)] || fallback || String(warehouseId);
}

const STOCK_TYPE_LABELS: Record<string, string> = {
  AVAILABLE: "Available (доступен)",
  FREEZE: "Freeze (зарезервирован)",
  QUARANTINE: "Quarantine (карантин)",
  DEFECT: "Defect (брак)",
  EXPIRED: "Expired (просрочен)",
  UTILIZATION: "Utilization (утилизация)",
  SURPLUS: "Surplus (излишек)",
};

const STOCK_TYPE_COLORS: Record<string, string> = {
  FIT: "bg-green-100 text-green-800",
  AVAILABLE: "bg-blue-100 text-blue-800",
  FREEZE: "bg-sky-100 text-sky-800",
  QUARANTINE: "bg-yellow-100 text-yellow-800",
  DEFECT: "bg-red-100 text-red-800",
  EXPIRED: "bg-orange-100 text-orange-800",
  UTILIZATION: "bg-gray-100 text-gray-700",
  SURPLUS: "bg-purple-100 text-purple-800",
};

const TYPE_ORDER = ["AVAILABLE", "FREEZE", "QUARANTINE", "DEFECT"];

function StockDetailModal({
  open,
  onClose,
  product,
}: {
  open: boolean;
  onClose: () => void;
  product: Product | null;
}) {
  const { data: details, isLoading } = useQuery<StockDetail[]>({
    queryKey: ["/api/inventory/stocks/detail", product?.sku],
    queryFn: async () => {
      const res = await fetch(`/api/inventory/stocks/${encodeURIComponent(product!.sku)}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!res.ok) throw new Error("Failed to fetch stock details");
      return res.json();
    },
    enabled: open && !!product,
    staleTime: 60_000,
  });

  type YMRow = { name: string; available: number; freeze: number; quarantine: number; defect: number };
  const ymByWarehouse: Record<string, YMRow> = {};
  for (const d of (details || [])) {
    const name = resolveWarehouseName(d.warehouseId, d.warehouseName);
    if (!ymByWarehouse[name]) ymByWarehouse[name] = { name, available: 0, freeze: 0, quarantine: 0, defect: 0 };
    if (d.stockType === "AVAILABLE") ymByWarehouse[name].available += d.count;
    else if (d.stockType === "FREEZE") ymByWarehouse[name].freeze += d.count;
    else if (d.stockType === "QUARANTINE") ymByWarehouse[name].quarantine += d.count;
    else if (d.stockType === "DEFECT") ymByWarehouse[name].defect += d.count;
  }
  const rows: YMRow[] = (Object.values(ymByWarehouse) as YMRow[]).sort((a: YMRow, b: YMRow) => b.available - a.available);

  const totals = rows.reduce(
    (s: YMRow, r: YMRow) => ({ name: "", available: s.available + r.available, freeze: s.freeze + r.freeze, quarantine: s.quarantine + r.quarantine, defect: s.defect + r.defect }),
    { name: "", available: 0, freeze: 0, quarantine: 0, defect: 0 }
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">
            Yandex Market — остатки по складам
          </DialogTitle>
          {product && (
            <div className="text-sm text-gray-500 mt-0.5">
              {product.productName} · <span className="font-mono">{product.sku}</span>
            </div>
          )}
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-10 text-sm text-gray-500">
            Нет данных по остаткам на складах
          </div>
        ) : (
          <div className="mt-2">
            <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Склад</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase">Доступен</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase">Транзит</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase">Резерв</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase">Карантин</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase">Брак</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.name} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-2 text-gray-800">{r.name}</td>
                    <td className="px-4 py-2 text-right font-medium text-gray-900">{r.available > 0 ? r.available : "—"}</td>
                    <td className="px-4 py-2 text-right text-sky-600">—</td>
                    <td className="px-4 py-2 text-right text-blue-600">{r.freeze > 0 ? r.freeze : "—"}</td>
                    <td className="px-4 py-2 text-right text-yellow-600">{r.quarantine > 0 ? r.quarantine : "—"}</td>
                    <td className="px-4 py-2 text-right text-red-600">{r.defect > 0 ? r.defect : "—"}</td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-medium">
                  <td className="px-4 py-2 text-xs text-gray-500 uppercase">Итого</td>
                  <td className="px-4 py-2 text-right text-gray-900">{totals.available}</td>
                  <td className="px-4 py-2 text-right text-sky-600">—</td>
                  <td className="px-4 py-2 text-right text-blue-600">{totals.freeze > 0 ? totals.freeze : "—"}</td>
                  <td className="px-4 py-2 text-right text-yellow-600">{totals.quarantine > 0 ? totals.quarantine : "—"}</td>
                  <td className="px-4 py-2 text-right text-red-600">{totals.defect > 0 ? totals.defect : "—"}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

const OZON_STOCK_LABELS: Record<string, string> = {
  availableStockCount: "Available (доступно)",
  transitStockCount: "In transit (в пути)",
  validStockCount: "Valid (годный)",
  waitingDocsStockCount: "Waiting docs (ожидает документы)",
  expiringStockCount: "Expiring (истекает срок)",
  transitDefectStockCount: "Defect in transit (брак в пути)",
  stockDefectStockCount: "Defect on stock (брак на складе)",
  excessStockCount: "Excess (излишек)",
  otherStockCount: "Other (прочее)",
  requestedStockCount: "Requested (запрошен)",
  returnFromCustomerStockCount: "Return from customer",
  returnToSellerStockCount: "Return to seller",
};

const OZON_STOCK_TYPE_ORDER = [
  "availableStockCount",
  "transitStockCount",
  "validStockCount",
  "waitingDocsStockCount",
  "expiringStockCount",
  "transitDefectStockCount",
  "stockDefectStockCount",
  "excessStockCount",
  "otherStockCount",
  "requestedStockCount",
  "returnFromCustomerStockCount",
  "returnToSellerStockCount",
];

const OZON_STOCK_COLORS: Record<string, string> = {
  availableStockCount: "bg-blue-100 text-blue-800",
  transitStockCount: "bg-sky-100 text-sky-800",
  validStockCount: "bg-green-100 text-green-800",
  waitingDocsStockCount: "bg-yellow-100 text-yellow-800",
  expiringStockCount: "bg-orange-100 text-orange-800",
  transitDefectStockCount: "bg-red-100 text-red-800",
  stockDefectStockCount: "bg-red-100 text-red-800",
  excessStockCount: "bg-purple-100 text-purple-800",
  otherStockCount: "bg-gray-100 text-gray-700",
  requestedStockCount: "bg-indigo-100 text-indigo-800",
  returnFromCustomerStockCount: "bg-pink-100 text-pink-800",
  returnToSellerStockCount: "bg-rose-100 text-rose-800",
};

function OzonStockDetailModal({
  open,
  onClose,
  product,
}: {
  open: boolean;
  onClose: () => void;
  product: { sku: string; productName: string } | null;
}) {
  const { data: details, isLoading } = useQuery<OzonStockDetail[]>({
    queryKey: ["/api/inventory/ozon-stocks/detail", product?.sku],
    queryFn: async () => {
      const res = await fetch(`/api/inventory/ozon-stocks/${encodeURIComponent(product!.sku)}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!res.ok) throw new Error("Failed to fetch Ozon stock details");
      return res.json();
    },
    enabled: open && !!product,
    staleTime: 60_000,
  });

  type OzonRow = { warehouseId: string; warehouseName: string | null; clusterName: string | null; available: number; transit: number; quarantine: number; defect: number };
  const ozonRows: OzonRow[] = (details || []).map((w: OzonStockDetail) => ({
    warehouseId: w.warehouseId,
    warehouseName: w.warehouseName,
    clusterName: w.clusterName,
    available: w.availableStockCount,
    transit: w.transitStockCount,
    quarantine: w.waitingDocsStockCount + w.expiringStockCount + w.otherStockCount + w.returnFromCustomerStockCount + w.returnToSellerStockCount,
    defect: w.stockDefectStockCount,
  })).filter((w: OzonRow) => w.warehouseId !== "0").sort((a: OzonRow, b: OzonRow) => b.available - a.available);

  const ozonTotals = ozonRows.reduce(
    (s: { available: number; transit: number; quarantine: number; defect: number }, r: OzonRow) => ({
      available: s.available + r.available,
      transit: s.transit + r.transit,
      quarantine: s.quarantine + r.quarantine,
      defect: s.defect + r.defect,
    }),
    { available: 0, transit: 0, quarantine: 0, defect: 0 }
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">
            Ozon — остатки по складам
          </DialogTitle>
          {product && (
            <div className="text-sm text-gray-500 mt-0.5">
              {product.productName} · <span className="font-mono">{product.sku}</span>
            </div>
          )}
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : ozonRows.length === 0 ? (
          <div className="text-center py-10 text-sm text-gray-500">
            Нет данных по остаткам на складах
          </div>
        ) : (
          <div className="mt-2">
            <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Склад</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase">Доступен</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase">Транзит</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase">Резерв</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase">Карантин</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase">Брак</th>
                </tr>
              </thead>
              <tbody>
                {ozonRows.map((w: OzonRow) => (
                  <tr key={w.warehouseId} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-2 text-gray-800">
                      {w.warehouseName || w.warehouseId}
                      {w.clusterName && <span className="ml-1 text-xs text-gray-400">({w.clusterName})</span>}
                    </td>
                    <td className="px-4 py-2 text-right font-medium text-gray-900">{w.available > 0 ? w.available : "—"}</td>
                    <td className="px-4 py-2 text-right text-sky-600">{w.transit > 0 ? w.transit : "—"}</td>
                    <td className="px-4 py-2 text-right text-blue-600">—</td>
                    <td className="px-4 py-2 text-right text-yellow-600">{w.quarantine > 0 ? w.quarantine : "—"}</td>
                    <td className="px-4 py-2 text-right text-red-600">{w.defect > 0 ? w.defect : "—"}</td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-medium">
                  <td className="px-4 py-2 text-xs text-gray-500 uppercase">Итого</td>
                  <td className="px-4 py-2 text-right text-gray-900">{ozonTotals.available}</td>
                  <td className="px-4 py-2 text-right text-sky-600">{ozonTotals.transit > 0 ? ozonTotals.transit : "—"}</td>
                  <td className="px-4 py-2 text-right text-blue-600">—</td>
                  <td className="px-4 py-2 text-right text-yellow-600">{ozonTotals.quarantine > 0 ? ozonTotals.quarantine : "—"}</td>
                  <td className="px-4 py-2 text-right text-red-600">{ozonTotals.defect > 0 ? ozonTotals.defect : "—"}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

type ThreePLStockDetail = {
  warehouseId: number | null;
  warehouseName: string;
  qtyNew: number;
  qtyDefect: number;
  qtyReserved: number;
  qtyExpected: number;
};

function ThreePLStockDetailModal({
  open,
  onClose,
  product,
}: {
  open: boolean;
  onClose: () => void;
  product: { sku: string; productName: string } | null;
}) {
  const { data: details, isLoading } = useQuery<ThreePLStockDetail[]>({
    queryKey: ["/api/inventory/3pl-stocks/detail", product?.sku],
    queryFn: async () => {
      const res = await fetch(`/api/inventory/3pl-stocks/${encodeURIComponent(product!.sku)}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!res.ok) throw new Error("Failed to fetch 3PL stock details");
      return res.json();
    },
    enabled: open && !!product,
    staleTime: 60_000,
  });

  const totals = details ? {
    qtyNew: details.reduce((s: number, d: ThreePLStockDetail) => s + d.qtyNew, 0),
    qtyDefect: details.reduce((s: number, d: ThreePLStockDetail) => s + d.qtyDefect, 0),
    qtyReserved: details.reduce((s: number, d: ThreePLStockDetail) => s + d.qtyReserved, 0),
  } : null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">
            3PL — остатки по складам
          </DialogTitle>
          {product && (
            <div className="text-sm text-gray-500 mt-0.5">
              {product.productName} · <span className="font-mono">{product.sku}</span>
            </div>
          )}
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : !details || details.length === 0 ? (
          <div className="text-center py-10 text-sm text-gray-500">
            Нет данных по остаткам на складах
          </div>
        ) : (
          <div className="space-y-2 mt-2">
            <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Склад</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase">Доступен</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase">Резерв</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase">Карантин</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase">Брак</th>
                </tr>
              </thead>
              <tbody>
                {details.map((d) => (
                  <tr key={d.warehouseName} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-2 text-gray-800">{d.warehouseName}</td>
                    <td className="px-4 py-2 text-right font-medium text-gray-900">{d.qtyNew > 0 ? d.qtyNew : "—"}</td>
                    <td className="px-4 py-2 text-right text-blue-600">{d.qtyReserved > 0 ? d.qtyReserved : "—"}</td>
                    <td className="px-4 py-2 text-right text-yellow-600">—</td>
                    <td className="px-4 py-2 text-right text-red-600">{d.qtyDefect > 0 ? d.qtyDefect : "—"}</td>
                  </tr>
                ))}
                {totals && (
                  <tr className="bg-gray-50 font-medium">
                    <td className="px-4 py-2 text-xs text-gray-500 uppercase">Итого</td>
                    <td className="px-4 py-2 text-right text-gray-900">{totals.qtyNew}</td>
                    <td className="px-4 py-2 text-right text-blue-600">{totals.qtyReserved > 0 ? totals.qtyReserved : "—"}</td>
                    <td className="px-4 py-2 text-right text-yellow-600">—</td>
                    <td className="px-4 py-2 text-right text-red-600">{totals.qtyDefect > 0 ? totals.qtyDefect : "—"}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

type WBStockDetail = {
  warehouseName: string;
  quantityFull: number;
  quantityNotInOrders: number;
  inWayToClient: number;
  inWayFromClient: number;
};

interface WBTransitWarehouse {
  warehouseName: string | null;
  qtyInTransit: number;
  qtyUnloading: number;
  qtyAccepted: number;
}

function WBStockDetailModal({
  open,
  onClose,
  product,
}: {
  open: boolean;
  onClose: () => void;
  product: { sku: string; productName: string } | null;
}) {
  const { data: details, isLoading } = useQuery<WBStockDetail[]>({
    queryKey: ["/api/inventory/wb-stocks/detail", product?.sku],
    queryFn: async () => {
      const res = await fetch(`/api/inventory/wb-stocks/${encodeURIComponent(product!.sku)}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!res.ok) throw new Error("Failed to fetch WB stock details");
      return res.json();
    },
    enabled: open && !!product,
    staleTime: 60_000,
  });

  const { data: transitData } = useQuery<WBTransitWarehouse[]>({
    queryKey: ["/api/inventory/wb-transit/sku", product?.sku],
    queryFn: async () => {
      const res = await fetch(`/api/inventory/wb-transit/${encodeURIComponent(product!.sku)}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!res.ok) throw new Error("Failed to fetch WB transit details");
      return res.json();
    },
    enabled: open && !!product,
    staleTime: 60_000,
  });

  const warehouses = (details || [])
    .filter((w: WBStockDetail) => w.quantityFull > 0 || w.inWayToClient > 0)
    .sort((a: WBStockDetail, b: WBStockDetail) =>
      (b.quantityFull - b.inWayToClient - b.inWayFromClient) -
      (a.quantityFull - a.inWayToClient - a.inWayFromClient)
    );

  // Build a lookup: warehouseName (lowercase) → transit data
  const transitByWarehouse = new Map<string, WBTransitWarehouse>();
  for (const t of transitData || []) {
    if (t.warehouseName) transitByWarehouse.set(t.warehouseName.toLowerCase(), t);
  }

  // Find transit entries that don't match any stock warehouse (transit-only rows)
  const stockWarehouseNames = new Set(warehouses.map((w: WBStockDetail) => (w.warehouseName || "").toLowerCase()));
  const transitOnlyRows = (transitData || [] as WBTransitWarehouse[]).filter(
    (t: WBTransitWarehouse) => t.warehouseName && !stockWarehouseNames.has(t.warehouseName.toLowerCase()) && t.qtyInTransit > 0
  );

  const wbTotals = warehouses.reduce(
    (s: { available: number; inWayToClient: number; inWayFromClient: number }, w: WBStockDetail) => ({
      available: s.available + (w.quantityFull - w.inWayToClient - w.inWayFromClient),
      inWayToClient: s.inWayToClient + w.inWayToClient,
      inWayFromClient: s.inWayFromClient + w.inWayFromClient,
    }),
    { available: 0, inWayToClient: 0, inWayFromClient: 0 }
  );

  const totalTransit = (transitData || [] as WBTransitWarehouse[]).reduce((s: number, t: WBTransitWarehouse) => s + t.qtyInTransit, 0);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">
            Wildberries — остатки по складам
          </DialogTitle>
          {product && (
            <div className="text-sm text-gray-500 mt-0.5">
              {product.productName} · <span className="font-mono">{product.sku}</span>
            </div>
          )}
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : warehouses.length === 0 && transitOnlyRows.length === 0 ? (
          <div className="text-center py-10 text-sm text-gray-500">
            Нет данных по остаткам на складах
          </div>
        ) : (
          <div className="mt-2">
            <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Склад</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase">Доступен</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase">Транзит</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase">Резерв</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase">Карантин</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase">Брак</th>
                </tr>
              </thead>
              <tbody>
                {warehouses.map((w: WBStockDetail) => {
                  const available = w.quantityFull - w.inWayToClient - w.inWayFromClient;
                  const transit = transitByWarehouse.get((w.warehouseName || "").toLowerCase());
                  return (
                    <tr key={w.warehouseName} className="border-b border-gray-50 last:border-0">
                      <td className="px-4 py-2 text-gray-800">{w.warehouseName}</td>
                      <td className="px-4 py-2 text-right font-medium text-gray-900">{available > 0 ? available : "—"}</td>
                      <td className="px-4 py-2 text-right text-sky-600">{transit && transit.qtyInTransit > 0 ? transit.qtyInTransit : "—"}</td>
                      <td className="px-4 py-2 text-right text-blue-600">{w.inWayToClient > 0 ? w.inWayToClient : "—"}</td>
                      <td className="px-4 py-2 text-right text-yellow-600">{w.inWayFromClient > 0 ? w.inWayFromClient : "—"}</td>
                      <td className="px-4 py-2 text-right text-red-600">—</td>
                    </tr>
                  );
                })}
                {transitOnlyRows.map((t) => (
                  <tr key={`transit-${t.warehouseName}`} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-2 text-gray-800">{t.warehouseName}</td>
                    <td className="px-4 py-2 text-right font-medium text-gray-900">—</td>
                    <td className="px-4 py-2 text-right text-sky-600">{t.qtyInTransit}</td>
                    <td className="px-4 py-2 text-right text-blue-600">—</td>
                    <td className="px-4 py-2 text-right text-yellow-600">—</td>
                    <td className="px-4 py-2 text-right text-red-600">—</td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-medium">
                  <td className="px-4 py-2 text-xs text-gray-500 uppercase">Итого</td>
                  <td className="px-4 py-2 text-right text-gray-900">{wbTotals.available}</td>
                  <td className="px-4 py-2 text-right text-sky-600">{totalTransit > 0 ? totalTransit : "—"}</td>
                  <td className="px-4 py-2 text-right text-blue-600">{wbTotals.inWayToClient > 0 ? wbTotals.inWayToClient : "—"}</td>
                  <td className="px-4 py-2 text-right text-yellow-600">{wbTotals.inWayFromClient > 0 ? wbTotals.inWayFromClient : "—"}</td>
                  <td className="px-4 py-2 text-right text-red-600">—</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function OzonStockCell({
  sku,
  stocks,
  onClick,
}: {
  sku: string;
  stocks: StocksMap | undefined;
  onClick: () => void;
}) {
  const s = stocks?.[sku];
  const available = s?.available ?? 0;
  const inTransit = s?.inTransit ?? 0;
  return (
    <div
      className="cursor-pointer hover:bg-gray-100 rounded px-1 py-0.5 -mx-1 transition-colors"
      onClick={onClick}
    >
      <div className="text-sm font-medium text-gray-900">{available}</div>
      <div className="text-xs text-gray-400 mt-0.5">Stock: {available}</div>
      <div className="text-xs text-gray-400">In transit: {inTransit}</div>
    </div>
  );
}

function YMStockCell({
  sku,
  stocks,
  onClick,
}: {
  sku: string;
  stocks: StocksMap | undefined;
  onClick: () => void;
}) {
  const s = stocks?.[sku];
  const available = s?.available ?? 0;
  const inTransit = s?.inTransit ?? 0;
  return (
    <div
      className="cursor-pointer hover:bg-gray-100 rounded px-1 py-0.5 -mx-1 transition-colors"
      onClick={onClick}
    >
      <div className="text-sm font-medium text-gray-900">{available}</div>
      <div className="text-xs text-gray-400 mt-0.5">Stock: {available}</div>
      <div className="text-xs text-gray-400">In transit: {inTransit}</div>
    </div>
  );
}

function WBStockCell({
  sku,
  stocks,
  transitStocks,
  onClick,
}: {
  sku: string;
  stocks: StocksMap | undefined;
  transitStocks: Record<string, number> | undefined;
  onClick: () => void;
}) {
  const s = stocks?.[sku];
  const available = s?.available ?? 0;
  const inTransit = transitStocks?.[sku] ?? 0;
  return (
    <div
      className="cursor-pointer hover:bg-gray-100 rounded px-1 py-0.5 -mx-1 transition-colors"
      onClick={onClick}
    >
      <div className="text-sm font-medium text-gray-900">{available}</div>
      <div className="text-xs text-gray-400 mt-0.5">Stock: {available}</div>
      <div className="text-xs text-gray-400">In transit: {inTransit}</div>
    </div>
  );
}

function ThreePLStockCell({
  sku,
  stocks,
  onClick,
}: {
  sku: string;
  stocks: Record<string, { available: number; syncedAt: string | null }> | undefined;
  onClick: () => void;
}) {
  const s = stocks?.[sku];
  const available = s?.available ?? 0;
  return (
    <div
      className="cursor-pointer hover:bg-gray-100 rounded px-1 py-0.5 -mx-1 transition-colors"
      onClick={onClick}
    >
      <div className="text-sm font-medium text-gray-900">{available}</div>
      <div className="text-xs text-gray-400 mt-0.5">Stock: {available}</div>
    </div>
  );
}

function EmptyStockCell({ hasTransit = true }: { hasTransit?: boolean }) {
  return (
    <div>
      <div className="text-xs text-gray-400">Stock: —</div>
      {hasTransit && (
        <div className="text-xs text-gray-400">In transit: —</div>
      )}
    </div>
  );
}

type InboundOrder = {
  poNumber: string | null;
  quantityPlan: number | null;
  quantityFact: number | null;
  productionStatus: string | null;
  logisticStatus: string | null;
  etaPlan: string | null;
  etaActual: string | null;
};

function InboundOrdersModal({ sku, onClose }: { sku: string; onClose: () => void }) {
  const { data: orders = [], isLoading } = useQuery<InboundOrder[]>({
    queryKey: ["/api/inbound/orders-by-sku", sku],
    queryFn: async () => {
      const res = await fetch(`/api/inbound/orders-by-sku/${encodeURIComponent(sku)}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!sku,
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Заказы в пути — {sku}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>
        ) : orders.length === 0 ? (
          <p className="text-sm text-gray-500 py-4 text-center">Нет активных заказов</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                <th className="py-2 px-3 text-xs font-medium text-gray-500 uppercase">PO Number</th>
                <th className="py-2 px-3 text-xs font-medium text-gray-500 uppercase text-right">Qty Plan</th>
                <th className="py-2 px-3 text-xs font-medium text-gray-500 uppercase text-right">Qty Fact</th>
                <th className="py-2 px-3 text-xs font-medium text-gray-500 uppercase">Production</th>
                <th className="py-2 px-3 text-xs font-medium text-gray-500 uppercase">Logistic</th>
                <th className="py-2 px-3 text-xs font-medium text-gray-500 uppercase">ETA Plan</th>
                <th className="py-2 px-3 text-xs font-medium text-gray-500 uppercase">ETA Actual</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o, i) => (
                <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2 px-3 text-gray-800">{o.poNumber || "—"}</td>
                  <td className="py-2 px-3 text-gray-800 text-right font-medium">{o.quantityPlan ?? "—"}</td>
                  <td className="py-2 px-3 text-gray-800 text-right font-medium">{o.quantityFact ?? "—"}</td>
                  <td className="py-2 px-3 text-gray-600">{o.productionStatus || "—"}</td>
                  <td className="py-2 px-3 text-gray-600">{o.logisticStatus || "—"}</td>
                  <td className="py-2 px-3 text-gray-800">{o.etaPlan || "—"}</td>
                  <td className="py-2 px-3 text-gray-800">{o.etaActual || "—"}</td>
                </tr>
              ))}
              <tr className="bg-gray-50 font-medium">
                <td className="py-2 px-3 text-gray-700">Итого</td>
                <td className="py-2 px-3 text-gray-900 text-right">{orders.reduce((s, o) => s + (o.quantityPlan ?? 0), 0)}</td>
                <td className="py-2 px-3 text-gray-900 text-right">{orders.reduce((s, o) => s + (o.quantityFact ?? 0), 0)}</td>
                <td colSpan={4} />
              </tr>
            </tbody>
          </table>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function Inventory() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [modalProduct, setModalProduct] = useState<Product | null>(null);
  const [ozonModalProduct, setOzonModalProduct] = useState<Product | null>(null);
  const [wbModalProduct, setWbModalProduct] = useState<Product | null>(null);
  const [threeplModalProduct, setThreeplModalProduct] = useState<Product | null>(null);
  const [orderedModalSku, setOrderedModalSku] = useState<string | null>(null);
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [categoryFilters, setCategoryFilters] = useState<string[]>([]);
  const [vsFilters, setVsFilters] = useState<string[]>([]);
  const [brandFilters, setBrandFilters] = useState<string[]>([]);
  const [supplierFilters, setSupplierFilters] = useState<string[]>([]);
  const [availabilityFilters, setAvailabilityFilters] = useState<string[]>([]);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => { setCurrentPage(1); }, [debouncedSearch, statusFilters, categoryFilters, vsFilters, brandFilters, supplierFilters, availabilityFilters]);

  useEffect(() => {
    if (!lightboxUrl) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setLightboxUrl(null); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [lightboxUrl]);

  // Metadata for filter dropdowns
  const { data: metadata = { categoryHierarchy: {}, statuses: [] } } = useQuery({
    queryKey: ["/api/products/metadata"],
    enabled: !!user,
  });
  const categoryHierarchy: Record<string, string[]> = (metadata as any).categoryHierarchy || {};
  const availableStatuses: string[] = (metadata as any).statuses || [];
  const availableValueStreams: string[] = Object.keys(categoryHierarchy).sort();
  const availableBrands: string[] = (metadata as any).brands || [];
  const availableSuppliers: string[] = (metadata as any).suppliers || [];

  const { data: productsData = { products: [], total: 0, totalPages: 0 }, isLoading } = useQuery({
    queryKey: ["/api/products", "all", debouncedSearch, statusFilters, categoryFilters, vsFilters, brandFilters, supplierFilters, "inventory"],
    queryFn: async () => {
      const needsAll = true;
      const params = new URLSearchParams({
        page: needsAll ? "1" : String(currentPage),
        limit: needsAll ? "10000" : String(ITEMS_PER_PAGE),
        search: debouncedSearch,
        sort: "productName",
        order: "asc",
      });
      if (statusFilters.length > 0) params.set("statuses", JSON.stringify(statusFilters));
      if (categoryFilters.length > 0) params.set("cats", JSON.stringify(categoryFilters));
      if (vsFilters.length > 0) params.set("valueStreams", JSON.stringify(vsFilters));
      if (brandFilters.length > 0) params.set("brands", JSON.stringify(brandFilters));
      if (supplierFilters.length > 0) params.set("suppliers", JSON.stringify(supplierFilters));
      const res = await fetch(`/api/products?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!res.ok) throw new Error("Failed to fetch products");
      return res.json();
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  const { data: summary } = useQuery<{
    totalActive: number;
    totalAvailability: number;
    ymAvailability: number;
    ozonAvailability: number;
    wbAvailability: number;
  }>({
    queryKey: ["/api/inventory/summary", debouncedSearch, statusFilters, categoryFilters, vsFilters, brandFilters, supplierFilters],
    queryFn: async () => {
      const params = new URLSearchParams({ search: debouncedSearch });
      if (statusFilters.length > 0) params.set("statuses", JSON.stringify(statusFilters));
      if (categoryFilters.length > 0) params.set("cats", JSON.stringify(categoryFilters));
      if (vsFilters.length > 0) params.set("valueStreams", JSON.stringify(vsFilters));
      if (brandFilters.length > 0) params.set("brands", JSON.stringify(brandFilters));
      if (supplierFilters.length > 0) params.set("suppliers", JSON.stringify(supplierFilters));
      const res = await fetch(`/api/inventory/summary?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!res.ok) throw new Error("Failed to fetch inventory summary");
      return res.json();
    },
    enabled: !!user,
    staleTime: 5 * 60_000,
  });

  const { data: ozonStocksData } = useQuery<StocksMap>({
    queryKey: ["/api/inventory/ozon-stocks"],
    queryFn: async () => {
      const res = await fetch("/api/inventory/ozon-stocks", {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!res.ok) throw new Error("Failed to fetch Ozon stocks");
      return res.json();
    },
    enabled: !!user,
    staleTime: 5 * 60_000,
  });

  const { data: ymStocks } = useQuery<StocksMap>({
    queryKey: ["/api/inventory/stocks"],
    queryFn: async () => {
      const res = await fetch("/api/inventory/stocks", {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!res.ok) throw new Error("Failed to fetch stocks");
      return res.json();
    },
    enabled: !!user,
    staleTime: 5 * 60_000,
  });

  const { data: threeplStocksData } = useQuery<Record<string, { available: number; syncedAt: string | null }>>({
    queryKey: ["/api/inventory/3pl-stocks"],
    queryFn: async () => {
      const res = await fetch("/api/inventory/3pl-stocks", {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!res.ok) throw new Error("Failed to fetch 3PL stocks");
      return res.json();
    },
    enabled: !!user,
    staleTime: 5 * 60_000,
  });

  const { data: wbStocksData } = useQuery<StocksMap>({
    queryKey: ["/api/inventory/wb-stocks"],
    queryFn: async () => {
      const res = await fetch("/api/inventory/wb-stocks", {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!res.ok) throw new Error("Failed to fetch WB stocks");
      return res.json();
    },
    enabled: !!user,
    staleTime: 5 * 60_000,
  });

  const { data: wbTransitData } = useQuery<Record<string, number>>({
    queryKey: ["/api/inventory/wb-transit"],
    queryFn: async () => {
      const res = await fetch("/api/inventory/wb-transit", {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!res.ok) throw new Error("Failed to fetch WB transit stocks");
      return res.json();
    },
    enabled: !!user,
    staleTime: 5 * 60_000,
  });

  const { data: orderedSummary = {} } = useQuery<Record<string, number>>({
    queryKey: ["/api/inbound/ordered-summary"],
    queryFn: async () => {
      const res = await fetch("/api/inbound/ordered-summary", {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!user,
    staleTime: 5 * 60_000,
  });

  const allFetchedProducts: Product[] = productsData.products || [];
  const availabilityFilteredProducts = availabilityFilters.length > 0
    ? allFetchedProducts.filter(p => availabilityFilters.some(af => {
        if (af === "YM") return (ymStocks?.[p.sku]?.available ?? 0) > 0;
        if (af === "Ozon") return (ozonStocksData?.[p.sku]?.available ?? 0) > 0;
        if (af === "WB") return (wbStocksData?.[p.sku]?.available ?? 0) > 0;
        if (af === "3PL") return (threeplStocksData?.[p.sku]?.available ?? 0) > 0;
        if (af === "RU") return (ymStocks?.[p.sku]?.available ?? 0) > 0 || (ozonStocksData?.[p.sku]?.available ?? 0) > 0 || (wbStocksData?.[p.sku]?.available ?? 0) > 0;
        return false;
      }))
    : allFetchedProducts;
  // Hide products whose stock columns sum to zero across all channels and Ordered
  const stockSum = (sku: string) => {
    const ym = ymStocks?.[sku] as any;
    const oz = ozonStocksData?.[sku] as any;
    const wb = wbStocksData?.[sku] as any;
    const pl = threeplStocksData?.[sku] as any;
    const ymTotal = (ym?.available ?? 0) + (ym?.inTransit ?? 0) + (ym?.freeze ?? 0) + (ym?.quarantine ?? 0) + (ym?.defect ?? 0);
    const ozTotal = (oz?.available ?? 0) + (oz?.inTransit ?? 0) + (oz?.quarantine ?? 0) + (oz?.defect ?? 0);
    const wbTotal = (wb?.available ?? 0) + ((wbTransitData as any)?.[sku] ?? 0) + (wb?.reserve ?? 0) + (wb?.quarantine ?? 0);
    const plTotal = (pl?.available ?? 0) + (pl?.reserve ?? 0) + (pl?.defect ?? 0);
    const ordered = (orderedSummary as any)?.[sku] ?? 0;
    return ymTotal + ozTotal + wbTotal + plTotal + ordered;
  };
  const nonZeroProducts = availabilityFilteredProducts.filter(p => stockSum(p.sku) > 0);
  const totalProducts: number = nonZeroProducts.length;
  const totalPages: number = Math.ceil(totalProducts / ITEMS_PER_PAGE);
  const products: Product[] = nonZeroProducts.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, totalProducts);
  const lastSync = ymStocks ? Object.values(ymStocks)[0]?.syncedAt : null;
  const lastOzonSync = ozonStocksData ? Object.values(ozonStocksData)[0]?.syncedAt : null;
  const lastWBSync = wbStocksData ? Object.values(wbStocksData)[0]?.syncedAt : null;
  const lastThreeplSync = threeplStocksData ? Object.values(threeplStocksData)[0]?.syncedAt : null;


  const handleExport = async () => {
    const params = new URLSearchParams({ page: "1", limit: "100000", search: debouncedSearch, sort: "productName", order: "asc" });
    if (statusFilters.length > 0) params.set("statuses", JSON.stringify(statusFilters));
    if (categoryFilters.length > 0) params.set("cats", JSON.stringify(categoryFilters));
    if (vsFilters.length > 0) params.set("valueStreams", JSON.stringify(vsFilters));
    if (brandFilters.length > 0) params.set("brands", JSON.stringify(brandFilters));
    if (supplierFilters.length > 0) params.set("suppliers", JSON.stringify(supplierFilters));
    const res = await fetch(`/api/products?${params}`, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });
    if (!res.ok) return;
    const data = await res.json();
    const rows = (data.products as Product[]).map(p => {
      const ym = (ymStocks as any)?.[p.sku];
      const oz = (ozonStocksData as any)?.[p.sku];
      const wb = (wbStocksData as any)?.[p.sku];
      const pl = (threeplStocksData as any)?.[p.sku];
      const ordered = (orderedSummary as any)?.[p.sku] ?? 0;
      return {
        SKU: p.sku,
        Product: p.productName ?? "",
        "Value Stream": p.valueStream ?? "",
        Category: p.category ?? "",
        Brand: p.brandName ?? "",
        "YM Available": ym?.available ?? 0,
        "YM In Transit": ym?.inTransit ?? 0,
        "YM Freeze": ym?.freeze ?? 0,
        "YM Quarantine": ym?.quarantine ?? 0,
        "YM Defect": ym?.defect ?? 0,
        "Ozon Available": oz?.available ?? 0,
        "Ozon In Transit": oz?.inTransit ?? 0,
        "Ozon Quarantine": oz?.quarantine ?? 0,
        "Ozon Defect": oz?.defect ?? 0,
        "WB Available": wb?.available ?? 0,
        "WB In Transit": (wbTransitData as any)?.[p.sku] ?? 0,
        "WB Reserve": wb?.reserve ?? 0,
        "WB Quarantine": wb?.quarantine ?? 0,
        "3PL Available": pl?.available ?? 0,
        "3PL Reserve": pl?.reserve ?? 0,
        "3PL Defect": pl?.defect ?? 0,
        Ordered: ordered,
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb2 = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb2, ws, "Inventory");
    XLSX.writeFile(wb2, "inventory.xlsx");
    fetch("/api/activity/log", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${localStorage.getItem("token")}` }, body: JSON.stringify({ actionType: "export", entityType: "inventory", description: `Exported ${rows.length} inventory rows to xlsx`, metadata: { rowCount: rows.length } }) }).catch(() => {});
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setLightboxUrl(null)}
        >
          <img
            src={lightboxUrl}
            alt="Preview"
            className="max-w-[90vw] max-h-[90vh] rounded-xl shadow-2xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
      <Sidebar />
      <div className="md:ml-64">
        <header className="bg-white border-b border-gray-200">
          <div className="pl-14 pr-6 py-4 md:px-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-gray-800">Inventory</h1>
              <p className="text-gray-600 mt-1">Stock levels across all channels</p>
            </div>
            <div className="relative group flex items-center gap-1.5 text-xs text-gray-400 cursor-default select-none">
              <span>Last sync</span>
              <Info className="h-3.5 w-3.5" />
              <div className="absolute right-0 top-full mt-2 hidden group-hover:block z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-52">
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-500">YM</span>
                    <span className="text-gray-800">{lastSync ? new Date(lastSync).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Moscow" }) : "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Ozon</span>
                    <span className="text-gray-800">{lastOzonSync ? new Date(lastOzonSync).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Moscow" }) : "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">WB</span>
                    <span className="text-gray-800">{lastWBSync ? new Date(lastWBSync).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Moscow" }) : "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">3PL</span>
                    <span className="text-gray-800">{lastThreeplSync ? new Date(lastThreeplSync).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Moscow" }) : "—"}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        <div className="p-6">
          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">RU</CardTitle>
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summary?.totalAvailability ?? 0}</div>
                <p className="text-xs text-muted-foreground">
                  {summary?.totalActive
                    ? Math.round((summary.totalAvailability / summary.totalActive) * 100)
                    : 0}% of {summary?.totalActive ?? 0} active products
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Yandex Market</CardTitle>
                <ShoppingCart className="h-4 w-4 text-orange-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summary?.ymAvailability ?? 0}</div>
                <p className="text-xs text-muted-foreground">
                  {summary?.totalAvailability
                    ? Math.round((summary.ymAvailability / summary.totalAvailability) * 100)
                    : 0}% of available products
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Ozon</CardTitle>
                <ShoppingCart className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summary?.ozonAvailability ?? 0}</div>
                <p className="text-xs text-muted-foreground">
                  {summary?.totalAvailability
                    ? Math.round((summary.ozonAvailability / summary.totalAvailability) * 100)
                    : 0}% of available products
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Wildberries</CardTitle>
                <ShoppingCart className="h-4 w-4 text-purple-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summary?.wbAvailability ?? 0}</div>
                <p className="text-xs text-muted-foreground">
                  {summary?.totalAvailability
                    ? Math.round((summary.wbAvailability / summary.totalAvailability) * 100)
                    : 0}% of available products
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search products by name, SKU, brand..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <MultiSelectFilter
              label="Filter by status"
              options={availableStatuses}
              values={statusFilters}
              onChange={setStatusFilters}
              formatLabel={s => s.charAt(0).toUpperCase() + s.slice(1).replace("_", " ")}
            />
            <CategoryFilter
              categoryHierarchy={categoryHierarchy}
              values={categoryFilters}
              onChange={setCategoryFilters}
            />
            <MultiSelectFilter label="Value Stream" options={availableValueStreams} values={vsFilters} onChange={setVsFilters} />
            <MultiSelectFilter label="Brand" options={availableBrands} values={brandFilters} onChange={setBrandFilters} />
            <MultiSelectFilter label="Supplier" options={availableSuppliers} values={supplierFilters} onChange={setSupplierFilters} />
            <MultiSelectFilter label="Availability" options={["RU", "YM", "Ozon", "WB", "3PL"]} values={availabilityFilters} onChange={setAvailabilityFilters} />
          </div>


          <Card className="relative group">
            <div className="absolute top-2 right-2 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
              <Popover open={exportMenuOpen} onOpenChange={setExportMenuOpen}>
                <PopoverTrigger asChild>
                  <button className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-black outline-none" onMouseDown={e => e.preventDefault()}>
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-44 p-1" align="end" onOpenAutoFocus={e => e.preventDefault()} onCloseAutoFocus={e => e.preventDefault()}>
                  <button
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-gray-100"
                    onClick={() => { handleExport(); setExportMenuOpen(false); }}
                  >
                    <Download className="h-4 w-4" />
                    Export XLSX
                  </button>
                </PopoverContent>
              </Popover>
            </div>
            <CardContent className="pt-6">
              {isLoading ? (
                <div className="text-center py-20">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
                  <p className="mt-4 text-sm text-gray-500">Loading products...</p>
                </div>
              ) : totalProducts === 0 ? (
                <div className="text-center py-12">
                  <Package className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900">No products found</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {searchQuery ? "Try adjusting your search." : "No products have been added yet."}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto max-h-[500px] overflow-y-auto border border-gray-200 rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-white sticky top-0 z-10">
                      <tr className="border-b border-gray-200">
                        <th className="text-center py-3 px-2 font-medium text-black uppercase text-xs">Image</th>
                        <th className="text-left py-3 px-2 font-medium text-black uppercase text-xs min-w-[200px]">Product</th>
                        <th className="text-left py-3 px-2 font-medium text-black uppercase text-xs">Category</th>
                        <th className="text-left py-3 px-2 font-medium text-black uppercase text-xs">Brand</th>
                        <th className="text-left py-3 px-2 font-medium text-black uppercase text-xs min-w-[150px]">Yandex Market</th>
                        <th className="text-left py-3 px-2 font-medium text-black uppercase text-xs min-w-[140px]">Ozon</th>
                        <th className="text-left py-3 px-2 font-medium text-black uppercase text-xs min-w-[140px]">Wildberries</th>
                        <th className="text-left py-3 px-2 font-medium text-black uppercase text-xs min-w-[110px]">3PL</th>
                        <th className="text-left py-3 px-2 font-medium text-black uppercase text-xs min-w-[110px]">Ordered</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((product: Product) => (
                        <tr key={product.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-4 px-2">
                            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                              {product.imageUrl ? (
                                <img src={product.imageUrl} alt={product.productName || ""} className="w-12 h-12 rounded-lg object-cover cursor-pointer" onClick={() => setLightboxUrl(product.imageUrl!)} />
                              ) : (
                                <Package className="w-6 h-6 text-blue-500" />
                              )}
                            </div>
                          </td>
                          <td className="py-4 px-2">
                            <div className="font-medium text-gray-900 text-sm">{product.productName || "Untitled Product"}</div>
                            <div className="text-xs text-gray-500">{product.sku}</div>
                          </td>
                          <td className="py-4 px-2">
                            <div className="text-sm text-gray-900">{product.valueStream || "—"}</div>
                            <div className="text-xs text-gray-500">{product.category || "—"}</div>
                          </td>
                          <td className="py-4 px-2 text-gray-600 text-sm">{product.brandName || "—"}</td>
                          <td className="py-4 px-2">
                            <YMStockCell sku={product.sku} stocks={ymStocks} onClick={() => setModalProduct(product)} />
                          </td>
                          <td className="py-4 px-2">
                            <OzonStockCell sku={product.sku} stocks={ozonStocksData} onClick={() => setOzonModalProduct(product)} />
                          </td>
                          <td className="py-4 px-2">
                            <WBStockCell sku={product.sku} stocks={wbStocksData} transitStocks={wbTransitData} onClick={() => setWbModalProduct(product)} />
                          </td>
                          <td className="py-4 px-2">
                            <ThreePLStockCell sku={product.sku} stocks={threeplStocksData} onClick={() => setThreeplModalProduct(product)} />
                          </td>
                          <td className="py-4 px-2">
                            {(() => {
                              const qty = orderedSummary[product.sku] ?? 0;
                              return (
                                <div
                                  className="cursor-pointer hover:bg-gray-100 rounded px-1 py-0.5 -mx-1 transition-colors"
                                  onClick={() => setOrderedModalSku(product.sku)}
                                >
                                  <div className="text-sm font-medium text-gray-900">{qty}</div>
                                  <div className="text-xs text-gray-400 mt-0.5">Ordered: {qty}</div>
                                </div>
                              );
                            })()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {totalProducts > 0 && (
                <div className="flex items-center justify-between mt-6 px-4">
                  <div className="text-sm font-normal text-muted-foreground">
                    Showing {startIndex + 1} to {endIndex} of {totalProducts} products
                  </div>
                  <div className="flex items-center space-x-2">
                    <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} onMouseDown={e => e.preventDefault()}
                      className="h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-black outline-none disabled:opacity-30 disabled:pointer-events-none">
                      <ChevronsLeft className="h-4 w-4" />
                    </button>
                    <button onClick={() => setCurrentPage(currentPage - 1)} disabled={currentPage === 1} onMouseDown={e => e.preventDefault()}
                      className="h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-black outline-none disabled:opacity-30 disabled:pointer-events-none text-sm font-normal">
                      &lt;
                    </button>
                    <div className="flex space-x-1">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        const pageNum = currentPage <= 3 ? i + 1 : currentPage - 2 + i;
                        if (pageNum > totalPages) return null;
                        return (
                          <button key={pageNum} onClick={() => setCurrentPage(pageNum)} onMouseDown={e => e.preventDefault()}
                            className={`h-8 w-8 inline-flex items-center justify-center rounded-md outline-none text-sm font-normal ${pageNum === currentPage ? 'text-black' : 'text-muted-foreground hover:text-black'}`}>
                            {pageNum}
                          </button>
                        );
                      })}
                    </div>
                    <button onClick={() => setCurrentPage(currentPage + 1)} disabled={currentPage === totalPages} onMouseDown={e => e.preventDefault()}
                      className="h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-black outline-none disabled:opacity-30 disabled:pointer-events-none text-sm font-normal">
                      &gt;
                    </button>
                    <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} onMouseDown={e => e.preventDefault()}
                      className="h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-black outline-none disabled:opacity-30 disabled:pointer-events-none">
                      <ChevronsRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <StockDetailModal open={!!modalProduct} onClose={() => setModalProduct(null)} product={modalProduct} />
      <OzonStockDetailModal open={!!ozonModalProduct} onClose={() => setOzonModalProduct(null)} product={ozonModalProduct} />
      <WBStockDetailModal open={!!wbModalProduct} onClose={() => setWbModalProduct(null)} product={wbModalProduct} />
      <ThreePLStockDetailModal open={!!threeplModalProduct} onClose={() => setThreeplModalProduct(null)} product={threeplModalProduct} />
      {orderedModalSku && <InboundOrdersModal sku={orderedModalSku} onClose={() => setOrderedModalSku(null)} />}
    </div>
  );
}

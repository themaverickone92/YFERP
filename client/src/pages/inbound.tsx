import { useRef, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import Sidebar from "@/components/dashboard/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
import { CategoryFilter } from "@/components/ui/category-filter";
import { Upload, Download, Search, X, ChevronDown, Package, ShoppingCart, TrendingUp, Truck, MoreHorizontal, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { PoDetailDialog } from "@/components/inbound/po-detail-dialog";

const token = () => localStorage.getItem("token");
const ITEMS_PER_PAGE = 100;

const COLUMNS: { key: string; label: string; width?: number }[] = [
  { key: "poNumber",             label: "PO_number",             width: 130 },
  { key: "valueStream",          label: "value_stream",          width: 120 },
  { key: "category",             label: "category",              width: 110 },
  { key: "supplierId",           label: "supplier_id",           width: 100 },
  { key: "supplierName",         label: "supplier_name",         width: 140 },
  { key: "etaPlan",              label: "ETA_plan",              width: 100 },
  { key: "readinessDateActual",  label: "Readiness_date_actual", width: 155 },
  { key: "etdPlan",              label: "ETD_plan",              width: 100 },
  { key: "etaActual",            label: "ETA_actual",            width: 105 },
  { key: "productionStatus",     label: "Production_status",     width: 135 },
  { key: "logisticStatus",       label: "Logistic_status",       width: 120 },
  { key: "replenTicket",         label: "Replen_ticket",         width: 115 },
  { key: "akTicket",             label: "AK_ticket",             width: 100 },
  { key: "plTicket",             label: "PL_ticket",             width: 100 },
  { key: "glTicket",             label: "GL_ticket",             width: 100 },
];

// xlsx header (lowercase) → camelCase DB field
const HEADER_MAP: Record<string, string> = {
  value_stream:             "valueStream",
  category:                 "category",
  ssku:                     "ssku",
  model_id:                 "modelId",
  ssku_name:                "sskuName",
  supplier_id:              "supplierId",
  supplier_name:            "supplierName",
  supplier:                 "supplierName",
  name:                     "sskuName",
  pi_number:                "piNumber",
  pi_date:                  "piDate",
  po_number:                "poNumber",
  po_date:                  "poDate",
  ci_number:                "ciNumber",
  "po_(axapta)":            "poAxapta",
  "po_(axapta)_date":       "poAxaptaDate",
  po_axapta:                "poAxapta",
  po_axapta_date:           "poAxaptaDate",
  quantity_plan:            "quantityPlan",
  quantity_fact:            "quantityFact",
  quantity_fact_yt:         "quantityFactYt",
  quantity_fact_check:      "quantityFactCheck",
  actual_contract_price:    "actualContractPrice",
  purchase_price:           "purchasePrice",
  currency:                 "currency",
  "currency_(calc)":        "currencyCalc",
  currency_calc:            "currencyCalc",
  purchase_price_check:     "purchasePriceCheck",
  shipment_terms:           "shipmentTerms",
  amount_sum:               "amountSum",
  eta_plan:                 "etaPlan",
  readiness_date_actual:    "readinessDateActual",
  rda_update:               "rdaUpdate",
  etd_plan:                 "etdPlan",
  eta_actual:               "etaActual",
  production_status:        "productionStatus",
  logistic_status:          "logisticStatus",
  "non-delivery":           "nonDelivery",
  non_delivery:             "nonDelivery",
  ak_ticket:                "akTicket",
  ac_pass_date:             "acPassDate",
  pl_ticket:                "plTicket",
  gl_ticket:                "glTicket",
  replen_ticket:            "replenTicket",
  creation_date:            "creationDate",
  replenishment_manager:    "replenishmentManager",
  replenisment_manager:     "replenishmentManager",
};

const DATE_FIELDS = new Set([
  "piDate", "poDate", "poAxaptaDate", "etaPlan", "readinessDateActual",
  "rdaUpdate", "etdPlan", "etaActual", "acPassDate", "creationDate",
]);

const INTEGER_FIELDS = new Set([
  "quantityPlan", "quantityFact", "quantityFactYt", "quantityFactCheck",
]);

const DECIMAL_FIELDS = new Set([
  "actualContractPrice", "purchasePrice", "purchasePriceCheck", "amountSum",
]);

function excelDateToString(val: any): string | null {
  if (val == null || val === "") return null;
  if (typeof val === "number") {
    const date = XLSX.SSF.parse_date_code(val);
    if (!date) return String(val);
    return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
  }
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed) return null;
    // DD.MM.YYYY (or DD/MM/YYYY) → YYYY-MM-DD
    const m = trimmed.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})$/);
    if (m) {
      const [, d, mo, y] = m;
      return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
    // already ISO
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
    return trimmed;
  }
  return String(val);
}

type PoSummaryRow = Record<string, any> & { poNumber: string };

function DateRangeFilter({ from, to, onChange }: {
  from: string; to: string; onChange: (from: string, to: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = !!(from || to);
  const label = active ? `ETA: ${from || "…"} – ${to || "…"}` : "ETA Actual";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-[200px] justify-between text-muted-foreground hover:text-black hover:bg-white hover:border-gray-300 text-sm font-normal">
          <span className="truncate">{label}</span>
          {active
            ? <X className="h-4 w-4 opacity-50 shrink-0" onClick={(e) => { e.stopPropagation(); onChange("", ""); }} />
            : <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-3" align="start">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-500 font-medium">От</span>
            <input type="date" className="text-sm border border-gray-300 rounded px-2 py-1 outline-none focus:border-blue-400" value={from} onChange={(e) => onChange(e.target.value, to)} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-500 font-medium">До</span>
            <input type="date" className="text-sm border border-gray-300 rounded px-2 py-1 outline-none focus:border-blue-400" value={to} onChange={(e) => onChange(from, e.target.value)} />
          </div>
          {active && (
            <Button variant="ghost" size="sm" onClick={() => { onChange("", ""); }} className="h-6 px-2 text-xs self-start">Clear</Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function Inbound() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const canEdit = user?.role !== "user";

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [filterValueStream, setFilterValueStream] = useState<string[]>([]);
  const [filterCategory, setFilterCategory] = useState<string[]>([]);
  const [filterProductionStatus, setFilterProductionStatus] = useState<string[]>([]);
  const [filterLogisticStatus, setFilterLogisticStatus] = useState<string[]>([]);
  const [filterEtaFrom, setFilterEtaFrom] = useState("");
  const [filterEtaTo, setFilterEtaTo] = useState("");
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [selectedPo, setSelectedPo] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, filterValueStream, filterCategory, filterProductionStatus, filterLogisticStatus, filterEtaFrom, filterEtaTo]);

  const { data: meta = { valueStreams: [], categories: [], productionStatuses: [], logisticStatuses: [] } } = useQuery({
    queryKey: ["/api/inbound/meta"],
    queryFn: async () => {
      const res = await fetch("/api/inbound/meta", { headers: { Authorization: `Bearer ${token()}` } });
      if (!res.ok) throw new Error("Failed to fetch meta");
      return res.json();
    },
  });

  const buildFilterParams = () => {
    const params = new URLSearchParams({ search: debouncedSearch });
    if (filterValueStream.length) params.set("valueStreams", filterValueStream.join(","));
    if (filterCategory.length) params.set("categories", filterCategory.join(","));
    if (filterProductionStatus.length) params.set("productionStatuses", filterProductionStatus.join(","));
    if (filterLogisticStatus.length) params.set("logisticStatuses", filterLogisticStatus.join(","));
    if (filterEtaFrom) params.set("etaActualFrom", filterEtaFrom);
    if (filterEtaTo) params.set("etaActualTo", filterEtaTo);
    return params;
  };

  const { data: stats = { orders: 0, delivered: 0, onTheWay: 0, inProduction: 0 } } = useQuery<{ orders: number; delivered: number; onTheWay: number; inProduction: number }>({
    queryKey: ["/api/inbound/stats", debouncedSearch, filterValueStream, filterCategory, filterProductionStatus, filterLogisticStatus, filterEtaFrom, filterEtaTo],
    queryFn: async () => {
      const res = await fetch(`/api/inbound/stats?${buildFilterParams()}`, { headers: { Authorization: `Bearer ${token()}` } });
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
  });

  const buildParams = (overrides: Record<string, string> = {}) => {
    const params = new URLSearchParams({ page: String(currentPage), limit: String(ITEMS_PER_PAGE), search: debouncedSearch });
    if (filterValueStream.length) params.set("valueStreams", filterValueStream.join(","));
    if (filterCategory.length) params.set("categories", filterCategory.join(","));
    if (filterProductionStatus.length) params.set("productionStatuses", filterProductionStatus.join(","));
    if (filterLogisticStatus.length) params.set("logisticStatuses", filterLogisticStatus.join(","));
    if (filterEtaFrom) params.set("etaActualFrom", filterEtaFrom);
    if (filterEtaTo) params.set("etaActualTo", filterEtaTo);
    Object.entries(overrides).forEach(([k, v]) => params.set(k, v));
    return params;
  };

  const { data: result = { rows: [], total: 0, totalPages: 0 }, isLoading } = useQuery<{ rows: PoSummaryRow[]; total: number; totalPages: number }>({
    queryKey: ["/api/inbound/po-summary", currentPage, debouncedSearch, filterValueStream, filterCategory, filterProductionStatus, filterLogisticStatus, filterEtaFrom, filterEtaTo],
    queryFn: async () => {
      const res = await fetch(`/api/inbound/po-summary?${buildParams()}`, { headers: { Authorization: `Bearer ${token()}` } });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { rows, total, totalPages } = result;

  const importMutation = useMutation({
    mutationFn: async (importRows: Record<string, any>[]) => {
      const t0 = Date.now();
      console.log(`[inbound import] stringify start, rows=${importRows.length}`);
      const body = JSON.stringify({ rows: importRows });
      console.log(`[inbound import] stringified ${(body.length / 1024 / 1024).toFixed(2)}MB in ${Date.now() - t0}ms, sending...`);
      const t1 = Date.now();
      const res = await fetch("/api/inbound/import", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body,
      });
      console.log(`[inbound import] response status=${res.status} in ${Date.now() - t1}ms`);
      if (!res.ok) throw new Error("Import failed: " + (await res.text()));
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/inbound/po-summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inbound/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inbound/meta"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inbound/po"] });
      const msg = `Импортировано: ${data.imported} (создано ${data.created}, обновлено ${data.updated}, удалено ${data.deleted})`;
      toast({ title: "Импорт завершён", description: msg });
    },
    onError: () => toast({ title: "Ошибка импорта", variant: "destructive" }),
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    console.log("[inbound import] file selected:", file?.name, file?.size);
    if (!file) return;
    e.target.value = "";

    let raw: any[][];
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array", cellDates: false });
      const sheetName = wb.SheetNames[0];
      console.log("[inbound import] sheets:", wb.SheetNames, "using:", sheetName);
      const sheet = wb.Sheets[sheetName];
      raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      console.log("[inbound import] raw rows:", raw.length);
    } catch (err) {
      console.error("[inbound import] parse error:", err);
      toast({ title: "Ошибка чтения файла", description: String(err), variant: "destructive" });
      return;
    }

    if (raw.length < 2) {
      toast({ title: "Файл пустой или нет строк данных", variant: "destructive" });
      return;
    }

    const normalizeHeader = (h: any) => String(h ?? "").trim().toLowerCase().replace(/\s+/g, "_");
    let headerIdx = -1;
    for (let i = 0; i < Math.min(8, raw.length); i++) {
      const row = (raw[i] ?? []).map(normalizeHeader);
      if (row.includes("po_number") || row.includes("ssku")) { headerIdx = i; break; }
    }
    if (headerIdx === -1) headerIdx = 0;
    console.log("[inbound import] headerIdx:", headerIdx, "headers:", (raw[headerIdx] ?? []).map(normalizeHeader));

    const headers: string[] = raw[headerIdx].map(normalizeHeader);
    const importRows = raw.slice(headerIdx + 1)
      .filter((r: any[]) => r.some((v: any) => v !== "" && v != null))
      .map((r: any[]) => {
        const obj: Record<string, any> = {};
        headers.forEach((h, i) => {
          const field = HEADER_MAP[h];
          if (!field) return;
          const rawVal = r[i];
          if (DATE_FIELDS.has(field)) {
            obj[field] = excelDateToString(rawVal);
          } else if (rawVal === "" || rawVal == null || rawVal === false) {
            obj[field] = null;
          } else if (INTEGER_FIELDS.has(field)) {
            const n = parseInt(String(rawVal), 10);
            obj[field] = isNaN(n) ? null : n;
          } else if (DECIMAL_FIELDS.has(field)) {
            const n = parseFloat(String(rawVal).replace(",", "."));
            obj[field] = isNaN(n) ? null : n;
          } else {
            obj[field] = String(rawVal).trim();
          }
        });
        return obj;
      })
      .filter(r => Object.values(r).some(v => v != null && v !== ""));

    console.log("[inbound import] parsed rows:", importRows.length, "sample:", importRows[0]);
    if (importRows.length === 0) {
      toast({ title: "Нет данных для импорта", description: `headers: ${headers.join(", ").slice(0, 200)}`, variant: "destructive" });
      return;
    }

    importMutation.mutate(importRows);
  };

  const handleExport = async () => {
    const params = new URLSearchParams({ page: "1", limit: "100000" });
    if (searchQuery) params.set("search", searchQuery);
    if (filterValueStream.length) params.set("valueStreams", filterValueStream.join(","));
    if (filterCategory.length) params.set("categories", filterCategory.join(","));
    if (filterProductionStatus.length) params.set("productionStatuses", filterProductionStatus.join(","));
    if (filterLogisticStatus.length) params.set("logisticStatuses", filterLogisticStatus.join(","));
    if (filterEtaFrom) params.set("etaActualFrom", filterEtaFrom);
    if (filterEtaTo) params.set("etaActualTo", filterEtaTo);
    const res = await fetch(`/api/inbound/po-summary?${params}`, { headers: { Authorization: `Bearer ${token()}` } });
    if (!res.ok) return;
    const data = await res.json();
    const exportRows = data.rows.map((row: PoSummaryRow) =>
      Object.fromEntries(COLUMNS.map(col => [col.label, row[col.key] ?? ""]))
    );
    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inbound");
    XLSX.writeFile(wb, "inbound.xlsx");
    fetch("/api/activity/log", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token()}` }, body: JSON.stringify({ actionType: "export", entityType: "inbound", description: `Exported ${exportRows.length} inbound PO rows to xlsx`, metadata: { rowCount: exportRows.length } }) }).catch(() => {});
  };

  const hasFilters = !!(debouncedSearch || filterValueStream.length || filterCategory.length || filterProductionStatus.length || filterLogisticStatus.length || filterEtaFrom || filterEtaTo);

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <div className="md:ml-64">
        <header className="bg-white border-b border-gray-200">
          <div className="pl-14 pr-6 py-4 md:px-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-gray-800">Inbound</h1>
              <p className="text-gray-600 mt-1">Incoming shipments</p>
            </div>
            {canEdit && (
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} />
            )}
          </div>
        </header>

        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Orders</CardTitle>
                <Package className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.orders.toLocaleString("ru-RU")}</div>
                <p className="text-xs text-muted-foreground">unique POs</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Delivered</CardTitle>
                <ShoppingCart className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.delivered.toLocaleString("ru-RU")}</div>
                <p className="text-xs text-muted-foreground">
                  {stats.orders > 0 ? `${Math.round((stats.delivered / stats.orders) * 100)}% of orders` : "logistic status: Доставлен"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">On the way</CardTitle>
                <Truck className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.onTheWay.toLocaleString("ru-RU")}</div>
                <p className="text-xs text-muted-foreground">production finished, not delivered</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">In production</CardTitle>
                <TrendingUp className="h-4 w-4 text-orange-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.inProduction.toLocaleString("ru-RU")}</div>
                <p className="text-xs text-muted-foreground">not finished or delivered</p>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col space-y-4 md:flex-row md:space-y-0 md:space-x-3 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="PO, SSKU, Name, Supplier..."
                className="pl-10"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <MultiSelectFilter label="Value Stream" options={(meta as any).valueStreams} values={filterValueStream} onChange={setFilterValueStream} />
            <CategoryFilter categoryHierarchy={(meta as any).categoryHierarchy ?? {}} values={filterCategory} onChange={setFilterCategory} flat />
            <MultiSelectFilter label="Production"   options={(meta as any).productionStatuses} values={filterProductionStatus} onChange={setFilterProductionStatus} />
            <MultiSelectFilter label="Logistic"     options={(meta as any).logisticStatuses}   values={filterLogisticStatus}   onChange={setFilterLogisticStatus} />
            <DateRangeFilter from={filterEtaFrom} to={filterEtaTo} onChange={(f, t) => { setFilterEtaFrom(f); setFilterEtaTo(t); }} />
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
                  {canEdit && (
                    <button
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-gray-100"
                      onClick={() => { fileInputRef.current?.click(); setExportMenuOpen(false); }}
                      disabled={importMutation.isPending}
                    >
                      <Upload className="h-4 w-4" />
                      {importMutation.isPending ? "Импорт..." : "Import XLSX"}
                    </button>
                  )}
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
                  <p className="mt-4 text-sm text-gray-500">Loading inbound orders...</p>
                </div>
              ) : total === 0 ? (
                <div className="text-center py-12">
                  <Package className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900">
                    {hasFilters ? "Нет строк по выбранным фильтрам" : "Нет данных"}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {hasFilters ? "Попробуйте изменить фильтры." : "Загрузите XLSX-файл для импорта."}
                  </p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto overflow-y-auto max-h-[600px] border border-gray-200 rounded-lg">
                    <table className="w-full text-sm" style={{ minWidth: "max-content" }}>
                      <thead className="bg-white sticky top-0 z-10">
                        <tr className="border-b border-gray-200">
                          {COLUMNS.map((col) => (
                            <th
                              key={col.key}
                              className="text-left py-3 px-2 font-medium text-black uppercase text-xs whitespace-nowrap border-r border-gray-100 last:border-r-0"
                              style={{ minWidth: col.width }}
                            >
                              {col.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row: PoSummaryRow) => (
                          <tr
                            key={row.poNumber}
                            className="border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors"
                            onClick={() => setSelectedPo(row.poNumber)}
                          >
                            {COLUMNS.map((col) => {
                              const v = row[col.key];
                              const display = v != null && v !== "" ? String(v) : "";
                              return (
                                <td
                                  key={col.key}
                                  className="border-r border-gray-100 last:border-r-0 px-2 py-2 text-xs text-gray-800"
                                  style={{ minWidth: col.width }}
                                  title={display}
                                >
                                  <div className="truncate" style={{ maxWidth: col.width }}>
                                    {display || <span className="text-gray-300">—</span>}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {total > 0 && (
                    <div className="flex items-center justify-between mt-6 px-4">
                      <div className="text-sm font-normal text-muted-foreground">
                        Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, total)} of {total} POs
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
                            const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
                            const pageNum = start + i;
                            return (
                              <button key={pageNum} onClick={() => setCurrentPage(pageNum)} onMouseDown={e => e.preventDefault()}
                                className={`h-8 w-8 inline-flex items-center justify-center rounded-md outline-none text-sm font-normal ${pageNum === currentPage ? "text-black" : "text-muted-foreground hover:text-black"}`}>
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
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <PoDetailDialog
          poNumber={selectedPo}
          open={!!selectedPo}
          onOpenChange={(v) => { if (!v) setSelectedPo(null); }}
        />
      </div>
    </div>
  );
}

import { useRef, useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import Sidebar from "@/components/dashboard/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
import { CategoryFilter } from "@/components/ui/category-filter";
import { Upload, Download, Search, X, ChevronDown, BarChart3, TrendingUp, ShoppingCart, Package, MoreHorizontal, ChevronsLeft, ChevronsRight, FileUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";

const token = () => localStorage.getItem("token");
const ITEMS_PER_PAGE = 100;
const MONTH_FIELDS = new Set(['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']);

const COLUMNS: { key: string; label: string; width?: number }[] = [
  { key: "ssku",         label: "SSKU",         width: 140 },
  { key: "ssku_name",    label: "SSKU Name",     width: 160 },
  { key: "value_stream", label: "Value Stream",  width: 120 },
  { key: "category",     label: "Category",      width: 110 },
  { key: "channel",      label: "Channel",       width: 90  },
  { key: "jan",          label: "Jan",           width: 70  },
  { key: "feb",          label: "Feb",           width: 70  },
  { key: "mar",          label: "Mar",           width: 70  },
  { key: "apr",          label: "Apr",           width: 70  },
  { key: "may",          label: "May",           width: 70  },
  { key: "jun",          label: "Jun",           width: 70  },
  { key: "jul",          label: "Jul",           width: 70  },
  { key: "aug",          label: "Aug",           width: 70  },
  { key: "sep",          label: "Sep",           width: 70  },
  { key: "oct",          label: "Oct",           width: 70  },
  { key: "nov",          label: "Nov",           width: 70  },
  { key: "dec",          label: "Dec",           width: 70  },
];

const HEADER_MAP: Record<string, string> = {
  ssku: "ssku",
  ssku_name: "sskuName",
  value_stream: "valueStream",
  category: "category",
  channel: "channel",
  year: "year",
  jan: "jan", feb: "feb", mar: "mar", apr: "apr",
  may: "may", jun: "jun", jul: "jul", aug: "aug",
  sep: "sep", oct: "oct", nov: "nov", dec: "dec",
};

const INTEGER_FIELDS = new Set(["year", ...MONTH_FIELDS]);

type PlanRow = Record<string, any>;

function EditableCell({ row, col, onSave, readOnly, displayValue }: {
  row: PlanRow;
  col: typeof COLUMNS[number];
  onSave: (field: string, value: string) => void;
  readOnly?: boolean;
  displayValue?: string;
}) {
  const [editing, setEditing] = useState(false);
  const val = row[col.key];
  const display = displayValue ?? (val != null && val !== "" ? String(val) : "");

  if (!readOnly && editing) {
    return (
      <input
        className="w-full h-full px-2 py-1 text-xs border border-blue-400 outline-none bg-blue-50 min-w-0"
        defaultValue={display}
        autoFocus
        onBlur={(e) => { onSave(col.key, e.target.value); setEditing(false); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setEditing(false);
        }}
      />
    );
  }
  return (
    <div
      className={`px-2 py-1 text-xs text-gray-800 truncate h-full ${readOnly ? "" : "cursor-text hover:bg-blue-50 transition-colors"}`}
      style={{ minWidth: col.width }}
      onClick={() => { if (!readOnly) setEditing(true); }}
      title={display}
    >
      {display || <span className="text-gray-300">—</span>}
    </div>
  );
}


const CHANNEL_LABELS: Record<string, string> = {
  ym: "Yandex Market",
  ozon: "Ozon",
  wb: "Wildberries",
  other: "Other",
};

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1, CURRENT_YEAR + 2];

export default function SalesPlanning() {
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
  const [filterChannel, setFilterChannel] = useState<string[]>([]);
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  type UndoAction = {
    type: "edit";
    ssku: string;
    channel: string;
    year: number;
    field: string;
    prevValue: number | null;
    currValue: number | null;
  };
  const [lastAction, setLastAction] = useState<UndoAction | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, filterValueStream, filterCategory, filterChannel, selectedYear]);

  const { data: meta = { valueStreams: [], categories: [], channels: [], years: [] } } = useQuery({
    queryKey: ["/api/sales-plans/meta"],
    queryFn: async () => {
      const res = await fetch("/api/sales-plans/meta", { headers: { Authorization: `Bearer ${token()}` } });
      if (!res.ok) throw new Error("Failed to fetch meta");
      return res.json();
    },
  });

  const { data: stats = { totalRows: 0, totalUnits: 0, ymTotal: 0, ozonTotal: 0, wbTotal: 0, otherTotal: 0 } } = useQuery<{
    totalRows: number; totalUnits: number; ymTotal: number; ozonTotal: number; wbTotal: number; otherTotal: number;
  }>({
    queryKey: ["/api/sales-plans/stats", debouncedSearch, filterValueStream, filterCategory, filterChannel, selectedYear],
    queryFn: async () => {
      const params = new URLSearchParams({ search: debouncedSearch, year: String(selectedYear) });
      if (filterValueStream.length) params.set("valueStreams", filterValueStream.join(","));
      if (filterCategory.length) params.set("categories", filterCategory.join(","));
      if (filterChannel.length) params.set("channels", filterChannel.join(","));
      const res = await fetch(`/api/sales-plans/stats?${params}`, { headers: { Authorization: `Bearer ${token()}` } });
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
  });

  const { data: result = { rows: [], total: 0, totalPages: 0 }, isLoading } = useQuery<{ rows: PlanRow[]; total: number; totalPages: number }>({
    queryKey: ["/api/sales-plans", currentPage, debouncedSearch, filterValueStream, filterCategory, filterChannel, selectedYear],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(currentPage), limit: String(ITEMS_PER_PAGE), search: debouncedSearch, year: String(selectedYear) });
      if (filterValueStream.length) params.set("valueStreams", filterValueStream.join(","));
      if (filterCategory.length) params.set("categories", filterCategory.join(","));
      if (filterChannel.length) params.set("channels", filterChannel.join(","));
      const res = await fetch(`/api/sales-plans?${params}`, { headers: { Authorization: `Bearer ${token()}` } });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { rows, total, totalPages } = result;

  const upsertMutation = useMutation({
    mutationFn: async ({ ssku, channel, year, field, value, prevValue }: {
      ssku: string; channel: string; year: number; field: string; value: number | null; prevValue: number | null;
    }) => {
      const res = await fetch("/api/sales-plans/upsert-field", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ ssku, channel, year, field, value, _before: { [field]: prevValue } }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onMutate: async ({ ssku, channel, field, value }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/sales-plans"] });
      const snapshot = queryClient.getQueriesData({ queryKey: ["/api/sales-plans"] });
      queryClient.setQueriesData({ queryKey: ["/api/sales-plans"] }, (old: any) =>
        old ? { ...old, rows: old.rows.map((r: any) =>
          r.ssku === ssku && r.channel === channel ? { ...r, [field]: value } : r
        )} : old
      );
      return { snapshot };
    },
    onSuccess: (data, { ssku, channel }) => {
      queryClient.setQueriesData({ queryKey: ["/api/sales-plans"] }, (old: any) =>
        old ? { ...old, rows: old.rows.map((r: any) =>
          r.ssku === ssku && r.channel === channel ? { ...r, id: data.id } : r
        )} : old
      );
    },
    onError: (_err: unknown, _vars: unknown, context: any) => {
      context?.snapshot.forEach(([key, data]: [any, any]) => queryClient.setQueryData(key, data));
      toast({ title: "Ошибка", description: "Не удалось сохранить", variant: "destructive" });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["/api/sales-plans"] }),
  });

  const importMutation = useMutation({
    mutationFn: async (importRows: Record<string, any>[]) => {
      const res = await fetch("/api/sales-plans/import", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ rows: importRows }),
      });
      if (!res.ok) throw new Error("Import failed");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales-plans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sales-plans/meta"] });
      toast({ title: "Импорт завершён", description: `Загружено строк: ${data.imported}` });
    },
    onError: () => toast({ title: "Ошибка импорта", variant: "destructive" }),
  });

  const undo = useCallback(async () => {
    if (!lastAction) return;
    try {
      const res = await fetch("/api/sales-plans/upsert-field", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({
          ssku: lastAction.ssku,
          channel: lastAction.channel,
          year: lastAction.year,
          field: lastAction.field,
          value: lastAction.prevValue,
          _before: { [lastAction.field]: lastAction.currValue },
        }),
      });
      if (!res.ok) throw new Error("Undo failed");
      queryClient.invalidateQueries({ queryKey: ["/api/sales-plans"] });
      setLastAction(null);
      toast({ title: "Отменено" });
    } catch {
      toast({ title: "Ошибка", description: "Не удалось отменить", variant: "destructive" });
    }
  }, [lastAction, queryClient, toast]);

  useEffect(() => {
    if (!canEdit) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        undo();
        e.preventDefault();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [undo, canEdit]);

  const processFile = async (file: File) => {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "array", cellDates: false });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const raw: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    if (raw.length < 2) { toast({ title: "Файл пустой или нет строк данных", variant: "destructive" }); return; }
    const headers: string[] = raw[0].map((h: any) => String(h).trim().toLowerCase());
    const importRows = raw.slice(1)
      .filter((r: any[]) => r.some((v: any) => v !== "" && v != null))
      .map((r: any[]) => {
        const obj: Record<string, any> = {};
        headers.forEach((h, i) => {
          const field = HEADER_MAP[h];
          if (!field) return;
          const rawVal = r[i];
          if (rawVal === "" || rawVal == null) { obj[field] = null; }
          else if (INTEGER_FIELDS.has(field)) { const n = parseInt(String(rawVal), 10); obj[field] = isNaN(n) ? null : n; }
          else { obj[field] = String(rawVal).trim(); }
        });
        return obj;
      })
      .filter(r => Object.values(r).some(v => v != null && v !== ""));
    if (importRows.length === 0) { toast({ title: "Нет данных для импорта", variant: "destructive" }); return; }
    importMutation.mutate(importRows);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    processFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (!canEdit) return;
    const file = Array.from(e.dataTransfer.files).find(f => f.name.endsWith(".xlsx") || f.name.endsWith(".xls"));
    if (!file) { toast({ title: "Ожидается файл .xlsx или .xls", variant: "destructive" }); return; }
    processFile(file);
  };

  const handleExport = async () => {
    const params = new URLSearchParams({ page: "1", limit: "100000", search: searchQuery, year: String(selectedYear) });
    if (filterValueStream.length) params.set("valueStreams", filterValueStream.join(","));
    if (filterCategory.length) params.set("categories", filterCategory.join(","));
    if (filterChannel.length) params.set("channels", filterChannel.join(","));
    const res = await fetch(`/api/sales-plans?${params}`, { headers: { Authorization: `Bearer ${token()}` } });
    if (!res.ok) return;
    const data = await res.json();
    const exportRows = data.rows.map((row: PlanRow) =>
      Object.fromEntries(COLUMNS.map(col => [col.label, row[col.key] ?? ""]))
    );
    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wbOut = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wbOut, ws, "Sales Planning");
    XLSX.writeFile(wbOut, `sales-planning-${selectedYear}.xlsx`);
    fetch("/api/activity/log", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ actionType: "export", entityType: "sales_plan", description: `Exported ${exportRows.length} sales plan rows to xlsx`, metadata: { rowCount: exportRows.length } }),
    }).catch(() => {});
  };

  const hasFilters = !!(debouncedSearch || filterValueStream.length || filterCategory.length || filterChannel.length);

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <div className="md:ml-64">
        <header className="bg-white border-b border-gray-200">
          <div className="pl-14 pr-6 py-4 md:px-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-gray-800">Sales Planning</h1>
              <p className="text-gray-600 mt-1">Plan sales by SSKU, channel and month</p>
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
                <CardTitle className="text-sm font-medium">Total Rows</CardTitle>
                <Package className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalRows.toLocaleString("ru-RU")}</div>
                <p className="text-xs text-muted-foreground">plan entries</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Units</CardTitle>
                <BarChart3 className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalUnits.toLocaleString("ru-RU")}</div>
                <p className="text-xs text-muted-foreground">planned across all channels</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">YM Total</CardTitle>
                <TrendingUp className="h-4 w-4 text-orange-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.ymTotal.toLocaleString("ru-RU")}</div>
                <p className="text-xs text-muted-foreground">Yandex Market planned</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Ozon + WB</CardTitle>
                <ShoppingCart className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{(stats.ozonTotal + stats.wbTotal).toLocaleString("ru-RU")}</div>
                <p className="text-xs text-muted-foreground">Ozon {stats.ozonTotal.toLocaleString("ru-RU")} + WB {stats.wbTotal.toLocaleString("ru-RU")}</p>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col space-y-4 md:flex-row md:space-y-0 md:space-x-3 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="SSKU, Name..."
                className="pl-10"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <MultiSelectFilter label="Value Stream" options={(meta as any).valueStreams ?? []} values={filterValueStream} onChange={setFilterValueStream} />
            <CategoryFilter categoryHierarchy={(meta as any).categoryHierarchy ?? {}} values={filterCategory} onChange={setFilterCategory} flat />
            <MultiSelectFilter label="Channel"      options={['ym', 'ozon', 'wb', 'other']}    values={filterChannel}      onChange={setFilterChannel} width="w-[160px]" />
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(Number(e.target.value))}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm text-muted-foreground focus:outline-none"
            >
              {YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>


          <Card
            className="relative group"
            onDragOver={e => { e.preventDefault(); if (canEdit) setIsDragOver(true); }}
            onDragEnter={e => { e.preventDefault(); if (canEdit) setIsDragOver(true); }}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false); }}
            onDrop={handleDrop}
          >
            {isDragOver && (
              <div className="absolute inset-0 z-30 rounded-lg border-2 border-dashed border-blue-400 bg-blue-50/80 flex flex-col items-center justify-center pointer-events-none">
                <FileUp className="h-10 w-10 text-blue-400 mb-2" />
                <p className="text-sm font-medium text-blue-600">Отпустите файл для импорта</p>
              </div>
            )}
            <div className="absolute top-2 right-2 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
              <Popover open={exportMenuOpen} onOpenChange={setExportMenuOpen}>
                <PopoverTrigger asChild>
                  <button className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-black outline-none" onMouseDown={e => e.preventDefault()}>
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-44 p-1" align="end" onCloseAutoFocus={e => e.preventDefault()}>
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
                  <p className="mt-4 text-sm text-gray-500">Loading sales plans...</p>
                </div>
              ) : total === 0 ? (
                <div className="text-center py-12">
                  <Package className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900">
                    {hasFilters ? "Нет строк по выбранным фильтрам" : "Нет данных"}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {hasFilters ? "Попробуйте изменить фильтры." : "Добавьте продукты в каталог для отображения плана продаж."}
                  </p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto overflow-y-auto max-h-[500px] border border-gray-200 rounded-lg">
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
                        {rows.map((row: PlanRow) => (
                          <tr key={`${row.ssku}-${row.channel}`} className="border-b border-gray-100 hover:bg-gray-50">
                            {COLUMNS.map((col) => (
                              <td
                                key={col.key}
                                className="border-r border-gray-100 last:border-r-0 p-0"
                                style={{ minWidth: col.width }}
                              >
                                <EditableCell
                                  row={row}
                                  col={col}
                                  onSave={(field, value) => {
                                    const intVal = value === "" ? null : parseInt(value, 10);
                                    const prevValue = row[field] ?? null;
                                    if (intVal === prevValue) return;
                                    setLastAction({
                                      type: "edit",
                                      ssku: row.ssku,
                                      channel: row.channel,
                                      year: row.year ?? selectedYear,
                                      field,
                                      prevValue,
                                      currValue: intVal,
                                    });
                                    upsertMutation.mutate({
                                      ssku: row.ssku,
                                      channel: row.channel,
                                      year: row.year ?? selectedYear,
                                      field,
                                      value: intVal,
                                      prevValue,
                                    });
                                  }}
                                  readOnly={!canEdit || !MONTH_FIELDS.has(col.key)}
                                  displayValue={col.key === "channel" ? (CHANNEL_LABELS[row.channel] ?? row.channel) : undefined}
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {total > 0 && (
                    <div className="flex items-center justify-between mt-6 px-4">
                      <div className="text-sm font-normal text-muted-foreground">
                        Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, total)} of {total} rows
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
      </div>
    </div>
  );
}

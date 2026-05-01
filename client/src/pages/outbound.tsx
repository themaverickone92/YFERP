import { useRef, useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import Sidebar from "@/components/dashboard/sidebar";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
import { Button } from "@/components/ui/button";
import { Upload, Download, Trash2, Copy, Search, Truck, Package, CheckCircle2, Clock, MoreHorizontal, ChevronsLeft, ChevronsRight, FileUp, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";

const token = () => localStorage.getItem("token");
const ITEMS_PER_PAGE = 100;

const COLUMNS: { key: string; label: string; width?: number }[] = [
  { key: "status",                    label: "Статус",                                                width: 110 },
  { key: "orderNumber",               label: "Номер Заказа",                                          width: 150 },
  { key: "axaptaIntegrationNumber",   label: "Номер по Интеграции из Аксапты",                        width: 200 },
  { key: "marketplace",               label: "МП",                                                    width: 80  },
  { key: "warehouseFrom",             label: "Склад Откуда",                                          width: 130 },
  { key: "warehouseTo",               label: "Склад Куда",                                            width: 130 },
  { key: "orderDataTransferAt",       label: "Дата и время передачи данных по заказу",                 width: 200 },
  { key: "initialSlotAt",             label: "Первоначальные время и дата слота",                      width: 200 },
  { key: "currentSlotDate",           label: "Дата текущего слота",                                   width: 140 },
  { key: "currentSlotTime",           label: "Время текущего слота",                                  width: 140 },
  { key: "quantityUnits",             label: "Количество, штуки",                                     width: 130 },
  { key: "plannedPallets",            label: "Планируемое количество паллет",                         width: 180 },
  { key: "loadingLogist",             label: "Ответственный за прогрузку логист",                     width: 200 },
  { key: "loaded",                    label: "Прогружено",                                            width: 110 },
  { key: "loadedAt",                  label: "Дата и время прогрузки",                                width: 170 },
  { key: "kitu",                      label: "КИТУ",                                                  width: 80  },
  { key: "cargoType",                 label: "Тип груза",                                             width: 110 },
  { key: "finalCorrection",           label: "Итоговая корректировка после сборки и подготовки",       width: 220 },
  { key: "packagingSent",             label: "Упаковка/сопоставление отправлено",                     width: 200 },
  { key: "ticket",                    label: "Тикет",                                                 width: 110 },
  { key: "marketplaceWarehouseNotes", label: "Пометки складов маркета",                               width: 180 },
  { key: "packagingSentAt",           label: "Дата и время отправки упаковки",                        width: 190 },
  { key: "palletsActual",             label: "Кол-во паллет",                                         width: 110 },
  { key: "shipmentPlannedDate",       label: "Планируемая дата отгрузки",                             width: 170 },
  { key: "shipmentPlannedTime",       label: "Планируемое время отгрузки",                            width: 170 },
  { key: "shipmentLogist",            label: "Ответственный за отгрузку логист",                      width: 200 },
  { key: "driverData",                label: "Данные на водителя",                                    width: 220 },
  { key: "driverDataActualized",      label: "Данные на водителя актуализированы",                    width: 200 },
  { key: "shkPidPackagingSent",       label: "ШК, ПИД, Упаковочный отправлены",                       width: 200 },
  { key: "shkPidSentAt",              label: "Дата и время отправки ШК ПИД УЛ",                       width: 200 },
  { key: "orderTaped",                label: "Заказ Обклеен",                                         width: 130 },
  { key: "tapedAt",                   label: "Дата и время обклейки",                                 width: 170 },
  { key: "truckArrived",              label: "Машина прибыла",                                        width: 130 },
  { key: "truckArrivedAt",            label: "Фактические дата и время прибытия",                     width: 200 },
  { key: "ttnSent",                   label: "ТТН отправлена",                                        width: 130 },
  { key: "ttnSentAt",                 label: "Дата и время отправки ТТН",                             width: 180 },
  { key: "truckDeparted",             label: "Машина убыла/отгружено",                                width: 170 },
  { key: "shippedAt",                 label: "Дата и время отгрузки",                                 width: 170 },
  { key: "gateNumber",                label: "Номер Ворот",                                           width: 110 },
  { key: "comment",                   label: "Комментарий",                                           width: 200 },
  { key: "isReturn",                  label: "возврат",                                               width: 90  },
  { key: "truckLeftNoLoading",        label: "Уехала без загрузки",                                   width: 160 },
  { key: "isCancelled",               label: "Отмена",                                                width: 90  },
  { key: "departureWarehouse",        label: "Склад убытия",                                          width: 130 },
  { key: "tzper",                     label: "ТЗПер",                                                 width: 110 },
  { key: "puo",                       label: "ПУО",                                                   width: 90  },
  { key: "pdo",                       label: "ПДО",                                                   width: 90  },
  { key: "driverInfo",                label: "Данные водителя",                                       width: 200 },
  { key: "axaptaSalesTicket",         label: "Тикет продажи в аксапте",                               width: 200 },
  { key: "tklzNumber",                label: "Номер ТКлз",                                            width: 140 },
  { key: "accountingComment",         label: "Комментарий для бухгалтерии",                           width: 200 },
  { key: "carrier",                   label: "Перевозчик",                                            width: 140 },
  { key: "trip",                      label: "Рейс",                                                  width: 100 },
  { key: "idleHours",                 label: "Простой (часы)",                                        width: 120 },
  { key: "carrierReturn",             label: "Возврат (перевозчик)",                                  width: 150 },
  { key: "idleReason",                label: "Причина простоя",                                       width: 160 },
  { key: "returnReason",              label: "Причина возврата",                                      width: 160 },
  { key: "returnFine",                label: "Штраф за возврат",                                      width: 140 },
  { key: "idleFine",                  label: "Штраф за простой",                                      width: 140 },
  { key: "tripCost",                  label: "Стоимость рейса",                                       width: 140 },
  { key: "totalCost",                 label: "Стоимость итого, руб",                                  width: 150 },
  { key: "carrierComments",           label: "Комментарии перевозчика",                               width: 200 },
  { key: "approved",                  label: "Согласовано",                                           width: 110 },
  { key: "archivePending",            label: "Пора архивировать",                                     width: 150 },
];

const HEADER_MAP: Record<string, string> = {
  "статус": "status",
  "номер заказа": "orderNumber",
  "номер по интеграции из аксапты": "axaptaIntegrationNumber",
  "мп": "marketplace",
  "склад откуда": "warehouseFrom",
  "склад куда": "warehouseTo",
  "дата и время передачи данных по заказу": "orderDataTransferAt",
  "первоначальные время и дата слота": "initialSlotAt",
  "дата текущего слота": "currentSlotDate",
  "время текущего слота": "currentSlotTime",
  "количество, штуки": "quantityUnits",
  "количество штуки": "quantityUnits",
  "планируемое количество паллет": "plannedPallets",
  "ответственный за прогрузку логист": "loadingLogist",
  "прогружено": "loaded",
  "дата и время прогрузки": "loadedAt",
  "киту": "kitu",
  "тип груза": "cargoType",
  "итоговая корректировка после сборки и подготовки упаковки": "finalCorrection",
  "упаковка/сопоставление отправлено": "packagingSent",
  "тикет": "ticket",
  "пометки складов маркета": "marketplaceWarehouseNotes",
  "дата и время отправки упаковки": "packagingSentAt",
  "кол-во паллет": "palletsActual",
  "планируемая дата отгрузки": "shipmentPlannedDate",
  "планируемое время отгрузки": "shipmentPlannedTime",
  "ответственный за отгрузку логист": "shipmentLogist",
  "данные на водителя": "driverData",
  "данные на водителя актуализированы": "driverDataActualized",
  "шк, пид, упаковочный отправлены": "shkPidPackagingSent",
  "шк пид упаковочный отправлены": "shkPidPackagingSent",
  "дата и время отправки шк пид ул": "shkPidSentAt",
  "заказ обклеен": "orderTaped",
  "дата и время обклейки": "tapedAt",
  "машина прибыла": "truckArrived",
  "фактические дата и время прибытия машины": "truckArrivedAt",
  "ттн отправлена": "ttnSent",
  "дата и время отправки ттн": "ttnSentAt",
  "машина убыла/отгружено": "truckDeparted",
  "машина убыла отгружено": "truckDeparted",
  "дата и время отгрузки": "shippedAt",
  "номер ворот": "gateNumber",
  "комментарий": "comment",
  "возврат": "isReturn",
  "машина уехала не дождавшись загрузки": "truckLeftNoLoading",
  "отмена": "isCancelled",
  "склад убытия": "departureWarehouse",
  "тзпер": "tzper",
  "пуо": "puo",
  "пдо": "pdo",
  "данные водителя": "driverInfo",
  "тикет продажи в аксапте": "axaptaSalesTicket",
  "номер тклз": "tklzNumber",
  "комментарий для бухгалетрии": "accountingComment",
  "комментарий для бухгалтерии": "accountingComment",
  "перевозчик": "carrier",
  "рейс": "trip",
  "простой (часы)": "idleHours",
  "простой часы": "idleHours",
  "возврат (перевозчик)": "carrierReturn",
  "причина простоя": "idleReason",
  "причина возврата": "returnReason",
  "штраф за возврат": "returnFine",
  "штраф за простой": "idleFine",
  "стоимость рейса": "tripCost",
  "стоимость итого, (руб)": "totalCost",
  "стоимость итого (руб)": "totalCost",
  "стоимость итого, руб": "totalCost",
  "комментарии перевозчика": "carrierComments",
  "согласовано": "approved",
  "пора архивировать": "archivePending",
};

const DATE_FIELDS = new Set([
  "orderDataTransferAt", "initialSlotAt", "currentSlotDate",
  "loadedAt", "packagingSentAt", "shipmentPlannedDate",
  "shkPidSentAt", "tapedAt", "truckArrivedAt", "ttnSentAt", "shippedAt",
]);
const TIME_FIELDS = new Set(["currentSlotTime", "shipmentPlannedTime"]);

const normalizeHeader = (s: string) =>
  String(s).trim().toLowerCase().replace(/\s+/g, " ").replace(/[ ]/g, " ");

function excelValueToString(rawVal: any, field: string): string | null {
  if (rawVal === "" || rawVal == null) return null;
  if (typeof rawVal === "number") {
    if (DATE_FIELDS.has(field)) {
      const d = XLSX.SSF.parse_date_code(rawVal);
      if (d) {
        const pad = (n: number) => String(n).padStart(2, "0");
        const datePart = `${d.y}-${pad(d.m)}-${pad(d.d)}`;
        const hasTime = (d.H || d.M || d.S) && rawVal % 1 !== 0;
        return hasTime ? `${datePart} ${pad(d.H)}:${pad(d.M)}` : datePart;
      }
    }
    if (TIME_FIELDS.has(field)) {
      const totalMinutes = Math.round(rawVal * 24 * 60);
      const h = Math.floor(totalMinutes / 60) % 24;
      const m = totalMinutes % 60;
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
  }
  return String(rawVal).trim();
}

type OutboundRow = Record<string, any> & { id: number };

function EditableCell({ row, col, onSave, readOnly }: {
  row: OutboundRow;
  col: typeof COLUMNS[number];
  onSave: (id: number, field: string, value: string) => void;
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const val = row[col.key];
  const display = val != null && val !== "" ? String(val) : "";

  if (!readOnly && editing) {
    return (
      <input
        className="w-full h-full px-2 py-1 text-xs border border-blue-400 outline-none bg-blue-50 min-w-0"
        defaultValue={display}
        autoFocus
        onBlur={(e) => { onSave(row.id, col.key, e.target.value); setEditing(false); }}
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

export default function Outbound() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const canEdit = user?.role !== "user";

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [filterMarketplace, setFilterMarketplace] = useState<string[]>([]);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  type UndoAction =
    | { type: "edit"; id: number; field: string; prevValue: string | null }
    | { type: "delete"; row: OutboundRow }
    | { type: "clone"; id: number };
  const [lastAction, setLastAction] = useState<UndoAction | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, filterMarketplace]);

  const { data: meta = { marketplaces: [], statuses: [] } } = useQuery<{ marketplaces: string[]; statuses: string[] }>({
    queryKey: ["/api/outbound/meta"],
    queryFn: async () => {
      const res = await fetch("/api/outbound/meta", { headers: { Authorization: `Bearer ${token()}` } });
      if (!res.ok) throw new Error("Failed to fetch meta");
      return res.json();
    },
  });

  const buildFilterParams = () => {
    const params = new URLSearchParams({ search: debouncedSearch });
    if (filterMarketplace.length) params.set("marketplaces", filterMarketplace.join(","));
    return params;
  };

  const { data: stats = { total: 0, shipped: 0, cancelled: 0, inProgress: 0 } } = useQuery<{ total: number; shipped: number; cancelled: number; inProgress: number }>({
    queryKey: ["/api/outbound/stats", debouncedSearch, filterMarketplace],
    queryFn: async () => {
      const res = await fetch(`/api/outbound/stats?${buildFilterParams()}`, { headers: { Authorization: `Bearer ${token()}` } });
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
  });

  const buildParams = () => {
    const params = new URLSearchParams({ page: String(currentPage), limit: String(ITEMS_PER_PAGE), search: debouncedSearch });
    if (filterMarketplace.length) params.set("marketplaces", filterMarketplace.join(","));
    return params;
  };

  const { data: result = { rows: [], total: 0, totalPages: 0 }, isLoading } = useQuery<{ rows: OutboundRow[]; total: number; totalPages: number }>({
    queryKey: ["/api/outbound", currentPage, debouncedSearch, filterMarketplace],
    queryFn: async () => {
      const res = await fetch(`/api/outbound?${buildParams()}`, { headers: { Authorization: `Bearer ${token()}` } });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { rows, total, totalPages } = result;

  const updateMutation = useMutation({
    mutationFn: async ({ id, field, value, prevValue }: { id: number; field: string; value: string; prevValue: any }) => {
      const body: Record<string, any> = { [field]: value === "" ? null : value };
      body._before = { [field]: prevValue };
      const res = await fetch(`/api/outbound/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Update failed");
      return res.json();
    },
    onMutate: async ({ id, field, value }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/outbound"] });
      const snapshot = queryClient.getQueriesData({ queryKey: ["/api/outbound"] });
      const optimisticValue = value === "" ? null : value;
      queryClient.setQueriesData({ queryKey: ["/api/outbound"] }, (old: any) =>
        old ? { ...old, rows: old.rows.map((r: any) => r.id === id ? { ...r, [field]: optimisticValue } : r) } : old
      );
      return { snapshot };
    },
    onError: (_err: unknown, _vars: unknown, context: any) => {
      context?.snapshot.forEach(([key, data]: [any, any]) => queryClient.setQueryData(key, data));
      toast({ title: "Ошибка", description: "Не удалось сохранить изменение", variant: "destructive" });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["/api/outbound"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/outbound/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token()}` } });
      if (!res.ok) throw new Error("Delete failed");
    },
    onMutate: async (id: number) => {
      await queryClient.cancelQueries({ queryKey: ["/api/outbound"] });
      const snapshot = queryClient.getQueriesData({ queryKey: ["/api/outbound"] });
      queryClient.setQueriesData({ queryKey: ["/api/outbound"] }, (old: any) =>
        old ? { ...old, rows: old.rows.filter((r: any) => r.id !== id), total: old.total - 1 } : old
      );
      return { snapshot };
    },
    onError: (_err: unknown, _id: unknown, context: any) => {
      context?.snapshot.forEach(([key, data]: [any, any]) => queryClient.setQueryData(key, data));
      toast({ title: "Ошибка", description: "Не удалось удалить строку", variant: "destructive" });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["/api/outbound"] }),
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/outbound", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Add failed");
      return res.json();
    },
    onSuccess: (data) => {
      setLastAction({ type: "clone", id: data.id });
      queryClient.setQueriesData({ queryKey: ["/api/outbound"] }, (old: any) =>
        old ? { ...old, rows: [data, ...old.rows], total: old.total + 1 } : old
      );
      queryClient.invalidateQueries({ queryKey: ["/api/outbound"] });
      toast({ title: "Строка добавлена" });
    },
    onError: () => toast({ title: "Ошибка", description: "Не удалось добавить строку", variant: "destructive" }),
  });

  const cloneMutation = useMutation({
    mutationFn: async (row: OutboundRow) => {
      const { id, createdAt, updatedAt, companyId, key, ...data } = row;
      const res = await fetch("/api/outbound", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Clone failed");
      return res.json();
    },
    onSuccess: (data) => {
      setLastAction({ type: "clone", id: data.id });
      queryClient.setQueriesData({ queryKey: ["/api/outbound"] }, (old: any) =>
        old ? { ...old, rows: [data, ...old.rows], total: old.total + 1 } : old
      );
      queryClient.invalidateQueries({ queryKey: ["/api/outbound"] });
    },
    onError: () => toast({ title: "Ошибка", description: "Не удалось клонировать строку", variant: "destructive" }),
  });

  const importMutation = useMutation({
    mutationFn: async (importRows: Record<string, any>[]) => {
      const res = await fetch("/api/outbound/import", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ rows: importRows }),
      });
      if (!res.ok) throw new Error("Import failed");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/outbound"] });
      queryClient.invalidateQueries({ queryKey: ["/api/outbound/meta"] });
      toast({ title: "Импорт завершён", description: `Загружено строк: ${data.imported}` });
    },
    onError: () => toast({ title: "Ошибка импорта", variant: "destructive" }),
  });

  const undo = useCallback(async () => {
    if (!lastAction) return;
    try {
      if (lastAction.type === "edit") {
        await fetch(`/api/outbound/${lastAction.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
          body: JSON.stringify({ [lastAction.field]: lastAction.prevValue }),
        });
      } else if (lastAction.type === "delete") {
        const { id, createdAt, updatedAt, companyId, key, ...data } = lastAction.row;
        await fetch("/api/outbound", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
          body: JSON.stringify(data),
        });
      } else if (lastAction.type === "clone") {
        await fetch(`/api/outbound/${lastAction.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token()}` },
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/outbound"] });
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

    let headerIdx = -1;
    for (let i = 0; i < Math.min(5, raw.length); i++) {
      const firstCell = normalizeHeader(String(raw[i][0] ?? ""));
      if (firstCell === "статус") { headerIdx = i; break; }
    }
    if (headerIdx === -1) headerIdx = 0;

    const headers: string[] = raw[headerIdx].map((h: any) => normalizeHeader(String(h)));
    const importRows = raw.slice(headerIdx + 1)
      .filter((r: any[]) => r.some((v: any) => v !== "" && v != null))
      .map((r: any[]) => {
        const obj: Record<string, any> = {};
        headers.forEach((h, i) => {
          const field = HEADER_MAP[h];
          if (!field) return;
          obj[field] = excelValueToString(r[i], field);
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
    const params = new URLSearchParams({ page: "1", limit: "100000", search: searchQuery });
    if (filterMarketplace.length) params.set("marketplaces", filterMarketplace.join(","));
    const res = await fetch(`/api/outbound?${params}`, { headers: { Authorization: `Bearer ${token()}` } });
    if (!res.ok) return;
    const data = await res.json();
    const exportRows = data.rows.map((row: OutboundRow) =>
      Object.fromEntries(COLUMNS.map(col => [col.label, row[col.key] ?? ""]))
    );
    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wbOut = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wbOut, ws, "Реестр Отгрузок");
    XLSX.writeFile(wbOut, "outbound.xlsx");
    fetch("/api/activity/log", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ actionType: "export", entityType: "outbound", description: `Exported ${exportRows.length} outbound rows to xlsx`, metadata: { rowCount: exportRows.length } }),
    }).catch(() => {});
  };

  const hasFilters = !!(debouncedSearch || filterMarketplace.length);

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <div className="md:ml-64">
        <header className="bg-white border-b border-gray-200">
          <div className="pl-14 pr-6 py-4 md:px-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-gray-800">Outbound</h1>
              <p className="text-gray-600 mt-1">Реестр отгрузок</p>
            </div>
            {canEdit && (
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} />
            )}
          </div>
        </header>

        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Shipments</CardTitle>
                <Package className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.total.toLocaleString("ru-RU")}</div>
                <p className="text-xs text-muted-foreground">total registry rows</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Shipped</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.shipped.toLocaleString("ru-RU")}</div>
                <p className="text-xs text-muted-foreground">
                  {stats.total > 0 ? `${Math.round((stats.shipped / stats.total) * 100)}% of total` : "status: отгружено"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">In Progress</CardTitle>
                <Clock className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.inProgress.toLocaleString("ru-RU")}</div>
                <p className="text-xs text-muted-foreground">not shipped, not cancelled</p>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col space-y-4 md:flex-row md:space-y-0 md:space-x-3 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Заказ, склад, перевозчик..."
                className="pl-10"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <MultiSelectFilter label="Marketplace" options={meta.marketplaces ?? []} values={filterMarketplace} onChange={setFilterMarketplace} />
            {canEdit && (
              <Button
                onClick={() => addMutation.mutate()}
                disabled={addMutation.isPending}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Add Movement
              </Button>
            )}
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
                  <p className="mt-4 text-sm text-gray-500">Loading shipments...</p>
                </div>
              ) : total === 0 ? (
                <div className="text-center py-12">
                  <Truck className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900">
                    {hasFilters ? "Нет строк по выбранным фильтрам" : "Нет данных"}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {hasFilters ? "Попробуйте изменить фильтры." : "Загрузите XLSX-файл для импорта."}
                  </p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto overflow-y-auto max-h-[500px] border border-gray-200 rounded-lg">
                    <table className="w-full text-sm" style={{ minWidth: "max-content" }}>
                      <thead className="bg-white sticky top-0 z-10">
                        <tr className="border-b border-gray-200">
                          {canEdit && (
                            <th className="sticky left-0 z-20 bg-white text-left py-3 px-2 font-medium text-black uppercase text-xs border-r border-gray-200 w-16">
                              Actions
                            </th>
                          )}
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
                        {rows.map((row: OutboundRow) => (
                          <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50 group">
                            {canEdit && (
                              <td className="sticky left-0 z-10 bg-white group-hover:bg-gray-50 px-1 py-1 border-r border-gray-200 w-16">
                                <div className="flex items-center gap-1">
                                  <button
                                    className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                                    title="Удалить"
                                    onClick={() => { setLastAction({ type: "delete", row }); deleteMutation.mutate(row.id); }}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    className="p-1 text-gray-400 hover:text-blue-500 transition-colors"
                                    title="Клонировать"
                                    onClick={() => cloneMutation.mutate(row)}
                                  >
                                    <Copy className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            )}
                            {COLUMNS.map((col) => (
                              <td
                                key={col.key}
                                className="border-r border-gray-100 last:border-r-0 p-0"
                                style={{ minWidth: col.width }}
                              >
                                <EditableCell
                                  row={row}
                                  col={col}
                                  onSave={(id, field, value) => {
                                    const prevValue = (row as any)[field] ?? null;
                                    setLastAction({ type: "edit", id, field, prevValue });
                                    updateMutation.mutate({ id, field, value, prevValue });
                                  }}
                                  readOnly={!canEdit}
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

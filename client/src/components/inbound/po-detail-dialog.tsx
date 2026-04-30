import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const token = () => localStorage.getItem("token");

type PoLine = {
  ssku: string | null;
  sskuName: string | null;
  quantityPlan: number | null;
  quantityFact: number | null;
};

type PoChange = {
  id: number;
  poNumber: string | null;
  ssku: string | null;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  changeType: string;
  importBatchId: string | null;
  changedAt: string;
};

const FIELD_LABELS: Record<string, string> = {
  valueStream: "Value Stream",
  category: "Category",
  ssku: "SSKU",
  modelId: "Model ID",
  sskuName: "SSKU Name",
  supplierId: "Supplier ID",
  supplierName: "Supplier",
  piNumber: "PI Number",
  piDate: "PI Date",
  poNumber: "PO Number",
  poDate: "PO Date",
  ciNumber: "CI Number",
  poAxapta: "PO Axapta",
  poAxaptaDate: "PO Axapta Date",
  quantityPlan: "Qty Plan",
  quantityFact: "Qty Fact",
  quantityFactYt: "Qty Fact YT",
  quantityFactCheck: "Qty Fact Check",
  actualContractPrice: "Actual Contract Price",
  purchasePrice: "Purchase Price",
  currency: "Currency",
  currencyCalc: "Currency Calc",
  purchasePriceCheck: "Purchase Price Check",
  shipmentTerms: "Shipment Terms",
  amountSum: "Amount",
  etaPlan: "ETA Plan",
  readinessDateActual: "Readiness Date",
  rdaUpdate: "RDA Update",
  etdPlan: "ETD Plan",
  etaActual: "ETA Actual",
  productionStatus: "Production Status",
  logisticStatus: "Logistic Status",
  nonDelivery: "Non-Delivery",
  akTicket: "AK Ticket",
  acPassDate: "AC Pass Date",
  plTicket: "PL Ticket",
  glTicket: "GL Ticket",
  replenTicket: "Replen Ticket",
  creationDate: "Creation Date",
  replenishmentManager: "Replen Manager",
};

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
    timeZone: "Europe/Moscow",
  });
};

const fmtNumber = (n: number | null) => n == null ? "—" : n.toLocaleString("ru-RU");

export function PoDetailDialog({ poNumber, open, onOpenChange }: {
  poNumber: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const enabled = open && !!poNumber;

  const { data: lines = [], isLoading: linesLoading } = useQuery<PoLine[]>({
    queryKey: ["/api/inbound/po", poNumber, "lines"],
    enabled,
    queryFn: async () => {
      const res = await fetch(`/api/inbound/po/${encodeURIComponent(poNumber!)}/lines`, { headers: { Authorization: `Bearer ${token()}` } });
      if (!res.ok) throw new Error("Failed to fetch lines");
      return res.json();
    },
  });

  const { data: changes = [], isLoading: changesLoading } = useQuery<PoChange[]>({
    queryKey: ["/api/inbound/po", poNumber, "changes"],
    enabled,
    queryFn: async () => {
      const res = await fetch(`/api/inbound/po/${encodeURIComponent(poNumber!)}/changes?days=14`, { headers: { Authorization: `Bearer ${token()}` } });
      if (!res.ok) throw new Error("Failed to fetch changes");
      return res.json();
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>PO {poNumber}</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="lines" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="lines">Состав заказа</TabsTrigger>
            <TabsTrigger value="changes">Последние изменения</TabsTrigger>
          </TabsList>

          <TabsContent value="lines" className="mt-4">
            {linesLoading ? (
              <div className="text-center py-8 text-sm text-gray-500">Загрузка...</div>
            ) : lines.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-500">Нет позиций</div>
            ) : (
              <div className="overflow-auto max-h-[400px] border border-gray-200 rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-3 text-xs font-medium uppercase text-gray-600">SSKU</th>
                      <th className="text-left py-2 px-3 text-xs font-medium uppercase text-gray-600">Name</th>
                      <th className="text-right py-2 px-3 text-xs font-medium uppercase text-gray-600">Qty Plan</th>
                      <th className="text-right py-2 px-3 text-xs font-medium uppercase text-gray-600">Qty Fact</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, i) => (
                      <tr key={`${l.ssku}-${i}`} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-2 px-3 text-xs">{l.ssku || "—"}</td>
                        <td className="py-2 px-3 text-xs">{l.sskuName || "—"}</td>
                        <td className="py-2 px-3 text-xs text-right tabular-nums">{fmtNumber(l.quantityPlan)}</td>
                        <td className="py-2 px-3 text-xs text-right tabular-nums">{fmtNumber(l.quantityFact)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="changes" className="mt-4">
            {changesLoading ? (
              <div className="text-center py-8 text-sm text-gray-500">Загрузка...</div>
            ) : changes.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-500">Нет изменений за последние 14 дней</div>
            ) : (
              <div className="overflow-auto max-h-[400px] border border-gray-200 rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-3 text-xs font-medium uppercase text-gray-600">Поле</th>
                      <th className="text-left py-2 px-3 text-xs font-medium uppercase text-gray-600">Было</th>
                      <th className="text-left py-2 px-3 text-xs font-medium uppercase text-gray-600">Стало</th>
                      <th className="text-left py-2 px-3 text-xs font-medium uppercase text-gray-600">Когда</th>
                    </tr>
                  </thead>
                  <tbody>
                    {changes.map((c) => (
                      <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-2 px-3 text-xs">
                          {c.changeType === "created" && (
                            <span>
                              <span className="text-green-600 font-medium">+ создано</span>
                              {c.ssku && <span className="text-gray-400 ml-1">({c.ssku})</span>}
                            </span>
                          )}
                          {c.changeType === "deleted" && (
                            <span>
                              <span className="text-red-600 font-medium">− удалено</span>
                              {c.ssku && <span className="text-gray-400 ml-1">({c.ssku})</span>}
                            </span>
                          )}
                          {c.changeType === "updated" && (
                            <span>
                              <span className="font-medium">{FIELD_LABELS[c.field] ?? c.field}</span>
                              {c.ssku && <span className="text-gray-400 ml-1">({c.ssku})</span>}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-xs text-gray-600 max-w-[150px] truncate" title={c.oldValue || ""}>{c.oldValue || "—"}</td>
                        <td className="py-2 px-3 text-xs text-gray-900 max-w-[150px] truncate" title={c.newValue || ""}>{c.newValue || "—"}</td>
                        <td className="py-2 px-3 text-xs text-gray-500 whitespace-nowrap">{fmtDate(c.changedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

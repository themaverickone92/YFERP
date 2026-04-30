import { useState, useRef, useEffect } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function CategoryFilter({
  categoryHierarchy,
  values,
  onChange,
  flat = false,
}: {
  categoryHierarchy: Record<string, string[]>;
  values: string[];
  onChange: (v: string[]) => void;
  flat?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [popoverWidth, setPopoverWidth] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (open && triggerRef.current) setPopoverWidth(triggerRef.current.offsetWidth);
  }, [open]);

  const keyFor = (vs: string, cat: string) => flat ? cat : `${vs} > ${cat}`;

  const toggle = (key: string) =>
    onChange(values.includes(key) ? values.filter(v => v !== key) : [...values, key]);

  const toggleVS = (vs: string) => {
    const cats = categoryHierarchy[vs] || [];
    const keys = flat ? cats : [vs, ...cats.map(c => `${vs} > ${c}`)];
    const allSel = keys.every(k => values.includes(k));
    onChange(allSel ? values.filter(v => !keys.includes(v)) : Array.from(new Set([...values, ...keys])));
  };

  const q = search.toLowerCase().trim();
  const filteredEntries: [string, string[]][] = Object.entries(categoryHierarchy)
    .sort()
    .filter(([vs, cats]) => !q || vs.toLowerCase().includes(q) || cats.some(c => c.toLowerCase().includes(q)))
    .map(([vs, cats]) => [
      vs,
      !q || vs.toLowerCase().includes(q) ? cats : cats.filter(c => c.toLowerCase().includes(q)),
    ]);

  const allKeys = filteredEntries.flatMap(([vs, cats]) =>
    flat ? cats : [vs, ...cats.map(c => `${vs} > ${c}`)]
  );
  const allSelected = allKeys.length > 0 && allKeys.every(v => values.includes(v));

  const handleSelectAll = () => {
    if (allSelected) onChange(values.filter(v => !allKeys.includes(v)));
    else onChange(Array.from(new Set([...values, ...allKeys])));
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch(""); }}>
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          variant="outline"
          className="w-[220px] justify-between text-muted-foreground hover:text-black hover:bg-white hover:border-gray-300 text-sm font-normal"
        >
          <span className="truncate">
            {values.length === 0 ? "Filter by category" : `${values.length} selected`}
          </span>
          <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        style={popoverWidth ? { width: popoverWidth * 2 } : undefined}
        className="p-0"
        align="start"
      >
        <div className="flex items-center gap-2 border-b px-3">
          <input
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск..."
            className="filter-search flex-1 py-2 text-sm bg-transparent placeholder:text-muted-foreground"
            style={{ border: "none", outline: "none", boxShadow: "none" }}
          />
          <button
            onClick={handleSelectAll}
            className="text-xs text-muted-foreground hover:text-black whitespace-nowrap shrink-0"
          >
            {allSelected ? "Очистить" : "Выбрать все"}
          </button>
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {filteredEntries.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">Ничего не найдено</div>
          ) : (
            filteredEntries.map(([vs, cats], index) => {
              const rowKeys = flat ? cats : [vs, ...cats.map(c => `${vs} > ${c}`)];
              const vsAllSel = rowKeys.every(k => values.includes(k));
              return (
                <div key={vs}>
                  <div
                    className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-50 select-none"
                    onClick={() => toggleVS(vs)}
                  >
                    <span className={`text-sm font-medium ${vsAllSel ? "text-gray-900" : "text-gray-700"}`}>{vs}</span>
                    {vsAllSel && <Check className="h-4 w-4 text-gray-600 shrink-0" />}
                  </div>
                  {cats.length > 0 && <div className="border-b border-gray-100" />}
                  {cats.map(cat => {
                    const key = keyFor(vs, cat);
                    const sel = values.includes(key);
                    return (
                      <div
                        key={key}
                        className="flex items-center justify-between px-3 py-2 pl-5 cursor-pointer hover:bg-gray-50 select-none"
                        onClick={() => toggle(key)}
                      >
                        <span className={`text-sm ${sel ? "text-gray-800" : "text-gray-500"}`}>{cat}</span>
                        {sel && <Check className="h-3.5 w-3.5 text-gray-500 shrink-0" />}
                      </div>
                    );
                  })}
                  {index < filteredEntries.length - 1 && <div className="border-b border-gray-200" />}
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

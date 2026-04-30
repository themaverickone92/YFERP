import { useState, useRef, useEffect } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function MultiSelectFilter({
  label,
  options,
  values,
  onChange,
  width = "w-[180px]",
  formatLabel,
}: {
  label: string;
  options: string[];
  values: string[];
  onChange: (v: string[]) => void;
  width?: string;
  formatLabel?: (v: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [popoverWidth, setPopoverWidth] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (open && triggerRef.current) {
      setPopoverWidth(triggerRef.current.offsetWidth);
    }
  }, [open]);

  const filtered = options.filter(opt =>
    opt.toLowerCase().includes(search.toLowerCase())
  );

  const allSelected = filtered.length > 0 && filtered.every(opt => values.includes(opt));

  const toggle = (opt: string) =>
    onChange(values.includes(opt) ? values.filter(v => v !== opt) : [...values, opt]);

  const handleSelectAll = () => {
    if (allSelected) {
      onChange(values.filter(v => !filtered.includes(v)));
    } else {
      const merged = Array.from(new Set([...values, ...filtered]));
      onChange(merged);
    }
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch(""); }}>
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          variant="outline"
          className={`${width} justify-between text-muted-foreground hover:text-black hover:bg-white hover:border-gray-300 text-sm font-normal`}
        >
          <span className="truncate">
            {values.length === 0 ? label : `${values.length} selected`}
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
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">Ничего не найдено</div>
          ) : (
            filtered.map(opt => {
              const selected = values.includes(opt);
              return (
                <div
                  key={opt}
                  className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-50 select-none"
                  onClick={() => toggle(opt)}
                >
                  <span className={`text-sm ${selected ? "text-gray-900" : "text-gray-700"}`}>
                    {formatLabel ? formatLabel(opt) : opt}
                  </span>
                  {selected && <Check className="h-4 w-4 text-gray-600 shrink-0" />}
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

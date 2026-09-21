import React, { useState, useRef, useEffect, createContext, useContext } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '../../lib/cn';

const SelectContext = createContext<{
  value: string;
  onValueChange: (val: string) => void;
  open: boolean;
  setOpen: (val: boolean) => void;
} | null>(null);

export function Select({ children, value, onValueChange, className }: { children: React.ReactNode, value: string, onValueChange: (val: string) => void, className?: string }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  return (
    <SelectContext.Provider value={{ value, onValueChange, open, setOpen }}>
      <div ref={containerRef} className={cn("relative inline-block", className)} data-slot="select">
        {children}
      </div>
    </SelectContext.Provider>
  );
}

export function SelectTrigger({ children, className, id, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const ctx = useContext(SelectContext);
  if (!ctx) return null;

  return (
    <button
      type="button"
      id={id}
      className={cn(
        "flex w-fit items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none hover:bg-accent hover:text-accent-foreground focus-visible:border-ring focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      onClick={() => ctx.setOpen(!ctx.open)}
      data-state={ctx.open ? 'open' : 'closed'}
      {...props}
    >
      {children}
      <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", ctx.open && "rotate-180")} />
    </button>
  );
}

export function SelectValue({ children, className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  const ctx = useContext(SelectContext);
  if (!ctx) return null;
  return (
    <span className={cn("truncate", className)} {...props}>
      {children || ctx.value}
    </span>
  );
}

export function SelectContent({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const ctx = useContext(SelectContext);
  if (!ctx?.open) return null;

  return (
    <div
      className={cn(
        "absolute top-full left-0 z-50 mt-1 min-w-[9rem] w-max overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-border animate-in fade-in-0 zoom-in-95",
        className
      )}
      {...props}
    >
      <div className="flex flex-col gap-0.5 p-1">
        {children}
      </div>
    </div>
  );
}

export function SelectItem({ children, value, className, ...props }: React.HTMLAttributes<HTMLDivElement> & { value: string }) {
  const ctx = useContext(SelectContext);
  if (!ctx) return null;
  const isSelected = ctx.value === value;

  return (
    <div
      role="option"
      aria-selected={isSelected}
      onClick={() => {
        ctx.onValueChange(value);
        ctx.setOpen(false);
      }}
      className={cn(
        "relative flex w-full cursor-pointer items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-none select-none hover:bg-accent hover:text-accent-foreground",
        isSelected && "bg-accent/50",
        className
      )}
      {...props}
    >
      <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
        {isSelected && <Check className="size-4" />}
      </span>
      <span className="truncate whitespace-nowrap">{children}</span>
    </div>
  );
}
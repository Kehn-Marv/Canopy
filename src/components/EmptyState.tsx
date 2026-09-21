import React from 'react';
import { cn } from '../lib/cn';

export function EmptyState({
  icon,
  title,
  body,
  action,
  className






}: {icon?: React.ReactNode;title: string;body: string;action?: React.ReactNode;className?: string;}) {
  return (
    <div
      className={cn(
        'surface-ruled relative overflow-hidden rounded-[1rem] border border-dashed border-border/60 px-6 py-14 text-center transition-elegant hover:border-border/80',
        className
      )}>
      
      <div className="pointer-events-none absolute inset-0 bg-background/80 backdrop-blur-[2px]" aria-hidden />
      <div className="relative mx-auto flex max-w-md flex-col items-center gap-4">
        {icon && <div className="text-muted-foreground/60 transition-transform duration-500 hover:scale-105">{icon}</div>}
        <div className="space-y-1.5">
          <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
          <p className="text-[13.5px] leading-relaxed text-muted-foreground">{body}</p>
        </div>
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>);

}

export function Loading({ label = 'Working' }: {label?: string;}) {
  return (
    <div className="flex items-center gap-3 px-1 py-8 text-sm text-muted-foreground" role="status" aria-live="polite">
      <span className="relative block h-1 w-28 overflow-hidden rounded-full bg-muted">
        <span className="absolute inset-y-0 w-1/3 animate-sweep rounded-full bg-primary" />
      </span>
      {label}…
    </div>);

}

export function ErrorNotice({
  title,
  body,
  action




}: {title: string;body: string;action?: React.ReactNode;}) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-destructive/35 bg-destructive/8 px-4 py-4 text-sm">
      
      <p className="font-semibold text-destructive">{title}</p>
      <p className="mt-1 leading-relaxed text-foreground/85">{body}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>);

}
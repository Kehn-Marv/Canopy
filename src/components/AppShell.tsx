import React, { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Archive,
  CloudOff,
  Lock,
  PackageOpen,
  Radar,
  Send,
  Settings as SettingsIcon,
  Users,
  WifiOff } from
'lucide-react';
import { useVault } from '../contexts/VaultContext';

import { Wordmark, CanopyMark } from './Brand';
import { Chip } from './Chips';
import { Button } from './ui/Button';
import { TransferTray } from './TransferTray';
import { cn } from '../lib/cn';
import { formatBytes } from '../lib/format';

interface NavItem {
  to: string;
  label: string;
  short: string;
  icon: React.ComponentType<{className?: string;}>;
  badge?: number;
}

export function AppShell({ children }: {children: React.ReactNode;}) {
  const { meta, assets, grants, signals, acks, lock, online, peers, outboxCount, storage, device } =
  useVault();
  const navigate = useNavigate();
  const location = useLocation();
  const [shortcutHint, setShortcutHint] = useState(false);

  const liveGrants = grants.filter((g) => g.status === 'active').length;
  const ackedIds = new Set(acks.map((a) => a.id));
  const openSignals = signals.filter((s) => !ackedIds.has(s.id)).length;

  const items: NavItem[] = [
  { to: '/', label: 'Library', short: 'Library', icon: Archive, badge: assets.length },
  { to: '/shares', label: 'Shared access', short: 'Shares', icon: Send, badge: liveGrants },
  { to: '/signals', label: 'Signals', short: 'Signals', icon: Radar, badge: openSignals },
  { to: '/people', label: 'Collaborators', short: 'People', icon: Users },
  { to: '/open', label: 'Open a sealed copy', short: 'Open', icon: PackageOpen }];


  /* Desktop keyboard shortcuts — this is a keyboard-first product on a laptop. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (target?.isContentEditable) return;
      if (event.ctrlKey || event.metaKey) {
        if (event.key.toLowerCase() === 'l') {
          event.preventDefault();
          lock('Vault locked with Ctrl+L.');
        }
        return;
      }
      const map: Record<string, string> = { '1': '/', '2': '/shares', '3': '/signals', '4': '/people', '5': '/open' };
      if (map[event.key]) {
        event.preventDefault();
        navigate(map[event.key]);
      }
      if (event.key === '?') setShortcutHint((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lock, navigate]);

  const connection = !online ?
  { tone: 'warn' as const, icon: WifiOff, text: 'Offline (Everything still works locally)' } :
  outboxCount > 0 ?
  { tone: 'warn' as const, icon: CloudOff, text: `${outboxCount} change(s) waiting to replicate` } :
  { tone: 'ok' as const, icon: null, text: peers > 0 ? `${peers} peer window(s) in sync` : 'Local only' };

  return (
    <div className="flex min-h-full w-full bg-background text-foreground">
      {/* ---------------------------------------------------------- desktop rail */}
      <nav
        aria-label="Primary"
        className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
        
        <div className="px-5 pb-4 pt-5">
          <Wordmark />
        </div>

        <ul className="flex-1 space-y-2 px-3 mt-4">
          {items.map((item) =>
          <li key={item.to}>
              <NavLink
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
              cn(
                'group flex items-center gap-3 rounded-[0.6rem] px-3 py-2 text-[13.5px] transition-elegant active-scale',
                isActive ?
                'bg-sidebar-accent/60 font-semibold text-sidebar-foreground shadow-sm ring-1 ring-sidebar-border/50' :
                'text-muted-foreground hover:bg-sidebar-accent/40 hover:text-sidebar-foreground'
              )
              }>
              
                <item.icon className="h-4 w-4 shrink-0 transition-transform duration-300 group-hover:scale-110" />
                <span className="flex-1 truncate">{item.label}</span>
                {item.badge !== undefined && item.badge > 0 &&
              <span
                className={cn(
                  'num rounded px-1.5 py-0.5 text-[10.5px] font-semibold',
                  item.to === '/signals' ?
                  'bg-warn/20 text-warn' :
                  'bg-muted text-muted-foreground'
                )}>
                
                    {item.badge}
                  </span>
              }
              </NavLink>
            </li>
          )}
        </ul>

        <div className="flex flex-col gap-5 border-t border-sidebar-border px-3 py-4">
          {storage && storage.quota > 0 &&
          <div className="px-1">
              <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground/80">
                <span>Storage</span>
                <span className="tracking-tight">{formatBytes(storage.usage)}</span>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-border/40">
                <div
                className="h-full rounded-full bg-primary/70 transition-all duration-1000 ease-out"
                style={{ width: `${Math.min(100, storage.usage / storage.quota * 100)}%` }} />
              </div>
            </div>
          }

          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="flex-1 justify-start gap-2.5 text-muted-foreground hover:bg-accent/40 hover:text-foreground" onClick={() => lock()}>
              <Lock className="h-4 w-4" />
              <span className="font-medium">Lock</span>
              <kbd className="ml-auto text-[10px] font-bold tracking-widest text-muted-foreground/50">
                ⌃L
              </kbd>
            </Button>

            <Button
              variant={location.pathname === '/settings' ? 'secondary' : 'ghost'}
              size="icon-sm"
              className="text-muted-foreground hover:bg-accent/40 hover:text-foreground"
              onClick={() => navigate('/settings')}
              aria-label="Settings">
              <SettingsIcon className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex flex-col gap-1 px-2.5">
            <p className="truncate text-[9.5px] font-bold uppercase tracking-widest text-muted-foreground/40">{device?.label}</p>
          </div>
        </div>
      </nav>

      {/* ------------------------------------------------------------- content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur-xl lg:hidden">
          <CanopyMark className="h-6 w-6 text-primary transition-transform active:scale-95" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-semibold leading-tight tracking-tight">{meta?.labName}</p>
            <p className="truncate font-mono text-[10px] leading-tight text-muted-foreground/80">
              {connection.text}
            </p>
          </div>

          <Button variant="outline" size="icon-sm" onClick={() => lock()} aria-label="Lock vault">
            <Lock className="h-4 w-4" />
          </Button>
        </header>

        {!online &&
        <div
          role="status"
          className="flex items-center gap-2 border-b border-warn/30 bg-warn/12 px-4 py-2 text-[12.5px] text-warn">
          
            <WifiOff className="h-3.5 w-3.5 shrink-0" />
            Offline. Sealing, opening, revoking and auditing all keep working. Changes replicate when a
            connection is restored.
          </div>
        }

        <main className="min-w-0 flex-1 pb-24 lg:pb-8">{children}</main>
      </div>

      {/* --------------------------------------------------------- mobile tabs */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-border/60 bg-background/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        
        {items.map((item) =>
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className={({ isActive }) =>
          cn(
            'relative flex min-h-[56px] flex-col items-center justify-center gap-1 text-[10.5px] transition-elegant active-scale',
            isActive ? 'font-medium text-primary' : 'text-muted-foreground'
          )
          }>
          
            <item.icon className="h-5 w-5" />
            {item.short}
            {item.to === '/signals' && openSignals > 0 &&
          <span className="absolute right-[22%] top-2 h-1.5 w-1.5 rounded-full bg-warn" />
          }
          </NavLink>
        )}
        <NavLink
          to="/settings"
          className={({ isActive }) =>
          cn(
            'flex min-h-[56px] flex-col items-center justify-center gap-1 text-[10.5px] transition-elegant active-scale',
            isActive ? 'font-medium text-primary' : 'text-muted-foreground'
          )
          }>
          
          <SettingsIcon className="h-5 w-5" />
          Settings
        </NavLink>
      </nav>

      <TransferTray />

      {shortcutHint &&
      <div className="fixed bottom-4 left-4 z-50 hidden rounded-lg border border-border bg-popover px-4 py-3 text-[12px] shadow-lg lg:block">
          <p className="mb-1.5 font-semibold">Keyboard</p>
          <ul className="space-y-1 font-mono text-[11px] text-muted-foreground">
            <li>1–5 · switch section</li>
            <li>⌃L · lock the vault</li>
            <li>? · toggle this panel</li>
          </ul>
        </div>
      }
    </div>);

}

export function PageHeader({
  title,
  subtitle,
  actions,
  meta





}: {title: string;subtitle?: string;actions?: React.ReactNode;meta?: React.ReactNode;}) {
  return (
    <div className="border-b border-border/60 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[24px] font-semibold leading-tight tracking-tight lg:text-[28px]">{title}</h1>
          {subtitle &&
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">{subtitle}</p>
          }
          {meta && <div className="mt-4 flex flex-wrap items-center gap-2">{meta}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div>}
      </div>
    </div>);

}

export function StatStrip({ items }: {items: {label: string;value: string;tone?: 'ok' | 'warn' | 'danger';}[];}) {
  return (
    <dl className="grid grid-cols-2 divide-x divide-y divide-border/60 border-b border-border/60 sm:grid-cols-4 sm:divide-y-0 bg-background/50 backdrop-blur-sm">
      {items.map((item) =>
      <div key={item.label} className="px-5 py-4 transition-colors hover:bg-accent/20 sm:px-6">
          <dt className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/80">{item.label}</dt>
          <dd
          className={cn(
            'num mt-1 text-[19px] font-semibold tabular-nums',
            item.tone === 'warn' && 'text-warn',
            item.tone === 'danger' && 'text-destructive',
            item.tone === 'ok' && 'text-ok'
          )}>
          
            {item.value}
          </dd>
        </div>
      )}
    </dl>);

}

export { Chip };

import React from 'react';
import { cn } from '../lib/cn';
import type { GrantStatus, Sensitivity, Severity } from '../types';

type Tone = 'ok' | 'warn' | 'danger' | 'muted' | 'info' | 'seal';

const TONES: Record<Tone, string> = {
  ok: 'text-ok border-ok/35 bg-ok/10',
  warn: 'text-warn border-warn/40 bg-warn/12',
  danger: 'text-destructive border-destructive/40 bg-destructive/10',
  muted: 'text-muted-foreground border-border bg-muted',
  info: 'text-info border-info/35 bg-info/10',
  seal: 'text-primary border-primary/35 bg-primary/10'
};

export function Chip({
  tone = 'muted',
  children,
  className,
  mono = false





}: {tone?: Tone;children: React.ReactNode;className?: string;mono?: boolean;}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] font-medium leading-5',
        mono && 'font-mono tracking-tight',
        TONES[tone],
        className
      )}>
      
      {children}
    </span>);

}

export function Dot({ tone = 'muted', pulse = false }: {tone?: Tone;pulse?: boolean;}) {
  const colour: Record<Tone, string> = {
    ok: 'bg-ok',
    warn: 'bg-warn',
    danger: 'bg-destructive',
    muted: 'bg-muted-foreground',
    info: 'bg-info',
    seal: 'bg-primary'
  };
  return (
    <span
      aria-hidden
      className={cn('inline-block h-1.5 w-1.5 shrink-0 rounded-full', colour[tone], pulse && 'animate-pulse')} />);


}

const SENSITIVITY_TONE: Record<Sensitivity, Tone> = {
  internal: 'muted',
  restricted: 'warn',
  embargoed: 'danger'
};

const SENSITIVITY_LABEL: Record<Sensitivity, string> = {
  internal: 'Internal',
  restricted: 'Restricted',
  embargoed: 'Embargoed'
};

export function SensitivityChip({ value }: {value: Sensitivity;}) {
  return (
    <Chip tone={SENSITIVITY_TONE[value]}>
      <Dot tone={SENSITIVITY_TONE[value]} />
      {SENSITIVITY_LABEL[value]}
    </Chip>);

}

const GRANT_TONE: Record<GrantStatus, Tone> = {
  active: 'ok',
  revoked: 'danger',
  expired: 'muted',
  exhausted: 'warn'
};

const GRANT_LABEL: Record<GrantStatus, string> = {
  active: 'Live',
  revoked: 'Revoked',
  expired: 'Closed',
  exhausted: 'Used up'
};

export function GrantStatusChip({ value }: {value: GrantStatus;}) {
  return (
    <Chip tone={GRANT_TONE[value]}>
      <Dot tone={GRANT_TONE[value]} pulse={value === 'active'} />
      {GRANT_LABEL[value]}
    </Chip>);

}

const SEVERITY_TONE: Record<Severity, Tone> = { high: 'danger', medium: 'warn', low: 'info' };

export function SeverityChip({ value }: {value: Severity;}) {
  return (
    <Chip tone={SEVERITY_TONE[value]} className="uppercase tracking-wider">
      {value}
    </Chip>);

}

export function Mono({ children, className }: {children: React.ReactNode;className?: string;}) {
  return <span className={cn('font-mono text-[11.5px] tracking-tight', className)}>{children}</span>;
}
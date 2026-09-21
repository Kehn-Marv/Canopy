


/**
 * The Canopy mark: overlapping leaf arcs forming a sheltering cover.
 * Drawn with currentColor so it inherits whatever surface it sits on.
 */
export function CanopyMark({ className = 'h-5 w-5' }: {className?: string;}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 2.5C7.4 2.5 3.6 6 3.1 10.5c-.06.55.39 1 .94 1h15.92c.55 0 1-.45.94-1C20.4 6 16.6 2.5 12 2.5Z"
        fill="currentColor"
        opacity="0.9" />
      
      <path
        d="M12 7.2c-3.1 0-5.7 2.2-6.2 5.1-.1.55.35 1.05.9 1.05h10.6c.55 0 1-.5.9-1.05-.5-2.9-3.1-5.1-6.2-5.1Z"
        fill="currentColor"
        opacity="0.45" />
      
      <path d="M12 13v8.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>);

}

export function Wordmark({ compact = false }: {compact?: boolean;}) {
  return (
    <span className="flex items-center gap-2.5">
      <CanopyMark className="h-7 w-7 text-primary" />
      {!compact &&
      <span className="text-[20px] font-bold tracking-tight">Canopy</span>
      }
    </span>);

}
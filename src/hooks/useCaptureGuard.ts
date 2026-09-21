import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface CaptureGuardOptions {
  enabled: boolean;
  allowCopy: boolean;
  onAttempt: (kind: 'printscreen' | 'print' | 'copy' | 'contextmenu') => void;
}

/**
 * Screen-capture deterrence for the protected viewer.
 *
 * What this genuinely does, in a browser:
 *  - blanks the content whenever the window loses focus or is hidden, so an
 *    OS screenshot of a background window captures nothing useful;
 *  - intercepts PrintScreen and Ctrl/Cmd+P and records the attempt;
 *  - blocks copy, cut, drag and the context menu when the grant forbids them;
 *  - hides protected surfaces from print stylesheets.
 *
 * What it cannot do, and the UI says so plainly: it cannot stop a phone camera,
 * an OS-level capture tool, a screen recorder, or a virtual machine. Anyone who
 * claims otherwise for a user-space application is wrong.
 */
export function useCaptureGuard(options: CaptureGuardOptions): {
  obscured: boolean;
  attempts: number;
} {
  const { enabled, allowCopy, onAttempt } = options;
  const [obscured, setObscured] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const attemptRef = useRef(onAttempt);
  attemptRef.current = onAttempt;

  useEffect(() => {
    if (!enabled) {
      setObscured(false);
      invoke('disable_capture_protection').catch(() => {});
      return;
    }
    invoke('enable_capture_protection').catch(() => {});
    const record = (kind: 'printscreen' | 'print' | 'copy' | 'contextmenu') => {
      setAttempts((n) => n + 1);
      attemptRef.current(kind);
    };

    const onBlur = () => setObscured(true);
    const onFocus = () => setObscured(false);
    const onVisibility = () => setObscured(document.visibilityState !== 'visible');

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'PrintScreen') {
        record('printscreen');
        setObscured(true);
        window.setTimeout(() => setObscured(document.visibilityState !== 'visible'), 1200);
        // Overwriting the clipboard is best-effort; some browsers refuse.
        navigator.clipboard?.writeText('Canopy: protected content was not copied.').catch(() => undefined);
        event.preventDefault();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') {
        record('print');
        event.preventDefault();
      }
      if (!allowCopy && (event.ctrlKey || event.metaKey) && ['c', 'x'].includes(event.key.toLowerCase())) {
        record('copy');
        event.preventDefault();
      }
    };

    const onCopy = (event: ClipboardEvent) => {
      if (allowCopy) return;
      event.preventDefault();
      record('copy');
    };
    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      record('contextmenu');
    };
    const onDragStart = (event: DragEvent) => event.preventDefault();
    const onBeforePrint = () => record('print');

    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('copy', onCopy, true);
    document.addEventListener('cut', onCopy, true);
    document.addEventListener('contextmenu', onContextMenu, true);
    document.addEventListener('dragstart', onDragStart, true);
    window.addEventListener('beforeprint', onBeforePrint);

    setObscured(document.visibilityState !== 'visible' || !document.hasFocus());

    return () => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('copy', onCopy, true);
      document.removeEventListener('cut', onCopy, true);
      document.removeEventListener('contextmenu', onContextMenu, true);
      document.removeEventListener('dragstart', onDragStart, true);
      window.removeEventListener('beforeprint', onBeforePrint);
      invoke('disable_capture_protection').catch(() => {});
    };
  }, [enabled, allowCopy]);

  return { obscured, attempts };
}
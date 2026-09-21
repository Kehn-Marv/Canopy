import { useEffect, useState } from 'react';

/**
 * Connectivity, treated as a first-class state rather than an afterthought.
 * `navigator.onLine` only proves a local link exists, so we also watch for the
 * browser's online/offline transitions and expose when the last change happened.
 */
export function useOnline(): {online: boolean;changedAt: number;} {
  const [state, setState] = useState(() => ({
    online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
    changedAt: Date.now()
  }));

  useEffect(() => {
    const goOnline = () => setState({ online: true, changedAt: Date.now() });
    const goOffline = () => setState({ online: false, changedAt: Date.now() });
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return state;
}
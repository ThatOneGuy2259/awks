import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

// Wraps React.lazy with two safeguards around the dynamic import:
//   1. Retry once on a transient network blip.
//   2. If it still fails — almost always because a new deploy replaced the
//      hashed chunk filenames this already-open tab is requesting — force a
//      one-time full reload to fetch the fresh build, instead of leaving the
//      user on a broken white screen. The session flag prevents reload loops
//      if the failure is something other than a stale chunk.
const RELOAD_FLAG = 'awks-chunk-reload';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mirrors React.lazy's own signature so component prop types are preserved
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      const mod = await factory();
      sessionStorage.removeItem(RELOAD_FLAG);
      return mod;
    } catch {
      try {
        const mod = await factory();
        sessionStorage.removeItem(RELOAD_FLAG);
        return mod;
      } catch (err) {
        if (!sessionStorage.getItem(RELOAD_FLAG)) {
          sessionStorage.setItem(RELOAD_FLAG, '1');
          window.location.reload();
          // Never resolve — the reload takes over before anything renders.
          return new Promise<{ default: T }>(() => {});
        }
        throw err;
      }
    }
  });
}

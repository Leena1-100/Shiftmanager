import { useEffect, useState } from 'react';

const RELOADED_KEY = 'shiftmoney:reloaded-for';

/** Ask the server which build is live, bypassing every cache */
async function liveBuild(): Promise<string | null> {
  try {
    const res = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as { id?: string };
    return data.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Home-screen apps keep showing a cached copy after a deploy. When the app opens or comes back
 * to the front, compare our build with the live one; on opening, reload straight away (once per
 * build, so a stale cache can't cause a loop), otherwise offer a banner.
 */
export function useUpdateCheck(): { updateReady: boolean; reload: () => void } {
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    let first = true;
    const check = async () => {
      const live = await liveBuild();
      if (!live || live === __BUILD_ID__) return;
      let alreadyTried = false;
      try {
        alreadyTried = sessionStorage.getItem(RELOADED_KEY) === live;
        sessionStorage.setItem(RELOADED_KEY, live);
      } catch {
        alreadyTried = true;
      }
      if (first && !alreadyTried) window.location.reload();
      else setUpdateReady(true);
    };
    void check().finally(() => (first = false));
    const onVisible = () => document.visibilityState === 'visible' && void check();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  return { updateReady, reload: () => window.location.reload() };
}

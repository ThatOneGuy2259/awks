import { useState, useEffect } from 'react';

const DESKTOP_MIN_WIDTH = 1024;

export function useDesktopGate() {
  const [gated, setGated] = useState(() => window.innerWidth < DESKTOP_MIN_WIDTH);

  useEffect(() => {
    const onResize = () => {
      setGated(window.innerWidth < DESKTOP_MIN_WIDTH);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return { gated };
}

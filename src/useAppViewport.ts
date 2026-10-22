import { useEffect, useState } from 'react';
import { getTelegramWebApp } from './telegram';

/** Telegram owns the native sheet. Never expand it or focus an input on navigation. */
export function useAppViewport() {
  const [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    const app = getTelegramWebApp();
    if (!app?.initData) return;
    let initialHeight: number | null = null;
    const update = () => {
      const visualHeight = window.visualViewport?.height || window.innerHeight;
      const currentHeight = app.viewportHeight || visualHeight;
      const measured = Math.round(Math.min(visualHeight, currentHeight));
      if (initialHeight === null) initialHeight = measured;
      const visible = Math.min(initialHeight, measured);
      setHeight(visible);
      document.documentElement.style.setProperty('--app-viewport-height', `${visible}px`);
    };
    const rotate = () => {
      initialHeight = null;
      update();
    };
    document.documentElement.classList.add('telegram-viewport');
    app.onEvent?.('viewportChanged', update);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', rotate);
    update();
    return () => {
      app.offEvent?.('viewportChanged', update);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', rotate);
      document.documentElement.classList.remove('telegram-viewport');
      document.documentElement.style.removeProperty('--app-viewport-height');
    };
  }, []);
  return height;
}

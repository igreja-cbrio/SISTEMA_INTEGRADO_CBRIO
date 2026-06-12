import * as React from "react";

/**
 * Retorna o elemento atual em fullscreen via Fullscreen API,
 * ou `undefined` se ninguém estiver em fullscreen.
 *
 * Reage a mudanças via evento `fullscreenchange`. Usado pra fazer Portals
 * (Dialog/Sheet/Popover) renderizarem DENTRO do elemento em fullscreen
 * — senão eles ficam debaixo do top layer e somem.
 */
export function useFullscreenContainer(): HTMLElement | undefined {
  const [container, setContainer] = React.useState<HTMLElement | undefined>(undefined);

  React.useEffect(() => {
    const update = () => {
      const fs = (document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        null) as HTMLElement | null;
      setContainer(fs ?? undefined);
    };
    update();
    document.addEventListener("fullscreenchange", update);
    document.addEventListener("webkitfullscreenchange", update);
    return () => {
      document.removeEventListener("fullscreenchange", update);
      document.removeEventListener("webkitfullscreenchange", update);
    };
  }, []);

  return container;
}

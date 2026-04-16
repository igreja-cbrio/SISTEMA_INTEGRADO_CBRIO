import { useEffect, useRef, useState } from 'react';

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

/**
 * Hook que anima um cursor virtual por uma lista de waypoints.
 * Retorna { pos, clicking } — posição atual (x,y em %) e se está clicando.
 *
 * @param {Array}   steps  - Array de { x, y, click?, pause? }
 * @param {boolean} active - true quando o slide está visível
 */
export function useMockCursor(steps, active) {
  const [pos, setPos]         = useState({ x: 20, y: 20 });
  const [clicking, setClicking] = useState(false);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!active || !steps?.length) return;
    cancelRef.current = false;

    async function run() {
      // Pequeno delay inicial para o slide terminar de entrar
      await delay(600);
      if (cancelRef.current) return;

      while (!cancelRef.current) {
        for (const step of steps) {
          if (cancelRef.current) return;

          // Move suavemente (CSS transition cuida da interpolação)
          setPos({ x: step.x, y: step.y });
          await delay(750);
          if (cancelRef.current) return;

          if (step.click) {
            setClicking(true);
            await delay(180);
            setClicking(false);
            await delay(step.pause ?? 900);
          } else {
            await delay(step.pause ?? 400);
          }
        }
        // Pausa antes de repetir o ciclo
        await delay(1200);
      }
    }

    run();
    return () => { cancelRef.current = true; };
  }, [active, steps]);

  return { pos, clicking };
}

import { OffthreadVideo, staticFile } from "remotion";

// Retângulo (normalizado 0..1 no frame 1920x1080 da gravação) que contém o
// CONTEÚDO do app — fora disso há barra preta da captura + cromo do browser.
// Recortamos exatamente isso e mostramos numa "moldura" sobre o fundo da marca.
export const WINDOW = { left: 0.135, right: 0.838, top: 0.198, bottom: 0.892 };

// Mantido por compatibilidade (os segmentos ainda declaram keyframes), mas o
// zoom de destaque foi desativado — a tela aparece inteira e parada.
export type CamKey = { f: number; hx: number; hy: number; hz: number };

// Dimensão da moldura na tela (16:9-ish, igual ao recorte) centrada no canvas.
export const SCREEN_W = 1720;
const winW = WINDOW.right - WINDOW.left;
const winH = WINDOW.bottom - WINDOW.top;
export const SCREEN_H = Math.round((SCREEN_W * (winH * 1080)) / (winW * 1920));

// Fator de escala do vídeo pra encaixar o recorte na moldura.
const S = SCREEN_W / (winW * 1920);
const VIDEO_W = 1920 * S;
const VIDEO_H = 1080 * S;
const OFFSET_X = WINDOW.left * 1920 * S;
const OFFSET_Y = WINDOW.top * 1080 * S;

export const FramedScreen: React.FC<{
  src: string;
  trimBeforeFrames: number;
  cam?: CamKey[];
}> = ({ src, trimBeforeFrames }) => {
  return (
    <div
      style={{
        position: "absolute",
        width: SCREEN_W,
        height: SCREEN_H,
        left: (1920 - SCREEN_W) / 2,
        top: (1080 - SCREEN_H) / 2,
        borderRadius: 22,
        overflow: "hidden",
        background: "#0a201d",
        boxShadow:
          "0 50px 130px rgba(0,0,0,0.55), 0 0 0 1px rgba(63,217,197,0.22)",
      }}
    >
      {/* tela recortada exatamente na janela do app (sem zoom) */}
      <OffthreadVideo
        src={staticFile(src)}
        startFrom={trimBeforeFrames}
        muted
        style={{
          position: "absolute",
          width: VIDEO_W,
          height: VIDEO_H,
          left: -OFFSET_X,
          top: -OFFSET_Y,
        }}
      />
    </div>
  );
};

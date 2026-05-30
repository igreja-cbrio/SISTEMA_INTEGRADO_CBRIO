import { Easing, OffthreadVideo, staticFile, useCurrentFrame } from "remotion";

// Retângulo (normalizado 0..1 no frame 1920x1080) onde fica a JANELA do app
// dentro da gravação — fora disso há barra preta da captura. A câmera é
// limitada (clamp) pra nunca revelar o preto.
export const WINDOW = { left: 0.123, right: 0.844, top: 0.117, bottom: 0.898 };

export type CamKey = { f: number; fx: number; fy: number; z: number };

const ease = Easing.inOut(Easing.cubic);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function sampleField(frame: number, keys: CamKey[], field: "fx" | "fy" | "z") {
  if (frame <= keys[0].f) return keys[0][field];
  for (let i = 1; i < keys.length; i++) {
    if (frame <= keys[i].f) {
      const t = clamp01((frame - keys[i - 1].f) / (keys[i].f - keys[i - 1].f));
      return lerp(keys[i - 1][field], keys[i][field], ease(t));
    }
  }
  return keys[keys.length - 1][field];
}

// Mantém o retângulo visível dentro da janela do app (sem mostrar preto).
function clampFocus(fx: number, fy: number, z: number) {
  const halfW = 0.5 / z;
  const halfH = 0.5 / z;
  const minX = WINDOW.left + halfW;
  const maxX = WINDOW.right - halfW;
  const minY = WINDOW.top + halfH;
  const maxY = WINDOW.bottom - halfH;
  const cx = minX <= maxX ? Math.max(minX, Math.min(maxX, fx)) : (WINDOW.left + WINDOW.right) / 2;
  const cy = minY <= maxY ? Math.max(minY, Math.min(maxY, fy)) : (WINDOW.top + WINDOW.bottom) / 2;
  return { cx, cy };
}

export const CameraVideo: React.FC<{
  src: string;
  trimBeforeFrames: number;
  cam: CamKey[];
}> = ({ src, trimBeforeFrames, cam }) => {
  const frame = useCurrentFrame();

  const fx = sampleField(frame, cam, "fx");
  const fy = sampleField(frame, cam, "fy");
  const z = sampleField(frame, cam, "z");
  const { cx, cy } = clampFocus(fx, fy, z);

  const tx = -(cx - 0.5) * 1920;
  const ty = -(cy - 0.5) * 1080;

  return (
    <div
      style={{
        width: 1920,
        height: 1080,
        overflow: "hidden",
        position: "absolute",
        top: 0,
        left: 0,
      }}
    >
      <div
        style={{
          width: 1920,
          height: 1080,
          transformOrigin: "center center",
          transform: `scale(${z}) translate(${tx}px, ${ty}px)`,
        }}
      >
        <OffthreadVideo
          src={staticFile(src)}
          startFrom={trimBeforeFrames}
          muted
          style={{ width: "100%", height: "100%", objectFit: "fill" }}
        />
      </div>
    </div>
  );
};

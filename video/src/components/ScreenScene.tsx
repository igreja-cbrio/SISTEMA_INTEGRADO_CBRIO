import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, FONT } from "../theme";
import { BrowserFrame } from "./BrowserFrame";
import { ScreenPlaceholder } from "./ScreenPlaceholder";

export type Screen = {
  key: string;
  label: string;
  sub: string;
  path: string;
  captured: boolean;
};

export const ScreenScene: React.FC<{
  screen: Screen;
  durationInFrames: number;
  index: number;
  total: number;
}> = ({ screen, durationInFrames, index, total }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // entrada da janela (sobe + escala)
  const enter = spring({ frame, fps, config: { damping: 18 } });
  const y = interpolate(enter, [0, 1], [70, 0]);
  const enterScale = interpolate(enter, [0, 1], [0.94, 1]);

  // Ken Burns lento no conteúdo
  const kb = interpolate(frame, [0, durationInFrames], [1.04, 1.13]);
  const kbX = interpolate(frame, [0, durationInFrames], [0, -1.5]);

  // legenda entra com leve atraso
  const capOpacity = interpolate(frame, [10, 28], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const capX = interpolate(frame, [10, 28], [-40, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div
        style={{
          transform: `translateY(${y}px) scale(${enterScale})`,
        }}
      >
        <BrowserFrame url={screen.path}>
          <div
            style={{
              width: "100%",
              height: "100%",
              transform: `scale(${kb}) translateX(${kbX}%)`,
            }}
          >
            {screen.captured ? (
              <Img
                src={staticFile(`screens/${screen.key}.png`)}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <ScreenPlaceholder label={screen.label} />
            )}
          </div>
        </BrowserFrame>
      </div>

      {/* legenda inferior esquerda */}
      <div
        style={{
          position: "absolute",
          left: 120,
          bottom: 90,
          opacity: capOpacity,
          transform: `translateX(${capX}px)`,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div
          style={{
            fontFamily: FONT,
            fontSize: 22,
            fontWeight: 700,
            color: COLORS.primary,
            letterSpacing: 3,
          }}
        >
          {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </div>
        <div
          style={{
            fontFamily: FONT,
            fontSize: 56,
            fontWeight: 800,
            color: COLORS.text,
            lineHeight: 1.05,
          }}
        >
          {screen.label}
        </div>
        <div
          style={{
            fontFamily: FONT,
            fontSize: 30,
            fontWeight: 500,
            color: COLORS.textMuted,
          }}
        >
          {screen.sub}
        </div>
      </div>
    </AbsoluteFill>
  );
};

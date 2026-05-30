import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, FONT } from "../theme";

export const TitleScene: React.FC<{ titulo: string; subtitulo: string }> = ({
  titulo,
  subtitulo,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleSpring = spring({ frame, fps, config: { damping: 14 } });
  const titleY = interpolate(titleSpring, [0, 1], [40, 0]);
  const titleOpacity = interpolate(frame, [0, 18], [0, 1], {
    extrapolateRight: "clamp",
  });

  const subOpacity = interpolate(frame, [18, 38], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const subLetter = interpolate(frame, [18, 50], [16, 6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 18,
      }}
    >
      <div
        style={{
          fontFamily: FONT,
          fontSize: 180,
          fontWeight: 800,
          color: COLORS.text,
          letterSpacing: -4,
          transform: `translateY(${titleY}px)`,
          opacity: titleOpacity,
          lineHeight: 1,
        }}
      >
        {titulo}
      </div>
      <div
        style={{
          fontFamily: FONT,
          fontSize: 40,
          fontWeight: 500,
          color: COLORS.primaryLight,
          opacity: subOpacity,
          letterSpacing: subLetter,
          textTransform: "uppercase",
        }}
      >
        {subtitulo}
      </div>
    </div>
  );
};

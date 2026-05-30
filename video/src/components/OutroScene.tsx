import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, FONT } from "../theme";
import { LogoReveal } from "./LogoReveal";

export const OutroScene: React.FC<{ site: string }> = ({ site }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enter = spring({ frame, fps, config: { damping: 16 } });
  const scale = interpolate(enter, [0, 1], [0.8, 1]);
  const opacity = interpolate(frame, [0, 14], [0, 1], {
    extrapolateRight: "clamp",
  });
  const siteOpacity = interpolate(frame, [16, 32], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 28,
        opacity,
        transform: `scale(${scale})`,
      }}
    >
      <LogoReveal size={180} />
      <div
        style={{
          fontFamily: FONT,
          fontSize: 64,
          fontWeight: 800,
          color: COLORS.text,
        }}
      >
        Faça parte.
      </div>
      <div
        style={{
          fontFamily: FONT,
          fontSize: 38,
          fontWeight: 500,
          color: COLORS.primaryLight,
          opacity: siteOpacity,
          letterSpacing: 2,
        }}
      >
        {site}
      </div>
    </div>
  );
};

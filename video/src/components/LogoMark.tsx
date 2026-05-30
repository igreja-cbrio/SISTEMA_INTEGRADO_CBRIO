import {
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS } from "../theme";

// Logo REAL da CBRio (public/logo-cbrio-icon.png) com entrada em mola + glow.
export const LogoMark: React.FC<{ size?: number }> = ({ size = 240 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const pop = spring({ frame, fps, config: { damping: 13, mass: 0.7 } });
  const scale = interpolate(pop, [0, 1], [0.6, 1]);
  const opacity = interpolate(frame, [0, 14], [0, 1], {
    extrapolateRight: "clamp",
  });
  const float = Math.sin(frame * 0.05) * 6;
  const glow = interpolate(frame, [6, 28], [0, 26], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <Img
      src={staticFile("logo-cbrio-icon.png")}
      style={{
        width: size,
        height: size,
        opacity,
        transform: `scale(${scale}) translateY(${float}px)`,
        filter: `drop-shadow(0 0 ${glow}px ${COLORS.primary}) drop-shadow(0 18px 40px rgba(0,0,0,0.4))`,
      }}
    />
  );
};

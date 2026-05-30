import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS } from "../theme";

// Desenha o traço do logo CBRio (stroke-dashoffset) e dá um "pop" final.
export const LogoReveal: React.FC<{ size?: number }> = ({ size = 320 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const PATH_LENGTH = 560; // comprimento aprox. do path

  const draw = interpolate(frame, [6, 60], [PATH_LENGTH, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const pop = spring({ frame: frame - 55, fps, config: { damping: 12 } });
  const scale = interpolate(pop, [0, 1], [0.92, 1]);
  const glow = interpolate(frame, [55, 75], [0, 22], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      fill="none"
      stroke={COLORS.primaryLight}
      strokeWidth={22}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        transform: `scale(${scale})`,
        filter: `drop-shadow(0 0 ${glow}px ${COLORS.primary})`,
      }}
    >
      <path
        d="M 40 78 C 40 50, 72 42, 100 72 C 128 42, 160 50, 160 80 C 160 112, 118 142, 100 160 L 138 188"
        strokeDasharray={PATH_LENGTH}
        strokeDashoffset={draw}
      />
    </svg>
  );
};

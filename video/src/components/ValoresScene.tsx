import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, FONT, VALORES } from "../theme";

// Os 5 valores da jornada entram em cascata (stagger).
export const ValoresScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 26,
      }}
    >
      {VALORES.map((valor, i) => {
        const delay = i * 7;
        const enter = spring({
          frame: frame - delay,
          fps,
          config: { damping: 16 },
        });
        const opacity = interpolate(enter, [0, 1], [0, 1]);
        const x = interpolate(enter, [0, 1], [-60, 0]);

        return (
          <div
            key={valor}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 24,
              opacity,
              transform: `translateX(${x}px)`,
            }}
          >
            <div
              style={{
                width: 18,
                height: 18,
                borderRadius: "50%",
                background: COLORS.primary,
                boxShadow: `0 0 18px ${COLORS.primary}`,
              }}
            />
            <span
              style={{
                fontFamily: FONT,
                fontSize: 58,
                fontWeight: 600,
                color: COLORS.text,
              }}
            >
              {valor}
            </span>
          </div>
        );
      })}
    </div>
  );
};

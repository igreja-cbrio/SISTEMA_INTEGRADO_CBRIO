import { AbsoluteFill, useCurrentFrame } from "remotion";
import { COLORS } from "../theme";

// Fundo com gradiente da marca + círculos suaves flutuando (parallax leve).
export const Background: React.FC = () => {
  const frame = useCurrentFrame();

  const blobs = [
    { x: 18, y: 25, r: 380, speed: 0.18, opacity: 0.16 },
    { x: 82, y: 70, r: 460, speed: -0.12, opacity: 0.13 },
    { x: 60, y: 18, r: 240, speed: 0.26, opacity: 0.1 },
    { x: 30, y: 82, r: 300, speed: -0.2, opacity: 0.12 },
  ];

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 35%, ${COLORS.bgTo}, ${COLORS.bgFrom})`,
      }}
    >
      {blobs.map((b, i) => {
        const drift = Math.sin((frame + i * 40) * 0.02) * 30;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${b.x}%`,
              top: `${b.y}%`,
              width: b.r,
              height: b.r,
              marginLeft: -b.r / 2,
              marginTop: -b.r / 2,
              borderRadius: "50%",
              background: COLORS.primary,
              opacity: b.opacity,
              filter: "blur(90px)",
              transform: `translateY(${frame * b.speed + drift}px)`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

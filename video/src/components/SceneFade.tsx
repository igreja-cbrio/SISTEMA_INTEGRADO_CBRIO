import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

// Centraliza o conteúdo e aplica fade in/out nas bordas da cena.
export const SceneFade: React.FC<{
  durationInFrames: number;
  fade?: number;
  children: React.ReactNode;
}> = ({ durationInFrames, fade = 12, children }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(
    frame,
    [0, fade, durationInFrames - fade, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        opacity,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

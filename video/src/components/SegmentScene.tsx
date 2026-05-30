import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { COLORS, FONT } from "../theme";
import { CameraVideo, type CamKey } from "./CameraVideo";

export type Segment = {
  key: string;
  src: string;
  srcStart: number; // segundos na gravação original
  dur: number; // segundos do trecho
  index: number;
  kicker: string; // ex "01 / 06"
  label: string;
  cam: CamKey[];
};

const FPS = 30;

export const SegmentScene: React.FC<{ seg: Segment }> = ({ seg }) => {
  const frame = useCurrentFrame();
  const durF = Math.round(seg.dur * FPS);

  // legenda entra e sai
  const capIn = interpolate(frame, [6, 22], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const capOut = interpolate(frame, [durF - 16, durF - 4], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const capOpacity = capIn * capOut;
  const capX = interpolate(capIn, [0, 1], [-50, 0]);

  return (
    <AbsoluteFill>
      <CameraVideo
        src={seg.src}
        trimBeforeFrames={Math.round(seg.srcStart * FPS)}
        cam={seg.cam}
      />

      {/* vinheta cinematográfica */}
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          background:
            "radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 52%, rgba(4,18,16,0.55) 100%)",
        }}
      />

      {/* legenda inferior esquerda */}
      <div
        style={{
          position: "absolute",
          left: 90,
          bottom: 96,
          opacity: capOpacity,
          transform: `translateX(${capX}px)`,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            fontFamily: FONT,
            fontSize: 24,
            fontWeight: 700,
            color: COLORS.primaryLight,
            letterSpacing: 4,
          }}
        >
          <span
            style={{
              width: 46,
              height: 4,
              borderRadius: 4,
              background: COLORS.primary,
              display: "inline-block",
            }}
          />
          {seg.kicker}
        </div>
        <div
          style={{
            fontFamily: FONT,
            fontSize: 60,
            fontWeight: 800,
            color: COLORS.text,
            lineHeight: 1.04,
            textShadow: "0 6px 30px rgba(0,0,0,0.6)",
            maxWidth: 1100,
          }}
        >
          {seg.label}
        </div>
      </div>
    </AbsoluteFill>
  );
};

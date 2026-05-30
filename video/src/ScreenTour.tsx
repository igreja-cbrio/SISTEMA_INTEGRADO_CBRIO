import {
  AbsoluteFill,
  interpolate,
  Sequence,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Background } from "./components/Background";
import { LogoReveal } from "./components/LogoReveal";
import { OutroScene } from "./components/OutroScene";
import { SceneFade } from "./components/SceneFade";
import { SegmentScene, type Segment } from "./components/SegmentScene";
import { COLORS, FONT } from "./theme";

const FPS = 30;
export const TOUR_INTRO_F = 70;
export const TOUR_OUTRO_F = 80;
const REC = "footage/recording.mp4";

// Trechos escolhidos da gravação (sem as partes de loading/transição).
export const TOUR_SEGMENTS: Omit<Segment, "index">[] = [
  {
    key: "dashboard",
    src: REC,
    srcStart: 8,
    dur: 6,
    kicker: "01 / 06",
    label: "Painel · Cultura CBRio",
    cam: [
      { f: 0, fx: 0.5, fy: 0.45, z: 1.5 },
      { f: 180, fx: 0.5, fy: 0.6, z: 1.95 },
    ],
  },
  {
    key: "semanal",
    src: REC,
    srcStart: 18,
    dur: 7,
    kicker: "02 / 06",
    label: "Dashboard semanal · frequência & arrecadação",
    cam: [
      { f: 0, fx: 0.5, fy: 0.5, z: 1.5 },
      { f: 110, fx: 0.5, fy: 0.5, z: 1.85 },
      { f: 210, fx: 0.5, fy: 0.62, z: 1.9 },
    ],
  },
  {
    key: "online",
    src: REC,
    srcStart: 60,
    dur: 7,
    kicker: "03 / 06",
    label: "Online · performance por culto",
    cam: [
      { f: 0, fx: 0.45, fy: 0.45, z: 1.5 },
      { f: 210, fx: 0.4, fy: 0.62, z: 1.95 },
    ],
  },
  {
    key: "financeiro",
    src: REC,
    srcStart: 72,
    dur: 8,
    kicker: "04 / 06",
    label: "Financeiro · visão do mês",
    cam: [
      { f: 0, fx: 0.5, fy: 0.42, z: 1.5 },
      { f: 120, fx: 0.5, fy: 0.52, z: 1.8 },
      { f: 240, fx: 0.4, fy: 0.62, z: 1.92 },
    ],
  },
  {
    key: "rh",
    src: REC,
    srcStart: 88,
    dur: 7,
    kicker: "05 / 06",
    label: "RH · diretório de colaboradores",
    cam: [
      { f: 0, fx: 0.5, fy: 0.42, z: 1.5 },
      { f: 90, fx: 0.57, fy: 0.42, z: 1.85 },
      { f: 210, fx: 0.4, fy: 0.6, z: 1.85 },
    ],
  },
  {
    key: "membresia",
    src: REC,
    srcStart: 118,
    dur: 9,
    kicker: "06 / 06",
    label: "Membresia · 1.000 membros",
    cam: [
      { f: 0, fx: 0.5, fy: 0.39, z: 1.6 },
      { f: 140, fx: 0.42, fy: 0.46, z: 1.9 },
      { f: 270, fx: 0.34, fy: 0.56, z: 2.1 },
    ],
  },
];

export const tourDuration = () => {
  const segF = TOUR_SEGMENTS.reduce((acc, s) => acc + Math.round(s.dur * FPS), 0);
  return TOUR_INTRO_F + segF + TOUR_OUTRO_F;
};

const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 16 } });
  const y = interpolate(s, [0, 1], [30, 0]);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 22 }}>
      <LogoReveal size={150} />
      <div
        style={{
          fontFamily: FONT,
          fontSize: 92,
          fontWeight: 800,
          color: COLORS.text,
          transform: `translateY(${y}px)`,
          letterSpacing: -2,
        }}
      >
        Por dentro do CBRio
      </div>
      <div
        style={{
          fontFamily: FONT,
          fontSize: 32,
          fontWeight: 500,
          color: COLORS.primaryLight,
          textTransform: "uppercase",
          letterSpacing: 6,
        }}
      >
        Um tour pelo sistema
      </div>
    </div>
  );
};

const ProgressBar: React.FC<{ total: number }> = ({ total }) => {
  const frame = useCurrentFrame();
  const pct = interpolate(frame, [0, total], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        width: "100%",
        height: 6,
        background: "rgba(255,255,255,0.08)",
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: "100%",
          background: `linear-gradient(90deg, ${COLORS.primaryDark}, ${COLORS.primaryLight})`,
        }}
      />
    </div>
  );
};

export const ScreenTour: React.FC<{ site: string }> = ({ site }) => {
  const total = tourDuration();
  let cursor = TOUR_INTRO_F;

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bgFrom }}>
      <Background />

      <Sequence durationInFrames={TOUR_INTRO_F + 10}>
        <SceneFade durationInFrames={TOUR_INTRO_F + 10}>
          <Intro />
        </SceneFade>
      </Sequence>

      {TOUR_SEGMENTS.map((seg, i) => {
        const durF = Math.round(seg.dur * FPS);
        const from = cursor;
        cursor += durF;
        return (
          <Sequence key={seg.key} from={from} durationInFrames={durF}>
            <SceneFade durationInFrames={durF} fade={9}>
              <SegmentScene seg={{ ...seg, index: i }} />
            </SceneFade>
          </Sequence>
        );
      })}

      <Sequence from={cursor} durationInFrames={TOUR_OUTRO_F}>
        <SceneFade durationInFrames={TOUR_OUTRO_F}>
          <OutroScene site={site} />
        </SceneFade>
      </Sequence>

      <ProgressBar total={total} />
    </AbsoluteFill>
  );
};

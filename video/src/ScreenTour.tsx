import {
  AbsoluteFill,
  interpolate,
  Sequence,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Background } from "./components/Background";
import { LogoMark } from "./components/LogoMark";
import { OutroScene } from "./components/OutroScene";
import { SceneFade } from "./components/SceneFade";
import { SegmentScene, type Segment } from "./components/SegmentScene";
import { COLORS, FONT } from "./theme";

const FPS = 30;
export const TOUR_INTRO_F = 70;
export const TOUR_OUTRO_F = 80;
const REC = "footage/recording.mp4";

// Trechos escolhidos da gravação (sem as partes de loading/transição).
// cam: hx/hy = ponto de destaque (0..1 na TELA recortada · ~onde o cursor age),
// hz = zoom de destaque (1 = tela inteira · sobe pouco pra não cortar).
export const TOUR_SEGMENTS: Omit<Segment, "index">[] = [
  {
    key: "dashboard",
    src: REC,
    srcStart: 8,
    dur: 4,
    kicker: "01 / 07",
    label: "Painel · Cultura CBRio",
    cam: [
      { f: 0, hx: 0.52, hy: 0.5, hz: 1.0 },
      { f: 55, hx: 0.52, hy: 0.6, hz: 1.0 },
      { f: 120, hx: 0.52, hy: 0.66, hz: 1.26 },
    ],
  },
  {
    key: "semanal",
    src: REC,
    srcStart: 17,
    dur: 4.5,
    kicker: "02 / 07",
    label: "Dashboard semanal · frequência & arrecadação",
    cam: [
      { f: 0, hx: 0.52, hy: 0.45, hz: 1.0 },
      { f: 70, hx: 0.5, hy: 0.5, hz: 1.18 },
      { f: 135, hx: 0.5, hy: 0.82, hz: 1.28 },
    ],
  },
  {
    key: "online",
    src: REC,
    srcStart: 60,
    dur: 6,
    kicker: "03 / 07",
    label: "Online · performance por culto",
    cam: [
      { f: 0, hx: 0.46, hy: 0.45, hz: 1.0 },
      { f: 180, hx: 0.42, hy: 0.58, hz: 1.26 },
    ],
  },
  {
    key: "financeiro",
    src: REC,
    srcStart: 72,
    dur: 6,
    kicker: "04 / 07",
    label: "Financeiro · visão do mês",
    cam: [
      { f: 0, hx: 0.5, hy: 0.4, hz: 1.0 },
      { f: 90, hx: 0.4, hy: 0.52, hz: 1.26 },
      { f: 180, hx: 0.29, hy: 0.78, hz: 1.28 },
    ],
  },
  {
    key: "rh",
    src: REC,
    srcStart: 88,
    dur: 4,
    kicker: "05 / 07",
    label: "RH · diretório de colaboradores",
    cam: [
      { f: 0, hx: 0.5, hy: 0.42, hz: 1.0 },
      { f: 70, hx: 0.62, hy: 0.31, hz: 1.26 },
      { f: 120, hx: 0.4, hy: 0.55, hz: 1.24 },
    ],
  },
  {
    key: "integracao",
    src: REC,
    srcStart: 94,
    dur: 6,
    kicker: "06 / 07",
    label: "Integração · cultos & decisões",
    cam: [
      { f: 0, hx: 0.52, hy: 0.4, hz: 1.0 },
      { f: 80, hx: 0.52, hy: 0.22, hz: 1.22 },
      { f: 180, hx: 0.54, hy: 0.62, hz: 1.28 },
    ],
  },
  {
    key: "membresia",
    src: REC,
    srcStart: 120,
    dur: 9,
    kicker: "07 / 07",
    label: "Membresia · 1.000 membros",
    cam: [
      { f: 0, hx: 0.52, hy: 0.32, hz: 1.0 },
      { f: 130, hx: 0.42, hy: 0.4, hz: 1.2 },
      { f: 270, hx: 0.34, hy: 0.55, hz: 1.3 },
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
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 30 }}>
      <LogoMark size={210} />
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

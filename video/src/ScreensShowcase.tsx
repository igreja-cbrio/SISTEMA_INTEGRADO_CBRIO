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
import { ScreenScene, type Screen } from "./components/ScreenScene";
import { COLORS, FONT } from "./theme";

export const INTRO_FRAMES = 70;
export const PER_SCREEN_FRAMES = 95;
export const OUTRO_FRAMES = 85;

export const showcaseDuration = (n: number) =>
  INTRO_FRAMES + n * PER_SCREEN_FRAMES + OUTRO_FRAMES;

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
          fontSize: 96,
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
          fontSize: 34,
          fontWeight: 500,
          color: COLORS.primaryLight,
          textTransform: "uppercase",
          letterSpacing: 6,
        }}
      >
        O sistema integrado da igreja
      </div>
    </div>
  );
};

export type ScreensShowcaseProps = {
  screens: Screen[];
  site: string;
};

export const ScreensShowcase: React.FC<ScreensShowcaseProps> = ({ screens, site }) => {
  return (
    <AbsoluteFill>
      <Background />

      <Sequence durationInFrames={INTRO_FRAMES + 12}>
        <SceneFade durationInFrames={INTRO_FRAMES + 12}>
          <Intro />
        </SceneFade>
      </Sequence>

      {screens.map((screen, i) => (
        <Sequence
          key={screen.key}
          from={INTRO_FRAMES + i * PER_SCREEN_FRAMES}
          durationInFrames={PER_SCREEN_FRAMES + 12}
        >
          <SceneFade durationInFrames={PER_SCREEN_FRAMES + 12} fade={10}>
            <ScreenScene
              screen={screen}
              durationInFrames={PER_SCREEN_FRAMES + 12}
              index={i}
              total={screens.length}
            />
          </SceneFade>
        </Sequence>
      ))}

      <Sequence
        from={INTRO_FRAMES + screens.length * PER_SCREEN_FRAMES}
        durationInFrames={OUTRO_FRAMES}
      >
        <SceneFade durationInFrames={OUTRO_FRAMES}>
          <OutroScene site={site} />
        </SceneFade>
      </Sequence>
    </AbsoluteFill>
  );
};

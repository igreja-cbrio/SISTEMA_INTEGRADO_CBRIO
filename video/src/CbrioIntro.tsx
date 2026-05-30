import { AbsoluteFill, Sequence } from "remotion";
import { Background } from "./components/Background";
import { LogoReveal } from "./components/LogoReveal";
import { TitleScene } from "./components/TitleScene";
import { ValoresScene } from "./components/ValoresScene";
import { OutroScene } from "./components/OutroScene";
import { SceneFade } from "./components/SceneFade";

export type CbrioIntroProps = {
  titulo: string;
  subtitulo: string;
  site: string;
};

export const CbrioIntro: React.FC<CbrioIntroProps> = ({
  titulo,
  subtitulo,
  site,
}) => {
  return (
    <AbsoluteFill>
      <Background />

      <Sequence durationInFrames={105}>
        <SceneFade durationInFrames={105}>
          <LogoReveal size={340} />
        </SceneFade>
      </Sequence>

      <Sequence from={95} durationInFrames={120}>
        <SceneFade durationInFrames={120}>
          <TitleScene titulo={titulo} subtitulo={subtitulo} />
        </SceneFade>
      </Sequence>

      <Sequence from={200} durationInFrames={120}>
        <SceneFade durationInFrames={120}>
          <ValoresScene />
        </SceneFade>
      </Sequence>

      <Sequence from={305} durationInFrames={85}>
        <SceneFade durationInFrames={85}>
          <OutroScene site={site} />
        </SceneFade>
      </Sequence>
    </AbsoluteFill>
  );
};

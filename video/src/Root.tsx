import { Composition } from "remotion";
import { CbrioIntro } from "./CbrioIntro";

// Parâmetros globais do vídeo.
export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
export const DURATION_IN_FRAMES = 13 * FPS; // 13 segundos

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="CbrioIntro"
      component={CbrioIntro}
      durationInFrames={DURATION_IN_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={{
        titulo: "CBRio",
        subtitulo: "Comunidade Batista do Rio",
        site: "cbrio.com.br",
      }}
    />
  );
};

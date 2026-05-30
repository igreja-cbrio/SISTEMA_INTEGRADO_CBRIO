import { Composition } from "remotion";
import { CbrioIntro } from "./CbrioIntro";
import { ScreensShowcase, showcaseDuration } from "./ScreensShowcase";
import { ScreenTour, tourDuration } from "./ScreenTour";
import type { Screen } from "./components/ScreenScene";
import manifest from "./screens-manifest.json";

// Parâmetros globais do vídeo.
export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
export const DURATION_IN_FRAMES = 13 * FPS; // 13 segundos

const SCREENS = manifest.screens as Screen[];

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* Intro institucional (logo + valores) */}
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

      {/* Tour pelas telas do sistema (consome video/public/screens/*.png) */}
      <Composition
        id="ScreensShowcase"
        component={ScreensShowcase}
        durationInFrames={showcaseDuration(SCREENS.length)}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{
          screens: SCREENS,
          site: "cbrio.com.br",
        }}
      />

      {/* Tour animado em cima da gravação de tela (zoom nos cliques) */}
      <Composition
        id="ScreenTour"
        component={ScreenTour}
        durationInFrames={tourDuration()}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{ site: "cbrio.com.br" }}
      />
    </>
  );
};

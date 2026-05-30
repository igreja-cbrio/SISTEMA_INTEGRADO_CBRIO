# CBRio · Vídeo institucional (Remotion)

Projeto de vídeo feito em React com [Remotion](https://www.remotion.dev).
Renderiza um intro institucional da CBRio (logo animado → título → os 5
valores da jornada → chamada final) em 1080p.

## Como usar

Depois de **descompactar** e **entrar na pasta**:

```bash
npm install        # instala as dependências
npm run dev        # abre o Remotion Studio no navegador (preview ao vivo)
npm run render     # gera out/video.mp4
```

> O `npm run render` baixa um Chromium headless na primeira execução
> (alguns MB) — é normal demorar um pouco da primeira vez.

### Outros comandos

```bash
npm run still      # exporta um frame estático em out/poster.png
npm run upgrade    # atualiza o Remotion para a versão mais recente
```

## Estrutura

```
video/
├── package.json          scripts dev / render / still
├── remotion.config.ts    config de saída (H.264, CRF 18, 1080p)
├── src/
│   ├── index.ts          registerRoot
│   ├── Root.tsx          define a Composition "CbrioIntro" (1920x1080, 30fps, 13s)
│   ├── CbrioIntro.tsx     orquestra as cenas (Sequences + fades)
│   ├── theme.ts          paleta da marca (#00B39D) e os 5 valores
│   └── components/        Background, LogoReveal, TitleScene, ValoresScene, OutroScene
└── public/               logo da CBRio
```

## Personalização rápida

- **Texto** (título / subtítulo / site): `defaultProps` em `src/Root.tsx`
  — ou edite ao vivo no painel direito do Remotion Studio (`npm run dev`).
- **Duração**: `DURATION_IN_FRAMES` em `src/Root.tsx` (e os `from` /
  `durationInFrames` das `Sequence` em `src/CbrioIntro.tsx`).
- **Cores**: `src/theme.ts`.
- **Resolução / FPS**: `WIDTH`, `HEIGHT`, `FPS` em `src/Root.tsx`.

## Renderizar em outro formato

```bash
# vertical 1080x1920 (Reels/Stories) — ajuste WIDTH/HEIGHT em Root.tsx, ou:
npx remotion render CbrioIntro out/video.webm --codec=vp8
npx remotion render CbrioIntro out/quadrado.mp4 --width=1080 --height=1080
```

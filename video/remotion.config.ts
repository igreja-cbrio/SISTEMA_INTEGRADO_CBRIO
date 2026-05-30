import { Config } from "@remotion/cli/config";

// Saída em alta qualidade (1080p, H.264).
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setConcurrency(null); // usa todos os núcleos disponíveis
Config.setCodec("h264");
Config.setCrf(16); // menor = mais nitidez (arquivo maior)
Config.setJpegQuality(100); // qualidade máxima dos frames intermediários

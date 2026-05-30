import { Config } from "@remotion/cli/config";

// Saída em alta qualidade (1080p, H.264).
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setConcurrency(null); // usa todos os núcleos disponíveis
Config.setCodec("h264");
Config.setCrf(18); // 18 = quase sem perdas; quanto maior, menor o arquivo

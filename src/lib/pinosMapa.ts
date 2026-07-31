// Pinos empilhados no mapa de grupos.
//
// Grupo presencial cujo logradouro o Nominatim não acha cai no CENTRÓIDE DO
// BAIRRO (3º fallback do `/grupos/geocode-batch`, por desenho — pino aproximado
// no bairro certo é melhor que grupo invisível). Consequência: N grupos ficam
// com a coordenada IDÊNTICA, os pinos se sobrepõem e o mapa parece ter um grupo
// só. Medido em 31/07/2026: 19 grupos em 5 pontos, o maior com 7 na Barra.
//
// Enquanto o cadastro não tiver CEP (decisão do Marcos 31/07: "não vou ter o
// CEP dessas pessoas, consegue separar um pouco... depois fazemos um
// levantamento cadastral"), espalhamos os pinos numa roseta em volta do ponto
// real: cada grupo fica clicável e continua no bairro certo.
//
// ⚠️ É só EXIBIÇÃO — `mem_grupos.lat/lng` NÃO é tocado. A coordenada guardada
// segue honesta ("centro do bairro"); gravar precisão inventada faria o
// levantamento cadastral futuro perder a distinção entre endereço real e chute.
// ⚠️ Ordena por id → cada grupo cai SEMPRE na mesma posição. Pino que dança a
// cada refresh é pior que pino empilhado (a pessoa perde o que já tinha achado).
//
// Vive em `src/lib` (e não no componente do mapa) porque o componente importa
// maplibre-gl, que não carrega em jsdom — função pura em lib é testável.

/** ~meia quadra: separa no zoom do bairro sem sair dele. */
const PIN_RAIO_M = 45;
const PIN_POR_ANEL = 6;

export interface PinoEspalhavel {
  id: string;
  lat?: number | null;
  lng?: number | null;
  /** Só EXIBIÇÃO: pino deslocado por compartilhar coordenada com outros. */
  pinoAproximado?: boolean;
}

/** Ângulo inicial derivado da coordenada: dois aglomerados não ficam idênticos. */
function faseDaChave(chave: string): number {
  let h = 0;
  for (let i = 0; i < chave.length; i++) h = (h * 31 + chave.charCodeAt(i)) | 0;
  return ((((h % 360) + 360) % 360) * Math.PI) / 180;
}

export function espalharPinosSobrepostos<T extends PinoEspalhavel>(gs: T[]): T[] {
  const porPonto = new Map<string, T[]>();
  for (const g of gs) {
    // 5 casas decimais ≈ 1 m: só agrupa o que é de fato o mesmo ponto.
    const chave = `${Number(g.lat).toFixed(5)},${Number(g.lng).toFixed(5)}`;
    const lista = porPonto.get(chave);
    if (lista) lista.push(g);
    else porPonto.set(chave, [g]);
  }

  const saida: T[] = [];
  for (const [chave, lista] of porPonto) {
    if (lista.length === 1) {
      saida.push(lista[0]);
      continue;
    }
    const fase = faseDaChave(chave);
    const ordenados = [...lista].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    ordenados.forEach((g, i) => {
      const anel = Math.floor(i / PIN_POR_ANEL) + 1;
      const nesteAnel = Math.min(PIN_POR_ANEL, ordenados.length - (anel - 1) * PIN_POR_ANEL);
      const idxNoAnel = i % PIN_POR_ANEL;
      const ang = fase + (anel - 1) * 0.5 + (2 * Math.PI * idxNoAnel) / Math.max(nesteAnel, 1);
      const raio = PIN_RAIO_M * anel;
      const lat = Number(g.lat);
      const dLat = (raio * Math.sin(ang)) / 111320;
      // cos(lat) encolhe o grau de longitude conforme sobe a latitude; o piso
      // de 0.1 evita divisão por ~0 perto dos polos (defensivo, não é o Rio).
      const dLng = (raio * Math.cos(ang)) / (111320 * Math.max(Math.cos((lat * Math.PI) / 180), 0.1));
      saida.push({ ...g, lat: lat + dLat, lng: Number(g.lng) + dLng, pinoAproximado: true });
    });
  }
  return saida;
}

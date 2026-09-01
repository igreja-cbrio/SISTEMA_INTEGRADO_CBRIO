// O que a barra de progresso de uma campanha DIZ, além do número.
//
// ⚠️⚠️ O problema que isto resolve: uma barra em **0%** é ambígua e a leitura
// errada é a mais natural. "R$ 0 de R$ 500.000" se lê como *"ninguém doou"*,
// quando pode significar *"a arrecadação abre semana que vem"*. Medido em
// 31/08/2026 na campanha Reforma do Espaço Kids: `ativa`, meta R$ 500 mil,
// janela 01/09→31/10, arrecadado R$ 0 — ou seja, exatamente esse caso, no dia em
// que a barra entrou na tela.
//
// Régua PURA (sem rede, sem relógio próprio — `hoje` é INJETADO).

export type EstadoCampanha = 'arrecadando' | 'antes' | 'depois' | 'nao_ativa' | 'indefinido';

export type CampanhaBarra = {
  nome?: string | null;
  status?: string | null;
  no_ar?: boolean | null;
  data_inicio?: string | null;
  data_fim?: string | null;
  data_lancamento?: string | null;
  publica?: boolean | null;
  total_centavos?: number | null;
  meta_centavos?: number | null;
};

/** Data ISO (`YYYY-MM-DD`) → dia comparável, sem passar por fuso. */
function dia(iso?: string | null): string | null {
  if (typeof iso !== 'string') return null;
  const t = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

/**
 * O "hoje" do fuso da igreja.
 *
 * ⚠️⚠️ MORA AQUI, e não na tela, porque é ELE o ponto onde o fuso morde — a
 * comparação de duas strings `YYYY-MM-DD` lá embaixo é equivalente a comparar
 * timestamps UTC, então o risco nunca esteve nela. Com
 * `new Date().toISOString().slice(0,10)` (UTC), das 21h do Rio em diante o dia
 * já virou: em 31/08 às 21h a barra diria que a campanha de 01/09 **já abriu**.
 * Deixar isto na tela era deixar a única guarda de fuso fora do teste.
 */
export function hojeBrt(agora: Date = new Date()): string {
  // `en-CA` devolve `YYYY-MM-DD`, que é o formato que o resto da régua compara.
  return agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

// ⚠️ Comparação de datas como STRING `YYYY-MM-DD`, nunca com `new Date(iso)`:
// a string sem horário é meia-noite UTC, que no Rio é 21h do dia ANTERIOR — a
// barra diria "já começou" no fim da tarde do dia de antes. É a armadilha do
// rodízio de supervisão, da curva do censo e do "culto de agora".
export function estadoDaCampanha(c: CampanhaBarra, hoje: string): EstadoCampanha {
  const h = dia(hoje);
  if (h === null) return 'indefinido';
  if (c?.status !== 'ativa') return 'nao_ativa';
  const ini = dia(c?.data_inicio);
  const fim = dia(c?.data_fim);
  if (ini !== null && h < ini) return 'antes';
  if (fim !== null && h > fim) return 'depois';
  return 'arrecadando';
}

function dataBr(iso?: string | null): string | null {
  const d = dia(iso);
  if (d === null) return null;
  const [a, m, x] = d.split('-');
  return `${x}/${m}/${a}`;
}

export type AvisoBarra = { tom: 'ambar' | 'neutro'; texto: string };

/**
 * Os avisos que acompanham o número. Ordem = ordem de importância na tela.
 *
 * ⚠️ Aviso é o que impede o número de mentir, então ele NÃO é opcional quando o
 * estado não é "arrecadando": sem ele, 0% num card com meta de meio milhão
 * parece fracasso de campanha em vez de campanha que ainda não abriu.
 */
export function avisosDaBarra(c: CampanhaBarra, hoje: string): AvisoBarra[] {
  const avisos: AvisoBarra[] = [];
  const estado = estadoDaCampanha(c, hoje);
  const semDinheiro = Number(c?.total_centavos || 0) <= 0;

  if (estado === 'antes') {
    const quando = dataBr(c?.data_inicio);
    avisos.push({
      tom: 'ambar',
      texto: quando
        // ⚠️⚠️ A frase diz que o zero NÃO é resultado. É o ponto todo do módulo.
        ? `A arrecadação abre em ${quando} — o valor ainda não é resultado da campanha.`
        : 'A arrecadação ainda não abriu — o valor ainda não é resultado da campanha.',
    });
  } else if (estado === 'depois') {
    const quando = dataBr(c?.data_fim);
    avisos.push({
      tom: 'neutro',
      texto: quando ? `A janela de arrecadação fechou em ${quando}.` : 'A janela de arrecadação já fechou.',
    });
  } else if (estado === 'nao_ativa') {
    // ⚠️⚠️ Enquanto a campanha não está `ativa`, `camp_digitos_ativos()` NÃO
    // devolve o dígito dela: doação que chegar com aquele centavo NÃO é
    // identificada. A barra ficaria em zero para sempre e ninguém saberia por quê.
    avisos.push({
      tom: 'ambar',
      texto: c?.status === 'pausada'
        ? 'Campanha pausada — o dígito não está identificando doação.'
        : 'Campanha ainda não ativada — o dígito não está identificando doação.',
    });
  } else if (estado === 'arrecadando' && semDinheiro) {
    // Arrecadando e zerado é diferente de "não abriu": aqui o zero É resultado,
    // e a tela pode dizer isso sem rodeio.
    avisos.push({ tom: 'neutro', texto: 'Arrecadação aberta e nenhuma doação identificada ainda.' });
  }

  // ⚠️ `publica = false` não é erro: é a campanha existindo no sistema antes de
  // ir pras telas do culto. Mas precisa estar DITO, senão alguém apresenta este
  // número achando que a igreja já o está vendo.
  if (c?.publica !== true) {
    avisos.push({ tom: 'neutro', texto: 'Ainda não aparece nas telas do culto.' });
  }

  return avisos;
}

/** Rótulo curto do estado, pro selo ao lado do nome. */
export function seloDoEstado(c: CampanhaBarra, hoje: string): string {
  switch (estadoDaCampanha(c, hoje)) {
    case 'arrecadando': return 'Arrecadando';
    case 'antes': return 'Ainda não abriu';
    case 'depois': return 'Encerrada';
    case 'nao_ativa': return c?.status === 'pausada' ? 'Pausada' : 'Não ativada';
    default: return '—';
  }
}

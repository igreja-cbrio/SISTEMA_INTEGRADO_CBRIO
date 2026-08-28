// ============================================================================
// utils/volDisponibilidade · "esta pessoa pode ser escalada NESTE culto?"
// ============================================================================
// Régua PURA (sem banco, sem rede, sem relógio) — mora em `utils/` pra entrar no
// gate de deploy. Quem lê `vol_availability` é `routes/voluntariado.js`.
//
// ⚠️⚠️ SÃO DOIS MODELOS DE INDISPONIBILIDADE NA MESMA TABELA, e ler só um é o
// bug que este arquivo existe pra impedir de voltar (já aconteceu em 07/08/2026):
//
//   · por CULTO   → `service_id` preenchido. É o chip que o voluntário marca na
//                   tela "minha disponibilidade" e o que a coordenação marca.
//   · por PERÍODO → `service_id` NULL + `unavailable_from/to`. É o que o APP
//                   grava quando a pessoa diz "viajo de 20 a 31/08".
//
// Naquele incidente o painel da coordenação lia só o primeiro e o `auto-fill`
// lia só o segundo: **o gerador automático e a tela de escalar na mão
// discordavam sobre a mesma pessoa no mesmo culto**, e quem escalava pela tela
// não tinha como saber. Régua única resolve por construção.
//
// ⚠️ O modelo é NEGATIVO: a tabela guarda AUSÊNCIA, nunca "estou disponível".
// Então "disponível" é o DEFAULT — ausência de registro significa que pode ser
// escalado. Inverter isso (exigir declaração positiva) esvaziaria toda escala,
// porque ninguém nunca declarou disponibilidade neste sistema.
// ============================================================================

/** Data do culto (timestamptz) → 'YYYY-MM-DD' no fuso da igreja (BRT). */
// ⚠️ NÃO usar toISOString().slice(0,10): das 21h BRT em diante o dia UTC já
// virou, e o culto de domingo 19:00 cairia na segunda-feira — comparando contra
// uma faixa de férias que termina no domingo, a pessoa apareceria como
// disponível. É a mesma armadilha do "dia em UTC" já registrada no Kids.
function diaBRT(quando) {
  if (!quando) return null;
  const d = quando instanceof Date ? quando : new Date(quando);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

/**
 * A pessoa está INDISPONÍVEL neste culto?
 *
 * @param {object} alvo            { serviceId, dia }  — `dia` em 'YYYY-MM-DD' BRT
 * @param {Array}  linhas          linhas de `vol_availability` DA PESSOA
 * @returns {{indisponivel: boolean, origem: 'culto'|'periodo'|null, motivo: string|null}}
 */
function avaliarIndisponibilidade(alvo = {}, linhas = []) {
  const { serviceId, dia } = alvo;
  const lista = Array.isArray(linhas) ? linhas : [];

  // 1 · Bloqueio explícito DESTE culto. Vence qualquer outra leitura: é a
  //     pessoa falando do culto específico, não de uma janela genérica.
  for (const l of lista) {
    if (l && l.service_id && serviceId && l.service_id === serviceId) {
      return { indisponivel: true, origem: 'culto', motivo: l.reason || null };
    }
  }

  // 2 · Faixa de datas (férias/viagem). Só entra quando há dia pra comparar —
  //     sem data do culto não dá pra afirmar sobreposição, e afirmar sem base
  //     bloquearia gente disponível.
  if (dia) {
    for (const l of lista) {
      if (!l || l.service_id) continue;
      const de = l.unavailable_from;
      const ate = l.unavailable_to;
      if (!de || !ate) continue;
      // Comparação de string ISO é segura: 'YYYY-MM-DD' ordena como data.
      if (de <= dia && dia <= ate) {
        return { indisponivel: true, origem: 'periodo', motivo: l.reason || null };
      }
    }
  }

  return { indisponivel: false, origem: null, motivo: null };
}

/** Frase pra tela/erro. Nunca expõe o motivo cru sem rótulo. */
function textoIndisponibilidade({ origem, motivo } = {}) {
  if (!origem) return null;
  const base = origem === 'culto'
    ? 'marcou que não pode neste culto'
    : 'está com ausência registrada nesta data';
  return motivo ? `${base} (${motivo})` : base;
}

/**
 * Agrupa linhas de `vol_availability` por pessoa.
 * ⚠️ A chave é `volunteer_profile_id` OU `planning_center_person_id` — a tabela
 * admite só um dos dois (CHECK da migration 20260415100000), e o `auto-fill`
 * antigo montava a chave concatenando os dois, o que **não casava** com quem
 * tinha só um lado preenchido. Aqui cada identificador vira sua própria chave.
 */
function indexarPorPessoa(linhas = []) {
  const mapa = new Map();
  const add = (k, l) => {
    if (!k) return;
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k).push(l);
  };
  for (const l of Array.isArray(linhas) ? linhas : []) {
    if (!l) continue;
    add(l.volunteer_profile_id, l);
    add(l.planning_center_person_id, l);
  }
  return mapa;
}

/**
 * Esse "voluntário" é uma PESSOA que dá pra escalar?
 *
 * ⚠️ `vol_profiles` veio 99% do import do Planning Center e carrega conta de
 * sistema e lixo de cadastro. O print da tela de montar escala em 13/08 trazia
 * ". f" e "ADM CBRio" entre os 860 candidatos, em ordem alfabética, disputando
 * espaço com gente de verdade.
 *
 * Recusa: vazio, nome de 1 caractere, nome sem nenhuma letra ("." / ". f"),
 * conta administrativa/técnica declarada, e o placeholder do import financeiro
 * (espelha `membroMatch.ehNomePlaceholder`).
 *
 * ⚠️ Deliberadamente CONSERVADOR: na dúvida, é pessoa. Esconder um voluntário
 * real da lista de escalar é pior que deixar uma conta de sistema aparecer —
 * a conta é ignorada num relance, a pessoa ausente ninguém percebe.
 */
const CONTAS_SISTEMA = /^(adm|admin|administra(c|ç)(a|ã)o|teste|test|totem|sistema|suporte)\b/i;

function ehPessoaEscalavel(nome) {
  const n = String(nome || '').trim();
  if (n.length < 2) return false;
  // Precisa de pelo menos 2 letras (cobre ". f", "-", "1", "a")
  const letras = n.replace(/[^\p{L}]/gu, '');
  if (letras.length < 2) return false;
  if (CONTAS_SISTEMA.test(n)) return false;
  if (/^contribuinte\b/i.test(n)) return false;
  return true;
}

module.exports = {
  diaBRT,
  avaliarIndisponibilidade,
  textoIndisponibilidade,
  indexarPorPessoa,
  ehPessoaEscalavel,
};

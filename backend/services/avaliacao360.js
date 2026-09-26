// Avaliação 360 · resolução de identidade, plano de coleta e convites.
//
// ⚠️⚠️ A PORTA DESTE MÓDULO NÃO PODE VIVER ATRÁS DO GATE DO RH.
// `backend/routes/rh.js:52` faz `router.use(authenticate, authorizeModule('rh'))`
// e o default de `authorizeModule` é nível 2 — medido em 16/09, **apenas 3
// cargos** alcançam (Dir RH, Coord Estratégico, Coord Financeiro). Numa 360
// TODO funcionário responde. Se o formulário ficasse ali, ninguém avaliaria
// ninguém, e o defeito só apareceria com o ciclo já anunciado.
//
// Por isso `routes/avaliacao360.js` é montado fora daquele gate, com
// `authenticate` + `apenasColaborador`, e o funcionário é resolvido pelo
// PRÓPRIO login — nunca por id vindo do corpo da requisição.
const { supabase } = require('../utils/supabase');
const {
  PAPEIS, planoDeColeta, podeColetarPapel, normalizarPiso,
} = require('../utils/avaliacaoAnonimato');

/**
 * Quem é o funcionário por trás deste login.
 *
 * ⚠️⚠️ Espelha `current_user_funcionario_id()` do SQL, que casa
 * `auth.users.email` com `rh_funcionarios.email`. Essa função decide **quem
 * responde por quem e quem lê o quê** — então a ambiguidade não pode ser
 * resolvida por sorte.
 *
 * E ela EXISTE: medido em 16/09, `pedro.barreto@cbrio.org` tem 2 linhas em
 * `rh_funcionarios` (a mesma pessoa, uma ativa e uma inativa). Hoje acerta
 * **por acidente**, porque o filtro de status descarta a inativa. No dia em
 * que houver duas ATIVAS, um `limit 1` sem ordem devolveria qualquer uma.
 *
 * ⇒ Duas ativas com o mesmo e-mail é ERRO DECLARADO, não escolha silenciosa.
 * Devolve { funcionario, erro }.
 */
async function funcionarioDoLogin(req) {
  const email = String(req?.user?.email || '').trim().toLowerCase();
  if (!email) return { funcionario: null, erro: 'sem_email' };

  const { data, error } = await supabase
    .from('rh_funcionarios')
    .select('id, nome, email, area, cargo, gestor_id, status')
    .eq('status', 'ativo')
    .is('deleted_at', null)
    // PostgREST transforma * em %: para um * literal, buscamos um caractere
    // e a comparação literal abaixo descarta qualquer candidato diferente.
    .ilike('email', email.replace(/[\\%_]/g, '\\$&').replace(/\*/g, '_'));

  // ⚠️ Falha de consulta NUNCA vira "não é funcionário" — isso trancaria a
  // pessoa fora do próprio ciclo por instabilidade de banco.
  if (error) return { funcionario: null, erro: 'consulta_falhou' };
  // A comparação final é literal: curingas de ILIKE não decidem identidade.
  const candidatos = (data || []).filter((f) => String(f.email || '').trim().toLowerCase() === email);
  if (candidatos.length === 0) return { funcionario: null, erro: 'nao_e_funcionario' };
  if (candidatos.length > 1) return { funcionario: null, erro: 'email_ambiguo' };
  return { funcionario: candidatos[0], erro: null };
}

/**
 * Quantas pessoas PODERIAM avaliar `avaliado` em cada papel.
 *
 * ⚠️ `par` é a área, mas só como UNIVERSO de elegíveis — quem de fato é
 * convidado sai da indicação do avaliado, limitada por `max_pares`. Medido em
 * 16/09: com par = área inteira o ciclo gera **741 convites (16,1 formulários
 * por pessoa)** e não fecha; com até 3 escolhidos são **256 (5,6)**.
 */
async function elegiveisPorPapel(avaliado, ativos) {
  const mesmaArea = ativos.filter(
    (f) => f.id !== avaliado.id && (f.area || null) === (avaliado.area || null),
  );
  const liderados = ativos.filter((f) => f.id !== avaliado.id && f.gestor_id === avaliado.id);
  return {
    auto: 1,
    gestor: ativos.some((f) => f.id !== avaliado.id && f.id === avaliado.gestor_id) ? 1 : 0,
    par: mesmaArea.length,
    liderado: liderados.length,
  };
}

async function listarAtivos() {
  // ⚠️ Cap de 1000 do PostgREST: 46 pessoas hoje, mas leitura que cresce com o
  // uso vai paginada por princípio.
  const todos = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from('rh_funcionarios')
      .select('id, nome, email, area, cargo, gestor_id')
      .eq('status', 'ativo')
      .is('deleted_at', null)
      .order('id')
      .range(offset, offset + 999);
    if (error) throw new Error(`falha ao ler funcionários: ${error.message}`);
    if (!data || data.length === 0) break;
    todos.push(...data);
    if (data.length < 1000) break;
  }
  return todos;
}

/**
 * O retrato do ciclo ANTES de convidar ninguém: para cada pessoa, que papéis
 * serão coletados e quais ficam de fora, com o motivo.
 *
 * ⚠️ É isto que a tela do RH mostra antes de abrir o ciclo. Sem ver o retrato,
 * a coordenação só descobre que 4 gestores não receberão feedback ascendente
 * depois de o ciclo já ter sido anunciado para a equipe.
 */
async function retratoDoCiclo(ciclo) {
  const piso = normalizarPiso(ciclo?.piso_respondentes);
  const ativos = await listarAtivos();
  const maxPares = Math.max(1, Math.min(10, Number(ciclo?.max_pares) || 3));
  const linhas = [];
  const resumo = { avaliados: 0, convites_previstos: 0, suprimidos: {} };

  for (const pessoa of ativos) {
    const elegiveis = await elegiveisPorPapel(pessoa, ativos);
    // O piso vale sobre quantos pares podem ser convidados, já limitado pelo teto.
    const plano = planoDeColeta({
      elegiveisPorPapel: { ...elegiveis, par: Math.min(elegiveis.par, maxPares) }, piso,
    });
    const previstos = plano.coletar.reduce((acc, papel) => {
      if (papel === 'par') return acc + Math.min(elegiveis.par, maxPares);
      return acc + elegiveis[papel];
    }, 0);

    resumo.avaliados += 1;
    resumo.convites_previstos += previstos;
    for (const s of plano.suprimidos) {
      resumo.suprimidos[s.papel] = (resumo.suprimidos[s.papel] || 0) + 1;
    }

    linhas.push({
      funcionario_id: pessoa.id,
      nome: pessoa.nome,
      area: pessoa.area || null,
      elegiveis,
      coletar: plano.coletar,
      suprimidos: plano.suprimidos,
      convites_previstos: previstos,
    });
  }

  return { piso, max_pares: maxPares, resumo, linhas };
}

/**
 * Gera convites automáticos: autoavaliação, gestor e liderados acima do piso.
 *
 * Par depende da indicação do avaliado com aprovação do gestor.
 * Liderado depende do piso, e quem está abaixo dele não é
 * convidado — a decisão é ANTES da coleta, não na hora de exibir. Coletar e
 * esconder depois é teatro: o dado fica no banco, e a própria supressão diz de
 * quem era a resposta num gestor de 1 liderado.
 *
 * ⚠️ Idempotente pela UNIQUE (ciclo, avaliado, avaliador, papel) — rodar duas
 * vezes não duplica.
 */
async function gerarConvitesAutomaticos(cicloId) {
  const { data: ciclo, error: errC } = await supabase
    .from('rh_aval360_ciclo')
    .select('id, status, piso_respondentes, max_pares')
    .eq('id', cicloId)
    .is('deleted_at', null)
    .maybeSingle();
  if (errC) throw new Error(`falha ao ler ciclo: ${errC.message}`);
  if (!ciclo) return { ok: false, motivo: 'ciclo_nao_encontrado' };
  // ⚠️ Só em rascunho/indicação: gerar convite com a coleta aberta mudaria o
  // denominador do ciclo no meio do caminho.
  if (!['rascunho', 'indicacao'].includes(ciclo.status)) {
    return { ok: false, motivo: 'ciclo_fora_da_janela', status: ciclo.status };
  }

  const piso = normalizarPiso(ciclo.piso_respondentes);
  const ativos = await listarAtivos();
  const linhas = [];
  const suprimidos = [];

  for (const pessoa of ativos) {
    const elegiveis = await elegiveisPorPapel(pessoa, ativos);

    for (const papel of ['auto', 'gestor', 'liderado']) {
      const d = podeColetarPapel({ papel, elegiveis: elegiveis[papel], piso });
      if (!d.coletar) {
        suprimidos.push({ funcionario_id: pessoa.id, nome: pessoa.nome, papel, motivo: d.motivo });
        continue;
      }
      if (papel === 'auto') {
        linhas.push({ ciclo_id: cicloId, avaliado_id: pessoa.id, avaliador_id: pessoa.id, papel: 'auto', origem: 'automatico' });
      } else if (papel === 'gestor') {
        linhas.push({ ciclo_id: cicloId, avaliado_id: pessoa.id, avaliador_id: pessoa.gestor_id, papel: 'gestor', origem: 'automatico' });
      } else {
        for (const l of ativos.filter((f) => f.id !== pessoa.id && f.gestor_id === pessoa.id)) {
          linhas.push({ ciclo_id: cicloId, avaliado_id: pessoa.id, avaliador_id: l.id, papel: 'liderado', origem: 'automatico' });
        }
      }
    }
  }

  // Uma transação bloqueia o ciclo e compara os elegíveis com o retrato atual.
  // Nenhum lote parcial fica persistido se o estado mudou durante a leitura.
  const { data: resultado, error } = await supabase.rpc('fn_aval360_gerar_convites', {
    p_ciclo_id: cicloId,
    p_linhas: linhas,
  });
  if (error) throw Object.assign(new Error(`falha ao gravar convites: ${error.message}`), { code: error.code });
  if (!resultado || !Number.isInteger(resultado.gravados) || !Number.isInteger(resultado.existentes)) {
    throw new Error('Não foi possível confirmar a geração dos convites.');
  }

  // ⚠️ O que ficou de fora é DECLARADO, com nome e motivo. Papel suprimido em
  // silêncio faz o ciclo fechar com "85% de adesão" e ninguém saber que 15%
  // nunca foi convidado — e quem some é justo a equipe pequena.
  return { ok: true, gravados: resultado.gravados, existentes: resultado.existentes, suprimidos, piso };
}

module.exports = {
  PAPEIS,
  funcionarioDoLogin,
  elegiveisPorPapel,
  listarAtivos,
  retratoDoCiclo,
  gerarConvitesAutomaticos,
};

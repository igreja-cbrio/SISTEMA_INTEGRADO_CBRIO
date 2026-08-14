// ============================================================================
// /api/next-batismo · "Check de pessoas" do funil de novos convertidos (Fase 1)
//
// Console de RESOLUÇÃO DE IDENTIDADE (Marcos · 2026-06-15). NÃO faz CRUD nem
// presença — Integração confirma presença e consome as identidades limpas.
// Duas lentes:
//   1. Duplicatas suspeitas (pré-filtro em memória) → fundir (merge_membros)
//      ou marcar "não é duplicata" (mem_duplicados_ignorados).
//   2. Inscrição/convertido SEM vínculo de membro (membro_id NULL) → ligar ao
//      membro certo (buscarCandidatos) ou criar o cadastro (acharOuCriar).
//
// Tudo reusa o serviço membroMatch (Fase 0) + a infra de merge do Membresia.
// NUNCA auto-funde: match fraco vira revisão humana aqui.
// ============================================================================

const router = require('express').Router();
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { buscarCandidatos, acharOuCriar, acharOuCriarGuardado } = require('../services/membroMatch');
const { avaliarPossivelDuplicidade, nomesPodemSerMesmaPessoa, tokensNome } = require('../services/duplicidadePolicy');
const { avaliarRelacaoFamiliar } = require('../services/familiaPolicy');
const { montarPatchFusao } = require('../services/fusaoCampos');

router.use(authenticate);

const TABELA = { next: 'next_inscricoes', batismo: 'batismo_inscricoes', convertido: 'cui_convertidos', visita: 'cui_visitas' };

// ── Reshape da view de duplicatas → mesma forma do /membresia/duplicados ──
function reshapeDuplicados(data) {
  return (data || []).map((d) => ({
    par_id: `${d.membro_a_id}_${d.membro_b_id}`,
    membro_a_id: d.membro_a_id,
    membro_b_id: d.membro_b_id,
    motivos: d.motivos || [],
    // `confianca` segue apenas para ordenação retrocompatível. A UI não o
    // apresenta como probabilidade: estas são regras, não um modelo calibrado.
    confianca: d.confianca,
    prioridade: (d.motivos || []).includes('cpf_igual') || (d.motivos || []).includes('nome_e_nascimento')
      ? 'alta' : 'media',
    evidencias: (d.motivos || []).map((m) => ({
      cpf_igual: 'CPF igual',
      nome_e_nascimento: 'Nome e nascimento compatíveis',
      telefone_e_nome: 'Telefone e nome compatíveis',
      email_e_nome: 'E-mail e nome compatíveis',
      nome_muito_parecido: 'Nomes muito parecidos',
    }[m] || m)),
    contradicoes: [
      d.a_cpf && d.b_cpf && String(d.a_cpf).replace(/\D/g, '').length === 11
        && String(d.b_cpf).replace(/\D/g, '').length === 11
        && String(d.a_cpf).replace(/\D/g, '') !== String(d.b_cpf).replace(/\D/g, '') ? 'CPFs diferentes' : null,
      d.a_nascimento && d.b_nascimento && d.a_nascimento !== d.b_nascimento ? 'Nascimentos diferentes' : null,
      d.a_genero && d.b_genero && d.a_genero !== d.b_genero ? 'Gêneros diferentes' : null,
      d.a_email && d.b_email && String(d.a_email).trim().toLowerCase() !== String(d.b_email).trim().toLowerCase() ? 'E-mails diferentes' : null,
    ].filter(Boolean),
    membro_a: {
      id: d.membro_a_id, nome: d.a_nome, email: d.a_email, telefone: d.a_telefone,
      cpf: d.a_cpf, data_nascimento: d.a_nascimento, status: d.a_status,
      foto_url: d.a_foto_url, criado_em: d.a_criado_em, genero: d.a_genero,
    },
    membro_b: {
      id: d.membro_b_id, nome: d.b_nome, email: d.b_email, telefone: d.b_telefone,
      cpf: d.b_cpf, data_nascimento: d.b_nascimento, status: d.b_status,
      foto_url: d.b_foto_url, criado_em: d.b_criado_em, genero: d.b_genero,
    },
  })).filter((item) => {
    const avaliacao = avaliarPossivelDuplicidade(item.membro_a, item.membro_b);
    item.prioridade = avaliacao.prioridade;
    item.evidencias = avaliacao.evidencias;
    item.contradicoes = avaliacao.contradicoes;
    return avaliacao.incluir;
  });
}

// Vínculos comprovados da pessoa em cada módulo. Não atribui proveniência a um
// campo específico (o legado não guarda isso); informa onde a equipe pode
// conferir a identidade com responsáveis e histórico operacional.
async function enriquecerOrigensDuplicados(items) {
  const ids = [...new Set((items || []).flatMap((p) => [p.membro_a_id, p.membro_b_id]).filter(Boolean))];
  if (!ids.length) return items;
  const porMembro = new Map(ids.map((id) => [id, []]));
  const adicionar = (id, origem) => {
    const lista = porMembro.get(id);
    if (!lista || lista.some((x) => x.tipo === origem.tipo && x.detalhe === origem.detalhe)) return;
    lista.push(origem);
  };
  const origens = [[], [], [], [], [], []];
  // De onde o CADASTRO em si nasceu (import de grupos, Next, wifi, ficha de
  // voluntariado...). Diferente das origens operacionais: quando uma pessoa não
  // tem NENHUM vínculo, saber a porta do cadastro ajuda a equipe a identificar
  // quem ela é (ex.: veio do import de grupos → o líder pode reconhecer).
  const origemCadastro = new Map();
  // Muitos pares podem envolver centenas de pessoas. Dividir os UUIDs evita
  // estourar o tamanho da URL do PostgREST sem cortar a fila nem suas origens.
  for (let i = 0; i < ids.length; i += 100) {
    const lote = ids.slice(i, i + 100);
    const consultas = await Promise.all([
      supabase.from('cui_convertidos').select('membro_id, area, data_culto').in('membro_id', lote).is('deleted_at', null),
      supabase.from('mem_grupo_membros').select('membro_id, mem_grupos(nome)').in('membro_id', lote).is('saiu_em', null).is('deleted_at', null),
      supabase.from('next_inscricoes').select('membro_id, created_at').in('membro_id', lote),
      supabase.from('batismo_inscricoes').select('membro_id, status').in('membro_id', lote).is('deleted_at', null),
      supabase.from('cui_visitas').select('membro_id, tipo').in('membro_id', lote).is('deleted_at', null),
      supabase.from('mem_voluntarios').select('membro_id, mem_ministerios(nome)').in('membro_id', lote).is('ate', null),
    ]);
    consultas.forEach((resultado, indice) => {
      if (!resultado.error) origens[indice].push(...(resultado.data || []));
    });
    const cadastros = await supabase.from('mem_membros').select('id, origem_cadastro').in('id', lote);
    if (!cadastros.error) {
      for (const m of cadastros.data || []) origemCadastro.set(m.id, m.origem_cadastro || null);
    }
  }
  const [convertidos, grupos, next, batismos, visitas, voluntarios] = origens;
  convertidos.forEach((r) => adicionar(r.membro_id, {
    tipo: 'conversao', label: 'Conversão', detalhe: r.area ? String(r.area).toUpperCase() : null, rota: '/ministerial/cuidados',
  }));
  grupos.forEach((r) => adicionar(r.membro_id, {
    tipo: 'grupos', label: 'Grupos', detalhe: r.mem_grupos?.nome || null, rota: '/grupos',
  }));
  next.forEach((r) => adicionar(r.membro_id, {
    tipo: 'next', label: 'Next', detalhe: null, rota: '/ministerial/next',
  }));
  batismos.forEach((r) => adicionar(r.membro_id, {
    tipo: 'batismo', label: 'Batismo', detalhe: r.status || null, rota: '/batismo',
  }));
  visitas.forEach((r) => adicionar(r.membro_id, {
    tipo: 'visitas', label: 'Visitas', detalhe: r.tipo || null, rota: '/ministerial/cuidados',
  }));
  voluntarios.forEach((r) => adicionar(r.membro_id, {
    tipo: 'voluntariado', label: 'Voluntariado', detalhe: r.mem_ministerios?.nome || null, rota: '/ministerial/voluntariado',
  }));
  return items.map((p) => ({
    ...p,
    membro_a: { ...p.membro_a, origens: porMembro.get(p.membro_a_id) || [], origem_cadastro: origemCadastro.get(p.membro_a_id) || null },
    membro_b: { ...p.membro_b, origens: porMembro.get(p.membro_b_id) || [], origem_cadastro: origemCadastro.get(p.membro_b_id) || null },
  }));
}

// Auditoria da fila não pode derrubar a ação principal durante uma janela de
// deploy em que o backend novo suba antes da migration.
async function registrarResolucao(payload) {
  const { error } = await supabase.from('entradas_resolucoes').insert(payload);
  if (!error || error.code === '23505') return true;
  if (!/entradas_resolucoes|schema cache|does not exist/i.test(error.message || '')) {
    console.warn('[next-batismo] resolução não registrada:', error.message);
  }
  return false;
}

// ── Similaridade de nome (Dice por bigramas) · só pra ranquear sugestões ──
function normNome(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}
function bigrams(s) {
  const out = new Map();
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    out.set(g, (out.get(g) || 0) + 1);
  }
  return out;
}
function diceNome(a, b) {
  const x = normNome(a), y = normNome(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const bx = bigrams(x), by = bigrams(y);
  let inter = 0, totX = 0, totY = 0;
  for (const v of bx.values()) totX += v;
  for (const [g, v] of by) { totY += v; if (bx.has(g)) inter += Math.min(v, bx.get(g)); }
  return totX + totY === 0 ? 0 : (2 * inter) / (totX + totY);
}

function digitos(valor) {
  return String(valor || '').replace(/\D/g, '');
}

function chaveEndereco(membro) {
  const cep = digitos(membro?.cep);
  const endereco = normNome(membro?.endereco).replace(/[^a-z0-9 ]/g, '').trim();
  if (cep.length !== 8 || endereco.length < 8) return null;
  return `${cep}|${endereco}`;
}

// contatoComumDoPar · devolve O DADO que motivou a sugestão de família, dito de
// forma explícita ("Mesmo telefone: (21) 96412-4838"). É evidência, não contato
// de exibição — um valor só, o compartilhado, e nada além dele.
// kidsEmComum · crianças de que os DOIS lados são responsáveis, com o
// parentesco declarado de cada um. Vazio é o caso comum; quando não é, decide.
function kidsEmComum(vinculosA, vinculosB) {
  if (!vinculosA?.length || !vinculosB?.length) return [];
  const porCrianca = new Map(vinculosB.map((v) => [v.crianca_id, v]));
  return vinculosA
    .filter((v) => porCrianca.has(v.crianca_id))
    .map((v) => ({
      crianca_id: v.crianca_id,
      crianca_nome: v.crianca_nome,
      crianca_nascimento: v.crianca_nascimento,
      parentesco_pessoa: v.parentesco,
      parentesco_referencia: porCrianca.get(v.crianca_id).parentesco,
    }));
}

// procedenciaDoContato · as portas que trouxeram O CONTATO COMPARTILHADO pra
// este cadastro (não o histórico inteiro, que seria ruído). Sem telefone em
// comum — caso do par por endereço — devolve as 3 portas mais recentes, que
// ainda respondem "de onde vem este cadastro?".
function procedenciaDoContato(observacoes, evidencias = [], a, b) {
  const lista = observacoes || [];
  if (!lista.length) return [];
  const tel = evidencias.includes('Mesmo telefone') ? digitos(a?.telefone) : null;
  const relevantes = tel ? lista.filter((o) => digitos(o.telefone) === tel) : lista;
  const base = relevantes.length ? relevantes : lista;
  // Uma linha por PORTA (a mesma porta repetida N vezes não informa nada novo),
  // guardando a 1ª vez que ela trouxe o dado.
  const porPorta = new Map();
  for (const o of base) {
    if (!porPorta.has(o.origem)) porPorta.set(o.origem, o.quando);
  }
  return [...porPorta.entries()].slice(-4).map(([origem, quando]) => ({ origem, quando }));
}

function contatoComumDoPar(a, b, evidencias = []) {
  if (evidencias.includes('Mesmo telefone')) {
    const tel = digitos(a?.telefone);
    if (tel && tel === digitos(b?.telefone)) return { tipo: 'telefone', valor: tel };
  }
  if (evidencias.includes('Mesmo endereço e CEP')) {
    // Vale o endereço do lado que o tem escrito por extenso — a chave de
    // agrupamento é normalizada e ilegível.
    const end = a?.endereco || b?.endereco;
    const cep = digitos(a?.cep) || digitos(b?.cep);
    if (end) return { tipo: 'endereco', valor: [end, cep].filter(Boolean).join(' · CEP ') };
  }
  return null;
}

const MOTIVO_POR_EVIDENCIA = {
  'CPF igual': 'cpf_igual',
  'Nome e nascimento compatíveis': 'nome_e_nascimento',
  'Telefone e nome compatíveis': 'telefone_e_nome',
  'E-mail e nome compatíveis': 'email_e_nome',
  'Nomes muito parecidos': 'nome_muito_parecido',
};

function linhaDuplicidade(a, b, avaliacao) {
  return {
    membro_a_id: a.id, membro_b_id: b.id,
    motivos: avaliacao.evidencias.map((e) => MOTIVO_POR_EVIDENCIA[e]).filter(Boolean),
    confianca: avaliacao.prioridade === 'alta' ? 95 : 80,
    a_nome: a.nome, a_email: a.email, a_telefone: a.telefone, a_cpf: a.cpf,
    a_nascimento: a.data_nascimento, a_status: a.status, a_foto_url: a.foto_url,
    a_criado_em: a.created_at, a_genero: a.genero,
    b_nome: b.nome, b_email: b.email, b_telefone: b.telefone, b_cpf: b.cpf,
    b_nascimento: b.data_nascimento, b_status: b.status, b_foto_url: b.foto_url,
    b_criado_em: b.created_at, b_genero: b.genero,
  };
}

let triagemFamiliasCache = { ate: 0, familias: null, duplicatas: null, promessa: null };

function invalidarTriagemPessoas() {
  triagemFamiliasCache = { ate: 0, familias: null, duplicatas: null, promessa: null };
}

async function carregarTriagemFamilias() {
  if (triagemFamiliasCache.familias && triagemFamiliasCache.ate > Date.now()) {
    return triagemFamiliasCache;
  }
  if (triagemFamiliasCache.promessa) return triagemFamiliasCache.promessa;

  const carregar = async () => {
  const membros = [];
  for (const estadoAtivo of [true, false, null]) {
    const tamanhoPagina = 1000;
    for (let from = 0; ; from += tamanhoPagina) {
      let resultado;
      try {
        let query = supabase.from('mem_membros')
          .select('id, nome, telefone, email, cpf, data_nascimento, genero, endereco, cep, bairro, cidade, familia_id, created_at, foto_url, status, active')
          .is('deleted_at', null).range(from, from + tamanhoPagina - 1);
        query = estadoAtivo === null ? query.is('active', null) : query.eq('active', estadoAtivo);
        resultado = await query;
      } catch (error) {
        throw new Error(`Falha ao carregar pessoas (${String(estadoAtivo)}, ${from}-${from + tamanhoPagina - 1}): ${error.message}`);
      }
      const { data, error } = resultado;
      if (error) throw new Error(`Falha ao carregar pessoas (${String(estadoAtivo)}, ${from}-${from + tamanhoPagina - 1}): ${error.message}`);
      membros.push(...(data || []));
      if (!data || data.length < tamanhoPagina) break;
    }
  }

  const familiasPorId = new Map();
  const familiaIds = [...new Set(membros.map((m) => m.familia_id).filter(Boolean))];
  for (let i = 0; i < familiaIds.length; i += 100) {
    let resultado;
    try {
      resultado = await supabase.from('mem_familias').select('id, nome')
        .in('id', familiaIds.slice(i, i + 100));
    } catch (error) {
      throw new Error(`Falha ao carregar famílias (${i}-${i + 99}): ${error.message}`);
    }
    const { data, error } = resultado;
    if (error) throw new Error(`Falha ao carregar famílias (${i}-${i + 99}): ${error.message}`);
    for (const familia of data || []) familiasPorId.set(familia.id, familia);
  }
  for (const membro of membros) membro.familia = familiasPorId.get(membro.familia_id) || null;

  const porTelefone = new Map();
  const porEndereco = new Map();
  const porCpf = new Map();
  const porEmail = new Map();
  const porNascimento = new Map();
  const porPrimeiroNome = new Map();
  const porInicial = new Map();
  const adicionar = (mapa, chave, membro) => {
    if (!chave) return;
    if (!mapa.has(chave)) mapa.set(chave, []);
    mapa.get(chave).push(membro);
  };
  for (const membro of membros) {
    const telefone = digitos(membro.telefone);
    adicionar(porTelefone, telefone.length >= 10 ? telefone : null, membro);
    adicionar(porCpf, digitos(membro.cpf).length === 11 ? digitos(membro.cpf) : null, membro);
    adicionar(porEmail, String(membro.email || '').trim().toLowerCase().length > 3
      ? String(membro.email).trim().toLowerCase() : null, membro);
    adicionar(porNascimento, membro.data_nascimento || null, membro);
    const nomeNormalizado = normNome(membro.nome);
    const primeiroNome = tokensNome(membro.nome)[0];
    adicionar(porPrimeiroNome, primeiroNome || null, membro);
    adicionar(porInicial, nomeNormalizado[0] || null, membro);
    if (membro.active !== false) adicionar(porEndereco, chaveEndereco(membro), membro);
  }

  const paresFamilia = new Map();
  const paresDuplicidade = new Map();
  const paresAvaliados = new Set();
  const considerarDuplicidade = (a, b) => {
    if (!a || !b || a.id === b.id) return;
    const ids = [a.id, b.id].sort();
    const chave = `${ids[0]}_${ids[1]}`;
    if (paresAvaliados.has(chave)) return;
    paresAvaliados.add(chave);
    const avaliacao = avaliarPossivelDuplicidade(a, b);
    if (avaliacao.incluir) paresDuplicidade.set(chave, linhaDuplicidade(a, b, avaliacao));
  };
  const compararGrupoDuplicidade = (grupo, filtro = null) => {
    if (!grupo || grupo.length < 2) return;
    for (let i = 0; i < grupo.length; i += 1) {
      for (let j = i + 1; j < grupo.length; j += 1) {
        if (!filtro || filtro(grupo[i], grupo[j])) considerarDuplicidade(grupo[i], grupo[j]);
      }
    }
  };
  const considerarGrupo = (grupo, evidencia) => {
    if (!grupo || grupo.length < 2 || grupo.length > 12) return;
    for (let i = 0; i < grupo.length; i += 1) {
      for (let j = i + 1; j < grupo.length; j += 1) {
        const a = grupo[i];
        const b = grupo[j];
        const ids = [a.id, b.id].sort();
        const chave = `${ids[0]}_${ids[1]}`;
        // Nome abreviado/contido ou CPF igual é assunto de identidade. Nunca
        // oferecemos criar família para um par que ainda pode ser uma pessoa só.
        const relacao = avaliarRelacaoFamiliar(a, b, {
          mesmoTelefone: evidencia === 'Mesmo telefone',
          mesmoEndereco: evidencia === 'Mesmo endereço e CEP',
        });
        if (relacao.destino === 'duplicidade') {
          considerarDuplicidade(a, b);
          continue;
        }
        if (a.familia_id && b.familia_id) continue;
        if (relacao.destino !== 'familia') continue;
        const atual = paresFamilia.get(chave) || { a, b, evidencias: [], alertas: [] };
        if (!atual.alertas) atual.alertas = [];
        if (!atual.evidencias.includes(evidencia)) atual.evidencias.push(evidencia);
        if (relacao.sobrenomes.length && !atual.evidencias.some((e) => e.startsWith('Sobrenome em comum:'))) {
          atual.evidencias.push(`Sobrenome em comum: ${relacao.sobrenomes.join(', ')}`);
        }
        // Alerta ≠ evidência: evidência sustenta a sugestão, alerta a QUESTIONA.
        // Misturar os dois faria "pode ser a mesma pessoa" parecer motivo pra
        // vincular família.
        if (relacao.alerta && !atual.alertas.includes(relacao.alerta)) atual.alertas.push(relacao.alerta);
        paresFamilia.set(chave, atual);
      }
    }
  };
  // Identidade: sinais exatos encontram inclusive nomes digitados de formas
  // diferentes; os blocos de nome encontram abreviações e erros leves sem
  // fazer uma comparação quadrática da base inteira.
  for (const grupo of porCpf.values()) compararGrupoDuplicidade(grupo);
  for (const grupo of porTelefone.values()) compararGrupoDuplicidade(grupo);
  for (const grupo of porEmail.values()) compararGrupoDuplicidade(grupo);
  for (const grupo of porNascimento.values()) compararGrupoDuplicidade(grupo);
  for (const grupo of porPrimeiroNome.values()) compararGrupoDuplicidade(grupo,
    (a, b) => nomesPodemSerMesmaPessoa(a.nome, b.nome));
  for (const grupo of porInicial.values()) compararGrupoDuplicidade(grupo, (a, b) => {
    const na = normNome(a.nome); const nb = normNome(b.nome);
    const maior = Math.max(na.length, nb.length);
    return Math.abs(na.length - nb.length) <= Math.max(3, Math.ceil(maior * 0.18))
      && nomesPodemSerMesmaPessoa(a.nome, b.nome);
  });

  // Família: somente cadastros ativos entram na fila operacional.
  for (const grupo of porTelefone.values()) considerarGrupo(grupo.filter((m) => m.active !== false), 'Mesmo telefone');
  for (const grupo of porEndereco.values()) considerarGrupo(grupo, 'Mesmo endereço e CEP');

  // ── Evidência POR EXTENSO + os sinais que decidem o parentesco ──────────────
  // Reclamação do Marcos (14/08): "a aba de vincular famílias está confuso, não
  // dá pra saber COMO essa pessoa está sendo vinculada na família — tem Angela
  // Alvarenga e José Benício de Alvarenga com o mesmo telefone e sobrenomes
  // parecidos, eu não sei o que faria nesses casos, pois não sei POR QUE tem o
  // mesmo telefone." O caso dele se resolvia com dado que o banco já tinha e a
  // tela não mostrava: os dois são responsáveis da MESMA criança no Kids (um
  // como "mae"), e a criança se chama igual a um dos cadastros — ou seja não é
  // família, é a mesma pessoa com o nome do filho.
  //
  // ⚠️ `kids_responsaveis` em comum é a evidência de convivência mais FORTE que
  // este sistema tem (vínculo de MENOR passa por documento + aprovação da equipe
  // Kids) e a fila não a usava nem a exibia.
  const idsFamilia = [...new Set([...paresFamilia.values()].flatMap((p) => [p.a.id, p.b.id]))];
  const kidsPorMembro = new Map();
  const procedenciaPorMembro = new Map();
  if (idsFamilia.length) {
    // Best-effort: falha aqui NÃO derruba a fila (o par continua exibido, só sem
    // o enriquecimento). Fila que desaparece por causa de um enfeite é pior.
    try {
      const vinculos = [];
      for (let i = 0; i < idsFamilia.length; i += 200) {
        const { data, error } = await supabase.from('kids_responsaveis')
          .select('membro_id, crianca_id, parentesco, kids_criancas(nome, data_nascimento)')
          .in('membro_id', idsFamilia.slice(i, i + 200));
        if (error) throw error;
        vinculos.push(...(data || []));
      }
      for (const v of vinculos) {
        if (!kidsPorMembro.has(v.membro_id)) kidsPorMembro.set(v.membro_id, []);
        kidsPorMembro.get(v.membro_id).push({
          crianca_id: v.crianca_id,
          crianca_nome: v.kids_criancas?.nome || null,
          crianca_nascimento: v.kids_criancas?.data_nascimento || null,
          parentesco: v.parentesco || null,
        });
      }
    } catch (e) {
      console.warn('[entradas/familias] vínculo Kids não carregado:', e.message);
    }
    try {
      const obs = [];
      for (let i = 0; i < idsFamilia.length; i += 100) {
        const { data, error } = await supabase.from('mem_identidade_observacoes')
          .select('membro_id, origem, telefone, observado_em')
          .in('membro_id', idsFamilia.slice(i, i + 100))
          .order('observado_em', { ascending: true }).limit(3000);
        if (error) throw error;
        obs.push(...(data || []));
      }
      for (const o of obs) {
        if (!procedenciaPorMembro.has(o.membro_id)) procedenciaPorMembro.set(o.membro_id, []);
        procedenciaPorMembro.get(o.membro_id).push({
          origem: o.origem, telefone: o.telefone, quando: o.observado_em,
        });
      }
    } catch (e) {
      console.warn('[entradas/familias] procedência não carregada:', e.message);
    }
  }

  let decisoes;
  try {
    decisoes = await Promise.all([
      supabase.from('entradas_resolucoes').select('origem_id')
        .eq('tipo', 'sem_vinculo').eq('acao', 'descartado').eq('origem', 'familia').limit(5000),
      supabase.from('mem_duplicados_ignorados').select('membro_a_id, membro_b_id').limit(5000),
    ]);
  } catch (error) {
    throw new Error(`Falha ao carregar decisões anteriores: ${error.message}`);
  }
  const [{ data: descartados, error: descartadosErr }, { data: duplicatasIgnoradas, error: ignoradasErr }] = decisoes;
  if (descartadosErr && !/entradas_resolucoes|schema cache|does not exist/i.test(descartadosErr.message || '')) {
    throw new Error(`Falha ao carregar decisões familiares: ${descartadosErr.message}`);
  }
  if (ignoradasErr) throw new Error(`Falha ao carregar duplicidades ignoradas: ${ignoradasErr.message}`);
  const paresDescartados = new Set((descartados || []).map((r) => r.origem_id).filter(Boolean));
  const paresDuplicidadeIgnorados = new Set((duplicatasIgnoradas || [])
    .map((r) => [r.membro_a_id, r.membro_b_id].sort().join('_')));

  const familias = [...paresFamilia.entries()].filter(([parId]) => !paresDescartados.has(parId)).map(([parId, par]) => {
    let pessoa = par.a;
    let referencia = par.b;
    if (par.a.familia_id && !par.b.familia_id) {
      pessoa = par.b; referencia = par.a;
    } else if (!par.a.familia_id && !par.b.familia_id
      && new Date(par.a.created_at || 0) < new Date(par.b.created_at || 0)) {
      pessoa = par.b; referencia = par.a;
    }
    return {
      par_id: parId,
      evidencias: par.evidencias,
      alertas: par.alertas || [],
      pessoa,
      referencia,
      // QUAL sinal disparou e com QUE valor, explícito. O card já mostrava o
      // telefone de cada lado (`maskTelefone` FORMATA, não mascara), mas exigia
      // que quem tria comparasse dois rodapés — e no par por ENDEREÇO o valor
      // compartilhado costuma ficar invisível, porque o card só cai no endereço
      // quando não há telefone.
      contato_comum: contatoComumDoPar(par.a, par.b, par.evidencias),
      // A evidência de convivência mais forte que o sistema tem: os dois
      // responsáveis pela MESMA criança. Se aparecer aqui, a decisão está
      // praticamente tomada — e o `parentesco` de cada lado é o que separa
      // "casal/irmãos" de "é a mesma pessoa com o nome trocado".
      kids_em_comum: kidsEmComum(kidsPorMembro.get(pessoa.id), kidsPorMembro.get(referencia.id)),
      // De QUAL porta e QUANDO veio o contato compartilhado — a resposta pra
      // "por que essas duas pessoas têm o mesmo telefone?". A aba de duplicatas
      // já mostra fontes; a de famílias não mostrava.
      procedencia: {
        pessoa: procedenciaDoContato(procedenciaPorMembro.get(pessoa.id), par.evidencias, par.a, par.b),
        referencia: procedenciaDoContato(procedenciaPorMembro.get(referencia.id), par.evidencias, par.a, par.b),
      },
      destino: referencia.familia_id
        ? { tipo: 'existente', id: referencia.familia_id, nome: referencia.familia?.nome || 'Família existente' }
        : { tipo: 'nova', id: null, nome: null },
    };
  }).sort((a, b) => {
    if (a.destino.tipo !== b.destino.tipo) return a.destino.tipo === 'existente' ? -1 : 1;
    return String(a.pessoa.nome).localeCompare(String(b.pessoa.nome), 'pt-BR');
  });
  const duplicatas = [...paresDuplicidade.entries()]
    .filter(([parId]) => !paresDuplicidadeIgnorados.has(parId))
    .map(([, linha]) => linha);
  triagemFamiliasCache = { ate: Date.now() + 10 * 60_000, familias, duplicatas, promessa: null };
  return triagemFamiliasCache;
  };

  const promessa = carregar().catch((error) => {
    invalidarTriagemPessoas();
    throw error;
  });
  triagemFamiliasCache.promessa = promessa;
  return promessa;
}

async function carregarFamiliasPendentes() {
  return (await carregarTriagemFamilias()).familias;
}

async function carregarDuplicadosProgressivos() {
  const { data: pares, error } = await supabase.from('mem_identidade_pares')
    .select('*').order('score', { ascending: false }).limit(1500);
  if (error) {
    if (/mem_identidade_pares|schema cache|does not exist/i.test(error.message || '')) return [];
    throw error;
  }
  if (!pares?.length) return [];
  const ids = [...new Set(pares.flatMap((p) => [p.membro_a_id, p.membro_b_id]))];
  const porId = new Map();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: membros, error: eMembros } = await supabase.from('mem_membros')
      .select('id,nome,email,telefone,cpf,data_nascimento,status,foto_url,created_at,genero')
      .in('id', ids.slice(i, i + 200)).is('deleted_at', null);
    if (eMembros) throw eMembros;
    for (const m of membros || []) porId.set(m.id, { ...m, criado_em: m.created_at });
  }
  const { data: ignorados } = await supabase.from('mem_duplicados_ignorados')
    .select('membro_a_id,membro_b_id').limit(5000);
  const ignoradosSet = new Set((ignorados || []).map((p) => [p.membro_a_id, p.membro_b_id].sort().join('_')));
  return pares.filter((p) => !ignoradosSet.has([p.membro_a_id, p.membro_b_id].sort().join('_')))
    .map((p) => ({
      par_id: `${p.membro_a_id}_${p.membro_b_id}`,
      membro_a_id: p.membro_a_id, membro_b_id: p.membro_b_id,
      confianca: p.score, prioridade: p.prioridade,
      evidencias: Array.isArray(p.evidencias) ? p.evidencias : [],
      contradicoes: Array.isArray(p.contradicoes) ? p.contradicoes : [],
      fontes_evidencia: Array.isArray(p.fontes) ? p.fontes : [],
      ultima_evidencia_em: p.ultima_evidencia_em,
      identidade_progressiva: true,
      membro_a: porId.get(p.membro_a_id), membro_b: porId.get(p.membro_b_id),
    })).filter((p) => p.membro_a && p.membro_b);
}

// "Não tenho certeza": reativa quando fica DECISIVO (quase_confirmado — em geral
// CPF de um formulário completo) ou quando a confiança sobe materialmente acima
// do momento do adiamento. Formulário completo (CPF+nascimento) empurra o par.
const MARGEM_REATIVA = 10;
const ORDEM_PRIORIDADE = { quase_confirmado: 0, alta: 1, media: 2, descoberta: 3 };
function parKey(a, b) { return [a, b].sort().join('_'); }
function ordenarPares(a, b) {
  if (a.prioridade !== b.prioridade) return (ORDEM_PRIORIDADE[a.prioridade] ?? 9) - (ORDEM_PRIORIDADE[b.prioridade] ?? 9);
  if ((a.confianca || 0) !== (b.confianca || 0)) return (b.confianca || 0) - (a.confianca || 0);
  return String(a.membro_a?.nome || '').localeCompare(String(b.membro_a?.nome || ''), 'pt-BR');
}
// Volta pra fila quando: chegou ao topo (quase_confirmado · em geral um CPF novo
// pelo motor progressivo) OU a confiança subiu materialmente acima do momento do
// adiamento (marca-d'água). SEM piso absoluto de propósito: um par adiado já em
// "alta" (95) não pode reaparecer sozinho — só se um sinal novo o empurrar a
// quase_confirmado ou acima da marca-d'água. Senão a fila se "deszerava" sozinha.
function evidenciaDecisiva(par, adiado) {
  if (par.prioridade === 'quase_confirmado') return true;
  return (par.confianca || 0) >= (adiado.confianca_no_adiamento || 0) + MARGEM_REATIVA;
}
const tabelaAdiadosAusente = (msg) => /entradas_pares_adiados|schema cache|does not exist/i.test(msg || '');

// Pares adiados ainda ativos (não reativados). Map par_key -> registro.
async function carregarAdiados() {
  const mapa = new Map();
  try {
    const { data, error } = await supabase.from('entradas_pares_adiados')
      .select('par_key, confianca_no_adiamento, prioridade_no_adiamento, adiado_em, adiado_por')
      .is('reativado_em', null).limit(5000);
    if (error) { if (tabelaAdiadosAusente(error.message)) return mapa; throw error; }
    for (const r of data || []) mapa.set(r.par_key, r);
  } catch (e) {
    if (!tabelaAdiadosAusente(e.message)) throw e;
  }
  return mapa;
}

// Particiona os pares em ATIVOS (fila) e ADIADOS ("não tenho certeza" que ainda
// não ficou decisivo). Um par adiado que voltou a ser decisivo reentra na fila
// ativa e é carimbado como reativado (best-effort · nunca funde sozinho).
async function montarDuplicados() {
  const [triagem, progressivos, adiados] = await Promise.all([
    carregarTriagemFamilias(), carregarDuplicadosProgressivos(), carregarAdiados(),
  ]);
  const porPar = new Map(reshapeDuplicados(triagem.duplicatas || []).map((p) => [p.par_id, p]));
  // A identidade progressiva conhece várias portas e prevalece sobre o retrato
  // atual de mem_membros para o mesmo par.
  for (const p of progressivos) porPar.set(p.par_id, p);

  const ativos = [];
  const adiadosLista = [];
  const reativarKeys = [];
  for (const par of porPar.values()) {
    const adi = par.membro_a_id && par.membro_b_id ? adiados.get(parKey(par.membro_a_id, par.membro_b_id)) : null;
    if (!adi) { ativos.push(par); continue; }
    if (evidenciaDecisiva(par, adi)) { ativos.push(par); reativarKeys.push(parKey(par.membro_a_id, par.membro_b_id)); }
    else adiadosLista.push({ ...par, adiado_em: adi.adiado_em, confianca_no_adiamento: adi.confianca_no_adiamento });
  }
  if (reativarKeys.length) {
    // Reativação automática · best-effort (não derruba a resposta da fila).
    supabase.from('entradas_pares_adiados')
      .update({ reativado_em: new Date().toISOString(), reativado_motivo: 'evidencia_decisiva' })
      .in('par_key', reativarKeys).is('reativado_em', null)
      .then(({ error }) => { if (error && !tabelaAdiadosAusente(error.message)) console.warn('[next-batismo] reativar adiado:', error.message); });
  }
  ativos.sort(ordenarPares);
  adiadosLista.sort(ordenarPares);
  return { ativos, adiados: adiadosLista };
}

async function carregarDuplicadosPendentes() {
  return (await montarDuplicados()).ativos;
}
async function carregarDuplicadosAdiados() {
  return (await montarDuplicados()).adiados;
}

// "Só bate pelo nome": os dois lados NÃO têm nenhum dado verificável em comum
// (CPF, telefone, e-mail ou nascimento). Qualquer fusão aqui seria chute — o par
// pode ser adiado em lote e volta sozinho quando um cadastro completo corroborar
// (decisão do Marcos · 2026-07-19). Ex.: A={nome,tel,email} × B={nome,cpf}.
function soBateNome(par) {
  const a = par.membro_a || {}; const b = par.membro_b || {};
  const cpfA = digitos(a.cpf); const cpfB = digitos(b.cpf);
  const telA = digitos(a.telefone); const telB = digitos(b.telefone);
  const emA = String(a.email || '').trim().toLowerCase(); const emB = String(b.email || '').trim().toLowerCase();
  const nascA = a.data_nascimento || null; const nascB = b.data_nascimento || null;
  if (cpfA.length === 11 && cpfA === cpfB) return false;
  if (telA.length >= 10 && telA === telB) return false;
  if (emA.length > 3 && emA === emB) return false;
  if (nascA && nascB && nascA === nascB) return false;
  return true;
}

// ── Normaliza uma linha do funil sem vínculo pra forma uniforme ──
function rowNext(r) {
  return {
    tipo: 'next', id: r.id, evento_id: r.evento_id,
    nome: [r.nome, r.sobrenome].filter(Boolean).join(' ').trim() || r.nome,
    cpf: r.cpf, telefone: r.telefone, email: r.email, data_nascimento: r.data_nascimento,
    quando: r.created_at, contexto: 'Inscrição no Next',
  };
}
function rowBatismo(r) {
  return {
    tipo: 'batismo', id: r.id,
    nome: [r.nome, r.sobrenome].filter(Boolean).join(' ').trim() || r.nome,
    cpf: r.cpf, telefone: r.telefone, email: r.email, data_nascimento: r.data_nascimento,
    quando: r.created_at, contexto: `Inscrição de batismo · ${r.status || 'pendente'}`,
  };
}
function rowConvertido(r) {
  return {
    tipo: 'convertido', id: r.id,
    nome: r.nome, cpf: r.cpf, telefone: r.telefone, email: null, data_nascimento: null,
    quando: r.data_culto || r.created_at,
    contexto: `Decisão${r.area ? ' · ' + String(r.area).toUpperCase() : ''}`,
  };
}
// Visitas pastorais (cui_visitas) sem cadastro ligado. Vêm pra cá só pra RESOLVER a
// identidade (quem é essa pessoa no sistema) — visita NÃO é sinal de NSM nem marco de
// jornada; ligar só carimba cui_visitas.membro_id (Marcos 2026-07-02).
const NB_VISITA_LABEL = { visita_domiciliar: 'Visita domiciliar', visita_hospitalar: 'Visita hospitalar', funeral: 'Funeral', casamento: 'Casamento', aconselhamento: 'Aconselhamento', outro: 'Outro' };
function rowVisita(r) {
  const t = r.tipo === 'outro' && r.tipo_outro ? `Outro · ${r.tipo_outro}` : (NB_VISITA_LABEL[r.tipo] || r.tipo || 'Visita');
  return {
    tipo: 'visita', id: r.id,
    nome: r.nome, cpf: null, telefone: r.telefone, email: null, data_nascimento: null,
    quando: r.data_visita || r.created_at,
    contexto: `Visita/atendimento · ${t}`,
  };
}

// ── GET /resumo · contadores pros badges ─────────────────────────────────────
router.get('/resumo', authorizeModule('next-batismo', 1), async (req, res) => {
  try {
    const cnt = async (q) => { const { count } = await q; return count || 0; };
    const [dup, familiasPendentes, vivos, comCpf] = await Promise.all([
      montarDuplicados(),
      carregarFamiliasPendentes(),
      cnt(supabase.from('mem_membros').select('id', { count: 'exact', head: true }).is('deleted_at', null)),
      cnt(supabase.from('mem_membros').select('id', { count: 'exact', head: true }).is('deleted_at', null).not('cpf', 'is', null)),
    ]);
    res.json({
      duplicatas: dup.ativos.length,
      adiados: dup.adiados.length,
      familias_pendentes: familiasPendentes.length,
      // Saúde da identidade (corrida do CPF · faixa do topo da tela)
      saude: { pessoas: vivos, com_cpf: comCpf, pct_cpf: vivos > 0 ? Math.round((comCpf / vivos) * 100) : 0 },
    });
  } catch (e) {
    console.error('[next-batismo/resumo]', e.message);
    res.status(500).json({ error: e.message || 'Erro ao montar resumo' });
  }
});

// ── GET /familias-pendentes · somente pares com evidência de convivência ─────
router.get('/familias-pendentes', authorizeModule('next-batismo', 1), async (req, res) => {
  try {
    if (req.query.refresh === '1') invalidarTriagemPessoas();
    const itens = await carregarFamiliasPendentes();
    res.json({ total: itens.length, itens: itens.slice(0, 300) });
  } catch (e) {
    console.error('[next-batismo/familias-pendentes]', e.message);
    res.status(500).json({ error: e.message || 'Erro ao buscar vínculos familiares' });
  }
});

// ── GET /duplicados · pares suspeitos do funil novo ──────────────────────────
router.get('/duplicados', authorizeModule('next-batismo', 1), async (req, res) => {
  try {
    if (req.query.refresh === '1') invalidarTriagemPessoas();
    let pendentes;
    try {
      pendentes = await carregarDuplicadosPendentes();
    } catch (error) {
      throw new Error(`Falha ao gerar possíveis duplicidades: ${error.message}`);
    }
    let items;
    try {
      items = await enriquecerOrigensDuplicados(pendentes);
    } catch (error) {
      throw new Error(`Falha ao carregar origens das pessoas: ${error.message}`);
    }
    res.json({ total: items.length, items });
  } catch (e) {
    console.error('[next-batismo/duplicados]', e.message);
    res.status(500).json({ error: e.message || 'Erro ao buscar duplicados' });
  }
});

// ── GET /duplicados/adiados · fila "não tenho certeza" (some quando ficar decisivo) ──
router.get('/duplicados/adiados', authorizeModule('next-batismo', 1), async (req, res) => {
  try {
    if (req.query.refresh === '1') invalidarTriagemPessoas();
    const adiados = await carregarDuplicadosAdiados();
    const items = await enriquecerOrigensDuplicados(adiados);
    res.json({ total: items.length, items });
  } catch (e) {
    console.error('[next-batismo/duplicados-adiados]', e.message);
    res.status(500).json({ error: e.message || 'Erro ao buscar adiados' });
  }
});

// ── GET /resolucoes · histórico auditável da fila única ─────────────────────
router.get('/resolucoes', authorizeModule('next-batismo', 1), async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 200, 500);
    let q = supabase.from('entradas_resolucoes').select('*')
      .order('resolvido_em', { ascending: false }).limit(limit);
    if (req.query.tipo) q = q.eq('tipo', req.query.tipo);
    if (req.query.acao) q = q.eq('acao', req.query.acao);
    const { data, error } = await q;
    if (error) throw error;

    const ids = [...new Set((data || []).flatMap((r) => [r.membro_principal_id, r.membro_secundario_id]).filter(Boolean))];
    const porId = new Map();
    for (let i = 0; i < ids.length; i += 200) {
      const { data: membros, error: membrosErr } = await supabase.from('mem_membros')
        .select('id, nome, cpf, telefone, email, status, deleted_at').in('id', ids.slice(i, i + 200));
      if (membrosErr) throw membrosErr;
      for (const m of membros || []) porId.set(m.id, m);
    }
    res.json({
      total: (data || []).length,
      items: (data || []).map((r) => ({
        ...r,
        membro_principal: porId.get(r.membro_principal_id) || null,
        membro_secundario: porId.get(r.membro_secundario_id) || null,
      })),
    });
  } catch (e) {
    console.error('[next-batismo/resolucoes]', e.message);
    res.status(500).json({ error: e.message || 'Erro ao buscar resoluções' });
  }
});

// ── GET /sem-vinculo · inscrições/convertidos sem membro_id ──────────────────
router.get('/sem-vinculo', authorizeModule('next-batismo', 1), async (req, res) => {
  try {
    const cap = 300;
    const [next, bat, conv, visita] = await Promise.all([
      supabase.from('next_inscricoes')
        .select('id, evento_id, nome, sobrenome, cpf, telefone, email, data_nascimento, created_at')
        .is('membro_id', null).order('created_at', { ascending: false }).limit(cap),
      supabase.from('batismo_inscricoes')
        .select('id, nome, sobrenome, cpf, telefone, email, data_nascimento, status, created_at')
        .is('membro_id', null).is('deleted_at', null).neq('status', 'cancelado')
        .order('created_at', { ascending: false }).limit(cap),
      supabase.from('cui_convertidos')
        .select('id, nome, cpf, telefone, area, data_culto, created_at')
        .is('membro_id', null).is('deleted_at', null)
        .order('created_at', { ascending: false }).limit(cap),
      supabase.from('cui_visitas')
        .select('id, nome, telefone, tipo, tipo_outro, data_visita, created_at')
        .is('membro_id', null).is('deleted_at', null)
        .order('created_at', { ascending: false }).limit(cap),
    ]);
    if (next.error) throw next.error;
    if (bat.error) throw bat.error;
    if (conv.error) throw conv.error;
    if (visita.error) throw visita.error;
    const itens = [
      ...(next.data || []).map(rowNext),
      ...(bat.data || []).map(rowBatismo),
      ...(conv.data || []).map(rowConvertido),
      ...(visita.data || []).map(rowVisita),
    ].sort((a, b) => new Date(b.quando || 0) - new Date(a.quando || 0));
    res.json({
      total: itens.length,
      itens,
      por_origem: { next: (next.data || []).length, batismo: (bat.data || []).length, convertido: (conv.data || []).length, visita: (visita.data || []).length },
    });
  } catch (e) {
    console.error('[next-batismo/sem-vinculo]', e.message);
    res.status(500).json({ error: e.message || 'Erro ao buscar pendências' });
  }
});

// ── GET /candidatos · membros que podem ser a pessoa (chave forte + nome) ─────
router.get('/candidatos', authorizeModule('next-batismo', 1), async (req, res) => {
  try {
    const { cpf, email, telefone, nome } = req.query;
    // 1) Chave forte (cpf/telefone/email) via membroMatch
    const fortes = await buscarCandidatos({ cpf, email, telefone }, { limit: 8 });
    const byId = new Map(fortes.map((m) => [m.id, m]));

    // 2) Fallback por nome (Dice) · só quando há nome e poucos candidatos fortes
    if (nome && normNome(nome).length >= 3) {
      const tokens = normNome(nome).split(' ').filter((t) => t.length >= 3).sort((a, b) => b.length - a.length);
      const alvo = tokens[0] || normNome(nome);
      const { data } = await supabase
        .from('mem_membros')
        .select('id, nome, email, telefone, cpf, status, foto_url, familia_id')
        .ilike('nome', `%${alvo}%`)
        .is('deleted_at', null)
        .limit(40);
      for (const m of (data || [])) {
        const score = Math.round(diceNome(nome, m.nome) * 100);
        if (score < 55) continue;
        const ex = byId.get(m.id);
        if (ex) { if (!ex.motivos.includes('nome')) ex.motivos.push('nome'); ex.score = Math.max(ex.score, score); }
        else byId.set(m.id, { ...m, motivos: ['nome'], score });
      }
    }
    const candidatos = [...byId.values()].sort((a, b) => b.score - a.score).slice(0, 8);
    res.json({ candidatos });
  } catch (e) {
    console.error('[next-batismo/candidatos]', e.message);
    res.status(500).json({ error: e.message || 'Erro ao buscar candidatos' });
  }
});

// Item 4 (Marcos · "só vincular"): ao resolver uma pessoa do Next, vincula a
// matrícula dela ao membro resolvido — a aba Pessoas consolida (1 linha) e,
// sendo convertida, ela já aparece no primeiro contato do Cuidados. Não cria
// convertido pra externo (decisão do Marcos) nem mexe em formado/desistiu.
// (O /fundir já vincula via merge_membros, que repointa next_matriculas.membro_id.)
async function vincularMatriculaNext(membroId, row) {
  if (!membroId || !row) return;
  try {
    let q = supabase.from('next_matriculas')
      .update({ membro_id: membroId, updated_at: new Date().toISOString() })
      .is('membro_id', null).is('deleted_at', null);
    if (row.cpf) q = q.eq('cpf', row.cpf);
    else if (row.email) q = q.eq('email', row.email);
    else return; // sem chave forte (cpf/email), não arrisca match por nome
    await q;
  } catch (e) { console.error('[next-batismo] vincular matrícula Next:', e.message); }
}

function ultimoSobrenome(nome) {
  const t = String(nome || '').trim().split(/\s+/).filter(Boolean);
  return t.length ? t[t.length - 1] : '';
}

// Liga `novoMembroId` à MESMA família do `candidatoId` (cria a família se o
// candidato ainda não tiver uma) e marca o par como NÃO-duplicata (são família,
// não a mesma pessoa) pra parar de aparecer na fila de duplicados.
async function ligarMesmaFamilia(novoMembroId, candidatoId, feitoPor) {
  if (!novoMembroId || !candidatoId || novoMembroId === candidatoId) return null;
  const { data: cand } = await supabase.from('mem_membros').select('id, nome, familia_id').eq('id', candidatoId).maybeSingle();
  if (!cand) return null;
  let familiaId = cand.familia_id;
  if (!familiaId) {
    const { data: novo } = await supabase.from('mem_membros').select('nome').eq('id', novoMembroId).maybeSingle();
    const sob = ultimoSobrenome(cand.nome) || ultimoSobrenome(novo?.nome) || 'sem sobrenome';
    const { data: fam, error } = await supabase.from('mem_familias').insert({ nome: `Família ${sob}` }).select('id').single();
    if (error) throw error;
    familiaId = fam.id;
    await supabase.from('mem_membros').update({ familia_id: familiaId }).eq('id', candidatoId);
  }
  await supabase.from('mem_membros').update({ familia_id: familiaId }).eq('id', novoMembroId);
  const [a, b] = [novoMembroId, candidatoId].sort();
  await supabase.from('mem_duplicados_ignorados').upsert(
    { membro_a_id: a, membro_b_id: b, ignorado_por: feitoPor || null, motivo: 'Mesma família (não é a mesma pessoa) · Next-Batismo' },
    { onConflict: 'membro_a_id,membro_b_id' });
  return familiaId;
}

router.post('/vincular-familia', authorizeModule('next-batismo', 2), async (req, res) => {
  try {
    const { membro_id, relativo_id } = req.body || {};
    if (!membro_id || !relativo_id || membro_id === relativo_id) {
      return res.status(400).json({ error: 'Informe duas pessoas diferentes' });
    }
    const familiaId = await ligarMesmaFamilia(membro_id, relativo_id, req.user?.id);
    if (!familiaId) return res.status(404).json({ error: 'Pessoa de referência não encontrada' });
    invalidarTriagemPessoas();
    await registrarResolucao({
      tipo: 'sem_vinculo', acao: 'vinculado',
      membro_principal_id: membro_id, membro_secundario_id: relativo_id,
      origem: 'familia', origem_id: `${membro_id}_${relativo_id}`,
      detalhe: { familia_id: familiaId }, resolvido_por: req.user?.id || null,
    });
    res.json({ ok: true, familia_id: familiaId });
  } catch (e) {
    console.error('[next-batismo/vincular-familia]', e.message);
    res.status(500).json({ error: e.message || 'Erro ao vincular família' });
  }
});

// Resolve uma sugestão familiar como falso positivo. A decisão é persistida
// pelo par canônico para ele não reaparecer a cada recálculo da fila.
router.post('/ignorar-familia', authorizeModule('next-batismo', 2), async (req, res) => {
  try {
    const { membro_id, relativo_id } = req.body || {};
    if (!membro_id || !relativo_id || membro_id === relativo_id) {
      return res.status(400).json({ error: 'Informe duas pessoas diferentes' });
    }
    const [a, b] = [membro_id, relativo_id].sort();
    const registrada = await registrarResolucao({
      tipo: 'sem_vinculo', acao: 'descartado',
      membro_principal_id: a, membro_secundario_id: b,
      origem: 'familia', origem_id: `${a}_${b}`,
      detalhe: { motivo: 'Não pertencem à mesma família' },
      resolvido_por: req.user?.id || null,
    });
    if (!registrada) throw new Error('Não foi possível persistir a decisão');
    invalidarTriagemPessoas();
    res.json({ ok: true });
  } catch (e) {
    console.error('[next-batismo/ignorar-familia]', e.message);
    res.status(500).json({ error: e.message || 'Erro ao resolver sugestão familiar' });
  }
});

// ── POST /ligar · carimba membro_id na linha do funil (ligar OU criar) ────────
router.post('/ligar', authorizeModule('next-batismo', 2), async (req, res) => {
  try {
    const { tipo, id, membro_id, criar, familia_de } = req.body || {};
    const tabela = TABELA[tipo];
    if (!tabela || !id) return res.status(400).json({ error: 'tipo (next|batismo|convertido) e id obrigatórios' });

    // Carrega a linha (pra criar stub a partir dela quando for o caso)
    const { data: row, error: rowErr } = await supabase.from(tabela).select('*').eq('id', id).maybeSingle();
    if (rowErr) throw rowErr;
    if (!row) return res.status(404).json({ error: 'Registro não encontrado' });

    let alvoMembroId = membro_id || null;
    let criado = false;
    let familiaLigada = false;

    // "É da mesma família": pessoa NOVA (distinta do candidato) ligada à família dele.
    if (familia_de && !membro_id) {
      const nome = [row.nome, row.sobrenome].filter(Boolean).join(' ').trim() || row.nome || 'Sem nome';
      const r = await acharOuCriarGuardado({
        cpf: row.cpf, email: row.email, telefone: row.telefone, nome,
        dataNascimento: row.data_nascimento, status: 'visitante',
        origem: `entradas_${tipo}`, origemId: id,
      });
      alvoMembroId = r.membro_id;
      criado = !!r.created;
      await ligarMesmaFamilia(alvoMembroId, familia_de, req.user?.id);
      familiaLigada = true;
    } else if (!alvoMembroId) {
      if (!criar) return res.status(400).json({ error: 'informe membro_id ou criar:true' });
      const nome = [row.nome, row.sobrenome].filter(Boolean).join(' ').trim() || row.nome || 'Sem nome';
      // acharOuCriarGuardado reaproveita match por telefone+nome e nome+nascimento
      // antes de criar stub — evita duplicar quem já existe sem CPF/e-mail batendo.
      const r = await acharOuCriarGuardado({
        cpf: row.cpf, email: row.email, telefone: row.telefone, nome,
        dataNascimento: row.data_nascimento, status: 'visitante',
        origem: `entradas_${tipo}`, origemId: id,
      });
      alvoMembroId = r.membro_id;
      criado = !!r.created;
    }

    const patch = { membro_id: alvoMembroId };
    if (tipo === 'convertido') patch.cadastrado = true;

    const { error: upErr } = await supabase.from(tabela).update(patch).eq('id', id);
    if (upErr) {
      // UNIQUE (evento_id, membro_id) no next_inscricoes · esse membro já tem inscrição nesse Next
      if (String(upErr.code) === '23505') {
        return res.status(409).json({ error: 'Esse membro já tem uma inscrição nesse mesmo Next — pode ser uma duplicata da própria inscrição.' });
      }
      throw upErr;
    }
    if (tipo === 'next') await vincularMatriculaNext(alvoMembroId, row);
    await registrarResolucao({
      tipo: 'sem_vinculo',
      acao: criado ? 'cadastro_criado' : 'vinculado',
      membro_principal_id: alvoMembroId,
      origem: tipo,
      origem_id: String(id),
      detalhe: { nome: row.nome || null, familia_ligada: familiaLigada },
      resolvido_por: req.user?.id || null,
    });
    res.json({ ok: true, membro_id: alvoMembroId, criado, familia_ligada: familiaLigada });
  } catch (e) {
    console.error('[next-batismo/ligar]', e.message);
    res.status(500).json({ error: e.message || 'Erro ao ligar' });
  }
});

// ── POST /ignorar-duplicata · "não é a mesma pessoa" ─────────────────────────
router.post('/ignorar-duplicata', authorizeModule('next-batismo', 2), async (req, res) => {
  try {
    const { membro_a_id, membro_b_id, motivo } = req.body || {};
    if (!membro_a_id || !membro_b_id) return res.status(400).json({ error: 'membro_a_id e membro_b_id obrigatórios' });
    const [a, b] = [membro_a_id, membro_b_id].sort();
    const { data, error } = await supabase
      .from('mem_duplicados_ignorados')
      .upsert({ membro_a_id: a, membro_b_id: b, ignorado_por: req.user?.id || null, motivo: motivo || 'Marcado como pessoas distintas (Next-Batismo)' },
        { onConflict: 'membro_a_id,membro_b_id' })
      .select().single();
    if (error) throw error;
    await registrarResolucao({
      tipo: 'duplicidade', acao: 'pessoas_distintas',
      membro_principal_id: a, membro_secundario_id: b,
      origem: 'mem_duplicados_ignorados', origem_id: data?.id ? String(data.id) : null,
      detalhe: { motivo: motivo || 'Marcado como pessoas distintas' },
      resolvido_por: req.user?.id || null,
    });
    invalidarTriagemPessoas();
    res.json({ ok: true, registro: data });
  } catch (e) {
    console.error('[next-batismo/ignorar-duplicata]', e.message);
    res.status(500).json({ error: e.message || 'Erro ao ignorar' });
  }
});

// ── POST /adiar-duplicata · "não tenho certeza" (tira da fila · volta se decisivo) ──
router.post('/adiar-duplicata', authorizeModule('next-batismo', 2), async (req, res) => {
  try {
    const { membro_a_id, membro_b_id, confianca, prioridade, motivo } = req.body || {};
    if (!membro_a_id || !membro_b_id) return res.status(400).json({ error: 'membro_a_id e membro_b_id obrigatórios' });
    const [a, b] = [membro_a_id, membro_b_id].sort();
    const key = `${a}_${b}`;
    const { error } = await supabase.from('entradas_pares_adiados').upsert({
      par_key: key, membro_a_id: a, membro_b_id: b,
      confianca_no_adiamento: Number.isFinite(Number(confianca)) ? Number(confianca) : 0,
      prioridade_no_adiamento: prioridade || null,
      adiado_por: req.user?.id || null, adiado_em: new Date().toISOString(),
      reativado_em: null, reativado_motivo: null,
    }, { onConflict: 'par_key' });
    if (error) {
      if (tabelaAdiadosAusente(error.message)) return res.status(503).json({ error: 'Recurso indisponível: aplique a migration entradas_pares_adiados.' });
      throw error;
    }
    await registrarResolucao({
      tipo: 'duplicidade', acao: 'adiado',
      membro_principal_id: a, membro_secundario_id: b,
      origem: 'entradas_pares_adiados', origem_id: key,
      detalhe: { motivo: motivo || 'Não tenho certeza', confianca: confianca ?? null },
      resolvido_por: req.user?.id || null,
    });
    invalidarTriagemPessoas();
    res.json({ ok: true });
  } catch (e) {
    console.error('[next-batismo/adiar-duplicata]', e.message);
    res.status(500).json({ error: e.message || 'Erro ao adiar' });
  }
});

// ── POST /reativar-duplicata · "trazer de volta" pra fila ativa (manual) ─────
router.post('/reativar-duplicata', authorizeModule('next-batismo', 2), async (req, res) => {
  try {
    const { membro_a_id, membro_b_id } = req.body || {};
    if (!membro_a_id || !membro_b_id) return res.status(400).json({ error: 'membro_a_id e membro_b_id obrigatórios' });
    const [a, b] = [membro_a_id, membro_b_id].sort();
    const { error } = await supabase.from('entradas_pares_adiados')
      .update({ reativado_em: new Date().toISOString(), reativado_motivo: 'manual' })
      .eq('par_key', `${a}_${b}`).is('reativado_em', null);
    if (error && !tabelaAdiadosAusente(error.message)) throw error;
    await registrarResolucao({
      tipo: 'duplicidade', acao: 'reativado',
      membro_principal_id: a, membro_secundario_id: b,
      origem: 'entradas_pares_adiados', origem_id: `${a}_${b}`,
      resolvido_por: req.user?.id || null,
    });
    invalidarTriagemPessoas();
    res.json({ ok: true });
  } catch (e) {
    console.error('[next-batismo/reativar-duplicata]', e.message);
    res.status(500).json({ error: e.message || 'Erro ao reativar' });
  }
});

// ── POST /adiar-em-lote · adia de uma vez os pares que SÓ batem pelo nome ─────
// Sem CPF/telefone/e-mail/nascimento em comum, qualquer fusão é chute. Adia
// todos ("não tenho certeza") pra zerar a fila; cada um volta sozinho quando um
// cadastro completo corroborar. Idempotente (upsert por par_key).
router.post('/adiar-em-lote', authorizeModule('next-batismo', 2), async (req, res) => {
  try {
    const criterio = req.body?.criterio || 'nome_apenas';
    if (criterio !== 'nome_apenas') return res.status(400).json({ error: 'Critério inválido' });
    const { ativos } = await montarDuplicados();
    const alvo = ativos.filter(soBateNome);
    if (!alvo.length) return res.json({ ok: true, total: 0 });
    const agora = new Date().toISOString();
    const rows = alvo.map((par) => {
      const [a, b] = [par.membro_a_id, par.membro_b_id].sort();
      return {
        par_key: `${a}_${b}`, membro_a_id: a, membro_b_id: b,
        confianca_no_adiamento: Number.isFinite(Number(par.confianca)) ? Number(par.confianca) : 0,
        prioridade_no_adiamento: par.prioridade || null,
        adiado_por: req.user?.id || null, adiado_em: agora,
        reativado_em: null, reativado_motivo: null,
      };
    });
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase.from('entradas_pares_adiados')
        .upsert(rows.slice(i, i + 500), { onConflict: 'par_key' });
      if (error) {
        if (tabelaAdiadosAusente(error.message)) return res.status(503).json({ error: 'Recurso indisponível: aplique a migration entradas_pares_adiados.' });
        throw error;
      }
    }
    await registrarResolucao({
      tipo: 'duplicidade', acao: 'adiado',
      origem: 'entradas_pares_adiados', origem_id: `lote:${agora}`,
      detalhe: { criterio: 'nome_apenas', total: rows.length },
      resolvido_por: req.user?.id || null,
    });
    invalidarTriagemPessoas();
    res.json({ ok: true, total: rows.length });
  } catch (e) {
    console.error('[next-batismo/adiar-em-lote]', e.message);
    res.status(500).json({ error: e.message || 'Erro ao adiar em lote' });
  }
});

// ── Mesa responsável por origem (NÃO hardcoda pessoa · líder de grupo vem real) ──
const DESK_POR_ORIGEM = {
  decisao: { papel: 'Cuidados', contexto: 'acompanhamento do novo convertido' },
  next:    { papel: 'Integração', contexto: 'inscrição no Next' },
  batismo: { papel: 'Integração', contexto: 'inscrição de batismo' },
};

// ── GET /pessoa/:id · Ficha de Entrada (vitrine) ─────────────────────────────
// Por onde a pessoa entrou (1º toque) · linha do tempo de todos os toques ·
// conexões (família / mesmo contato / mesmo grupo) · quem perguntar. Cada fonte
// roda em try/catch isolado: se a outra sessão (a que unifica a pessoa/NSM)
// reescrever uma tabela, a ficha DEGRADA (some aquele toque) em vez de quebrar.
// Contrato fino de propósito — esta tela é a vitrine, não dona do dado.
router.get('/pessoa/:id', authorizeModule('next-batismo', 1), async (req, res) => {
  try {
    const id = req.params.id;
    const { data: pessoa, error: pErr } = await supabase
      .from('mem_membros')
      .select('id, nome, cpf, telefone, email, status, foto_url, data_nascimento, familia_id, created_at')
      .eq('id', id).is('deleted_at', null).maybeSingle();
    if (pErr) throw pErr;
    if (!pessoa) return res.status(404).json({ error: 'Pessoa não encontrada' });

    const toques = [];
    const quemPerguntar = [];
    const origensVistas = new Set();
    const gruposDaPessoa = [];
    const safe = async (label, fn) => {
      try { await fn(); } catch (e) { console.error(`[next-batismo/pessoa ${label}]`, e.message); }
    };

    // Decisão / convertido
    await safe('decisao', async () => {
      const { data } = await supabase.from('cui_convertidos')
        .select('id, area, data_culto, atendido_apos_culto, created_at')
        .eq('membro_id', id).is('deleted_at', null);
      (data || []).forEach((r) => {
        origensVistas.add('decisao');
        toques.push({
          tipo: 'decisao', titulo: 'Decisão por Jesus',
          contexto: [r.area ? `Área ${String(r.area).toUpperCase()}` : null, r.atendido_apos_culto ? 'já atendido' : 'aguardando contato'].filter(Boolean).join(' · '),
          quando: r.data_culto || r.created_at,
        });
      });
    });

    // Next
    await safe('next', async () => {
      const { data } = await supabase.from('next_inscricoes')
        .select('id, evento_id, created_at').eq('membro_id', id);
      (data || []).forEach((r) => {
        origensVistas.add('next');
        toques.push({ tipo: 'next', titulo: 'Inscrição no Next', contexto: 'Funil de novo convertido', quando: r.created_at });
      });
    });

    // Batismo
    await safe('batismo', async () => {
      const { data } = await supabase.from('batismo_inscricoes')
        .select('id, status, data_batismo, created_at').eq('membro_id', id).is('deleted_at', null);
      (data || []).forEach((r) => {
        origensVistas.add('batismo');
        toques.push({ tipo: 'batismo', titulo: 'Inscrição de batismo', contexto: r.status || 'pendente', quando: r.created_at });
        if (r.data_batismo) toques.push({ tipo: 'batizado', titulo: 'Batizado', contexto: '', quando: r.data_batismo });
      });
    });

    // Grupo (vínculo ativo)
    await safe('grupo', async () => {
      const { data } = await supabase.from('mem_grupo_membros')
        .select('grupo_id, funcao, mem_grupos(id, nome, lider_id)')
        .eq('membro_id', id).is('saiu_em', null).is('deleted_at', null);
      (data || []).forEach((r) => {
        const g = r.mem_grupos;
        if (g) {
          gruposDaPessoa.push(g);
          toques.push({ tipo: 'grupo', titulo: 'Entrou em grupo', contexto: g.nome || '', quando: null });
        }
      });
    });

    // Trilha (marcos da jornada já concluídos)
    await safe('trilha', async () => {
      const { data } = await supabase.from('mem_trilha_valores')
        .select('etapa, concluida, data_conclusao').eq('membro_id', id).eq('concluida', true);
      (data || []).forEach((r) => {
        toques.push({ tipo: 'trilha', titulo: `Trilha · ${r.etapa}`, contexto: 'concluída', quando: r.data_conclusao });
      });
    });

    // Evidências acumuladas pelas portas novas. Mostra quando e de onde CPF,
    // telefone, e-mail, nome ou nascimento foram corroborados.
    await safe('identidade-progressiva', async () => {
      const { data } = await supabase.from('mem_identidade_observacoes')
        .select('origem,nome,cpf,telefone,email,data_nascimento,observado_em')
        .eq('membro_id', id).neq('origem', 'base_legada')
        .order('observado_em', { ascending: true }).limit(100);
      (data || []).forEach((r) => {
        const campos = [r.nome && 'nome', r.cpf && 'CPF', r.telefone && 'telefone',
          r.email && 'e-mail', r.data_nascimento && 'nascimento'].filter(Boolean);
        toques.push({
          tipo: 'identidade', titulo: 'Dados corroborados',
          contexto: `${String(r.origem || 'formulário').replace(/_/g, ' ')} · ${campos.join(', ')}`,
          quando: r.observado_em,
        });
      });
    });

    // Ordena cronológico (toques sem data caem ao fim)
    toques.sort((a, b) => {
      if (!a.quando) return 1; if (!b.quando) return -1;
      return new Date(a.quando) - new Date(b.quando);
    });
    const primeiroComData = toques.find((t) => t.quando);
    const primeiro_toque = primeiroComData
      ? { tipo: primeiroComData.tipo, label: primeiroComData.titulo, quando: primeiroComData.quando }
      : { tipo: 'cadastro', label: 'Cadastro criado', quando: pessoa.created_at };

    // Conexões
    const conexoes = { familia: [], mesmo_contato: [], mesmo_grupo: [] };
    await safe('familia', async () => {
      if (!pessoa.familia_id) return;
      const { data } = await supabase.from('mem_membros')
        .select('id, nome, status').eq('familia_id', pessoa.familia_id).neq('id', id).is('deleted_at', null).limit(20);
      conexoes.familia = data || [];
    });
    await safe('mesmo_contato', async () => {
      const cands = await buscarCandidatos({ cpf: pessoa.cpf, email: pessoa.email, telefone: pessoa.telefone }, { limit: 10 });
      conexoes.mesmo_contato = cands.filter((c) => c.id !== id)
        .map((c) => ({ id: c.id, nome: c.nome, status: c.status, motivos: c.motivos }));
    });
    await safe('mesmo_grupo', async () => {
      const ids = gruposDaPessoa.map((g) => g.id).filter(Boolean);
      if (!ids.length) return;
      const { data } = await supabase.from('mem_grupo_membros')
        .select('membro_id, mem_membros(id, nome, status), mem_grupos(nome)')
        .in('grupo_id', ids).neq('membro_id', id).is('saiu_em', null).is('deleted_at', null).limit(30);
      const seen = new Set();
      (data || []).forEach((r) => {
        const m = r.mem_membros;
        if (m && !seen.has(m.id)) { seen.add(m.id); conexoes.mesmo_grupo.push({ id: m.id, nome: m.nome, status: m.status, grupo: r.mem_grupos?.nome || '' }); }
      });
    });

    // Quem perguntar (líder de grupo = nome REAL · mesa por origem = sem nome)
    await safe('quem-perguntar', async () => {
      const liderIds = [...new Set(gruposDaPessoa.map((g) => g.lider_id).filter(Boolean))];
      if (liderIds.length) {
        const { data } = await supabase.from('mem_membros').select('id, nome, telefone').in('id', liderIds);
        const byId = new Map((data || []).map((m) => [m.id, m]));
        gruposDaPessoa.forEach((g) => {
          const l = g.lider_id && byId.get(g.lider_id);
          if (l) quemPerguntar.push({ papel: 'Líder do grupo', nome: l.nome, contexto: g.nome || '', telefone: l.telefone || null });
        });
      }
      origensVistas.forEach((o) => {
        const d = DESK_POR_ORIGEM[o];
        if (d) quemPerguntar.push({ papel: d.papel, nome: null, contexto: d.contexto });
      });
    });

    // Contatos ACUMULADOS (mem_contatos · telefones/e-mails de outras portas)
    let contatos = [];
    await safe('contatos', async () => {
      const { data } = await supabase.from('mem_contatos')
        .select('tipo, valor, fonte, ultimo_visto')
        .eq('membro_id', id).is('deleted_at', null)
        .order('ultimo_visto', { ascending: false }).limit(20);
      contatos = data || [];
    });

    res.json({
      pessoa: { ...pessoa, criado_em: pessoa.created_at },
      primeiro_toque, toques, conexoes, quem_perguntar: quemPerguntar, contatos,
    });
  } catch (e) {
    console.error('[next-batismo/pessoa]', e.message);
    res.status(500).json({ error: e.message || 'Erro ao montar ficha' });
  }
});

// ── POST /fundir · merge_membros (sensível · nível 3) ─────────────────────────
// Fusão "melhor de cada": o merge_membros mantém um cadastro e só preenche os
// campos VAZIOS a partir do absorvido. Quando os dois lados têm valores que
// DIVERGEM, o operador escolhe no comparador qual vence e manda em `campos`;
// `montarPatchFusao` (serviço compartilhado) fixa esses campos no mantido DEPOIS
// da fusão (os absorvidos já foram removidos, então não há colisão de UNIQUE).
router.post('/fundir', authorizeModule('next-batismo', 3), async (req, res) => {
  try {
    const { keep_id, merge_ids, observacao, campos } = req.body || {};
    if (!keep_id) return res.status(400).json({ error: 'keep_id obrigatório' });
    if (!Array.isArray(merge_ids) || merge_ids.length === 0) return res.status(400).json({ error: 'merge_ids obrigatório (array de uuids)' });
    const { data, error } = await supabase.rpc('merge_membros', {
      p_keep_id: keep_id,
      p_merge_ids: merge_ids,
      p_feito_por: req.user?.id || null,
      p_observacao: observacao || 'Fusão via Entradas (resolução de identidade)',
    });
    if (error) throw error;
    // Melhor de cada: aplica os campos escolhidos no cadastro mantido.
    const patch = montarPatchFusao(campos);
    let camposAplicados = [];
    if (Object.keys(patch).length) {
      const { error: upErr } = await supabase.from('mem_membros')
        .update(patch).eq('id', keep_id).is('deleted_at', null);
      if (upErr) console.error('[entradas/fundir campos]', upErr.message);
      else camposAplicados = Object.keys(patch);
    }
    invalidarTriagemPessoas();
    const resposta = (data && typeof data === 'object' && !Array.isArray(data)) ? { ...data } : { resultado: data };
    resposta.campos_aplicados = camposAplicados;
    res.json(resposta);
  } catch (e) {
    console.error('[entradas/fundir]', e.message);
    res.status(500).json({ error: e.message || 'Erro ao fundir membros' });
  }
});

module.exports = router;

// ============================================================================
// Módulo de Inscrições · gestão (autenticado) — F3.2 PR 2
// Specs: docs/modulo-inscricoes/fase2-specs.md (5 abas; esta PR = Calendário
// + Eventos). CRUD de séries/eventos da ESPINHA (insc_series/insc_eventos)
// + "Nova edição" (recorrência · decisão Marcos 28/07). A página pública e a
// migração do Eventos Externos chegam nas PRs seguintes — até lá os eventos
// criados aqui ficam tipicamente em rascunho.
// ============================================================================
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { escapePostgrestValue } = require('../utils/sanitize');
const { fetchAllRows } = require('../utils/pagination');
const { verificarTokenComprovanteAtivo, extrairToken } = require('../services/inscricaoComprovante');
const { portasSatelites, fontesUnificadas, catalogoPublico } = require('../services/inscricaoPortas');
// ⚠️ Contagem de inscritos NÃO usa o embed `inscricoes(count)` (não filtra
// soft-delete — ver o cabeçalho do serviço).
const { contarInscritosVivos } = require('../services/inscricaoContagem');
const { normalizarIds, separarExclusaoLote, resumoDoLote } = require('../utils/exclusaoInscricaoLote');
const checkoutExterno = require('../utils/checkoutExterno');
const { sanitizarLotes } = require('../utils/lotesEvento');
const {
  previewTemplate,
  esqueletoPadrao,
  carregarAssinatura,
  sanitizarHtml: sanitizarHtmlEmail,
  TIPOS: TIPOS_EMAIL,
  VARIAVEIS: VARIAVEIS_EMAIL,
} = require('../services/inscricaoEmail');
// A assinatura é editável pela mesma tela, mas não é um e-mail — por isso entra
// só na lista do CRUD, não em TIPOS (que é o vocabulário dos envios).
const TIPOS_EDITAVEIS = [...TIPOS_EMAIL, 'assinatura'];
const { enviarEmail } = require('../services/email');
// Push pro app de membros quando um evento é publicado (broadcast).
const { notificarApp } = require('../services/appPush');
// CPF com DV pelo canônico do Contrato de Inscrição — NÃO recriar cópia local
// (era assim que as réguas divergiam entre as portas).
const { cpfValido } = require('../services/inscricaoContrato');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

router.use(authenticate);

function slugify(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'evento';
}

// key OPACA e estável dos campos extras (mesma regra do form-builder do ext:
// gerada 1x, NUNCA re-derivada do label — senão orfana respostas antigas)
// ⚠️ Chave de campo é PRESERVADA byte a byte quando já existe — mudar a chave é o
// que orfana resposta já gravada. Ver o incidente do Celebra em utils/campoKey.js.
const { keyCampoPreservada } = require('../utils/campoKey');

const TIPOS_CAMPO = ['texto', 'textarea', 'email', 'select', 'escolha', 'multi', 'rede_social', 'imagem', 'numero', 'data'];

/**
 * Condição de exibição (`mostrar_se`) — a pergunta só aparece quando a
 * pergunta-mãe foi respondida com um dos valores listados (17/08 · perguntas do
 * retiro 2027). Régua de exibição em `utils/camposCondicionais.js`, usada pela
 * tela E pelo servidor.
 *
 * ⚠️ Sanear é NORMALIZAR, não julgar: a `key` da mãe pode não existir ainda
 * (a pessoa está montando o formulário e vai criar a pergunta depois), e recusar
 * aqui travaria o salvamento no meio da montagem. Condição órfã é tratada como
 * FAIL-OPEN na exibição — a pergunta aparece, que é o comportamento de antes.
 */
function sanitizeMostrarSe(bruto) {
  if (!bruto || typeof bruto !== 'object') return null;
  const key = String(bruto.key ?? '').trim().slice(0, 60);
  if (!key) return null;
  const brutos = Array.isArray(bruto.valores) ? bruto.valores : (bruto.valor !== undefined ? [bruto.valor] : []);
  const valores = [...new Set(brutos.map(v => String(v ?? '').trim()).filter(Boolean))].slice(0, 20);
  if (!valores.length) return null;
  return { key, valores };
}

function sanitizeCampos(campos) {
  if (!Array.isArray(campos)) return [];
  return campos
    .filter(c => c && String(c.label || '').trim())
    .slice(0, 40)
    .map(c => {
      const campo = {
        key: keyCampoPreservada(c.key),
        label: String(c.label).trim().slice(0, 200),
        tipo: TIPOS_CAMPO.includes(c.tipo) ? c.tipo : 'texto',
        obrigatorio: c.obrigatorio !== false,
        opcoes: Array.isArray(c.opcoes) ? c.opcoes.map(o => String(o).trim()).filter(Boolean).slice(0, 60) : [],
      };
      // ⚠️ Só grava a chave quando existe condição: `mostrar_se: null` em todo
      // campo poluiria o jsonb dos 3 eventos que já estão no ar sem ganho nenhum.
      const cond = sanitizeMostrarSe(c.mostrar_se);
      if (cond) campo.mostrar_se = cond;
      return campo;
    });
}

/**
 * Aceites próprios do evento (`termos_extra`).
 *
 * ⚠️ `chave` é o identificador ESTÁVEL do termo, e é ele que distingue um aceite
 * do outro no ledger de consentimentos. Derivá-la do título faria renomear
 * "Informações Sobre o Retiro" orfanar a prova de quem já aceitou — a MESMA lei
 * do `novaKeyCampo` (ver utils/campoKey.js). Então: chave que já veio é
 * PRESERVADA; só nasce nova quando não existe nenhuma.
 *
 * ⚠️ Item sem texto é DESCARTADO, nunca gravado vazio: checkbox que diz "li e
 * aceito" sem nada pra ler é consentimento sem objeto.
 */
function sanitizeTermosExtra(lista) {
  if (!Array.isArray(lista)) return null;
  const usadas = new Set();
  return lista
    .map((t) => {
      if (!t || typeof t !== 'object') return null;
      const texto = String(t.texto ?? '').trim().slice(0, 4000);
      if (!texto) return null;
      let chave = String(t.chave ?? '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 40);
      if (!chave || usadas.has(chave)) chave = `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      usadas.add(chave);
      const item = { chave, titulo: String(t.titulo ?? '').trim().slice(0, 160) || 'Termo do evento', texto };
      const url = String(t.url ?? '').trim();
      if (/^https:\/\/[^\s/@]+\.[^\s/@]+/.test(url)) item.url = url.slice(0, 500);
      // ⚠️ Aceite que vale SÓ pra menor de idade (ex.: "Termos de
      // Responsabilidade — Menor de idade", do PDF do retiro). Sem esta chave,
      // todo aceite é obrigatório pra TODO MUNDO, e um adulto de 40 anos teria
      // que aceitar um termo de responsabilidade sobre si mesmo como menor.
      if (t.so_menor === true) item.so_menor = true;
      return item;
    })
    .filter(Boolean)
    .slice(0, 6);
}

// Rótulo da edição a partir da data (mensal/semanal → 'YYYY-MM' · anual → 'YYYY')
function rotuloEdicao(periodicidade, dataISO) {
  const s = String(dataISO || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return periodicidade === 'anual' ? s.slice(0, 4) : s.slice(0, 7);
}

async function slugUnico(base) {
  let slug = base;
  for (let i = 2; i < 60; i++) {
    const { data } = await supabase.from('insc_eventos').select('id').eq('slug', slug).limit(1);
    if (!data || !data.length) return slug;
    slug = `${base}-${i}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

// Área obrigatória (28/07) — SEMPRE do catálogo oficial `areas` (nunca lista
// paralela). "Administração" é a opção agregada das áreas administrativas.
async function areaValida(nome) {
  const n = String(nome || '').trim();
  if (!n) return null;
  if (/^administra/i.test(n)) return 'Administração';
  const { data } = await supabase.from('areas')
    .select('nome').eq('ativo', true).ilike('nome', n).limit(1);
  return data && data.length ? data[0].nome : null;
}

const CAMPOS_EVENTO = [
  'nome', 'descricao', 'data', 'hora', 'local', 'capa_url', 'vagas',
  'inscricoes_abrem_em', 'inscricoes_encerram_em',
  'msg_sucesso_titulo', 'msg_sucesso_texto', 'msg_whatsapp',
  'tem_sorteio', 'premios', 'checkin_ativo',
  'pagamento_ativo', 'valor_centavos', 'pagamento_expira_horas',
  // Teto de parcelas e quem paga os juros — por EVENTO, porque quem define é a
  // data em que a igreja paga o local (migration 20260729040000).
  'parcelas_max', 'juros_repassados',
  // Aparece na lista do totem do lounge? Default false no banco: publicar um
  // evento NÃO o expõe no hall (migration 20260805150000).
  'no_totem',
  // Cartão cobrado FORA (e-Inscrição) · migration 20260811180000. Preenchido,
  // remove 'cartao' do nosso checkout — ver backend/utils/checkoutExterno.js.
  // `checkout_externo_valor_centavos` (20260821190000) é só EXIBIÇÃO: o preço
  // do cartão na plataforma deles, pra tela de escolha dizer "R$ 850 no cartão
  // · R$ 830 no Pix". Nenhuma cobrança nossa lê esse número.
  'checkout_externo_url', 'checkout_externo_nome', 'checkout_externo_valor_centavos',
  // Retiro/viagem (migration 20260817160000): endereço obrigatório neste evento
  // e bloco do responsável quando a pessoa é menor de 18 na inscrição.
  // ⚠️ `termos_extra` NÃO entra nesta lista — é jsonb e passa pelo saneador
  // próprio (`sanitizeTermosExtra`), igual a `pagamento_metodos`.
  'exigir_endereco', 'exige_dados_menor',
  // Período (retiro de vários dias) + instruções gerais pra download/e-mail
  // (migration 20260820120000). Nullable: limpar é edição legítima.
  'data_fim', 'instrucoes_url', 'instrucoes_nome',
  // Grupo de WhatsApp pra dúvidas, exibido nas telas públicas (20260821150000).
  'whatsapp_duvidas_url',
];

// ⚠️ INCIDENTE 2026-08-04 · colunas NOT NULL da whitelist acima.
// A Ariel não conseguia salvar edição de evento: 500 com
// `null value in column "pagamento_expira_horas" violates not-null constraint`
// (5 ocorrências no runtime, 11:46–11:51 BRT). O form mandava `null` nesse campo
// sempre que o pagamento estava desligado ou o campo estava vazio — então a edição
// de QUALQUER evento sem pagamento quebrava, não era caso dela.
//
// A regra: nestas colunas `null` do cliente significa "não informado", NUNCA
// "apagar" — apagar é impossível, o banco recusa e derruba o UPDATE inteiro, com
// todos os outros campos que a pessoa editou. Então o null é DESCARTADO e o valor
// atual permanece. Coluna nullable (valor_centavos, parcelas_max, vagas, data…)
// segue aceitando null, porque ali limpar é uma edição legítima.
//
// Lista conferida no catálogo (is_nullable='NO'), não decorada.
const CAMPOS_EVENTO_NAO_NULO = new Set([
  'tem_sorteio', 'premios', 'checkin_ativo',
  'pagamento_ativo', 'pagamento_expira_horas', 'juros_repassados',
  'no_totem',
  // migration 20260817160000 · boolean NOT NULL DEFAULT false
  'exigir_endereco', 'exige_dados_menor',
]);

// Copia a whitelist pro patch, descartando null onde o banco não aceita.
function aplicarCamposEvento(b, patch) {
  for (const k of CAMPOS_EVENTO) {
    if (b[k] === undefined) continue;
    if (b[k] === null && CAMPOS_EVENTO_NAO_NULO.has(k)) continue;
    patch[k] = b[k];
  }
  return patch;
}

/**
 * Link do checkout externo: recusa ANTES do banco, com mensagem que diz o que
 * fazer. O CHECK da migration é a rede de segurança; quem tem que explicar o
 * erro é a rota — 23514 cru chega na tela como "Erro ao salvar evento".
 *
 * ⚠️ Limpar é edição legítima (string vazia ⇒ NULL ⇒ o cartão volta pro nosso
 * checkout), então vazio NÃO é erro. Distinguir "não mandou o campo"
 * (`undefined`, não mexe) de "mandou vazio" (limpa) é o que permite tirar o
 * e-Inscrição de um evento sem ter que apagar o evento.
 */
function conferirCheckoutExterno(patch) {
  if (patch.checkout_externo_url === undefined) return null;
  const bruto = String(patch.checkout_externo_url ?? '').trim();
  if (!bruto) { patch.checkout_externo_url = null; return null; }
  const url = checkoutExterno.linkExternoValido(bruto);
  if (!url) {
    return 'O link do checkout externo precisa começar com https:// e apontar para um site '
      + '(ex.: https://www.e-inscricao.com/…). Deixe em branco para cobrar o cartão por aqui.';
  }
  patch.checkout_externo_url = url;
  if (patch.checkout_externo_nome !== undefined) {
    const nome = String(patch.checkout_externo_nome ?? '').trim();
    patch.checkout_externo_nome = nome ? nome.slice(0, 40) : null;
  }
  return null;
}

/**
 * Preço do cartão na plataforma externa — só pra tela.
 *
 * ⚠️ Vazio/0/lixo ⇒ NULL (a tela volta a não prometer preço de cartão), nunca
 * 0: "R$ 0,00 no cartão" numa tela de escolha é promessa de gratuidade. Teto
 * igual ao do CHECK do banco pra o typo (8500000 no lugar de 85000) ser
 * recusado com mensagem, não com 23514.
 */
function sanitizeValorCartaoExterno(patch) {
  if (patch.checkout_externo_valor_centavos === undefined) return null;
  const bruto = patch.checkout_externo_valor_centavos;
  if (bruto === null || bruto === '') { patch.checkout_externo_valor_centavos = null; return null; }
  const n = Math.round(Number(bruto));
  if (!Number.isFinite(n) || n <= 0) { patch.checkout_externo_valor_centavos = null; return null; }
  if (n > 10000000) {
    return 'O valor do cartão na outra plataforma passou de R$ 100.000 — confira se não sobrou um zero.';
  }
  patch.checkout_externo_valor_centavos = n;
  return null;
}

// `pagamento_metodos` é TEXT[] e fica FORA do loop de whitelist de propósito:
// string crua no lugar de array quebra o insert. Só os métodos que o checkout
// público oferece — dinheiro/transferência são lançamento manual, não opção da
// pessoa. Vocabulário alinhado a services/pagamentos/tipos.js (METODOS).
const METODOS_CHECKOUT = ['pix', 'cartao', 'boleto', 'apple_pay'];
function sanitizeMetodos(v) {
  if (!Array.isArray(v)) return null;
  return [...new Set(v.map((m) => String(m).trim()).filter((m) => METODOS_CHECKOUT.includes(m)))];
}

// GET /areas — catálogo oficial pro select do form.
// Feedback do Marcos (28/07): áreas ADMINISTRATIVAS não fazem inscrição —
// colapsam numa opção única "Administração" (RH, Patrimônio, T.I.,
// Financeiro, Logística…). Detecção por nome do setor OU da área.
const RE_ADMIN = /gest[aã]o|administra|operac|recursos humanos|\brh\b|patrim|financeir|log[íi]st|tecnologia|\bt\.?i\.?\b|jur[íi]dic|contab|secretar/i;
router.get('/areas', authorizeModule('inscricoes', 1), async (_req, res) => {
  try {
    const { data, error } = await supabase.from('areas')
      .select('id, nome, setor:setores(nome)').eq('ativo', true).order('nome');
    if (error) throw error;
    const naoAdmin = (data || []).filter(a => !RE_ADMIN.test(a.nome || '') && !RE_ADMIN.test(a.setor?.nome || ''));
    res.json([...naoAdmin.map(a => ({ id: a.id, nome: a.nome })), { id: 'administracao', nome: 'Administração' }]);
  } catch (e) {
    console.error('[inscricoes] areas:', e.message);
    res.json([{ id: 'administracao', nome: 'Administração' }]);
  }
});

// GET /series
router.get('/series', authorizeModule('inscricoes', 1), async (_req, res) => {
  try {
    const { data, error } = await supabase.from('insc_series')
      .select('id, nome, slug_base, area, periodicidade, tipo, ativo, recorre_ate')
      .is('deleted_at', null).order('nome');
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('[inscricoes] series:', e.message);
    res.status(500).json({ error: 'Erro ao listar séries' });
  }
});

// PUT /series/:id — nome / recorrente-até / ativo
router.put('/series/:id', authorizeModule('inscricoes', 3), async (req, res) => {
  try {
    const b = req.body || {};
    const patch = {};
    if (b.nome !== undefined) {
      const nome = String(b.nome).trim();
      if (nome.length < 2) return res.status(400).json({ error: 'Informe o nome da série' });
      patch.nome = nome;
    }
    if (b.recorre_ate !== undefined) {
      patch.recorre_ate = b.recorre_ate && /^\d{4}-\d{2}-\d{2}$/.test(String(b.recorre_ate))
        ? String(b.recorre_ate) : null;
    }
    if (b.ativo !== undefined) patch.ativo = !!b.ativo;
    const { data, error } = await supabase.from('insc_series')
      .update(patch).eq('id', req.params.id).is('deleted_at', null).select('id').single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[inscricoes] atualizar série:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar série' });
  }
});

// GET /unificadas — busca única sobre TODAS as portas (SPEC-03 · aba "Todas
// as inscrições" · vw_inscricoes_unificadas). Filtros: q (nome/CPF/telefone),
// porta, status canônico, área, período (de/ate), page. A view é REVOGADA de
// anon/authenticated — só o backend (service_role) lê.
const PORTAS_UNIFICADAS = fontesUnificadas();
const STATUS_CANONICOS = ['recebida', 'em_tratamento', 'confirmada', 'concluida', 'nao_concluida', 'recusada', 'cancelada'];
router.get('/unificadas', authorizeModule('inscricoes', 1), async (req, res) => {
  try {
    const page = Math.max(0, parseInt(req.query.page) || 0);
    const porPagina = Math.min(1000, Math.max(10, parseInt(req.query.limit) || 50));
    let q = supabase.from('vw_inscricoes_unificadas')
      .select('*', { count: 'exact' })
      .order('criado_em', { ascending: false })
      .range(page * porPagina, page * porPagina + porPagina - 1);

    if (PORTAS_UNIFICADAS.includes(req.query.porta)) q = q.eq('porta', req.query.porta);
    if (STATUS_CANONICOS.includes(req.query.status)) q = q.eq('status_canonico', req.query.status);
    if (req.query.area) q = q.eq('area_display', String(req.query.area).slice(0, 60));
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(req.query.de || ''))) q = q.gte('criado_em', `${req.query.de}T00:00:00-03:00`);
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(req.query.ate || ''))) q = q.lte('criado_em', `${req.query.ate}T23:59:59-03:00`);

    const busca = String(req.query.q || '').trim().slice(0, 120);
    if (busca) {
      const digits = busca.replace(/\D/g, '');
      if (digits.length >= 8) {
        // CPF/telefone (digits-only nas colunas *_norm — injeção impossível: só dígitos)
        q = q.or(`cpf_norm.like.%${digits}%,telefone_norm.like.%${digits}%`);
      } else {
        q = q.ilike('nome_display', `%${escapePostgrestValue(busca)}%`);
      }
    }

    const { data, error, count } = await q;
    if (error) throw error;
    res.json({ items: data || [], total: count ?? 0, page, porPagina });
  } catch (e) {
    console.error('[inscricoes] unificadas:', e.message);
    res.status(500).json({ error: 'Erro na busca unificada' });
  }
});

// Lê a view unificada INTEIRA paginando o cap de 1000 do PostgREST (regra
// permanente do CLAUDE.md) — base do rollup de pessoas, do dashboard e do
// inventário de portas. `colunas` estreita o payload quando o consumidor não
// precisa da linha inteira.
async function lerViewUnificada(filtro = (q) => q, colunas = '*') {
  const out = [];
  for (let off = 0; ; off += 1000) {
    const { data, error } = await filtro(
      supabase.from('vw_inscricoes_unificadas').select(colunas).range(off, off + 999)
    );
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

// Âncora de pessoa (mesma régua do Cuidados/trilha · contrato de porta):
// membro_id > CPF > telefone > nome normalizado.
function chavePessoa(i) {
  if (i.membro_id) return `m:${i.membro_id}`;
  if (i.cpf_norm) return `c:${i.cpf_norm}`;
  if (i.telefone_norm) return `t:${i.telefone_norm}`;
  const nome = String(i.nome_display || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  return `n:${nome}`;
}

// GET /unificadas/pessoas — rollup por PESSOA (aba Pessoas · nível ≥2, PII
// concentrada). Default: só quem tem 2+ inscrições (o propósito da aba é
// conferência de sobreposição); ?todas=1 pagina o universo; ?q= busca.
router.get('/unificadas/pessoas', authorizeModule('inscricoes', 2), async (req, res) => {
  try {
    const linhas = await lerViewUnificada();
    const mapa = new Map();
    for (const i of linhas) {
      const k = chavePessoa(i);
      if (!mapa.has(k)) {
        mapa.set(k, {
          chave: k, membro_id: i.membro_id || null, nome: i.nome_display,
          cpf: i.cpf_norm || null, telefone: i.telefone_norm || null,
          areas: new Set(), portas: new Set(), inscricoes: [],
        });
      }
      const p = mapa.get(k);
      if (!p.membro_id && i.membro_id) p.membro_id = i.membro_id;
      if (!p.cpf && i.cpf_norm) p.cpf = i.cpf_norm;
      if (!p.telefone && i.telefone_norm) p.telefone = i.telefone_norm;
      if (i.area_display) p.areas.add(i.area_display);
      p.portas.add(i.porta);
      p.inscricoes.push({
        porta: i.porta, evento_rotulo: i.evento_rotulo, edicao_rotulo: i.edicao_rotulo,
        criado_em: i.criado_em, status_canonico: i.status_canonico, rota_detalhe: i.rota_detalhe,
      });
    }

    let pessoas = [...mapa.values()].map(p => ({
      ...p,
      areas: [...p.areas], portas: [...p.portas],
      total: p.inscricoes.length,
      inscricoes: p.inscricoes
        .sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)))
        .slice(0, 20),
    }));

    const busca = String(req.query.q || '').trim().toLowerCase();
    if (busca) {
      const digits = busca.replace(/\D/g, '');
      pessoas = pessoas.filter(p =>
        String(p.nome || '').toLowerCase().includes(busca)
        || (digits.length >= 4 && (String(p.cpf || '').includes(digits) || String(p.telefone || '').includes(digits))));
    } else if (req.query.todas !== '1') {
      pessoas = pessoas.filter(p => p.total >= 2);
    }

    pessoas.sort((a, b) => b.total - a.total || String(a.nome).localeCompare(String(b.nome)));
    const page = Math.max(0, parseInt(req.query.page) || 0);
    const porPagina = 50;
    res.json({
      total_pessoas: pessoas.length,
      total_inscricoes: linhas.length,
      page,
      items: pessoas.slice(page * porPagina, (page + 1) * porPagina),
    });
  } catch (e) {
    console.error('[inscricoes] unificadas/pessoas:', e.message);
    res.status(500).json({ error: 'Erro no rollup de pessoas' });
  }
});

// GET /unificadas/dashboard — agregações da aba Dashboard (SPEC-09) sobre a
// view unificada, com filtros tempo/área/porta. Arrecadação vem de
// insc_pagamentos pagos (nasce zerada — decisão do Marcos — e acorda sozinha
// quando o Pix da F3.3 entrar). Comparecimento só conta portas mensuráveis
// (compareceu IS NOT NULL). Fuso das séries diárias: America/Sao_Paulo.
router.get('/unificadas/dashboard', authorizeModule('inscricoes', 1), async (req, res) => {
  try {
    const de = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.de || '')) ? String(req.query.de) : null;
    const ate = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.ate || '')) ? String(req.query.ate) : null;
    const linhas = await lerViewUnificada((q) => {
      let f = q;
      if (de) f = f.gte('criado_em', `${de}T00:00:00-03:00`);
      if (ate) f = f.lte('criado_em', `${ate}T23:59:59-03:00`);
      if (PORTAS_UNIFICADAS.includes(req.query.porta)) f = f.eq('porta', req.query.porta);
      if (req.query.area) f = f.eq('area_display', String(req.query.area).slice(0, 60));
      return f;
    });
    const validas = linhas.filter(l => l.status_canonico !== 'cancelada');

    const hoje = new Date().toISOString().slice(0, 10);
    const chaveEvento = (l) => l.evento_ref ? `${l.porta}:${l.evento_ref}` : (l.serie_chave ? `${l.serie_chave}:${l.edicao_rotulo || ''}` : null);
    const eventos = new Map();
    for (const l of validas) {
      const k = chaveEvento(l);
      if (!k) continue;
      if (!eventos.has(k)) eventos.set(k, { rotulo: l.evento_rotulo, data: l.evento_data, total: 0 });
      eventos.get(k).total += 1;
    }
    const realizados = [...eventos.values()].filter(e => e.data && e.data < hoje).length;

    const mensuraveis = validas.filter(l => l.compareceu !== null && l.compareceu !== undefined);
    const presentes = mensuraveis.filter(l => l.compareceu === true).length;

    // arrecadação real (centavos) — pagos do motor; hoje 0 (Pix = F3.3)
    let arrecadacao = 0;
    try {
      const { data: pagos } = await supabase.from('insc_pagamentos')
        .select('valor_centavos').eq('status', 'pago').limit(10000);
      arrecadacao = (pagos || []).reduce((s, p) => s + (p.valor_centavos || 0), 0);
    } catch { /* tabela do motor pode evoluir na F3.3 — card fica em 0 */ }

    // série diária (BRT)
    const porDia = new Map();
    const fmtBRT = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
    for (const l of validas) {
      const d = fmtBRT.format(new Date(l.criado_em));
      porDia.set(d, (porDia.get(d) || 0) + 1);
    }
    const serieDiaria = [...porDia.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      .map(([data, total]) => ({ data, total }));

    // comparador de edições (SPEC-10): série derivada/nativa → edições ordenadas
    const series = new Map();
    for (const l of validas) {
      if (!l.serie_chave || !l.edicao_rotulo) continue;
      if (!series.has(l.serie_chave)) series.set(l.serie_chave, new Map());
      const ed = series.get(l.serie_chave);
      ed.set(l.edicao_rotulo, (ed.get(l.edicao_rotulo) || 0) + 1);
    }
    const comparador = [...series.entries()]
      .map(([serie, ed]) => ({
        serie,
        total: [...ed.values()].reduce((s, n) => s + n, 0),
        edicoes: [...ed.entries()].sort((a, b) => a[0].localeCompare(b[0]))
          .map(([edicao, total]) => ({ edicao, total })),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);

    const ranking = [...eventos.values()].sort((a, b) => b.total - a.total).slice(0, 10);
    const porPorta = {};
    for (const l of validas) porPorta[l.porta] = (porPorta[l.porta] || 0) + 1;

    res.json({
      cards: {
        inscricoes_total: validas.length,
        eventos_realizados: realizados,
        media_por_evento: eventos.size ? Math.round((validas.length / eventos.size) * 10) / 10 : 0,
        arrecadacao_centavos: arrecadacao,
        comparecimento_pct: mensuraveis.length ? Math.round((presentes / mensuraveis.length) * 1000) / 10 : null,
        comparecimento_base: mensuraveis.length,
      },
      serie_diaria: serieDiaria,
      comparador,
      ranking,
      por_porta: porPorta,
    });
  } catch (e) {
    console.error('[inscricoes] unificadas/dashboard:', e.message);
    res.status(500).json({ error: 'Erro no dashboard' });
  }
});

// ── Portas públicas do sistema (inventário · pedido do Marcos 28/07) ────────
// A aba Eventos mostra a espinha; este endpoint completa o "cérebro" com as
// OUTRAS portas públicas de inscrição (grupos, next, batismo, apresentação,
// voluntariado, líderes) — 1 card por porta, detalhe no modal. É INVENTÁRIO
// somente-leitura: nenhuma escrita por aqui, nem super-admin — cada porta tem
// lógica-satélite no módulo dono (broadcast de temporada, turma do totem, 4º
// domingo calculado) e um segundo caminho de escrita antes da F3.5 é a classe
// de bug que o desenho evita. "Operar daqui" chega com a F3.5 (SPEC-10 t2).
const PORTAS_SISTEMA = portasSatelites();

// Aberto/fechado é BEST-EFFORT por porta (falha → null = "não sei", nunca 500):
// grupos = temporada com inscrições abertas · next = turma aberta · demais são
// portas contínuas (o formulário não fecha).
async function statusPortas() {
  const st = { grupos: { aberta: null, detalhe: null }, next: { aberta: null, detalhe: null } };
  try {
    const { data, error } = await supabase.from('mem_temporadas')
      .select('label, inscricoes_abertas').eq('inscricoes_abertas', true).limit(1);
    if (error) throw error;
    st.grupos = data && data.length
      ? { aberta: true, detalhe: data[0].label || 'temporada aberta' }
      : { aberta: false, detalhe: 'nenhuma temporada com inscrições abertas' };
  } catch (e) { console.error('[inscricoes] portas/status grupos:', e.message); }
  try {
    const { data, error } = await supabase.from('next_turmas')
      .select('nome').eq('status', 'aberta').is('deleted_at', null).limit(1);
    if (error) throw error;
    st.next = data && data.length
      ? { aberta: true, detalhe: data[0].nome || 'turma aberta' }
      : { aberta: false, detalhe: 'nenhuma turma aberta' };
  } catch (e) { console.error('[inscricoes] portas/status next:', e.message); }
  return st;
}

// Agregação preferencial no PostgreSQL: o endpoint deixa de transportar a view
// inteira para o Node. O fallback preserva a implantação em duas etapas
// (código antes/depois da migration) e o contrato antigo da resposta.
async function resumoPortas(fontes) {
  const corte30d = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data, error } = await supabase.rpc('fn_insc_portas_resumo', {
    p_portas: fontes,
    p_corte_30d: corte30d,
  });
  if (!error && Array.isArray(data)) {
    const mapa = new Map();
    for (const linha of data) {
      if (!mapa.has(linha.porta)) {
        mapa.set(linha.porta, {
          total: Number(linha.total || 0),
          ultimos_30d: Number(linha.ultimos_30d || 0),
          edicoes: [],
        });
      }
      if (linha.edicao_rotulo) {
        mapa.get(linha.porta).edicoes.push({
          rotulo: linha.edicao_rotulo,
          total: Number(linha.edicao_total || 0),
          ultima_em: linha.ultima_em || null,
        });
      }
    }
    return mapa;
  }

  if (error) {
    console.warn('[inscricoes] fn_insc_portas_resumo indisponível; usando fallback compatível:', error.message);
  }
  const linhas = await lerViewUnificada(
    (q) => q.in('porta', fontes),
    'porta, edicao_rotulo, status_canonico, criado_em',
  );
  const mapa = new Map();
  for (const linha of linhas) {
    if (linha.status_canonico === 'cancelada') continue;
    if (!mapa.has(linha.porta)) mapa.set(linha.porta, { total: 0, ultimos_30d: 0, edicoes: [] });
    const item = mapa.get(linha.porta);
    item.total += 1;
    if (linha.criado_em >= corte30d) item.ultimos_30d += 1;
    const rotulo = linha.edicao_rotulo || 'sem edição';
    let edicao = item.edicoes.find((e) => e.rotulo === rotulo);
    if (!edicao) {
      edicao = { rotulo, total: 0, ultima_em: null };
      item.edicoes.push(edicao);
    }
    edicao.total += 1;
    if (!edicao.ultima_em || linha.criado_em > edicao.ultima_em) edicao.ultima_em = linha.criado_em;
  }
  return mapa;
}

// GET /pagamento-saude — estado da credencial do PSP, pra tela avisar ANTES de
// um lançamento. A chave do Asaas expira por desuso (3 meses desabilita, 6
// expira) e o sistema só fala com o PSP quando há cobrança; ver
// services/pagamentos/saude.js.
//
// `?verificar=1` força a sonda AGORA (bate no PSP) — por isso exige nível 3,
// enquanto ler o último resultado é nível 1.
router.get('/pagamento-saude', authorizeModule('inscricoes', 1), async (req, res) => {
  try {
    const pagamentos = require('../services/pagamentos');
    if (req.query.verificar === '1') {
      const nivel = req.user?.granular?.modulePerms?.inscricoes?.leitura ?? 0;
      if (nivel < 3) return res.status(403).json({ error: 'sem permissão para forçar a verificação' });
      await pagamentos.verificarSaude({ forcar: true });
    }
    res.json(await pagamentos.saudeAtual());
  } catch (e) {
    // Tabela ausente (migration não aplicada) ou PSP fora do ar não pode
    // derrubar a aba — devolve aviso, não 500. Deploy em duas etapas.
    console.error('[inscricoes] pagamento-saude:', e.message);
    res.json({ aviso: 'não foi possível ler o estado da credencial', detalhe: e.message });
  }
});

// GET /portas — inventário das portas públicas + contagens/edições da view
// unificada (as séries DERIVADAS do SPEC-10 t1 já dão edição por porta:
// batismo/apresentação = mês, next = turma, grupos = temporada).
router.get('/portas', authorizeModule('inscricoes', 1), async (_req, res) => {
  try {
    const todasPortas = PORTAS_SISTEMA.flatMap((p) => p.portas);
    const [resumos, st] = await Promise.all([
      resumoPortas(todasPortas),
      statusPortas(),
    ]);

    const portas = PORTAS_SISTEMA.map((p) => {
      const combinado = { total: 0, ultimos_30d: 0, edicoes: new Map() };
      for (const fonte of p.portas) {
        const resumo = resumos.get(fonte);
        if (!resumo) continue;
        combinado.total += resumo.total;
        combinado.ultimos_30d += resumo.ultimos_30d;
        for (const item of resumo.edicoes) {
          const edicao = combinado.edicoes.get(item.rotulo)
            || { rotulo: item.rotulo, total: 0, ultima_em: null };
          edicao.total += item.total;
          if (!edicao.ultima_em || item.ultima_em > edicao.ultima_em) edicao.ultima_em = item.ultima_em;
          combinado.edicoes.set(item.rotulo, edicao);
        }
      }
      const status = p.continua
        ? { aberta: true, detalhe: 'porta contínua — o formulário não fecha' }
        : (st[p.chave] || { aberta: null, detalhe: null });
      return {
        chave: p.chave, nome: p.nome, modulo: p.modulo,
        link: p.link, gestao: p.gestao, continua: !!p.continua,
        aberta: status.aberta, aberta_detalhe: status.detalhe,
        total: combinado.total,
        ultimos_30d: combinado.ultimos_30d,
        edicoes: [...combinado.edicoes.values()]
          .sort((a, b) => String(b.ultima_em || '').localeCompare(String(a.ultima_em || '')))
          .slice(0, 10),
      };
    });
    // `portas` permanece compatível. `catalogo` é aditivo e inclui também o
    // motor de eventos, suas fontes e aliases.
    res.json({ portas, catalogo: catalogoPublico() });
  } catch (e) {
    console.error('[inscricoes] portas:', e.message);
    res.status(500).json({ error: 'Erro ao carregar as portas públicas' });
  }
});

// Inventário de QR · o inventário e a reativação chegaram em duas migrations
// (20260729090000 cria as tabelas · 20260729100000 acrescenta a reativação), e
// o deploy é em duas etapas: tabela/coluna ausente NÃO pode virar 500 na tela.
const QR_SELECT_BASE = `id, primeira_emissao_em, ultima_emissao_em, emissoes, canais,
  revogado_em, revogado_por, revogacao_motivo,
  inscricao:inscricoes!inner(id, nome_completo, status, evento_id,
    evento:insc_eventos!inner(id, nome, slug))`;
const QR_SELECT_REATIVACAO = ', reativado_em, reativado_por, reativacao_motivo';
const tabelaAusente = (error) => !!error && ['PGRST205', '42P01'].includes(error.code);
const colunaAusente = (error) => !!error && ['42703', 'PGRST204'].includes(error.code);

// Nomes dos operadores (revogou/reativou) resolvidos em UMA consulta. É rótulo:
// falha aqui não derruba o inventário.
async function nomesDeOperadores(ids) {
  const unicos = [...new Set(ids.filter(Boolean))];
  if (!unicos.length) return {};
  try {
    const { data } = await supabase.from('profiles').select('id, name').in('id', unicos.slice(0, 200));
    return Object.fromEntries((data || []).map((p) => [p.id, p.name]));
  } catch { return {}; }
}

// GET /qrs — inventário seguro: identifica pessoa/evento e estado, mas nunca
// devolve o token bruto (a tabela guarda somente SHA-256). Tokens antigos não
// registrados seguem válidos e aparecem na diferença `elegiveis - registrados`.
// Busca e paginação são SERVER-SIDE: filtrar só a página carregada esconderia
// a maior parte das pessoas num evento do tamanho do Celebra.
router.get('/qrs', authorizeModule('inscricoes', 2), async (req, res) => {
  try {
    const page = Math.max(0, parseInt(req.query.page) || 0);
    const limit = Math.min(200, Math.max(20, parseInt(req.query.limit) || 50));
    const eventoId = /^[0-9a-f-]{36}$/i.test(String(req.query.evento_id || ''))
      ? String(req.query.evento_id) : null;
    const busca = String(req.query.q || '').trim().slice(0, 120);

    const montarLista = (select) => {
      let q = supabase.from('insc_qr_tokens')
        .select(select, { count: 'exact' })
        .order('ultima_emissao_em', { ascending: false })
        .range(page * limit, page * limit + limit - 1);
      if (eventoId) q = q.eq('inscricao.evento_id', eventoId);
      if (busca) q = q.ilike('inscricao.nome_completo', `%${escapePostgrestValue(busca)}%`);
      if (req.query.estado === 'ativo') q = q.is('revogado_em', null);
      if (req.query.estado === 'revogado') q = q.not('revogado_em', 'is', null);
      return q;
    };

    let lista = await montarLista(QR_SELECT_BASE + QR_SELECT_REATIVACAO);
    let temReativacao = true;
    if (colunaAusente(lista.error)) {
      // Migration da reativação ainda não entrou — inventário abre sem ela.
      temReativacao = false;
      lista = await montarLista(QR_SELECT_BASE);
    }
    if (tabelaAusente(lista.error)) {
      return res.json({
        items: [], total_registrados: 0, total_elegiveis: 0, total_paginas: 0,
        page: 0, por_pagina: limit, reativacao_disponivel: false, inventario_disponivel: false,
        aviso: 'O inventário de QR ainda não foi criado no banco (migration pendente).',
      });
    }
    if (lista.error) throw lista.error;

    let elegiveisQuery = supabase.from('inscricoes')
      .select('*', { count: 'exact', head: true })
      .is('deleted_at', null).neq('status', 'cancelada');
    if (eventoId) elegiveisQuery = elegiveisQuery.eq('evento_id', eventoId);
    const elegiveis = await elegiveisQuery;
    if (elegiveis.error) throw elegiveis.error;

    const dados = lista.data || [];
    const nomes = await nomesDeOperadores(
      dados.flatMap((item) => [item.revogado_por, item.reativado_por]),
    );
    const itens = dados.map((item) => ({
      id: item.id,
      primeira_emissao_em: item.primeira_emissao_em,
      ultima_emissao_em: item.ultima_emissao_em,
      emissoes: item.emissoes,
      canais: item.canais,
      ativo: !item.revogado_em,
      revogado_em: item.revogado_em,
      revogacao_motivo: item.revogacao_motivo,
      revogado_por_nome: nomes[item.revogado_por] || null,
      reativado_em: item.reativado_em ?? null,
      reativacao_motivo: item.reativacao_motivo ?? null,
      reativado_por_nome: nomes[item.reativado_por] || null,
      inscricao: item.inscricao,
    }));
    const total = lista.count ?? 0;
    res.json({
      items: itens,
      total_registrados: total,
      total_ativos_pagina: itens.filter((item) => item.ativo).length,
      total_elegiveis: elegiveis.count ?? 0,
      total_paginas: Math.max(1, Math.ceil(total / limit)),
      page,
      por_pagina: limit,
      inventario_disponivel: true,
      reativacao_disponivel: temReativacao,
    });
  } catch (e) {
    console.error('[inscricoes] inventário QR:', e.message);
    res.status(500).json({ error: 'Erro ao carregar o inventário de QR' });
  }
});

// PATCH /qrs/:id/revogar — revogação individual. Não altera inscrição,
// check-in nem segredo global; os demais comprovantes continuam funcionando.
router.patch('/qrs/:id/revogar', authorizeModule('inscricoes', 3), async (req, res) => {
  try {
    const motivo = String(req.body?.motivo || '').trim().slice(0, 500);
    if (motivo.length < 3) return res.status(400).json({ error: 'Informe o motivo da revogação' });
    const { data, error } = await supabase.from('insc_qr_tokens')
      .update({
        revogado_em: new Date().toISOString(),
        revogado_por: req.user?.id || null,
        revogacao_motivo: motivo,
      })
      .eq('id', req.params.id).is('revogado_em', null)
      .select('id, revogado_em').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'QR ativo não encontrado' });
    res.json({ ok: true, ...data });
  } catch (e) {
    console.error('[inscricoes] revogar QR:', e.message);
    res.status(500).json({ error: 'Erro ao revogar o QR' });
  }
});

// PATCH /qrs/:id/reativar — desfaz a revogação. Existe porque o comprovante é
// HMAC determinístico do id da inscrição: revogar NÃO gira segredo e NÃO gera
// QR novo, então sem volta um clique errado tirava a pessoa do check-in por QR
// para sempre. O histórico (quem revogou/reativou e por quê) fica em
// app_audit_log via trigger — a revogação não é apagada da trilha, só do estado.
router.patch('/qrs/:id/reativar', authorizeModule('inscricoes', 3), async (req, res) => {
  try {
    const motivo = String(req.body?.motivo || '').trim().slice(0, 500);
    if (motivo.length < 3) return res.status(400).json({ error: 'Informe o motivo da reativação' });
    const { data, error } = await supabase.from('insc_qr_tokens')
      .update({
        revogado_em: null,
        revogado_por: null,
        revogacao_motivo: null,
        reativado_em: new Date().toISOString(),
        reativado_por: req.user?.id || null,
        reativacao_motivo: motivo,
      })
      .eq('id', req.params.id).not('revogado_em', 'is', null)
      .select('id, reativado_em').maybeSingle();
    if (colunaAusente(error)) {
      return res.status(409).json({
        error: 'A reativação de QR depende de uma migration ainda não aplicada no banco.',
        motivo: 'migration_pendente',
      });
    }
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'QR revogado não encontrado' });
    res.json({ ok: true, ...data });
  } catch (e) {
    console.error('[inscricoes] reativar QR:', e.message);
    res.status(500).json({ error: 'Erro ao reativar o QR' });
  }
});

// GET /eventos — lista com série + contagem de inscritos
router.get('/eventos', authorizeModule('inscricoes', 1), async (_req, res) => {
  try {
    const { data, error } = await supabase.from('insc_eventos')
      .select('id, nome, slug, area, tipo, data, hora, local, capa_url, status, vagas, tem_sorteio, checkin_ativo, no_totem, pagamento_ativo, valor_centavos, edicao_rotulo, serie_id, serie:insc_series(id, nome, periodicidade, recorre_ate, slug_base)')
      .is('deleted_at', null)
      .order('data', { ascending: false, nullsFirst: false });
    if (error) throw error;
    const contagem = await contarInscritosVivos(supabase, (data || []).map((e) => e.id));
    res.json((data || []).map(e => ({ ...e, inscritos: contagem.get(e.id) || 0 })));
  } catch (e) {
    console.error('[inscricoes] eventos:', e.message);
    res.status(500).json({ error: 'Erro ao listar eventos' });
  }
});

// GET /eventos/:id — detalhe (com sorteios embutidos, pro painel do evento)
router.get('/eventos/:id', authorizeModule('inscricoes', 1), async (req, res) => {
  try {
    const { data, error } = await supabase.from('insc_eventos')
      .select('*, serie:insc_series(id, nome, periodicidade, slug_base), sorteios:insc_sorteios(id, premio, numero_sorteado, inscricao_id, ganhador_nome, sorteado_em)')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Evento não encontrado' });
    const sorteios = (data.sorteios || []).sort((a, b) => String(b.sorteado_em).localeCompare(String(a.sorteado_em)));
    // Mesmo helper da lista (o embed `inscricoes(count)` contava apagadas).
    const contagem = await contarInscritosVivos(supabase, [data.id]);
    res.json({ ...data, inscritos: contagem.get(data.id) || 0, sorteios });
  } catch (e) {
    console.error('[inscricoes] evento:', e.message);
    res.status(500).json({ error: 'Erro ao carregar evento' });
  }
});

// Colunas da lista de inscritos.
//
// Devolve `data_nascimento` e `sexo` (base da idade, da faixa etária e das
// listas impressas por faixa/sexo) e `membro_id` (vínculo com o cadastro).
// **CPF continua fora** — é o campo de identificação mais sensível e serve pro
// matcher, não pra tela; quem precisa vê no detalhe da pessoa.
const INSCRITOS_COLS = 'id, codigo, nome_completo, telefone, email, data_nascimento, sexo, membro_id, status, numero_sorte, whatsapp_optin, dados, created_at, '
  // Bolsa/isenção (migration 20260730170000): quem paga menos ou nada, por quê
  // e quem concedeu. Sem isto a lista mostraria "aguardando pagamento" pra quem
  // foi de graça — que não está aguardando nada.
  + 'valor_cobrado_centavos, bolsa_tipo, bolsa_motivo, bolsa_por_nome, bolsa_em';

/**
 * Leitor ÚNICO da lista de inscritos de um evento — a tela do sistema (lista
 * completa, impressão por faixa, CSV) e o app do staff (página curta + busca)
 * chamam ESTA função. Duas telas, uma regra: se o join de pagamento mudar,
 * muda nas duas de uma vez.
 *
 * Pagamento vem de `vw_insc_pagamento_estado`, que já resolve o estado
 * CANÔNICO no motor `pag_cobrancas` quando há cobrança e cai no espelho de
 * `insc_pagamentos` quando o pagamento foi manual.
 *
 * `limit > 0` liga a paginação server-side (o app pede 40 por vez); sem limit
 * devolve TODOS os inscritos, paginando internamente pelo cap de 1000 linhas
 * do PostgREST — `.limit(2000)` NÃO contorna esse cap (é do projeto, vale pra
 * qualquer cliente), e um evento grande vinha truncado em silêncio.
 */
async function lerInscritosDoEvento(eventoId, { busca = '', status = '', limit = 0, offset = 0 } = {}) {
  const monta = (comContagem) => {
    let q = supabase.from('inscricoes')
      .select(INSCRITOS_COLS, comContagem ? { count: 'exact' } : undefined)
      .eq('evento_id', eventoId).is('deleted_at', null);
    if (status) q = q.eq('status', status);
    const termo = String(busca || '').trim().slice(0, 80);
    if (termo) {
      const digits = termo.replace(/\D/g, '');
      // Telefone só entra no OR quando o termo tem dígitos suficientes pra ser
      // telefone — senão "Ana 2" viraria também filtro por telefone contendo 2.
      q = digits.length >= 4
        ? q.or(`nome_completo.ilike.%${escapePostgrestValue(termo)}%,telefone.like.%${digits}%`)
        : q.ilike('nome_completo', `%${termo}%`);
    }
    return q.order('created_at', { ascending: false });
  };

  let inscritos = [];
  let total = null;
  if (limit > 0) {
    const { data, error, count } = await monta(true).range(offset, offset + limit - 1);
    if (error) throw error;
    inscritos = data || [];
    total = count ?? null;
  } else {
    for (let off = 0; off < 20000; off += 1000) {
      const { data, error } = await monta(false).range(off, off + 999);
      if (error) throw error;
      inscritos.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    total = inscritos.length;
  }

  // ── Contato do RESPONSÁVEL (menor de idade · migration 20260817160000) ────
  // ⚠️ Consulta ISOLADA e best-effort, pelo mesmo motivo do bloco de pagamento
  // abaixo: coluna ausente faz o PostgREST recusar a query INTEIRA (42703), e
  // esta é a lista de inscritos de TODO evento — inclusive a tela de check-in.
  // Sem a migration, a lista abre exatamente como antes.
  //
  // ⚠️ **Não é enfeite de tela**: é o número que a equipe liga se um adolescente
  // passar mal no retiro. Sem trazê-lo aqui, o dado ficaria gravado e invisível.
  try {
    const idsResp = inscritos.map((i) => i.id);
    const resps = [];
    for (let i = 0; i < idsResp.length; i += 200) {
      const { data, error } = await supabase.from('inscricoes')
        .select('id, responsavel_nome, responsavel_cpf, responsavel_parentesco, responsavel_telefone, responsavel_email, responsavel_autoriza_batismo')
        .in('id', idsResp.slice(i, i + 200));
      if (error) throw error;
      resps.push(...(data || []));
    }
    const porId = new Map(resps.map((r) => [r.id, r]));
    for (const ins of inscritos) {
      const r = porId.get(ins.id);
      // ⚠️ Só anexa quando existe responsável: chave sempre presente com valores
      // nulos faria a tela desenhar um bloco "Responsável: —" em toda inscrição
      // de adulto.
      if (r && r.responsavel_nome) {
        ins.responsavel = {
          nome: r.responsavel_nome,
          cpf: r.responsavel_cpf || null,
          parentesco: r.responsavel_parentesco || null,
          telefone: r.responsavel_telefone || null,
          email: r.responsavel_email || null,
          autoriza_batismo: r.responsavel_autoriza_batismo,
        };
      }
    }
  } catch (e) {
    console.warn('[inscricoes] responsável do menor indisponível:', e.message);
  }

  // Best-effort: a view é recente e a lista não pode deixar de abrir se ela
  // faltar num ambiente sem a migration aplicada.
  let porInscricao = new Map();
  try {
    const pagamentos = [];
    if (limit > 0) {
      // Página curta: busca só os pagamentos dos ids exibidos (`.in()` em
      // lotes ≤200 — lista grande estoura a URL do PostgREST).
      const ids = inscritos.map((i) => i.id);
      for (let i = 0; i < ids.length; i += 200) {
        const { data, error } = await supabase.from('vw_insc_pagamento_estado')
          .select('inscricao_id, metodo, status_pagamento, valor_centavos, valor_pago_centavos, pago_em, parcelas_total, cartao_brand, cartao_last4')
          .in('inscricao_id', ids.slice(i, i + 200));
        if (error) throw error;
        pagamentos.push(...(data || []));
      }
    } else {
      for (let off = 0; off < 20000; off += 1000) {
        const { data, error } = await supabase.from('vw_insc_pagamento_estado')
          .select('inscricao_id, metodo, status_pagamento, valor_centavos, valor_pago_centavos, pago_em, parcelas_total, cartao_brand, cartao_last4')
          .eq('evento_id', eventoId)
          .range(off, off + 999);
        if (error) throw error;
        pagamentos.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
    }
    porInscricao = new Map(pagamentos.map((p) => [p.inscricao_id, p]));
  } catch (e) {
    console.error('[inscricoes] estado de pagamento indisponível:', e.message);
  }

  // Comprovantes anexados pela pessoa (Pix/transferência). Só a CONTAGEM e o
  // estado mais recente vão pra lista — o arquivo em si sai por signed URL no
  // endpoint próprio. Best-effort pelo mesmo motivo do bloco acima.
  const porComprovante = await comprovantesResumoPorInscricao(
    eventoId, limit > 0 ? inscritos.map((i) => i.id) : null,
  );

  return {
    itens: inscritos.map((i) => ({
      ...i,
      pagamento: porInscricao.get(i.id) || null,
      comprovantes: porComprovante.get(i.id) || null,
    })),
    total,
  };
}

/**
 * Resumo dos comprovantes por inscrição: `{ total, em_analise, ultimo_status }`.
 *
 * `ids = null` → todos do evento (filtro pelo embed `!inner`, uma consulta por
 * página de 1000, em vez de N lotes de `.in()`). `ids` preenchido → só os
 * exibidos (`.in()` em lotes ≤200, senão a URL do PostgREST estoura).
 */
async function comprovantesResumoPorInscricao(eventoId, ids) {
  const mapa = new Map();
  try {
    const linhas = [];
    if (Array.isArray(ids)) {
      for (let i = 0; i < ids.length; i += 200) {
        const { data, error } = await supabase.from('insc_comprovantes')
          .select('inscricao_id, status, created_at')
          .in('inscricao_id', ids.slice(i, i + 200)).is('deleted_at', null);
        if (error) throw error;
        linhas.push(...(data || []));
      }
    } else {
      for (let off = 0; off < 20000; off += 1000) {
        const { data, error } = await supabase.from('insc_comprovantes')
          .select('inscricao_id, status, created_at, inscricoes!inner(evento_id)')
          .eq('inscricoes.evento_id', eventoId).is('deleted_at', null)
          .range(off, off + 999);
        if (error) throw error;
        linhas.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
    }
    for (const l of linhas) {
      const atual = mapa.get(l.inscricao_id)
        || { total: 0, em_analise: 0, ultimo_status: null, ultimo_em: null };
      atual.total += 1;
      if (l.status === 'em_analise') atual.em_analise += 1;
      if (!atual.ultimo_em || l.created_at > atual.ultimo_em) {
        atual.ultimo_em = l.created_at;
        atual.ultimo_status = l.status;
      }
      mapa.set(l.inscricao_id, atual);
    }
  } catch (e) {
    console.error('[inscricoes] comprovantes indisponíveis:', e.message);
  }
  return mapa;
}

/**
 * Contadores de um evento por COUNT no banco (`head: true` = não transfere
 * linha nenhuma). É o que permite o app do staff mostrar o placar sem baixar a
 * lista inteira — ler todas as linhas pra contar em JS anularia a paginação.
 */
async function contadoresEvento(eventoId) {
  const base = () => supabase.from('inscricoes')
    .select('id', { count: 'exact', head: true })
    .eq('evento_id', eventoId).is('deleted_at', null);
  const conta = async (q) => { const { count, error } = await q; if (error) throw error; return count || 0; };

  const [inscritos, confirmadas, aguardando, canceladas] = await Promise.all([
    conta(base()),
    conta(base().eq('status', 'confirmada')),
    conta(base().eq('status', 'recebida')),
    conta(base().eq('status', 'cancelada')),
  ]);

  // insc_checkins não tem evento_id — filtra pelo embed !inner da inscrição.
  let presentes = 0;
  try {
    presentes = await conta(supabase.from('insc_checkins')
      .select('inscricao_id, inscricao:inscricoes!inner(evento_id)', { count: 'exact', head: true })
      .eq('inscricao.evento_id', eventoId));
  } catch (e) {
    console.error('[inscricoes] contagem de check-in indisponível:', e.message);
  }

  // Arrecadado = soma dos pagamentos PAGOS (a view resolve o estado canônico).
  // ⚠️ Isto é acompanhamento operacional, NÃO caixa: o caixa recebe 1 receita
  // por REPASSE do PSP em `fin_transacoes` (lei nº 6 do núcleo de pagamentos).
  //
  // O MESMO laço conta **por forma de pagamento** — é a resposta agregada pra
  // "dá pra saber como cada pessoa pagou?". Custo zero: as linhas já vêm.
  let arrecadado_centavos = null;
  let por_metodo = null;
  try {
    let soma = 0;
    const formas = {};
    for (let off = 0; off < 20000; off += 1000) {
      const { data, error } = await supabase.from('vw_insc_pagamento_estado')
        .select('valor_pago_centavos, metodo')
        .eq('evento_id', eventoId).eq('status_pagamento', 'pago')
        .range(off, off + 999);
      if (error) throw error;
      for (const p of (data || [])) {
        soma += Number(p.valor_pago_centavos || 0);
        // `metodo` nulo = pagou mas o provedor não disse como (não inventar).
        const k = p.metodo || 'nao_informado';
        formas[k] = (formas[k] || 0) + 1;
      }
      if (!data || data.length < 1000) break;
    }
    arrecadado_centavos = soma;
    por_metodo = formas;
  } catch (e) {
    console.error('[inscricoes] arrecadação indisponível:', e.message);
  }

  // Isentas (bolsa integral) NÃO têm forma de pagamento — não pagaram. Contam
  // separado pra soma "por forma + isentas" fechar com os confirmados.
  let isentas = 0;
  try {
    isentas = await conta(supabase.from('inscricoes')
      .select('id', { count: 'exact', head: true })
      .eq('evento_id', eventoId).is('deleted_at', null)
      .eq('bolsa_tipo', 'integral'));
  } catch (e) {
    // Coluna nova (migration 20260730170000): ambiente sem ela não quebra a tela.
    console.error('[inscricoes] contagem de isentas indisponível:', e.message);
  }

  // Comprovantes esperando conferência humana. É fila de TRABALHO: sem número
  // visível, comprovante anexado no sábado só é visto quando alguém abre a
  // ficha da pessoa por acaso.
  let comprovantes_em_analise = 0;
  try {
    comprovantes_em_analise = await conta(supabase.from('insc_comprovantes')
      .select('id, inscricoes!inner(evento_id)', { count: 'exact', head: true })
      .eq('inscricoes.evento_id', eventoId).is('deleted_at', null)
      .eq('status', 'em_analise'));
  } catch (e) {
    // Tabela nova (migration 20260730200000): ausência não quebra o placar.
    console.error('[inscricoes] contagem de comprovantes indisponível:', e.message);
  }

  return {
    inscritos, ativos: inscritos - canceladas, confirmadas,
    aguardando_pagamento: aguardando, canceladas, presentes,
    arrecadado_centavos, por_metodo, isentas, comprovantes_em_analise,
  };
}

// GET /eventos/:id/inscricoes — lista de inscritos (tela do sistema · completa).
router.get('/eventos/:id/inscricoes', authorizeModule('inscricoes', 1), async (req, res) => {
  try {
    const { itens } = await lerInscritosDoEvento(req.params.id);
    res.json(itens);
  } catch (e) {
    console.error('[inscricoes] inscricoes do evento:', e.message);
    res.status(500).json({ error: 'Erro ao listar inscrições' });
  }
});

/**
 * POST /eventos/:id/inscricoes/:inscricaoId/bolsa — bolsa, desconto ou isenção.
 *
 * Pedido do Marcos (30/07): "tem pessoas que, para ajudarmos, cobramos menos ou
 * até vão de graça". O preço passa a ser da INSCRIÇÃO (migration
 * `20260730170000`) — o evento mantém o valor de tabela.
 *
 * ⚠️ O que este endpoint NÃO faz, por decisão:
 *
 *  • **não devolve dinheiro.** Bolsa em quem já pagou é registrada e avisada; a
 *    devolução é decisão da liderança, com estorno explícito. Automatizar
 *    saída de dinheiro a partir de um clique de cadastro é o tipo de coisa que
 *    ninguém quer descobrir depois.
 *  • **não cancela a inscrição.** A cobrança antiga morre (o valor mudou), mas
 *    a pessoa mantém a vaga — daí o `preservar_dominio` no cancelamento.
 *  • **não confirma quem ainda deve.** Isenta vira `confirmada`; desconto
 *    parcial gera cobrança nova e continua `recebida` até pagar.
 *
 * Nível 3: conceder benefício é ato de gestão, não de leitura.
 */
router.post('/eventos/:id/inscricoes/:inscricaoId/bolsa', authorizeModule('inscricoes', 3), async (req, res) => {
  try {
    const tipo = String(req.body?.tipo || '').trim();
    const motivo = String(req.body?.motivo || '').trim();
    if (!['integral', 'parcial'].includes(tipo)) {
      return res.status(400).json({ error: 'Tipo da bolsa deve ser "integral" (gratuidade) ou "parcial" (desconto).' });
    }
    if (motivo.length < 3) {
      return res.status(400).json({ error: 'Diga o motivo da bolsa — é o que sustenta a decisão depois.' });
    }

    const { data: ev } = await supabase.from('insc_eventos')
      .select('id, nome, slug, valor_centavos, pagamento_ativo, pagamento_expira_horas, parcelas_max, juros_repassados, pagamento_metodos')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!ev) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!ev.pagamento_ativo) return res.status(400).json({ error: 'Este evento não é pago — não há o que descontar.' });

    const { data: insc } = await supabase.from('inscricoes')
      .select('id, nome_completo, telefone, email, cpf, status, membro_id, valor_cobrado_centavos')
      .eq('id', req.params.inscricaoId).eq('evento_id', req.params.id)
      .is('deleted_at', null).maybeSingle();
    if (!insc) return res.status(404).json({ error: 'Inscrição não encontrada' });
    if (insc.status === 'cancelada') {
      return res.status(400).json({ error: 'Esta inscrição está cancelada. Reative antes de conceder a bolsa.' });
    }

    const tabela = Number(ev.valor_centavos || 0);
    let valorCobrado = 0;
    if (tipo === 'parcial') {
      const reais = String(req.body?.valor ?? '').replace(',', '.');
      valorCobrado = Math.round(Number(reais) * 100);
      if (!(valorCobrado > 0)) return res.status(400).json({ error: 'Informe quanto esta pessoa vai pagar.' });
      if (valorCobrado >= tabela) {
        return res.status(400).json({ error: `Desconto tem que ser menor que o valor de tabela (R$ ${(tabela / 100).toFixed(2)}).` });
      }
    }

    const pagamentos = require('../services/pagamentos');
    const cobrancaAtual = await pagamentos.consultarPorReferencia(`inscricao:${insc.id}`)
      .catch(() => null);

    // Já pagou: registra a bolsa, mas dinheiro não volta por automação.
    const jaPagou = !!cobrancaAtual && cobrancaAtual.valor_pago_centavos > 0;

    const patch = {
      valor_cobrado_centavos: valorCobrado,
      bolsa_tipo: tipo,
      bolsa_motivo: motivo,
      bolsa_por: req.user?.id || null,
      bolsa_por_nome: req.user?.name || req.user?.email || null,
      bolsa_em: new Date().toISOString(),
    };
    // Isenta e ainda sem pagamento → a vaga está garantida, então confirma.
    if (tipo === 'integral' && !jaPagou) patch.status = 'confirmada';

    const { data: atualizada, error: eUp } = await supabase.from('inscricoes')
      .update(patch).eq('id', insc.id).select('*').single();
    if (eUp) throw eUp;

    const avisos = [];
    if (jaPagou) {
      avisos.push('Esta pessoa já pagou. A bolsa ficou registrada, mas a devolução não é automática — decidam e façam o estorno.');
    } else if (cobrancaAtual && ['criada', 'aguardando_pagamento'].includes(cobrancaAtual.status)) {
      // Cobrança do valor antigo não serve mais. Cancela PRESERVANDO a
      // inscrição (senão o handler cancelaria quem acabou de ganhar a vaga).
      const r = await pagamentos.cancelar(cobrancaAtual.id, {
        motivo: `Bolsa ${tipo} concedida — cobrança reemitida`, preservar_dominio: true,
      });
      if (!r.ok) avisos.push('Não conseguimos cancelar a cobrança anterior no provedor — confira antes de reenviar o link.');
      // O espelho tem UNIQUE de inscrição ativa: sai de 'aguardando' pra a
      // cobrança nova poder existir.
      await supabase.from('insc_pagamentos').update({ status: 'expirado' })
        .eq('cobranca_id', cobrancaAtual.id);
    }

    let novaCobranca = null;
    if (tipo === 'parcial' && !jaPagou) {
      // Cobrança nova, com referência versionada — `inscricao:<id>` já foi usada
      // e é UNIQUE (é o que impede pagar duas vezes no fluxo normal).
      const horas = Number(ev.pagamento_expira_horas) > 0 ? Number(ev.pagamento_expira_horas) : 48;
      try {
        const { cobranca } = await pagamentos.criarCobranca({
          origem_tipo: pagamentos.ORIGENS.INSCRICAO,
          origem_id: insc.id,
          // ⚠️ `b` + base36: o external_reference do MP tem teto de 64 chars e
          // `inscricao:<uuid>` já usa 46 — `:bolsa:<13 dígitos>` estourava.
          referencia: `inscricao:${insc.id}:b${Date.now().toString(36)}`,
          valor_centavos: valorCobrado,
          descricao: `Inscrição (bolsa) · ${ev.nome}`,
          // ⚠️ Cruza com a capacidade do provider, igual à porta pública faz
          // (`metodosDoEvento`). Passar `pagamento_metodos` cru ofertava boleto
          // num PSP que não faz boleto: a aba aparecia na tela e a pessoa tomava
          // 502 ao escolher.
          metodos_ofertados: pagamentos.metodosDisponiveis(
            Array.isArray(ev.pagamento_metodos) ? ev.pagamento_metodos : [],
          ),
          parcelas_max: ev.parcelas_max || null,
          juros_repassados: ev.juros_repassados !== false,
          expira_em: new Date(Date.now() + horas * 3600000).toISOString(),
          pagador_nome: insc.nome_completo,
          pagador_cpf: insc.cpf,
          pagador_email: insc.email,
          pagador_telefone: insc.telefone,
          membro_id: insc.membro_id || null,
          metadata: { evento_id: ev.id, evento_slug: ev.slug, evento_nome: ev.nome, bolsa: tipo },
        });
        novaCobranca = {
          valor_centavos: cobranca.valor_centavos,
          // Link que a equipe manda pra pessoa. É a MESMA página pública.
          link: `${(process.env.FRONTEND_URL || 'https://cbrio.org').replace(/\/$/, '')}/pagamento/${cobranca.public_token}`,
        };
        await supabase.from('insc_pagamentos').insert({
          inscricao_id: insc.id, cobranca_id: cobranca.id,
          metodo: cobranca.metodo || null, provider: 'psp',
          provider_ref: cobranca.provider_cobranca_id || null,
          valor_centavos: cobranca.valor_centavos, status: 'aguardando',
          qr_payload: cobranca.pix_payload || null, expira_em: cobranca.expira_em || null,
        });
      } catch (e) {
        console.error('[inscricoes] cobrança da bolsa:', e.message);
        avisos.push('A bolsa foi registrada, mas não conseguimos emitir a cobrança nova agora. Tente reemitir em instantes.');
      }
    }

    res.json({ ok: true, inscricao: atualizada, cobranca: novaCobranca, avisos });
  } catch (e) {
    console.error('[inscricoes] bolsa:', e.message);
    res.status(500).json({ error: 'Erro ao registrar a bolsa' });
  }
});

// DELETE /eventos/:id/inscricoes/:inscricaoId/bolsa — volta ao valor de tabela.
// NÃO cria cobrança automaticamente: quem tira a bolsa precisa combinar o
// pagamento com a pessoa, e emitir cobrança sem aviso é cobrar de surpresa.
router.delete('/eventos/:id/inscricoes/:inscricaoId/bolsa', authorizeModule('inscricoes', 3), async (req, res) => {
  try {
    const { data, error } = await supabase.from('inscricoes')
      .update({
        valor_cobrado_centavos: null, bolsa_tipo: null, bolsa_motivo: null,
        bolsa_por: null, bolsa_por_nome: null, bolsa_em: null,
      })
      .eq('id', req.params.inscricaoId).eq('evento_id', req.params.id)
      .is('deleted_at', null).select('*').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Inscrição não encontrada' });
    res.json({ ok: true, inscricao: data });
  } catch (e) {
    console.error('[inscricoes] remover bolsa:', e.message);
    res.status(500).json({ error: 'Erro ao remover a bolsa' });
  }
});

// ── Benefícios pré-autorizados por CPF ─────────────────────────────────────
//
// O líder cadastra o CPF ANTES da pessoa se inscrever; a porta pública aplica
// sozinha (publicEventoExterno · `beneficioPorCpf`/`aplicarBeneficio`). Grava as
// MESMAS colunas do botão "Dar bolsa" — preço continua sendo atributo da
// INSCRIÇÃO, não uma segunda régua de preço do evento.
//
// Leitura exige nível 2 porque a linha carrega CPF (mesma régua da aba Pessoas).

// GET /eventos/:id/beneficios
router.get('/eventos/:id/beneficios', authorizeModule('inscricoes', 2), async (req, res) => {
  try {
    const { data, error } = await supabase.from('insc_beneficios')
      .select('*').eq('evento_id', req.params.id).is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ itens: data || [] });
  } catch (e) {
    console.error('[inscricoes] beneficios:', e.message);
    if (/insc_beneficios|does not exist|schema cache/i.test(e.message || '')) {
      return res.json({ itens: [], aviso: 'Benefícios indisponíveis: migration 20260730210000 pendente.' });
    }
    res.status(500).json({ error: 'Erro ao carregar os benefícios' });
  }
});

// POST /eventos/:id/beneficios — autoriza gratuidade ou desconto pra um CPF.
router.post('/eventos/:id/beneficios', authorizeModule('inscricoes', 3), async (req, res) => {
  try {
    const cpf = String(req.body?.cpf || '').replace(/\D/g, '');
    // DV validado pelo canônico do Contrato de Inscrição: CPF sem DV válido não
    // passa na porta pública, então cadastrar aqui seria autorizar um benefício
    // que NUNCA casaria com ninguém.
    if (!cpfValido(cpf)) return res.status(400).json({ error: 'CPF inválido' });

    const tipo = req.body?.tipo === 'integral' ? 'integral' : 'parcial';
    const motivo = String(req.body?.motivo || '').trim();
    if (motivo.length < 3) return res.status(400).json({ error: 'Diga o motivo do benefício (fica registrado).' });

    // `valor` chega em REAIS da tela e é o que a pessoa VAI PAGAR (não o
    // desconto) — mesma semântica de `valor_cobrado_centavos`.
    let valor_centavos = null;
    if (tipo === 'parcial') {
      const reais = Number(String(req.body?.valor ?? '').toString().replace(',', '.'));
      valor_centavos = Math.round(reais * 100);
      if (!(valor_centavos > 0)) {
        return res.status(400).json({ error: 'Informe quanto essa pessoa vai pagar (maior que zero).' });
      }
      // Cobrar mais que a tabela não é desconto — provavelmente é o valor total
      // digitado no campo errado.
      const { data: ev } = await supabase.from('insc_eventos')
        .select('valor_centavos').eq('id', req.params.id).maybeSingle();
      if (ev?.valor_centavos && valor_centavos >= Number(ev.valor_centavos)) {
        return res.status(400).json({
          error: `O valor com desconto precisa ser menor que o do evento (R$ ${(Number(ev.valor_centavos) / 100).toFixed(2).replace('.', ',')}).`,
        });
      }
    }

    const { data, error } = await supabase.from('insc_beneficios').insert({
      evento_id: req.params.id,
      cpf,
      nome_referencia: req.body?.nome_referencia ? String(req.body.nome_referencia).trim().slice(0, 120) : null,
      tipo,
      valor_centavos,
      motivo: motivo.slice(0, 500),
      criado_por: req.user?.id || null,
      criado_por_nome: req.user?.name || req.user?.email || null,
    }).select('*').single();
    if (error) {
      // UNIQUE parcial (evento, cpf) — já existe autorização viva pra este CPF.
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Este CPF já tem um benefício cadastrado neste evento.' });
      }
      throw error;
    }
    res.status(201).json({ ok: true, beneficio: data });
  } catch (e) {
    console.error('[inscricoes] criar beneficio:', e.message);
    res.status(500).json({ error: 'Erro ao cadastrar o benefício' });
  }
});

// DELETE /eventos/:id/beneficios/:beneficioId — soft-delete da AUTORIZAÇÃO.
// ⚠️ NÃO desfaz benefício já usado: a inscrição dela já carrega o preço e mexer
// nisso é o botão "Dar bolsa"/"Alterar" na ficha, que reemite a cobrança.
router.delete('/eventos/:id/beneficios/:beneficioId', authorizeModule('inscricoes', 3), async (req, res) => {
  try {
    const { data, error } = await supabase.from('insc_beneficios')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', req.params.beneficioId).eq('evento_id', req.params.id)
      .is('deleted_at', null).select('id, usado_em').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Benefício não encontrado' });
    res.json({
      ok: true,
      ja_usado: !!data.usado_em,
      aviso: data.usado_em
        ? 'A autorização saiu da lista, mas a inscrição que já usou continua com o valor concedido — altere na ficha da pessoa se precisar.'
        : null,
    });
  } catch (e) {
    console.error('[inscricoes] remover beneficio:', e.message);
    res.status(500).json({ error: 'Erro ao remover o benefício' });
  }
});

// ── Comprovantes de Pix/transferência (conferência HUMANA) ─────────────────
//
// ⚠️ LEI: imagem NUNCA marca pagamento. O que a pessoa anexa na página pública
// entra como `em_analise`; baixar o pagamento é ato de uma pessoa da equipe,
// registrado com autoria (`marcarPagoManual` exige `confirmado_por`). Ler print
// de celular e concluir "pagou" é como se aprova comprovante falso — e o
// dinheiro não aparece na conciliação do extrato depois.

// Signed URL curta: o bucket é privado e o link não deve sobreviver ao print da
// tela de quem conferiu.
const COMPROVANTE_URL_SEGUNDOS = 900;

async function carregarComprovantes(eventoId, inscricaoId) {
  const { data, error } = await supabase.from('insc_comprovantes')
    .select('*, inscricoes!inner(id, evento_id, nome_completo)')
    .eq('inscricao_id', inscricaoId).eq('inscricoes.evento_id', eventoId)
    .is('deleted_at', null).order('created_at', { ascending: false });
  if (error) throw error;
  const linhas = data || [];
  // Assina em LOTE (1 chamada pra N arquivos · padrão do anexarFotosEmLote do
  // Kids). Falha ao assinar degrada pra linha sem `url` — a conferência do
  // histórico não pode derrubar a tela.
  let urls = new Map();
  if (linhas.length) {
    try {
      const { data: assinadas } = await supabase.storage.from('inscricao-comprovantes')
        .createSignedUrls(linhas.map((l) => l.storage_path), COMPROVANTE_URL_SEGUNDOS);
      urls = new Map((assinadas || []).map((a) => [a.path, a.signedUrl]));
    } catch (e) {
      console.error('[inscricoes] assinar comprovantes:', e.message);
    }
  }
  return linhas.map((l) => {
    // `storage_path` NÃO vai pra resposta: não é segredo e não serve pra nada no
    // cliente (o bucket é privado) — só ampliaria a superfície.
    const { storage_path, inscricoes, ...resto } = l;
    return { ...resto, url: urls.get(storage_path) || null };
  });
}

// GET /eventos/:id/inscricoes/:inscricaoId/comprovantes
// Nível 1: VER o comprovante é parte de acompanhar o evento; confirmar é nível 3.
router.get('/eventos/:id/inscricoes/:inscricaoId/comprovantes', authorizeModule('inscricoes', 1), async (req, res) => {
  try {
    res.json({ itens: await carregarComprovantes(req.params.id, req.params.inscricaoId) });
  } catch (e) {
    console.error('[inscricoes] comprovantes:', e.message);
    // Tabela ausente (deploy em duas etapas) responde AVISO, não 500 — a ficha
    // do inscrito continua abrindo.
    if (/insc_comprovantes|does not exist|schema cache/i.test(e.message || '')) {
      return res.json({ itens: [], aviso: 'Comprovantes indisponíveis: migration 20260730200000 pendente.' });
    }
    res.status(500).json({ error: 'Erro ao carregar os comprovantes' });
  }
});

/**
 * POST /eventos/:id/inscricoes/:inscricaoId/comprovantes/:comprovanteId/aceitar
 *
 * Aceitar = "conferi e o dinheiro entrou". Baixa o pagamento manualmente (fora
 * do PSP, porque foi Pix na chave da igreja / TED) com autoria registrada.
 */
router.post('/eventos/:id/inscricoes/:inscricaoId/comprovantes/:comprovanteId/aceitar',
  authorizeModule('inscricoes', 3), async (req, res) => {
    try {
      const { data: comp, error } = await supabase.from('insc_comprovantes')
        .select('*, inscricoes!inner(id, evento_id)')
        .eq('id', req.params.comprovanteId).eq('inscricao_id', req.params.inscricaoId)
        .eq('inscricoes.evento_id', req.params.id).is('deleted_at', null).maybeSingle();
      if (error) throw error;
      if (!comp) return res.status(404).json({ error: 'Comprovante não encontrado' });

      const pagamentos = require('../services/pagamentos');
      const autor = req.user?.name || req.user?.email || req.user?.id || 'equipe';
      let resultado = { semCobranca: true };

      if (comp.cobranca_id) {
        const r = await pagamentos.marcarPagoManual(comp.cobranca_id, {
          confirmado_por: autor,
          // Valor: o que falta na cobrança (o default do núcleo). Quem confere
          // pode informar outro quando a pessoa pagou parcial.
          valor_centavos: Number(req.body?.valor_centavos) > 0 ? Number(req.body.valor_centavos) : undefined,
          metodo: comp.metodo_declarado,
          observacao: `Comprovante ${comp.id} conferido por ${autor}`,
        });
        // `semMudanca` = já estava pago (webhook chegou no meio da conferência).
        // Não é erro: o comprovante segue pra 'aceito' e ninguém paga duas vezes.
        if (!r.ok) return res.status(409).json({ error: r.motivo || 'Não foi possível baixar o pagamento' });
        resultado = { pago: true, ja_estava_pago: !!r.semMudanca };
      }

      const { data: atualizado, error: e2 } = await supabase.from('insc_comprovantes')
        .update({
          status: 'aceito', motivo_recusa: null,
          revisado_por: req.user?.id || null, revisado_por_nome: autor,
          revisado_em: new Date().toISOString(),
        })
        .eq('id', comp.id).select('id, status, revisado_em, revisado_por_nome').single();
      if (e2) throw e2;

      res.json({ ok: true, comprovante: atualizado, ...resultado });
    } catch (e) {
      console.error('[inscricoes] aceitar comprovante:', e.message);
      res.status(500).json({ error: 'Erro ao aceitar o comprovante' });
    }
  });

// POST .../comprovantes/:comprovanteId/recusar — motivo OBRIGATÓRIO (o CHECK do
// banco também exige): a pessoa precisa saber o que corrigir pra reenviar, e
// recusa sem motivo é decisão que ninguém explica depois.
router.post('/eventos/:id/inscricoes/:inscricaoId/comprovantes/:comprovanteId/recusar',
  authorizeModule('inscricoes', 3), async (req, res) => {
    try {
      const motivo = String(req.body?.motivo || '').trim();
      if (motivo.length < 3) return res.status(400).json({ error: 'Diga o motivo da recusa (a pessoa vai ler pra corrigir).' });

      const autor = req.user?.name || req.user?.email || req.user?.id || 'equipe';
      const { data, error } = await supabase.from('insc_comprovantes')
        .update({
          status: 'recusado', motivo_recusa: motivo.slice(0, 500),
          revisado_por: req.user?.id || null, revisado_por_nome: autor,
          revisado_em: new Date().toISOString(),
        })
        .eq('id', req.params.comprovanteId).eq('inscricao_id', req.params.inscricaoId)
        .is('deleted_at', null).select('id, status, motivo_recusa, revisado_em, revisado_por_nome').maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Comprovante não encontrado' });
      res.json({ ok: true, comprovante: data });
    } catch (e) {
      console.error('[inscricoes] recusar comprovante:', e.message);
      res.status(500).json({ error: 'Erro ao recusar o comprovante' });
    }
  });

// GET /eventos/:id/resumo — placar do evento (contadores + arrecadado).
//
// Separado da lista de propósito: a tela de gerenciamento abre o placar na hora
// (4 COUNTs, nenhuma linha transferida) enquanto a lista carrega. E é o mesmo
// endpoint que o app do staff usa pra acompanhar o evento pelo celular.
router.get('/eventos/:id/resumo', authorizeModule('inscricoes', 1), async (req, res) => {
  try {
    const { data: ev, error } = await supabase.from('insc_eventos')
      .select('id, nome, slug, data, hora, local, status, vagas, valor_centavos, pagamento_ativo, checkin_ativo, tem_sorteio')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (error) throw error;
    if (!ev) return res.status(404).json({ error: 'Evento não encontrado' });
    res.json({ evento: ev, contadores: await contadoresEvento(req.params.id) });
  } catch (e) {
    console.error('[inscricoes] resumo do evento:', e.message);
    res.status(500).json({ error: 'Erro ao carregar o resumo do evento' });
  }
});

// ── App do staff ──────────────────────────────────────────────────────────
//
// O app (React Native) consome as MESMAS regras — `lerInscritosDoEvento` e
// `contadoresEvento` são os leitores compartilhados com a tela do sistema. O
// que muda é a FORMA: página curta com busca e placar, porque no celular
// baixar a lista inteira de um retiro é caro e ninguém rola 800 nomes.
//
// Nível 1 (leitura): acompanhar inscrição é ver, não operar.

// GET /app/eventos — lista compacta pro app: o que está no ar agora primeiro.
router.get('/app/eventos', authorizeModule('inscricoes', 1), async (req, res) => {
  try {
    let q = supabase.from('insc_eventos')
      .select('id, nome, slug, area, data, hora, local, status, vagas, pagamento_ativo, valor_centavos, checkin_ativo, edicao_rotulo')
      .is('deleted_at', null);
    // Rascunho e arquivado ficam fora por padrão: o app é pra acompanhar o que
    // está acontecendo, não pra ver esboço.
    if (req.query.todos !== '1') q = q.in('status', ['publicado', 'encerrado']);
    const { data, error } = await q.order('data', { ascending: false, nullsFirst: false }).limit(100);
    if (error) throw error;
    // Mesmo helper da tela do sistema — o app do staff tinha o MESMO bug do
    // embed: mostraria "14 inscritos" num evento com 14 inscrições apagadas.
    const contagem = await contarInscritosVivos(supabase, (data || []).map((e) => e.id));
    res.json((data || []).map((e) => ({ ...e, inscritos: contagem.get(e.id) || 0 })));
  } catch (e) {
    console.error('[inscricoes] app/eventos:', e.message);
    res.status(500).json({ error: 'Erro ao listar eventos' });
  }
});

// GET /app/eventos/:id/inscricoes?busca=&status=&limit=&offset=
// Placar + página de inscritos. `total` é o total do FILTRO (o que a busca
// achou), e vem do banco — contar o que veio na página diria 40 sempre.
router.get('/app/eventos/:id/inscricoes', authorizeModule('inscricoes', 1), async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 40, 1), 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const status = STATUS_CANONICOS.includes(String(req.query.status)) ? String(req.query.status) : '';

    const [lista, contadores] = await Promise.all([
      lerInscritosDoEvento(req.params.id, { busca: req.query.busca || '', status, limit, offset }),
      // Placar só na primeira página — rolar a lista não precisa recontar.
      offset === 0 ? contadoresEvento(req.params.id) : Promise.resolve(null),
    ]);

    res.json({ itens: lista.itens, total: lista.total, limit, offset, contadores });
  } catch (e) {
    console.error('[inscricoes] app/inscricoes:', e.message);
    res.status(500).json({ error: 'Erro ao listar inscrições' });
  }
});

// PATCH /eventos/:id/inscricoes/:inscricaoId — corrigir uma inscrição
// (nome/telefone/e-mail/status + respostas). `dados` é MESCLADO sobre o
// existente (nunca substituído inteiro — mesma régua do eventos-externos);
// valor string vazia = limpa a resposta daquela chave.
router.patch('/eventos/:id/inscricoes/:inscricaoId', authorizeModule('inscricoes', 3), async (req, res) => {
  try {
    const { data: atual } = await supabase.from('inscricoes')
      .select('id, dados').eq('id', req.params.inscricaoId)
      .eq('evento_id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!atual) return res.status(404).json({ error: 'Inscrição não encontrada' });

    const patch = {};
    if (typeof req.body?.nome_completo === 'string' && req.body.nome_completo.trim().length >= 2) {
      patch.nome_completo = req.body.nome_completo.trim().slice(0, 200);
    }
    if ('telefone' in (req.body || {})) patch.telefone = String(req.body.telefone || '').replace(/\D/g, '') || null;
    if ('email' in (req.body || {})) patch.email = req.body.email ? String(req.body.email).toLowerCase().trim().slice(0, 200) : null;
    if (req.body?.status !== undefined) {
      // 'recebida' é exclusiva do fluxo de pagamento — manual só confirma/cancela
      if (!['confirmada', 'cancelada'].includes(req.body.status)) {
        return res.status(400).json({ error: 'Status inválido' });
      }
      patch.status = req.body.status;
    }
    if (req.body?.dados && typeof req.body.dados === 'object' && !Array.isArray(req.body.dados)) {
      const dados = { ...(atual.dados || {}) };
      for (const [k, v] of Object.entries(req.body.dados)) {
        const key = String(k).slice(0, 80);
        if (v === null || v === undefined || String(v).trim() === '') delete dados[key];
        else dados[key] = String(v).slice(0, 500); // mesma régua do form público
      }
      patch.dados = dados;
    }
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nada pra atualizar' });

    const { data, error } = await supabase.from('inscricoes')
      .update(patch)
      .eq('id', req.params.inscricaoId).eq('evento_id', req.params.id).is('deleted_at', null)
      .select('id, nome_completo, telefone, email, status, numero_sorte, whatsapp_optin, dados, created_at').maybeSingle();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[inscricoes] atualizar inscrição:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar a inscrição' });
  }
});

// DELETE /eventos/:id/inscricoes/:inscricaoId — soft delete (ex.: inscrição
// de teste). Some da lista, das contagens e dos sorteios seguintes.
router.delete('/eventos/:id/inscricoes/:inscricaoId', authorizeModule('inscricoes', 3), async (req, res) => {
  try {
    const { data: atual } = await supabase.from('inscricoes')
      .select('id').eq('id', req.params.inscricaoId)
      .eq('evento_id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!atual) return res.status(404).json({ error: 'Inscrição não encontrada' });
    const { error } = await supabase.rpc('app_soft_delete', {
      p_table_name: 'inscricoes', p_row_id: req.params.inscricaoId, p_deleted_by: req.user?.id ?? null,
    });
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[inscricoes] excluir inscrição:', e.message);
    // ⚠️ O MOTIVO vai junto (17/08/2026). Este endpoint respondia 500 com "Erro
    // ao excluir a inscrição" e nada mais desde a migração pra espinha, porque
    // `inscricoes` não estava na whitelist do soft-delete — a mensagem real
    // ("Tabela inscricoes nao esta na whitelist") existia no log da Vercel e
    // nunca chegava a quem estava na tela. Erro genérico em ação de operador
    // esconde defeito de configuração por meses.
    res.status(500).json({ error: 'Erro ao excluir a inscrição', detalhe: e.message });
  }
});

// POST /eventos/:id/inscricoes/excluir-lote — exclui as inscrições marcadas na
// lista (soft delete). Nasceu do pedido do Matheus (17/08): as inscrições de
// teste inflam o placar do evento e, com 241 inscritos, apagar uma a uma não é
// caminho.
//
// ⚠️ O payload diz QUAIS, nunca SE PODE: o servidor relê as linhas vivas DESTE
// evento e reavalia tudo (mesma lei da aprovação em lote da Membresia e do
// `ligar-lote` das Entradas). A régua está em `utils/exclusaoInscricaoLote`,
// que é pura e entra no gate.
//
// ⚠️⚠️ Quem tem PAGAMENTO fica de fora e é DECLARADO: apagar quem pagou some
// com a pessoa do placar enquanto o dinheiro segue na conta da igreja. Caso a
// caso o DELETE individual acima continua existindo.
router.post('/eventos/:id/inscricoes/excluir-lote', authorizeModule('inscricoes', 3), async (req, res) => {
  try {
    const { ids, ignorados, acimaDoTeto } = normalizarIds(req.body?.ids);
    if (!ids.length) return res.status(400).json({ error: 'Selecione ao menos uma inscrição' });

    const { data: evento } = await supabase.from('insc_eventos')
      .select('id').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });

    const { data: vivas, error: eVivas } = await supabase.from('inscricoes')
      .select('id, nome_completo')
      .eq('evento_id', req.params.id).is('deleted_at', null).in('id', ids);
    if (eVivas) throw eVivas;

    // Pagamento: a razão auxiliar do evento. ⚠️ Falha de CONSULTA aqui NÃO pode
    // virar "ninguém tem pagamento" — seria a guarda falhando aberta justamente
    // no caminho que ela existe pra fechar. Sem conseguir conferir, o lote para.
    let comPagamento = [];
    const { data: pagos, error: ePag } = await supabase.from('vw_insc_pagamento_estado')
      .select('inscricao_id, status_pagamento')
      .eq('evento_id', req.params.id).in('inscricao_id', ids);
    if (ePag) {
      console.error('[inscricoes] excluir-lote · pagamentos:', ePag.message);
      return res.status(503).json({ error: 'Não deu pra conferir os pagamentos agora — tente de novo em instantes.' });
    }
    comPagamento = (pagos || [])
      .filter((p) => p.status_pagamento && p.status_pagamento !== 'expirada' && p.status_pagamento !== 'cancelada')
      .map((p) => p.inscricao_id);

    const plano = separarExclusaoLote(ids, vivas || [], comPagamento);

    // ⚠️ Grava o efeito DURANTE (lei de 04/08): morte no meio do laço deixa
    // apagado o que já saiu, e a resposta declara exatamente o que aconteceu —
    // "tente de novo" sobre uma exclusão parcial é a instrução mais cara aqui.
    const excluidas = [];
    const falhas = [];
    // ⚠️ O MOTIVO das falhas volta pra tela (distinct). Sem ele, "3 falharam"
    // manda a pessoa tentar de novo pra sempre — foi assim que a ausência de
    // `inscricoes` na whitelist do soft-delete passou meses como "Erro ao
    // excluir" e só apareceu quando alguém foi ler o log da Vercel.
    const motivos = new Set();
    const BLOCO = 8;
    for (let i = 0; i < plano.excluir.length; i += BLOCO) {
      const fatia = plano.excluir.slice(i, i + BLOCO);
      const r = await Promise.all(fatia.map(async (id) => {
        const { error } = await supabase.rpc('app_soft_delete', {
          p_table_name: 'inscricoes', p_row_id: id, p_deleted_by: req.user?.id ?? null,
        });
        return { id, erro: error?.message || null };
      }));
      for (const item of r) {
        (item.erro ? falhas : excluidas).push(item.id);
        if (item.erro) motivos.add(item.erro);
      }
      if (r.some((x) => x.erro)) console.error('[inscricoes] excluir-lote falhas:', r.filter((x) => x.erro));
    }

    res.json({
      ok: true,
      excluidas,
      com_pagamento: plano.comPagamento,
      nao_encontradas: plano.naoEncontradas,
      falhas,
      falhas_motivo: [...motivos],
      ignorados,
      acima_do_teto: acimaDoTeto,
      resumo: resumoDoLote({
        excluidas: excluidas.length,
        comPagamento: plano.comPagamento.length,
        naoEncontradas: plano.naoEncontradas.length,
        falhas: falhas.length,
      }),
      contadores: await contadoresEvento(req.params.id),
    });
  } catch (e) {
    console.error('[inscricoes] excluir inscrições em lote:', e.message);
    // Motivo junto, pelo mesmo raciocínio do DELETE individual acima.
    res.status(500).json({ error: 'Erro ao excluir as inscrições', detalhe: e.message });
  }
});

// POST /eventos/:id/sortear — sorteia um inscrito (espelho do eventos-externos).
// Body: { premio, permitir_repetir }. Pool = inscrições ativas não-canceladas
// com número da sorte; por padrão exclui quem já ganhou neste evento.
router.post('/eventos/:id/sortear', authorizeModule('inscricoes', 3), async (req, res) => {
  try {
    const { premio, permitir_repetir } = req.body || {};
    const { data: inscritos } = await supabase.from('inscricoes')
      .select('id, nome_completo, numero_sorte')
      .eq('evento_id', req.params.id).is('deleted_at', null)
      .neq('status', 'cancelada').not('numero_sorte', 'is', null);
    if (!inscritos || !inscritos.length) return res.status(400).json({ error: 'Sem inscritos pra sortear' });
    let elegiveis = inscritos;
    if (!permitir_repetir) {
      const { data: jaSorteados } = await supabase.from('insc_sorteios')
        .select('inscricao_id').eq('evento_id', req.params.id);
      const ganhos = new Set((jaSorteados || []).map(s => s.inscricao_id));
      elegiveis = inscritos.filter(i => !ganhos.has(i.id));
    }
    if (!elegiveis.length) return res.status(400).json({ error: 'Todos os inscritos já foram sorteados (marque "permitir repetir" pra sortear de novo)' });
    const g = elegiveis[Math.floor(Math.random() * elegiveis.length)];
    const { data: sorteio, error } = await supabase.from('insc_sorteios').insert({
      evento_id: req.params.id, premio: premio ? String(premio).trim().slice(0, 200) : null,
      numero_sorteado: g.numero_sorte, inscricao_id: g.id, ganhador_nome: g.nome_completo,
      sorteado_por: req.user?.id || null,
    }).select('*').single();
    if (error) throw error;
    res.status(201).json(sorteio);
  } catch (e) {
    console.error('[inscricoes] sortear:', e.message);
    res.status(500).json({ error: 'Erro ao sortear' });
  }
});

// ── Check-in (SPEC-06) ──────────────────────────────────────────────────────
// Nível 2 da matriz = "operar check-in" (SPEC-08). O duplo check-in é barrado
// pelo UNIQUE de insc_checkins.inscricao_id — a resposta AVISA em vez de errar
// (critério de aceite da spec). O dashboard já lê `compareceu` da view
// unificada; marcar aqui acorda o card de comparecimento sozinho.

const {
  marcarCheckinAuditavel, desfazerCheckinAuditavel,
} = require('../services/inscricaoCheckin');
const { montarLinkCheckin } = require('../utils/eventoCheckinToken');

// GET /eventos/:id/checkin/qr-autoatendimento — o link do QR da porta.
// ⚠️ Nível 2 (quem opera check-in). O link é a credencial: quem o tem consegue
// abrir a porta de autoatendimento, então ele não sai em rota de leitura geral.
router.get('/eventos/:id/checkin/qr-autoatendimento', authorizeModule('inscricoes', 2), async (req, res) => {
  try {
    const { data: ev } = await supabase.from('insc_eventos')
      .select('id, nome, checkin_ativo').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!ev) return res.status(404).json({ error: 'Evento não encontrado' });
    const url = montarLinkCheckin(ev.id, process.env.FRONTEND_URL);
    // ⚠️ Sem segredo configurado é FAIL-CLOSED: devolve o motivo em vez de um
    // link quebrado que só falharia na mão de quem estivesse na fila.
    if (!url) {
      return res.status(503).json({
        error: 'O QR de autoatendimento não está configurado (falta CRON_SECRET no ambiente).',
        motivo: 'sem_segredo',
      });
    }
    res.json({ url, checkin_ativo: !!ev.checkin_ativo });
  } catch (e) {
    console.error('[inscricoes] qr autoatendimento:', e.message);
    res.status(500).json({ error: 'Erro ao gerar o QR' });
  }
});

// GET /eventos/:id/checkin — estado da tela: evento + contadores + lista.
// A tela recarrega isso em polling curto (contador ao vivo).
router.get('/eventos/:id/checkin', authorizeModule('inscricoes', 2), async (req, res) => {
  try {
    const { data: ev, error: eEv } = await supabase.from('insc_eventos')
      .select('id, nome, slug, data, hora, local, status, checkin_ativo, tem_sorteio, pagamento_ativo, vagas')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (eEv) throw eEv;
    if (!ev) return res.status(404).json({ error: 'Evento não encontrado' });

    // Lista SEM CPF (mesma régua da lista de inscritos — o documento não viaja
    // pra tela; busca por CPF é server-side no /checkin/buscar). Paginado pelo
    // cap de 1000 do PostgREST.
    const lista = [];
    for (let off = 0; off < 20000; off += 1000) {
      const { data, error } = await supabase.from('inscricoes')
        .select('id, nome_completo, telefone, numero_sorte, status')
        .eq('evento_id', req.params.id).is('deleted_at', null)
        .order('nome_completo')
        .range(off, off + 999);
      if (error) throw error;
      lista.push(...(data || []));
      if (!data || data.length < 1000) break;
    }

    // insc_checkins não tem evento_id — filtra pelo embed !inner da inscrição.
    const marcas = new Map();
    for (let off = 0; off < 20000; off += 1000) {
      const { data, error } = await supabase.from('insc_checkins')
        .select('inscricao_id, em, modo, inscricao:inscricoes!inner(evento_id)')
        .eq('inscricao.evento_id', req.params.id)
        .range(off, off + 999);
      if (error) throw error;
      for (const c of (data || [])) marcas.set(c.inscricao_id, c);
      if (!data || data.length < 1000) break;
    }

    const itens = lista.map((i) => ({
      id: i.id, nome_completo: i.nome_completo, telefone: i.telefone,
      numero_sorte: i.numero_sorte, status: i.status,
      checkin_em: marcas.get(i.id)?.em || null,
      checkin_modo: marcas.get(i.id)?.modo || null,
    }));
    const ativos = itens.filter((i) => i.status !== 'cancelada');
    res.json({
      evento: ev,
      inscritos: ativos.length,
      presentes: ativos.filter((i) => i.checkin_em).length,
      lista: itens,
    });
  } catch (e) {
    console.error('[inscricoes] checkin/estado:', e.message);
    res.status(500).json({ error: 'Erro ao carregar o check-in' });
  }
});

// GET /eventos/:id/checkin/buscar?q= — busca por CPF/telefone no SERVIDOR.
// O CPF não viaja na lista da tela; quando a portaria digita um documento, a
// consulta roda aqui e devolve só os candidatos (digits-only no filtro —
// injeção impossível no .or()).
router.get('/eventos/:id/checkin/buscar', authorizeModule('inscricoes', 2), async (req, res) => {
  try {
    const digits = String(req.query.q || '').replace(/\D/g, '').slice(0, 14);
    if (digits.length < 4) return res.json([]);
    const { data, error } = await supabase.from('inscricoes')
      .select('id, nome_completo, telefone, numero_sorte, status')
      .eq('evento_id', req.params.id).is('deleted_at', null)
      .or(`cpf.like.%${digits}%,telefone.like.%${digits}%`)
      .limit(20);
    if (error) throw error;
    const ids = (data || []).map((i) => i.id);
    const marcas = new Map();
    if (ids.length) {
      const { data: cks } = await supabase.from('insc_checkins')
        .select('inscricao_id, em').in('inscricao_id', ids);
      for (const c of (cks || [])) marcas.set(c.inscricao_id, c.em);
    }
    res.json((data || []).map((i) => ({ ...i, checkin_em: marcas.get(i.id) || null })));
  } catch (e) {
    console.error('[inscricoes] checkin/buscar:', e.message);
    res.status(500).json({ error: 'Erro na busca' });
  }
});

// POST /eventos/:id/checkin — marca presença. Body: { token } (QR do
// comprovante) OU { inscricao_id } (busca). `confirmar_pendente: true` libera
// entrada com pagamento pendente — decisão de quem está na porta, auditada
// pelo `por`, nunca da automação.
router.post('/eventos/:id/checkin', authorizeModule('inscricoes', 2), async (req, res) => {
  try {
    const { data: ev } = await supabase.from('insc_eventos')
      .select('id, nome, checkin_ativo').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!ev) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!ev.checkin_ativo) {
      return res.status(409).json({
        error: 'O check-in não está ativado neste evento — ative nas configurações do evento.',
        motivo: 'checkin_inativo',
      });
    }

    const b = req.body || {};
    let inscricaoId = null;
    let modo = 'busca';
    if (b.token) {
      inscricaoId = await verificarTokenComprovanteAtivo(extrairToken(b.token));
      modo = 'qr';
      if (!inscricaoId) {
        return res.status(422).json({ error: 'QR inválido — não é um comprovante de inscrição.', motivo: 'qr_invalido' });
      }
    } else if (typeof b.inscricao_id === 'string' && /^[0-9a-f-]{36}$/i.test(b.inscricao_id)) {
      inscricaoId = b.inscricao_id;
    }
    if (!inscricaoId) return res.status(400).json({ error: 'Informe a inscrição ou o QR do comprovante.' });

    const { data: ins } = await supabase.from('inscricoes')
      .select('id, evento_id, nome_completo, numero_sorte, status')
      .eq('id', inscricaoId).is('deleted_at', null).maybeSingle();
    if (!ins) return res.status(404).json({ error: 'Inscrição não encontrada neste evento.', motivo: 'nao_encontrada' });
    if (ins.evento_id !== req.params.id) {
      // Comprovante VÁLIDO de OUTRO evento (ex.: QR do Celebra na porta dos
      // Patrocinadores) é um caso distinto de "não inscrito" — a portaria
      // precisa saber pra onde mandar a pessoa.
      let outroNome = null;
      try {
        const { data: outro } = await supabase.from('insc_eventos')
          .select('nome').eq('id', ins.evento_id).maybeSingle();
        outroNome = outro?.nome || null;
      } catch { /* nome é cosmético */ }
      return res.status(409).json({
        error: `Este comprovante é de outro evento${outroNome ? ` (${outroNome})` : ''}.`,
        motivo: 'outro_evento', evento_nome: outroNome, nome: ins.nome_completo,
      });
    }
    if (ins.status === 'cancelada') {
      return res.status(409).json({
        error: `A inscrição de ${ins.nome_completo} está cancelada.`,
        motivo: 'cancelada', nome: ins.nome_completo,
      });
    }
    if (ins.status === 'recebida' && !b.confirmar_pendente) {
      return res.status(409).json({
        error: `${ins.nome_completo} está com o pagamento pendente.`,
        motivo: 'pagamento_pendente', nome: ins.nome_completo, inscricao_id: ins.id,
      });
    }

    const marcado = await marcarCheckinAuditavel({
      inscricaoId: ins.id,
      por: req.user?.id || null,
      modo,
      overridePendente: ins.status === 'recebida' && !!b.confirmar_pendente,
      motivo: String(b.motivo_override || '').trim().slice(0, 500)
        || (ins.status === 'recebida' ? 'liberação de pagamento pendente pela portaria' : null),
    });
    if (marcado.ja_checkin) {
      return res.json({
        ok: true, ja_checkin: true, em: marcado.em || null,
        inscricao: { id: ins.id, nome_completo: ins.nome_completo, numero_sorte: ins.numero_sorte },
      });
    }
    res.status(201).json({
      ok: true, em: marcado.em,
      pendente: ins.status === 'recebida' || undefined,
      inscricao: { id: ins.id, nome_completo: ins.nome_completo, numero_sorte: ins.numero_sorte },
    });
  } catch (e) {
    console.error('[inscricoes] checkin:', e.message);
    res.status(500).json({ error: 'Erro ao marcar o check-in' });
  }
});

// DELETE /eventos/:id/checkin/:inscricaoId — desfaz um check-in errado.
// insc_checkins não tem deleted_at (é marca operacional, fora da whitelist de
// soft-delete) — desfazer é DELETE direto mesmo; a regra nº 2 vale pra tabelas
// COM deleted_at.
router.delete('/eventos/:id/checkin/:inscricaoId', authorizeModule('inscricoes', 2), async (req, res) => {
  try {
    const { data: ins } = await supabase.from('inscricoes')
      .select('id').eq('id', req.params.inscricaoId)
      .eq('evento_id', req.params.id).maybeSingle();
    if (!ins) return res.status(404).json({ error: 'Inscrição não encontrada' });
    const resultado = await desfazerCheckinAuditavel({
      eventoId: req.params.id,
      inscricaoId: req.params.inscricaoId,
      por: req.user?.id || null,
      motivo: String(req.body?.motivo || '').trim().slice(0, 500) || 'desfeito pela portaria',
    });
    res.json({ ok: true, ja_desfeito: !!resultado?.ja_desfeito });
  } catch (e) {
    console.error('[inscricoes] desfazer checkin:', e.message);
    res.status(500).json({ error: 'Erro ao desfazer o check-in' });
  }
});

// GET /eventos/:id/checkin/historico — LEITURA do ledger append-only
// (`insc_checkin_eventos`). Sem isso a trilha existia só pra quem abre o SQL
// Editor: a pergunta real da portaria é "quem liberou a entrada dessa pessoa
// com pagamento pendente?" e ela precisa ser respondida na tela.
router.get('/eventos/:id/checkin/historico', authorizeModule('inscricoes', 2), async (req, res) => {
  try {
    const limit = Math.min(300, Math.max(20, parseInt(req.query.limit) || 100));
    const { data, error } = await supabase.from('insc_checkin_eventos')
      .select(`id, acao, modo, motivo, em, ator_id, metadata,
        inscricao:inscricoes(id, nome_completo)`)
      .eq('evento_id', req.params.id)
      .order('em', { ascending: false })
      .limit(limit);
    // Ledger ainda não criado no banco (deploy em duas etapas) — a tela mostra
    // o aviso em vez de um erro vermelho.
    if (tabelaAusente(error)) {
      return res.json({ disponivel: false, items: [], aviso: 'A trilha de check-in ainda não foi criada no banco (migration pendente).' });
    }
    if (error) throw error;
    const nomes = await nomesDeOperadores((data || []).map((l) => l.ator_id));
    res.json({
      disponivel: true,
      items: (data || []).map((l) => ({
        id: l.id,
        acao: l.acao,
        modo: l.modo,
        motivo: l.motivo,
        em: l.em,
        por_nome: nomes[l.ator_id] || null,
        override_pendente: !!l.metadata?.override_pendente,
        nome_completo: l.inscricao?.nome_completo || null,
        inscricao_id: l.inscricao?.id || null,
      })),
    });
  } catch (e) {
    console.error('[inscricoes] histórico de check-in:', e.message);
    res.status(500).json({ error: 'Erro ao carregar a trilha do check-in' });
  }
});

// POST /eventos — cria (com série automática quando periodicidade != unica)
router.post('/eventos', authorizeModule('inscricoes', 3), async (req, res) => {
  try {
    const b = req.body || {};
    const nome = String(b.nome || '').trim();
    if (nome.length < 2) return res.status(400).json({ error: 'Informe o nome do evento' });
    const area = await areaValida(b.area);
    if (!area) return res.status(400).json({ error: 'Selecione uma área válida (catálogo oficial)' });

    const periodicidade = ['unica', 'semanal', 'mensal', 'anual', 'custom'].includes(b.periodicidade)
      ? b.periodicidade : 'unica';
    const slug = await slugUnico(slugify(nome));

    let serieId = null;
    let edicao = null;
    if (periodicidade !== 'unica') {
      const recorreAte = b.recorre_ate && /^\d{4}-\d{2}-\d{2}$/.test(String(b.recorre_ate))
        ? String(b.recorre_ate) : null;
      const { data: serie, error: eS } = await supabase.from('insc_series').insert({
        nome, slug_base: slug, area, periodicidade, recorre_ate: recorreAte,
        tipo: b.tipo === 'retiro' ? 'retiro' : 'evento',
      }).select('id').single();
      if (eS) throw eS;
      serieId = serie.id;
      edicao = rotuloEdicao(periodicidade, b.data);
    }

    const payload = {
      nome, slug, area, serie_id: serieId, edicao_rotulo: edicao,
      tipo: b.tipo === 'retiro' ? 'retiro' : 'evento',
      campos: sanitizeCampos(b.campos),
      status: 'rascunho',
      created_by: req.user?.id || null,
    };
    // Descarta null onde o banco é NOT NULL (ver CAMPOS_EVENTO_NAO_NULO).
    for (const k of CAMPOS_EVENTO) {
      if (k === 'nome' || b[k] === undefined) continue;
      if (b[k] === null && CAMPOS_EVENTO_NAO_NULO.has(k)) continue;
      payload[k] = b[k];
    }
    const metodos = sanitizeMetodos(b.pagamento_metodos);
    if (metodos) payload.pagamento_metodos = metodos;
    const termos = sanitizeTermosExtra(b.termos_extra);
    if (termos) payload.termos_extra = termos;
    // Lotes de preço (20/08): jsonb com saneador próprio, como termos_extra.
    const lotes = sanitizarLotes(b.lotes);
    if (lotes) payload.lotes = lotes;
    const erroCheckout = conferirCheckoutExterno(payload)
      || sanitizeValorCartaoExterno(payload);
    if (erroCheckout) return res.status(400).json({ error: erroCheckout });

    const { data, error } = await supabase.from('insc_eventos').insert(payload).select('id, slug').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error('[inscricoes] criar evento:', e.message);
    res.status(500).json({ error: 'Erro ao criar evento' });
  }
});

// PUT /eventos/:id — atualiza (whitelist; slug/série não mudam aqui)
// Broadcast pro app de membros quando um evento entra em 'publicado': push +
// histórico in-app (app_notificacoes). Audiência = todos os tokens do app.
// Best-effort · lotes p/ não estourar payload. O tap abre /evento/<slug>.
async function notificarNovoEventoApp(evento) {
  if (!evento?.slug) return;
  // ⚠️ PAGINADO (auditoria 06/08/2026): `select('user_id')` cru trunca em 1000
  // linhas server-side, SEM erro — a partir de ~1.000 instalações o "inscrições
  // abertas" alcançaria só o primeiro pedaço da igreja e nada acusaria.
  const toks = await fetchAllRows(() => supabase.from('app_push_tokens').select('user_id'));
  const userIds = [...new Set((toks || []).map((t) => t.user_id).filter(Boolean))];
  if (!userIds.length) return;
  const payload = {
    tipo: 'inscricao_evento',
    titulo: 'Inscrições abertas',
    body: `${evento.nome} — inscreva-se pelo app`,
    data: { tipo: 'inscricao_evento', slug: evento.slug, evento_id: evento.id },
  };
  for (let i = 0; i < userIds.length; i += 500) {
    await notificarApp(userIds.slice(i, i + 500), payload);
  }
}

router.put('/eventos/:id', authorizeModule('inscricoes', 3), async (req, res) => {
  try {
    const b = req.body || {};
    const patch = {};
    aplicarCamposEvento(b, patch);
    if (b.nome !== undefined) {
      const nome = String(b.nome).trim();
      if (nome.length < 2) return res.status(400).json({ error: 'Informe o nome do evento' });
      patch.nome = nome;
    }
    if (b.area !== undefined) {
      const area = await areaValida(b.area);
      if (!area) return res.status(400).json({ error: 'Selecione uma área válida' });
      patch.area = area;
    }
    if (b.campos !== undefined) patch.campos = sanitizeCampos(b.campos);
    if (b.pagamento_metodos !== undefined) {
      const metodos = sanitizeMetodos(b.pagamento_metodos);
      if (metodos) patch.pagamento_metodos = metodos;
    }
    // ⚠️ `[]` é edição legítima (tirar todos os aceites), então só `undefined`
    // significa "não mexeu" — a mesma distinção do checkout externo.
    if (b.termos_extra !== undefined) {
      const termos = sanitizeTermosExtra(b.termos_extra);
      if (termos) patch.termos_extra = termos;
    }
    // `[]` = tirar os lotes (volta ao preço único); `undefined` = não mexeu.
    if (b.lotes !== undefined) {
      const lotes = sanitizarLotes(b.lotes);
      if (lotes) patch.lotes = lotes;
    }
    const erroCheckout = conferirCheckoutExterno(patch)
      || sanitizeValorCartaoExterno(patch);
    if (erroCheckout) return res.status(400).json({ error: erroCheckout });
    if (b.status !== undefined) {
      if (!['rascunho', 'publicado', 'encerrado', 'arquivado'].includes(b.status)) {
        return res.status(400).json({ error: 'Status inválido' });
      }
      patch.status = b.status;
    }
    // Detecta a transição p/ 'publicado' (só notifica o app quando ENTRA em
    // publicado — republicar reabre; salvar já-publicado não redispara).
    let statusAntes = null;
    if (patch.status === 'publicado') {
      const { data: atual } = await supabase.from('insc_eventos')
        .select('status').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
      statusAntes = atual?.status || null;
    }
    const { data, error } = await supabase.from('insc_eventos')
      .update(patch).eq('id', req.params.id).is('deleted_at', null)
      .select('id, nome, slug, status').single();
    if (error) throw error;
    if (data?.status === 'publicado' && statusAntes && statusAntes !== 'publicado') {
      notificarNovoEventoApp(data).catch((e) => console.warn('[inscricoes] push evento publicado:', e.message));
    }
    res.json({ id: data.id });
  } catch (e) {
    console.error('[inscricoes] atualizar evento:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar evento' });
  }
});

// DELETE /eventos/:id — soft delete (padrão da casa)
router.delete('/eventos/:id', authorizeModule('inscricoes', 4), async (req, res) => {
  try {
    const { error } = await supabase.rpc('app_soft_delete', {
      p_table_name: 'insc_eventos', p_row_id: req.params.id, p_deleted_by: req.user?.id ?? null,
    });
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[inscricoes] excluir evento:', e.message);
    res.status(500).json({ error: 'Erro ao excluir evento' });
  }
});

// POST /eventos/:id/nova-edicao — recorrência (decisão Marcos 28/07):
// copia formulário/config pra data nova; evento avulso vira série na hora.
router.post('/eventos/:id/nova-edicao', authorizeModule('inscricoes', 3), async (req, res) => {
  try {
    const dataNova = String(req.body?.data || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataNova)) {
      return res.status(400).json({ error: 'Informe a data da nova edição' });
    }
    const { data: ev, error: eEv } = await supabase.from('insc_eventos')
      .select('*').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (eEv) throw eEv;
    if (!ev) return res.status(404).json({ error: 'Evento não encontrado' });

    let serieId = ev.serie_id;
    let periodicidade = 'mensal';
    if (serieId) {
      const { data: s } = await supabase.from('insc_series')
        .select('periodicidade').eq('id', serieId).maybeSingle();
      periodicidade = s?.periodicidade || 'mensal';
    } else {
      periodicidade = ['semanal', 'mensal', 'anual', 'custom'].includes(req.body?.periodicidade)
        ? req.body.periodicidade : 'mensal';
      const { data: serie, error: eS } = await supabase.from('insc_series').insert({
        nome: ev.nome, slug_base: ev.slug, area: ev.area, periodicidade,
        tipo: ev.tipo || 'evento',
      }).select('id, slug_base').single();
      if (eS) throw eS;
      serieId = serie.id;
      await supabase.from('insc_eventos').update({
        serie_id: serieId, edicao_rotulo: rotuloEdicao(periodicidade, ev.data),
      }).eq('id', ev.id);
    }

    const { data: serie } = await supabase.from('insc_series')
      .select('slug_base').eq('id', serieId).maybeSingle();
    const rotulo = rotuloEdicao(periodicidade, dataNova) || dataNova;
    const slug = await slugUnico(`${serie?.slug_base || ev.slug}-${rotulo}`);

    const novo = {
      nome: ev.nome, slug, area: ev.area, tipo: ev.tipo,
      serie_id: serieId, edicao_rotulo: rotulo,
      descricao: ev.descricao, data: dataNova, hora: ev.hora, local: ev.local,
      capa_url: ev.capa_url, campos: ev.campos, vagas: ev.vagas,
      msg_sucesso_titulo: ev.msg_sucesso_titulo, msg_sucesso_texto: ev.msg_sucesso_texto,
      msg_whatsapp: ev.msg_whatsapp, tem_sorteio: ev.tem_sorteio, premios: ev.premios,
      pagamento_ativo: ev.pagamento_ativo, valor_centavos: ev.valor_centavos,
      pagamento_metodos: ev.pagamento_metodos, pagamento_expira_horas: ev.pagamento_expira_horas,
      checkin_ativo: ev.checkin_ativo,
      status: 'rascunho',
      created_by: req.user?.id || null,
    };
    const { data: criado, error: eNovo } = await supabase.from('insc_eventos')
      .insert(novo).select('id, slug').single();
    if (eNovo) throw eNovo;
    res.status(201).json(criado);
  } catch (e) {
    console.error('[inscricoes] nova edição:', e.message);
    res.status(500).json({ error: 'Erro ao criar a nova edição' });
  }
});

// POST /upload-capa — mesmo bucket/padrão do eventos-externos
router.post('/upload-capa', authorizeModule('inscricoes', 3), upload.single('arquivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado' });
    const ext = (req.file.originalname.split('.').pop() || 'jpg').toLowerCase();
    const path = `espinha/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from('evento-capas').upload(path, req.file.buffer, {
      contentType: req.file.mimetype || 'image/jpeg', upsert: false,
    });
    if (error) throw error;
    const { data } = supabase.storage.from('evento-capas').getPublicUrl(path);
    res.json({ url: data.publicUrl });
  } catch (e) {
    console.error('[inscricoes] upload-capa:', e.message);
    res.status(500).json({ error: 'Erro ao enviar a capa' });
  }
});

// POST /upload-arquivo — documentos do evento (orientações gerais, autorização
// de embarque de menor). Bucket público `evento-arquivos` (migration
// 20260820120000): o link estável é o que a tela de download e o anexo do
// e-mail usam. ⚠️ Documento com dado de PESSOA não entra aqui — bucket público.
const TIPOS_ARQUIVO_EVENTO = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};
router.post('/upload-arquivo', authorizeModule('inscricoes', 3), upload.single('arquivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado' });
    // Extensão sai do MIME validado, nunca do nome (lição da capa do app):
    // .exe renomeado pra .pdf não passa, e nome sem extensão não quebra.
    const ext = TIPOS_ARQUIVO_EVENTO[req.file.mimetype];
    if (!ext) return res.status(400).json({ error: 'Só PDF ou Word (.doc/.docx) — este arquivo vai para download público.' });
    const path = `espinha/arquivos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from('evento-arquivos').upload(path, req.file.buffer, {
      contentType: req.file.mimetype, upsert: false,
    });
    if (error) throw error;
    const { data } = supabase.storage.from('evento-arquivos').getPublicUrl(path);
    // O nome original volta pra tela guardar como rótulo de exibição.
    res.json({ url: data.publicUrl, nome: String(req.file.originalname || `arquivo.${ext}`).slice(0, 160) });
  } catch (e) {
    console.error('[inscricoes] upload-arquivo:', e.message);
    res.status(500).json({ error: 'Erro ao enviar o arquivo' });
  }
});

// ============================================================================
// Templates de e-mail (pedido do Marcos · 31/07)
//
// Resolução em 3 níveis, feita no serviço: template do EVENTO > template GLOBAL
// > layout do código. Tabela vazia = todos os e-mails saem no padrão, então este
// CRUD é sempre OPCIONAL — apagar um template não deixa ninguém sem e-mail.
//
// Níveis: ler = 2 (quem opera inscrições) · escrever = 5 (mudar o texto muda o
// que TODA pessoa inscrita recebe em nome da igreja).
// ============================================================================

/** Lista os templates + o catálogo de variáveis pra tela montar a ajuda. */
router.get('/email-templates', authorizeModule('inscricoes', 2), async (req, res) => {
  try {
    // Esqueleto do texto padrão de cada tipo: é com ele que a tela abre
    // PREENCHIDA (o botão "Começar do texto padrão"). Sem isso o editor abria
    // em branco e a pessoa tinha que montar o e-mail do zero.
    const padrao = {};
    TIPOS_EDITAVEIS.forEach((t) => { padrao[t] = esqueletoPadrao(t); });

    let q = supabase.from('insc_email_templates')
      .select('id, tipo, evento_id, assunto, corpo_html, ativo, incluir_assinatura, atualizado_por_nome, updated_at');
    if (req.query.evento_id) {
      q = q.or(`evento_id.eq.${escapePostgrestValue(String(req.query.evento_id))},evento_id.is.null`);
    } else {
      q = q.is('evento_id', null);
    }
    const { data, error } = await q;
    // Tabela ausente (deploy em 2 etapas) NÃO é 500: a tela abre mostrando que
    // tudo está no padrão, que é a verdade.
    if (error) {
      console.warn('[inscricoes] email-templates indisponível:', error.message);
      return res.json({
        templates: [], tipos: TIPOS_EMAIL, variaveis: VARIAVEIS_EMAIL, padrao,
        aviso: 'Personalização ainda não disponível (migration pendente). Os e-mails estão saindo no texto padrão.',
      });
    }
    res.json({ templates: data || [], tipos: TIPOS_EMAIL, variaveis: VARIAVEIS_EMAIL, padrao });
  } catch (e) {
    console.error('[inscricoes] GET email-templates:', e.message);
    res.status(500).json({ error: 'Erro ao carregar os templates' });
  }
});

/** Cria/atualiza o template de um tipo (global, ou de um evento). */
router.put('/email-templates/:tipo', authorizeModule('inscricoes', 5), async (req, res) => {
  try {
    const tipo = String(req.params.tipo || '');
    if (!TIPOS_EDITAVEIS.includes(tipo)) return res.status(400).json({ error: 'Tipo inválido' });

    const ehAssinatura = tipo === 'assinatura';
    // A assinatura não tem assunto (não é um e-mail); guarda string vazia pra
    // satisfazer o NOT NULL da coluna.
    const assunto = ehAssinatura ? '' : String(req.body?.assunto || '').trim();
    const corpo = String(req.body?.corpo_html || '').trim();
    if (!ehAssinatura && !assunto) return res.status(400).json({ error: 'O assunto é obrigatório' });
    if (!corpo) return res.status(400).json({ error: ehAssinatura ? 'A assinatura está vazia' : 'O corpo do e-mail é obrigatório' });

    // Assinatura é sempre global (o CHECK do banco também recusa por evento).
    const eventoId = ehAssinatura ? null : (req.body?.evento_id || null);
    const linha = {
      tipo,
      evento_id: eventoId,
      assunto,
      // Sanitiza na ENTRADA além da saída: o que fica guardado no banco já vai
      // sem script/handler, então um leitor futuro não herda o problema.
      corpo_html: sanitizarHtmlEmail(corpo),
      ativo: req.body?.ativo !== false,
      incluir_assinatura: req.body?.incluir_assinatura !== false,
      atualizado_por: req.user?.id || null,
      atualizado_por_nome: req.user?.name || req.user?.email || null,
    };

    // Upsert manual: são dois índices parciais (global × por evento), então não
    // existe um onConflict único que sirva pros dois casos.
    let existente = supabase.from('insc_email_templates').select('id').eq('tipo', tipo);
    existente = eventoId ? existente.eq('evento_id', eventoId) : existente.is('evento_id', null);
    const { data: achado } = await existente.maybeSingle();

    const q = achado?.id
      ? supabase.from('insc_email_templates').update(linha).eq('id', achado.id).select().single()
      : supabase.from('insc_email_templates').insert(linha).select().single();

    const { data, error } = await q;
    if (error) throw error;
    res.json({ ok: true, template: data });
  } catch (e) {
    console.error('[inscricoes] PUT email-templates:', e.message);
    res.status(500).json({ error: 'Erro ao salvar o template' });
  }
});

/** Restaura o padrão do código = apaga a customização. */
router.delete('/email-templates/:tipo', authorizeModule('inscricoes', 5), async (req, res) => {
  try {
    const tipo = String(req.params.tipo || '');
    if (!TIPOS_EDITAVEIS.includes(tipo)) return res.status(400).json({ error: 'Tipo inválido' });
    let q = supabase.from('insc_email_templates').delete().eq('tipo', tipo);
    q = req.query.evento_id ? q.eq('evento_id', String(req.query.evento_id)) : q.is('evento_id', null);
    const { error } = await q;
    if (error) throw error;
    res.json({ ok: true, restaurado: 'padrao' });
  } catch (e) {
    console.error('[inscricoes] DELETE email-templates:', e.message);
    res.status(500).json({ error: 'Erro ao restaurar o padrão' });
  }
});

/** Prévia com dados fictícios · não envia nada e não toca em inscrição real. */
router.post('/email-templates/preview', authorizeModule('inscricoes', 2), async (req, res) => {
  try {
    // A prévia inclui a assinatura salva — senão ela mentiria sobre o que a
    // pessoa vai receber.
    const p = previewTemplate({
      tipo: String(req.body?.tipo || ''),
      assunto: String(req.body?.assunto || ''),
      corpo_html: String(req.body?.corpo_html || ''),
      assinaturaHtml: await carregarAssinatura(),
      incluirAssinatura: req.body?.incluir_assinatura !== false,
    });
    res.json(p);
  } catch (e) {
    console.error('[inscricoes] preview email:', e.message);
    res.status(500).json({ error: 'Erro ao gerar a prévia' });
  }
});

/**
 * Envia o rascunho pro e-mail de QUEM PEDIU.
 *
 * ⚠️ Destinatário é SEMPRE `req.user.email` — nunca aceita endereço do corpo da
 * requisição. Um "enviar teste para..." livre transformaria a tela num relay de
 * e-mail em nome da igreja.
 */
router.post('/email-templates/teste', authorizeModule('inscricoes', 5), async (req, res) => {
  try {
    const para = req.user?.email;
    if (!para) return res.status(400).json({ error: 'Sua conta não tem e-mail cadastrado' });

    const p = previewTemplate({
      tipo: String(req.body?.tipo || ''),
      assunto: String(req.body?.assunto || ''),
      corpo_html: String(req.body?.corpo_html || ''),
      assinaturaHtml: await carregarAssinatura(),
      incluirAssinatura: req.body?.incluir_assinatura !== false,
    });
    const r = await enviarEmail({
      to: para,
      subject: `[TESTE] ${p.assunto}`,
      html: p.html,
      text: p.html.replace(/<[^>]+>/g, ''),
      fromName: 'CBRio',
    });
    if (!r.ok) return res.status(502).json({ error: `Não foi possível enviar: ${r.error}` });
    res.json({ ok: true, enviado_para: para });
  } catch (e) {
    console.error('[inscricoes] teste email:', e.message);
    res.status(500).json({ error: 'Erro ao enviar o teste' });
  }
});

// ============================================================================
// TOTEM · inscrição em evento pelo quiosque (2026-08-05 · Fase 1)
//
// As inscrições de evento vivem DENTRO do Totem Membro (`/totem`), ao lado de
// grupos/batismo/Next/apresentação — decisão do Matheus. O quiosque já está
// autenticado por conta de quiosque, então:
//
//  · o guard é `inscricoes-totem` (routeKey que inclui `totem-membro`, senão a
//    conta de quiosque — que só tem esse módulo — seria bloqueada);
//  · a ESTAÇÃO sai da conta logada (`estacaoDaConta`), nunca do corpo do
//    request. É isso que faz a cobrança saber qual totem cobrou.
//
// ⚠️ Inscrever roda a MESMA `inscreverEspinha` da porta pública e do app —
// vaga sob advisory lock, dedup por CPF, benefício por CPF, cobrança
// idempotente, consentimentos, e-mail e WhatsApp. Reimplementar aqui é como um
// dos caminhos para de honrar `insc_beneficios` seis meses depois.
// ============================================================================
const { inscreverEspinha, eventoEspinhaPorId, ocupacaoEspinha } = require('./publicEventoExterno');
const totemEstacao = require('../services/totemEstacao');

// GET /inscricoes/totem/eventos — o que o totem pode oferecer AGORA.
// `no_totem` é o filtro que impede a tela do hall de anunciar retiro de
// liderança: publicar um evento NÃO o expõe no totem (default false).
router.get('/totem/eventos', authorizeModule('inscricoes-totem', 1), async (req, res) => {
  try {
    const hoje = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase.from('insc_eventos')
      .select('id, nome, slug, area, data, hora, local, descricao, campos, capa_url, vagas, valor_centavos, pagamento_ativo, pagamento_metodos, parcelas_max, tem_sorteio, inscricoes_abrem_em, inscricoes_encerram_em')
      .eq('status', 'publicado').eq('no_totem', true).is('deleted_at', null)
      // Evento que já passou não fica no hall. `data` nula = sem data marcada
      // (série em aberto), então entra — filtrar por `>= hoje` sumiria com ela.
      .or(`data.is.null,data.gte.${hoje}`)
      .order('data', { ascending: true, nullsFirst: false });
    if (error) throw error;

    const agora = Date.now();
    const abertos = (data || []).filter((ev) => {
      // Mesma régua de janela da porta pública (`espinhaEncerrada`): abrir a
      // inscrição no totem antes/depois da janela seria oferecer o que a RPC
      // vai recusar — a pessoa preencheria o formulário pra levar um 403.
      if (ev.inscricoes_abrem_em && new Date(ev.inscricoes_abrem_em).getTime() > agora) return false;
      if (ev.inscricoes_encerram_em && new Date(ev.inscricoes_encerram_em).getTime() < agora) return false;
      return true;
    });

    // Vagas pela MESMA RPC da porta pública. Lista curta (só os do totem), e
    // falha degrada pra "sem contagem" em vez de derrubar a tela.
    const comVagas = await Promise.all(abertos.map(async (ev) => {
      const ocup = ev.vagas ? await ocupacaoEspinha(ev.id) : null;
      return { ...ev, vagas_restantes: ocup ? ocup.restantes : null };
    }));

    // Esgotado sai da lista: no hall, card que só serve pra dizer "acabou"
    // ocupa o lugar do evento que ainda tem vaga.
    res.json({ eventos: comVagas.filter((ev) => ev.vagas_restantes === null || ev.vagas_restantes > 0) });
  } catch (e) {
    console.error('[inscricoes] totem eventos:', e.message);
    res.status(500).json({ error: 'Erro ao carregar os eventos' });
  }
});

// POST /inscricoes/totem/eventos/:id/inscrever
router.post('/totem/eventos/:id/inscrever', authorizeModule('inscricoes-totem', 1), async (req, res) => {
  try {
    const ev = await eventoEspinhaPorId(req.params.id);
    if (!ev) return res.status(404).json({ error: 'Evento não encontrado' });
    // ⚠️ Só o que está liberado pro totem — senão bastaria alguém saber o id de
    // um evento fechado pra inscrever por aqui.
    if (!ev.no_totem) return res.status(403).json({ error: 'Este evento não está disponível no totem.' });

    const estacao = await totemEstacao.estacaoDaConta(req.user?.id);
    // Estação ausente NÃO bloqueia: a inscrição vale, só nasce sem origem — o
    // mesmo estado de quem se inscreve pela web. Travar aqui faria um vínculo
    // de cadastro esquecido virar totem que não inscreve ninguém no domingo.
    return await inscreverEspinha(req, res, ev, {
      origem: 'totem',
      estacaoId: estacao?.id || null,
    });
  } catch (e) {
    console.error('[inscricoes] totem inscrever:', e.message);
    res.status(500).json({ error: 'Erro ao concluir a inscrição' });
  }
});

// ============================================================================
// TOTENS · estações de autoatendimento (2026-08-05 · Fase 0)
//
// Gestão fica AQUI e não num módulo novo: quem gerencia eventos é quem gerencia
// os totens que os vendem, e `inscricoes` já está no ROUTE_MODULE_MAP (uma
// coluna menos na matriz de permissões).
//
// Ver = nível 1 · criar/parear/revogar = nível 4. Nível 4 e não 3 de propósito:
// aqui se decide qual equipamento pode receber dinheiro em nome da igreja.
// ============================================================================
// Régua PURA do cerco de rede (mesma que o middleware usa pra decidir se o
// token vale). Importada, nunca copiada — cópia divergente aqui faria a tela
// salvar um cerco que o middleware não reconhece.
const { sanitizarIps } = require('../utils/totemCerco');

// GET /inscricoes/totens — lista com o estado das credenciais.
// ⚠️ Nunca devolve `token_hash`; só `prefixo` (8 chars) pra pessoa reconhecer
// a linha na tela.
router.get('/totens', authorizeModule('inscricoes', 1), async (req, res) => {
  try {
    const { data: estacoes, error } = await supabase.from('totem_estacoes')
      .select('*').order('codigo');
    if (error) throw error;

    const ids = (estacoes || []).map((e) => e.id);
    let tokens = [];
    if (ids.length) {
      const { data, error: e2 } = await supabase.from('totem_estacao_tokens')
        .select('id, estacao_id, tipo, prefixo, rotulo, linhagem, expira_em, pareado_em, usado_em, ultimo_uso_em, revogado_em, revogado_motivo, created_at')
        .in('estacao_id', ids).order('created_at', { ascending: false });
      if (e2) throw e2;
      tokens = data || [];
    }

    // E-mail da conta vinculada — é o que a tela mostra ("conta totem1@..."),
    // e sem isso a pessoa veria um uuid. Consulta separada e best-effort: o
    // embed do PostgREST exigiria FK declarada no schema cache, e falhar aqui
    // não pode derrubar a lista de totens.
    const contaIds = [...new Set((estacoes || []).map((e) => e.conta_id).filter(Boolean))];
    const emailPorConta = new Map();
    if (contaIds.length) {
      const { data: profs } = await supabase.from('profiles').select('id, email, name').in('id', contaIds);
      for (const p of profs || []) emailPorConta.set(p.id, p.email || p.name || null);
    }

    const agora = Date.now();
    const lista = (estacoes || []).map((e) => {
      const meus = tokens.filter((t) => t.estacao_id === e.id);
      const vivo = (t) => !t.revogado_em && (!t.expira_em || new Date(t.expira_em).getTime() > agora);
      return {
        ...e,
        conta_email: e.conta_id ? (emailPorConta.get(e.conta_id) || null) : null,
        // "online" = bateu ponto nos últimos 2 min. O heartbeat tem throttle de
        // 60s, então 2 min tolera uma batida perdida sem acusar queda falsa.
        online: !!e.ultima_batida_em && (agora - new Date(e.ultima_batida_em).getTime()) < 120000,
        dispositivo: meus.find((t) => t.tipo === 'dispositivo' && vivo(t)) || null,
        agente: meus.find((t) => t.tipo === 'agente' && vivo(t)) || null,
        pareamento_pendente: meus.find((t) => t.tipo === 'pareamento' && vivo(t) && !t.usado_em) || null,
        historico: meus.slice(0, 20),
      };
    });

    res.json({ estacoes: lista });
  } catch (e) {
    console.error('[inscricoes] listar totens:', e.message);
    res.status(500).json({ error: 'Erro ao carregar os totens' });
  }
});

// POST /inscricoes/totens — cria estação
router.post('/totens', authorizeModule('inscricoes', 4), async (req, res) => {
  try {
    const codigo = String(req.body?.codigo || '').trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{1,30}$/.test(codigo)) {
      return res.status(400).json({ error: 'Código: minúsculas, números e hífen (ex.: hall-01).' });
    }
    const nome = String(req.body?.nome || '').trim();
    if (nome.length < 3) return res.status(400).json({ error: 'Dê um nome que a equipe reconheça (ex.: Totem do Hall).' });

    const finalidades = Array.isArray(req.body?.finalidades) && req.body.finalidades.length
      ? req.body.finalidades.filter((f) => ['inscricoes', 'kids', 'membro', 'voluntariado'].includes(f))
      : ['inscricoes'];
    if (!finalidades.length) return res.status(400).json({ error: 'Finalidade inválida.' });

    const ips = sanitizarIps(req.body?.ip_permitidos);
    const linha = {
      codigo, nome, finalidades,
      local: String(req.body?.local || '').trim() || null,
      evento_fixo_id: req.body?.evento_fixo_id || null,
      ip_permitidos: ips.lista,
      created_by: req.user?.id || null,
    };

    const { data, error } = await supabase.from('totem_estacoes').insert(linha).select('*').single();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: `Já existe um totem com o código "${codigo}".` });
      throw error;
    }
    // ⚠️ IP descartado é DECLARADO: "salvou" com o cerco vazio faria a equipe
    // acreditar que o totem está protegido quando não está.
    res.status(201).json({
      ok: true,
      estacao: data,
      aviso: ips.descartados.length
        ? `Não entendi como IP: ${ips.descartados.join(', ')}. ${ips.lista ? 'O resto foi salvo.' : 'O totem ficou SEM cerco de rede.'}`
        : undefined,
    });
  } catch (e) {
    console.error('[inscricoes] criar totem:', e.message);
    res.status(500).json({ error: 'Erro ao criar o totem' });
  }
});

// PATCH /inscricoes/totens/:id — edição (nome, local, evento fixo, cerco, TEF)
router.patch('/totens/:id', authorizeModule('inscricoes', 4), async (req, res) => {
  try {
    const patch = {};
    if (req.body?.nome !== undefined) patch.nome = String(req.body.nome).trim();
    if (req.body?.local !== undefined) patch.local = String(req.body.local || '').trim() || null;
    if (req.body?.evento_fixo_id !== undefined) patch.evento_fixo_id = req.body.evento_fixo_id || null;
    let avisoIps;
    if (req.body?.ip_permitidos !== undefined) {
      const ips = sanitizarIps(req.body.ip_permitidos);
      patch.ip_permitidos = ips.lista;
      if (ips.descartados.length) {
        avisoIps = `Não entendi como IP: ${ips.descartados.join(', ')}. ${ips.lista ? 'O resto foi salvo.' : 'O totem ficou SEM cerco de rede.'}`;
      }
    }
    if (req.body?.ativo !== undefined) patch.ativo = !!req.body.ativo;
    // Conta de quiosque que ESTÁ neste totem — é o que faz o servidor resolver
    // a estação a partir do usuário logado. `null` desvincula.
    if (req.body?.conta_id !== undefined) patch.conta_id = req.body.conta_id || null;
    if (req.body?.finalidades !== undefined && Array.isArray(req.body.finalidades)) {
      const f = req.body.finalidades.filter((x) => ['inscricoes', 'kids', 'membro', 'voluntariado'].includes(x));
      if (f.length) patch.finalidades = f;
    }
    // Campos do pinpad: entram agora pra a estação nascer completa, mas só
    // passam a ter efeito quando o cartão presencial (Fase 2) existir.
    for (const c of ['tef_provider', 'tef_terminal_serie', 'tef_terminal_logico']) {
      if (req.body?.[c] !== undefined) patch[c] = String(req.body[c] || '').trim() || null;
    }
    if (req.body?.tef_ativo !== undefined) patch.tef_ativo = !!req.body.tef_ativo;
    for (const c of ['printer_target', 'printer_modelo']) {
      if (req.body?.[c] !== undefined) patch[c] = String(req.body[c] || '').trim() || null;
    }

    if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nada a atualizar.' });

    // Reativar estação revogada é ato explícito: limpa a marca de revogação
    // (senão o middleware continuaria recusando e ninguém entenderia por quê).
    if (patch.ativo === true) {
      patch.revogada_em = null; patch.revogada_motivo = null; patch.revogada_por = null;
    }

    const { data, error } = await supabase.from('totem_estacoes')
      .update(patch).eq('id', req.params.id).select('*').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Totem não encontrado' });

    totemEstacao.limparCache();
    res.json({ ok: true, estacao: data, aviso: avisoIps });
  } catch (e) {
    console.error('[inscricoes] editar totem:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar o totem' });
  }
});

// POST /inscricoes/totens/:id/pareamento — código do AGENTE DO PINPAD.
// ⚠️ NÃO é pareamento do navegador: o totem de inscrições vive dentro do Totem
// Membro, que já está logado na conta de quiosque, e a estação sai da conta
// (`conta_id`). Este código serve só pro agente do pinpad (Fase 3), que é
// serviço Windows e não tem sessão.
router.post('/totens/:id/pareamento', authorizeModule('inscricoes', 4), async (req, res) => {
  try {
    const { data: est, error } = await supabase.from('totem_estacoes')
      .select('id, codigo, nome, ativo, revogada_em').eq('id', req.params.id).maybeSingle();
    if (error) throw error;
    if (!est) return res.status(404).json({ error: 'Totem não encontrado' });
    if (!est.ativo || est.revogada_em) {
      return res.status(400).json({ error: 'Reative este totem antes de parear.' });
    }

    const r = await totemEstacao.gerarPareamento(est.id, {
      criadoPor: req.user?.id || null,
      rotulo: String(req.body?.rotulo || '').trim() || null,
    });

    // ⚠️ O código aparece UMA vez, aqui. Não é recuperável depois — gerar outro
    // é o caminho (e o anterior é revogado automaticamente).
    res.json({ ok: true, codigo: r.codigo, expira_em: r.expira_em, estacao: { id: est.id, codigo: est.codigo, nome: est.nome } });
  } catch (e) {
    console.error('[inscricoes] pareamento totem:', e.message);
    res.status(500).json({ error: 'Erro ao gerar o código de pareamento' });
  }
});

// GET /inscricoes/totens/contas — contas de quiosque que podem SER um totem.
// Sem isso a tela pediria pra alguém digitar um uuid de profile na mão.
// Nível 4 porque a lista é insumo de quem vincula equipamento a dinheiro.
router.get('/totens/contas', authorizeModule('inscricoes', 4), async (req, res) => {
  try {
    // Candidata = conta com cargo de quiosque (`totem-kiosk` do Totem Membro ou
    // `totem-kids`). O vínculo real é com `profiles.id`, mas o cargo vive em
    // `usuarios` (id INTEGER legado, casado por e-mail) — mesma costura que o
    // resto do sistema faz.
    const { data: cargos, error: e0 } = await supabase.from('cargos')
      .select('id, slug').in('slug', ['totem-kiosk', 'totem-kids']);
    if (e0) throw e0;
    const cargoIds = (cargos || []).map((c) => c.id);
    if (!cargoIds.length) return res.json({ contas: [] });

    const { data: us, error: e1 } = await supabase.from('usuarios')
      .select('email, cargo_id').in('cargo_id', cargoIds);
    if (e1) throw e1;
    const emails = [...new Set((us || []).map((u) => String(u.email || '').toLowerCase()).filter(Boolean))];
    if (!emails.length) return res.json({ contas: [] });

    const { data: profs, error: e2 } = await supabase.from('profiles')
      .select('id, email, name').in('email', emails);
    if (e2) throw e2;

    // Quais já estão em uso: a tela precisa mostrar isso, senão a pessoa tenta
    // vincular uma conta ocupada e leva um 409 sem entender.
    const { data: usadas } = await supabase.from('totem_estacoes')
      .select('conta_id, codigo').not('conta_id', 'is', null);
    const porConta = new Map((usadas || []).map((e) => [e.conta_id, e.codigo]));

    res.json({
      contas: (profs || []).map((p) => ({
        id: p.id, email: p.email, nome: p.name,
        em_uso_por: porConta.get(p.id) || null,
      })).sort((a, b) => String(a.email).localeCompare(String(b.email))),
    });
  } catch (e) {
    console.error('[inscricoes] contas de totem:', e.message);
    res.status(500).json({ error: 'Erro ao carregar as contas de quiosque' });
  }
});

// POST /inscricoes/totens/:id/revogar — mata a estação e TODAS as credenciais
router.post('/totens/:id/revogar', authorizeModule('inscricoes', 4), async (req, res) => {
  try {
    const r = await totemEstacao.revogarEstacao(req.params.id, {
      por: req.user?.id || null,
      motivo: req.body?.motivo,
    });
    if (!r.ok) {
      return res.status(400).json({ error: 'Diga o motivo da revogação (fica no registro de auditoria).' });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[inscricoes] revogar totem:', e.message);
    res.status(500).json({ error: 'Erro ao revogar o totem' });
  }
});

// POST /inscricoes/totens/tokens/:tokenId/revogar — revoga UMA credencial
// (dispositivo trocado, navegador reinstalado) sem desligar a estação.
router.post('/totens/tokens/:tokenId/revogar', authorizeModule('inscricoes', 4), async (req, res) => {
  try {
    const r = await totemEstacao.revogarToken(req.params.tokenId, {
      por: req.user?.id || null,
      motivo: req.body?.motivo || 'revogado pela equipe',
    });
    if (!r.ok) return res.status(400).json({ error: 'Diga o motivo da revogação.' });
    if (!r.revogados) return res.status(404).json({ error: 'Credencial não encontrada ou já revogada' });
    res.json({ ok: true });
  } catch (e) {
    console.error('[inscricoes] revogar credencial:', e.message);
    res.status(500).json({ error: 'Erro ao revogar a credencial' });
  }
});

module.exports = router;

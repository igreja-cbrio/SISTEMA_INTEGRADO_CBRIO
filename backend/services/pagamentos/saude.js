// Sonda de saúde da CREDENCIAL do provedor de pagamento.
//
// O problema que isto resolve (avisado pelo próprio painel do Asaas, na tela de
// gerar chave): "chaves de API sem uso são desabilitadas após 3 meses e
// permanentemente expiradas após 6 meses". Nosso sistema só chama a API quando
// existe cobrança — o cron de 10 min não fala com o PSP se não há nada pra
// reconciliar. Então um intervalo grande entre eventos pagos mata a chave EM
// SILÊNCIO, e o sintoma aparece no lançamento do evento seguinte, quando
// ninguém consegue pagar e nada explica por quê.
//
// Desenho, e o porquê de cada escolha:
//
//   • Roda dentro do cron que JÁ existe (`/cron/tick`), no máximo 1x/dia. Não
//     criamos cron novo — o projeto já tem 45 declarados, e cada slot novo é
//     risco de teto de plano (ver a lição do "teto de 40" no CLAUDE.md).
//   • É SILENCIOSA quando está tudo bem. Notificação que chega todo dia deixa
//     de ser lida, e aí não serve pro dia em que importa.
//   • NÃO reclama quando a credencial simplesmente não está configurada. Esse é
//     um estado INTENCIONAL (produção viveu semanas em provider `manual`), e
//     alarmar sobre configuração deliberada é o jeito mais rápido de treinar
//     todo mundo a ignorar o alarme.
//   • Erro transitório (rede, 5xx) só chama gente ao INSISTIR; credencial
//     inválida (401/403) e chave do ambiente errado chamam na primeira.

const { supabase } = require('../../utils/supabase');
const { notificar } = require('../notificar');
const providers = require('./providers');

// Uma vez por dia. 20h em vez de 24h de propósito: com 24h exatas, o tick que
// roda alguns segundos antes do aniversário pula o dia inteiro.
const INTERVALO_MS = 20 * 60 * 60 * 1000;

// Falhas transitórias em sequência antes de chamar gente. 3 tentativas em dias
// diferentes é sinal de problema, não de soluço de rede.
const FALHAS_PRA_AVISAR = 3;

// Um aviso por dia no máximo, mesmo com falha persistente.
const INTERVALO_AVISO_MS = 20 * 60 * 60 * 1000;

/** Erro de credencial AUSENTE — estado de configuração, não falha. */
function ehCredencialAusente(msg) {
  return /não configurada|nao configurada/i.test(String(msg || ''));
}

/**
 * Chave do ambiente errado (a guarda de prefixo do adapter). É misconfiguração
 * real: com ela, criar cobrança falha. Merece aviso na primeira ocorrência.
 */
function ehAmbienteTrocado(msg) {
  return /é de SANDBOX|é de PRODUÇÃO/i.test(String(msg || ''));
}

/** 401/403 = credencial recusada: revogada, expirada por desuso, ou trocada. */
function ehCredencialRecusada(status) {
  return status === 401 || status === 403;
}

async function linhaAtual(provider) {
  const { data, error } = await supabase.from('pag_provider_saude')
    .select('*').eq('provider', provider).maybeSingle();
  // Tabela ausente (migration não aplicada) não pode derrubar o cron — a sonda
  // é rede de segurança, não caminho crítico.
  if (error) { console.error('[pagamentos/saude] leitura:', error.message); return null; }
  return data || null;
}

async function gravar(provider, patch) {
  const { error } = await supabase.from('pag_provider_saude')
    .upsert({ provider, ...patch }, { onConflict: 'provider' });
  if (error) console.error('[pagamentos/saude] gravação:', error.message);
}

async function avisar({ provider, titulo, mensagem, severidade }) {
  await notificar({
    modulo: 'inscricoes',
    tipo: 'pagamento_credencial',
    titulo,
    mensagem,
    severidade,
    // Dedup por DIA: falha persistente não vira notificação diária empilhada.
    chaveDedup: `pag_credencial_${provider}_${new Date().toISOString().slice(0, 10)}`,
    link: '/inscricoes',
  }).catch((e) => console.error('[pagamentos/saude] notificar:', e.message));
}

/**
 * Verifica a credencial do provider e persiste o resultado.
 *
 * Devolve sempre um objeto (nunca lança): é chamada de dentro de cron e de rota,
 * e sonda que derruba quem a chama é pior do que sonda que não roda.
 *
 * `{ pulado: <motivo> }`  → não havia o que verificar (não é falha)
 * `{ ok: true, ... }`     → credencial respondeu
 * `{ ok: false, ... }`    → credencial não respondeu (já notificado se grave)
 */
async function verificar({ provider, forcar = false } = {}) {
  const nome = provider || providers.providerPadrao();

  // `manual` é dinheiro fora de PSP (espécie, transferência lançada à mão) —
  // não existe credencial pra verificar.
  if (nome === 'manual') return { provider: nome, pulado: 'provider_manual' };

  let adapter;
  try {
    adapter = providers.obter(nome);
  } catch (e) {
    return { provider: nome, pulado: 'provider_desconhecido', erro: e.message };
  }
  if (typeof adapter.verificarChave !== 'function') {
    return { provider: nome, pulado: 'adapter_sem_sonda' };
  }

  const atual = await linhaAtual(nome);
  if (!forcar && atual?.verificado_em) {
    const desde = Date.now() - new Date(atual.verificado_em).getTime();
    if (desde < INTERVALO_MS) {
      return { provider: nome, pulado: 'verificado_recentemente', verificado_em: atual.verificado_em };
    }
  }

  try {
    const r = await adapter.verificarChave();
    const recuperou = (atual?.falhas_consecutivas || 0) >= FALHAS_PRA_AVISAR
      || (atual?.ok === false && atual?.avisado_em);
    await gravar(nome, {
      verificado_em: new Date().toISOString(),
      ok: true, status_http: 200, erro: null,
      latencia_ms: r?.latencia_ms ?? null,
      falhas_consecutivas: 0, avisado_em: null,
    });
    // Só avisa a recuperação se ALGUÉM foi incomodado com a falha — fechar o
    // loop de um alarme que ninguém viu é só mais ruído.
    if (recuperou) {
      await avisar({
        provider: nome, severidade: 'info',
        titulo: 'Credencial de pagamento voltou a responder',
        mensagem: `A chave do ${nome} respondeu normalmente. Cobranças e confirmações voltaram ao normal.`,
      });
    }
    return { provider: nome, ok: true, latencia_ms: r?.latencia_ms ?? null };
  } catch (e) {
    const msg = e?.message || 'erro desconhecido';
    const status = e?.status ?? null;

    // Credencial ausente: estado de configuração. Registra e cala a boca.
    if (ehCredencialAusente(msg)) {
      await gravar(nome, {
        verificado_em: new Date().toISOString(),
        ok: null, status_http: null, erro: null, latencia_ms: null,
        falhas_consecutivas: 0, avisado_em: null,
      });
      return { provider: nome, pulado: 'sem_credencial' };
    }

    const falhas = (atual?.falhas_consecutivas || 0) + 1;
    const grave = ehCredencialRecusada(status) || ehAmbienteTrocado(msg);
    const insistiu = falhas >= FALHAS_PRA_AVISAR;
    const avisadoHa = atual?.avisado_em ? Date.now() - new Date(atual.avisado_em).getTime() : Infinity;
    const deveAvisar = (grave || insistiu) && avisadoHa >= INTERVALO_AVISO_MS;

    await gravar(nome, {
      verificado_em: new Date().toISOString(),
      ok: false, status_http: status, erro: msg.slice(0, 500),
      latencia_ms: null, falhas_consecutivas: falhas,
      ...(deveAvisar ? { avisado_em: new Date().toISOString() } : {}),
    });

    if (deveAvisar) {
      const porque = ehAmbienteTrocado(msg)
        ? 'A chave configurada é do ambiente errado.'
        : ehCredencialRecusada(status)
          ? 'O provedor recusou a chave (401/403) — ela pode ter sido revogada, trocada, ou expirada por desuso.'
          : `Falhou ${falhas} vezes seguidas.`;
      await avisar({
        provider: nome, severidade: 'alta',
        titulo: 'Credencial de pagamento não está respondendo',
        mensagem: `${porque} Enquanto isso, evento pago não consegue gerar cobrança e pagamento feito pode não ser confirmado automaticamente. Detalhe técnico: ${msg.slice(0, 200)}`,
      });
    }

    console.error(`[pagamentos/saude] ${nome} falhou (${falhas}x):`, msg);
    return { provider: nome, ok: false, status_http: status, erro: msg, falhas_consecutivas: falhas };
  }
}

/** Estado persistido, pra tela. Nunca lança. */
async function atual(provider) {
  const nome = provider || providers.providerPadrao();
  const linha = await linhaAtual(nome);
  return {
    provider: nome,
    configurado: providers.pspConfigurado(),
    ...(linha || {}),
  };
}

module.exports = {
  verificar,
  atual,
  // Expostos pra teste: a classificação do erro é o que decide entre "cala a
  // boca" e "acorda gente", e é fácil quebrar mexendo numa regex.
  _internos: {
    INTERVALO_MS, FALHAS_PRA_AVISAR, INTERVALO_AVISO_MS,
    ehCredencialAusente, ehAmbienteTrocado, ehCredencialRecusada,
  },
};

// ════════════════════════════════════════════════════════════════════════════
// Cliente do Plaud · lê as gravações da reunião ministerial
//
// Por que existe: o Plaud NÃO tem API pública nem webhook (confirmado
// 18/08/2026 — a plataforma de desenvolvedor deles é para embarcar o hardware
// no seu próprio app, e a própria página manda usar o MCP/CLI para ler a
// conta). Mas o MCP é só um embrulho sobre esta API OAuth, que responde bem a
// um Bearer token. Assim o ERP lê sozinho, sem depender da máquina de ninguém.
//
// ⚠️ O REFRESH TOKEN ROTACIONA. Cada renovação devolve um novo (verificado:
// `expires_in: 86400` e `refresh_token` diferente do enviado). Por isso a
// credencial vive na tabela `plaud_credencial` e é REESCRITA a cada renovação —
// guardar em variável de ambiente faria a integração morrer um dia depois,
// sem aviso.
//
// ⚠️ O refresh é `application/x-www-form-urlencoded`. Mandar JSON devolve
// `422 Field required` com `input: null`, que parece erro de token e não é.
// ════════════════════════════════════════════════════════════════════════════

const { supabase } = require('../utils/supabase');

const API = process.env.PLAUD_API_BASE || 'https://platform.plaud.ai/developer/api';
const URL_REFRESH = `${API}/oauth/third-party/access-token/refresh`;

// Renova um pouco antes de expirar: o relógio do servidor e o do Plaud não são
// os mesmos, e uma chamada que começa válida pode chegar expirada.
const MARGEM_MS = 5 * 60 * 1000;

async function lerCredencial() {
  const { data, error } = await supabase
    .from('plaud_credencial')
    .select('refresh_token, access_token, expira_em')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw new Error(`plaud: falha lendo credencial — ${error.message}`);
  if (!data?.refresh_token) {
    throw new Error('plaud: sem refresh_token em plaud_credencial. Refaça o login OAuth e semeie a linha id=1.');
  }
  return data;
}

async function renovar(refreshToken) {
  const corpo = new URLSearchParams({ refresh_token: refreshToken });
  const res = await fetch(URL_REFRESH, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: corpo.toString(),
  });
  const txt = await res.text();
  if (!res.ok) {
    // Mensagem explícita: um 401/422 aqui quase sempre significa que alguém
    // deslogou o Plaud, e a saída é refazer o OAuth — não mexer no código.
    throw new Error(`plaud: refresh falhou (${res.status}). Se persistir, refaça o login OAuth do Plaud. Resposta: ${txt.slice(0, 200)}`);
  }
  const d = JSON.parse(txt);
  const expiraEm = new Date(Date.now() + (Number(d.expires_in || 3600) * 1000));

  // Persiste ANTES de devolver: se o processo morrer entre renovar e gravar, o
  // token novo se perde e o antigo pode já não valer.
  const { error } = await supabase
    .from('plaud_credencial')
    .update({
      refresh_token: d.refresh_token || refreshToken,
      access_token: d.access_token,
      expira_em: expiraEm.toISOString(),
      atualizado_em: new Date().toISOString(),
    })
    .eq('id', 1);
  if (error) throw new Error(`plaud: token renovado mas não gravado — ${error.message}`);

  return d.access_token;
}

async function accessToken() {
  const cred = await lerCredencial();
  const aindaVale = cred.access_token
    && cred.expira_em
    && (new Date(cred.expira_em).getTime() - Date.now()) > MARGEM_MS;
  if (aindaVale) return cred.access_token;
  return renovar(cred.refresh_token);
}

async function chamar(caminho) {
  const token = await accessToken();
  const res = await fetch(`${API}${caminho}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`plaud: GET ${caminho} devolveu ${res.status} — ${(await res.text()).slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Gravações da conta, mais recentes primeiro.
 * ⚠️ page_size mínimo é 10 (a API devolve 422 abaixo disso).
 */
async function listarGravacoes({ pagina = 1, tamanho = 50 } = {}) {
  const d = await chamar(`/open/third-party/files/?page=${pagina}&page_size=${Math.max(10, tamanho)}`);
  return d?.data || [];
}

/**
 * Detalhe de uma gravação, já com transcrição e roteiro desempacotados.
 *
 * `source_list` traz três coisas e vale conhecer as três:
 *   transaction        → transcrição completa [{start_time,end_time,content}]
 *                        numa única resposta (o MCP paginava de 50 em 50)
 *   outline            → roteiro de tópicos com marcação de tempo, gerado pelo
 *                        Plaud. É o melhor esqueleto para a ata.
 *   transaction_polish → link S3 para versão revisada (não usamos por enquanto)
 *
 * `note_list` traz o "Summary" do Plaud, que nas gravações da CBRio vem com
 * `data_error_code: 10` e o conteúdo é a transcrição crua, não um resumo — o
 * resumo deles FALHOU. Por isso a ata é redigida aqui.
 */
async function detalheGravacao(fileId) {
  const d = await chamar(`/open/third-party/files/${fileId}`);
  const porTipo = Object.fromEntries((d.source_list || []).map((s) => [s.data_type, s]));

  const parse = (bruto) => {
    if (!bruto) return [];
    try { return JSON.parse(bruto); } catch { return []; }
  };

  return {
    id: d.id,
    nome: d.name,
    // ⚠️ start_at vem em UTC. A ministerial é 10h30–12h30 em São Paulo, e os
    // timestamps chegam como 13:46/14:15 — quem ler como horário local erra em
    // 3 horas e escreve isso na ata.
    inicioUtc: d.start_at,
    duracaoMs: d.duration,
    serial: d.serial_number,
    transcricao: parse(porTipo.transaction?.data_content),
    roteiro: parse(porTipo.outline?.data_content),
    resumoFalhou: (d.note_list || []).some((n) => n.data_error_code),
  };
}

module.exports = { listarGravacoes, detalheGravacao, accessToken };

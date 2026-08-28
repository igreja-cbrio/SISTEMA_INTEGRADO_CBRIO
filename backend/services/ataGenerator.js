// ════════════════════════════════════════════════════════════════════════════
// Gerador da ATA Semanal · reunião ministerial de segunda-feira
//
// Fluxo: Plaud (transcrição + roteiro) → Claude redige → grava em
// `governance_meetings` (ata, deliberações, temas, participantes) e cria as
// pendências em `governance_tasks`.
//
// ⚠️ A ATA NÃO DIZ QUEM FALOU, E ISSO É REGRA, NÃO LIMITAÇÃO TEMPORÁRIA.
// A gravação do Plaud não identifica falante — a transcrição vem sem campo de
// speaker. Atribuir uma decisão à pessoa errada numa ata é pior do que não
// atribuir: vira registro. Então o modelo só nomeia quem foi chamado em voz
// alta, e o responsável de cada pendência fica em branco para quem estava na
// sala preencher na tela.
//
// ⚠️ DATA E DURAÇÃO VÊM DOS METADADOS, NUNCA DO TEXTO. A transcrição erra:
// na reunião de 27/07 ela abre com "dia 27 de setembro de 2026". Os metadados
// do aparelho são confiáveis; a fala não é.
// ════════════════════════════════════════════════════════════════════════════

const Anthropic = require('@anthropic-ai/sdk');
const { supabase } = require('../utils/supabase');
const { listarGravacoes, detalheGravacao } = require('./plaud');

// Redigir ata é síntese de texto aberto — a tarefa mais difícil do sistema.
const MODEL = process.env.ATA_MODEL || 'claude-opus-5';

// O aparelho Plaud usado na ministerial. Separa a reunião do resto que existe
// na conta (áudios de WhatsApp, reunião de prestação de contas eleitoral etc).
const SERIAL_MINISTERIAL = process.env.PLAUD_SERIAL_MINISTERIAL || '8800030134823115';

const ESQUEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['ata_md', 'deliberacoes', 'temas', 'mencionados', 'pendencias'],
  properties: {
    ata_md: { type: 'string', description: 'A ata em markdown, com seções `## N · Título`.' },
    deliberacoes: { type: 'string', description: 'Decisões numeradas, uma por linha.' },
    temas: { type: 'array', items: { type: 'string' } },
    mencionados: {
      type: 'array',
      items: { type: 'string' },
      description: 'Nomes ditos em voz alta na gravação. NUNCA inferidos.',
    },
    pendencias: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['titulo', 'responsavel'],
        properties: {
          titulo: { type: 'string' },
          responsavel: {
            type: ['string', 'null'],
            description: 'Só quando a gravação disser explicitamente de quem é. Caso contrário, null.',
          },
        },
      },
    },
  },
};

const SYSTEM = `Você redige a ata da reunião ministerial semanal de uma igreja, a partir da transcrição automática da gravação.

REGRAS QUE NÃO SE NEGOCIAM:

1. A gravação NÃO identifica quem falou. Só cite um nome se ele for dito em voz alta na transcrição (alguém chamando a pessoa, ou ela se identificando). Nunca deduza pelo assunto.

2. O responsável de uma pendência só é preenchido quando a gravação diz de quem é ("a Milena decide", "o Arthur define"). Na dúvida, null. Uma ata que atribui tarefa à pessoa errada é pior que uma sem responsável.

3. Nunca escreva data, horário ou duração a partir da fala — a transcrição erra nisso. Esses dados vêm do cabeçalho que você recebe.

4. A transcrição tem erros de reconhecimento (nomes próprios, siglas, números ditos rápido). Quando um número for citado de formas conflitantes, registre e sinalize o conflito em vez de escolher um.

5. Registre o que foi DECIDIDO e o que ficou EM ABERTO com a mesma clareza. Reunião que não decide também é informação.

COMO ESCREVER:

- Markdown com seções \`## N · Título do assunto\`, na ordem em que os assuntos apareceram.
- Dentro de cada seção, texto corrido. Use tabela quando houver números comparáveis.
- Ao final da ata, uma seção \`## Confiabilidade\` dizendo o que é confiável, o que precisa ser conferido e o que a ata não sabe.
- Português do Brasil, tom de registro institucional. Direto, sem floreio.
- Não invente contexto que não está na gravação.`;

// Trecho legível da transcrição, com marcação de tempo — é o que permite alguém
// conferir no áudio depois.
function materialDaTranscricao(segmentos) {
  const hms = (ms) => {
    const s = Math.floor((ms || 0) / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };
  return (segmentos || []).map((s) => `[${hms(s.start_time)}] ${s.content}`).join('\n\n');
}

function cabecalho({ inicioUtc, duracaoMs, dataReuniao }) {
  // start_at do Plaud é UTC; a ministerial acontece 10h30–12h30 em São Paulo.
  const ini = new Date(`${String(inicioUtc).replace(' ', 'T').slice(0, 19)}Z`);
  const sp = new Date(ini.getTime() - 3 * 3600 * 1000);
  const fim = new Date(sp.getTime() + (duracaoMs || 0));
  const hhmm = (d) => `${String(d.getUTCHours()).padStart(2, '0')}h${String(d.getUTCMinutes()).padStart(2, '0')}`;
  const min = Math.round((duracaoMs || 0) / 60000);
  return [
    `Data da reunião: ${dataReuniao} (segunda-feira)`,
    `Início: ${hhmm(sp)} · Término: ${hhmm(fim)} · Duração: ${min} min`,
    'Fonte: gravação Plaud. Estes horários vêm dos metadados do aparelho e são confiáveis; os ditos na fala, não.',
  ].join('\n');
}

async function redigir({ cabecalhoTxt, roteiro, transcricao }) {
  const client = new Anthropic();
  const roteiroTxt = (roteiro || []).map((o) => `- ${o.topic}`).join('\n');

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high', format: { type: 'json_schema', schema: ESQUEMA } },
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: [
        cabecalhoTxt,
        '',
        // O roteiro é gerado pelo próprio Plaud e serve de esqueleto: ele já
        // marcou a virada de assunto, que é a parte chata de inferir do texto.
        `ROTEIRO DE TÓPICOS (gerado automaticamente, ${(roteiro || []).length} entradas):`,
        roteiroTxt,
        '',
        'TRANSCRIÇÃO COMPLETA (com marcação de tempo):',
        materialDaTranscricao(transcricao),
      ].join('\n'),
    }],
  });

  const msg = await stream.finalMessage();
  if (msg?.stop_reason === 'refusal') throw new Error('ata: modelo recusou a redação');
  const texto = (msg?.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  return JSON.parse(texto);
}

/** Reuniões ministeriais sem ata, da mais recente para a mais antiga. */
async function reunioesSemAta() {
  const { data: tipo } = await supabase
    .from('governance_meeting_types').select('id').eq('sigla', 'MIN').maybeSingle();
  if (!tipo) return [];

  const { data } = await supabase
    .from('governance_meetings')
    .select('id, date, ata, observacoes')
    .eq('type_id', tipo.id)
    .is('deleted_at', null)
    .order('date', { ascending: false });

  return (data || []).filter((m) => !String(m.ata || '').trim());
}

/**
 * Casa uma reunião do banco com a gravação do Plaud pela DATA (em São Paulo).
 * Usar o id gravado na observação seria mais direto, mas nem toda reunião tem —
 * e a data é o que sempre existe dos dois lados.
 */
function acharGravacao(gravacoes, dataReuniao) {
  return (gravacoes || []).find((g) => {
    if (g.serial_number !== SERIAL_MINISTERIAL) return false;
    const utc = new Date(`${String(g.start_at).replace(' ', 'T').slice(0, 19)}Z`);
    const sp = new Date(utc.getTime() - 3 * 3600 * 1000);
    return sp.toISOString().slice(0, 10) === String(dataReuniao).slice(0, 10);
  }) || null;
}

/** Gera e grava a ata de UMA reunião. Devolve um resumo do que foi feito. */
async function gerarAta(reuniao, gravacoes) {
  const gravacao = acharGravacao(gravacoes, reuniao.date);
  if (!gravacao) return { id: reuniao.id, date: reuniao.date, status: 'sem_gravacao' };

  const det = await detalheGravacao(gravacao.id);
  if (!det.transcricao?.length) {
    return { id: reuniao.id, date: reuniao.date, status: 'sem_transcricao' };
  }

  const resultado = await redigir({
    cabecalhoTxt: cabecalho({
      inicioUtc: det.inicioUtc, duracaoMs: det.duracaoMs, dataReuniao: reuniao.date,
    }),
    roteiro: det.roteiro,
    transcricao: det.transcricao,
  });

  const { error: errAta } = await supabase
    .from('governance_meetings')
    .update({
      ata: resultado.ata_md,
      deliberacoes: resultado.deliberacoes,
      temas: resultado.temas,
      participantes: resultado.mencionados,
      status: 'realizada',
      observacoes: `Gerada por IA a partir da gravação Plaud ${gravacao.id} em ${new Date().toISOString().slice(0, 10)}. Rascunho para revisão.`,
    })
    .eq('id', reuniao.id);
  if (errAta) throw new Error(`ata: falha gravando reunião ${reuniao.date} — ${errAta.message}`);

  // Pendências só entram se ainda não houver nenhuma: regerar não pode
  // duplicar a lista nem apagar responsáveis já preenchidos por gente.
  const { count } = await supabase
    .from('governance_tasks')
    .select('id', { count: 'exact', head: true })
    .eq('meeting_id', reuniao.id);

  let criadas = 0;
  if (!count && resultado.pendencias?.length) {
    const linhas = resultado.pendencias.map((p, i) => ({
      meeting_id: reuniao.id,
      titulo: String(p.titulo || '').slice(0, 500),
      responsavel: p.responsavel || null,
      sort_order: i + 1,
    }));
    const { error } = await supabase.from('governance_tasks').insert(linhas);
    if (!error) criadas = linhas.length;
  }

  return {
    id: reuniao.id,
    date: reuniao.date,
    status: 'ok',
    plaud_id: gravacao.id,
    chars_ata: (resultado.ata_md || '').length,
    pendencias_criadas: criadas,
    pendencias_ja_existiam: Number(count || 0),
    resumo_plaud_falhou: det.resumoFalhou,
  };
}

/**
 * Gera a ata de todas as reuniões ministeriais que ainda não têm uma.
 * @param {number} limite teto por rodada — redigir uma ata custa tokens, e um
 *                        backlog inteiro numa chamada estoura o tempo do cron.
 */
async function gerarAtasPendentes({ limite = 2 } = {}) {
  const pendentes = (await reunioesSemAta()).slice(0, limite);
  if (!pendentes.length) return { geradas: [], mensagem: 'nenhuma reunião sem ata' };

  const gravacoes = await listarGravacoes({ tamanho: 50 });
  const geradas = [];
  for (const r of pendentes) {
    try {
      geradas.push(await gerarAta(r, gravacoes));
    } catch (e) {
      geradas.push({ id: r.id, date: r.date, status: 'erro', erro: e.message });
    }
  }
  return { geradas };
}

module.exports = { gerarAtasPendentes, gerarAta, reunioesSemAta, acharGravacao, cabecalho };

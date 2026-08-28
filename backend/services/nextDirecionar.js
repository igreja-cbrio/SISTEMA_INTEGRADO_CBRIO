// ============================================================================
// Direcionar pros valores no Next · motor COMPARTILHADO (Fase 1B/2a · 2026-06-25)
//
// Usado por dois caminhos:
//   - autenticado: routes/next.js  POST /matriculas/:id/direcionar  (líder marca na Pessoas)
//   - público:     routes/publicNext.js  POST /direcionar/:token     (QR no fim do Next · Fase 2a)
//
// Grupos/Voluntários → encaminhamento (origem='next') na caixa da área (ligado à matrícula).
// Batismo → inscrição pendente em batismo_inscricoes REUSANDO membro_id (sem duplicar).
// Devocional → só registra a escolha (flag · estatística). NÃO marca engajamento (o NSM
// conta o sinal real). Dedup por matrícula × destino e por membro_id (batismo).
//
// O recálculo de KPIs do Next fica a cargo do CHAMADOR (recalcularKpisNext em next.js) —
// o service não importa pra não acoplar.
// ============================================================================
const crypto = require('crypto');
const { supabase } = require('../utils/supabase');
const { notificar } = require('../services/notificar');
const { acharOuCriarGuardado } = require('./membroMatch');
// ⚠️ Vocabulário de sexo por destino: `vol_inscricoes.sexo` é canônico
// (masculino/feminino) e `batismo_inscricoes.sexo` é curto (M/F). `sexoPara`
// traduz; copiar cru grava valor que nenhum filtro encontra depois.
const { sexoPara } = require('../utils/dadosDoCadastro');
// ⚠️ Horário do batismo · MESMA régua e MESMAS consultas do formulário público e
// do app (`utils/batismoHorario` + `services/batismoHorarios`). O Next é mais um
// cliente da porta, não uma 2ª régua — reproduzir a decisão aqui é como o Next
// passa a aceitar horário que o resto do sistema recusa.
const { avaliarHorarioBatismo } = require('../utils/batismoHorario');
const {
  horariosConfigurados,
  ocupacaoPorHorario,
  dataProximoBatismo,
} = require('./batismoHorarios');

// destino → flag na matrícula + (grupos/voluntarios) caixa da área
const NEXT_DIRECIONA = {
  grupos:      { flag: 'indicou_grupo',      destino: 'grupos',      valor_alvo: 'conectar', modulo: 'grupos',       label: 'Grupos',      link: '/grupos' },
  voluntarios: { flag: 'indicou_servir',     destino: 'voluntarios', valor_alvo: 'servir',   modulo: 'voluntariado', label: 'Voluntários', link: '/ministerial/voluntariado/encaminhados' },
  batismo:     { flag: 'indicou_batismo' },
  devocional:  { flag: 'indicou_devocional' },
};

// Deriva a área canônica única a partir das áreas escolhidas (mesma prioridade
// do formulário público de voluntariado · InscricaoVoluntariado.deriveArea).
function deriveAreaCanonica(canonicas) {
  const set = new Set((canonicas || []).map(c => String(c || '').toLowerCase()));
  if (set.has('kids')) return 'kids';
  if (set.has('bridge')) return 'bridge';
  if (set.has('ami')) return 'ami';
  if (set.has('online')) return 'online';
  return 'sede';
}

// Resolve as áreas do "quero servir" contra vol_form_opcoes (fonte da verdade).
// Recebe rótulos escolhidos no totem; devolve os rótulos válidos + a área canônica.
async function resolverAreasVol(labels) {
  const escolhidos = (Array.isArray(labels) ? labels : []).map(s => String(s || '').trim()).filter(Boolean);
  if (escolhidos.length === 0) return { labels: [], area: 'sede' };
  const { data: opcoes } = await supabase
    .from('vol_form_opcoes')
    .select('label, area_canonica')
    .eq('ativo', true);
  const mapa = new Map((opcoes || []).map(o => [o.label, o.area_canonica]));
  const validos = escolhidos.filter(l => mapa.has(l));
  const usar = validos.length ? validos : escolhidos; // tolera opção fora do catálogo
  const canonicas = usar.map(l => mapa.get(l)).filter(Boolean);
  return { labels: usar, area: deriveAreaCanonica(canonicas) };
}

// ── Token FIXO do QR de direcionamento · HMAC com CRON_SECRET (fail-closed) ──
// UM QR pro Next inteiro: resolve a TURMA ABERTA do momento (não há turmas simultâneas).
// Estável (não expira · é um QR que se imprime/fixa na tela) e assinado pra não ser
// adivinhável. A resolução da turma aberta fica no endpoint público.
const CRON_SECRET = process.env.CRON_SECRET || '';
const DIRECIONAR_PAYLOAD = 'next-direcionar-v1';

function signDirecionarToken() {
  if (!CRON_SECRET) return null;
  const sig = crypto.createHmac('sha256', CRON_SECRET).update(DIRECIONAR_PAYLOAD).digest('hex').slice(0, 24);
  return Buffer.from(`${DIRECIONAR_PAYLOAD}.${sig}`).toString('base64url');
}

function verifyDirecionarToken(token) {
  if (!CRON_SECRET || !token) return false;
  try {
    const raw = Buffer.from(String(token), 'base64url').toString('utf8');
    const [payload, sig] = raw.split('.');
    if (payload !== DIRECIONAR_PAYLOAD || !sig) return false;
    const expected = crypto.createHmac('sha256', CRON_SECRET).update(DIRECIONAR_PAYLOAD).digest('hex').slice(0, 24);
    return sig === expected;
  } catch (_) { return false; }
}

// Direciona UMA matrícula pros destinos pedidos. permitir = lista de destinos aceitos
// (o público passa só grupos/voluntarios/batismo · o Devocional é Fase 2b).
// Retorna { ok, destinos, criados } · NÃO recalcula KPIs (chamador faz).
async function direcionarMatricula({ matriculaId, destinos = [], areas = [], horarioBatismo = null, userId = null, permitir = null }) {
  const validos = (Array.isArray(destinos) ? destinos : [])
    .filter(d => NEXT_DIRECIONA[d] && (!permitir || permitir.includes(d)));
  if (validos.length === 0) { const e = new Error('Informe ao menos um destino válido'); e.status = 400; throw e; }

  const { data: m, error: em } = await supabase
    .from('next_matriculas')
    .select('id, turma_id, nome, sobrenome, cpf, telefone, email, data_nascimento, sexo, membro_id, indicou_grupo, indicou_servir, indicou_batismo, indicou_devocional')
    .eq('id', matriculaId).is('deleted_at', null).single();
  if (em) throw em;

  const nomeCompleto = `${m.nome || ''} ${m.sobrenome || ''}`.trim() || m.nome || 'Sem nome';

  // ── Horário do batismo · conferido ANTES de qualquer escrita ───────────────
  //
  // ⚠️⚠️ A ORDEM é o que importa aqui. As flags da matrícula são gravadas logo
  // abaixo e a UI TRAVA o destino já marcado ("já direcionado"). Se o horário
  // fosse conferido dentro do laço, uma recusa deixaria `indicou_batismo=true`
  // sem inscrição nenhuma — e a pessoa ficaria sem poder tentar de novo.
  // Conferindo aqui, recusa = ZERO escrita, e ela corrige o horário na hora.
  //
  // ⚠️ `data_batismo` sai da MESMA `fn_proximo_quarto_domingo` que o formulário
  // público e o app usam. Sem ela, a inscrição fica invisível pra
  // `ocupacaoPorHorario` (que filtra por data) e o limite de 11 por horário
  // deixaria de valer EM SILÊNCIO — era exatamente o estado das inscrições que
  // o Next vinha criando (3 de 3 sem horário e sem data, medido em 13/08).
  let batismo = null;
  if (validos.includes('batismo')) {
    const dataBat = await dataProximoBatismo();
    const [configurados, ocupacao] = await Promise.all([
      horariosConfigurados(),
      dataBat ? ocupacaoPorHorario(dataBat) : Promise.resolve({}),
    ]);
    const av = avaliarHorarioBatismo(horarioBatismo, {
      configurados: dataBat ? configurados : null, // falha na data = falha fechada
      ocupacao,
      exigir: true,
    });
    if (!av.ok) {
      const e = new Error(av.mensagem);
      // 400 = faltou preencher · 409 = o horário fechou, encheu, ou não há nenhum
      e.status = av.motivo === 'obrigatorio' ? 400 : 409;
      e.codigo = `horario_${av.motivo}`;
      e.campo = 'horario_batismo';
      throw e;
    }
    batismo = { horario: av.horario, data: dataBat };
  }

  // 1) Flags na matrícula (estatística "pra onde cada um foi")
  const flags = { updated_at: new Date().toISOString() };
  for (const d of validos) flags[NEXT_DIRECIONA[d].flag] = true;
  await supabase.from('next_matriculas').update(flags).eq('id', m.id);

  // Resolve membro_id (pra batismo não duplicar) · reusa o da matrícula, senão cria/liga
  let membroId = m.membro_id || null;
  async function garantirMembro() {
    if (membroId) return membroId;
    try {
      const r = await acharOuCriarGuardado({ cpf: m.cpf || null, telefone: m.telefone || null, nome: nomeCompleto, dataNascimento: m.data_nascimento || null, status: 'visitante', origem: 'next_direcionamento', origemId: m.id });
      membroId = r?.membro_id || null;
      if (membroId) await supabase.from('next_matriculas').update({ membro_id: membroId }).eq('id', m.id);
    } catch (e) { console.error('[nextDirecionar] acharOuCriarGuardado:', e.message); }
    return membroId;
  }

  // ── O que o Contrato pede, vindo da matrícula OU do cadastro ─────────────
  //
  // Pedido do Marcos (11/08): o direcionamento tem que carregar CPF, nascimento e
  // sexo pra frente, como o app passou a fazer. A matrícula do Next é a fonte
  // preferida (foi ela que a pessoa preencheu); o cadastro entra só onde ela
  // está VAZIA — mesma política só-onde-vazio do censo e do CPF tardio.
  //
  // ⚠️ O `sexo` NÃO existia neste caminho: o formulário do Next passou a exigi-lo
  // em 28/07, mas nem o `vol_inscricoes` nem o `batismo_inscricoes` criados aqui
  // recebiam o valor — a pessoa respondia e o dado morria na matrícula.
  // ⚠️ Best-effort: falhar ao ler o cadastro não pode derrubar o direcionamento,
  // que é o que a equipe está fazendo com a pessoa na frente.
  let cadastro = null;
  async function dadosDaPessoa() {
    if (cadastro === null && membroId) {
      try {
        const { data } = await supabase.from('mem_membros')
          .select('cpf, data_nascimento, genero, email, telefone')
          .eq('id', membroId).is('deleted_at', null).maybeSingle();
        cadastro = data || false;
      } catch (e) {
        console.warn('[nextDirecionar] cadastro:', e.message);
        cadastro = false;
      }
    }
    const c = cadastro || {};
    const naoVazio = (v) => v !== null && v !== undefined && String(v).trim() !== '';
    return {
      cpf: naoVazio(m.cpf) ? m.cpf : (c.cpf || null),
      email: naoVazio(m.email) ? m.email : (c.email || null),
      telefone: naoVazio(m.telefone) ? m.telefone : (c.telefone || null),
      data_nascimento: naoVazio(m.data_nascimento) ? m.data_nascimento : (c.data_nascimento || null),
      // ⚠️ `m.sexo` é canônico e `mem_membros.genero` também — mas passam pelo
      // tradutor mesmo assim, pra cada destino receber o vocabulário DELE.
      sexo: naoVazio(m.sexo) ? m.sexo : (c.genero || null),
    };
  }

  const criados = {};
  for (const d of validos) {
    const cfg = NEXT_DIRECIONA[d];
    if (d === 'voluntarios' && Array.isArray(areas) && areas.length > 0) {
      // "Quero servir" com áreas escolhidas → inscrição REAL no Voluntariado
      // (mesma tabela do formulário público), tag origem='next'. Dedup por matrícula.
      const { data: ja } = await supabase.from('vol_inscricoes').select('id')
        .eq('next_matricula_id', m.id).is('deleted_at', null).limit(1).maybeSingle();
      if (!ja) {
        await garantirMembro();
        const { labels, area } = await resolverAreasVol(areas);
        const p = await dadosDaPessoa();
        const partes = String(m.nome || '').trim().split(/\s+/);
        await supabase.from('vol_inscricoes').insert({
          nome: partes[0] || (m.nome || 'Voluntário'),
          sobrenome: m.sobrenome || partes.slice(1).join(' ') || '',
          nome_completo: nomeCompleto,
          cpf: p.cpf, email: p.email, telefone: p.telefone,
          data_nascimento: p.data_nascimento, nome_mae: null,
          sexo: sexoPara('canonico', p.sexo),
          data_inscricao: new Date().toISOString(),
          participou_next: 'True',
          ministerios_interesse: labels.join(', '),
          area, status: 'inscrito', primeiro_contato_em: 'False',
          membro_id: membroId || m.membro_id || null,
          origem: 'next', next_matricula_id: m.id,
        });
        await supabase.from('next_matriculas').update({ indicou_servir: true, updated_at: new Date().toISOString() }).eq('id', m.id);
        notificar({
          modulo: 'voluntariado', titulo: 'Interesse em servir (veio do NEXT)',
          mensagem: `${nomeCompleto} quer servir${labels.length ? ` em: ${labels.join(', ')}` : ''} (via NEXT). Faça o primeiro contato.`,
          link: '/ministerial/voluntariado/inscricoes',
        }).catch(() => {});
        criados.voluntarios = true;
      }
    } else if (d === 'grupos' || d === 'voluntarios') {
      const { data: ja } = await supabase.from('jornada_encaminhamentos').select('id')
        .eq('next_matricula_id', m.id).eq('destino', cfg.destino).is('deleted_at', null)
        .limit(1).maybeSingle();
      if (!ja) {
        await supabase.from('jornada_encaminhamentos').insert({
          origem: 'next', next_matricula_id: m.id, membro_id: membroId || m.membro_id || null,
          nome: nomeCompleto, telefone: m.telefone || null, destino: cfg.destino,
          valor_alvo: cfg.valor_alvo, encaminhado_por: userId,
        });
        notificar({
          modulo: cfg.modulo, titulo: `Direcionado pra ${cfg.label} no NEXT`,
          mensagem: `${nomeCompleto} foi direcionado(a) pra ${cfg.label} no NEXT. Faça o primeiro contato e registre a devolutiva.`,
          link: cfg.link,
        }).catch(() => {});
        criados[d] = true;
      }
    } else if (d === 'batismo') {
      await garantirMembro();
      let ja = null;
      if (membroId) {
        const { data } = await supabase.from('batismo_inscricoes')
          .select('id, data_batismo, horario_culto')
          .eq('membro_id', membroId).in('status', ['pendente', 'confirmado']).limit(1).maybeSingle();
        ja = data;
      }
      if (!ja) {
        const p = await dadosDaPessoa();
        const partes = String(m.nome || '').trim().split(/\s+/);
        await supabase.from('batismo_inscricoes').insert({
          nome: partes[0] || (m.nome || 'Convertido'),
          sobrenome: m.sobrenome || partes.slice(1).join(' ') || '',
          cpf: p.cpf, telefone: p.telefone, membro_id: membroId || null,
          // ⚠️ nascimento e e-mail NÃO eram passados aqui: a inscrição de batismo
          // nascia sem eles mesmo com a pessoa tendo preenchido no Next.
          data_nascimento: p.data_nascimento, email: p.email,
          sexo: sexoPara('curto', p.sexo),   // ⚠️ o batismo guarda M/F, não canônico
          // Horário + data conferidos no topo da função (falha fechada). Sem os
          // dois a inscrição some da contagem por horário e do lembrete de
          // véspera do WhatsApp, que lê `horario_culto` no {{2}}.
          data_batismo: batismo.data, horario_culto: batismo.horario,
          status: 'pendente', origem: 'next', observacoes: 'Direcionado pelo NEXT', inscrito_por: userId,
        });
        notificar({
          modulo: 'integracao', titulo: 'Direcionado pra Batismo no NEXT',
          mensagem: `${nomeCompleto} foi direcionado(a) pro batismo no NEXT.`,
          link: '/ministerial/integracao?tab=batismos',
        }).catch(() => {});
        criados.batismo = true;
      } else if (batismo && !ja.horario_culto
                 && (!ja.data_batismo || ja.data_batismo === batismo.data)) {
        // A pessoa JÁ tem inscrição em aberto (veio pelo formulário público, pelo
        // app ou por um Next anterior) e ela está sem horário. Preenche —
        // política SÓ-ONDE-VAZIO da casa: descartar o horário que ela acabou de
        // escolher seria o bug do CPF do censo outra vez (a pessoa responde e o
        // dado morre no caminho).
        //
        // ⚠️ Não encosta em inscrição que já tem horário (a equipe pode ter
        // definido) nem em uma marcada pra OUTRA data: o horário foi validado
        // contra a ocupação de `batismo.data`, e jogá-lo numa data diferente
        // furaria o limite daquela data.
        // ⚠️ `.is('horario_culto', null)` é a guarda de corrida — dois toques no
        // totem não podem sobrescrever a escolha um do outro.
        const { data: atualizadas } = await supabase.from('batismo_inscricoes')
          .update({
            horario_culto: batismo.horario,
            data_batismo: ja.data_batismo || batismo.data,
            updated_at: new Date().toISOString(),
          })
          .eq('id', ja.id).is('horario_culto', null)
          .select('id');
        if (atualizadas && atualizadas.length) criados.batismo_horario_atualizado = true;
      }
    } else if (d === 'devocional') {
      // Só registra a escolha (flag acima). O 1º acesso/leitura no app é Fase 2b.
      criados.devocional = true;
    }
  }

  return { ok: true, destinos: validos, criados, turma_id: m.turma_id };
}

module.exports = { NEXT_DIRECIONA, signDirecionarToken, verifyDirecionarToken, direcionarMatricula };

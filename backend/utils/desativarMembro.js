// ============================================================================
// DESATIVAR / REATIVAR MEMBRO — 2026-08-21
//
// Pedido do Matheus: *"nessa tela de cada membro tenha o botão de desativar
// membro, com opcional de dar o motivo do pq a pessoa saiu."*
//
// ⚠️⚠️ DESATIVAR É `status`, NUNCA `deleted_at` NEM `active`:
//   · `status` é a coluna que TODO o sistema lê — 14 arquivos do backend e as
//     views de NSM/KPI filtram `membro_ativo`. Mudar o status tira a pessoa das
//     contagens, do censo, dos disparos e dos indicadores DE UMA VEZ, que é o
//     que "desativar" quer dizer.
//   · `deleted_at` é EXCLUSÃO — some da base, e o matcher canônico deixa de
//     reencontrar a pessoa (quem sai da igreja e volta nasceria duplicado).
//   · `active` é `true` nas 8.025 linhas da tabela (medido em 21/08): não
//     significa nada e não deve passar a significar.
//
// ⚠️ `'inativo'` e `'transferido'` JÁ ERAM valores válidos do CHECK
// `mem_membros_status_check` desde sempre — nunca foram usados (0 linhas em
// 21/08). Nenhum vocabulário novo foi inventado aqui.
//
// ⚠️⚠️ GUARDA O STATUS ANTERIOR. Reativar não pode assumir `membro_ativo`:
// desativar um `visitante` e reativá-lo como membro seria o sistema decidindo
// membresia, que é decisão da igreja. Sem o anterior gravado, a reativação
// RECUSA e manda escolher na mão — inventar o status é pior que dar trabalho.
// ============================================================================

const STATUS_INATIVO = 'inativo';
const MOTIVO_MAX = 500; // texto livre; sem coluna estreita, mas com teto

/** Aparar + colapsar espaço; vazio vira null (nunca string vazia). */
function limparMotivo(v) {
  const s = String(v == null ? '' : v).trim().replace(/\s+/g, ' ');
  return s ? s.slice(0, MOTIVO_MAX) : null;
}

/**
 * O que gravar ao desativar. NÃO escreve — devolve o patch pro chamador.
 *
 * @param {{status?: string, deleted_at?: string|null}|null} membro linha atual
 * @param {{motivo?: unknown, agora?: string, porUsuario?: string|null}} opts
 * @returns {{ok:false, codigo:string} | {ok:true, patch:object, motivo:string|null}}
 */
function decidirDesativacao(membro, opts = {}) {
  if (!membro) return { ok: false, codigo: 'nao_encontrado' };
  if (membro.deleted_at) return { ok: false, codigo: 'apagado' };
  if (membro.status === STATUS_INATIVO) return { ok: false, codigo: 'ja_inativo' };

  const motivo = limparMotivo(opts.motivo);
  return {
    ok: true,
    motivo,
    patch: {
      status: STATUS_INATIVO,
      inativado_em: opts.agora || new Date().toISOString(),
      inativado_motivo: motivo,
      inativado_por: opts.porUsuario || null,
      // ⚠️ É ISTO que torna a reativação honesta — ver o aviso do cabeçalho.
      inativado_status_anterior: membro.status || null,
    },
  };
}

/**
 * O que gravar ao reativar. `statusEscolhido` só é usado quando não há anterior
 * gravado (linha desativada por SQL antes desta tela existir).
 *
 * ⚠️ Os campos `inativado_*` NÃO são limpos de propósito: eles viram o registro
 * da ÚLTIMA saída, e a tela só os mostra quando `status === 'inativo'`. Limpar
 * apagaria o motivo, que é justamente o que o Matheus pediu para guardar.
 */
function decidirReativacao(membro, opts = {}) {
  if (!membro) return { ok: false, codigo: 'nao_encontrado' };
  if (membro.deleted_at) return { ok: false, codigo: 'apagado' };
  if (membro.status !== STATUS_INATIVO) return { ok: false, codigo: 'nao_esta_inativo' };

  const escolhido = typeof opts.statusEscolhido === 'string' ? opts.statusEscolhido.trim() : '';
  const anterior = typeof membro.inativado_status_anterior === 'string'
    ? membro.inativado_status_anterior.trim()
    : '';
  const destino = anterior || escolhido;
  if (!destino) return { ok: false, codigo: 'sem_status_anterior' };
  // Volta pra 'inativo' seria no-op com cara de ação.
  if (destino === STATUS_INATIVO) return { ok: false, codigo: 'destino_invalido' };

  return { ok: true, statusDestino: destino, patch: { status: destino } };
}

module.exports = {
  STATUS_INATIVO,
  MOTIVO_MAX,
  limparMotivo,
  decidirDesativacao,
  decidirReativacao,
};

-- ============================================================================
-- DESATIVAR MEMBRO COM MOTIVO — 2026-08-21
--
-- Pedido do Matheus: botão de desativar membro na ficha, com motivo opcional.
--
-- ⚠️⚠️ NENHUM VOCABULÁRIO NOVO: `'inativo'` já é valor válido do CHECK
-- `mem_membros_status_check` desde sempre (junto de 'frequentador', 'membro' e
-- 'transferido'). Medido em 21/08: os três estão com ZERO linhas. Esta
-- migration só acrescenta o CONTEXTO da desativação — quando, por quê, por quem
-- e de qual status a pessoa saiu.
--
-- ⚠️ Aditiva e idempotente: nada existente lê estas colunas, e o código tolera
-- a ausência delas (a rota degrada para gravar só o `status`).
-- ============================================================================

alter table public.mem_membros
  add column if not exists inativado_em timestamptz,
  add column if not exists inativado_motivo text,
  add column if not exists inativado_por uuid,
  add column if not exists inativado_status_anterior text;

comment on column public.mem_membros.inativado_em is
  'Quando a pessoa foi desativada (status=inativo). NULL = nunca desativada.';
comment on column public.mem_membros.inativado_motivo is
  'Motivo OPCIONAL da saída, texto livre (teto de 500 no backend). NULL = não informado — nunca string vazia.';
comment on column public.mem_membros.inativado_por is
  'profiles.id de quem desativou. SEM FK de proposito: e carimbo de autoria, e apagar o profile nao pode apagar a autoria (mesma regua do ledger de check-in).';
comment on column public.mem_membros.inativado_status_anterior is
  '⚠️ O status de onde a pessoa saiu. E ISTO que torna a reativacao honesta: sem ele, reativar assumiria membro_ativo e PROMOVERIA quem era visitante — o sistema decidindo membresia, que e decisao da igreja.';

-- Indice parcial: a lista de inativos e recorte pequeno dentro de 8 mil linhas.
create index if not exists idx_mem_membros_inativos
  on public.mem_membros (inativado_em desc)
  where status = 'inativo' and deleted_at is null;

-- ---------------------------------------------------------------------------
-- O MOTIVO ENTRA NO AUDIT LOG
--
-- `status` ja e auditado (trigger `trg_audit_mem_membros`), mas o MOTIVO nao —
-- e sem ele o log registra "virou inativo" sem dizer por que. Como a coluna e
-- sobrescrita numa segunda desativacao, o audit log e o unico lugar onde o
-- historico de motivos sobrevive.
--
-- ⚠️⚠️ PATCH SOBRE A DEFINICAO VIVA, nunca DROP+CREATE com lista decorada: a
-- lista de colunas auditadas pode ter crescido fora do git (a mesma licao da
-- whitelist de soft-delete, que uma migration reescreveu com lista estatica e
-- apagou em silencio o que outra frente tinha acrescentado).
-- ---------------------------------------------------------------------------
do $$
declare
  v_def text;
  v_args text;
begin
  select pg_get_triggerdef(oid) into v_def
    from pg_trigger
   where tgrelid = 'public.mem_membros'::regclass
     and tgname = 'trg_audit_mem_membros'
     and not tgisinternal;

  if v_def is null then
    raise warning '[desativacao] trigger trg_audit_mem_membros ausente — motivo nao sera auditado';
    return;
  end if;

  -- Lista de colunas que o trigger audita hoje, extraida da definicao VIVA.
  v_args := substring(v_def from 'audit_log_changes\(''([^'']*)''\)');
  if v_args is null then
    raise warning '[desativacao] forma inesperada do trigger — nao vou adivinhar: %', v_def;
    return;
  end if;

  if position('inativado_motivo' in v_args) > 0 then
    raise notice '[desativacao] motivo ja auditado — nada a fazer';
    return;
  end if;

  v_args := v_args || ',inativado_em,inativado_motivo,inativado_por,inativado_status_anterior';

  drop trigger trg_audit_mem_membros on public.mem_membros;
  execute format(
    'create trigger trg_audit_mem_membros after insert or update or delete on public.mem_membros '
    || 'for each row execute function public.audit_log_changes(%L)', v_args);

  raise notice '[desativacao] audit de mem_membros agora cobre: %', v_args;
end $$;

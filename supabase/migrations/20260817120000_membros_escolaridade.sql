-- ============================================================================
-- mem_membros.escolaridade · o censo coletava e o sistema jogava fora
--
-- Contexto (17/08/2026): a pergunta "Escolaridade" existe no Censo CBRio 2026
-- (id `p13_escolaridade`, opções Ensino Fundamental / Ensino Médio / Superior /
-- Pós graduação) desde que o questionário foi montado. Só que não havia coluna
-- no cadastro nem destino declarado (`preenche_de`), então a resposta ficava
-- apenas dentro de `cen_resposta` — o gráfico do censo a lia, e a ficha da
-- pessoa na Membresia não. Mesma classe do sexo em 04/08 e do CPF em 04/08:
-- dado coletado, descartado em silêncio, ninguém descobre.
--
-- ⚠️ SEM CHECK, DE PROPÓSITO. `estado_civil` tem CHECK e foi exatamente isso que
-- derrubou a reconciliação inteira do censo: o rótulo "Solteiro(a)" da opção
-- violava a constraint (23514) e, como o UPDATE é um só, levava embora bairro,
-- cidade e telefone do mesmo passe. Aqui o construtor é livre pra ganhar uma
-- opção nova ("Mestrado") sem que isso quebre a gravação de ninguém — quem
-- padroniza o valor é `backend/utils/censoCampoCadastro.js` (mapa + slug), que
-- está no gate de deploy.
--
-- Vocabulário que o tradutor emite hoje:
--   fundamental · medio · tecnico · superior · superior_incompleto ·
--   pos_graduacao · mestrado · doutorado
-- Opção não mapeada entra como slug do rótulo (determinístico).
--
-- Aditiva e idempotente. Nenhum leitor existente é afetado: `select *` continua
-- funcionando e o backend tolera a coluna ausente (COLUNAS_OPCIONAIS em
-- services/censoReconciliar.js), então aplicar antes ou depois do deploy dá no
-- mesmo.
-- ============================================================================

alter table public.mem_membros
  add column if not exists escolaridade text;

comment on column public.mem_membros.escolaridade is
  'Escolaridade autodeclarada (censo/porta de cadastro). Vocabulário canônico: '
  'fundamental | medio | tecnico | superior | superior_incompleto | pos_graduacao | '
  'mestrado | doutorado. SEM CHECK de propósito: opção nova no construtor do censo '
  'não pode derrubar o UPDATE do cadastro (foi o que o CHECK de estado_civil fez em '
  '17/08). Quem traduz rótulo -> valor é backend/utils/censoCampoCadastro.js.';

-- ── Conferência (rodar depois de aplicar) ───────────────────────────────────
-- select column_name, data_type from information_schema.columns
--  where table_schema='public' and table_name='mem_membros' and column_name='escolaridade';
-- select count(*) filter (where escolaridade is not null) as com_escolaridade
--   from public.mem_membros where deleted_at is null;

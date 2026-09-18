-- ════════════════════════════════════════════════════════════════════════════
--  CENSO · relatório analítico gerado por IA
--
--  Irmã de `cen_leitura_ia`, e pelo mesmo motivo: gerar custa Opus 5 e leva
--  minutos, então o relatório é ARTEFATO DATADO, não algo que a tela produz ao
--  abrir. Se cada abertura gerasse um, cinco pessoas na reunião leriam cinco
--  relatórios diferentes do mesmo censo — e nenhuma confiaria no que está na
--  tela.
--
--  ⚠️ Tabela PRÓPRIA, e não uma coluna em `cen_leitura_ia`: são análises de
--  matéria-prima diferente (aquela lê texto aberto, esta lê as fechadas
--  agregadas), com esquema diferente, e uma existe sem a outra — hoje o censo
--  tem material para esta e nenhum para aquela.
--
--  Histórico preservado (sem UNIQUE por pesquisa): comparar o relatório de hoje
--  com o de duas semanas atrás é o que mostra se uma decisão teve efeito.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.cen_relatorio_ia (
  id            uuid primary key default gen_random_uuid(),
  pesquisa_id   uuid not null references public.cen_pesquisa(id) on delete cascade,
  -- Quantas respostas existiam quando o relatório foi gerado. É o que responde
  -- "isto ainda vale?" — 100 respostas depois, não vale mais.
  respostas_na_base int not null default 0,
  respostas_lidas   int not null default 0,
  modelo        text not null,
  -- { resumo_executivo, achados, recomendacoes, recomendacoes_descartadas,
  --   o_que_o_censo_nao_responde }
  conteudo      jsonb not null,
  uso           jsonb,
  gerado_por    uuid references public.profiles(id) on delete set null,
  gerado_em     timestamptz not null default now()
);

create index if not exists cen_relatorio_ia_pesquisa_idx
  on public.cen_relatorio_ia (pesquisa_id, gerado_em desc);

alter table public.cen_relatorio_ia enable row level security;

-- LER é nível 1: o conteúdo é agregado, não tem linha de pessoa e nunca viu
-- `texto_curto` (onde moram CPF, nome, telefone e e-mail). GERAR é nível 4 e é
-- checado na rota — gastar Opus 5 é ação, não consulta.
drop policy if exists cen_relatorio_ia_sel on public.cen_relatorio_ia;
create policy cen_relatorio_ia_sel on public.cen_relatorio_ia
  for select to authenticated
  using (public.current_user_module_level('censo') >= 1);

drop policy if exists cen_relatorio_ia_svc on public.cen_relatorio_ia;
create policy cen_relatorio_ia_svc on public.cen_relatorio_ia
  for all to service_role using (true) with check (true);

comment on table public.cen_relatorio_ia is
  'Relatórios analíticos do censo gerados por IA a partir das perguntas FECHADAS agregadas (não de texto aberto — ver cen_leitura_ia). Artefato datado: todos leem o mesmo, e o histórico permite comparar no tempo. Só contagem e porcentagem; nunca linha de pessoa.';

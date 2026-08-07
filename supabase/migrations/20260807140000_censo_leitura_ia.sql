-- ════════════════════════════════════════════════════════════════════════════
--  CENSO · cache da Leitura da IA
--
--  Por que guardar em vez de gerar sob demanda: uma leitura de centenas de
--  respostas abertas com Opus 5 custa dinheiro e leva minutos. Se a aba
--  disparasse a análise a cada abertura, cinco pessoas olhando o resultado na
--  reunião gerariam cinco leituras — cinco respostas DIFERENTES para a mesma
--  pergunta, o que destrói a confiança no que está na tela.
--
--  Então a leitura é um ARTEFATO com data: alguém manda gerar, e todo mundo lê
--  a mesma. Guardo o histórico (sem UNIQUE por pesquisa) porque comparar a
--  leitura de hoje com a de duas semanas atrás é exatamente o que mostra se uma
--  mudança na igreja teve efeito.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.cen_leitura_ia (
  id            uuid primary key default gen_random_uuid(),
  pesquisa_id   uuid not null references public.cen_pesquisa(id) on delete cascade,
  -- Quantas respostas concluídas existiam quando a leitura foi feita. É o que
  -- responde "essa leitura ainda vale?" — 40 respostas depois, não vale mais.
  respostas_na_base int not null default 0,
  respostas_lidas   int not null default 0,
  modelo        text not null,
  -- { por_pergunta: [...], leitura_geral: {...}, truncadas: [...] }
  conteudo      jsonb not null,
  uso           jsonb,
  gerada_por    uuid references public.profiles(id) on delete set null,
  gerada_em     timestamptz not null default now()
);

create index if not exists cen_leitura_ia_pesquisa_idx
  on public.cen_leitura_ia (pesquisa_id, gerada_em desc);

alter table public.cen_leitura_ia enable row level security;

-- Leitura é agregada e já vem sem o bloco sensível (filtrado na origem), então
-- nível 1 basta para LER. GERAR é nível 4, e isso é checado na rota — gastar
-- Opus 5 é ação, não consulta.
drop policy if exists cen_leitura_ia_sel on public.cen_leitura_ia;
create policy cen_leitura_ia_sel on public.cen_leitura_ia
  for select to authenticated
  using (public.current_user_module_level('censo') >= 1);

drop policy if exists cen_leitura_ia_svc on public.cen_leitura_ia;
create policy cen_leitura_ia_svc on public.cen_leitura_ia
  for all to service_role using (true) with check (true);

comment on table public.cen_leitura_ia is
  'Sínteses das respostas abertas do censo geradas por IA. Artefato datado, não cache volátil: todos leem a mesma leitura, e o histórico permite comparar no tempo. Nunca contém o bloco sensível.';

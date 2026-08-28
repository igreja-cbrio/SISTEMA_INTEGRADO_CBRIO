-- ── 1 · Credencial OAuth do Plaud ──────────────────────────────────────────
-- ⚠️ TABELA E NÃO VARIÁVEL DE AMBIENTE: o refresh do Plaud ROTACIONA o token —
-- cada renovação devolve um novo (verificado 18/08/2026: expires_in 86400 e
-- refresh_token diferente do enviado). Env var é estática: na segunda
-- renovação o valor guardado já estaria velho e a integração morreria sem
-- aviso, um dia depois de alguém achar que tinha terminado.
create table if not exists plaud_credencial (
  id             smallint primary key default 1 check (id = 1),
  refresh_token  text not null,
  access_token   text,
  expira_em      timestamptz,
  atualizado_em  timestamptz not null default now(),
  observacoes    text
);
comment on table plaud_credencial is
  'Credencial OAuth do Plaud (workspace CBRio). Linha única. O refresh_token ROTACIONA — o backend reescreve esta linha.';
-- Sem policy para authenticated/anon: só o backend (service_role) toca aqui.
alter table plaud_credencial enable row level security;

-- ── 2 · Vários responsáveis por pendência ──────────────────────────────────
-- ⚠️ ADITIVO: `responsavel` (texto) é lido pelo módulo de governança
-- (RitualPage, compartilhado.jsx, routes/governanca.js) e a tabela tem
-- pendências de Conselho/DRE/OKR. Trocar o tipo quebraria aquelas telas.
--   responsaveis = fonte da verdade · responsavel = espelho juntado por ", "
alter table governance_tasks add column if not exists responsaveis text[];
comment on column governance_tasks.responsaveis is
  'Responsáveis da pendência (fonte da verdade). `responsavel` é o mesmo conteúdo juntado por ", ", mantido por compatibilidade.';

update governance_tasks set responsaveis = array[responsavel]
where responsaveis is null and coalesce(trim(responsavel), '') <> '';

-- ⚠️ `tarefa_pessoal_id` (singular) NÃO é removida agora: o código no ar a lê,
-- e derrubá-la junto com o deploy deixaria a tela quebrada durante a janela de
-- publicação. O código novo escreve nas duas; a limpeza fica para depois.
alter table governance_tasks add column if not exists tarefas_pessoais_ids uuid[];
update governance_tasks set tarefas_pessoais_ids = array[tarefa_pessoal_id]
where tarefas_pessoais_ids is null and tarefa_pessoal_id is not null;
comment on column governance_tasks.tarefas_pessoais_ids is
  'Tarefas pessoais geradas por esta pendência — uma por responsável.';

-- ── 3 · Resgate das tarefas invisíveis ─────────────────────────────────────
-- O módulo Minhas Tarefas escopa TODA operação por created_by. As tarefas
-- criadas pela ATA nasceram com created_by = quem clicou, então não apareciam
-- para ninguém. O dono passa a ser o destinatário.
update tarefas_pessoais
set created_by = responsavel_id
where responsavel_id is not null and created_by is distinct from responsavel_id;

-- ── 4 · Quem é COLABORADOR · definição única ───────────────────────────────
-- Bug de origem: o seletor de responsável mostrava quem preencheu o formulário
-- público de membresia. Essas pessoas TÊM login (app de membros e ERP
-- compartilham o Supabase Auth) e passavam por qualquer filtro ingênuo.
-- O sinal que funciona é o CARGO; o resgate é pela ÁREA.
-- ⚠️ Amaury Araújo (cargo 'Membro') e José Ribamar ('Acesso negado') têm área e
-- são da equipe — uma regra só de cargo os apagaria. Já 'Revisor App Store'
-- tem ficha de RH e nenhuma área: conta de teste, fica fora. Por isso o resgate
-- olha ÁREA e não RH.
-- ⚠️ Lista de EXCLUSÃO: cargo novo entra como colaborador até alguém dizer o
-- contrário. Mostrar alguém a mais irrita; esconder um colega de verdade o faz
-- sumir das atribuições sem ninguém entender por quê.
create or replace view vw_colaboradores as
select p.id, p.name, p.email, p.avatar_url,
       nullif(trim(coalesce(p.area,'')),'') as area,
       c.nome as cargo, c.slug as cargo_slug
from profiles p
left join usuarios u on lower(trim(u.email)) = lower(trim(p.email)) and u.ativo = true
left join cargos c on c.id = u.cargo_id
where p.active = true
  and p.is_membro_only is not true
  and p.is_servico is not true
  and not (
        (coalesce(c.slug,'') in ('membro','voluntario','voluntario-kids','totem-kids','totem-kiosk')
         or coalesce(c.nome,'') = 'Acesso negado')
    and nullif(trim(coalesce(p.area,'')),'') is null
  );

comment on view vw_colaboradores is
  'Pessoas da EQUIPE (não membros, não voluntários, não quiosques). Definição única das listas de responsável.';

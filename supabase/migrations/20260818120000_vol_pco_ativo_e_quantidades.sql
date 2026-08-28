-- ═══════════════════════════════════════════════════════════════════════════
-- Voluntariado · a chave que torna a saída do Planning Center segura,
-- e as quantidades reais dos templates de escala
-- ═══════════════════════════════════════════════════════════════════════════
--
-- CONTEXTO (18/08/2026): a igreja está saindo do Planning Center Services. O
-- sync horário processava de 600 a 880 cultos e 14 a 19 mil escalas por dia até
-- 16/08; em 17/08 caiu pra 242/4.153 e em 18/08 as 12 rodadas devolveram 0 e 0.
-- Ou a equipe já parou de alimentar o Services, ou a integração emudeceu — e
-- nos dois casos o sistema precisa de uma chave explícita, porque hoje ele
-- ASSUME que o PCO está vivo.
--
-- ⚠️ O QUE QUEBRA SOZINHO SEM ESTA CHAVE:
-- `reconcilePlanningCenterProfiles` arquiva todo perfil `origem=planning_center`
-- que sumiu do roster do PCO — são **923 dos 931 perfis**. Um sync com o roster
-- vazio (credencial expirada, workspace esvaziado) arquiva a base inteira, e o
-- `/volunteers-pool` exclui arquivados por padrão. O resultado seria a tela de
-- escalar VAZIA, sem erro nenhum aparecendo.
-- Há uma guarda contra pull parcial lá dentro, mas ela protege do pull
-- INCOMPLETO, não da decisão de parar de usar o Services.

begin;

-- ── 1. A chave ──────────────────────────────────────────────────────────────
-- Default TRUE: enquanto ninguém disser o contrário, o comportamento é o de
-- hoje. Desligar é uma decisão consciente, tomada na tela, não um efeito
-- colateral de um deploy.
alter table vol_config
  add column if not exists pco_ativo boolean not null default true;

comment on column vol_config.pco_ativo is
  'false = o Planning Center Services nao e mais fonte. Desliga a reconciliacao '
  'de perfis (que arquivaria ~923 perfis contra um roster vazio) e solta a guarda '
  'anti-duplicata do gerador de cultos. Ver migration 20260818120000.';

-- ── 2. Quantidades reais dos templates ──────────────────────────────────────
-- Os 3 templates nasceram em 28/07 com `quantidade = 1` nas 83 vagas — nunca
-- foram calibrados. A realidade das últimas 8 semanas (8 cultos de cada tipo):
-- Domingo manhã 109 escalados/culto, Quarta 64, Domingo noite 62 — contra 28,
-- 28 e 27 no template. A cobertura marcava quase todo mundo como "fora da
-- composição", que é o oposto do que a tela existe pra mostrar.
--
-- ⚠️ O número usado é a MEDIANA por culto, não a média: uma semana de festa
-- (Recepção com 30 no pico contra 23 de mediana) puxaria a meta pra cima e a
-- escala nasceria sempre incompleta. A mediana é o "normal" do culto.
--
-- ⚠️ Só mexe em item que JÁ EXISTE no template — nada é criado aqui. Item novo
-- é decisão de composição (quem a igreja quer ter), não de estatística (quem
-- ela teve). Os que faltam estão listados no fim, em comentário, pra virarem
-- decisão humana na tela de Templates.
update vol_escala_template_itens i
set quantidade = v.qtd
from (values
  -- template            equipe              função                        mediana
  ('Domingo manhã',      'Banda',            'Vocal',                       4),
  ('Domingo manhã',      'Cuidados',         'Bazar',                       3),
  ('Domingo manhã',      'Cuidados',         'Próximos Passos',             6),
  ('Domingo manhã',      'Integração',       'Estacionamento',              9),
  ('Domingo manhã',      'Integração',       'Ofertório',                  13),
  ('Domingo manhã',      'Integração',       'Recepção',                   23),
  ('Domingo manhã',      'Online',           'Pós Culto/Host',              3),
  ('Domingo manhã',      'Produção',         'Assistente de Produção',      2),
  ('Domingo manhã',      'Produção',         'Câmeras',                     6),
  ('Domingo manhã',      'Produção',         'Mesa de Som',                 2),
  ('Domingo manhã',      'Voluntariado',     'Check-in',                    2),
  ('Domingo manhã',      'Voluntariado',     'Cozinha',                     2),

  ('Domingo noite',      'Banda',            'Vocal',                       4),
  ('Domingo noite',      'Integração',       'Ofertório',                   4),
  ('Domingo noite',      'Integração',       'Recepção',                   14),
  ('Domingo noite',      'Produção',         'Câmeras',                     9),
  ('Domingo noite',      'Produção',         'Mesa de Som',                 2),

  ('Quarta',             'Banda',            'Vocal',                       4),
  ('Quarta',             'Cuidados',         'Próximos Passos',             2),
  ('Quarta',             'Integração',       'Ofertório',                   2),
  ('Quarta',             'Integração',       'Recepção',                   15),
  ('Quarta',             'Produção',         'Assistente de Produção',      2),
  ('Quarta',             'Produção',         'Câmeras',                     6),
  ('Quarta',             'Produção',         'Mesa de Som',                 2)
) as v(template, equipe, funcao, qtd)
join vol_escala_templates tp on tp.nome = v.template and tp.deleted_at is null
join vol_teams t on t.name = v.equipe
join vol_positions p on p.team_id = t.id and p.name = v.funcao
where i.template_id = tp.id and i.team_id = t.id and i.position_id = p.id;

-- Funções que aparecem TODO culto na realidade e não existem no template —
-- Liderança/Supervisão (5–6 por culto), Voluntariado/Apoio (4–5),
-- Produção/Mesa de Corte, Produção/Supervisor de Câmeras,
-- Produção/Transmissão e Infraestrutura, Online/Chat, Marketing/Cobertura de
-- Culto, Integração/Batismo e /Ceia (só em culto com batismo/ceia).
-- NÃO são criadas aqui de propósito: incluir uma função na composição é dizer
-- que ela é obrigatória naquele culto, e isso é decisão de quem lidera a área.

commit;

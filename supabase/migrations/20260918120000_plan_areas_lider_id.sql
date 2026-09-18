-- Planejamento Anual · líder responsável default por área (2026-09-18)
--
-- Pedido do Diego: no formulário de proposta, "Líder responsável" era um
-- <select> com todas as pessoas em ordem crua e nenhuma ligação com a área
-- escolhida. Virou autocomplete (frontend) + sugestão automática por área,
-- lida a partir desta coluna nova.
--
-- Lei do projeto: responsável NUNCA é TEXT livre, sempre UUID FK.
alter table public.plan_areas_diretoria
  add column if not exists lider_id uuid references public.profiles(id);

comment on column public.plan_areas_diretoria.lider_id is
  'Líder padrão sugerido no formulário de proposta ao escolher esta área. Editável na tela (não há UI de admin ainda) — atualizar por SQL quando a liderança trocar.';

-- Preenchido só onde a área está ativa e listada no dropdown do formulário
-- (as áreas legadas/inativas — adm, compras, cozinha, limpeza, manutencao,
-- ministerial — não recebem líder aqui).
update public.plan_areas_diretoria set lider_id = 'a4ca9454-42d3-4a35-b003-52f28a95be3b' where area = 'adoracao';       -- David Silva da Conceição
update public.plan_areas_diretoria set lider_id = 'b7e01eed-d628-46c1-a7c0-842276d8f6de' where area = 'ami';           -- Arthur Cecconi
update public.plan_areas_diretoria set lider_id = 'd93a50f4-9952-42ba-a10d-f9fe01e47ef6' where area = 'cba';           -- Nélio Paiva
update public.plan_areas_diretoria set lider_id = 'f3e074c2-8ee1-46ac-a8b1-1bd1b1eb94be' where area = 'cuidados';      -- Wesley Barros Ramos
update public.plan_areas_diretoria set lider_id = '7c0f6b80-1d82-4579-b4cf-f4e21382e3ee' where area = 'financeiro';    -- Alberto Luiz Stassen da Silva
update public.plan_areas_diretoria set lider_id = '341991ac-a4b9-4754-bc3e-14bc89b32f26' where area = 'gestao_estrategica'; -- Eduardo Francisco dos Santos Gnisci
update public.plan_areas_diretoria set lider_id = 'd93a50f4-9952-42ba-a10d-f9fe01e47ef6' where area = 'grupos';        -- Nélio Paiva
update public.plan_areas_diretoria set lider_id = '8e4ece03-b306-4019-9ece-55b7ec1088cb' where area = 'hospitalidade'; -- Amaury Araújo
update public.plan_areas_diretoria set lider_id = '8e4ece03-b306-4019-9ece-55b7ec1088cb' where area = 'infraestrutura'; -- Amaury Araújo
update public.plan_areas_diretoria set lider_id = '0d4b806b-5a8c-4da3-a0f2-10194acbd043' where area = 'integracao';    -- Lorena Andrade
update public.plan_areas_diretoria set lider_id = '5199d2fb-d805-487a-8d5f-feae717d3b0a' where area = 'kids';         -- Mariane Leal Gaia
update public.plan_areas_diretoria set lider_id = '8e4ece03-b306-4019-9ece-55b7ec1088cb' where area = 'logistica';    -- Amaury Araújo
update public.plan_areas_diretoria set lider_id = 'daff0456-bb11-432c-be44-48ccc1a75465' where area = 'marketing';    -- Pedro Paiva
update public.plan_areas_diretoria set lider_id = 'd93a50f4-9952-42ba-a10d-f9fe01e47ef6' where area = 'next';         -- Nélio Paiva
update public.plan_areas_diretoria set lider_id = '5f51e5eb-39f0-4140-86ff-e54f2543ddb5' where area = 'online';       -- Renata Cristina Martins Bispo
update public.plan_areas_diretoria set lider_id = 'cbc090f4-b305-4f2d-8136-bcc5b5e1d43e' where area = 'producao';     -- Pedro Fernandes Mendes
update public.plan_areas_diretoria set lider_id = '49a996bf-5039-4d9b-9c85-35fdf50399a0' where area = 'rh';           -- Juliana Carneiro Leão Ramos
update public.plan_areas_diretoria set lider_id = 'd0936532-5da2-40b8-9d0c-bff16cfd5b85' where area = 'voluntariado'; -- Jessica Salviano

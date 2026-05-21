-- =====================================================================
-- Apresentacoes · base de conhecimento (contexto CBRio injetado no prompt)
-- =====================================================================
-- Tabela editavel onde admin gerencia fatos da organizacao que o
-- gerador injeta no prompt da IA. Resolve o caso "pedi 5 valores e
-- veio nada a ver" · agora a IA sabe quais sao OS 5 valores CBRio.
--
-- Pode crescer indefinidamente · admin adiciona entries por tema.
-- Tudo com ativo=true e injetado em ordem.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.apresentacoes_contexto (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave       text UNIQUE NOT NULL,
  titulo      text NOT NULL,
  conteudo    text NOT NULL,
  ordem       int DEFAULT 0,
  ativo       boolean DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS apresentacoes_contexto_ativo_ordem
  ON public.apresentacoes_contexto (ativo, ordem) WHERE ativo;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public._apres_ctx_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS apresentacoes_ctx_set_updated_at ON public.apresentacoes_contexto;
CREATE TRIGGER apresentacoes_ctx_set_updated_at
  BEFORE UPDATE ON public.apresentacoes_contexto
  FOR EACH ROW EXECUTE FUNCTION public._apres_ctx_set_updated_at();

-- ── Seeds · contexto base extraido do CLAUDE.md ───────────────────────
INSERT INTO public.apresentacoes_contexto (chave, titulo, conteudo, ordem) VALUES

('sobre', 'Sobre a CBRio',
'A CBRio e uma igreja modelo "hub" com Sede + Online + igrejas CBA acompanhadas.

Stack do sistema interno: React + Vite (frontend), Express (backend), Supabase
(banco + auth), deploy Vercel.

Identidade visual:
- Cor primaria: #00B39D (verde-azulado)
- Branding limpo e moderno
- Variaveis CSS principais: --cbrio-bg, --cbrio-card, --cbrio-text', 1),

('valores', 'Os 5 valores da CBRio (Jornada do Membro)',
'A CBRio organiza a vida do membro em torno de 5 valores. Um "Membro
Modelo" pratica >=2 desses 5 valores. Sao eles:

1. **Seguir Jesus** - decisao + primeiro contato + batismo. Alimentado por
   decisoes registradas nos cultos (presencial, online, kids).

2. **Conectar** - participacao ativa em grupo de conexao (grupo pequeno
   semanal). Medido por mem_grupo_membros com saiu_em IS NULL.

3. **Investir Tempo com Deus** - devocional diario + jornada 180 +
   encontros pessoais com Deus. Modulo Devocional usa API.Bible + Claude
   Haiku pra gerar conteudo.

4. **Servir** - voluntariado ativo em algum ministerio (Kids/AMI/Bridge/
   Producao/Marketing/Recepcao/Cuidado/etc). Medido por mem_voluntarios
   com ate IS NULL.

5. **Generosidade** - contribuicao recorrente (dizimo ou oferta) nos
   ultimos 90 dias.', 2),

('areas', 'As 6 áreas ministeriais (matriz Valor × Área)',
'O sistema tem 6 areas ministeriais que cruzam com os 5 valores
formando uma matriz 6×5 de ~150 KPIs.

- **Sede**: culto principal CBRio (Domingo 8h30/10h/11h30/19h + Quarta com Deus 20h).
- **Online**: transmissao YouTube (somente leitura · decisoes preenchidas pela Alda Lorena).
- **Kids**: ministerio infantil. Lider: Mariane Gaia.
- **AMI**: culto de adolescentes/jovens, sabado 20h. Lider: Arthur Cecconi.
- **Bridge**: culto pra novos, sabado 17h. Lider: Lillian Xavier.
- **CBA**: igrejas externas acompanhadas pelo CBRio.', 3),

('lideranca', 'Liderança · Diretoria Geral (5 nominais)',
'A diretoria geral da CBRio sao 5 pessoas nominais (distinto de role
admin/diretor no sistema):

- **Pr. Pedrão** · Pastor Senior
- **Pr. Juninho** · Pastor Presidente
- **Eduardo Gnisci** · Lider de Gestão (chefe direto do Marcos)
- **Arthur Serpa** · Lider Ministerial
- **Pedro Menezes (Pepe)** · Lider Criativo', 4),

('time_dev', 'Time de desenvolvimento',
'O sistema integrado CBRio foi construido por:

- **Marcos Paulo Almeida** · Backend, integracoes, modulos Administracao
  (RH/Patrimonio/Solicitacoes), Eventos com ciclo criativo, Painel CBRio.
- **Matheus Toscano** · Lovable/Claude UI, modulo Online (YouTube +
  Analytics + OAuth), Devocional com IA, NPS gerado por IA, Financeiro,
  Mercado Livre + tracking, NEXT, Grupos.

Em 40 dias: 540h, 829 commits, 238 migrations, 6 modulos macro.', 5),

('jornada_180', 'Programa Jornada 180',
'Programa de discipulado de 180 dias pra novos convertidos. Vincula
pessoa a um lider espiritual que faz encontros pessoais regulares.

Tabela: cui_jornada180. Encontros alimentam o valor "Investir Tempo com
Deus" da Jornada do Membro.', 6),

('nps_culto', 'NPS de Culto',
'A cada culto, a CBRio coleta NPS dos participantes (0-10 + comentario).
KPIs do tipo CULTO-NPS-* alimentam o valor "Seguir Jesus" da Jornada.

NPS positivo = vai dizer pra amigos · alimenta a frequencia futura.')
ON CONFLICT (chave) DO NOTHING;

COMMENT ON TABLE public.apresentacoes_contexto IS
  'Base de conhecimento injetada no prompt do gerador de apresentacoes';

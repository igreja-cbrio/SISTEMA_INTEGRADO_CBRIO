

# Mandala Cultura CBRio — Home interativa com 5 valores

Substituir a Home atual por uma **mandala animada** que reflete os 5 valores da cultura CBRio em tempo real, com filtro por mês. KPIs e notificações continuam abaixo, atalhos preservados na parte inferior.

## Layout final da Home

```
┌───────────────────────────────────────────────┐
│   Saudação + filtro de mês [▼ Abril 2026]    │
│                                                │
│         ╭─────────────────────╮               │
│      ╱ Seguir   Conectar  Generosidade ╲      │
│     ╱  Jesus    Pessoas              ╲       │
│    │     ╲   Investir Tempo  ╱          │     │
│    │       ╲     com Deus  ╱            │     │
│    │         ╲   Servir   ╱             │     │
│    │           ╲ Comunidade             │     │
│    │              ┌──────┐              │     │
│    │              │1.704 │ DECISÕES     │     │
│    │              └──────┘              │     │
│     ╲                                  ╱      │
│       ╲────────────────────────────╱         │
│                                                │
│   [Acesso Rápido — atalhos atuais]           │
│   [Atividade Recente — notificações]         │
└───────────────────────────────────────────────┘
```

## Os 5 valores (cálculo, fonte de dados)

Filtro: **mês selecionado** (default = mês atual).

| Pétala | Métrica | Fórmula | Fonte |
|---|---|---|---|
| **Seguir a Jesus** | Frequência média semanal | • Presencial: SUM(presencial_adulto + presencial_kids) ÷ semanas do mês<br/>• Online (DS): SUM(online_ds) ÷ semanas do mês | `cultos` (mês selecionado) |
| **Conectar-se com Pessoas** | Pessoas em grupos | COUNT(membros ativos em mem_grupo_membros, saiu_em IS NULL) | `mem_grupo_membros` |
| **Investir tempo com Deus** | Views diárias médias do PENSE | SUM(views) dos vídeos PENSE no mês ÷ dias do mês | `pense_videos` (nova) |
| **Servir em Comunidade** | Voluntários ativos últimos 3 meses | COUNT DISTINCT volunteer_id em vol_check_ins onde checkin_at ≥ hoje–90d | `vol_check_ins` |
| **Generosidade** | Ofertantes + Dizimistas do mês | Lançamento mensal manual (qtd_ofertantes, qtd_dizimistas) | `cultura_mensal` (nova) |
| **Centro: Decisões** | SUM(decisoes_presenciais + decisoes_online) do mês | `cultos` |

## Mudanças no banco (SQL para SQL Editor — produção CBRio)

```sql
-- 1. Tabela para vídeos do PENSE (cron coleta views via YouTube API)
CREATE TABLE IF NOT EXISTS public.pense_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id text NOT NULL UNIQUE,
  titulo text,
  data_publicacao date NOT NULL,
  views int NOT NULL DEFAULT 0,
  views_atualizado_em timestamptz,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);
CREATE INDEX idx_pense_data ON public.pense_videos(data_publicacao);
ALTER TABLE public.pense_videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY pense_select ON public.pense_videos FOR SELECT TO authenticated USING (true);
CREATE POLICY pense_write  ON public.pense_videos FOR ALL    TO authenticated USING (true) WITH CHECK (true);

-- 2. Lançamento mensal de generosidade (entrada manual)
CREATE TABLE IF NOT EXISTS public.cultura_mensal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mes date NOT NULL UNIQUE,           -- sempre dia 01
  qtd_ofertantes int NOT NULL DEFAULT 0,
  qtd_dizimistas int NOT NULL DEFAULT 0,
  observacoes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);
ALTER TABLE public.cultura_mensal ENABLE ROW LEVEL SECURITY;
CREATE POLICY cultura_select ON public.cultura_mensal FOR SELECT TO authenticated USING (true);
CREATE POLICY cultura_write  ON public.cultura_mensal FOR ALL    TO authenticated USING (true) WITH CHECK (true);

-- 3. Registrar módulo no painel de notificações (opcional)
INSERT INTO public.modulos (nome, ativo) VALUES ('Cultura', true) ON CONFLICT DO NOTHING;
```

## Backend — novo endpoint

**`backend/routes/kpis.js`** — adicionar:

- **GET `/api/kpis/cultura?mes=YYYY-MM`** — retorna JSON consolidado:
  ```json
  {
    "mes": "2026-04",
    "semanas_no_mes": 4,
    "dias_no_mes": 30,
    "seguir_jesus": { "presencial": 2362, "online": 5997 },
    "conectar_pessoas": 1090,
    "investir_deus": 8365,
    "servir_comunidade": 523,
    "generosidade": { "dizimistas": 867, "ofertantes": 1103 },
    "decisoes": 1704
  }
  ```
- **POST/PUT `/api/kpis/cultura/mensal`** — upsert em `cultura_mensal` (ofertantes, dizimistas).
- **GET/POST/DELETE `/api/kpis/cultura/pense`** — CRUD básico de vídeos PENSE.
- **POST `/api/kpis/cultura/pense/sync`** — cron diário usa YOUTUBE_API_KEY existente para atualizar `views` de cada vídeo.

Cálculo de "semanas no mês" = ceil(dias / 7). Dias = total de dias do mês.

## Frontend — componentes novos

1. **`src/pages/Index.tsx`** — substituir placeholder; rota `/dashboard` permanece em `Dashboard.jsx` mas vamos importar a Mandala lá no topo.

2. **`src/pages/Dashboard.jsx`** — adicionar `<MandalaCultura />` antes da seção "Visão Geral". Manter KPIs e notificações.

3. **Novos arquivos**:
   - `src/components/cultura/MandalaCultura.jsx` — orquestrador com filtro de mês, fetch via `kpis.cultura(mes)`.
   - `src/components/cultura/MandalaSVG.jsx` — SVG da semicírculo com 5 pétalas, animações framer-motion (fade-in escalonado, hover-scale, contador animado via `number-ticker.tsx` existente, ripple no centro).
   - `src/components/cultura/PetalDetailDialog.jsx` — ao clicar em uma pétala, abre Dialog mostrando breakdown (ex.: "Presencial 2.362 / Online 5.997 / 4 semanas").
   - `src/pages/admin/CulturaMensal.jsx` — formulário em `/admin/cultura` para lançar ofertantes/dizimistas e gerenciar vídeos PENSE.

4. **`src/api.js`** — adicionar em `kpis`:
   ```js
   cultura: (mes) => get(`/kpis/cultura?mes=${mes}`),
   culturaMensalUpsert: (data) => post('/kpis/cultura/mensal', data),
   pense: { list, create, remove, sync }
   ```

5. **`src/App.tsx`** — registrar rota `/admin/cultura` (admin/diretor).

## Design — Mandala interativa

- **Forma**: meio-círculo (igual print) usando 5 setores SVG (`<path>` em arco). 3 pétalas verdes/teal (#00B39D — Conectar/Investir/Servir), 2 azuis (#3B82F6 — Seguir/Generosidade). Centro grande branco com "Decisões".
- **Animações**:
  - Entrada: cada pétala faz `scale-in` + `fade-in` em cascata (delay 80ms).
  - Hover: pétala expande 1.05x, sombra suave; cursor pointer.
  - Números: `<NumberTicker>` (já existente) anima de 0 → valor.
  - Troca de mês: pétalas dão fade-out → novo fetch → fade-in com novos números.
  - Centro: pulso sutil contínuo (animate-pulse no contorno).
- **Filtro de mês**: Select shadcn (`__current__` como default) com últimos 12 meses; ao mudar, refetch.
- **Responsivo**: mobile vira layout vertical (stack de cards) com mesma identidade visual.
- **Loading**: skeleton pulsante na forma de meio-círculo.
- **Empty state**: se `cultura_mensal` ou `pense_videos` vazio, pétala mostra "—" + tooltip "Configure em /admin/cultura".

## Fluxo de execução (após aprovação)

1. **PR 1 — Schema + backend**: SQL manual + endpoint `/api/kpis/cultura` + cron PENSE.
2. **PR 2 — Mandala UI**: componentes Mandala* + integração no Dashboard.
3. **PR 3 — Admin Cultura**: tela `/admin/cultura` para inputs manuais + lista PENSE.

Pendências para confirmar antes do PR 1:
- Você me passa o **link/IDs do canal ou playlist do PENSE** para eu cadastrar os primeiros vídeos no admin (ou já me autoriza a deixar o cadastro 100% manual via interface).
- Confirma que o módulo `Cultura` (admin) deve ficar visível só para admin/diretor.


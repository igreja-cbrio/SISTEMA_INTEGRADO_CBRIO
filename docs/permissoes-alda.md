# Permissões · Alda Lorena (Líder de Integração)

**Objetivo:** Alda Lorena acessar sem erro:

| Tela | Como funciona o gate |
|------|----------------------|
| `/painel` (NSM + mandalas) | Aberto a qualquer login · sem ajuste necessário |
| `/integracao` (cultos, decisões, batismos) | Precisa `kpi_areas` conter `'integracao'` |
| `/minha-area` filtrado em Seguir | Precisa `kpi_valores` conter `'seguir'` |

---

## Passo 1 · Diagnóstico (rodar no SQL Editor)

```sql
SELECT
  p.id,
  p.name,
  p.email,
  p.role,
  p.active,
  p.kpi_areas,
  p.kpi_valores,
  p.ministerio_id,
  p.ministerio_papel,
  m.titulo AS ministerio
FROM public.profiles p
LEFT JOIN public.ministerios m ON p.ministerio_id = m.id
WHERE LOWER(p.name) ILIKE '%alda%' OR LOWER(p.email) ILIKE '%alda%';
```

Confirme:
- `active = true`
- `role` é `'lider'` ou `'admin'`/`'diretor'`
- `kpi_areas` contém `'integracao'`
- `kpi_valores` contém `'seguir'`

Se algum desses faltar, vai pro Passo 2.

---

## Passo 2 · Correção (rodar no SQL Editor)

```sql
UPDATE public.profiles
SET
  active = true,
  role = 'lider',
  kpi_areas = ARRAY['integracao']::text[],
  kpi_valores = ARRAY['seguir']::text[]
WHERE LOWER(name) = 'alda lorena';
```

Se ela tiver mais de uma linha em `profiles` (login antigo + novo), me avise antes de rodar.

---

## Como cada gate funciona

### `/integracao`

Backend `backend/routes/kpis.js` · `authorizeIntegracao()` libera escrita em cultos/decisões/batismos pra:
- `role IN ('admin', 'diretor')` OU
- `kpi_areas` contém `'integracao'`

Leitura (`GET /api/kpis/cultos`) está aberta a qualquer autenticado. Só o **botão de editar/excluir** precisa do `kpi_areas`.

### `/minha-area`

Frontend `src/pages/MinhaArea.jsx` filtra KPIs assim:
1. Admin/diretor → vê tudo
2. Perfil sem `kpi_areas` nem `kpi_valores` → vê tudo (fallback MVP)
3. Perfil com permissões → KPI passa se **área OU valor batem**

Alda com `kpi_areas = ['integracao']` + `kpi_valores = ['seguir']`:
- "integracao" NÃO é área de KPI (KPIs Seguir estão em sede/ami/bridge/online/kids/cba)
- Por isso filtro **cai no `kpi_valores`** · ela vê **todos os KPIs marcados com valor `seguir`** (que são exatamente os de Integração)

### `/painel`

Tudo aberto a qualquer autenticado · mandalas, matrizes, NSM. Alda vê tudo da visão estratégica · isso é intencional pra ela ter contexto da saúde geral da igreja.

---

## Confirmação visual (após Alda fazer login)

1. Sidebar mostra `/integracao` e `/minha-area` (visíveis a todos autenticados)
2. Em `/minha-area`:
   - Cabeçalho diz `Líder de integracao`
   - Cards filtrados mostram só KPIs de Seguir (Sede, AMI, Bridge, Online, Kids, CBA)
   - Filtros de pilar/valor/área permitem refinar dentro do conjunto dela
3. Em `/integracao`:
   - Modal de culto deixa editar/preencher decisões
   - Botões "Salvar" funcionam sem erro 403

---

## Riscos conhecidos (avisos)

- **`/painel` sem gate granular:** Alda enxerga matrizes de todas as áreas (Gestão, Criativo, etc.). Se quiser limitar, fala que eu adiciono filtro por `kpi_areas`/`kpi_valores` no `backend/routes/painel.js`.
- **Backend `/api/kpis/v2/taticos` retorna tudo:** se Alda inspecionar o DevTools, vê todos os KPIs do sistema (apenas leitura). Pra MVP é aceitável; se virar problema, adiciono filtro server-side.
- **Sem `kpi_areas` configurada:** se faltar, ela cai no "sem permissões = vê tudo" (fallback). Não causa erro mas dá acesso amplo. Garante o `UPDATE` do Passo 2.

---

## Pra desfazer (caso queira reverter)

```sql
UPDATE public.profiles
SET kpi_areas = ARRAY[]::text[], kpi_valores = ARRAY[]::text[]
WHERE LOWER(name) = 'alda lorena';
```

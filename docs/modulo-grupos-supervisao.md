# Módulo Grupos — Hierarquia + Supervisão

> **Contexto criado em 2026-05-13.** Marcos pediu pra documentar como o módulo foi estruturado pra quando formos desenvolver com dados reais (atribuir supervisores, marcar funções) verificarmos se a tela de acompanhamento `/grupos/supervisao` está respeitando as permissões corretamente.

---

## 1. Hierarquia conceitual

```
coordenador                ← vê TODOS os supervisores e grupos
   └── supervisor           ← vê apenas os grupos que supervisiona
         └── lider           ← responsável principal do grupo (já existia)
         └── co_lider        ← líder auxiliar
         └── lider_treinamento  ← em formação · vira KPI
         └── frequentador    ← membro regular
         └── visitante       ← novo, ainda em integração
```

**Admin/diretor (role do sistema)** = bypass de tudo, vê e edita qualquer coisa.

## 2. Estrutura de dados (migration `20260513140000`)

### Enum `grupo_funcao`
7 valores em ordem hierárquica (baixo → alto):
`visitante` · `frequentador` · `lider_treinamento` · `lider` · `co_lider` · `supervisor` · `coordenador`

### Colunas adicionadas
- `mem_grupo_membros.funcao` (default `'frequentador'`) — papel da pessoa NAQUELE grupo
- `mem_grupos.supervisor_id` (FK opcional pra `mem_membros`) — quem supervisiona AQUELE grupo

### Tabelas novas
| Tabela | Para que serve |
|--|--|
| `grupo_supervisao_visitas` | 1 linha por visita do supervisor ao grupo (data + obs) |
| `grupo_supervisao_observacoes` | 1 linha por (grupo, mês) — observação mensal consolidada |

### View `vw_grupos_supervisao`
Já consolida tudo pra alimentar a tela:
```sql
SELECT
  id, nome, lider_id, lider_nome,
  supervisor_id, supervisor_nome,
  total_membros, total_lider_treinamento,
  ultima_visita, visitas_mes_atual
FROM vw_grupos_supervisao;
```

## 3. Resolução de papel (backend)

`backend/routes/grupos.js` · helper `getMeuPerfilGrupo(userId, role)`:

1. **Admin/diretor** (pela `role` do user) → papel `'admin'`
2. Resolve `membro_id` = membro vinculado pelo email do user
3. **Coordenador**? Tem alguma row em `mem_grupo_membros` com `funcao='coordenador'` e `saiu_em IS NULL` → papel `'coordenador'`
4. **Supervisor**? Aparece como `supervisor_id` em algum grupo ativo → papel `'supervisor'`
5. Sem papel → 403 na tela

> **Atenção quando rodar com dados reais**: o user precisa de um membro vinculado (`mem_membros.email == profile.email`). Se o supervisor não tiver perfil/membro vinculado, ele vai cair em 403.

## 4. Endpoints disponíveis

| Método | Rota | Quem pode |
|--|--|--|
| GET | `/api/grupos/supervisao/me` | Qualquer user com papel resolvido |
| GET | `/api/grupos/:id/visitas` | Authenticated |
| POST | `/api/grupos/:id/visitas` | Admin/coordenador em qualquer · supervisor só nos seus |
| DELETE | `/api/grupos/visitas/:visitaId` | Admin/coordenador/supervisor |
| GET | `/api/grupos/:id/observacoes` | Authenticated |
| PUT | `/api/grupos/:id/observacoes/:periodo` | Admin/coordenador em qualquer · supervisor só nos seus |
| PUT | `/api/grupos/:id/supervisor` | **Admin/diretor apenas** |
| PUT | `/api/grupos/membros/:rowId/funcao` | Admin/coordenador/supervisor |

## 5. Tela `/grupos/supervisao`

Arquivo: `src/pages/ministerial/GruposSupervisao.jsx`

- Carrega `GET /supervisao/me` (vem papel + supervisores agrupados)
- Header mostra papel resolvido
- Layout: blocos de supervisor (expansíveis) → grupos dentro
- **Auto-expansão**: se o papel for `supervisor`, expande o único bloco automaticamente
- Click no grupo → modal com:
  - **Tab Visitas**: lista + form de nova visita
  - **Tab Observação mensal**: textarea pro mês atual (upsert) + histórico

### Badges visuais de visita

| Cor | Critério |
|--|--|
| Verde | última visita ≤ 30 dias |
| Amarelo | última visita ≤ 60 dias |
| Vermelho | mais de 60 dias OU nunca |

## 6. KPIs que esses dados alimentam

| KPI | Fonte | Fórmula |
|--|--|--|
| `lideres_treinados` | `mem_grupo_membros.funcao` | count where funcao='lider_treinamento' AND saiu_em IS NULL |
| `lideres_acompanhados` | `grupo_supervisao_visitas` | count distinct grupo_id no mês |
| `grupos_ativos` | `mem_grupos.ativo` (já existia) | count |

> **Trabalho pendente**: configurar `formula_config` dos KPIs `*-LID-*` para apontar pra esses tipos de dado bruto OU criar coletor que conta direto das tabelas. Ainda não foi feito porque hoje as colunas estão vazias.

## 7. Checklist pra ativar com dados reais

### a. Listar membros que serão supervisores/coordenadores
```sql
-- Pegar emails dos profiles que devem ser supervisores
SELECT p.id AS profile_id, p.email, m.id AS membro_id, m.nome
  FROM profiles p
  LEFT JOIN mem_membros m ON m.email = p.email
 WHERE p.email IN ('supervisor1@cbrio.org', 'supervisor2@cbrio.org', ...);
```

⚠️ Verificar se TODO supervisor tem `mem_membros.email` igual ao `profile.email`. Se não, criar/atualizar `mem_membros` antes.

### b. Vincular supervisores a grupos
```sql
UPDATE mem_grupos SET supervisor_id = '<membro_id_supervisor>' WHERE id = '<grupo_id>';
-- ou em lote por bairro/categoria:
UPDATE mem_grupos SET supervisor_id = '<membro_id>' WHERE bairro = 'Copacabana' AND ativo = true;
```

### c. Marcar líderes em treinamento (gera KPI)
```sql
UPDATE mem_grupo_membros SET funcao = 'lider_treinamento'
 WHERE membro_id = '<uuid>' AND grupo_id = '<uuid>' AND saiu_em IS NULL;
```

### d. Marcar coordenadores (mais alto da hierarquia)
```sql
-- Basta UMA row em qualquer grupo com funcao='coordenador'
UPDATE mem_grupo_membros SET funcao = 'coordenador'
 WHERE membro_id = '<uuid_do_coordenador>'
 LIMIT 1;
```

### e. Verificação de permissões esperada

Após atribuir, testar:
- [ ] Login como **admin** → `/grupos/supervisao` mostra TODOS os supervisores em blocos
- [ ] Login como **coordenador** → mesmo comportamento que admin (visualmente)
- [ ] Login como **supervisor (com 1+ grupos)** → vê só seus grupos, bloco auto-expandido
- [ ] Login como **usuário sem papel** → mensagem "Você não tem papel ativo"
- [ ] Supervisor clica num grupo que NÃO é dele (forjando URL) → backend retorna 403 ao tentar adicionar visita
- [ ] Admin atribui supervisor via `PUT /api/grupos/:id/supervisor` → grupo aparece sob o novo supervisor
- [ ] Supervisor adiciona visita → contador `visitas_mes_atual` da view sobe e badge fica verde

### f. Validar contagem de KPI

```sql
-- Líderes em treinamento ativos por grupo
SELECT g.nome, count(*) FILTER (WHERE m.funcao = 'lider_treinamento') AS em_treinamento
  FROM mem_grupos g
  JOIN mem_grupo_membros m ON m.grupo_id = g.id AND m.saiu_em IS NULL
 WHERE g.ativo = true
 GROUP BY g.id, g.nome
 ORDER BY em_treinamento DESC;

-- Grupos acompanhados no mês corrente (por supervisor)
SELECT s.nome AS supervisor, count(DISTINCT v.grupo_id) AS grupos_visitados
  FROM grupo_supervisao_visitas v
  JOIN mem_membros s ON s.id = v.supervisor_id
 WHERE v.data_visita >= date_trunc('month', CURRENT_DATE)::date
 GROUP BY s.nome
 ORDER BY grupos_visitados DESC;
```

## 8. Pontos que podem precisar ajuste depois

1. **Mais de 1 supervisor por grupo?** Hoje só 1 (`supervisor_id`). Se precisar de co-supervisor, criar tabela de junção.
2. **Hierarquia de coordenadores** (cada coordenador supervisiona N supervisores)? Hoje não tem essa estrutura — coordenador vê tudo. Se precisar restringir, criar `coordenador_supervisores`.
3. **Função histórica vs atual**: hoje `funcao` é a função no grupo atual. Se quiser histórico (quando virou líder etc), adicionar `data_funcao_desde`.
4. **Notificações**: supervisor não é notificado quando passa muito tempo sem visitar. Adicionar regra em `notificacaoGenerator.js` quando aplicável.
5. **Permissões via módulo Permissões**: hoje o papel é deduzido pela presença em tabelas. Quando o módulo Permissões formal estiver pronto, talvez fazer migração.

## 9. Arquivos relevantes

| Tipo | Caminho |
|--|--|
| Migration | `supabase/migrations/20260513140000_grupos_hierarquia_supervisao.sql` |
| Backend | `backend/routes/grupos.js` (helper `getMeuPerfilGrupo` + endpoints `/supervisao/*`, `/visitas`, `/observacoes`) |
| Frontend | `src/pages/ministerial/GruposSupervisao.jsx` |
| API client | `src/api.js` → `grupos.supervisaoMe()`, `addVisita()`, `setObservacao()`, etc. |
| Rota | `src/App.tsx` → `/grupos/supervisao` |

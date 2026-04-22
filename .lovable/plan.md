

# Coletar TODOS os escalados (uma linha por equipe/posição)

## Diagnóstico

Hoje o sync do Planning Center está **deduplicando por pessoa**, então uma pessoa escalada em mais de uma posição/equipe no mesmo culto aparece como **1 só voluntário** no totem.

**Trecho problemático** (`backend/services/planningCenter.js`, linha ~270):
```js
const key = `${service.id}_${personId}`;  // dedup por pessoa
```
E o banco reforça isso: `vol_schedules` tem unique `(service_id, planning_center_person_id)` — só permite 1 linha por pessoa/culto.

Adicionalmente:
- Membros sem `personId` válido são **silenciosamente ignorados** (linha 295).
- Membros com nome "Sem nome" são descartados do pool de voluntários (mas ainda viram schedule — ok).
- O `getVolunteerName` cai em "Sem nome" se PC não retorna `attributes.name` e `included` não traz a Person — o que acontece em alguns membros (visitantes, scheduled placeholders).

## O que muda

### 1. Banco — permitir 1 linha por (culto, pessoa, equipe, posição)

Trocar a unique constraint de `vol_schedules` para incluir `team_name` e `position_name`. Assim, a mesma pessoa em 2 posições gera 2 linhas e cada uma aparece no totem com sua equipe.

```sql
-- Remove a antiga
ALTER TABLE vol_schedules
  DROP CONSTRAINT IF EXISTS vol_schedules_service_id_planning_center_person_id_key;

-- Cria a nova (NULLs distintos para suportar volunteer_id manual sem PC id)
CREATE UNIQUE INDEX vol_schedules_unique_assignment
  ON vol_schedules (
    service_id,
    COALESCE(planning_center_person_id, ''),
    COALESCE(team_name, ''),
    COALESCE(position_name, '')
  );
```

(SQL é enviado para o usuário executar no editor Supabase, conforme regra do projeto.)

### 2. Sync — uma linha por (pessoa + equipe + posição)

Em `backend/services/planningCenter.js`, função `processServiceType`:

- Trocar a chave de dedup de `${service.id}_${personId}` para `${service.id}_${personId}_${teamName}_${positionName}`.
- Trocar `onConflict: 'service_id,planning_center_person_id'` por `onConflict: 'service_id,planning_center_person_id,team_name,position_name'` — ou usar índice nomeado.
- Remover a fusão "concatenar team_names em vírgula" — agora cada equipe é uma linha real.

### 3. Sync — não descartar quem não tem personId

Quando `member.relationships.person.data.id` está vazio, hoje o `personId` cai para `member.id` (id do `team_member`, não da pessoa). Isso ainda funciona como chave única mas pode dar falso positivo.

Mudança: se não houver `personId` real, gerar a linha mesmo assim usando `member.id` como sufixo, mas **garantir** que o nome venha de `member.attributes.name` (PC quase sempre preenche). Só descarta se nem `member.attributes.name` nem o include `Person` resolverem o nome.

### 4. Backend — suporte ao novo schema

Em `backend/routes/voluntariado.js`:
- Endpoint `/schedules` (linha 819): nada muda no SELECT, só passa a retornar mais linhas naturalmente.
- Endpoint `/check-ins` POST (linha 857): a lógica de "auto-detectar sem escala" usa `volunteer_id + service_id` (`maybeSingle`). Trocar `maybeSingle` por `limit(1).select('id')` para não quebrar quando houver 2+ linhas (mesma pessoa em 2 posições).

### 5. Frontend (totem) — mostrar uma entrada por escalação

`src/pages/ministerial/voluntariado/VolTotem.tsx` no modo Manual:
- Hoje a busca lista `schedules` direto — já vai mostrar todas as escalações automaticamente após a mudança no banco/sync.
- Ajustar o filtro `unscheduledMatches` para considerar a pessoa "já escalada" se aparece em **qualquer** linha de `schedules` (set de `volunteer_id`/`planning_center_person_id`) — já é o comportamento atual, só confirmar.

### 6. Re-sync após migration

Plano de execução:
1. Usuário roda o SQL no Supabase.
2. Deploy do backend com a nova lógica.
3. Usuário aciona **"Sincronizar Planning Center"** uma vez no `/voluntariado/dashboard` para reprocessar e gravar as linhas que estavam fundidas.

## Arquivos alterados

- `backend/services/planningCenter.js` — dedup por (pessoa+equipe+posição), `onConflict` novo, fallback de nome resiliente.
- `backend/routes/voluntariado.js` — POST `/check-ins` tolerante a múltiplas escalas.
- `supabase/migrations/<timestamp>_vol_schedules_unique_per_position.sql` — nova migration (e SQL avulso enviado no chat).

## Sem mudanças

- UI do totem (modo Manual já lista todas as linhas que recebe).
- Endpoints públicos, autenticação, RLS.
- Tabelas `vol_check_ins`, `vol_profiles`, `vol_volunteer_qrcodes`.

## Risco

Baixo. A migration apenas troca a unique constraint (`DROP + CREATE INDEX`); não há perda de dados. Se um sync antigo já fundiu linhas, o próximo sync recria as linhas separadas (upsert idempotente). O check-in continua aceitando `schedule_id` específico, então tocar "Check-in" em qualquer das linhas registra presença para aquela equipe/posição correta.


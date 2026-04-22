

# Garantir que TODOS os tipos de culto do Planning Center sejam sincronizados (incluindo Kids)

## Diagnóstico

A listagem de "service types" no Planning Center está **paginada e não estamos paginando**. Em `backend/routes/voluntariado-sync.js`, todas as 4 rotas (`/sync`, `/sync-historical`, `/sync-auto`, `/diagnostics`) chamam:

```js
fetchWithRetry(`${PC_SERVICES_BASE}/service_types`, …)
```

Sem `per_page` e sem loop de offset. O Planning Center retorna **25 por página por padrão** — qualquer service type além disso (provavelmente o **CBKids**, dependendo da ordem) é silenciosamente ignorado. Consequência: nenhum plano/voluntário do Kids entra em `vol_services` / `vol_schedules` / `vol_profiles`.

A página `/api/voluntariado-sync/diagnostics` confirma o problema rapidamente: ela só lista os primeiros 25 service types.

## O que muda

### 1. Helper paginado no `planningCenter.js`

Criar uma função reutilizável `fetchAllServiceTypes(credentials)` que itera com `per_page=100` + `offset` até esgotar:

```js
async function fetchAllServiceTypes(credentials) {
  const headers = { Authorization: `Basic ${credentials}` };
  const all = [];
  let offset = 0;
  const perPage = 100;
  while (true) {
    const res = await fetchWithRetry(
      `${PC_SERVICES_BASE}/service_types?per_page=${perPage}&offset=${offset}`,
      headers
    );
    if (!res.ok) break;
    const data = await res.json();
    all.push(...(data.data || []));
    if ((data.data || []).length < perPage) break;
    offset += perPage;
    if (offset > 5000) break; // safety
  }
  return all;
}
```

Exportar do módulo.

### 2. Substituir as 4 chamadas em `voluntariado-sync.js`

Trocar cada bloco do tipo:
```js
const testRes = await fetchWithRetry(`${PC_SERVICES_BASE}/service_types`, …);
const typesData = await testRes.json();
const serviceTypes = typesData.data || [];
```
por:
```js
const serviceTypes = await fetchAllServiceTypes(credentials);
if (!serviceTypes.length) return res.status(400).json({ error: 'Falha ao conectar ao Planning Center ou nenhum tipo encontrado' });
```

Locais: linhas 22-26 (`/sync`), 85-89 (`/sync-historical`), 131-135 (`/sync-auto`), 189-193 (`/diagnostics`).

### 3. Garantir que outros pontos também paginem

Há mais 1 ocorrência sem paginação em `backend/routes/voluntariado.js` linha 1810 (importa equipes do PC para a tela de Equipes):
```js
const typesRes = await fetchWithRetry(`${PC_SERVICES_BASE}/service_types?per_page=100`, …);
```
Já tem `per_page=100`, mas sem loop. Substituir também por `fetchAllServiceTypes(credentials)` por consistência (mesmo helper).

### 4. Log explícito

Logar no console do backend a quantidade total encontrada após paginar:
```
[VOL SYNC] Found N service types (after pagination)
```
para confirmar nos logs da Vercel que o Kids está sendo coletado.

### 5. Verificação após deploy

1. Acionar **Sincronizar Planning Center** no `/voluntariado/dashboard`.
2. Conferir resposta: `services` e `volunteersSynced` devem aumentar.
3. Abrir um culto Kids no totem (modo Manual) — voluntários do Kids devem aparecer na lista de escalados.

## Arquivos alterados

- `backend/services/planningCenter.js` — nova função `fetchAllServiceTypes` (e export).
- `backend/routes/voluntariado-sync.js` — usa o helper nas 4 rotas.
- `backend/routes/voluntariado.js` — linha 1810 usa o helper.

## Sem mudanças

- Banco de dados (sem migration).
- Frontend.
- Lógica de processamento por tipo (`processServiceType` continua igual — agora apenas recebe a lista completa).
- Autenticação, RLS, endpoints públicos.

## Risco

Mínimo. A paginação é aditiva: tipos que já vinham continuam vindo; passamos a coletar também os que estavam fora das primeiras 25 entradas. O custo extra são 1-2 requisições HTTP adicionais por sync — desprezível frente ao trabalho que já fazemos por service type.



# Corrigir de vez o sync do Kids no Voluntariado

Vou atacar o problema em dois pontos que ainda podem impedir o Kids de aparecer mesmo depois da paginação dos tipos de culto:

1. o sync ainda busca **poucos planos por tipo de culto**;
2. o backend pode estar tentando gravar escalas com uma `onConflict` que **depende de uma constraint nova no banco**, e se esse SQL manual não tiver sido aplicado, os schedules do Kids continuam falhando silenciosamente.

## O que será ajustado

### 1. Buscar todos os planos relevantes do service type Kids
Hoje `fetchAllPlans()` em `backend/services/planningCenter.js` ainda está limitado a:

- `future&per_page=5`
- `past&per_page=3`

Isso é pouco para um service type movimentado como Kids.

Vou substituir por uma versão paginada por janela de datas, por exemplo:
- próximos 30-60 dias
- últimos 7 dias

Assim o sync deixa de depender de “só os 5 próximos” e passa a trazer todos os cultos Kids do período operacional real.

### 2. Tornar o upsert de schedules compatível com banco antigo e banco novo
Hoje o código usa:

```js
onConflict: 'service_id,planning_center_person_id,team_name,position_name'
```

Mas no repositório a migration antiga ainda mostra índices/constraints diferentes para `vol_schedules`. Se o SQL manual da constraint nova não foi aplicado no banco real, o upsert falha e as escalas não entram.

Vou implementar um helper de persistência no sync com esta lógica:

- primeiro tenta o modo novo:  
  `(service_id, planning_center_person_id, team_name, position_name)`
- se o banco não suportar essa constraint, faz fallback seguro para o modo legado:  
  `(service_id, planning_center_person_id)`

Resultado:
- o sync volta a gravar escalas do Kids imediatamente;
- quando a constraint nova existir, continua suportando múltiplas posições/equipes por pessoa.

### 3. Melhorar o log por tipo de culto no sync
Vou adicionar logs claros por `service type`, incluindo:

- nome do tipo (`Kids`, etc.)
- quantidade de planos encontrados
- quantidade de team members retornados pelo Planning Center
- quantidade de schedules gravados com sucesso
- quantidade de falhas de persistência

Isso evita continuar “no escuro” se o Planning Center estiver trazendo dados mas o banco não estiver aceitando.

### 4. Expor diagnóstico útil para conferir o Kids
No endpoint de diagnóstico do sync, vou enriquecer a resposta para mostrar por tipo de culto:

- total de planos futuros
- total de equipes
- amostra de membros
- status do sync desse tipo

Assim fica fácil validar se o problema é:
- o Kids não veio do Planning Center;
- o Kids veio, mas sem membros;
- ou veio tudo e falhou só na gravação.

## Arquivos que serão alterados

- `backend/services/planningCenter.js`
  - paginar planos relevantes por tipo de culto
  - criar helper de upsert compatível
  - melhorar logs do sync

- `backend/routes/voluntariado-sync.js`
  - usar a nova coleta paginada
  - retornar diagnóstico mais explícito por service type

## SQL manual que vou entregar junto
Como você já pediu esse padrão no projeto, vou te devolver também o SQL manual consolidado para o banco real, deixando a constraint ideal de `vol_schedules` pronta para o modo “uma linha por equipe/posição”.

A implementação ficará tolerante mesmo antes desse SQL, mas o SQL continua sendo o estado correto/final.

## Resultado esperado
Depois disso, o fluxo correto será:

1. backend sincroniza todos os planos relevantes do Kids;
2. grava as escalas mesmo se o banco ainda estiver com a constraint antiga;
3. o Kids passa a aparecer na lista de escalados do sistema;
4. com o SQL novo aplicado, continua funcionando também para casos com múltiplas posições da mesma pessoa.

## Sem mudanças
- UI do totem
- check-in manual/facial/QR
- relatórios
- autenticação

## Validação após implementar
Depois do deploy, a checagem será:

1. clicar em **Sincronizar** no dashboard do voluntariado;
2. confirmar no retorno/log que o `service type` Kids foi processado;
3. abrir um culto Kids e verificar se os escalados aparecem;
4. conferir que os check-ins continuam entrando normalmente.

## Observação técnica importante
No contexto atual, o backend do voluntariado não está refletido nas tabelas disponíveis do banco conectado ao Lovable Cloud, então a correção precisa ser tratada no código do backend e com o SQL manual do banco real usado por esse módulo.

# Esboço · Projeto de cargos × permissões (pra revisar com a Juliana)

> Status: **ESBOÇO pra discussão.** Nada implementado. Decisão de seguir é do Marcos + Juliana (RH).
> Pré-requisito já entregue: o **núcleo de precedência** (override soberano · PR do "núcleo"),
> que torna esta migração segura — ver `[[menu-visibilidade-espelha-rotas]]` / `permissoes-grade-por-modulo`.

## Objetivo

Chegar em **"RH põe a pessoa no cargo → o acesso já sai certo"**, com o **mínimo de camadas**:

- **Acesso base = o CARGO** (a matriz cargo × módulo).
- **Exceção = override por pessoa** (raro, vence a base).
- **Aposentar a camada "área"** como alavanca de acesso.

## Por que aposentar a "área"

Hoje existe um cargo genérico (`lider-ministerial`) e a **área** diz de qual módulo a pessoa é admin
(boost automático pra nível 5). Isso cria uma 3ª camada que:

- **Confunde** ("qual vence: cargo, área ou módulo?").
- Está **hardcoded em 3 lugares** que precisam ser mantidos em sincronia na mão
  (`backend/middleware/auth.js` → `AREA_MODULO_BOOST`; `src/lib/menuAccess.ts`; e a função SQL
  `current_user_module_level`, usada por **52 policies de RLS**).
- Sempre concede **5 (admin)** — não dá pra "ter a área só pra ver".

Com cargos específicos, o próprio cargo carrega o nível certo e a área deixa de ser necessária.

## Modelo-alvo (2 camadas)

```
Acesso = CARGO (base)  +  OVERRIDE (exceção, vence)
         (sem boost por área)
```

## Proposta de cargos específicos

Trocar o genérico `lider-ministerial` (+ área) por cargos que já carregam o acesso:

| Área hoje (boost) | Cargo específico proposto | Líder atual (confirmar) |
|---|---|---|
| Integração | `lider-integracao` | (levantar) |
| Cuidados | `lider-cuidados` | Marcelo? (ver multi-área abaixo) |
| Grupos | `lider-grupos` | Nélio / Natasha? |
| Voluntariado | `lider-voluntariado` | (levantar) |
| Next | `lider-next` | (levantar) |
| Online | `lider-online` | Renata |
| Kids | `lider-kids` | Mariane |
| AMI | `lider-ami` | Arthur Cecconi |
| Bridge | `lider-bridge` | Lillian |

**Já são cargos específicos** (mas hoje ainda dependem do boost por área pra chegar a 5):
`coordenador-marketing`, `assistente-marketing`, `lider-producao`, `assistente-producao`.
→ a matriz deles precisa **carregar o nível direto** (ex.: `coordenador-marketing × marketing = 5`)
pra o boost poder ser retirado.

## O porém (decisão necessária): quem lidera mais de uma área

Hoje a pessoa tem **um** `cargo_id` só. O modelo "1 cargo + N áreas" existe justamente porque
alguém pode cobrir **mais de uma** área. Ex.: **Marcelo (`supervisor-jornada`)** acompanha **todas**
as áreas da jornada. Para esses casos, ou:
- (a) um **cargo que cobre os módulos necessários** (já é o caso do `supervisor-jornada` — funciona
  sem área), ou
- (b) manter a **área só para os poucos casos cross-área**, retirando o boost dos demais.

**Decidir com a Juliana qual caminho** (a maioria dos líderes é de 1 área só → cargo específico resolve).

## Plano faseado (cada passo reversível e verificável)

1. **Definir a estrutura de cargos com a Juliana** (nome, nível por módulo, expectativas/PDI por cargo).
2. **Migration aditiva**: criar os cargos específicos + seed da matriz (cada cargo já com o nível certo,
   sem depender do boost). Não mexe em ninguém ainda.
3. **Migrar pessoas**: trocar `usuarios.cargo_id` do genérico → específico (em lote por área).
   Bust de cache + logout/login dos afetados.
4. **Conferir** com `/api/permissoes/diagnostico/:email` que o acesso ficou igual (ou melhor) pra cada
   pessoa migrada.
5. **Retirar o boost** só depois que todos os boostados estiverem em cargos que cobrem o acesso:
   remover `AREA_MODULO_BOOST` (auth.js), a lista em `current_user_module_level` (migration) e a cópia
   em `menuAccess.ts`. (Manter a área só p/ cross-área, se a decisão for (b).)
6. **As 52 RLS não mudam** — elas chamam `current_user_module_level`, que continua existindo; só perde
   o ramo do boost quando todos já estão cobertos pelo cargo.

## Risco / cuidado

- Enquanto o boost existir, tudo continua funcionando (passo 5 é o único que tira acesso "via área").
- Cargos específicos **não** substituem o núcleo de precedência — eles **dependem** dele pra a migração
  ser segura (com a regra antiga, "área vencia override" e a migração ficaria imprevisível).

## Levantar o mapa atual (rodar no SQL Editor)

Quem está em cada área hoje (pra planejar a migração de cargo):

```sql
SELECT a.nome AS area, u.nome, u.email, c.slug AS cargo_atual
FROM usuario_areas ua
JOIN areas a      ON a.id = ua.area_id
JOIN usuarios u   ON u.id = ua.usuario_id
LEFT JOIN cargos c ON c.id = u.cargo_id
WHERE u.ativo = true
ORDER BY a.nome, u.nome;
```

## O que decidir com a Juliana

1. A **lista de cargos** (a estrutura dela de cargos/expectativas/PDI deve guiar isso).
2. Como tratar **multi-área** (cargo que cobre vs manter área só pros cross-área).
3. **Nomenclatura** dos cargos (alinhar com o organograma do RH).

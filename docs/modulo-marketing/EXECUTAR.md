# Como iniciar a implementação (em nova sessão)

> **Cole o texto abaixo numa sessão nova do Claude Code (dentro do repo
> `SISTEMA_INTEGRADO_CBRIO`)** que ele já entende o contexto inteiro e começa a
> rodar as 15 specs.

---

## Texto pra colar

```
Quero começar a implementar o módulo de Marketing no CBRio usando o método
spec-driven que documentamos em sessão anterior. Todo o material está pronto em
`docs/modulo-marketing/` neste repo:

- `00-metodo-spec-driven-adaptado.md` — método adaptado pra módulo interno (índice de docs no final)
- `decisoes-em-aberto.md` — 14 decisões + 6 pendências, TODAS fechadas (D-08 reservada pra Fase 11)
- `arquitetura-emergente.md` — schema, fluxos, permissões, KPIs, contexto operacional
- `02-prd.md` — PRD com 14 features must-have, personas, métricas
- `03-design-ux.md` — 7 fluxos + 7 telas + componentes novos (design system herdado do CBRio)
- `04-adrs.md` — 12 ADRs (ancorados em líderes de mercado: Float, Runn, Workfront, Wrike, Kanban flow metrics)
- `05-modelagem-dados.md` — schema SQL completo (D-13 e D-14 fechadas aqui)
- `06-seguranca-autorizacao.md` — RLS por tabela, LGPD-lite, audit log
- `07-decomposicao-specs.md` — **15 specs detalhadas** com escopo, arquivos afetados e critérios (este é o guia de execução)

Sua memória `project_modulo_marketing.md` também tem contexto resumido.

**Antes de qualquer coisa, leia esses docs nessa ordem:**
1. `07-decomposicao-specs.md` (entende a sequência das 15 specs)
2. `arquitetura-emergente.md` (entende o desenho técnico)
3. `05-modelagem-dados.md` (entende o schema)
4. CLAUDE.md do repo (regras de segurança absolutas + workflow do projeto)

**Pre-flight checks (ANTES de qualquer migration ou código):**
1. Liste `DISTINCT profile.area` no banco Supabase e me mostre o resultado — vamos
   mapear cada valor a uma das 3 diretorias (Gestão→Eduardo Gnisci / Criativo→Pedro
   Menezes / Ministerial→Arthur Serpa).
2. Verifique se Allan, Aline, Cauã, Lorena Pariz e Letícia já existem em
   `rh_funcionarios` + `profiles` (matching por nome ou email). Me liste quem existe
   e quem precisa ser criado.
3. Confirme branch: crie `marcos-marketing` a partir da `main`. A branch atual
   `claude/whatsapp-agente-ia` tem trabalho não commitado do bot que NÃO deve entrar
   aqui — pergunte o que fazer com ele antes de criar a branch nova.

**Regras de execução (aplicam a todas as 15 specs):**
- 1 spec = 1 branch + 1 PR + 1 merge (workflow padrão do CBRio).
- Toda spec com migration: COLE o SQL completo na conversa e aguarde minha
  confirmação de que apliquei no Supabase de produção antes do merge.
- CLAUDE.md atualizado a cada commit (feedback persistente meu).
- Audit log, RLS contextual e UUID FKs são lei (ver CLAUDE.md "Regras Obrigatórias
  de Segurança").
- **Spec 001 é a ÚNICA TRANSVERSAL** — mexe no backbone do Solicitações, afeta
  TODAS as áreas (cozinha, manutenção, financeiro, etc), não só Marketing. Atenção
  redobrada e testes em pelo menos 2 áreas existentes antes do merge.
- Specs 002-015 são autônomas (deploy autônomo autorizado).

**Após cada spec:** atualize o CLAUDE.md com o que mudou e me mande resumo curto.

Vamos passar pelas 15 specs uma de cada vez, na ordem do `07-decomposicao-specs.md §2`.
Pode começar pelos pre-flight checks.
```

---

## Notas pra você (Marcos)

- O texto acima é self-contained. Não depende de nenhuma sessão anterior — o
  Claude Code lê os docs deste mesmo repo e a memory do seu profile.
- Cole exatamente como está. Markdown ele lê.
- Se quiser **rodar todas as specs sem te perguntar entre cada uma**, troque a
  última linha por:
  > *"Pode começar pelos pre-flight checks E seguir direto pelas 15 specs em
  > sequência, só me chamando se tiver bloqueio real (migration nova pra eu
  > aplicar, schema destrutivo, mudança de auth, decisão ambígua)."*
- Pra rodar **só a spec 001** primeiro e parar pra você revisar, troque pra:
  > *"Pode começar pelos pre-flight checks e depois SÓ A SPEC 001. Pare após o
  > merge dela pra eu revisar antes das próximas."*

# Operação do funil de pessoas — quem faz o quê

> Mapa de alinhamento (Marcos · 2026-06-16). Cada "esteira" que construímos só
> tem utilidade prática se tem **(a) guarda técnica na porta** (não duplica) e
> **(b) um dono real com tarefa e cadência** (alguém zera a fila). Este doc é a
> fonte de verdade do **quem faz o quê**. Onde estiver **🔴 (confirmar)**, é
> decisão sua / da Juliana (RH).
>
> Como ler: a coluna **Cargo** é o papel na matriz cargo×módulo (quem *vê* o
> módulo). A coluna **Pessoa** é quem hoje ocupa esse papel. A **Cadência** é o
> compromisso operacional (o que falta hoje: está tácito, não escrito).

## A cadeia (o que o sistema executa)

```
decisão no culto ─▶ vira mem_membros + cui_convertidos (automático, por trigger)
   │                        │
   │ (check de identidade)  ▼
   ▼                 Cuidados: 1º contato (≤3d) ─▶ encontro ─▶ desfecho
 Next-Batismo               │                                    │
 (Kevyn dedup)              ▼                                     ▼
   │            jornada_encaminhamentos ───────────────▶ caixa da área
   │                 (Grupos / Voluntários / Jornada180)   "engajou" = vínculo real
   ▼                                                        (conta na NSM)
 NEXT (inscrição) ─grupo/servir─▶ mesma caixa (Fase 2)
 batismo realizado ─▶ trilha 'batismo' + membro_ativo (automático)
```

## Tabela de operação — 1 linha por tarefa viva

| # | Processo / tarefa | Módulo · tela | Cargo (dono) | Pessoa real | Cadência | O que mede |
|---|---|---|---|---|---|---|
| 1 | Lançar decisões do culto (nome + telefone das pessoas que decidiram) | Integração › Decisões/Pessoas | líder de Integração | **Lorena** | todo culto | nº decisões · % com pessoa cadastrada |
| 2 | **Check de pessoas** (resolver duplicata, ligar inscrição sem vínculo, fundir cadastros) | Next - Batismo | operador da fila | **Kevyn** | após cada culto / diária | fila de duplicatas + "sem vínculo" zerada |
| 3 | 1º contato pastoral do convertido (meta ≤ 3 dias) | Cuidados › Próximos passos | líder da área de culto | AMI **Arthur** · Bridge **Lillian** · Online **Renata** · Sede **Marcelo** | ≤ 3 dias após a decisão | % contato no prazo |
| 4 | Supervisão / cobrança da jornada (quem não fez o contato) | Cuidados / painel NSM | supervisor-jornada | **Marcelo** | diária | convertidos atrasados (>3d) |
| 5 | Encontro pastoral + desfecho (encaminha pra grupo/voluntário/jornada180) | Cuidados › Próximos passos | líder da área / pastoral | (mesmo do #3) | por encontro | % com desfecho + ≥1 encaminhamento |
| 6 | Receber encaminhado → **Grupos**, contatar e registrar devolutiva | Grupos › Encaminhados | dono de Grupos | **Nélio / Natasha** | semanal | % que engajou (entrou em grupo) |
| 7 | Receber encaminhado → **Voluntários**, contatar e registrar devolutiva | Voluntariado › Encaminhados | dona de Voluntários | **Jéssica Salviano** | semanal | % que engajou (virou voluntário) |
| 8 | Receber encaminhado → **Jornada 180** | Cuidados › Jornada 180 | pastoral / cuidados | **Marcelo** | semanal | % que engajou |
| 9 | Aprovar pedido de grupo (promove cadastro → membro) | Grupos › Pedidos | dono de Grupos | **Nélio / Natasha** | conforme chega | 0 duplicatas promovidas |
| 10 | Promover/curar cadastro de membresia + revisar duplicados | Membresia › Duplicados | dono de Membresia | **Matheus / Marcelo** | semanal | pares de duplicata pendentes |
| 11 | Batismo: marcar "realizado" (fecha o ciclo · vira membro ativo) | Integração › Batismos | líder de Integração | **Lorena** | por turma de batismo | nº batismos · tempo decisão→batismo |

## Guarda nas portas (dedup técnico) — estado por entrada

| Porta (onde pessoa é criada) | Responsável do gate | Passa pelo matcher? | Status |
|---|---|---|---|
| Next — inscrição pública | Integração (**Lorena**) | ✅ `acharOuCriar` | ok |
| Voluntariado — inscrição pública | Voluntários (**Jéssica**) | ✅ `acharOuCriar` | ok |
| **Grupos — aprovar pedido** | Grupos (**Nélio / Natasha**) | ✅ `acharOuCriarGuardado` + `duplicado_de_id` | corrigido (PR #1081) |
| **Voluntariado — completar perfil** | Voluntários (**Jéssica**) | ✅ `acharOuCriarGuardado` | corrigido (PR #1081) |
| Next - Batismo — reconciliação | **Kevyn** | ✅ `acharOuCriar` | ok |
| Membresia — cadastro público | Membresia (**Matheus / Marcelo**) | ✅ detecta `duplicado_de_id` | ok |
| **Totem Kids — check-in (responsável)** | Kids (**Mariane Gaia / Milena Rochet**) | ✅ `acharOuCriarGuardado` (3 pontos) | **corrigido (Fase 3b)** |
| Ofertar / contribuições | Financeiro | — não cria pessoa (casa por `membro_id`) | sem furo · só auditar import |
| Decisão online · devocional · batismo público | Integração | — não cria pessoa solta | ok |

**Política da guarda (vale pra toda porta):** CPF exato → liga · e-mail exato →
liga · telefone **+ nome batendo** → liga · senão **cria** (e a colisão de
telefone/nome cai na fila do Kevyn / aba Duplicados). **Nunca** liga por
telefone/e-mail sozinho — família compartilha, e juntar duas pessoas distintas
é pior que duplicar. Prevenção automática + revisão humana são parceiros.

## Decisões

✅ **Donos confirmados (Marcos · 2026-06-17):** Voluntários → **Jéssica Salviano** ·
Kids (gate do Totem) → **Mariane Gaia / Milena Rochet** · demais já no mapa.

**Abertas → viram o projeto de RH (depois):**
1. **Backup de cada dono** (ex.: quem zera a fila do Kevyn / da área quando o
   dono entra de férias/licença) → feature **Cobertura de férias/licença**: o RH
   escolhe um substituto que herda as atribuições + permissões temporariamente e
   reverte no retorno (reusa `permissoes_modulo.expira_em` + `rh_ferias_licencas`).
2. **Cadência escrita** — transformar as cadências de tácitas em compromisso de
   cargo. Encaixa no projeto **cargos + expectativas (RH/Juliana)**: cada cargo
   carrega "minhas telas + minhas tarefas + minha cadência".

## Próximo passo

✅ **Fase 3b feita** — Totem Kids roteado pela `acharOuCriarGuardado` (toda porta
tem guarda agora · o resíduo cai na fila do Kevyn / aba Duplicados). Próximo:
**Cobertura de férias/licença** no RH (backup de cada dono).

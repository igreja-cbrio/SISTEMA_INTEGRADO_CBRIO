# Módulo Marketing — Design e UX (Fase 4)

> **Status:** v1.0 · 2026-05-28
> **Pré-requisito:** PRD aprovado (`02-prd.md`)
> **Próxima fase:** Fase 5 — ADRs (`04-adrs.md`)

---

## 1. Identidade visual · HERDADA do CBRio

Nada novo de brand. Reusar do sistema:

- **Cor primária:** `#00B39D` (constante `C.primary` / `C.primaryBg`).
- **Variáveis CSS:** `--cbrio-bg` · `--cbrio-card` · `--cbrio-text` · `--cbrio-border` · `--cbrio-input-bg` · `--cbrio-modal-bg` · `--cbrio-overlay` · `--cbrio-table-header`.
- **Componentes:** shadcn/ui já instalado — reusar antes de criar.
- **Tipografia, sombras, bordas:** herdadas do tema atual.
- **Tom de voz:** consistente com o resto do sistema (PT-BR · direto · sem emoji em código).

**Foco do design:** fluxos + telas novas + componentes específicos do módulo.

---

## 2. Fluxos críticos

### 2.1 Submeter solicitação (qualquer funcionário · em `/solicitacoes/nova`)

```
1. Acessa /solicitacoes/nova
2. Escolhe área alvo: Marketing
3. Aparece bloco específico do Marketing:
   ├── etiqueta TIPO (Artes/Vídeos/etc) → habilidade padrão pré-sugerida
   └── etiqueta DESTINO (Interno/Externo/etc)
4. Descreve briefing + anexa material de referência
5. Define data necessária
6. Marca urgente? (sim/não)
7. ESTIMATIVA PRELIMINAR aparece live ("~5 dias úteis · estimativa preliminar")
8. Submit → vai pra aprovação do diretor de origem
9. Toast: "Sua solicitação foi enviada · aguardando aprovação do <diretor>"
```

### 2.2 Aprovar solicitação (diretor de origem · em `/solicitacoes?aba=aprovar`)

```
1. Acessa aba "Aprovar" (badge com contador)
2. Lista de pendências do setor
3. Click → detalhe
4. Botões: [Aprovar] · [Rejeitar com motivo]
5a. Aprovar → vai pra fila da área alvo · solicitante + Pedro notificados
5b. Rejeitar → modal pede motivo (obrigatório) → status imutável · solicitante notificado
```

### 2.3 Pedro recebe e atribui (em `/marketing`)

```
1. Acessa /marketing
2. Vê novo card na coluna "Fila" (Kanban)
3. Click no card → painel lateral abre
4. Vê briefing + etiquetas + estimativa preliminar
5. Atribui (sugestão automática pela habilidade da etiqueta tipo)
6. Confirma ou ajusta prazo → vira prazo_confirmado
7. Se urgente: dois botões adicionais:
   ├── [Aceitar urgência] → raia rápida (prioridade alta)
   └── [Recusar com motivo] → motivo obrigatório · segue fluxo normal
8. Save → solicitante notificado · card vai pra "Em produção" (ou fica em fila aguardando produtor mover)
```

### 2.4 Produtor trabalha (em `/marketing`, visão filtrada)

```
1. Acessa /marketing
2. Vê SÓ cards atribuídos a ele · agrupados por dia da semana
3. Move card "Fila" → "Em produção" (timestamp do cycle time)
4. Produz
5. Move pra "Aguardando solicitante" + adiciona preview (link ou imagem)
6. Solicitante notificado
```

### 2.5 Solicitante revisa (em `/solicitacoes?aba=minhas`)

```
1. Acessa aba "Minhas"
2. Vê card com badge "Aguardando sua revisão"
3. Preview embarcado
4. Dois botões:
   ├── [Aprovar entrega] → status='concluído' · responsável anexa arquivo final
   └── [Sugerir revisão (1x)] → motivo obrigatório · card vai pro FIM da fila · botão some
5. Após aprovar → modal de NPS (0-10 + comentário opcional)
```

### 2.6 Entrega final (responsável anexa via SharePoint)

```
1. Solicitação em estado 'concluído'
2. Botão "Anexar entregável"
3. File picker → upload via Graph API → SharePoint biblioteca correspondente
4. Toast verde · arquivo aparece pro solicitante baixar
```

### 2.7 Pedro cria task interna (em `/marketing`, fora do Solicitações)

```
1. Acessa /marketing
2. Botão "+ Nova task interna" (visível só pro coordenador)
3. Formulário enxuto:
   ├── Título (obrigatório)
   ├── Descrição (opcional)
   ├── Etiqueta tipo (opcional)
   ├── Etiqueta destino (opcional)
   ├── Atribuir a (opcional)
   └── Prazo (opcional)
4. Save → card nasce no Kanban com origem='interna' · sem SLA contratual
```

---

## 3. Inventário de telas

| Rota | Propósito | Acesso |
|---|---|---|
| `/marketing` | Kanban + filtros (origem · etiqueta · atribuído) · botão "+ Nova task interna" | Pedro=5 · equipe=3 escopo próprio |
| `/marketing/calendario` | Calendário de capacidade (semana atual · navegação ± semanas) | Pedro=5 · equipe=3 escopo próprio |
| `/marketing/admin` | CRUD: membros · etiquetas (tipo/destino) · recorrentes · capacidade overrides | Pedro=5 · super-admins |
| `/marketing/analytics` | KPIs do módulo + dashboards (% no prazo · lead time · demanda × capacidade) | Pedro=5 · diretoria=1 read |
| `/solicitacoes/nova` | Form padrão + bloco Marketing (etiquetas + estimativa live) quando área = Marketing | Qualquer funcionário |
| `/solicitacoes?aba=aprovar` | Pendências de aprovação do diretor de origem · badge contador | 3 diretores + super-admins |
| `/solicitacoes?aba=minhas` | Minhas solicitações · status · download · sugerir revisão · NPS | Qualquer funcionário |

---

## 4. Telas principais (descrição estruturada)

### 4.1 `/marketing` · Kanban

```
┌─────────────────────────────────────────────────────────────────┐
│  Marketing                       [Calendário] [Admin] [+ Task]  │
├─────────────────────────────────────────────────────────────────┤
│ Filtros: [Origem ▾] [Etiqueta tipo ▾] [Etiqueta destino ▾]      │
│          [Atribuído ▾] [Buscar...]                              │
├──────────────┬──────────────┬─────────────────┬─────────────────┤
│ Fila         │ Em produção  │ Aguardando      │ Concluído       │
│   (8)        │   (3)        │ solicitante (2) │   (5)           │
├──────────────┼──────────────┼─────────────────┼─────────────────┤
│ ┌──────────┐ │ ┌──────────┐ │ ┌─────────────┐ │ ┌─────────────┐ │
│ │ Artes·   │ │ │ Vídeos·  │ │ │ Fotos·      │ │ │ Artes·      │ │
│ │ Interno  │ │ │ Eventos  │ │ │ Camp.       │ │ │ Institucio. │ │
│ │ →Cauã    │ │ │ →Allan   │ │ │ →Aline      │ │ │             │ │
│ │ 📅 12/jun│ │ │ 2h prod  │ │ │ 1d esperand │ │ │ ✓ entregue  │ │
│ │ 🚨URGENTE│ │ │          │ │ │             │ │ │             │ │
│ └──────────┘ │ └──────────┘ │ └─────────────┘ │ └─────────────┘ │
└──────────────┴──────────────┴─────────────────┴─────────────────┘
```

**Estados de card:**
- Loading: skeleton (shadcn).
- Vazio na coluna: "Sem cards nesta coluna." + ícone.
- Erro de carregamento: toast vermelho + botão "Tentar de novo".

### 4.2 `/marketing/calendario` · Visão líder (Pedro)

```
┌────────────────────────────────────────────────────────────────┐
│ ← Semana 25/mai - 31/mai →                          [Hoje]    │
├──────┬──────┬──────┬──────┬──────┬──────┬──────┬───────────────┤
│      │ Seg  │ Ter  │ Qua  │ Qui  │ Sex  │ Sáb  │ Dom           │
├──────┼──────┼──────┼──────┼──────┼──────┼──────┼───────────────┤
│ Allan│      │ 4h   │ 4h📹 │ 2h   │ 6h   │      │               │
│      │livre │livre │ rec. │livre │livre │livre │ livre         │
├──────┼──────┼──────┼──────┼──────┼──────┼──────┼───────────────┤
│ Aline│      │      │      │      │ 3h   │ 6h   │ 6h📷          │
│      │livre │livre │livre │livre │livre │livre │ rec.          │
├──────┼──────┼──────┼──────┼──────┼──────┼──────┼───────────────┤
│Lorena│ 3h📱 │ 3h📱 │ 3h📱 │ 3h📱 │ 3h📱 │ 3h📱 │               │
│      │ rec. │ rec. │ rec. │ rec. │ rec. │ rec. │ livre         │
├──────┼──────┼──────┼──────┼──────┼──────┼──────┼───────────────┤
│ Cauã │ 8h   │ 8h   │ 8h   │ 8h   │ 8h   │      │               │
│      │livre │livre │livre │livre │livre │livre │ livre         │
└──────┴──────┴──────┴──────┴──────┴──────┴──────┴───────────────┘
```

Linhas por pessoa · colunas por dia. Bloquinhos coloridos por etiqueta tipo.
Slots livres em cinza claro com horas restantes. Click no slot livre → abre fila
de cards não-atribuídos pra arrastar. Recorrente em cor sólida com ícone (📹📷📱).

### 4.3 `/marketing/calendario` · Visão colaborador (Cauã)

Mesma estrutura, MAS:
- 1 linha só (a do próprio user).
- Cards atribuídos a ele destacados.
- Cards da fila geral aparecem em cinza read-only (pra contexto de prioridade).
- Sem botões de re-atribuir.

### 4.4 `/marketing/admin` · 4 abas

| Aba | Conteúdo |
|---|---|
| **Membros** | Tabela: nome · habilidade · horas semanais · ativo. Inline edit. |
| **Etiquetas** | Duas sub-abas: Tipo (8 linhas) e Destino (5 linhas). Editar `esforco_medio_h` da tabela tipo. |
| **Recorrentes** | Tabela: membro · dia · hora início · duração · descrição · ativo. + Botão "Novo". |
| **Capacidade overrides** | Tabela: membro · semana · horas · motivo. Para férias/eventos atípicos. |

CRUD simples com confirmação em delete.

### 4.5 `/solicitacoes/nova` · Bloco Marketing (visível quando área = Marketing)

```
┌────────────────────────────────────────────────────────────┐
│ Área alvo: [Marketing ▾]                                   │
├────────────────────────────────────────────────────────────┤
│ Tipo:    [Artes ▾]   Destino: [Interno ▾]                  │
│ ⚙ Sugerido: designer                                       │
├────────────────────────────────────────────────────────────┤
│ Descrição/briefing:                                        │
│ [textarea...]                                              │
├────────────────────────────────────────────────────────────┤
│ Data necessária: [📅 12/06/2026]                           │
│ [ ] Marcar como urgente                                    │
├────────────────────────────────────────────────────────────┤
│ ╔════════════════════════════════════════════════════════╗ │
│ ║ ⏱ Estimativa preliminar: ~5 dias úteis                ║ │
│ ║ (Pedro confirma após aprovação do seu diretor)         ║ │
│ ╚════════════════════════════════════════════════════════╝ │
│                                                            │
│ [Cancelar]                              [Enviar pedido →]  │
└────────────────────────────────────────────────────────────┘
```

### 4.6 `/solicitacoes?aba=aprovar` · Pendências do diretor

Lista com card por solicitação:
- Solicitante (nome + área alvo + setor do solicitante).
- Etiqueta tipo + destino.
- Descrição (preview 2 linhas).
- Data necessária.
- Badge urgente (se aplicável).
- Botões: [Aprovar] · [Rejeitar com motivo].

### 4.7 `/solicitacoes?aba=minhas` · Solicitante acompanha

Card por solicitação com:
- Estado atual (badge colorido).
- Prazo confirmado (ou preliminar se ainda não confirmado).
- Preview embarcado (se aguardando_solicitante).
- Botões contextuais:
  - [Aprovar entrega] (quando aguardando_solicitante).
  - [Sugerir revisão (1x)] (mesmo estado, some após uso).
  - [Baixar entregável] (quando concluído).
- Modal de NPS (após aprovar entrega).

---

## 5. Design system · componentes novos

| Componente | Função |
|---|---|
| `<MarketingKanbanCard />` | Card do Kanban com badges (etiqueta tipo/destino · atribuído · prazo · urgência · revisão pedida) |
| `<MarketingCalendarGrid />` | Grid semanal de capacidade · variantes "líder" e "colaborador" |
| `<EtiquetaSeletor />` | Combo de etiqueta tipo + destino · auto-sugere habilidade |
| `<EstimativaPreliminarBadge />` | Badge live no intake com cálculo em tempo real |
| `<RecorrenteSlotEditor />` | Editor visual de slot recorrente (admin) |
| `<RevisaoSugerirButton />` | Botão "Sugerir revisão (1x)" que desaparece após uso |
| `<AprovacaoOrigemPanel />` | Painel do diretor de origem com botões aprovar/rejeitar |

---

## 6. Padrões UX recorrentes

| Padrão | Implementação |
|---|---|
| Loading | Skeleton (shadcn) |
| Vazio | Frase amigável + ícone Lucide |
| Erro | Toast vermelho + opção de retry |
| Sucesso | Toast verde sutil |
| Ação destrutiva | Dialog de confirmação (reject de solicitação · delete de membro) |
| Mudança de estado | Toast informativo + animação sutil do card |
| Notificação chegando | Badge contador no menu + bell topbar |

---

## 7. Acessibilidade

- Contraste WCAG AA (herdado).
- Kanban e calendário **keyboard-navegáveis**: Tab + Enter + setas + Esc.
- `aria-label` nos botões críticos (aprovar · rejeitar · revisar · atribuir).
- Estado do card legível por leitor de tela via `aria-live` no toast de mudança.
- Tamanhos mínimos de toque (44px) no mobile.
- Foco visível em todos os elementos interativos.

---

## 8. Validação

- [x] Fluxos críticos mapeados ponta-a-ponta (7 fluxos)
- [x] Estados de erro/vazio/loading considerados
- [x] Design system reusa o do CBRio (zero novo brand)
- [x] Mobile e desktop pensados
- [x] Acessibilidade considerada
- [x] Inventário de telas + componentes novos completo
- [ ] Aprovado pra Fase 5

Marcos aprova esta versão em: ___ (data)

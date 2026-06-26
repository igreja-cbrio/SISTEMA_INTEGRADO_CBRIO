---
name: Sistema Integrado CBRio
description: ERP ministerial — tema "vidro / command center", acento teal, denso mas legível.
colors:
  primary: "#00B39D"
  primary-deep: "#009d8a"
  mint: "#3fe3c6"
  bg-dark: "#0a0a0a"
  surface-dark: "#161616"
  ink-dark: "#e5e5e5"
  ink2-dark: "#a3a3a3"
  ink3-dark: "#8b969d"
  border-dark: "#262626"
  bg-light: "#f5f5f5"
  surface-light: "#ffffff"
  ink-light: "#171717"
  ink2-light: "#404040"
  ink3-light: "#737373"
  border-light: "#e5e5e5"
  success: "#10b981"
  warning: "#f59e0b"
  danger: "#ef4444"
  info: "#3b82f6"
  violet: "#8b5cf6"
typography:
  display:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "26px"
    fontWeight: 800
    lineHeight: 1.08
    letterSpacing: "-0.025em"
  heading:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  metric:
    fontFamily: "Inter, sans-serif"
    fontSize: "28px"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  label:
    fontFamily: "Inter, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.06em"
rounded:
  sm: "8px"
  md: "16px"
  lg: "18px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.primary-deep}"
    textColor: "#ffffff"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.ink-light}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
  card:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.ink-dark}"
    rounded: "{rounded.md}"
    padding: "16px"
  stat-card:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.ink-dark}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
  module-header-icon:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary}"
    rounded: "14px"
    size: "46px"
---

# Design

## Overview

ERP ministerial interno da CBRio. O sistema **serve o produto** (register: product): a meta é clareza, hierarquia e velocidade de leitura em sessões longas de trabalho, não espetáculo. O visual é o tema **"vidro / command center"** (glass): superfícies translúcidas com desfoque sobre um fundo ambiente com glows teal, acento único `#00B39D`, e uma **regra de ouro** — **dado denso (tabela, gráfico, formulário) fica nítido**; só painéis/cards de resumo recebem o vidro.

Dois temas, paridade total: **escuro** (padrão, `:root`) e **claro** (`[data-theme="light"]`). Toda cor/elevação tem as duas versões via tokens CSS — nunca hardcodar cor de tema. O charme do **gradiente lúdico é exclusivo do módulo Kids**; o resto do sistema é sóbrio.

Referências de qualidade: Linear, Vercel, Stripe, Raycast. Anti‑referências: planilha sem vida, corporativo‑frio (SAP), startup genérica, infantil/colorido demais.

## Colors

Acento único de marca: **teal `#00B39D`** (`--teal` / `C.primary`), usado para ação, estado positivo e foco — **um acento por tela**. `mint #3fe3c6` é o realce/gradiente do acento.

Neutros por tema (tokens, não hex solto):
- **Escuro**: fundo `#0a0a0a`, superfície `#161616`, texto `#e5e5e5` → `#a3a3a3` → `#8b969d` (3 níveis), borda `#262626`.
- **Claro**: fundo `#f5f5f5`, superfície `#ffffff`, texto `#171717` → `#404040` → `#737373`, borda `#e5e5e5`.

Semânticas (mesmas nos dois temas, ajustar tom no claro): sucesso `#10b981`, atenção `#f59e0b`, perigo `#ef4444`, info `#3b82f6`, violeta `#8b5cf6` (Next). **Status nunca depende só de cor** — sempre com ícone e/ou label (daltonismo + leitura rápida).

Contraste: corpo ≥ 4.5:1, texto grande ≥ 3:1, placeholder no mesmo nível do corpo. Nada de cinza claro "pra elegância" sobre fundo claro.

## Typography

Família única: **Inter** (300–800), com `-apple-system` no fallback. Sem pareamento de fontes — contraste vem do **peso e do tamanho**, não de uma 2ª família.

Escala (use com disciplina, um nível por papel):
- **Display / título de página** — 26px / 800 / `-0.025em` / `line-height 1.08` (componente `ModuleHeader`).
- **Subtítulo de seção** — 15px / 700.
- **Corpo** — 14px / 400 / `line-height 1.5`; linha ≤ 65–75ch em prosa.
- **Métrica/número** — 24–28px / 800, sempre **`tabular-nums`** (alinha colunas de números).
- **Label/eyebrow** — 11px / 600 / `letter-spacing 0.06em` / maiúsculas, na cor `ink3`.

`text-wrap: balance` em h1–h3. Letter‑spacing de display nunca abaixo de `-0.04em`.

## Elevation

A elevação é o coração do tema vidro — vive em tokens, não em classes soltas:

- **`.glass-surface`** (base do `<Card>`): `background: var(--panel)` (escuro `rgba(22,30,36,.72)` · claro `rgba(255,255,255,.82)`) + `backdrop-filter: blur(14px) saturate(140%)` + borda `--hairline` + `box-shadow: var(--shadow), var(--hi)`. Raio **16px**.
- **`.glass-solid`**: variante **nítida** (sem blur, fundo `--cbrio-card`) — aplicada **automaticamente** via `:has(table|.recharts-wrapper)` a cards de dado denso. É a regra de ouro.
- Sombras: `--shadow` (repouso) → `--shadow-hover`. Hover sobe o card (`translateY(-3px)`, utilitário `.lift`).
- Glows ambiente no `body` (`--app-bg`, `background-attachment: fixed`) dão profundidade pro vidro desfocar.
- **Acessibilidade**: `prefers-reduced-transparency` → sólido; `prefers-reduced-motion` → sem hover/animação.
- Scopes de vidro mais fortes existem por tela (`.cbrio-glass-scope` no Financeiro, `.glass-dash` no Dashboard Semanal) — sempre theme‑aware e com carve‑out de dado denso.

## Components

- **Header de módulo** (`ModuleHeader`): ícone em **chip colorido** (46px, raio 14px, fundo = acento a 16%) + título display + subtítulo `ink3` + ações à direita. É o cabeçalho padrão de toda página.
- **Card / painel**: `glass-surface`, raio 16px, padding 16px. Card aninhado não repete o blur.
- **Stat card**: ícone em chip + métrica grande `tabular-nums` + label eyebrow + delta colorido (com ícone ↑/↓, não só cor).
- **Botão**: primário = fundo teal, texto branco, raio 8px; outline = borda + transparente; pill nos filtros/segmentos. Estados de foco visíveis.
- **Tabs**: trigger ativo com underline/acento teal + peso 700; quebram em 2 linhas no mobile (não rolam na horizontal).
- **Inputs/Select**: fundo `--surface`, borda `--hairline`, foco com ring teal. Popovers/dropdowns/dialogs ficam **sólidos** de propósito (legibilidade).
- **Gráficos (recharts)**: grade `--hairline`, texto `--cbrio-text3`, tooltip de vidro, gradientes via `ChartGradients`. Toda cor passada a `gradFill()` precisa estar no array `colors` do chart.

## Do's and Don'ts

**Do**
- Um acento (teal) por tela; neutros fazem o trabalho pesado.
- Hierarquia por peso/tamanho, com bastante respiro entre seções (grid 4/8px).
- Dado denso nítido (`glass-solid`); vidro só em resumo/painel.
- Status com ícone + label além da cor; números com `tabular-nums`.
- Sempre as duas versões de tema via token; testar contraste no claro.
- Estados vazios como convite (ícone + ação + 1 linha de contexto), não só "nada aqui".

**Don't**
- Não envidraçar tabela/gráfico/formulário (vira ilegível).
- Não hardcodar cor de tema nem forçar escuro no modo claro.
- Não pintar tudo de teal; não usar cinza claro de baixo contraste pra "elegância".
- Não pareiar duas fontes parecidas; não apertar display abaixo de `-0.04em`.
- Não espalhar o gradiente lúdico fora do Kids.
- Não criar header/card/tab fora do padrão — reusar `ModuleHeader` e `glass-surface`.

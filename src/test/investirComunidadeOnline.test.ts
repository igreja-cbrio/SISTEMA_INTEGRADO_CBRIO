// A comunidade do Online entra em Investir como PARCELA, nunca somada.
//
// ⚠️⚠️ O que este arquivo protege, em ordem de dano:
//   1. ⚠️⚠️ alguém "simplificar" somando a comunidade dentro de `investir_deus`.
//      Medido em 02/09/2026: o devocional foi de 2 para 14 pessoas de julho
//      para agosto (7×). Com a comunidade na casa das centenas, a soma faria
//      (800+14) contra (800+2) mover a mandala **0,15%** — o salto que a
//      equipe conquistou ficaria invisível. E soma ESTOQUE (comunidade, só
//      sobe) com FLUXO (devocional, zera todo mês);
//   2. ⚠️⚠️ o `POST /kpis/cultura/mensal` voltar a montar o payload INTEIRO.
//      Ele fazia isso, e a primeira tela que salvasse um campo só apagaria
//      frequência presencial, frequência online, decisões e grupos daquele
//      mês — a tabela tem 1 linha por mês. Nunca tinha explodido porque
//      NENHUMA tela chamava o endpoint (os valores foram postos por SQL);
//   3. "não informado" virar 0 — comunidade vazia é afirmação diferente.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(__dirname, '..', '..');
const semComentarios = (src: string) => src
  .split('\n')
  .map((l) => l.replace(/(^|[^:])\/\/[^\n]*/, '$1'))
  .join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '');

const kpisJs = () => semComentarios(readFileSync(join(RAIZ, 'backend', 'routes', 'kpis.js'), 'utf8'));

describe('⚠️⚠️ a comunidade NUNCA é somada ao devocional', () => {
  it('o endpoint devolve a parcela em campo PRÓPRIO', () => {
    expect(kpisJs()).toMatch(/investir_comunidade_online:\s*cm\?\.investir_comunidade_online\s*\?\?\s*null/);
  });

  it('⚠️⚠️ `investir_deus` continua sendo SÓ o devocional', () => {
    const src = kpisJs();
    // A linha que publica investir_deus não pode citar a comunidade.
    const linha = src.split('\n').find((l) => /investir_deus:/.test(l)) || '';
    expect(linha).not.toMatch(/comunidade/);
    expect(linha).toMatch(/investirDeus/);
  });

  it('⚠️ nenhuma soma entre as duas grandezas no arquivo', () => {
    const src = kpisJs();
    expect(src).not.toMatch(/investirDeus\s*\+\s*[\w.?]*comunidade/i);
    expect(src).not.toMatch(/comunidade[\w.?]*\s*\+\s*investirDeus/i);
  });

  it('⚠️ "não informado" é null, nunca 0 (`?? null`, não `|| 0`)', () => {
    expect(kpisJs()).not.toMatch(/investir_comunidade_online[^\n]*\|\|\s*0/);
  });
});

describe('⚠️⚠️ o POST de cultura_mensal é PATCH — não apaga o resto do mês', () => {
  const src = () => kpisJs();

  it('só grava chave que veio no corpo (hasOwnProperty)', () => {
    expect(src()).toMatch(/Object\.prototype\.hasOwnProperty\.call\(corpo,\s*k\)/);
  });

  it('⚠️⚠️ o payload NÃO é montado inteiro com os 4 campos de override', () => {
    const s = src();
    // O padrão antigo: todos no literal do payload, incondicionalmente.
    const literalAntigo = /const payload = \{[^}]*freq_presencial_semanal:\s*intOrNull/s;
    expect(s, 'payload voltou a ser montado inteiro — apaga o mês').not.toMatch(literalAntigo);
  });

  it('⚠️ dizimistas/ofertantes só recebem `|| 0` quando a chave VEIO', () => {
    const s = src();
    expect(s).toMatch(/if \(tem\('qtd_dizimistas'\)\) payload\.qtd_dizimistas = Number\(corpo\.qtd_dizimistas\) \|\| 0;/);
    expect(s).toMatch(/if \(tem\('qtd_ofertantes'\)\)/);
  });

  it('o campo novo entra na lista de inteiros opcionais', () => {
    expect(src()).toMatch(/'freq_grupos_total',\s*'investir_comunidade_online'/);
  });
});

describe('⚠️ a tela mostra as duas parcelas, e diz quando não sabe', () => {
  it('a pétala não mostra "N / 0" quando a comunidade não foi informada', () => {
    const src = semComentarios(readFileSync(join(RAIZ, 'src/components/cultura/MandalaSVG.jsx'), 'utf8'));
    expect(src).toMatch(/if \(c == null\) return formatNumber\(data\.investir_deus\);/);
  });

  it('o rótulo acompanha o que está sendo mostrado', () => {
    const src = readFileSync(join(RAIZ, 'src/components/cultura/MandalaSVG.jsx'), 'utf8');
    expect(src).toContain("'devocional / comunidade'");
    expect(src).toMatch(/petalSubLabel\(s\.key,\s*data\)/);
  });

  it('⚠️ o detalhe escreve "não informado" em vez de zero', () => {
    const src = readFileSync(join(RAIZ, 'src/components/cultura/PetalDetailDialog.jsx'), 'utf8');
    expect(src).toContain('não informado');
    expect(src).toContain('Na comunidade do Online (WhatsApp)');
  });

  it('⚠️ a descrição da pétala não promete mais só devocional', () => {
    const src = readFileSync(join(RAIZ, 'src/components/cultura/PetalDetailDialog.jsx'), 'utf8');
    // Antes: "Pessoas que fizeram devocional no app neste mês." e ponto final.
    expect(src).not.toMatch(/desc: 'Pessoas que fizeram devocional no app neste mês\.',/);
    expect(src).toMatch(/desc: '[^']*comunidade do Online/);
  });

  it('⚠️ o card de input é gated pelo MÓDULO online (nível 3)', () => {
    // ⚠️⚠️ ESTE ASSERT MUDOU EM 02/09/2026, no mesmo dia em que nasceu.
    // Ele exigia `if (!isAdmin) return null` — correto enquanto a tela usava o
    // endpoint genérico `POST /kpis/cultura/mensal`, que é admin/diretor. O
    // Matheus então pediu para liberar a equipe do Online, e a tela passou a
    // usar uma rota ESTREITA com `authorizeModule('online', 3)`.
    // Manter o assert antigo faria o gate voltar a trancar justamente quem
    // sabe o número — é um teste defendendo o que o produto não quer mais.
    // Quem guarda o desenho novo é `comunidadeOnlinePermissao.test.ts`.
    const src = semComentarios(readFileSync(join(RAIZ, 'src/pages/ministerial/Online.tsx'), 'utf8'));
    const i = src.indexOf('function ComunidadeOnlineCard');
    expect(i, 'card não encontrado').toBeGreaterThan(-1);
    const corpo = src.slice(i, i + 1600);
    expect(corpo).toMatch(/if \(!podeSalvar\) return null;/);
    // ⚠️ E grava SÓ o número da comunidade — nunca o mês inteiro.
    expect(corpo).toMatch(/comunidadeMensal\(mes,/);
  });
});

describe('⚠️ a migration existe e declara a decisão', () => {
  it('coluna aditiva, idempotente, sem DEFAULT', () => {
    const src = readFileSync(
      join(RAIZ, 'supabase/migrations/20260902180000_cultura_mensal_comunidade_online.sql'), 'utf8',
    );
    expect(src).toMatch(/ADD COLUMN IF NOT EXISTS investir_comunidade_online int;/);
    expect(src).not.toMatch(/DEFAULT\s+0/i);
    expect(src).toMatch(/NÃO É SOMADO/);
  });
});

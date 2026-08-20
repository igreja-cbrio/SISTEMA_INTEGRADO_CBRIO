#!/usr/bin/env node
'use strict';

/**
 * Ferramenta de UMA VEZ para condensar seções do CLAUDE.md (20/08/2026).
 *
 * ⚠️⚠️ NUNCA APAGA: o texto original de cada seção é APENSADO em
 * docs/CLAUDE-LEGADO.md antes de a seção ser substituída pela versão condensada.
 * A regra de manutenção do CLAUDE.md sempre disse "mover o texto longo pro
 * legado" — quem estava sendo pulado era o "mover".
 *
 * Uso:
 *   node backend/scripts/_condensar-claude-md.cjs /caminho/plano.json
 *
 * plano.json = [{ "titulo": "<início do título ## exato>", "arquivo": "/tmp/cond/1.md" }]
 *   · `titulo`  casa por PREFIXO do heading (`## ...`), e ABORTA se casar 0 ou 2+
 *   · `arquivo` contém a seção condensada JÁ COM o heading
 *
 * ⚠️ Aplica de BAIXO PRA CIMA: substituir de cima desloca as linhas das
 * seguintes e o segundo corte cairia no lugar errado.
 */

const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..', '..');
const CLAUDE = path.join(RAIZ, 'CLAUDE.md');
const LEGADO = path.join(RAIZ, 'docs', 'CLAUDE-LEGADO.md');

const contarAvisos = (s) => (s.match(/⚠️/g) || []).length;

function secoes(linhas) {
  const out = [];
  let cur = null;
  linhas.forEach((l, i) => {
    if (l.startsWith('## ')) {
      if (cur) { cur.fim = i; out.push(cur); }
      cur = { titulo: l, ini: i };
    }
  });
  if (cur) { cur.fim = linhas.length; out.push(cur); }
  return out;
}

function main() {
  const plano = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const original = fs.readFileSync(CLAUDE, 'utf8');
  let linhas = original.split('\n');

  const antes = { linhas: linhas.length, avisos: contarAvisos(original) };

  // Resolve TODOS os alvos antes de mexer em qualquer um.
  const alvos = plano.map((p) => {
    const achadas = secoes(linhas).filter((s) => s.titulo.startsWith(p.titulo));
    if (achadas.length !== 1) {
      throw new Error(`"${p.titulo}" casou ${achadas.length} seções — abortado (esperava exatamente 1)`);
    }
    const s = achadas[0];
    const novo = fs.readFileSync(p.arquivo, 'utf8').replace(/\n+$/, '') + '\n';
    if (!novo.startsWith('## ')) throw new Error(`${p.arquivo} não começa com "## "`);
    return { ...s, novo, textoOriginal: linhas.slice(s.ini, s.fim).join('\n') };
  });

  // ── 1 · legado PRIMEIRO (se isto falhar, nada foi cortado) ──
  const bloco = [
    '',
    '---',
    '',
    `# Narrativa movida do CLAUDE.md em 2026-08-20`,
    '',
    'Condensação pedida pelo Matheus: o CLAUDE.md tinha 12.5 mil linhas e ~200 mil',
    'tokens carregados em toda sessão. As seções abaixo foram resumidas lá para',
    '**estado final + decisões + lições (todo ⚠️ preservado)**, e o texto integral',
    'ficou aqui. Nada foi apagado.',
    '',
    ...alvos.flatMap((a) => ['', `<!-- de CLAUDE.md · ${a.titulo} -->`, '', a.textoOriginal]),
    '',
  ].join('\n');
  fs.appendFileSync(LEGADO, bloco);

  // ── 2 · substitui de BAIXO PRA CIMA ──
  for (const a of [...alvos].sort((x, y) => y.ini - x.ini)) {
    linhas = [...linhas.slice(0, a.ini), ...a.novo.split('\n').slice(0, -1), ...linhas.slice(a.fim)];
  }
  const saida = linhas.join('\n');
  fs.writeFileSync(CLAUDE, saida);

  const depois = { linhas: linhas.length, avisos: contarAvisos(saida) };
  const legadoAgora = contarAvisos(fs.readFileSync(LEGADO, 'utf8'));

  console.log(`seções condensadas: ${alvos.length}`);
  console.log(`CLAUDE.md: ${antes.linhas} → ${depois.linhas} linhas (${antes.linhas - depois.linhas} a menos)`);
  console.log(`⚠️ no CLAUDE.md: ${antes.avisos} → ${depois.avisos}`);
  console.log(`⚠️ no legado agora: ${legadoAgora}`);
  if (depois.avisos < antes.avisos) {
    console.log(`\n⚠️ ATENÇÃO: ${antes.avisos - depois.avisos} avisos saíram do CLAUDE.md.`);
    console.log('   Conferir um por um: aviso é a LIÇÃO, e sair daqui só vale se o');
    console.log('   texto condensado o reescreveu de forma equivalente.');
  }
}

main();

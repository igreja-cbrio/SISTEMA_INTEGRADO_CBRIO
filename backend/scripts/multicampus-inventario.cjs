#!/usr/bin/env node
// Auditoria estática offline: não lê env, banco, dados de pessoas ou credenciais.
const fs = require('node:fs');
const path = require('node:path');
const { TABELAS_CAMPUS, ROTAS_CAMPUS, classificarTabela } = require('../utils/campusCatalogo');

function semComentarios(source) {
  // Preserva posições/linhas e literais, inclusive URLs com // dentro de strings.
  return source.replace(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\/\*[\s\S]*?\*\/|\/\/[^\n]*)/g,
    (match, literal) => literal || match.replace(/[^\n]/g, ' '));
}
function varrerFonte(source, arquivo) {
  const text = semComentarios(source);
  const resultado = { tabelas: [], rpcs: [], rotas: [], dinamicos: [], fetches: [], caches: [] };
  const ref = (index, extra = {}) => ({ arquivo, linha: text.slice(0, index).split('\n').length, ...extra });
  for (const match of text.matchAll(/\.\s*(from|rpc)\s*\(\s*(?=([^\n]*))/g)) {
    const literal = match[2].match(/^(['"`])([A-Za-z_][A-Za-z0-9_]*)\1\s*(?=[,)])/);
    if (!literal) resultado.dinamicos.push(ref(match.index, { operacao: match[1] }));
    else resultado[match[1] === 'from' ? 'tabelas' : 'rpcs'].push(ref(match.index, { nome: literal[2] }));
  }
  for (const match of text.matchAll(/\bapp\s*\.\s*use\s*\(\s*(['"`])([^'"`]+)\1/g)) {
    resultado.rotas.push(ref(match.index, { caminho: match[2], escopo: ROTAS_CAMPUS[match[2]] || 'pendente' }));
  }
  for (const match of text.matchAll(/\bapp\s*\.\s*use\s*\(\s*(?=([^\n]*))/g)) {
    if (!/^(['"`])[^'"`]+\1/.test(match[1])) resultado.dinamicos.push(ref(match.index, { operacao: 'app.use' }));
  }
  for (const match of text.matchAll(/\bfetch\s*\(/g)) resultado.fetches.push(ref(match.index));
  for (const match of text.matchAll(/\b(?:localStorage|sessionStorage)\s*\.|\b(?:queryKey|cacheKey)\s*:|\bnew\s+Map\s*\(/g)) resultado.caches.push(ref(match.index));
  return resultado;
}
function arquivos(root, relative) {
  const dir = path.join(root, relative);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => {
    if (entry.isSymbolicLink() || /^(node_modules|dist|build|test|tests|__tests__|scripts|atlas)$/.test(entry.name)) return [];
    const name = path.join(relative, entry.name);
    if (entry.isDirectory()) return arquivos(root, name);
    return /\.(?:[cm]?js|jsx|tsx?)$/.test(name) && !/\.(?:test|spec)\./.test(name) ? [name] : [];
  });
}
function inventariar(root) {
  const refs = { tabelas: [], rpcs: [], rotas: [], dinamicos: [], fetches: [], caches: [] };
  const files = ['backend', 'src', 'api'].flatMap((dir) => arquivos(root, dir));
  for (const arquivo of files) {
    const scan = varrerFonte(fs.readFileSync(path.join(root, arquivo), 'utf8'), arquivo);
    for (const key of Object.keys(refs)) refs[key].push(...scan[key]);
  }
  const nomes = [...new Set([...Object.keys(TABELAS_CAMPUS), ...refs.tabelas.map((r) => r.nome)])].sort();
  const tabelas = nomes.map((nome) => ({ ...classificarTabela(nome), referencias: refs.tabelas.filter((r) => r.nome === nome) }));
  const rpcs = [...new Set(refs.rpcs.map((r) => r.nome))].sort().map((nome) => ({ nome, escopo: 'pendente', referencias: refs.rpcs.filter((r) => r.nome === nome) }));
  const gaps = {
    tabelas: tabelas.filter((t) => t.escopo === 'pendente').map((t) => t.tabela),
    rotas: [...new Set(refs.rotas.filter((r) => r.escopo === 'pendente').map((r) => r.caminho))].sort(),
    rpcs: rpcs.map((r) => r.nome), dinamicos: refs.dinamicos,
  };
  return {
    versao: 1, metodo: 'estatico_offline', prontoParaAtivacao: false,
    limites: ['Classificação é intenção; não prova coluna, RLS ou filtro em produção.', 'Regex conservadora não substitui análise de fluxo, SQL, imports ou execução.', 'RPCs, chamadas dinâmicas, fetches e caches exigem revisão humana.'],
    arquivos: files.length, tabelas, rpcs, rotas: refs.rotas, fetches: refs.fetches, caches: refs.caches, gaps,
    classificacaoCompleta: !Object.values(gaps).some((items) => items.length),
  };
}
function comparar(atual, anterior) {
  const novas = (values, previous) => values.filter((v) => !new Set(previous).has(v));
  return {
    tabelas: novas(atual.tabelas.map((r) => r.tabela), anterior.tabelas.map((r) => r.tabela)),
    rpcs: novas(atual.rpcs.map((r) => r.nome), anterior.rpcs.map((r) => r.nome)),
    rotas: novas([...new Set(atual.rotas.map((r) => r.caminho))], anterior.rotas.map((r) => r.caminho)),
  };
}
if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    const value = (flag) => { const i = args.indexOf(flag); if (i < 0) return null; if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Falta valor para ${flag}`); return args[i + 1]; };
    const report = inventariar(path.resolve(value('--root') || path.join(__dirname, '../..')));
    const baseline = value('--baseline');
    if (baseline) report.novosDesdeBaseline = comparar(report, JSON.parse(fs.readFileSync(baseline, 'utf8')));
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (args.includes('--check') && !report.classificacaoCompleta) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`Inventário não concluído: ${error.message}\n`);
    process.exitCode = 2;
  }
}
module.exports = { semComentarios, varrerFonte, inventariar, comparar };

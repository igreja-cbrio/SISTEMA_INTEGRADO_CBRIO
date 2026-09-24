import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { caminhoPublicoEvento, agruparPorIgreja } from '../lib/genesisCba';
import { createRequire } from 'node:module';
const require_ = createRequire(import.meta.url);
const { GENESIS_CAMPOS, camposGenesis, nomeEdicao, rotuloEdicaoGenesis, resumoGenesis } = require_('../../backend/utils/genesisCba.js');

const raiz = resolve(__dirname, '../..');
const ler = (p: string) => readFileSync(resolve(raiz, p), 'utf8');
// Tira comentário de linha e de bloco de UMA linha (os arquivos citam o código
// errado na explicação, e sem isso o comentário seria a própria evidência).
const semComentarios = (s: string) => s
  .split('\n').map((l) => l.replace(/\/\/[^\n]*/, '').replace(/\/\*.*?\*\//g, '')).join('\n');
const semComentariosSql = (s: string) => s.split('\n').map((l) => l.replace(/--[^\n]*/, '')).join('\n');

describe('Genesis CBA · molde e régua da série', () => {
  it('traz as 5 perguntas da igreja parceira, com keys estáveis e válidas', () => {
    expect(GENESIS_CAMPOS).toHaveLength(5);
    for (const c of GENESIS_CAMPOS) expect(c.key).toMatch(/^[a-z0-9_]{1,60}$/);
    expect(new Set(GENESIS_CAMPOS.map((c: any) => c.key)).size).toBe(5);
    expect(GENESIS_CAMPOS.filter((c: any) => !c.obrigatorio).map((c: any) => c.key)).toEqual(['c_genesis_como_soube']);
  });

  it('não repete campo padrão do Contrato (nome/CPF/e-mail/celular vêm do servidor)', () => {
    const rotulos = GENESIS_CAMPOS.map((c: any) => c.label.toLowerCase()).join(' | ');
    for (const padrao of ['nome completo', 'cpf', 'e-mail', 'celular']) expect(rotulos).not.toContain(padrao);
  });

  it('camposGenesis é CÓPIA: editar não altera o molde', () => {
    const a = camposGenesis();
    a[3].opcoes.push('Talvez');
    expect(GENESIS_CAMPOS[3].opcoes).toEqual(['Sim', 'Não']);
  });

  it('nome e rótulo da edição', () => {
    expect(nomeEdicao('Igreja Batista X')).toBe('Genesis CBA · Igreja Batista X');
    expect(nomeEdicao('')).toBe('Genesis CBA');
    expect(rotuloEdicaoGenesis('2026-10-10')).toBe('2026-10-10');
    expect(rotuloEdicaoGenesis('10/10/2026')).toBeNull();
  });

  it('resumo conta Genesis, ativos, igrejas distintas (por id) e inscritos', () => {
    const r = resumoGenesis([
      { igreja_id: 'a', inscritos: 30, status: 'encerrado' },
      { igreja_id: 'a', inscritos: 12, status: 'publicado' },
      { igreja_id: 'b', inscritos: 8, status: 'rascunho' },
    ]);
    expect(r).toEqual({ edicoes: 3, ativas: 1, igrejas: 2, inscritos: 50 });
    expect(resumoGenesis(null)).toEqual({ edicoes: 0, ativas: 0, igrejas: 0, inscritos: 0 });
  });

  it('agrupa por igreja pelo ID, com a data do mais recente', () => {
    const g = agruparPorIgreja([
      { igreja_id: 'a', igreja: { nome: 'A' }, data: '2026-03-01', inscritos: 10 },
      { igreja_id: 'a', igreja: { nome: 'A renomeada' }, data: '2026-09-01', inscritos: 5 },
      { igreja_id: 'b', igreja: { nome: 'B' }, data: '2026-05-01', inscritos: 7 },
    ]);
    expect(g[0]).toMatchObject({ chave: 'a', edicoes: 2, inscritos: 15, ultima: '2026-09-01' });
    expect(g).toHaveLength(2);
  });

  it('caminho público: parceira sai por /genesis, CBRio por /evento', () => {
    expect(caminhoPublicoEvento({ slug: 'genesis-x', igreja_id: 'uuid' })).toBe('/genesis/genesis-x');
    expect(caminhoPublicoEvento({ slug: 'celebra', igreja_id: null })).toBe('/evento/celebra');
    expect(caminhoPublicoEvento({ slug: '', igreja_id: 'uuid' })).toBe('');
  });
});

describe('Genesis CBA · a pessoa da parceira NUNCA vira cadastro da CBRio (guardas estáticas)', () => {
  it('a porta pública pula o funil de identidade quando o evento é de parceira', () => {
    const src = semComentarios(ler('backend/routes/publicEventoExterno.js'));
    expect(src).toMatch(/ev\.igreja_parceira\s*\?\s*consentimentos\(ins\.id,\s*null\)\s*:\s*processarIdentidade\(/);
    expect(src).toMatch(/igreja_parceira = await igrejaParceiraPorId\(data\.igreja_id\)/);
  });

  it('o import do e-Inscrição não roda o matcher em evento de parceira', () => {
    const src = semComentarios(ler('backend/services/importarEInscricao.js'));
    const iParceira = src.indexOf('if (parceira)');
    const iMatcher = src.indexOf('acharOuCriarGuardado({');
    expect(iParceira).toBeGreaterThan(-1);
    expect(iParceira).toBeLessThan(iMatcher);
  });

  it('o app da CBRio não lista, não inscreve e não mostra evento de parceira', () => {
    const src = semComentarios(ler('backend/routes/app.js'));
    expect(src).toContain('if (soCbrio) qCatalogo = qCatalogo.or(soCbrio);');
    expect(src).toContain('if (!ev || ev.igreja_parceira) return res.status(404)');
  });

  it('o push de evento publicado pula evento de parceira', () => {
    const src = semComentarios(ler('backend/routes/inscricoes.js'));
    const corpo = src.slice(src.indexOf('async function notificarNovoEventoApp'));
    expect(corpo.slice(0, 400)).toContain('if (await eventoEhParceiro(evento)) return;');
  });

  it('a migration trava membro_id e tira a parceira da visão unificada', () => {
    const sql = semComentariosSql(ler('supabase/migrations/20260924150000_genesis_cba_igreja_parceira.sql'));
    expect(sql).toMatch(/CREATE TRIGGER trg_inscricoes_parceira_sem_membro/);
    expect(sql).toMatch(/NEW\.membro_id IS NOT NULL/);
    expect(sql).toMatch(/cba_acompanhada/);
    expect(sql).toMatch(/v_n <> 1/);
  });
});

describe('Genesis CBA · a série (guardas estáticas)', () => {
  it('duplicar uma edição de parceira herda a igreja (não nasce como evento da CBRio)', () => {
    const src = semComentarios(ler('backend/routes/inscricoes.js'));
    const corpo = src.slice(src.indexOf("router.post('/eventos/:id/nova-edicao'"));
    expect(corpo.slice(0, 4000)).toContain('igreja_id: ev.igreja_id || null');
  });

  it('nova edição do Genesis exige igreja parceira', () => {
    const src = semComentarios(ler('backend/routes/inscricoes.js'));
    const corpo = src.slice(src.indexOf("router.post('/genesis/edicoes'"));
    expect(corpo.slice(0, 1500)).toMatch(/if \(!igreja\) return res\.status\(400\)/);
  });

  it('/serie/:slugBase é declarada ANTES de /:slug', () => {
    const src = semComentarios(ler('backend/routes/publicEventoExterno.js'));
    expect(src.indexOf("router.get('/serie/:slugBase'")).toBeGreaterThan(-1);
    expect(src.indexOf("router.get('/serie/:slugBase'")).toBeLessThan(src.indexOf("router.get('/:slug'"));
  });

  it('não existe mais o botão "Novo Genesis CBA" (Genesis se cria pela série)', () => {
    expect(semComentarios(ler('src/pages/Inscricoes.tsx'))).not.toContain('Novo Genesis CBA');
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GENESIS_CAMPOS, presetGenesis, caminhoPublicoEvento } from '../lib/genesisCba';

const raiz = resolve(__dirname, '../..');
const ler = (p: string) => readFileSync(resolve(raiz, p), 'utf8');
// Tira comentário de linha e de bloco de UMA linha (os arquivos citam o código
// errado na explicação, e sem isso o comentário seria a própria evidência).
const semComentarios = (s: string) => s
  .split('\n').map((l) => l.replace(/\/\/[^\n]*/, '').replace(/\/\*.*?\*\//g, '')).join('\n');
const semComentariosSql = (s: string) => s.split('\n').map((l) => l.replace(/--[^\n]*/, '')).join('\n');

describe('Genesis CBA · molde do formulário', () => {
  it('traz as 5 perguntas da igreja parceira, com keys estáveis e válidas', () => {
    expect(GENESIS_CAMPOS).toHaveLength(5);
    for (const c of GENESIS_CAMPOS) expect(c.key).toMatch(/^[a-z0-9_]{1,60}$/);
    expect(new Set(GENESIS_CAMPOS.map((c) => c.key)).size).toBe(5);
  });

  it('obrigatoriedade igual à pedida (só "como soube" é opcional)', () => {
    const opcionais = GENESIS_CAMPOS.filter((c) => !c.obrigatorio).map((c) => c.key);
    expect(opcionais).toEqual(['c_genesis_como_soube']);
    const ja = GENESIS_CAMPOS.find((c) => c.key === 'c_genesis_ja_participou')!;
    expect(ja.opcoes).toEqual(['Sim', 'Não']);
  });

  it('não repete campo padrão do Contrato (nome/CPF/e-mail/celular vêm do servidor)', () => {
    const rotulos = GENESIS_CAMPOS.map((c) => c.label.toLowerCase()).join(' | ');
    for (const padrao of ['nome completo', 'cpf', 'e-mail', 'celular']) expect(rotulos).not.toContain(padrao);
  });

  it('preset é CÓPIA: editar o formulário não altera o molde', () => {
    const a = presetGenesis();
    a.campos[0].label = 'mexi';
    a.campos[3].opcoes.push('Talvez');
    expect(GENESIS_CAMPOS[0].label).not.toBe('mexi');
    expect(GENESIS_CAMPOS[3].opcoes).toEqual(['Sim', 'Não']);
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

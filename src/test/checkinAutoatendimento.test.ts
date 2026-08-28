import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  mascararNome, validarEntrada, escolherInscricao, resumoPublico,
} from '../../backend/utils/checkinAutoatendimento.js';
import {
  gerarTokenCheckin, verificarTokenCheckin, montarLinkCheckin,
} from '../../backend/utils/eventoCheckinToken.js';
import { gerarTokenCulto } from '../../backend/utils/cultoToken.js';

const EVENTO = '11111111-2222-3333-4444-555555555555';

function comSegredo<T>(fn: () => T): T {
  const antes = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'segredo-de-teste';
  try { return fn(); } finally {
    if (antes === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = antes;
  }
}

describe('checkinAutoatendimento · a porta pública do check-in', () => {
  it('⚠️ o nome sai MASCARADO — primeiro nome e iniciais', () => {
    expect(mascararNome('Matheus Toscano de Almeida')).toBe('Matheus T. D. A.');
    expect(mascararNome('Maria da Silva Souza')).toBe('Maria D. S. S.');
  });

  it('nome de uma palavra sai inteiro, e vazio não estoura', () => {
    expect(mascararNome('Ana')).toBe('Ana');
    expect(mascararNome('   ')).toBe('');
    expect(mascararNome(null as any)).toBe('');
  });

  it('⚠️ a máscara NUNCA devolve o sobrenome inteiro', () => {
    const m = mascararNome('Matheus Toscano');
    expect(m).not.toContain('Toscano');
    expect(m).toBe('Matheus T.');
  });

  it('exige CPF completo e nascimento válido', () => {
    expect(validarEntrada({ cpf: '123.456.789-01', nascimento: '1990-05-10' }))
      .toEqual({ ok: true, cpf: '12345678901', nascimento: '1990-05-10' });
    expect(validarEntrada({ cpf: '123', nascimento: '1990-05-10' }).ok).toBe(false);
    expect(validarEntrada({ cpf: '12345678901', nascimento: '10/05/1990' }).ok).toBe(false);
    expect(validarEntrada({ cpf: '12345678901', nascimento: '1990-13-10' }).ok).toBe(false);
    expect(validarEntrada({}).ok).toBe(false);
  });

  it('acha a inscrição quando o nascimento confere', () => {
    const r = escolherInscricao([{ id: 'a', data_nascimento: '1990-05-10' }], '1990-05-10');
    expect(r.situacao).toBe('ok');
    expect(r.inscricao.id).toBe('a');
  });

  it('⚠️ nascimento que NÃO confere não entra — é o segundo sinal', () => {
    expect(escolherInscricao([{ id: 'a', data_nascimento: '1990-05-10' }], '1991-05-10').situacao)
      .toBe('nao_encontrada');
  });

  it('⚠️ inscrição SEM nascimento não casa com nada', () => {
    // Aceitar "não tem nascimento, então qualquer um serve" transformaria o
    // segundo sinal em enfeite justamente no cadastro mais fraco.
    expect(escolherInscricao([{ id: 'a', data_nascimento: null }], '1990-05-10').situacao)
      .toBe('nao_encontrada');
    expect(escolherInscricao([{ id: 'a' }], '1990-05-10').situacao).toBe('nao_encontrada');
  });

  it('⚠️ duas inscrições iguais viram AMBÍGUO, não um chute', () => {
    const r = escolherInscricao(
      [{ id: 'a', data_nascimento: '1990-05-10' }, { id: 'b', data_nascimento: '1990-05-10' }],
      '1990-05-10',
    );
    expect(r.situacao).toBe('ambiguo');
    expect(r.inscricao).toBeUndefined();
  });

  it('lista vazia ou lixo não estoura', () => {
    expect(escolherInscricao([], '1990-05-10').situacao).toBe('nao_encontrada');
    expect(escolherInscricao(null as any, '1990-05-10').situacao).toBe('nao_encontrada');
    expect(escolherInscricao([null as any], '1990-05-10').situacao).toBe('nao_encontrada');
  });

  it('⚠️⚠️ o resumo público NÃO vaza contato, CPF nem número de sorte', () => {
    const r = resumoPublico({
      id: 'x', nome_completo: 'Matheus Toscano', data_nascimento: '1990-05-10',
      telefone: '21999998888', email: 'a@b.com', cpf: '12345678901',
      numero_sorte: 1817, valor_cobrado_centavos: 83000, checkin_em: null,
    });
    expect(Object.keys(r!).sort()).toEqual(['id', 'ja_fez_checkin', 'nome_mascarado']);
    const txt = JSON.stringify(r);
    for (const vaz of ['21999998888', 'a@b.com', '12345678901', '1817', '83000', 'Toscano']) {
      expect(txt).not.toContain(vaz);
    }
  });

  it('o resumo avisa quando a pessoa já fez check-in', () => {
    expect(resumoPublico({ id: 'x', nome_completo: 'Ana', checkin_em: '2026-08-29T12:00:00Z' })!.ja_fez_checkin).toBe(true);
    expect(resumoPublico(null)).toBeNull();
  });
});

describe('eventoCheckinToken · o QR da porta', () => {
  it('assina e volta o mesmo evento', () => comSegredo(() => {
    const t = gerarTokenCheckin(EVENTO);
    expect(verificarTokenCheckin(t)).toBe(EVENTO);
  }));

  it('⚠️⚠️ token de OUTRO fluxo (mesmo segredo) é recusado — namespace', () => comSegredo(() => {
    expect(verificarTokenCheckin(gerarTokenCulto(EVENTO))).toBeNull();
  }));

  it('assinatura adulterada é recusada', () => comSegredo(() => {
    const t = gerarTokenCheckin(EVENTO)!;
    const [id, sig] = t.split('.');
    const trocado = sig[0] === 'a' ? 'b' : 'a';
    expect(verificarTokenCheckin(`${id}.${trocado}${sig.slice(1)}`)).toBeNull();
  }));

  it('lixo é recusado sem estourar', () => comSegredo(() => {
    for (const v of ['', 'abc', 'abc.def', `${'0'.repeat(32)}.${'0'.repeat(20)}`, null as any]) {
      expect(verificarTokenCheckin(v)).toBeNull();
    }
  }));

  it('⚠️ FAIL-CLOSED: sem segredo não gera nem aceita', () => {
    const cron = process.env.CRON_SECRET;
    const own = process.env.EVENTO_CHECKIN_TOKEN_SECRET;
    const valido = comSegredo(() => gerarTokenCheckin(EVENTO))!;
    delete process.env.CRON_SECRET;
    delete process.env.EVENTO_CHECKIN_TOKEN_SECRET;
    try {
      expect(gerarTokenCheckin(EVENTO)).toBeNull();
      expect(montarLinkCheckin(EVENTO)).toBeNull();
      expect(verificarTokenCheckin(valido)).toBeNull();
    } finally {
      if (cron !== undefined) process.env.CRON_SECRET = cron;
      if (own !== undefined) process.env.EVENTO_CHECKIN_TOKEN_SECRET = own;
    }
  });

  it('⚠️⚠️ o segredo NUNCA tem literal de fallback (lição do MEM_QR_SALT)', () => {
    // Guarda ESTRUTURAL, e não de comportamento, de propósito: um fallback
    // literal (`segredo() || 'x'`) é indetectável de fora — a assinatura forjada
    // com ele simplesmente não bate com a de nenhum teste. O que se observa é a
    // FONTE: `segredo()` só pode ler env, nunca devolver string escrita.
    // `__dirname` é a convenção deste repo para teste estrutural (ver
    // routeModuleMap.test.ts) — `import.meta.url` não é file:// sob o vitest.
    const fonte = readFileSync(
      join(__dirname, '..', '..', 'backend', 'utils', 'eventoCheckinToken.js'), 'utf8',
    );
    // ⚠️ Comentário fora antes de casar — o cabeçalho deste arquivo CITA o
    // MEM_QR_SALT e a palavra "fallback", e seria a própria evidência
    // (armadilha registrada em 06/08).
    const semComentario = fonte
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n').map(l => l.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n');
    const corpo = /function segredo\(\)\s*\{([\s\S]*?)\n\}/.exec(semComentario)?.[1] ?? '';
    expect(corpo).toContain('process.env');
    // nenhuma string literal como alternativa do ||
    expect(corpo).not.toMatch(/\|\|\s*['"`]/);
  });

  it('o link aponta para /ec/', () => comSegredo(() => {
    expect(montarLinkCheckin(EVENTO)).toMatch(/\/ec\/[0-9a-f]{32}\.[0-9a-f]{20}$/);
  }));
});

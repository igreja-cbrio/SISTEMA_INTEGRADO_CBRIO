import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  mascararNome, validarEntrada, escolherInscricao, resumoPublico,
  normalizarNomeChave, telefoneChave, validarEntradaNome, escolherPorNomeTelefone,
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

// ════════════════════════════════════════════════════════════════════════════
// 2º caminho · NOME COMPLETO + TELEFONE (véspera do Celebra · 28/08/2026)
//
// Existe para as inscrições do contrato ANTIGO (27/07 e antes), sem CPF nem
// nascimento — 67 das 332 do Celebra. Medido no banco: nome+telefone
// identifica UNICAMENTE as 332, e 67/67 têm nome com 2+ palavras e telefone
// de 10-11 dígitos.
// ════════════════════════════════════════════════════════════════════════════
describe('autoatendimento · nome completo + telefone', () => {
  const ANA = { id: 'a', nome_completo: 'Ana Paula Leite da Silva', telefone: '21999998888', status: 'confirmada' };
  const JOAO = { id: 'b', nome_completo: 'João Márcio Conceição', telefone: '21988887777', status: 'confirmada' };

  // ⚠️ Pedido explícito do Matheus (28/08): "a pessoa não precisa escrever
  // exatamente com acentos e letras maiúsculas ou minúsculas". Na fila da
  // porta, exigir grafia exata é o mesmo que não ter o caminho.
  it('a pessoa não precisa acertar acento nem caixa', () => {
    expect(normalizarNomeChave('JOÃO MÁRCIO CONCEIÇÃO')).toBe('joao marcio conceicao');
    expect(normalizarNomeChave('joao marcio conceicao')).toBe('joao marcio conceicao');
    expect(normalizarNomeChave('JOSÉ  DA  Conceição')).toBe('jose da conceicao');
  });

  // Caso REAL deste projeto: o líder cadastrado como "ANTONIO MARCO PEREIRA"
  // (sem acento) e a pessoa digitando "Antônio" — foi o que fez a Patrícia não
  // achar o grupo dele em 30/07 e virou a régua de busca sem acento.
  it('casa nos DOIS sentidos: cadastro sem acento × digitado com acento', () => {
    expect(normalizarNomeChave('ANTONIO MARCO PEREIRA'))
      .toBe(normalizarNomeChave('Antônio Marco Pereira'));
  });

  it('tolera espaço duplo, pontas e pontuação', () => {
    expect(normalizarNomeChave('  Ana   Paula ')).toBe('ana paula');
    // 2 nomes com ponto, 1 com parênteses e 1 com apóstrofo CURVO existem de
    // verdade entre as 332 inscrições do Celebra.
    expect(normalizarNomeChave('João P. Silva')).toBe(normalizarNomeChave('Joao P Silva'));
    expect(normalizarNomeChave('D’Ávila Costa')).toBe(normalizarNomeChave("D'Avila Costa"));
    // ⚠️ Pontuação vira ESPAÇO, não vazio: senão "Maria(Ana)" viraria "mariaana".
    expect(normalizarNomeChave('Maria(Ana) Souza')).toBe('maria ana souza');
    // `ā` (macron) aparece numa das inscrições — NFD resolve.
    expect(normalizarNomeChave('Renāta Lima')).toBe('renata lima');
  });

  it('casa o telefone com ou sem o 9, o DDD ou o +55', () => {
    expect(telefoneChave('5521999998888')).toBe('99998888');
    expect(telefoneChave('21999998888')).toBe('99998888');
    expect(telefoneChave('(21) 99999-8888')).toBe('99998888');
  });

  // ⚠️ DDD 55 é Santa Maria/RS: um replace(/^55/) cego destruiria todo número
  // legítimo de lá. Só tira o 55 quando o resto AINDA é telefone completo.
  it('não confunde o DDI 55 com o DDD 55', () => {
    expect(telefoneChave('5599998888')).toBe('99998888');
    expect(telefoneChave('55999998888')).toBe('99998888');
  });

  it('exige nome com 2+ palavras', () => {
    expect(validarEntradaNome({ nome: 'Ana', telefone: '21999998888' }).ok).toBe(false);
    expect(validarEntradaNome({ nome: 'Ana', telefone: '21999998888' }).motivo).toBe('nome_incompleto');
    expect(validarEntradaNome({ nome: 'Ana Paula', telefone: '21999998888' }).ok).toBe(true);
  });

  it('exige telefone de 10 a 11 dígitos', () => {
    expect(validarEntradaNome({ nome: 'Ana Paula', telefone: '99998888' }).motivo).toBe('telefone_invalido');
    expect(validarEntradaNome({ nome: 'Ana Paula', telefone: '2199999888812' }).motivo).toBe('telefone_invalido');
    expect(validarEntradaNome({ nome: 'Ana Paula', telefone: '2199998888' }).ok).toBe(true);
  });

  it('acha a inscrição quando nome E telefone casam', () => {
    const r = escolherPorNomeTelefone([ANA, JOAO], { nome: 'ana paula leite da silva', telefone: '(21) 99999-8888' });
    expect(r.situacao).toBe('ok');
    expect(r.inscricao.id).toBe('a');
  });

  // Ponta a ponta: o cadastro tem acento e o dedo na fila digita sem, tudo
  // maiúsculo e com espaço sobrando. Tem que achar.
  it('acha mesmo digitando sem acento, em caixa alta e com espaço extra', () => {
    const r = escolherPorNomeTelefone([ANA, JOAO], { nome: '  JOAO   MARCIO CONCEICAO ', telefone: '21988887777' });
    expect(r.situacao).toBe('ok');
    expect(r.inscricao.id).toBe('b');
  });

  // ⚠️ O SEGUNDO SINAL NÃO É ENFEITE: nome certo com telefone errado NÃO passa.
  // É o que impede alguém marcar presença de outra pessoa só sabendo o nome —
  // e no Celebra todos os 67 têm número da sorte.
  it('recusa nome certo com telefone errado', () => {
    expect(escolherPorNomeTelefone([ANA, JOAO], { nome: 'Ana Paula Leite da Silva', telefone: '21911112222' }).situacao)
      .toBe('nao_encontrada');
  });

  // ⚠️ Comparação EXATA do nome inteiro. Parcial ou "contém" transformaria o
  // desempate em chute — e o nome é a metade identificadora do par.
  it('recusa nome parcial mesmo com o telefone certo', () => {
    expect(escolherPorNomeTelefone([ANA], { nome: 'Ana Paula', telefone: '21999998888' }).situacao)
      .toBe('nao_encontrada');
    expect(escolherPorNomeTelefone([ANA], { nome: 'Ana', telefone: '21999998888' }).situacao)
      .toBe('nao_encontrada');
  });

  it('duas iguais viram ambíguo e vão pro operador', () => {
    const gemea = { ...ANA, id: 'c' };
    expect(escolherPorNomeTelefone([ANA, gemea], { nome: 'Ana Paula Leite da Silva', telefone: '21999998888' }).situacao)
      .toBe('ambiguo');
  });

  it('entrada vazia não casa com nada', () => {
    expect(escolherPorNomeTelefone([ANA], { nome: '', telefone: '' }).situacao).toBe('nao_encontrada');
    expect(escolherPorNomeTelefone([ANA], { nome: 'Ana Paula Leite da Silva', telefone: '' }).situacao)
      .toBe('nao_encontrada');
  });

  // A máscara vale nos DOIS caminhos — a porta nunca devolve nome inteiro.
  it('o resumo do 2º caminho continua mascarado e sem contato', () => {
    const r = resumoPublico(escolherPorNomeTelefone([ANA], { nome: 'Ana Paula Leite da Silva', telefone: '21999998888' }).inscricao);
    expect(r.nome_mascarado).toBe('Ana P. L. D. S.');
    expect(JSON.stringify(r)).not.toContain('21999998888');
    expect(JSON.stringify(r)).not.toContain('Leite');
  });
});

// Contrato do prefill da tela de doar (a pessoa vem do app já identificada).
//
// ⚠️ O que estes testes protegem, em ordem de dano:
//   1. ⚠️⚠️ o CPF COMPLETO nunca sair na resposta — a página é PÚBLICA e a URL
//      vive no histórico, no print e no grupo de WhatsApp;
//   2. o CPF do CADASTRO vencer o do payload — senão volta o risco de doar sob
//      o CPF de outra pessoa da família;
//   3. o token ter namespace e PRAZO próprios (um token do censo não vale aqui,
//      e um vencido não ressuscita editando a URL);
//   4. "cadastro sem CPF" ser um estado DITO, não uma máscara torta.
import { describe, it, expect } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pre = require('../../backend/utils/doacaoPrefill.js');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const tok = require('../../backend/utils/doacaoToken.js');

const CPF = '12345678909';
const MEMBRO = {
  id: '3be7c5cb-cf5b-47ac-b07e-f01cb35597b9',
  nome: 'Matheus Toscano',
  email: 'matheus@cbrio.org',
  telefone: '21998248249',
  cpf: CPF,
};

describe('doacaoPrefill · o que a tela recebe', () => {
  it('⚠️⚠️ NUNCA devolve o CPF completo', () => {
    const p = pre.prefillDoCadastro(MEMBRO);
    const json = JSON.stringify(p);
    expect(json).not.toContain(CPF);
    expect(json).not.toContain('123.456.789-09');
    // e nem por acidente em outro campo
    expect(json).not.toMatch(/\d{11}/);
  });

  it('⚠️ o CPF mascarado revela só os 5 últimos', () => {
    expect(pre.prefillDoCadastro(MEMBRO).cpf_mascarado).toBe('***.***.789-09');
  });

  it('⚠️⚠️ NUNCA devolve o telefone completo', () => {
    const p = pre.prefillDoCadastro(MEMBRO);
    expect(JSON.stringify(p)).not.toContain('21998248249');
    expect(p.telefone_mascarado).toBe('(21) *****-8249');
  });

  it('nome e e-mail vão inteiros (é o que a pessoa confere e corrige)', () => {
    const p = pre.prefillDoCadastro(MEMBRO);
    expect(p.nome).toBe('Matheus Toscano');
    expect(p.email).toBe('matheus@cbrio.org');
  });

  it('⚠️ cadastro SEM CPF é estado DITO, não máscara torta', () => {
    const p = pre.prefillDoCadastro({ ...MEMBRO, cpf: null });
    expect(p.cpf_mascarado).toBeNull();
    expect(p.tem_cpf).toBe(false);
  });

  it('⚠️ CPF com tamanho errado não vira máscara', () => {
    for (const ruim of ['123', '1234567890', '123456789012', '', null]) {
      expect(pre.cpfMascarado(ruim)).toBeNull();
    }
  });

  it('telefone fora de 10-11 dígitos não vira máscara', () => {
    for (const ruim of ['123', '2199824824912', '', null]) {
      expect(pre.telefoneMascarado(ruim)).toBeNull();
    }
  });

  it('membro ausente devolve null (não um objeto vazio)', () => {
    expect(pre.prefillDoCadastro(null)).toBeNull();
    expect(pre.prefillDoCadastro({})).toBeNull();
  });
});

describe('doacaoPrefill · o pagador que vai pra cobrança', () => {
  it('⚠️⚠️ o CPF do CADASTRO vence o do payload', () => {
    const r = pre.pagadorParaCobranca({
      membro: MEMBRO, corpo: { cpf: '98765432100', nome: 'Outro Nome' },
    });
    expect(r.cpf).toBe(CPF);
    expect(r.cpf_veio_do_cadastro).toBe(true);
  });

  it('⚠️ cadastro SEM CPF aceita o digitado (senão quem não tem CPF não doa)', () => {
    const r = pre.pagadorParaCobranca({
      membro: { ...MEMBRO, cpf: null }, corpo: { cpf: '987.654.321-00' },
    });
    expect(r.cpf).toBe('98765432100');
    expect(r.cpf_veio_do_cadastro).toBe(false);
  });

  it('CPF inválido nos dois lados devolve null, nunca lixo', () => {
    const r = pre.pagadorParaCobranca({
      membro: { ...MEMBRO, cpf: '123' }, corpo: { cpf: 'abc' },
    });
    expect(r.cpf).toBeNull();
  });

  it('nome/e-mail/telefone digitados VENCEM o cadastro (a pessoa pode corrigir)', () => {
    const r = pre.pagadorParaCobranca({
      membro: MEMBRO,
      corpo: { nome: 'Matheus T. Corrigido', email: 'novo@cbrio.org', telefone: '(21) 90000-0000' },
    });
    expect(r.nome).toBe('Matheus T. Corrigido');
    expect(r.email).toBe('novo@cbrio.org');
    expect(r.telefone).toBe('21900000000');
  });

  it('payload vazio cai no cadastro', () => {
    const r = pre.pagadorParaCobranca({ membro: MEMBRO, corpo: {} });
    expect(r.nome).toBe('Matheus Toscano');
    expect(r.telefone).toBe('21998248249');
  });
});

describe('doacaoToken', () => {
  const SEC = 'segredo-de-teste-1234567890';
  const AGORA = 1_760_000_000_000;
  const comSegredo = (fn: () => any) => {
    const antes = process.env.DOACAO_TOKEN_SECRET;
    process.env.DOACAO_TOKEN_SECRET = SEC;
    try { return fn(); } finally {
      if (antes === undefined) delete process.env.DOACAO_TOKEN_SECRET;
      else process.env.DOACAO_TOKEN_SECRET = antes;
    }
  };

  it('emite e lê o próprio token', () => comSegredo(() => {
    const t = tok.emitir(MEMBRO.id, AGORA);
    expect(t).toBeTruthy();
    expect(tok.ler(t, AGORA + 1000)).toEqual({ ok: true, membro_id: MEMBRO.id });
  }));

  it('⚠️⚠️ EXPIRA (o do censo é permanente, este não)', () => comSegredo(() => {
    const t = tok.emitir(MEMBRO.id, AGORA);
    expect(tok.ler(t, AGORA + tok.VALIDADE_MS + 1).motivo).toBe('expirado');
  }));

  it('⚠️⚠️ editar o prazo na URL NÃO ressuscita (o exp está na assinatura)', () => comSegredo(() => {
    const t = tok.emitir(MEMBRO.id, AGORA)!;
    const [id, , sig] = t.split('.');
    const forjado = `${id}.${AGORA + 99_999_999}.${sig}`;
    expect(tok.ler(forjado, AGORA + tok.VALIDADE_MS + 1).motivo).toBe('assinatura');
  }));

  it('⚠️ trocar o MEMBRO não passa', () => comSegredo(() => {
    const t = tok.emitir(MEMBRO.id, AGORA)!;
    const [, exp, sig] = t.split('.');
    expect(tok.ler(`outro-membro.${exp}.${sig}`, AGORA).motivo).toBe('assinatura');
  }));

  it('⚠️⚠️ FAIL-CLOSED sem segredo: não emite e não aceita', () => {
    const antesD = process.env.DOACAO_TOKEN_SECRET;
    const antesC = process.env.CRON_SECRET;
    delete process.env.DOACAO_TOKEN_SECRET;
    delete process.env.CRON_SECRET;
    try {
      expect(tok.emitir(MEMBRO.id, AGORA)).toBeNull();
      expect(tok.ler('qualquer.1.coisa', AGORA).motivo).toBe('sem_segredo');
    } finally {
      if (antesD !== undefined) process.env.DOACAO_TOKEN_SECRET = antesD;
      if (antesC !== undefined) process.env.CRON_SECRET = antesC;
    }
  });

  it('⚠️⚠️ token do CENSO (mesmo segredo) NÃO vale aqui — é o namespace', () => {
    const antes = process.env.CRON_SECRET;
    process.env.CRON_SECRET = SEC;
    delete process.env.DOACAO_TOKEN_SECRET;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const censo = require('../../backend/utils/censoToken.js');
      // ⚠️ SEM guard condicional: se estes nomes mudarem, o teste QUEBRA em vez
      // de passar sem testar nada — foi assim que o mutante do namespace
      // sobreviveu na 1ª rodada.
      expect(typeof censo.gerarTokenCenso).toBe('function');
      expect(typeof censo.verificarTokenCenso).toBe('function');

      const doCenso = censo.gerarTokenCenso(MEMBRO.id);
      expect(doCenso).toBeTruthy();
      // O token do censo NÃO abre a doação...
      expect(tok.ler(doCenso, AGORA).ok).toBe(false);
      // ...e o nosso NÃO abre o censo.
      const nosso = tok.emitir(MEMBRO.id, AGORA)!;
      expect(censo.verificarTokenCenso(nosso)).toBeFalsy();

      // ⚠️⚠️ E ESTE é o caso que observa o NAMESPACE de verdade. O token do
      // censo já é recusado pelo FORMATO (ele tem 2 partes, o nosso tem 3),
      // então aquele assert acima passaria mesmo sem namespace nenhum — foi
      // assim que o mutante sobreviveu na 1ª rodada.
      //
      // Aqui montamos um token NO NOSSO FORMATO, assinado com o MESMO segredo
      // mas SEM o namespace — é o que um fluxo irmão desta casa produziria se
      // adotasse o mesmo formato. Sem o namespace na assinatura, ele passaria.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const crypto = require('node:crypto');
      const corpo = `${MEMBRO.id}.${AGORA + 60_000}`;
      const semNamespace = crypto.createHmac('sha256', SEC)
        .update(corpo).digest('hex').slice(0, 20);
      expect(tok.ler(`${corpo}.${semNamespace}`, AGORA).motivo).toBe('assinatura');

      // E o de um fluxo com OUTRO namespace também não vale.
      const outroNamespace = crypto.createHmac('sha256', SEC)
        .update(`censo-atualizacao:${corpo}`).digest('hex').slice(0, 20);
      expect(tok.ler(`${corpo}.${outroNamespace}`, AGORA).motivo).toBe('assinatura');
    } finally {
      if (antes === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = antes;
    }
  });

  it('token torto é recusado sem estourar', () => comSegredo(() => {
    for (const ruim of ['', '   ', 'abc', 'a.b', 'a.b.c.d', 'id.naonumero.sig', null, 42]) {
      expect(tok.ler(ruim as any, AGORA).ok).toBe(false);
    }
  }));

  it('⚠️ assinatura de tamanho diferente não estoura o timingSafeEqual', () => comSegredo(() => {
    const t = tok.emitir(MEMBRO.id, AGORA)!;
    const [id, exp] = t.split('.');
    expect(() => tok.ler(`${id}.${exp}.abc`, AGORA)).not.toThrow();
    expect(tok.ler(`${id}.${exp}.abc`, AGORA).motivo).toBe('assinatura');
  }));

  it('sem membro não emite', () => comSegredo(() => {
    expect(tok.emitir('', AGORA)).toBeNull();
    expect(tok.emitir(null as any, AGORA)).toBeNull();
  }));
});

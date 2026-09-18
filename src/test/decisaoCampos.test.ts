// Contrato da porta de DECISÃO (formulário público de aceitação · online).
//
// ⚠️ O que estes casos protegem não é "validação": é a assimetria da porta.
// Quem decide seguir a Jesus não pode perder o registro por causa de um campo
// de estatística — mas também não adianta registrar quem ninguém consegue
// alcançar depois. Cada caso abaixo é um lado dessa conta.
import { describe, it, expect } from 'vitest';
import * as mod from '../../backend/utils/decisaoCampos.js';

const { validarDecisao } = mod as {
  validarDecisao: (b: unknown, o?: { hoje?: string; nascimentoObrigatorio?: boolean }) => {
    ok: boolean; campo?: string; erro?: string;
    valores?: { nome: string; dataNascimento: string; telefone: string; cep: string | null; email: string | null };
  };
};

const bom = {
  nome: 'Ana Paula Souza',
  data_nascimento: '1990-05-10',
  telefone: '(21) 99999-8888',
  aceite_lgpd: true,
};

describe('validarDecisao · o que a porta aceita', () => {
  it('aceita o caso completo e normaliza telefone e CEP', () => {
    const r = validarDecisao({ ...bom, cep: '22640-100' });
    expect(r.ok).toBe(true);
    expect(r.valores?.telefone).toBe('21999998888');
    expect(r.valores?.cep).toBe('22640100');
    expect(r.valores?.dataNascimento).toBe('1990-05-10');
  });

  // ══════════════════════════════════════════════════════════════════════════
  // O CEP é ANÁLISE. Nunca pode custar uma decisão.
  // ══════════════════════════════════════════════════════════════════════════
  it('⚠️ sem CEP passa — o campo é opcional', () => {
    const r = validarDecisao(bom);
    expect(r.ok).toBe(true);
    expect(r.valores?.cep).toBeNull();
  });

  it('⚠️⚠️ CEP pela METADE não recusa a decisão — vira null', () => {
    // Este é o caso que decide o desenho: alguém digitou "226" e parou. Recusar
    // aqui perderia uma pessoa que acabou de decidir seguir a Jesus, por causa
    // de um dado que serve para desenhar um mapa.
    const r = validarDecisao({ ...bom, cep: '226' });
    expect(r.ok).toBe(true);
    expect(r.valores?.cep).toBeNull();
  });

  it('CEP com máscara, espaço ou letra vira só dígitos', () => {
    expect(validarDecisao({ ...bom, cep: ' 22640-100 ' }).valores?.cep).toBe('22640100');
    expect(validarDecisao({ ...bom, cep: 'cep 22640100' }).valores?.cep).toBe('22640100');
  });

  it('CEP longo demais não é truncado — vira null', () => {
    // ⚠️ Truncar daria um CEP ERRADO com cara de válido, e o trecho de 5
    // dígitos poria a pessoa no lugar errado do mapa.
    expect(validarDecisao({ ...bom, cep: '226401000' }).valores?.cep).toBeNull();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // O que permite ALCANÇAR a pessoa é obrigatório.
  // ══════════════════════════════════════════════════════════════════════════
  it('sem telefone válido recusa — decisão sem contato é pessoa que ninguém alcança', () => {
    expect(validarDecisao({ ...bom, telefone: '' }).campo).toBe('telefone');
    expect(validarDecisao({ ...bom, telefone: '9999-8888' }).campo).toBe('telefone');
    expect(validarDecisao({ ...bom, telefone: '219999988887' }).campo).toBe('telefone');
  });

  it('nome vazio ou de 1 letra recusa', () => {
    expect(validarDecisao({ ...bom, nome: '' }).campo).toBe('nome');
    expect(validarDecisao({ ...bom, nome: ' A ' }).campo).toBe('nome');
  });

  it('nascimento é obrigatório e usa a régua do Contrato de porta', () => {
    expect(validarDecisao({ ...bom, data_nascimento: '' }).campo).toBe('data_nascimento');
    // 31/02 não existe · ano < 1900 · data no futuro
    expect(validarDecisao({ ...bom, data_nascimento: '1990-02-31' }).campo).toBe('data_nascimento');
    expect(validarDecisao({ ...bom, data_nascimento: '1899-01-01' }).campo).toBe('data_nascimento');
    expect(validarDecisao({ ...bom, data_nascimento: '2030-01-01' }, { hoje: '2026-08-27' }).campo)
      .toBe('data_nascimento');
  });

  // ══════════════════════════════════════════════════════════════════════════
  // LGPD art. 11 · convicção religiosa é dado SENSÍVEL
  // ══════════════════════════════════════════════════════════════════════════
  it('⚠️⚠️ o aceite precisa ser o booleano TRUE, não um valor "parecido com sim"', () => {
    // A base legal é consentimento ESPECÍFICO. Aceitar truthy faria a string
    // "false", o número 1 ou "on" virarem prova de consentimento — que é
    // fabricar prova legal sobre convicção religiosa.
    expect(validarDecisao({ ...bom, aceite_lgpd: 'false' }).campo).toBe('aceite_lgpd');
    expect(validarDecisao({ ...bom, aceite_lgpd: 1 }).campo).toBe('aceite_lgpd');
    expect(validarDecisao({ ...bom, aceite_lgpd: 'on' }).campo).toBe('aceite_lgpd');
    expect(validarDecisao({ ...bom, aceite_lgpd: undefined }).campo).toBe('aceite_lgpd');
  });

  it('a ordem dos erros é a do formulário — o primeiro campo errado é o apontado', () => {
    // Quem chega com tudo em branco precisa ser mandado ao PRIMEIRO campo, não
    // ao último; senão a pessoa corrige um, envia, e leva outro erro.
    expect(validarDecisao({}).campo).toBe('nome');
  });

  it('nunca lança — devolve objeto mesmo com payload lixo', () => {
    expect(() => validarDecisao(null)).not.toThrow();
    expect(() => validarDecisao('texto')).not.toThrow();
    expect(validarDecisao(null).ok).toBe(false);
  });

  it('e-mail continua opcional (a porta nunca o exigiu)', () => {
    expect(validarDecisao(bom).valores?.email).toBeNull();
    expect(validarDecisao({ ...bom, email: ' a@b.com ' }).valores?.email).toBe('a@b.com');
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Nascimento OPCIONAL · flag do TOTEM de novo convertido (Marcos · 01/09)
  // ══════════════════════════════════════════════════════════════════════════
  it('nascimentoObrigatorio: false — vazio e inválido viram null, nunca recusa', () => {
    const opt = { nascimentoObrigatorio: false } as const;
    const semData = validarDecisao({ ...bom, data_nascimento: '' }, opt);
    expect(semData.ok).toBe(true);
    expect(semData.valores?.dataNascimento).toBeNull();
    // Inválido também passa como null (política do CEP: ninguém perde a
    // decisão por um campo que o fluxo declarou opcional).
    const invalida = validarDecisao({ ...bom, data_nascimento: '1990-02-31' }, opt);
    expect(invalida.ok).toBe(true);
    expect(invalida.valores?.dataNascimento).toBeNull();
    // E data VÁLIDA continua entrando normalmente.
    expect(validarDecisao(bom, opt).valores?.dataNascimento).toBe(bom.data_nascimento);
  });

  it('⚠️ o DEFAULT continua exigindo nascimento — a porta online não afrouxou', () => {
    // Mutante que este caso mata: trocar o default da flag pra false liberaria
    // a porta ONLINE sem ninguém decidir.
    expect(validarDecisao({ ...bom, data_nascimento: '' }).campo).toBe('data_nascimento');
    expect(validarDecisao({ ...bom, data_nascimento: '' }, {}).campo).toBe('data_nascimento');
  });
});

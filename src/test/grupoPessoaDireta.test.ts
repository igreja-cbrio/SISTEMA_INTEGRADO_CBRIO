import { describe, it, expect } from 'vitest';
import { validarPessoaDireta } from '../../backend/utils/pessoaDiretaCampos.js';

// ─────────────────────────────────────────────────────────────────────────────
// "Adicionar pessoa" no grupo (Marcos · 25/08/2026 · pedido do Pr. Nélio e da
// Natasha): o líder preenche e a pessoa já nasce dentro do grupo, sem WhatsApp
// e sem confirmação.
//
// ⚠️⚠️ O QUE ESTES CASOS PROTEGEM: esta é uma PORTA DE PESSOA operada por ~89
// líderes, no celular, no meio de um encontro. Afrouxar a validação enche a base
// de lixo; apertar faz o líder não usar a tela e a pessoa não entrar em lugar
// nenhum. O ponto de equilíbrio (nome + telefone obrigatórios, o resto validado
// SÓ quando vem) está fixado aqui.
// ─────────────────────────────────────────────────────────────────────────────

const base = { nome: 'Maria Aparecida Souza', telefone: '(21) 99876-5432' };

describe('obrigatórios: nome e telefone, e nada mais', () => {
  it('nome + telefone bastam', () => {
    const r = validarPessoaDireta(base);
    expect(r.ok).toBe(true);
    expect(r).toMatchObject({ nome: 'Maria Aparecida Souza', telefone: '21998765432' });
  });

  it('⚠️ NÃO exige CPF, nascimento nem sexo — eles saem NULOS', () => {
    // Exigi-los aqui repetiria o erro que travou a fila da membresia em 04/08:
    // campo que a tela não tem como preencher deixa o registro inalcançável.
    const r = validarPessoaDireta(base);
    expect(r).toMatchObject({ cpf: null, dataNascimento: null, genero: null, email: null });
  });

  it('nome com menos de 3 letras é recusado, apontando o campo', () => {
    expect(validarPessoaDireta({ ...base, nome: 'Jo' }))
      .toMatchObject({ ok: false, campo: 'nome' });
  });

  it('nome ausente é recusado (não vira string vazia gravada)', () => {
    expect(validarPessoaDireta({ telefone: '21998765432' })).toMatchObject({ ok: false, campo: 'nome' });
  });

  it('colapsa espaço repetido do nome', () => {
    expect(validarPessoaDireta({ ...base, nome: '  Ana   Paula  ' }).nome).toBe('Ana Paula');
  });
});

describe('telefone · normaliza como o resto do sistema', () => {
  it('guarda digits-only', () => {
    expect(validarPessoaDireta({ ...base, telefone: '+55 (21) 99876-5432' }).telefone).toBe('21998765432');
  });

  it('aceita fixo de 10 dígitos', () => {
    expect(validarPessoaDireta({ ...base, telefone: '2122334455' })).toMatchObject({ ok: true, telefone: '2122334455' });
  });

  it('menos de 10 dígitos é recusado', () => {
    expect(validarPessoaDireta({ ...base, telefone: '99876543' }))
      .toMatchObject({ ok: false, campo: 'telefone' });
  });

  it('⚠️ DDD 55 (Santa Maria/RS) NÃO perde o prefixo', () => {
    // Armadilha já registrada no projeto: `replace(/^55/,'')` destruiria todo
    // número legítimo de lá. `5522334455` tem 10 dígitos e é telefone completo.
    expect(validarPessoaDireta({ ...base, telefone: '5522334455' }).telefone).toBe('5522334455');
  });
});

describe('opcionais: validados SÓ quando vêm', () => {
  it('e-mail válido passa em minúsculas', () => {
    expect(validarPessoaDireta({ ...base, email: ' Maria@Exemplo.COM ' }).email).toBe('maria@exemplo.com');
  });

  it('e-mail inválido é recusado', () => {
    expect(validarPessoaDireta({ ...base, email: 'maria@' })).toMatchObject({ ok: false, campo: 'email' });
  });

  it('e-mail vazio não é erro', () => {
    expect(validarPessoaDireta({ ...base, email: '' })).toMatchObject({ ok: true, email: null });
  });

  it('nascimento válido é normalizado', () => {
    expect(validarPessoaDireta({ ...base, data_nascimento: '1990-04-20' }).dataNascimento).toBe('1990-04-20');
  });

  it('⚠️ nascimento no FUTURO é recusado, não gravado', () => {
    expect(validarPessoaDireta({ ...base, data_nascimento: '2099-01-01' }))
      .toMatchObject({ ok: false, campo: 'data_nascimento' });
  });

  it('⚠️ nascimento absurdo (ano < 1900) é recusado', () => {
    // A base já tem `1085-04-20` e `1886-03-15` de import — é dado real, e a
    // porta não pode continuar produzindo mais.
    expect(validarPessoaDireta({ ...base, data_nascimento: '1085-04-20' }))
      .toMatchObject({ ok: false, campo: 'data_nascimento' });
  });
});

describe('⚠️⚠️ sexo: masculino|feminino, NUNCA inferido nem "outro"', () => {
  it('aceita os dois valores canônicos', () => {
    expect(validarPessoaDireta({ ...base, genero: 'feminino' }).genero).toBe('feminino');
    expect(validarPessoaDireta({ ...base, genero: 'MASCULINO' }).genero).toBe('masculino');
  });

  it('⚠️ "outro" NÃO entra (Contrato de Inscrição · 28/07)', () => {
    expect(validarPessoaDireta({ ...base, genero: 'outro' }).genero).toBeNull();
  });

  it('⚠️ vocabulário curto M/F NÃO é aceito nesta coluna', () => {
    // `mem_membros.genero` é `masculino`/`feminino` — medido: ZERO linhas com
    // valor curto. Aceitar 'M' aqui gravaria o único registro que nenhum filtro
    // do sistema encontra depois.
    expect(validarPessoaDireta({ ...base, genero: 'M' }).genero).toBeNull();
  });

  it('⚠️ ausente fica NULL, nunca chutado a partir do nome', () => {
    // A lei de 10/08 proíbe GRAVAR sexo por palpite: errar isso constrange uma
    // pessoa real e decide em qual grupo ela pode entrar.
    expect(validarPessoaDireta({ nome: 'Maria Aparecida Souza', telefone: '21998765432' }).genero).toBeNull();
  });
});

describe('CPF: descartado quando não serve, sem recusar o cadastro', () => {
  it('11 dígitos passam pro matcher (que confere o DV)', () => {
    expect(validarPessoaDireta({ ...base, cpf: '123.456.789-09' }).cpf).toBe('12345678909');
  });

  it('⚠️ CPF incompleto é DESCARTADO e o cadastro CONTINUA válido', () => {
    // Mesma régua do gatilho do auth (04/08): CPF errado não pode virar
    // identidade errada, e travar o cadastro por causa dele deixaria a pessoa
    // fora do grupo.
    const r = validarPessoaDireta({ ...base, cpf: '123456' });
    expect(r).toMatchObject({ ok: true, cpf: null });
  });
});

describe('⚠️ função no grupo: visitante só quando DECLARADO', () => {
  it('o default é frequentador — adicionar de propósito é PARTICIPAÇÃO', () => {
    // Régua de 13/08 e da lei de 14/08.
    expect(validarPessoaDireta(base).funcao).toBe('frequentador');
  });

  it('visitante quando o líder marca', () => {
    expect(validarPessoaDireta({ ...base, funcao: 'visitante' }).funcao).toBe('visitante');
  });

  it('⚠️ função arbitrária NÃO passa — ninguém nasce líder por esta porta', () => {
    // Aceitar `funcao` cru daria a qualquer líder o poder de marcar liderança
    // (e liderança é o que decide quem GERENCIA o grupo desde 25/08).
    expect(validarPessoaDireta({ ...base, funcao: 'lider' }).funcao).toBe('frequentador');
    expect(validarPessoaDireta({ ...base, funcao: 'coordenador' }).funcao).toBe('frequentador');
    expect(validarPessoaDireta({ ...base, funcao: 'co_lider' }).funcao).toBe('frequentador');
  });
});

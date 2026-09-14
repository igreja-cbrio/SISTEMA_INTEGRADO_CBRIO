// Importação do E-Inscrição · régua de CONJUNTO
// (`backend/services/importarEInscricao.js` · 14/09/2026).
//
// A régua de LINHA tem gate próprio (`eInscricao.test.ts`). Aqui o que está sob
// teste é a decisão sobre o CONJUNTO: quem entra, quem cancela, quem fica de
// fora — a parte que a tela mostra ANTES de gravar e que decide se re-subir a
// mesma planilha duplica gente ou não.
//
// ⚠️ Mutantes que estes casos matam:
// - idempotência furada: re-subir a planilha inserir tudo de novo
// - reconhecer só pelo código da plataforma (quem pagou Pix aqui E comprou lá
//   entraria duas vezes) ou só pelo CPF (quem está sem CPF entraria de novo)
// - duas linhas iguais DENTRO do arquivo virarem duas inscrições
// - linha fora do contrato (sem CPF/telefone/e-mail/nascimento/sexo) escapar
//   pro INSERT e derrubar a importação no meio
// - cancelamento lá cancelar inscrição que entrou pelo NOSSO Pix
// - menor sem responsável passar sem alerta na prévia
// - `decodificarCsv` olhar o nome do arquivo em vez dos bytes
import { describe, expect, it } from 'vitest';
import * as ei from '../../backend/utils/eInscricao.js';
import * as imp from '../../backend/services/importarEInscricao.js';

const AGORA = new Date('2026-09-14T12:00:00Z');

/** Linha já mapeada, no formato que `mapearLinhaEInscricao` devolve. */
function linha(over: any = {}) {
  return {
    nome_completo: 'Fulano de Teste',
    cpf: '21014136717',
    email: 'fulano@exemplo.com',
    telefone: '21999990000',
    data_nascimento: '2000-05-10',
    sexo: 'masculino',
    endereco: 'Rua A, 1',
    dados: { e_inscricao: { codigo: 'AAA-111-BBB', valor_bruto_centavos: 85000 } },
    responsavel_nome: null,
    status: 'confirmada',
    origem: 'e_inscricao',
    valor_cobrado_centavos: 80325,
    created_at: '2026-09-10T09:00:00-03:00',
    codigo_plataforma: 'AAA-111-BBB',
    avisos: [],
    ...over,
  };
}
/** Inscrição já viva no banco. */
function viva(over: any = {}) {
  return {
    id: 'id-1', codigo: 'CBR-2026-000408', nome_completo: 'Fulano de Teste',
    cpf: '21014136717', status: 'confirmada', origem: 'e_inscricao',
    dados: { e_inscricao: { codigo: 'AAA-111-BBB' } },
    ...over,
  };
}

describe('importarEInscricao · idempotência', () => {
  it('banco vazio: a linha entra', () => {
    const p = imp.planejar([linha()], [], { agora: AGORA });
    expect(p.inserir).toHaveLength(1);
    expect(p.pular).toHaveLength(0);
    expect(p.dinheiro.liquido_centavos).toBe(80325);
    expect(p.dinheiro.bruto_centavos).toBe(85000);
  });
  it('re-subir a MESMA planilha não insere nada', () => {
    const p = imp.planejar([linha()], [viva()], { agora: AGORA });
    expect(p.inserir).toHaveLength(0);
    expect(p.pular).toHaveLength(1);
    expect(p.pular[0].motivo).toContain('CBR-2026-000408');
  });
  it('reconhece pelo CPF mesmo sem o código da plataforma no banco', () => {
    // Quem pagou Pix AQUI e comprou também no cartão: uma pessoa, uma posição.
    const vivas = [viva({ origem: 'publico', codigo: 'CBR-2026-000340', dados: {} })];
    const p = imp.planejar([linha()], vivas, { agora: AGORA });
    expect(p.inserir).toHaveLength(0);
    expect(p.pular[0].motivo).toContain('CBR-2026-000340');
  });
  it('reconhece pelo código mesmo com CPF diferente no banco', () => {
    const p = imp.planejar([linha()], [viva({ cpf: null })], { agora: AGORA });
    expect(p.inserir).toHaveLength(0);
  });
  it('linha repetida DENTRO da planilha entra uma vez só', () => {
    const p = imp.planejar([linha(), linha()], [], { agora: AGORA });
    expect(p.inserir).toHaveLength(1);
    expect(p.pular).toHaveLength(1);
    expect(p.pular[0].motivo).toContain('repetida');
  });
});

describe('importarEInscricao · cancelamento', () => {
  it('cancelada lá + viva aqui (importada) → cancela aqui', () => {
    const p = imp.planejar([linha({ status: 'cancelada' })], [viva()], { agora: AGORA });
    expect(p.cancelar).toHaveLength(1);
    expect(p.cancelar[0].existente.id).toBe('id-1');
    expect(p.inserir).toHaveLength(0);
  });
  it('cancelada lá NÃO mexe em inscrição que entrou pelo nosso Pix', () => {
    // A plataforma não manda na porta que ela não vendeu: cancelar aqui apagaria
    // uma vaga paga no Pix por causa de um estorno de cartão de outra compra.
    const p = imp.planejar([linha({ status: 'cancelada' })], [viva({ origem: 'publico', dados: {} })], { agora: AGORA });
    expect(p.cancelar).toHaveLength(0);
    expect(p.pular).toHaveLength(1);
  });
  it('cancelada lá e nunca importada aqui: não vira inscrição', () => {
    const p = imp.planejar([linha({ status: 'cancelada' })], [], { agora: AGORA });
    expect(p.inserir).toHaveLength(0);
    expect(p.cancelar).toHaveLength(0);
    expect(p.pular).toHaveLength(1);
  });
  it('já cancelada nos dois lados não repete o cancelamento', () => {
    const p = imp.planejar([linha({ status: 'cancelada' })], [viva({ status: 'cancelada' })], { agora: AGORA });
    expect(p.cancelar).toHaveLength(0);
  });
});

describe('importarEInscricao · contrato da espinha', () => {
  it.each([
    ['cpf', 'CPF'],
    ['telefone', 'telefone'],
    ['email', 'e-mail'],
    ['data_nascimento', 'data de nascimento'],
    ['sexo', 'gênero'],
  ])('sem %s a linha NÃO vai pro INSERT', (campo, rotulo) => {
    const p = imp.planejar([linha({ [campo]: null })], [], { agora: AGORA });
    expect(p.inserir).toHaveLength(0);
    expect(p.invalidas).toHaveLength(1);
    expect(p.invalidas[0].faltam).toContain(rotulo);
  });
  it('linha inválida não contamina o dinheiro do plano', () => {
    const p = imp.planejar([linha({ cpf: null }), linha({ codigo_plataforma: 'ZZZ', dados: { e_inscricao: { codigo: 'ZZZ', valor_bruto_centavos: 85000 } } })], [], { agora: AGORA });
    expect(p.inserir).toHaveLength(1);
    expect(p.dinheiro.liquido_centavos).toBe(80325);
  });
});

describe('importarEInscricao · alertas da prévia', () => {
  it('menor sem responsável na planilha é apontado', () => {
    const p = imp.planejar([linha({ data_nascimento: '2012-01-01' })], [], { agora: AGORA });
    expect(p.inserir[0].alertas.join(' ')).toContain('menor sem responsável');
  });
  it('menor COM responsável não vira alerta', () => {
    const p = imp.planejar([linha({ data_nascimento: '2012-01-01', responsavel_nome: 'Mãe Teste' })], [], { agora: AGORA });
    expect(p.inserir[0].alertas).toHaveLength(0);
  });
  it('idade absurda vira alerta, não correção silenciosa', () => {
    // O caso real: "Laura Perassolli Moreno, nascida 16/03/2025" (quase certo
    // 2015). A data entra COMO VEIO e quem importa é avisado.
    const p = imp.planejar([linha({ data_nascimento: '2025-03-16' })], [], { agora: AGORA });
    expect(p.inserir[0].linha.data_nascimento).toBe('2025-03-16');
    expect(p.inserir[0].alertas.join(' ')).toContain('conferir a data de nascimento');
  });
  it('avisos do parser da linha chegam na prévia', () => {
    const p = imp.planejar([linha({ avisos: ['telefone não reconhecido'] })], [], { agora: AGORA });
    expect(p.inserir[0].alertas).toContain('telefone não reconhecido');
  });
  it('resposta que este evento não pergunta é apontada, não descartada', () => {
    const l = linha({ dados: { c_retiro_jesus: 'Sim', outra_coisa: 'X', e_inscricao: { codigo: 'AAA-111-BBB' } } });
    const p = imp.planejar([l], [], { agora: AGORA, keysEvento: new Set(['c_retiro_jesus']) });
    expect(p.keys_desconhecidas).toEqual(['outra_coisa']);
    expect(p.inserir[0].linha.dados.outra_coisa).toBe('X');
  });
});

describe('importarEInscricao · idade', () => {
  it('conta anos COMPLETOS (aniversário ainda não chegou)', () => {
    expect(imp.idadeEmAnos('2008-09-15', AGORA)).toBe(17);
    expect(imp.idadeEmAnos('2008-09-14', AGORA)).toBe(18);
    expect(imp.idadeEmAnos('2008-09-13', AGORA)).toBe(18);
    expect(imp.idadeEmAnos(null, AGORA)).toBeNull();
    expect(imp.idadeEmAnos('14/09/2008', AGORA)).toBeNull();
  });
});

describe('eInscricao · arquivo subido pela tela', () => {
  it('decodifica pelos BYTES: windows-1252 e UTF-8 dão o mesmo nome', () => {
    // "João" nas duas codificações — a exportação crua vem 1252, salva de novo
    // no Excel/Sheets vem UTF-8, e o nome do arquivo não diz qual é.
    expect(ei.decodificarCsv(Uint8Array.from([0x4a, 0x6f, 0xe3, 0x6f]))).toBe('João');
    expect(ei.decodificarCsv(new TextEncoder().encode('João'))).toBe('João');
  });
  it('recusa arquivo que não é a exportação do E-Inscrição', () => {
    expect(ei.faltamColunasEInscricao([])).toEqual(ei.COLUNAS_ESSENCIAIS);
    expect(ei.faltamColunasEInscricao([{ Nome: 'a', Telefone: 'b' }]).length).toBeGreaterThan(0);
  });
  it('aceita a exportação mesmo com pontuação diferente no cabeçalho', () => {
    const cab: any = {};
    for (const c of ei.COLUNAS_ESSENCIAIS) cab[`${c}?:`] = 'x';
    expect(ei.faltamColunasEInscricao([cab])).toEqual([]);
  });
});

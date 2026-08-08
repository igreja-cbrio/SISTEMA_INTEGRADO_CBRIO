import { describe, it, expect } from 'vitest';
import { sanearDadosApp } from '../../backend/utils/saneamentoInscricaoApp.js';
import { tirarCodigoPaisTelefone, validarNascimento, emailValido } from '../../backend/utils/camposContato.js';

// Contrato do saneamento do payload do app (auditoria 06/08/2026 · Onda 1).
//
// O dano MEDIDO em produção que estes testes protegem: 15 das 22 linhas de
// `app_inscricoes` chegaram com telefone de 13 dígitos começando em 55 (o
// PhoneInput grava "+55 (21) …" em profiles.telefone). O fanout só remove
// não-dígito, então o 55 seguia até `vol_inscricoes` — e o próprio dedup por
// telefone do fanout compara contra os 11 dígitos da base, ou seja não casa.
describe('sanearDadosApp · telefone (o dano medido)', () => {
  it('tira o 55 do telefone com 13 dígitos', () => {
    const { dados, ajustes } = sanearDadosApp({ telefone: '5521999998888' });
    expect(dados.telefone).toBe('21999998888');
    expect(ajustes).toContain('telefone');
  });

  it('aceita máscara e devolve só dígitos', () => {
    expect(sanearDadosApp({ telefone: '+55 (21) 99999-8888' }).dados.telefone).toBe('21999998888');
    expect(sanearDadosApp({ telefone: '(21) 3333-4444' }).dados.telefone).toBe('2133334444');
  });

  it('⚠️ DDD 55 (Santa Maria/RS) passa INTACTO', () => {
    // 55 + 9 dígitos = 11: é telefone de Santa Maria, não código de país.
    // Cortar o 55 aqui destruiria todo número de lá.
    const { dados } = sanearDadosApp({ telefone: '55999887766' });
    expect(dados.telefone).toBe('55999887766');
  });

  it('telefone inutilizável vira null (não string vazia, não lixo)', () => {
    expect(sanearDadosApp({ telefone: '' }).dados.telefone).toBeNull();
    expect(sanearDadosApp({ telefone: '996013179' }).dados.telefone).toBeNull(); // 9 dígitos, sem DDD
    expect(sanearDadosApp({ telefone: 'não tenho' }).dados.telefone).toBeNull();
    expect(sanearDadosApp({ telefone: null }).dados.telefone).toBeNull();
  });

  it('telefone já correto não entra na lista de ajustes', () => {
    const { dados, ajustes } = sanearDadosApp({ telefone: '21999998888' });
    expect(dados.telefone).toBe('21999998888');
    expect(ajustes).not.toContain('telefone');
  });
});

describe('sanearDadosApp · demais campos', () => {
  it('e-mail: normaliza caixa/espaço e descarta inválido', () => {
    expect(sanearDadosApp({ email: '  Fulano@CBRio.ORG ' }).dados.email).toBe('fulano@cbrio.org');
    expect(sanearDadosApp({ email: 'fulano' }).dados.email).toBeNull();
    expect(sanearDadosApp({ email: '' }).dados.email).toBeNull();
  });

  it('nascimento: aceita ISO válida e descarta impossível/futura', () => {
    const hoje = '2026-08-06';
    expect(sanearDadosApp({ data_nascimento: '1990-05-17' }, { hoje }).dados.data_nascimento).toBe('1990-05-17');
    expect(sanearDadosApp({ data_nascimento: '2026-02-31' }, { hoje }).dados.data_nascimento).toBeNull();
    expect(sanearDadosApp({ data_nascimento: '2027-01-01' }, { hoje }).dados.data_nascimento).toBeNull();
    expect(sanearDadosApp({ data_nascimento: '17/05/1990' }, { hoje }).dados.data_nascimento).toBeNull();
  });

  it('CPF fica só com dígitos, e o DV NÃO é julgado aqui', () => {
    // Quem exige CPF válido é o handler + o matcher. Anular CPF torto aqui
    // esconderia do gate que já existe no endpoint.
    expect(sanearDadosApp({ cpf: '123.456.789-09' }).dados.cpf).toBe('12345678909');
    expect(sanearDadosApp({ cpf: '111' }).dados.cpf).toBe('111');
    expect(sanearDadosApp({ cpf: '' }).dados.cpf).toBeNull();
  });

  it('nome: trim e colapso de espaço, sem mexer no conteúdo', () => {
    expect(sanearDadosApp({ nome: '  Marcos   Paulo  ' }).dados.nome).toBe('Marcos Paulo');
    expect(sanearDadosApp({ sobrenome: ' de   Almeida ' }).dados.sobrenome).toBe('de Almeida');
  });
});

describe('sanearDadosApp · o que ele NÃO faz (é onde mora o risco)', () => {
  it('NUNCA inventa chave que não veio no payload', () => {
    // Inventar `telefone: null` num pedido de oração mudaria o que o fanout lê.
    const { dados } = sanearDadosApp({ mensagem: 'orem por mim' });
    expect('telefone' in dados).toBe(false);
    expect('email' in dados).toBe(false);
    expect('cpf' in dados).toBe(false);
    expect(dados.mensagem).toBe('orem por mim');
  });

  it('preserva TODAS as chaves que os ramos do fanout leem', () => {
    // Remover/renomear qualquer uma destas quebra um ramo do trigger.
    const payload = {
      grupo_id: 'g-1', areas: ['kids', 'louvor'], nome_mae: 'Maria Silva',
      sobrenome: 'Almeida', tamanho_camisa: 'M', possui_deficiencia: false,
      deficiencia_descricao: null, observacoes: 'nada', observacao: 'nada',
      evento_id: 'e-1', membro_id: 'm-1', urgente: true, analise: { tema: 'saúde' },
    };
    const { dados } = sanearDadosApp(payload);
    for (const k of Object.keys(payload)) expect(k in dados).toBe(true);
    expect(dados.grupo_id).toBe('g-1');
    expect(dados.areas).toEqual(['kids', 'louvor']);
    expect(dados.possui_deficiencia).toBe(false);
    expect(dados.analise).toEqual({ tema: 'saúde' });
  });

  it('não muta o objeto recebido', () => {
    const original = { telefone: '5521999998888' };
    sanearDadosApp(original);
    expect(original.telefone).toBe('5521999998888');
  });

  it('NUNCA lança — payload vazio, null ou tipo inesperado', () => {
    expect(() => sanearDadosApp(undefined)).not.toThrow();
    expect(() => sanearDadosApp(null)).not.toThrow();
    expect(() => sanearDadosApp({ telefone: { obj: true } })).not.toThrow();
    expect(sanearDadosApp({}).dados).toEqual({});
  });

  it('nenhum ajuste = lista vazia (o log só sai quando mudou algo)', () => {
    expect(sanearDadosApp({ mensagem: 'oi' }).ajustes).toEqual([]);
  });
});

// As 3 réguas saíram de `services/inscricaoContrato.js` (que carrega o Supabase)
// pra `utils/camposContato.js` justamente pra poderem ser testadas aqui. O
// `inscricaoContrato` re-exporta as três — as 7 portas públicas não mudaram.
describe('camposContato · réguas que agora entram no gate', () => {
  it('tirarCodigoPaisTelefone só corta quando o resto é telefone completo', () => {
    expect(tirarCodigoPaisTelefone('5521999998888')).toBe('21999998888'); // 13
    expect(tirarCodigoPaisTelefone('552133334444')).toBe('2133334444');   // 12
    expect(tirarCodigoPaisTelefone('55999887766')).toBe('55999887766');   // 11 = DDD 55
    expect(tirarCodigoPaisTelefone('')).toBe('');
  });

  it('validarNascimento com "hoje" injetado (teste sem relógio da máquina)', () => {
    expect(validarNascimento('1990-05-17', '2026-08-06')).toBe('1990-05-17');
    expect(validarNascimento('2026-08-07', '2026-08-06')).toBeNull(); // futuro
    expect(validarNascimento('1899-12-31', '2026-08-06')).toBeNull(); // ano < 1900
    expect(validarNascimento('2026-02-31', '2026-08-06')).toBeNull(); // data inexistente
  });

  it('emailValido segue a regex única do sistema', () => {
    expect(emailValido('a@b.co')).toBe(true);
    expect(emailValido('a@b')).toBe(false);
    expect(emailValido('a b@c.co')).toBe(false);
  });
});

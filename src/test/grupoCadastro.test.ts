import { describe, it, expect } from 'vitest';
import { camposFaltantes, faltasPorCampo, ehDiario } from '@/lib/grupoCadastro';

// Régua da fila de trabalho da coordenação de Grupos (aba Grupos · chip
// "Cadastro incompleto", recorte por campo, selo da linha e checklist da ficha).
// ⚠️ O risco aqui NÃO é deixar de acusar — é ACUSAR FALTA QUE NÃO EXISTE:
// lista que manda a pessoa abrir um grupo e não achar nada errado deixa de ser
// lida, e aí a falta real passa junto.

// Cadastro completo de verdade, medido contra o formato que a rota devolve.
const completo = {
  lider_id: 'uuid-lider',
  lider_telefone: '21999990000',
  dia_semana: 3,
  horario: '20:00',
  endereco: 'Avenida das Américas 9707',
  eh_online: false,
  endereco_publico: 'Avenida das Américas 9707',
  endereco_tem_numero: true,
  bairro: 'Barra da Tijuca',
  faixa_etaria: 'Todas as idades',
  categoria: 'Misto',
  rede_id: 'uuid-rede',
  nome: 'GRUPO DE CONEXÃO - BARRA',
};

describe('camposFaltantes · cadastro completo', () => {
  it('não inventa pendência num grupo completo', () => {
    expect(camposFaltantes(completo)).toEqual([]);
  });

  it('aceita o telefone do líder pelas duas formas (lista e detalhe)', () => {
    const { lider_telefone, ...semTel } = completo;
    expect(camposFaltantes({ ...semTel, lider: { telefone: '21988887777' } })).toEqual([]);
    expect(camposFaltantes(semTel)).toContain('Telefone do líder');
  });

  it('líder APAGADO é pendência própria, não "falta o telefone"', () => {
    // O grupo aponta pra um cadastro morto — e é pra ele que vai o WhatsApp do
    // grupo. Chamar isso de "telefone faltando" manda a coordenação preencher
    // um telefone em vez de trocar o líder.
    const g = { ...completo, lider_apagado: true, lider_telefone: null };
    expect(camposFaltantes(g)).toEqual(['Líder (cadastro apagado)']);
    // com telefone gravado na linha, continua sendo o líder que está apagado
    expect(camposFaltantes({ ...completo, lider_apagado: true })).toEqual(['Líder (cadastro apagado)']);
  });

  it('sem `lider_apagado` (servidor antigo) vale o teste de telefone de sempre', () => {
    const { lider_telefone, ...semTel } = completo;
    expect(camposFaltantes(semTel)).toEqual(['Telefone do líder']);
  });

  it('grupo diário não deve dia da semana', () => {
    expect(ehDiario({ recorrencia: 'Diario' })).toBe(true);
    expect(camposFaltantes({ ...completo, dia_semana: null, recorrencia: 'diario' })).toEqual([]);
    expect(camposFaltantes({ ...completo, dia_semana: null })).toContain('Dia da semana');
  });
});

describe('camposFaltantes · endereço (Natasha · 16/09)', () => {
  it('cobra o NÚMERO quando o servidor diz que a rua está sem ele', () => {
    const g = { ...completo, endereco: 'RUA CRUZ DE MALTA', endereco_publico: 'Rua Cruz de Malta', endereco_tem_numero: false };
    expect(camposFaltantes(g)).toEqual(['Número no endereço']);
  });

  it('"(endereço não informado)" é pendência de ENDEREÇO, não de número', () => {
    // A string está preenchida — antes disso o cadastro passava como completo.
    const g = { ...completo, endereco: '(endereço não informado)', endereco_publico: null, endereco_tem_numero: false };
    expect(camposFaltantes(g)).toEqual(['Endereço']);
  });

  it('endereço vazio é uma pendência só, nunca duas', () => {
    const g = { ...completo, endereco: '', endereco_publico: null, endereco_tem_numero: false };
    expect(camposFaltantes(g)).toEqual(['Endereço']);
  });

  it('grupo ONLINE não deve endereço nem número', () => {
    const g = { ...completo, eh_online: true, endereco: 'Online', endereco_publico: null, endereco_tem_numero: false };
    expect(camposFaltantes(g)).toEqual([]);
  });

  it('⚠️ servidor ANTIGO (sem os derivados) não acusa falta que não foi medida', () => {
    // Bundle novo contra backend antigo: `endereco_publico`/`endereco_tem_numero`
    // chegam undefined. Vale o comportamento de sempre — só ausência de endereço.
    const { eh_online, endereco_publico, endereco_tem_numero, ...antigo } = completo;
    expect(camposFaltantes({ ...antigo, endereco: 'RUA CRUZ DE MALTA' })).toEqual([]);
    expect(camposFaltantes({ ...antigo, endereco: null })).toEqual(['Endereço']);
  });
});

describe('camposFaltantes · faixa etária', () => {
  it('grupo com cara de faixa etária sem limites numéricos vira pendência', () => {
    expect(camposFaltantes({ ...completo, faixa_etaria: 'Jovens' })).toContain('Idades da faixa (mín/máx)');
    expect(camposFaltantes({ ...completo, nome: 'JOVENS - ESTUDO DA MENSAGEM' })).toContain('Idades da faixa (mín/máx)');
  });

  it('um dos dois limites já basta', () => {
    expect(camposFaltantes({ ...completo, faixa_etaria: 'Jovens', idade_min: 15 })).toEqual([]);
  });

  it('grupo geral não precisa de limites', () => {
    expect(camposFaltantes({ ...completo, faixa_etaria: 'Todas as idades' })).toEqual([]);
  });
});

describe('faltasPorCampo · a fila de trabalho', () => {
  it('conta por campo e ordena pelo maior lote', () => {
    const lista = [
      { ...completo, rede_id: null },
      { ...completo, rede_id: null },
      { ...completo, rede_id: null, endereco_tem_numero: false },
      completo,
    ];
    expect(faltasPorCampo(lista)).toEqual([['Rede', 3], ['Número no endereço', 1]]);
  });

  it('lista vazia devolve fila vazia (nunca quebra a tela)', () => {
    expect(faltasPorCampo([])).toEqual([]);
    expect(faltasPorCampo(null as never)).toEqual([]);
  });

  it('um grupo com N faltas conta em CADA campo — a soma passa do nº de grupos', () => {
    // É por isso que a tela mostra a contagem por campo ao lado do total, e não
    // no lugar dele: somar os chips não dá o número de grupos incompletos.
    const fila = faltasPorCampo([{ ...completo, rede_id: null, categoria: null, bairro: null }]);
    expect(fila.map(([c]) => c).sort()).toEqual(['Bairro', 'Categoria', 'Rede']);
    expect(fila.reduce((s, [, q]) => s + q, 0)).toBe(3);
  });
});

// ⚠️⚠️ CAMPO ESCONDIDO NÃO PODE BLOQUEAR O AVANÇO — nem por "falta responder",
// nem por formato inválido.
//
// Isto virou teste por um caso real: em 21/09/2026 o Matheus relatou que
// *"tem pessoas querendo preencher o censo, mas sao da europa e nao estao
// conseguindo preencher o cep"*. O campo CEP era `obrigatoria: true` com
// `formato: 'cep'`, e a máscara (`mascaraCep`) **apaga tudo que não é dígito** e
// exige exatamente 8. Um CEP de Portugal (`1000-100`) vira 7 dígitos; do Reino
// Unido (`SW1A 1AA`) vira `11`. `bloqueios()` então travava o avanço, e não
// havia saída: bloqueio TOTAL para quem mora fora do Brasil.
//
// ⚠️ A ausência de dado ERA o sintoma: zero cidades estrangeiras entre as 1.356
// respostas concluídas, e as 4 travadas sem CEP válido eram brasileiras com o
// número incompleto. Quem morava fora não chegava a existir no banco — por isso
// o relato de gente para o Matheus era a única evidência possível.
//
// O conserto foi no QUESTIONÁRIO (dado, não código): uma pergunta "Onde você
// mora?" antes do CEP, e `mostrar_se: {pergunta:'pais', valores:['Brasil']}` no
// CEP e no bairro. Só funciona porque `bloqueios()` respeita `visivel()` — esta
// é a propriedade que o conserto inteiro apoia, e é ela que este arquivo trava.
import { describe, it, expect } from 'vitest';
import { bloqueios, visivel } from '@/lib/censoForm';

type P = Parameters<typeof bloqueios>[0][number];

const QUESTIONARIO = [
  { id: 'pais', tipo: 'opcao_unica', texto: 'Onde você mora?', opcoes: ['Brasil', 'Moro fora do Brasil'], obrigatoria: true },
  { id: 'pais_outro', tipo: 'texto_curto', texto: 'Em que país você mora?', obrigatoria: true, mostrar_se: { pergunta: 'pais', valores: ['Moro fora do Brasil'] } },
  { id: 'p9_cep', tipo: 'texto_curto', texto: 'CEP', formato: 'cep', obrigatoria: true, mostrar_se: { pergunta: 'pais', valores: ['Brasil'] } },
  { id: 'cidade', tipo: 'texto_curto', texto: 'Cidade', obrigatoria: true },
  { id: 'bairro', tipo: 'texto_curto', texto: 'Bairro', obrigatoria: true, mostrar_se: { pergunta: 'pais', valores: ['Brasil'] } },
] as unknown as P[];

const ids = (r: Record<string, unknown>) => bloqueios(QUESTIONARIO, r as never).map((b) => b.id).sort();

describe('⚠️⚠️ quem mora fora do Brasil consegue terminar o censo', () => {
  it('CEP e bairro somem; a pergunta do país aparece', () => {
    const r = { pais: 'Moro fora do Brasil' };
    expect(visivel(QUESTIONARIO[2], r as never)).toBe(false);
    expect(visivel(QUESTIONARIO[4], r as never)).toBe(false);
    expect(visivel(QUESTIONARIO[1], r as never)).toBe(true);
  });

  it('⚠️ e o CEP NÃO trava mais o avanço', () => {
    expect(
      ids({ pais: 'Moro fora do Brasil', pais_outro: 'Portugal', cidade: 'Lisboa' }),
      'era o bloqueio total: sem CEP brasileiro não havia como concluir',
    ).toEqual([]);
  });

  // ⚠️⚠️ O CAMINHO REAL DE QUEM ESTÁ NA EUROPA: a pessoa tenta o CEP de lá,
  // a máscara come as letras e sobra lixo, ela percebe e troca para "moro fora".
  // O valor digitado FICA no rascunho. Se `invalidos()` não respeitasse a
  // visibilidade, ela continuaria travada por um campo que não vê mais — e o
  // conserto teria resolvido só metade do problema. Mutante rodado: tirar o
  // `visivel` de `invalidos()` faz este caso reprovar.
  it('⚠️ CEP inválido digitado ANTES de trocar o país não trava mais nada', () => {
    expect(
      ids({ pais: 'Moro fora do Brasil', pais_outro: 'Portugal', cidade: 'Lisboa', p9_cep: '1000100' }),
      'o rascunho guarda o que ela digitou antes de perceber que o campo não servia',
    ).toEqual([]);
  });

  it('a cidade continua obrigatória para todo mundo — texto livre serve em qualquer país', () => {
    expect(ids({ pais: 'Moro fora do Brasil', pais_outro: 'Portugal' })).toEqual(['cidade']);
  });

  it('⚠️ e o país é obrigatório: sem ele, CEP e bairro ficam escondidos e ninguém informa endereço', () => {
    expect(ids({ cidade: 'Rio' })).toEqual(['pais']);
  });
});

describe('quem mora no Brasil continua sendo cobrado igual', () => {
  it('CEP e bairro voltam a ser obrigatórios', () => {
    expect(ids({ pais: 'Brasil', cidade: 'Rio de Janeiro' })).toEqual(['bairro', 'p9_cep']);
  });

  it('⚠️ CEP brasileiro INCOMPLETO continua barrado — o conserto não afrouxou a régua', () => {
    expect(
      ids({ pais: 'Brasil', cidade: 'Rio', bairro: 'Barra da Tijuca', p9_cep: '22793-5' }),
      'foi assim que 4 pessoas ficaram com rascunho preso em agosto',
    ).toEqual(['p9_cep']);
  });

  it('CEP completo passa', () => {
    expect(ids({ pais: 'Brasil', cidade: 'Rio', bairro: 'Barra da Tijuca', p9_cep: '22793-520' })).toEqual([]);
  });
});

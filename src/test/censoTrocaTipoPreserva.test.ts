import { describe, it, expect } from 'vitest';
import { trocarTipoPergunta } from '../lib/censoConstrutor';

/**
 * ⚠️⚠️ Achado em 10/09/2026: `trocarTipoPergunta` descartava `preenche_de` —
 * o DESTINO da resposta no cadastro da pessoa. Trocar o tipo de uma pergunta
 * no construtor fazia o censo parar de preencher CPF/nascimento/bairro **sem
 * nenhum aviso**: a pergunta continuava no ar e a pessoa continuava
 * respondendo. Medido: 10 das 32 perguntas do censo vivo têm `preenche_de`.
 */
describe('censoConstrutor · trocar tipo não apaga configuração', () => {
  it('preserva preenche_de (o destino no cadastro)', () => {
    const p = { id: 'telefone', tipo: 'texto_curto', texto: 'Telefone', preenche_de: 'telefone' };
    expect(trocarTipoPergunta(p, 'texto_longo').preenche_de).toBe('telefone');
  });

  it.each(['cpf', 'data_nascimento', 'bairro', 'cep', 'estado_civil', 'escolaridade'])
    ('preserva preenche_de = %s', (destino) => {
      const p = { id: 'x', tipo: 'texto_curto', texto: 'X', preenche_de: destino };
      expect(trocarTipoPergunta(p, 'opcao_unica').preenche_de).toBe(destino);
    });

  it('quem não tem preenche_de continua sem (não inventa destino)', () => {
    const p = { id: 'x', tipo: 'texto_curto', texto: 'X' };
    expect(trocarTipoPergunta(p, 'texto_longo').preenche_de).toBeUndefined();
  });

  it('preserva catalogo e permite_outro ao continuar em busca', () => {
    const p = { id: 'igreja_anterior_nome', tipo: 'busca', texto: 'Qual era a igreja?',
                catalogo: 'igrejas_rj', permite_outro: true };
    const r = trocarTipoPergunta(p, 'busca');
    expect(r.catalogo).toBe('igrejas_rj');
    expect(r.permite_outro).toBe(true);
  });

  // ⚠️ Catálogo só vale em `busca` — o servidor recusa com 400 em outro tipo.
  it('NÃO leva catalogo para um tipo que não é busca', () => {
    const p = { id: 'x', tipo: 'busca', texto: 'X', catalogo: 'igrejas_rj', permite_outro: true };
    const r = trocarTipoPergunta(p, 'opcao_unica');
    expect(r.catalogo).toBeUndefined();
    expect(r.permite_outro).toBeUndefined();
  });

  it('o que já era preservado continua (id, texto, condicional)', () => {
    const p = { id: 'meu_id', tipo: 'texto_curto', texto: 'Pergunta',
                mostrar_se: { pergunta: 'mae', valores: ['Sim'] }, preenche_de: 'bairro' };
    const r = trocarTipoPergunta(p, 'multipla');
    expect(r.id).toBe('meu_id');            // id novo zeraria o gráfico
    expect(r.texto).toBe('Pergunta');
    expect(r.mostrar_se).toEqual({ pergunta: 'mae', valores: ['Sim'] });
    expect(r.preenche_de).toBe('bairro');
  });

  it('seção continua limpando o que não faz sentido nela', () => {
    const p = { id: 's', tipo: 'texto_curto', texto: 'S', obrigatoria: true, sensivel: true,
                mostrar_se: { pergunta: 'm', valores: ['Sim'] } };
    const r = trocarTipoPergunta(p, 'secao');
    expect(r.obrigatoria).toBeUndefined();
    expect(r.mostrar_se).toBeUndefined();
  });
});

import { describe, it, expect } from 'vitest';
import { moduloDoContexto, diaBrt, MAPA, PADRAO } from '../../backend/utils/whatsappModulo.js';

// Slugs conferidos no catálogo `modulos` do banco vivo em 2026-08-05 (todos
// existem e estão ativos). ⚠️ Módulo inexistente aqui NÃO dá erro: o
// `resolverDestinatarios` não acha regra e o aviso cai no fallback de TODOS os
// admin/diretor — exatamente o bug que este arquivo existe pra impedir.
const SLUGS_REAIS = new Set([
  'voluntariado', 'kids', 'integracao', 'membresia',
  'solicitacoes', 'financeiro', 'inscricoes', 'next', 'grupos',
  // + 14/08 (C2 lote 5): 'cuidados' — conferido no catálogo (o módulo
  // /ministerial/cuidados usa authorizeModule('cuidados') há meses).
  'cuidados',
]);

describe('moduloDoContexto · quem é avisado quando o WhatsApp não chega', () => {
  it('⚠️ MUTATION-TEST DA CAUSA RAIZ: o prefixo do contexto NÃO é o módulo', () => {
    // Era `contexto.split('.')[0]`, que devolvia 'app' — módulo que NÃO existe.
    // Se alguém "simplificar" de volta pro split, este teste fica vermelho.
    const prefixo = 'app.aniversario'.split('.')[0];
    expect(prefixo).toBe('app');
    expect(SLUGS_REAIS.has(prefixo)).toBe(false);

    expect(moduloDoContexto('app.aniversario').modulo).toBe('voluntariado');
  });

  it('o aniversário é do Ministério do Voluntariado, com link pra tela dele', () => {
    expect(moduloDoContexto('app.aniversario')).toEqual({
      modulo: 'voluntariado', link: '/voluntariado',
    });
    expect(moduloDoContexto('app.escala_voluntario').modulo).toBe('voluntariado');
  });

  it('chave específica vence a genérica (app.kids_* não cai no padrão)', () => {
    expect(moduloDoContexto('app.kids_vinculo').modulo).toBe('kids');
    expect(moduloDoContexto('app.doacao_recebida').modulo).toBe('financeiro');
  });

  it('preserva o roteamento que a fila já tinha pro grupos', () => {
    expect(moduloDoContexto('grupos.pedido_novo_lider')).toEqual({
      modulo: 'grupos', link: '/grupos',
    });
  });

  it('casa por prefixo de contexto, não só igualdade exata', () => {
    expect(moduloDoContexto('censo.convite_atualizacao').modulo).toBe('membresia');
    expect(moduloDoContexto('inscricoes.confirmacao').modulo).toBe('inscricoes');
  });

  it('contexto desconhecido/vazio NÃO fica sem dono (padrão integracao)', () => {
    for (const c of ['sei_la', '', null, undefined, '   ']) {
      expect(moduloDoContexto(c as string).modulo).toBe('integracao');
    }
  });

  it('é insensível a caixa e a espaço nas pontas', () => {
    expect(moduloDoContexto('  APP.Aniversario  ').modulo).toBe('voluntariado');
  });

  it('TODO módulo do mapa existe no catálogo (senão o aviso vira spam de admin)', () => {
    for (const [chave, destino] of MAPA as [string, { modulo: string }][]) {
      expect(SLUGS_REAIS.has(destino.modulo), `${chave} → ${destino.modulo}`).toBe(true);
    }
    expect(SLUGS_REAIS.has((PADRAO as { modulo: string }).modulo)).toBe(true);
  });

  it('diaBrt usa o fuso da igreja, não UTC', () => {
    // 05/08 às 22h BRT = 06/08 01h UTC. `toISOString().slice(0,10)` cru diria 06.
    const noiteBrt = new Date('2026-08-06T01:00:00Z');
    expect(noiteBrt.toISOString().slice(0, 10)).toBe('2026-08-06'); // o jeito errado
    expect(diaBrt(noiteBrt)).toBe('2026-08-05');                    // o certo
  });
});

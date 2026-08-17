import { describe, it, expect } from 'vitest';
import {
  moduloDaAreaEvento, normalizarArea, MAPA, AREAS_SEM_MODULO,
} from '../../backend/utils/moduloDaAreaEvento.js';

// Catálogo `areas` (ativas) lido no banco vivo em 2026-08-17. É a lista INTEIRA:
// o teste exige que toda área do catálogo esteja decidida — mapeada pra um
// módulo ou declarada como "não tem módulo". Área nova sem decisão fica
// vermelha aqui em vez de virar silêncio em produção.
const AREAS_REAIS = [
  'AMI', 'Bridge', 'Cuidados', 'Financeiro', 'Grupos', 'Infraestrutura',
  'Integração', 'KIDS', 'Logística', 'Louvor', 'Marketing', 'Next', 'Online',
  'Patrimônio', 'Produção', 'RH/Administrativo', 'Sede', 'TI', 'Voluntariado',
];

// Slugs conferidos no catálogo `modulos` do banco vivo em 2026-08-17 (todos
// existem e estão ativos). ⚠️ Slug inventado aqui NÃO dá erro: o
// `resolverDestinatarios` não acha regra, cai no fallback de admin/diretor e
// ninguém a mais é avisado — exatamente o bug que este arquivo existe pra fechar.
const SLUGS_REAIS = new Set([
  'ami', 'bridge', 'cuidados', 'financeiro', 'grupos', 'integracao', 'kids',
  'logistica', 'marketing', 'next', 'online', 'patrimonio', 'producao', 'rh',
  'voluntariado',
]);

describe('moduloDaAreaEvento · quem é avisado da inscrição de um evento', () => {
  it('⚠️ O CASO QUE ORIGINOU (Celebra 2026): área Voluntariado → módulo voluntariado', () => {
    // O Celebra é o formulário dos voluntários e o aviso sai pelo módulo
    // `inscricoes`, que não tem regra própria. É esta linha que faz o aviso
    // também chegar a quem tem regra no módulo `voluntariado`.
    expect(moduloDaAreaEvento('Voluntariado')).toBe('voluntariado');
  });

  it('área SEM módulo devolve null — não inventa slug', () => {
    // Sede é a igreja toda; Louvor/TI/Infraestrutura não são módulos do sistema.
    // Devolver um slug aqui faria o resolver procurar regra de módulo
    // inexistente: sem erro, sem destinatário e sem ninguém descobrir.
    for (const area of ['Sede', 'Louvor', 'TI', 'Infraestrutura']) {
      expect(moduloDaAreaEvento(area)).toBeNull();
    }
  });

  it('acento e caixa não decidem nada (o nome da área é digitado por humano)', () => {
    expect(moduloDaAreaEvento('Produção')).toBe('producao');
    expect(moduloDaAreaEvento('PRODUCAO')).toBe('producao');
    expect(moduloDaAreaEvento('produção')).toBe('producao');
    expect(moduloDaAreaEvento('Logística')).toBe('logistica');
    expect(moduloDaAreaEvento('Patrimônio')).toBe('patrimonio');
    expect(moduloDaAreaEvento('Integração')).toBe('integracao');
    expect(moduloDaAreaEvento('  Voluntariado  ')).toBe('voluntariado');
  });

  it('⚠️ MUTATION-TEST: comparar CRU (sem normalizar) perde a maioria das áreas', () => {
    // Se alguém "simplificar" pra `MAPA[area]`, estas ficam de fora — e o
    // sintoma é o mesmo do bug original: ninguém a mais é avisado, em silêncio.
    for (const area of ['Produção', 'Logística', 'Patrimônio', 'Integração', 'KIDS']) {
      expect((MAPA as Record<string, string>)[area]).toBeUndefined();
      expect(moduloDaAreaEvento(area)).not.toBeNull();
    }
  });

  it('a área que não é área nenhuma devolve null', () => {
    expect(moduloDaAreaEvento('')).toBeNull();
    expect(moduloDaAreaEvento(null as unknown as string)).toBeNull();
    expect(moduloDaAreaEvento(undefined as unknown as string)).toBeNull();
    expect(moduloDaAreaEvento('Área que não existe')).toBeNull();
  });

  it('RH/Administrativo (nome com barra) casa com o módulo rh', () => {
    expect(moduloDaAreaEvento('RH/Administrativo')).toBe('rh');
  });

  it('toda área do catálogo está DECIDIDA — mapeada ou declarada sem módulo', () => {
    for (const area of AREAS_REAIS) {
      const slug = moduloDaAreaEvento(area);
      const declaradaSemModulo = AREAS_SEM_MODULO.includes(normalizarArea(area));
      expect(
        slug !== null || declaradaSemModulo,
        `área "${area}" não está no mapa nem declarada em AREAS_SEM_MODULO`,
      ).toBe(true);
    }
  });

  it('todo slug do mapa existe de verdade no catálogo de módulos', () => {
    for (const [area, slug] of Object.entries(MAPA)) {
      expect(SLUGS_REAIS.has(slug as string), `slug "${slug}" (área ${area}) não existe em modulos`).toBe(true);
    }
  });

  it('nenhuma área declarada "sem módulo" está também mapeada', () => {
    for (const area of AREAS_SEM_MODULO) {
      expect((MAPA as Record<string, string>)[area]).toBeUndefined();
    }
  });
});

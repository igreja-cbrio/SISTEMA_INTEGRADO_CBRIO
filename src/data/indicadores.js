/**
 * Constantes de areas e categorias da igreja.
 *
 * NOTA HISTORICA: ate 2026-04-30 este arquivo continha um array INDICADORES
 * com 60 KPIs hardcoded. Foi removido — a fonte de verdade agora e o banco
 * (kpi_indicadores_taticos) acessado via hook useKpis().
 *
 * O que ficou aqui sao constantes que nao mudam: as 11 areas da igreja
 * e as 5 categorias. Se um dia precisar editar areas via UI, mudamos pra
 * tabela tambem.
 */

export const CATEGORIAS = ['Ministerial', 'Geracional', 'Institucional', 'Criativo', 'Operacoes'];

export const AREAS = [
  { id: 'AMI', nome: 'AMI', categoria: 'Geracional' },
  { id: 'CBA', nome: 'CBA', categoria: 'Ministerial' },
  { id: 'CBKids', nome: 'CBKids', categoria: 'Geracional' },
  { id: 'Cuidados', nome: 'Cuidados', categoria: 'Ministerial' },
  { id: 'Grupos', nome: 'Grupos', categoria: 'Ministerial' },
  { id: 'Integracao', nome: 'Integração', categoria: 'Ministerial' },
  { id: 'Voluntariado', nome: 'Voluntariado', categoria: 'Ministerial' },
  { id: 'NEXT', nome: 'NEXT', categoria: 'Ministerial' },
  { id: 'Generosidade', nome: 'Generosidade', categoria: 'Ministerial' },
  { id: 'Jornada', nome: 'Jornada (cross-cutting)', categoria: 'Institucional' },
  { id: 'Igreja', nome: 'Igreja (institucional)', categoria: 'Institucional' },
];

export const CATEGORIA_AREAS = {
  Ministerial: ['CBA', 'Cuidados', 'Grupos', 'Integracao', 'Voluntariado', 'NEXT', 'Generosidade'],
  Geracional: ['AMI', 'CBKids'],
  Institucional: ['Jornada', 'Igreja'],
  Criativo: [],
  Operacoes: [],
};

export const getAreasForCategoria = (cat) => CATEGORIA_AREAS[cat] || [];
export const getAreaNome = (id) => AREAS.find(a => a.id === id)?.nome || id;

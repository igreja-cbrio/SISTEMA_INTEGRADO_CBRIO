/**
 * 60 KPIs vigentes - sincronizado com planilha "Metas e Indicadores 2026" (OneDrive)
 * Config Indicadores + abas de preenchimento como fonte.
 * Atualizado: 29/04/2026
 */

export const CATEGORIAS = ['Ministerial', 'Geracional', 'Criativo', 'Operacoes'];

export const AREAS = [
  { id: 'AMI', nome: 'AMI', categoria: 'Geracional' },
  { id: 'CBA', nome: 'CBA', categoria: 'Ministerial' },
  { id: 'CBKids', nome: 'CBKids', categoria: 'Geracional' },
  { id: 'Cuidados', nome: 'Cuidados', categoria: 'Ministerial' },
  { id: 'Grupos', nome: 'Grupos', categoria: 'Ministerial' },
  { id: 'Integracao', nome: 'Integra\u00e7\u00e3o', categoria: 'Ministerial' },
  { id: 'Voluntariado', nome: 'Voluntariado', categoria: 'Ministerial' },
  { id: 'NEXT', nome: 'NEXT', categoria: 'Ministerial' },
  { id: 'Generosidade', nome: 'Generosidade', categoria: 'Ministerial' },
];

export const CATEGORIA_AREAS = {
  Ministerial: ['CBA', 'Cuidados', 'Grupos', 'Integracao', 'Voluntariado', 'NEXT', 'Generosidade'],
  Geracional: ['AMI', 'CBKids'],
  Criativo: [],
  Operacoes: [],
};

export const INDICADORES = [
  // AMI (9)
  { id: 'AMI-01', area: 'AMI', nome: 'Frequ\u00eancia AMI (presentes no culto)', periodicidade: 'Semanal', unidade: 'pessoas', pilar: 'Crescimento', meta_2026: 'Aumento 30% com base de 200' },
  { id: 'AMI-02', area: 'AMI', nome: 'Convers\u00f5es AMI', periodicidade: 'Semanal', unidade: 'pessoas', pilar: 'Evangelismo', meta_2026: '1% do p\u00fablico alvo presen\u00e7a' },
  { id: 'AMI-03', area: 'AMI', nome: 'Presen\u00e7a Escola de Disc\u00edpulos', periodicidade: 'Semanal', unidade: 'pessoas', pilar: 'Crescimento', meta_2026: '+50% em 6m (base 70/sem)' },
  { id: 'AMI-04', area: 'AMI', nome: 'Presen\u00e7a NEXT', periodicidade: 'Mensal', unidade: 'pessoas', pilar: 'Crescimento', meta_2026: 'Dobrar inscritos + 1 encontro/m\u00eas' },
  { id: 'AMI-05', area: 'AMI', nome: 'Frequ\u00eancia Bridge', periodicidade: 'Semanal', unidade: 'pessoas', pilar: 'Crescimento', meta_2026: 'Alcan\u00e7ar m\u00e9dia de 100 presentes' },
  { id: 'AMI-06', area: 'AMI', nome: 'Convers\u00f5es Bridge', periodicidade: 'Semanal', unidade: 'pessoas', pilar: 'Evangelismo', meta_2026: '1% do p\u00fablico alvo presen\u00e7a' },
  { id: 'AMI-07', area: 'AMI', nome: 'Presen\u00e7a grupo de pais Bridge', periodicidade: 'Semanal', unidade: 'pessoas', pilar: 'Comunh\u00e3o', meta_2026: 'Monitorar' },
  { id: 'AMI-08', area: 'AMI', nome: 'N\u00ba grupos AMI / inscritos / l\u00edderes', periodicidade: 'Mensal', unidade: 'unidades', pilar: 'Comunh\u00e3o', meta_2026: '50% jovens em grupos (6m), 70% (12m)' },
  { id: 'AMI-09', area: 'AMI', nome: 'Batismos AMI', periodicidade: 'Mensal', unidade: 'batismos', pilar: 'Evangelismo', meta_2026: '3/m\u00eas (1\u00ba sem) e 5/m\u00eas (2\u00ba sem)' },

  // CBA (12)
  { id: 'CBA-01', area: 'CBA', nome: '% Batismos / Convers\u00f5es', periodicidade: 'Mensal', unidade: '%', pilar: 'Evangelismo', meta_2026: '20% (6m), 50% (12m)' },
  { id: 'CBA-02', area: 'CBA', nome: '% Sucesso Interessados Iniciais', periodicidade: 'Mensal', unidade: '%', pilar: 'Evangelismo', meta_2026: '>90%' },
  { id: 'CBA-03', area: 'CBA', nome: '% Convers\u00e3o Next n\u00e3o batizados', periodicidade: 'Mensal', unidade: '%', pilar: 'Evangelismo', meta_2026: '\u226580%' },
  { id: 'CBA-04', area: 'CBA', nome: '% Contato em menos de 5 dias', periodicidade: 'Mensal', unidade: '%', pilar: 'Servi\u00e7o', meta_2026: '\u226595%' },
  { id: 'CBA-05', area: 'CBA', nome: '% Resposta Question\u00e1rios p\u00f3s-batismo', periodicidade: 'Mensal', unidade: '%', pilar: 'Servi\u00e7o', meta_2026: '\u226580%' },
  { id: 'CBA-06', area: 'CBA', nome: '% Satisfa\u00e7\u00e3o processo de batismo', periodicidade: 'Trimestral', unidade: '%', pilar: 'Servi\u00e7o', meta_2026: '\u226590%' },
  { id: 'CBA-07', area: 'CBA', nome: 'Crescimento n\u00ba de igrejas na CBA', periodicidade: 'Mensal', unidade: '%', pilar: 'Crescimento', meta_2026: '+20%' },
  { id: 'CBA-08', area: 'CBA', nome: '% Igrejas com implementa\u00e7\u00e3o cultural registrada', periodicidade: 'Mensal', unidade: '%', pilar: 'Cultura', meta_2026: '30%' },
  { id: 'CBA-09', area: 'CBA', nome: '% Igrejas re-inscritas/continuando na CBA', periodicidade: 'Mensal', unidade: '%', pilar: 'Reten\u00e7\u00e3o', meta_2026: '60%' },
  { id: 'CBA-10', area: 'CBA', nome: 'Valor arrecadado Make a Difference', periodicidade: 'Mensal', unidade: 'R$', pilar: 'MAD', meta_2026: 'Base 2027' },
  { id: 'CBA-11', area: 'CBA', nome: '% Igrejas inscritas participando ativamente', periodicidade: 'Mensal', unidade: '%', pilar: 'MAD', meta_2026: '40%' },
  { id: 'CBA-12', area: 'CBA', nome: 'NPS do ciclo CBA', periodicidade: 'Mensal', unidade: 'nota', pilar: 'Qualidade', meta_2026: '\u226570 ou 4,0' },

  // CBKids (5)
  { id: 'KID-01', area: 'CBKids', nome: 'Frequ\u00eancia crian\u00e7as', periodicidade: 'Semanal', unidade: 'crian\u00e7as', pilar: 'Crescimento', meta_2026: '80% do p\u00fablico alvo (230)' },
  { id: 'KID-02', area: 'CBKids', nome: 'Aceita\u00e7\u00f5es (crian\u00e7as 5+)', periodicidade: 'Mensal', unidade: 'crian\u00e7as', pilar: 'Evangelismo', meta_2026: '1% do p\u00fablico presente' },
  { id: 'KID-03', area: 'CBKids', nome: 'Batismos crian\u00e7as (7+)', periodicidade: 'Mensal', unidade: 'batismos', pilar: 'Evangelismo', meta_2026: 'A definir' },
  { id: 'KID-04', area: 'CBKids', nome: 'Fam\u00edlias fazendo devocionais', periodicidade: 'Mensal', unidade: 'fam\u00edlias', pilar: 'Comunh\u00e3o', meta_2026: '50 fam\u00edlias (6-12m)' },
  { id: 'KID-05', area: 'CBKids', nome: 'Sa\u00edda de volunt\u00e1rios', periodicidade: 'Mensal', unidade: 'volunt\u00e1rios', pilar: 'Servi\u00e7o', meta_2026: '\u22645 volunt\u00e1rios' },

  // Cuidados (7)
  { id: 'CUID-01', area: 'Cuidados', nome: 'Novos convertidos atendidos p\u00f3s-culto', periodicidade: 'Semanal', unidade: 'pessoas', pilar: 'Servi\u00e7o', meta_2026: '100%' },
  { id: 'CUID-05', area: 'Cuidados', nome: 'Novos convertidos engajados em ao menos um valor', periodicidade: 'Mensal', unidade: '%', pilar: 'Crescimento', meta_2026: '60% (6m)' },
  { id: 'CUID-06', area: 'Cuidados', nome: '% de membros envolvidos em 2 ou + valores', periodicidade: 'Mensal', unidade: '%', pilar: 'Crescimento', meta_2026: '75%' },
  { id: 'CUID-07', area: 'Cuidados', nome: 'Encontros Jornada 180', periodicidade: 'Semanal', unidade: 'encontros', pilar: 'Comunh\u00e3o', meta_2026: '1/semana' },
  { id: 'CUID-10', area: 'Cuidados', nome: 'Atendimentos Capelania (enfermos/hosp)', periodicidade: 'Mensal', unidade: 'atendimentos', pilar: 'Servi\u00e7o', meta_2026: '+40%' },
  { id: 'CUID-12', area: 'Cuidados', nome: 'Papo com Pastor - staff atendido', periodicidade: 'Mensal', unidade: 'pessoas', pilar: 'Comunh\u00e3o', meta_2026: '+50%' },
  { id: 'CUID-14', area: 'Cuidados', nome: 'Aconselhamentos', periodicidade: 'Mensal', unidade: 'atendimentos', pilar: 'Servi\u00e7o', meta_2026: '+30%' },

  // Grupos (5)
  { id: 'GRUP-01', area: 'Grupos', nome: 'N\u00ba participantes em grupos', periodicidade: 'Mensal', unidade: 'pessoas', pilar: 'Comunh\u00e3o', meta_2026: '60% da frequ\u00eancia m\u00e9dia' },
  { id: 'GRUP-02', area: 'Grupos', nome: 'N\u00ba l\u00edderes em treinamento', periodicidade: 'Mensal', unidade: 'l\u00edderes', pilar: 'Servi\u00e7o', meta_2026: '+50% em 12m' },
  { id: 'GRUP-03', area: 'Grupos', nome: 'N\u00ba l\u00edderes acompanhados', periodicidade: 'Mensal', unidade: 'l\u00edderes', pilar: 'Servi\u00e7o', meta_2026: 'Monitorar' },
  { id: 'GRUP-04', area: 'Grupos', nome: 'N\u00ba de grupos / inscritos', periodicidade: 'Semestral', unidade: 'unidades', pilar: 'Comunh\u00e3o', meta_2026: 'Monitorar' },
  { id: 'GRUP-05', area: 'Grupos', nome: '% Aprova\u00e7\u00e3o l\u00edderes / Satisfa\u00e7\u00e3o', periodicidade: 'Semestral', unidade: '%', pilar: 'Comunh\u00e3o', meta_2026: '90% / 90%' },

  // Integracao (5)
  { id: 'INTG-01', area: 'Integracao', nome: 'N\u00ba convers\u00f5es', periodicidade: 'Semanal', unidade: 'pessoas', pilar: 'Evangelismo', meta_2026: 'Monitorar' },
  { id: 'INTG-02', area: 'Integracao', nome: 'N\u00ba visitantes', periodicidade: 'Semanal', unidade: 'pessoas', pilar: 'Evangelismo', meta_2026: 'Monitorar' },
  { id: 'INTG-04', area: 'Integracao', nome: '% Volunt\u00e1rios com 1x1 mensal', periodicidade: 'Mensal', unidade: '%', pilar: 'Servi\u00e7o', meta_2026: '100%' },
  { id: 'INTG-05', area: 'Integracao', nome: '% Volunt\u00e1rios em treinamentos', periodicidade: 'Mensal', unidade: '%', pilar: 'Servi\u00e7o', meta_2026: '90%' },
  { id: 'INTG-06', area: 'Integracao', nome: '% Acerto question\u00e1rio trimestral', periodicidade: 'Trimestral', unidade: '%', pilar: 'Servi\u00e7o', meta_2026: '>80%' },

  // Voluntariado (9)
  { id: 'VOLT-01', area: 'Voluntariado', nome: 'N\u00ba volunt\u00e1rios ativos (semanal)', periodicidade: 'Semanal', unidade: 'volunt\u00e1rios', pilar: 'Servi\u00e7o', meta_2026: 'Monitorar' },
  { id: 'VOLT-02', area: 'Voluntariado', nome: 'N\u00ba volunt\u00e1rios ativos (mensal)', periodicidade: 'Mensal', unidade: 'volunt\u00e1rios', pilar: 'Servi\u00e7o', meta_2026: '60% da frequ\u00eancia m\u00e9dia' },
  { id: 'VOLT-03', area: 'Voluntariado', nome: 'N\u00ba volunt\u00e1rios ativos (trimestral)', periodicidade: 'Trimestral', unidade: 'volunt\u00e1rios', pilar: 'Servi\u00e7o', meta_2026: 'Monitorar' },
  { id: 'VOLT-04', area: 'Voluntariado', nome: 'Novos volunt\u00e1rios (entrantes)', periodicidade: 'Mensal', unidade: 'volunt\u00e1rios', pilar: 'Servi\u00e7o', meta_2026: 'Monitorar' },
  { id: 'VOLT-05', area: 'Voluntariado', nome: 'Volunt\u00e1rios integrados', periodicidade: 'Mensal', unidade: 'volunt\u00e1rios', pilar: 'Servi\u00e7o', meta_2026: 'Monitorar' },
  { id: 'VOLT-06', area: 'Voluntariado', nome: 'Volunt\u00e1rios no Services', periodicidade: 'Mensal', unidade: '%', pilar: 'Servi\u00e7o', meta_2026: '95% ativos escalados' },
  { id: 'VOLT-07', area: 'Voluntariado', nome: "Volunt\u00e1rios 'desaparecidos'", periodicidade: 'Mensal', unidade: 'volunt\u00e1rios', pilar: 'Servi\u00e7o', meta_2026: 'Recuperar 60%' },
  { id: 'VOLT-08', area: 'Voluntariado', nome: '% Interessados integrados', periodicidade: 'Mensal', unidade: '%', pilar: 'Servi\u00e7o', meta_2026: '90%' },
  { id: 'VOLT-09', area: 'Voluntariado', nome: 'Satisfa\u00e7\u00e3o volunt\u00e1rios', periodicidade: 'Semestral', unidade: '%', pilar: 'Servi\u00e7o', meta_2026: '90% respostas positivas' },

  // NEXT (4)
  { id: 'NEXT-01', area: 'NEXT', nome: '% Inscritos n\u00e3o batizados convertidos em batizandos p\u00f3s-NEXT', periodicidade: 'Mensal', unidade: '%', pilar: 'Discipulado', meta_2026: '30%' },
  { id: 'NEXT-02', area: 'NEXT', nome: '% Inscritos n\u00e3o volunt\u00e1rios convertidos em volunt\u00e1rios p\u00f3s-NEXT', periodicidade: 'Mensal', unidade: '%', pilar: 'Servi\u00e7o', meta_2026: '50%' },
  { id: 'NEXT-03', area: 'NEXT', nome: '% Inscritos com registro de oferta/d\u00edzimo p\u00f3s-NEXT', periodicidade: 'Mensal', unidade: '%', pilar: 'Generosidade', meta_2026: '30%' },
  { id: 'NEXT-04', area: 'NEXT', nome: 'NPS do NEXT', periodicidade: 'Mensal', unidade: 'nota', pilar: 'Qualidade', meta_2026: '\u226570 ou 4,0' },

  // Generosidade (4)
  { id: 'GEN-02', area: 'Generosidade', nome: '% Doadores ativos com recorr\u00eancia \u22653 meses', periodicidade: 'Mensal', unidade: '%', pilar: 'Maturidade', meta_2026: '60%' },
  { id: 'GEN-03', area: 'Generosidade', nome: '% Doadores Grupo C avan\u00e7ando para Grupo B', periodicidade: 'Mensal', unidade: '%', pilar: 'Cultura', meta_2026: '30%' },
  { id: 'GEN-04', area: 'Generosidade', nome: '% Participantes Next convertidos em doadores', periodicidade: 'Mensal', unidade: '%', pilar: 'P\u00f3s-Next', meta_2026: '30%' },
  { id: 'GEN-05', area: 'Generosidade', nome: 'Valor total arrecadado no ciclo', periodicidade: 'Mensal', unidade: 'R$', pilar: 'Impacto', meta_2026: 'Base 2027' },
];

// KPIs com coleta automatica (fonte_auto no banco)
export const KPI_AUTO = new Set([
  'AMI-01', 'AMI-02', 'AMI-05', 'AMI-06',                // cultos AMI/Bridge separados
  'KID-01', 'KID-02', 'KID-04',                          // cultos/batismos kids + devocionais
  'INTG-01', 'INTG-04', 'INTG-05',                       // integracao
  'CUID-01', 'CUID-05', 'CUID-06', 'CUID-07', 'CUID-10', // cuidados + jornada
  'GRUP-01', 'GRUP-04',                                  // grupos
  'VOLT-01', 'VOLT-02', 'VOLT-03', 'VOLT-04', 'VOLT-05', 'VOLT-06', 'VOLT-07', 'VOLT-08', // voluntariado
  'NEXT-01', 'NEXT-02', 'NEXT-03',                       // next
  'GEN-02', 'GEN-04',                                    // generosidade
  'CBA-01', 'CBA-04',                                    // cba batismo/contato 5 dias
]);

export const getIndicadoresByArea = (area) => INDICADORES.filter(k => k.area === area);
export const getIndicadorById = (id) => INDICADORES.find(k => k.id === id);
export const getAreasForCategoria = (cat) => CATEGORIA_AREAS[cat] || [];
export const getAreaNome = (id) => AREAS.find(a => a.id === id)?.nome || id;
export const isAutoCollected = (id) => KPI_AUTO.has(id);

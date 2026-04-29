/**
 * 69 KPIs hardcoded da planilha "Metas e Indicadores 2026".
 * Fonte unica de verdade para o modulo de Processos.
 * Quando migrar para o banco, substituir por fetch da API.
 */

export const CATEGORIAS = ['Ministerial', 'Geracional', 'Criativo', 'Operacoes'];

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
];

export const CATEGORIA_AREAS = {
  Ministerial: ['CBA', 'Cuidados', 'Grupos', 'Integracao', 'Voluntariado', 'NEXT', 'Generosidade'],
  Geracional: ['AMI', 'CBKids'],
  Criativo: [],
  Operacoes: [],
};

export const INDICADORES = [
  // AMI (9)
  { id: 'AMI-01', area: 'AMI', nome: 'Frequência AMI (presentes no culto)', periodicidade: 'Semanal', unidade: 'pessoas', pilar: 'Crescimento', meta_2026: '+15% em 6m, +30% em 12m (base 200)' },
  { id: 'AMI-02', area: 'AMI', nome: 'Conversões AMI', periodicidade: 'Semanal', unidade: 'pessoas', pilar: 'Evangelismo', meta_2026: 'Monitorar' },
  { id: 'AMI-03', area: 'AMI', nome: 'Presença Escola de Discípulos', periodicidade: 'Semanal', unidade: 'pessoas', pilar: 'Crescimento', meta_2026: '+50% em 6m (base 70/sem)' },
  { id: 'AMI-04', area: 'AMI', nome: 'Presença NEXT', periodicidade: 'Mensal', unidade: 'pessoas', pilar: 'Crescimento', meta_2026: 'Dobrar inscritos + 1 encontro/mês' },
  { id: 'AMI-05', area: 'AMI', nome: 'Frequência Bridge', periodicidade: 'Semanal', unidade: 'pessoas', pilar: 'Crescimento', meta_2026: '+15% em 6m, +30% em 12m (conjunto AMI)' },
  { id: 'AMI-06', area: 'AMI', nome: 'Conversões Bridge', periodicidade: 'Semanal', unidade: 'pessoas', pilar: 'Evangelismo', meta_2026: 'Monitorar' },
  { id: 'AMI-07', area: 'AMI', nome: 'Presença grupo de pais Bridge', periodicidade: 'Semanal', unidade: 'pessoas', pilar: 'Comunhão', meta_2026: 'Monitorar' },
  { id: 'AMI-08', area: 'AMI', nome: 'Nº grupos AMI / inscritos / líderes', periodicidade: 'Mensal', unidade: 'unidades', pilar: 'Comunhão', meta_2026: '50% jovens em grupos (6m), 70% (12m)' },
  { id: 'AMI-09', area: 'AMI', nome: 'Batismos AMI', periodicidade: 'Mensal', unidade: 'batismos', pilar: 'Evangelismo', meta_2026: '3/mês (1º sem) e 5/mês (2º sem)' },

  // CBA (12)
  { id: 'CBA-01', area: 'CBA', nome: '% Batismos / Conversões', periodicidade: 'Mensal', unidade: '%', pilar: 'Evangelismo', meta_2026: '20% (6m), 50% (12m)' },
  { id: 'CBA-02', area: 'CBA', nome: '% Sucesso Interessados Iniciais', periodicidade: 'Mensal', unidade: '%', pilar: 'Evangelismo', meta_2026: '>90%' },
  { id: 'CBA-03', area: 'CBA', nome: '% Conversão Next não batizados', periodicidade: 'Mensal', unidade: '%', pilar: 'Evangelismo', meta_2026: '>=80%' },
  { id: 'CBA-04', area: 'CBA', nome: '% Contato em menos de 5 dias', periodicidade: 'Mensal', unidade: '%', pilar: 'Serviço', meta_2026: '>=95%' },
  { id: 'CBA-05', area: 'CBA', nome: '% Resposta Questionários pós-batismo', periodicidade: 'Mensal', unidade: '%', pilar: 'Serviço', meta_2026: '>=80%' },
  { id: 'CBA-06', area: 'CBA', nome: '% Satisfação processo de batismo', periodicidade: 'Trimestral', unidade: '%', pilar: 'Serviço', meta_2026: '>=90%' },
  { id: 'CBA-07', area: 'CBA', nome: 'Crescimento nº de igrejas na CBA', periodicidade: 'Mensal', unidade: '%', pilar: 'Crescimento', meta_2026: '+20%' },
  { id: 'CBA-08', area: 'CBA', nome: '% Igrejas com implementação cultural registrada', periodicidade: 'Mensal', unidade: '%', pilar: 'Cultura', meta_2026: '30%' },
  { id: 'CBA-09', area: 'CBA', nome: '% Igrejas re-inscritas/continuando na CBA', periodicidade: 'Mensal', unidade: '%', pilar: 'Retenção', meta_2026: '60%' },
  { id: 'CBA-10', area: 'CBA', nome: 'Valor arrecadado Make a Difference', periodicidade: 'Mensal', unidade: 'R$', pilar: 'MAD', meta_2026: 'Base 2027' },
  { id: 'CBA-11', area: 'CBA', nome: '% Igrejas inscritas participando ativamente', periodicidade: 'Mensal', unidade: '%', pilar: 'MAD', meta_2026: '40%' },
  { id: 'CBA-12', area: 'CBA', nome: 'NPS do ciclo CBA', periodicidade: 'Mensal', unidade: 'nota', pilar: 'Qualidade', meta_2026: '>=70 ou 4,0' },

  // CBKids (5)
  { id: 'KID-01', area: 'CBKids', nome: 'Frequência crianças', periodicidade: 'Semanal', unidade: 'crianças', pilar: 'Crescimento', meta_2026: 'Base 230' },
  { id: 'KID-02', area: 'CBKids', nome: 'Aceitações (crianças 5+)', periodicidade: 'Mensal', unidade: 'crianças', pilar: 'Evangelismo', meta_2026: 'A definir' },
  { id: 'KID-03', area: 'CBKids', nome: 'Batismos crianças (7+)', periodicidade: 'Mensal', unidade: 'batismos', pilar: 'Evangelismo', meta_2026: 'A definir' },
  { id: 'KID-04', area: 'CBKids', nome: 'Famílias fazendo devocionais', periodicidade: 'Mensal', unidade: 'famílias', pilar: 'Comunhão', meta_2026: '50 famílias (6-12m)' },
  { id: 'KID-05', area: 'CBKids', nome: 'Saída de voluntários', periodicidade: 'Mensal', unidade: 'voluntários', pilar: 'Serviço', meta_2026: '<=5 voluntários' },

  // Cuidados (14)
  { id: 'CUID-01', area: 'Cuidados', nome: 'Novos convertidos atendidos pós-culto', periodicidade: 'Semanal', unidade: 'pessoas', pilar: 'Serviço', meta_2026: '100%' },
  { id: 'CUID-02', area: 'Cuidados', nome: 'Novos convertidos contactados dia seguinte', periodicidade: 'Semanal', unidade: 'pessoas', pilar: 'Serviço', meta_2026: '100%' },
  { id: 'CUID-03', area: 'Cuidados', nome: 'Novos voluntários Cuidados', periodicidade: 'Mensal', unidade: 'voluntários', pilar: 'Serviço', meta_2026: '+40%' },
  { id: 'CUID-04', area: 'Cuidados', nome: 'Voluntários treinados/capacitados', periodicidade: 'Mensal', unidade: '%', pilar: 'Serviço', meta_2026: '100%' },
  { id: 'CUID-05', area: 'Cuidados', nome: '% Jornada espiritual novos membros', periodicidade: 'Mensal', unidade: '%', pilar: 'Crescimento', meta_2026: '60% (6m)' },
  { id: 'CUID-06', area: 'Cuidados', nome: '% Jornada espiritual antigos membros', periodicidade: 'Mensal', unidade: '%', pilar: 'Crescimento', meta_2026: '40% (6m)' },
  { id: 'CUID-07', area: 'Cuidados', nome: 'Encontros Jornada 180', periodicidade: 'Semanal', unidade: 'encontros', pilar: 'Comunhão', meta_2026: '1/semana' },
  { id: 'CUID-08', area: 'Cuidados', nome: 'Devocionais Jornada 180 enviados', periodicidade: 'Semanal', unidade: 'devocionais', pilar: 'Adoração', meta_2026: '7/semana' },
  { id: 'CUID-09', area: 'Cuidados', nome: 'Atendimentos individuais Jornada 180', periodicidade: 'Semanal', unidade: 'atendimentos', pilar: 'Serviço', meta_2026: '2/semana' },
  { id: 'CUID-10', area: 'Cuidados', nome: 'Atendimentos Capelania (enfermos/hosp)', periodicidade: 'Mensal', unidade: 'atendimentos', pilar: 'Serviço', meta_2026: '+40%' },
  { id: 'CUID-11', area: 'Cuidados', nome: 'Voluntários Capelania', periodicidade: 'Mensal', unidade: 'voluntários', pilar: 'Serviço', meta_2026: '+30%' },
  { id: 'CUID-12', area: 'Cuidados', nome: 'Papo com Pastor - staff atendido', periodicidade: 'Mensal', unidade: 'pessoas', pilar: 'Comunhão', meta_2026: '+50%' },
  { id: 'CUID-13', area: 'Cuidados', nome: 'Feedback RH (Papo com Pastor)', periodicidade: 'Semanal', unidade: 'feedbacks', pilar: 'Comunhão', meta_2026: '1/semana' },
  { id: 'CUID-14', area: 'Cuidados', nome: 'Aconselhamentos', periodicidade: 'Mensal', unidade: 'atendimentos', pilar: 'Serviço', meta_2026: '+30%' },

  // Grupos (5)
  { id: 'GRUP-01', area: 'Grupos', nome: 'Nº participantes em grupos', periodicidade: 'Mensal', unidade: 'pessoas', pilar: 'Comunhão', meta_2026: '+30% ano (base 1000)' },
  { id: 'GRUP-02', area: 'Grupos', nome: 'Nº líderes em treinamento', periodicidade: 'Mensal', unidade: 'líderes', pilar: 'Serviço', meta_2026: '+50% em 12m' },
  { id: 'GRUP-03', area: 'Grupos', nome: 'Nº líderes acompanhados', periodicidade: 'Mensal', unidade: 'líderes', pilar: 'Serviço', meta_2026: 'Monitorar' },
  { id: 'GRUP-04', area: 'Grupos', nome: 'Nº de grupos / inscritos', periodicidade: 'Semestral', unidade: 'unidades', pilar: 'Comunhão', meta_2026: 'Monitorar' },
  { id: 'GRUP-05', area: 'Grupos', nome: '% Aprovação líderes / Satisfação', periodicidade: 'Semestral', unidade: '%', pilar: 'Comunhão', meta_2026: '90% / 90%' },

  // Integração (6)
  { id: 'INTG-01', area: 'Integracao', nome: 'Nº conversões', periodicidade: 'Semanal', unidade: 'pessoas', pilar: 'Evangelismo', meta_2026: 'Monitorar' },
  { id: 'INTG-02', area: 'Integracao', nome: 'Nº visitantes', periodicidade: 'Semanal', unidade: 'pessoas', pilar: 'Evangelismo', meta_2026: 'Monitorar' },
  { id: 'INTG-03', area: 'Integracao', nome: 'Nº presentes', periodicidade: 'Semanal', unidade: 'pessoas', pilar: 'Crescimento', meta_2026: 'Monitorar' },
  { id: 'INTG-04', area: 'Integracao', nome: '% Voluntários com 1x1 mensal', periodicidade: 'Mensal', unidade: '%', pilar: 'Serviço', meta_2026: '100%' },
  { id: 'INTG-05', area: 'Integracao', nome: '% Voluntários em treinamentos', periodicidade: 'Mensal', unidade: '%', pilar: 'Serviço', meta_2026: '90%' },
  { id: 'INTG-06', area: 'Integracao', nome: '% Acerto questionário trimestral', periodicidade: 'Trimestral', unidade: '%', pilar: 'Serviço', meta_2026: '>80%' },

  // Voluntariado (9)
  { id: 'VOLT-01', area: 'Voluntariado', nome: 'Nº voluntários ativos (semanal)', periodicidade: 'Semanal', unidade: 'voluntários', pilar: 'Serviço', meta_2026: 'Monitorar' },
  { id: 'VOLT-02', area: 'Voluntariado', nome: 'Nº voluntários ativos (mensal)', periodicidade: 'Mensal', unidade: 'voluntários', pilar: 'Serviço', meta_2026: '30% igreja (6m), 40% (12m)' },
  { id: 'VOLT-03', area: 'Voluntariado', nome: 'Nº voluntários ativos (trimestral)', periodicidade: 'Trimestral', unidade: 'voluntários', pilar: 'Serviço', meta_2026: 'Monitorar' },
  { id: 'VOLT-04', area: 'Voluntariado', nome: 'Novos voluntários (entrantes)', periodicidade: 'Mensal', unidade: 'voluntários', pilar: 'Serviço', meta_2026: 'Monitorar' },
  { id: 'VOLT-05', area: 'Voluntariado', nome: 'Voluntários integrados', periodicidade: 'Mensal', unidade: 'voluntários', pilar: 'Serviço', meta_2026: 'Monitorar' },
  { id: 'VOLT-06', area: 'Voluntariado', nome: 'Voluntários no Services', periodicidade: 'Mensal', unidade: '%', pilar: 'Serviço', meta_2026: '95% ativos escalados' },
  { id: 'VOLT-07', area: 'Voluntariado', nome: "Voluntários 'desaparecidos'", periodicidade: 'Mensal', unidade: 'voluntários', pilar: 'Serviço', meta_2026: 'Recuperar 60%' },
  { id: 'VOLT-08', area: 'Voluntariado', nome: '% Interessados integrados', periodicidade: 'Mensal', unidade: '%', pilar: 'Serviço', meta_2026: '90%' },
  { id: 'VOLT-09', area: 'Voluntariado', nome: 'Satisfação voluntários', periodicidade: 'Semestral', unidade: '%', pilar: 'Serviço', meta_2026: '90% respostas positivas' },

  // NEXT (4)
  { id: 'NEXT-01', area: 'NEXT', nome: '% Inscritos não batizados convertidos em batizandos pós-NEXT', periodicidade: 'Mensal', unidade: '%', pilar: 'Discipulado', meta_2026: '30%' },
  { id: 'NEXT-02', area: 'NEXT', nome: '% Inscritos não voluntários convertidos em voluntários pós-NEXT', periodicidade: 'Mensal', unidade: '%', pilar: 'Serviço', meta_2026: '50%' },
  { id: 'NEXT-03', area: 'NEXT', nome: '% Inscritos com registro de oferta/dízimo pós-NEXT', periodicidade: 'Mensal', unidade: '%', pilar: 'Generosidade', meta_2026: '30%' },
  { id: 'NEXT-04', area: 'NEXT', nome: 'NPS do NEXT', periodicidade: 'Mensal', unidade: 'nota', pilar: 'Qualidade', meta_2026: '>=70 ou 4,0' },

  // Generosidade (5)
  { id: 'GEN-01', area: 'Generosidade', nome: 'Crescimento nº de doadores ativos', periodicidade: 'Mensal', unidade: '%', pilar: 'Base', meta_2026: '+20%' },
  { id: 'GEN-02', area: 'Generosidade', nome: '% Doadores ativos com recorrência >=3 meses', periodicidade: 'Mensal', unidade: '%', pilar: 'Maturidade', meta_2026: '60%' },
  { id: 'GEN-03', area: 'Generosidade', nome: '% Doadores Grupo C avançando para Grupo B', periodicidade: 'Mensal', unidade: '%', pilar: 'Cultura', meta_2026: '30%' },
  { id: 'GEN-04', area: 'Generosidade', nome: '% Participantes Next convertidos em doadores', periodicidade: 'Mensal', unidade: '%', pilar: 'Pós-Next', meta_2026: '30%' },
  { id: 'GEN-05', area: 'Generosidade', nome: 'Valor total arrecadado no ciclo', periodicidade: 'Mensal', unidade: 'R$', pilar: 'Impacto', meta_2026: 'Base 2027' },
];

export const getIndicadoresByArea = (area) => INDICADORES.filter(k => k.area === area);
export const getIndicadorById = (id) => INDICADORES.find(k => k.id === id);
export const getAreasForCategoria = (cat) => CATEGORIA_AREAS[cat] || [];
export const getAreaNome = (id) => AREAS.find(a => a.id === id)?.nome || id;

// Contrato da aba de Diagnósticos (`/assistente-ia`).
//
// ⚠️ O que estes testes protegem, em ordem de dano:
//   1. finding SEM incidente não desaparecer (as auditorias de módulo são 46 dos
//      61 achados — filtrar por incident_id esvaziaria a aba, e "vazia" é
//      indistinguível de "não há nada errado");
//   2. incidente ENCERRADO não voltar a parecer pendência (o plano de ação de
//      algo já decidido cobraria trabalho feito);
//   3. o plano de ação sair do diagnóstico estruturado quando ele existe, e do
//      `suggestion` (separado por " | ") quando não;
//   4. `decisao_necessaria` só quando o agente DECLAROU precisar de decisão E
//      escreveu a pergunta.
import { describe, it, expect } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const reg = require('../../backend/utils/agentDiagnostico.js');
const {
  rotuloAgente, planoDeAcao, evidencias, resumoDoFinding,
  estadoDoItem, montarItens, resumirItens,
} = reg;

// Dados REAIS de produção (27/08/2026 · run 1f8b20ca · incidente 8b384376).
const FINDING_INCIDENTE = {
  title: 'Causa provável: Falha silenciosa na lógica de negócio da rota: tratamento incompleto de erro.',
  detail: 'POST /api/patrimonio/bens/bulk/baixa retorna HTTP 500 em produção sem exceção capturada.\n'
    + 'Evidências: HTTP 500 respondido pela rota em produção | Stack trace vazio | 1 ocorrência nos últimos 15 minutos',
  module: 'sistema',
  severity: 'critico',
  suggestion: 'Validar logs da função | Verificar middleware de erro da rota | Revisar lógica de bulk/baixa',
  incident_id: 'inc-1',
};

const DIAGNOSIS = {
  summary: 'POST /api/patrimonio/bens/bulk/baixa retorna HTTP 500 em produção sem exceção capturada.',
  probable_cause: 'Falha silenciosa na lógica de negócio da rota.',
  classification: 'codigo',
  confidence: 'media',
  risk_level: 'alto',
  evidence: ['HTTP 500 respondido pela rota em produção', 'Stack trace vazio'],
  recommended_actions: ['Validar logs da função no request_id', 'Revisar lógica de bulk/baixa'],
  validation_steps: ['Consultar logs estruturados do request_id', 'Testar rota com payload mínimo em staging'],
  decision_required: true,
  decision_question: 'Você tem acesso aos logs estruturados desta função?',
};

const INCIDENTE = {
  id: 'inc-1', title: 'POST /api/patrimonio/bens/bulk/baixa', status: 'investigando',
  severity: 'error', environment: 'production', request_id: '4e4afb18',
  release: '866f30a2', impact_summary: '1 ocorrência(s) nos últimos 15 minutos.',
  created_at: '2026-08-27T17:10:42Z', resolved_at: null,
};

const RUN = {
  id: 'run-1', agent_type: 'incident_backend_diagnostician',
  started_at: '2026-08-27T17:10:43Z', completed_at: '2026-08-27T17:10:51Z',
  findings: [FINDING_INCIDENTE],
};

describe('agentDiagnostico · rótulo do agente', () => {
  it('traduz os especialistas de incidente', () => {
    expect(rotuloAgente('incident_backend_diagnostician')).toBe('Especialista Backend & API');
    expect(rotuloAgente('incident_automation_diagnostician')).toBe('Especialista em Automações');
  });

  it('⚠️ NUNCA devolve o agent_type cru: module_rh vira "Auditoria · Rh"', () => {
    expect(rotuloAgente('module_rh')).toBe('Auditoria · Rh');
    expect(rotuloAgente('module_membresia')).toBe('Auditoria · Membresia');
  });

  it('tipo desconhecido fica legível em vez de snake_case', () => {
    expect(rotuloAgente('algum_agente_novo')).toBe('Algum Agente Novo');
    expect(rotuloAgente(null)).toBe('Agente');
  });
});

describe('agentDiagnostico · plano de ação', () => {
  it('prefere o diagnóstico estruturado quando ele existe', () => {
    expect(planoDeAcao(FINDING_INCIDENTE, DIAGNOSIS)).toEqual(DIAGNOSIS.recommended_actions);
  });

  it('sem diagnóstico, parte o `suggestion` no " | " (auditorias antigas)', () => {
    expect(planoDeAcao(FINDING_INCIDENTE, null)).toEqual([
      'Validar logs da função',
      'Verificar middleware de erro da rota',
      'Revisar lógica de bulk/baixa',
    ]);
  });

  it('sem nada, devolve vazio pra a TELA declarar a ausência', () => {
    expect(planoDeAcao({ title: 'x' }, null)).toEqual([]);
    expect(planoDeAcao({ suggestion: '   ' }, null)).toEqual([]);
  });
});

describe('agentDiagnostico · evidências e resumo', () => {
  it('usa as evidências do diagnóstico quando há', () => {
    expect(evidencias(FINDING_INCIDENTE, DIAGNOSIS)).toEqual(DIAGNOSIS.evidence);
  });

  it('sem diagnóstico, extrai do rabo "Evidências:" do detail', () => {
    expect(evidencias(FINDING_INCIDENTE, null)).toEqual([
      'HTTP 500 respondido pela rota em produção',
      'Stack trace vazio',
      '1 ocorrência nos últimos 15 minutos',
    ]);
  });

  it('o resumo NÃO repete o bloco de evidências', () => {
    const r = resumoDoFinding(FINDING_INCIDENTE, null);
    expect(r).toContain('HTTP 500 em produção sem exceção');
    expect(r).not.toContain('Evidências:');
  });
});

describe('agentDiagnostico · estado do item', () => {
  it('incidente vivo é ABERTO', () => {
    expect(estadoDoItem({ status: 'investigando' })).toBe('aberto');
    expect(estadoDoItem({ status: 'mitigado' })).toBe('aberto');
  });

  it('⚠️ resolvido e risco_aceito são ENCERRADOS (não voltam como pendência)', () => {
    expect(estadoDoItem({ status: 'resolvido' })).toBe('encerrado');
    expect(estadoDoItem({ status: 'risco_aceito' })).toBe('encerrado');
  });

  it('sem incidente é estado PRÓPRIO, não "aberto"', () => {
    expect(estadoDoItem(null)).toBe('sem_incidente');
  });
});

describe('agentDiagnostico · montagem dos itens', () => {
  const incidentes = new Map([['inc-1', INCIDENTE]]);
  const diagnosticos = new Map([['inc-1', DIAGNOSIS]]);

  it('monta o item completo a partir do caso real de produção', () => {
    const [item] = montarItens({ runs: [RUN], incidentes, diagnosticos });
    expect(item.agente).toBe('Especialista Backend & API');
    expect(item.severidade).toBe('critico');
    expect(item.estado).toBe('aberto');
    expect(item.plano_de_acao).toHaveLength(2);
    expect(item.passos_de_validacao).toHaveLength(2);
    expect(item.decisao_necessaria).toBe(true);
    expect(item.incidente?.request_id).toBe('4e4afb18');
    expect(item.quando).toBe('2026-08-27T17:10:51Z');
  });

  it('⚠️⚠️ finding SEM incidente NÃO desaparece (auditoria de módulo)', () => {
    const runAuditoria = {
      id: 'run-2', agent_type: 'module_rh', completed_at: '2026-04-07T01:03:05Z',
      findings: [{ title: 'Documentos vencidos sem alerta', severity: 'aviso', suggestion: 'Criar alerta' }],
    };
    const itens = montarItens({ runs: [runAuditoria], incidentes, diagnosticos });
    expect(itens).toHaveLength(1);
    expect(itens[0].estado).toBe('sem_incidente');
    expect(itens[0].plano_de_acao).toEqual(['Criar alerta']);
  });

  it('run com vários findings gera ids DISTINTOS (senão o React reusa o card errado)', () => {
    const run = { ...RUN, findings: [FINDING_INCIDENTE, { ...FINDING_INCIDENTE, title: 'outro' }] };
    const itens = montarItens({ runs: [run], incidentes, diagnosticos });
    expect(itens).toHaveLength(2);
    expect(new Set(itens.map((i) => i.id)).size).toBe(2);
  });

  it('⚠️ decisão só é necessária com a flag E a pergunta escritas', () => {
    const d1 = { ...DIAGNOSIS, decision_required: false };
    const d2 = { ...DIAGNOSIS, decision_question: '  ' };
    const so = (diag: unknown) => montarItens({
      runs: [RUN], incidentes, diagnosticos: new Map([['inc-1', diag]]),
    })[0].decisao_necessaria;
    expect(so(d1)).toBe(false);
    expect(so(d2)).toBe(false);
    expect(so(DIAGNOSIS)).toBe(true);
  });

  it('run sem findings não vira item', () => {
    expect(montarItens({ runs: [{ id: 'r', agent_type: 'x', findings: [] }] })).toEqual([]);
    expect(montarItens({ runs: [{ id: 'r', agent_type: 'x', findings: null }] })).toEqual([]);
  });
});

describe('agentDiagnostico · resumo do cabeçalho', () => {
  it('⚠️ só o que está ABERTO conta como pendência', () => {
    const incidentes = new Map([
      ['inc-1', INCIDENTE],
      ['inc-2', { ...INCIDENTE, id: 'inc-2', status: 'resolvido' }],
    ]);
    const diagnosticos = new Map([['inc-1', DIAGNOSIS], ['inc-2', DIAGNOSIS]]);
    const runs = [
      RUN,
      { ...RUN, id: 'run-2', findings: [{ ...FINDING_INCIDENTE, incident_id: 'inc-2' }] },
    ];
    const r = resumirItens(montarItens({ runs, incidentes, diagnosticos }));
    expect(r.total).toBe(2);
    expect(r.abertos).toBe(1);
    expect(r.criticos_abertos).toBe(1);
    expect(r.aguardando_decisao).toBe(1);
  });

  it('conta quantos achados ficaram sem plano de ação', () => {
    const runs = [{ id: 'r', agent_type: 'module_rh', findings: [{ title: 'x', severity: 'aviso' }] }];
    expect(resumirItens(montarItens({ runs })).sem_plano).toBe(1);
  });
});

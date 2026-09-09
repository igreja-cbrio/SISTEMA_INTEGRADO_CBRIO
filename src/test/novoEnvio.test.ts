// Contrato do "Novo envio" da Comunicação (F3 · 09/09/2026). Roda no `npm test`
// (gate). Relógio INJETADO; nenhum caso lê Date.now().
import { describe, it, expect } from 'vitest';
import {
  TETO_DESTINATARIOS, AVISO_TIER,
  normalizarTelefone, normalizarDestinatarios, renderizarCorpo, conferirParams,
  custoEstimado, avisos, validarNovoEnvio, textoErro, textoAviso, nomePadrao,
} from '../../backend/utils/novoEnvio';

const AGORA = Date.parse('2026-09-09T13:32:00Z'); // 10:32 no Rio
const TARIFAS = { marketing: 0.35, utility: 0.04, authentication: 0.04, service: 0 };

describe('novoEnvio · destinatários', () => {
  it('normaliza pro formato da fila (DDD + número) e tira o 55 do país só quando sobra telefone inteiro', () => {
    expect(normalizarTelefone('+55 (21) 99999-8888')).toBe('21999998888');
    expect(normalizarTelefone('5521999998888')).toBe('21999998888');
    expect(normalizarTelefone('(21) 3333-4444')).toBe('2133334444');
    // DDD 55 é Santa Maria/RS: 11 dígitos começando por 55 é telefone COMPLETO, fica.
    expect(normalizarTelefone('55999998888')).toBe('55999998888');
    // 55 (país) + 55 (DDD) + número → tira só o país
    expect(normalizarTelefone('5555999998888')).toBe('55999998888');
    expect(normalizarTelefone('12345')).toBeNull();
    // Número SEM DDD (8 ou 9 dígitos) não é válido: a fila prefixaria 55 e a
    // mensagem iria para um número que não existe (ou é de outra pessoa).
    expect(normalizarTelefone('999998888')).toBeNull();
    expect(normalizarTelefone('99999888')).toBeNull();
    expect(normalizarTelefone('')).toBeNull();
    expect(normalizarTelefone(null)).toBeNull();
  });
  it('aceita texto colado (linha, vírgula, ponto e vírgula) ou array; deduplica e DECLARA inválidos e repetidos', () => {
    const r = normalizarDestinatarios('21999998888\n+55 21 99999-8888, 2133334444; abc\n\n12345\nabc');
    expect(r.validos).toEqual(['21999998888', '2133334444']);
    expect(r.duplicados).toBe(1);
    expect(r.invalidos).toEqual(['abc', '12345']);
    expect(normalizarDestinatarios(['21999998888', 21999998888])).toEqual({ validos: ['21999998888'], invalidos: [], duplicados: 1 });
    expect(normalizarDestinatarios('')).toEqual({ validos: [], invalidos: [], duplicados: 0 });
  });
});

describe('novoEnvio · prévia do corpo e parâmetros', () => {
  it('preenche {{n}}; o que falta FICA ESCRITO e é declarado', () => {
    const r = renderizarCorpo('Olá {{1}}! A apresentação de {{2}} é {{3}}.', ['Maria', 'Joaquim']);
    expect(r.texto).toBe('Olá Maria! A apresentação de Joaquim é {{3}}.');
    expect(r.faltando).toEqual([3]);
    expect(renderizarCorpo('Sem variável', []).faltando).toEqual([]);
    expect(renderizarCorpo('{{ 1 }} e {{1}}', ['x']).texto).toBe('x e x');
    expect(renderizarCorpo(null, []).texto).toBe('');
  });
  it('confere a contagem de parâmetros contra o template; sem número conhecido não acusa', () => {
    expect(conferirParams(2, ['a', 'b'])).toMatchObject({ ok: true, esperado: 2, recebido: 2 });
    expect(conferirParams(3, ['a', ''])).toMatchObject({ ok: false, faltando: 2, sobrando: 0 });
    expect(conferirParams(1, ['a', 'b'])).toMatchObject({ ok: false, faltando: 0, sobrando: 1 });
    expect(conferirParams(null, ['a'])).toMatchObject({ ok: true, conhecido: false });
  });
});

describe('novoEnvio · custo estimado', () => {
  it('quantidade × tarifa da categoria; texto é service (grátis)', () => {
    expect(custoEstimado({ quantidade: 100, tipo: 'template', categoria: 'utility', tarifas: TARIFAS })).toEqual({ categoria: 'utility', tarifa: 0.04, total: 4 });
    expect(custoEstimado({ quantidade: 3, tipo: 'template', categoria: 'MARKETING', tarifas: TARIFAS })).toEqual({ categoria: 'marketing', tarifa: 0.35, total: 1.05 });
    expect(custoEstimado({ quantidade: 50, tipo: 'texto', tarifas: TARIFAS })).toEqual({ categoria: 'service', tarifa: 0, total: 0 });
  });
  it('categoria sem tarifa devolve null, NUNCA R$ 0,00', () => {
    expect(custoEstimado({ quantidade: 10, tipo: 'template', categoria: null, tarifas: TARIFAS })).toEqual({ categoria: null, tarifa: null, total: null });
    expect(custoEstimado({ quantidade: 10, tipo: 'template', categoria: 'utility', tarifas: {} }).total).toBeNull();
  });
});

describe('novoEnvio · avisos', () => {
  it('declara o tier da Meta, texto livre, template não aprovado/desconhecido e marketing sem opt-in', () => {
    expect(avisos({ quantidade: AVISO_TIER + 1, tipo: 'template', categoria: 'utility', statusMeta: 'APPROVED' })).toEqual(['acima_do_tier']);
    expect(avisos({ quantidade: 5, tipo: 'template', categoria: 'utility', statusMeta: 'APPROVED' })).toEqual([]);
    expect(avisos({ quantidade: 5, tipo: 'texto' })).toEqual(['texto_livre_janela_24h']);
    expect(avisos({ quantidade: 5, tipo: 'template', categoria: 'utility', statusMeta: 'REJECTED' })).toEqual(['template_nao_aprovado']);
    expect(avisos({ quantidade: 5, tipo: 'template', categoria: 'marketing', statusMeta: 'APPROVED' })).toEqual(['marketing_exige_optin']);
    expect(avisos({ quantidade: 5, tipo: 'template', templateEncontrado: false })).toEqual(['template_desconhecido']);
    expect(avisos({ quantidade: 5, tipo: 'template', categoria: null, statusMeta: 'APPROVED' })).toEqual(['tarifa_desconhecida']);
    for (const c of ['acima_do_tier', 'texto_livre_janela_24h', 'template_nao_aprovado', 'marketing_exige_optin', 'tarifa_desconhecida', 'template_desconhecido', 'template_sem_status']) {
      expect(textoAviso(c)).not.toBe(c);
    }
  });
});

describe('novoEnvio · validação', () => {
  const base = { destinatarios: ['21999998888'], template_nome: 'atualizacao_cadastro', params: ['Maria', 'link'], params_body: 2, agoraMs: AGORA };
  it('agora: válido sem nome; sem destinatário, acima do teto, sem conteúdo ou com os dois é erro', () => {
    expect(validarNovoEnvio({ ...base, modo: 'agora' })).toEqual({ ok: true, erros: [] });
    expect(validarNovoEnvio({ ...base, modo: 'agora', destinatarios: [] }).erros).toContain('sem_destinatarios');
    expect(validarNovoEnvio({ ...base, modo: 'agora', destinatarios: new Array(TETO_DESTINATARIOS + 1).fill('21999998888') }).erros).toContain('acima_do_teto');
    expect(validarNovoEnvio({ ...base, modo: 'agora', template_nome: '', params: [] }).erros).toContain('conteudo_ausente');
    expect(validarNovoEnvio({ ...base, modo: 'agora', texto: 'oi' }).erros).toContain('conteudo_ambiguo');
    expect(validarNovoEnvio({ ...base, modo: 'agora', templateEncontrado: false }).erros).toContain('template_desconhecido');
    expect(validarNovoEnvio({ ...base, modo: 'xpto' }).erros).toContain('modo_invalido');
  });
  it('parâmetros: faltando e sobrando são erros distintos; template sem contagem conhecida passa', () => {
    expect(validarNovoEnvio({ ...base, modo: 'agora', params: ['Maria'] }).erros).toEqual(['params_incompletos']);
    expect(validarNovoEnvio({ ...base, modo: 'agora', params: ['a', 'b', 'c'] }).erros).toEqual(['params_sobrando']);
    expect(validarNovoEnvio({ ...base, modo: 'agora', params: [], params_body: null }).ok).toBe(true);
  });
  it('agendado: exige nome e data no FUTURO', () => {
    expect(validarNovoEnvio({ ...base, modo: 'agendado', nome: 'Convite', quando: '2026-09-10T12:00:00Z' }).ok).toBe(true);
    expect(validarNovoEnvio({ ...base, modo: 'agendado', quando: '2026-09-10T12:00:00Z' }).erros).toEqual(['nome_obrigatorio']);
    expect(validarNovoEnvio({ ...base, modo: 'agendado', nome: 'x', quando: '2026-09-09T13:31:00Z' }).erros).toEqual(['quando_no_passado']);
    expect(validarNovoEnvio({ ...base, modo: 'agendado', nome: 'x', quando: 'ontem' }).erros).toEqual(['quando_invalido']);
    expect(validarNovoEnvio({ ...base, modo: 'agendado', nome: 'x', quando: null }).erros).toEqual(['quando_invalido']);
  });
  it('recorrente: recorrência, hora HH:MM e o dia certo (0 = domingo é válido)', () => {
    const rec = { ...base, modo: 'recorrente', nome: 'Lembrete', hora: '09:00' };
    expect(validarNovoEnvio({ ...rec, recorrencia: 'diaria' }).ok).toBe(true);
    expect(validarNovoEnvio({ ...rec, recorrencia: 'semanal', dia_semana: 0 }).ok).toBe(true);
    expect(validarNovoEnvio({ ...rec, recorrencia: 'semanal', dia_semana: null }).erros).toEqual(['dia_semana_invalido']);
    expect(validarNovoEnvio({ ...rec, recorrencia: 'semanal', dia_semana: 7 }).erros).toEqual(['dia_semana_invalido']);
    expect(validarNovoEnvio({ ...rec, recorrencia: 'mensal', dia_mes: 31 }).ok).toBe(true);
    expect(validarNovoEnvio({ ...rec, recorrencia: 'mensal', dia_mes: 0 }).erros).toEqual(['dia_mes_invalido']);
    expect(validarNovoEnvio({ ...rec, recorrencia: 'quinzenal' }).erros).toEqual(['recorrencia_invalida']);
    expect(validarNovoEnvio({ ...rec, recorrencia: 'diaria', hora: '9h' }).erros).toEqual(['hora_invalida']);
    expect(validarNovoEnvio({ ...rec, recorrencia: 'diaria', hora: '24:00' }).erros).toEqual(['hora_invalida']);
  });
  it('todo código de erro tem frase em português (nenhum vaza cru para a tela)', () => {
    for (const c of ['modo_invalido', 'sem_destinatarios', 'acima_do_teto', 'conteudo_ausente', 'conteudo_ambiguo', 'template_desconhecido', 'params_incompletos', 'params_sobrando', 'nome_obrigatorio', 'quando_invalido', 'quando_no_passado', 'recorrencia_invalida', 'hora_invalida', 'dia_semana_invalido', 'dia_mes_invalido']) {
      expect(textoErro(c), c).not.toBe(c);
    }
  });
});

describe('novoEnvio · nome padrão do envio manual', () => {
  it('dia e hora em BRT (13:32Z = 10:32 no Rio), determinístico', () => {
    expect(nomePadrao({ agoraMs: AGORA, tipo: 'template', template: 'atualizacao_cadastro' })).toBe('Envio manual · 09/09 10:32 · atualizacao_cadastro');
    expect(nomePadrao({ agoraMs: AGORA, tipo: 'texto' })).toBe('Envio manual · 09/09 10:32 · texto');
    // 01:00Z de 10/09 ainda é 22:00 de 09/09 no Rio
    expect(nomePadrao({ agoraMs: Date.parse('2026-09-10T01:00:00Z'), tipo: 'texto' })).toBe('Envio manual · 09/09 22:00 · texto');
  });
});

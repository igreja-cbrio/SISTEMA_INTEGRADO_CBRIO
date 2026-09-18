import { describe, it, expect } from 'vitest';
import {
  lerConfigBotIa, modoResposta, lerArea, acharArea, decidirAntesDoModelo,
  normalizarDecisao, sanitizarResposta, linkWaMe, textoEncaminhamento,
  montarSystemPrompt, montarMensagemUsuario, LIMITES_PADRAO, TOOL_DECISAO,
} from '../../backend/utils/botIaRegras.js';

// Réguas PURAS do bot de IA por área (08/09/2026). Cada bloco guarda uma decisão
// que, se regredir, produz mensagem errada saindo em nome da igreja ou o bot
// falando por cima de uma equipe que está atendendo.

const AREAS = [
  lerArea({ area: 'Grupos', ativo: true, descricao: 'grupos de conexão', conhecimento: 'Inscrição pelo site.', links: [{ rotulo: 'Inscrição', url: 'https://www.cbrio.org/inscricao-grupos' }] }),
  lerArea({ area: 'Kids', ativo: false, descricao: 'crianças', conhecimento: 'Check-in no totem.' }),
  lerArea({ area: 'Geral', ativo: true, descricao: 'horários e endereço' }),
];
const CONTATO = '(21) 99756-7770';

describe('lerConfigBotIa · fail-closed', () => {
  it('só liga com ativo === true', () => {
    expect(lerConfigBotIa({ ativo: true }).ativo).toBe(true);
    expect(lerConfigBotIa({ ativo: 'true' }).ativo).toBe(false);
    expect(lerConfigBotIa({}).ativo).toBe(false);
    expect(lerConfigBotIa(null).ativo).toBe(false);
    expect(lerConfigBotIa([]).ativo).toBe(false);
  });
  it('limites inválidos caem no padrão', () => {
    const c = lerConfigBotIa({ ativo: true, limite_dia: -5, limite_conversa_dia: 'abc', horas_silencio_apos_humano: 0 });
    expect(c.limite_dia).toBe(LIMITES_PADRAO.limite_dia);
    expect(c.limite_conversa_dia).toBe(LIMITES_PADRAO.limite_conversa_dia);
    expect(c.horas_silencio_apos_humano).toBe(LIMITES_PADRAO.horas_silencio_apos_humano);
  });
  it('deriva o link wa.me do contato humano', () => {
    expect(lerConfigBotIa({ contato_humano: CONTATO }).contato_link).toBe('https://wa.me/5521997567770');
    expect(lerConfigBotIa({ contato_humano: 'fale no balcão' }).contato_link).toBeNull();
  });
});

describe('modoResposta · menu × ia × ninguém', () => {
  it('config ilegível ⇒ ninguém (fail-closed)', () => {
    expect(modoResposta({ cfg: null, erroCfg: null, botIa: { ativo: true } })).toBe('ninguem');
    expect(modoResposta({ cfg: { respostas_automaticas: false }, erroCfg: new Error('x'), botIa: { ativo: true } })).toBe('ninguem');
  });
  it('respostas_automaticas ausente ou true ⇒ menu (espelho do freioBot)', () => {
    expect(modoResposta({ cfg: {}, botIa: { ativo: true } })).toBe('menu');
    expect(modoResposta({ cfg: { respostas_automaticas: true }, botIa: { ativo: true } })).toBe('menu');
  });
  it('menu desligado + bot_ia.ativo ⇒ ia · sem bot_ia ⇒ ninguém', () => {
    expect(modoResposta({ cfg: { respostas_automaticas: false }, botIa: { ativo: true } })).toBe('ia');
    expect(modoResposta({ cfg: { respostas_automaticas: false }, botIa: { ativo: false } })).toBe('ninguem');
    expect(modoResposta({ cfg: { respostas_automaticas: false }, botIa: null })).toBe('ninguem');
  });
});

describe('áreas', () => {
  it('lerArea normaliza e só aceita link http(s)', () => {
    const a = lerArea({ area: ' Grupos ', ativo: true, links: [{ rotulo: 'ok', url: 'https://x.org' }, { rotulo: 'ruim', url: 'javascript:alert(1)' }, { url: 'ftp://x' }] });
    expect(a?.area).toBe('Grupos');
    expect(a?.links).toHaveLength(1);
    expect(lerArea({ area: '', ativo: true })).toBeNull();
    expect(lerArea({ area: 'X', ativo: 'true' })?.ativo).toBe(false);
  });
  it('acharArea ignora acento e caixa · "nenhuma" é null', () => {
    expect(acharArea('grupos', AREAS)?.area).toBe('Grupos');
    expect(acharArea('GERAL', AREAS)?.area).toBe('Geral');
    expect(acharArea('nenhuma', AREAS)).toBeNull();
    expect(acharArea('Financeiro', AREAS)).toBeNull();
    expect(acharArea('', AREAS)).toBeNull();
  });
});

describe('decidirAntesDoModelo · quando nem chamar o modelo', () => {
  const base = { texto: 'Quando é o próximo encontro?', areasAtivas: 2, limites: LIMITES_PADRAO, agora: Date.parse('2026-09-08T15:00:00Z') };
  it('caso normal chama o modelo', () => {
    expect(decidirAntesDoModelo(base)).toEqual({ pular: false, motivo: null });
  });
  it('texto vazio, agradecimento e nenhuma área ligada pulam', () => {
    expect(decidirAntesDoModelo({ ...base, texto: '  ' }).motivo).toBe('sem_texto');
    expect(decidirAntesDoModelo({ ...base, agradecimento: true }).motivo).toBe('agradecimento');
    expect(decidirAntesDoModelo({ ...base, areasAtivas: 0 }).motivo).toBe('sem_area_ativa');
  });
  it('tetos: global e por conversa', () => {
    expect(decidirAntesDoModelo({ ...base, respostasHoje: LIMITES_PADRAO.limite_dia }).motivo).toBe('limite_dia');
    expect(decidirAntesDoModelo({ ...base, respostasHoje: LIMITES_PADRAO.limite_dia - 1 }).pular).toBe(false);
    expect(decidirAntesDoModelo({ ...base, respostasConversaHoje: LIMITES_PADRAO.limite_conversa_dia }).motivo).toBe('limite_conversa');
  });
  it('humano respondeu há pouco ⇒ o bot não entra; há muito ⇒ entra', () => {
    const agora = base.agora;
    const ha10h = new Date(agora - 10 * 3600e3).toISOString();
    const ha3d = new Date(agora - 72 * 3600e3).toISOString();
    expect(decidirAntesDoModelo({ ...base, ultimaHumanaEm: ha10h }).motivo).toBe('humano_ativo');
    expect(decidirAntesDoModelo({ ...base, ultimaHumanaEm: ha3d }).pular).toBe(false);
    expect(decidirAntesDoModelo({ ...base, ultimaHumanaEm: 'data inválida' }).pular).toBe(false);
  });
});

describe('normalizarDecisao · a casa manda, não o modelo', () => {
  const opts = { areas: AREAS, contatoHumano: CONTATO };
  it('responder em área ligada com texto passa', () => {
    const d = normalizarDecisao({ area: 'Grupos', acao: 'responder', resposta: 'A inscrição é pelo site.', motivo: 'ok' }, opts);
    expect(d.acao).toBe('responder');
    expect(d.area?.area).toBe('Grupos');
    expect(d.resposta).toBe('A inscrição é pelo site.');
  });
  it('⚠️ área DESLIGADA cala o bot, mesmo com resposta boa — a equipe humana responde', () => {
    const d = normalizarDecisao({ area: 'Kids', acao: 'responder', resposta: 'O check-in é no totem.', motivo: 'x' }, opts);
    expect(d.acao).toBe('silencio');
    expect(d.motivo).toBe('area_desligada');
    expect(d.area?.area).toBe('Kids'); // a área fica: é a triagem que a tela usa
  });
  it('⚠️ encaminhar em área desligada também cala (não empurra pra fora da fila certa)', () => {
    expect(normalizarDecisao({ area: 'Kids', acao: 'encaminhar', motivo: 'x' }, opts).acao).toBe('silencio');
  });
  it('responder sem área conhecida vira encaminhar', () => {
    const d = normalizarDecisao({ area: 'Financeiro', acao: 'responder', resposta: 'Pague ali', motivo: 'x' }, opts);
    expect(d.acao).toBe('encaminhar');
    expect(d.motivo).toBe('sem_area');
    expect(d.area).toBeNull();
  });
  it('encaminhar sem contato humano configurado vira silêncio', () => {
    const d = normalizarDecisao({ area: 'nenhuma', acao: 'encaminhar', motivo: 'x' }, { areas: AREAS, contatoHumano: '' });
    expect(d.acao).toBe('silencio');
    expect(d.motivo).toBe('sem_contato_humano');
  });
  it('resposta vazia e ação desconhecida viram silêncio', () => {
    expect(normalizarDecisao({ area: 'Grupos', acao: 'responder', resposta: '  ', motivo: 'x' }, opts).motivo).toBe('resposta_vazia');
    expect(normalizarDecisao({ area: 'Grupos', acao: 'gritar', resposta: 'oi', motivo: 'x' }, opts).acao).toBe('silencio');
    expect(normalizarDecisao(null, opts).acao).toBe('silencio');
  });
});

describe('sanitizarResposta · o modelo não inventa link nem telefone', () => {
  const opts = { linksPermitidos: ['https://www.cbrio.org/inscricao-grupos'], contato: CONTATO };
  it('mantém link permitido (inclusive com query) e remove link estranho', () => {
    const r = sanitizarResposta('Inscreva-se em https://www.cbrio.org/inscricao-grupos?utm=zap ou em https://igrejavizinha.com/x', opts);
    expect(r.texto).toContain('cbrio.org/inscricao-grupos?utm=zap');
    expect(r.texto).not.toContain('igrejavizinha');
    expect(r.removidos.links).toBe(1);
  });
  it('mantém o contato humano e remove telefone inventado', () => {
    const r = sanitizarResposta('Fale no (21) 99756-7770 ou no 21 3333-4444.', opts);
    expect(r.texto).toContain('99756-7770');
    expect(r.texto).not.toContain('3333-4444');
    expect(r.removidos.telefones).toBe(1);
  });
  it('não confunde horário com telefone', () => {
    const r = sanitizarResposta('Cultos às 09:30 e 11:30, quarta às 20:00.', opts);
    expect(r.texto).toBe('Cultos às 09:30 e 11:30, quarta às 20:00.');
    expect(r.removidos.telefones).toBe(0);
  });
  it('⚠️ data ISO e número curto NÃO são telefone (o mutante do limiar sobreviveu por falta deste caso)', () => {
    const r = sanitizarResposta('O encontro é em 2026-09-08, sala 101-B, ramal 4002-8922.', opts);
    expect(r.texto).toContain('2026-09-08');
    expect(r.texto).toContain('4002-8922');
    expect(r.removidos.telefones).toBe(0);
  });
  it('sequência de 11 dígitos que não é o contato (CPF, celular inventado) é apagada', () => {
    const r = sanitizarResposta('Seu CPF 123.456.789-01 ou ligue 21 98888-7777.', opts);
    expect(r.texto).not.toContain('123.456.789-01');
    expect(r.texto).not.toContain('98888-7777');
    expect(r.removidos.telefones).toBe(2);
  });
  it('corta texto longo no limite, sem quebrar no meio de palavra', () => {
    const longo = Array(300).fill('palavra').join(' ');
    const r = sanitizarResposta(longo, opts);
    expect(r.texto.length).toBeLessThanOrEqual(901);
    expect(r.texto.endsWith('…')).toBe(true);
  });
  it('www. sem protocolo também é URL', () => {
    const r = sanitizarResposta('Veja www.outrosite.com agora', opts);
    expect(r.texto).not.toContain('outrosite');
  });
});

describe('textos fixos', () => {
  it('linkWaMe só para telefone BR plausível', () => {
    expect(linkWaMe('21997567770')).toBe('https://wa.me/5521997567770');
    expect(linkWaMe('5521997567770')).toBe('https://wa.me/5521997567770');
    expect(linkWaMe('4002-8922')).toBeNull();
    expect(linkWaMe('')).toBeNull();
  });
  it('encaminhamento cita o contato, o link e o primeiro nome', () => {
    const t = textoEncaminhamento({ nome: 'Ana Paula Silva', contato: CONTATO, contatoLink: 'https://wa.me/5521997567770', area: 'Grupos' });
    expect(t).toContain('Oi, Ana!');
    expect(t).toContain(CONTATO);
    expect(t).toContain('https://wa.me/5521997567770');
    expect(t).toContain('equipe de Grupos');
  });
});

describe('prompts', () => {
  it('system lista toda área com o estado e só o conhecimento das LIGADAS', () => {
    const s = montarSystemPrompt({ areas: AREAS, institucional: { horarios: 'Dom 09:30 e 11:30', endereco: 'Av. X, 100' }, contatoHumano: CONTATO });
    expect(s).toContain('Grupos · LIGADA');
    expect(s).toContain('Kids · DESLIGADA');
    expect(s).toContain('Inscrição pelo site.');
    expect(s).not.toContain('Check-in no totem.');
    expect(s).toContain('https://www.cbrio.org/inscricao-grupos');
    // o institucional entra pela área Geral
    expect(s).toContain('Dom 09:30 e 11:30');
    expect(s).toContain(CONTATO);
  });
  it('mensagem do usuário carrega pessoa, grupo, histórico e a mensagem nova', () => {
    const u = montarMensagemUsuario({
      conversa: { nome: 'Ana Paula', area: null },
      perfil: { cadastrado: true, batizado: true, fez_next: false, serve: false, grupo: { nome: 'Finanças na Ótica de Cristo', online: true, lider_nome: 'Natasha', lider_telefone: '21 98888-0000', proxima: 'terça, 10/09 às 20:00', estimada: false } },
      historico: [{ direcao: 'out', tipo: 'template', texto: 'Bem-vinda ao grupo' }, { direcao: 'in', tipo: 'text', texto: 'Obrigada' }],
      texto: 'Receberemos o link por aqui?',
    });
    expect(u).toContain('Nome: Ana Paula');
    expect(u).toContain('Grupo de conexão: Finanças na Ótica de Cristo');
    expect(u).toContain('líder: Natasha (21 98888-0000)');
    expect(u).toContain('[IGREJA] Bem-vinda ao grupo');
    expect(u).toContain('[PESSOA] Obrigada');
    expect(u).toContain('Receberemos o link por aqui?');
  });
  it('a ferramenta exige area, acao e motivo, e as ações são fechadas', () => {
    expect(TOOL_DECISAO.input_schema.required).toEqual(['area', 'acao', 'motivo']);
    expect(TOOL_DECISAO.input_schema.properties.acao.enum).toEqual(['responder', 'encaminhar', 'silencio']);
  });
});

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  periodoAnterior, limitesUtcDoPeriodo, deveRodarAgora, ehPastoral, mascararPII,
  prepararAmostra, normalizarSaidaModelo, montarEmail, sanitizarErro, rotuloPeriodo,
  TOOL_AGRUPAR, PALAVRAS_PASTORAIS,
} from '../../backend/utils/botIaVarredura.js';
import { lerConfigBotIa, listaEmails, mesclarConfigBotIa } from '../../backend/utils/botIaRegras.js';

// Varredura mensal do WhatsApp (26/09/2026). Cada bloco guarda uma decisão que,
// se regredir, manda texto de membro pra fora do sistema, roda o mês errado ou
// apaga em silêncio a configuração de quem recebe o e-mail.

/** Roda `fn` com o fuso da MÁQUINA forçado — o gate roda em UTC e, sem isto,
 * uma régua que dependesse do fuso local passaria por acidente. */
function comFuso<T>(tz: string, fn: () => T): T {
  const antes = process.env.TZ;
  process.env.TZ = tz;
  try { return fn(); } finally {
    if (antes === undefined) delete process.env.TZ; else process.env.TZ = antes;
  }
}

describe('periodoAnterior · o mês é o do Rio, não o do servidor', () => {
  it('01/10 às 01:00 UTC ainda é 30/09 no Rio ⇒ o anterior é agosto', () => {
    const t = Date.parse('2026-10-01T01:00:00Z');
    for (const tz of ['Asia/Tokyo', 'America/Sao_Paulo', 'UTC']) {
      expect(comFuso(tz, () => periodoAnterior(t))).toBe('2026-08');
    }
  });
  it('01/10 às 04:00 UTC já é 01/10 no Rio ⇒ o anterior é setembro', () => {
    const t = Date.parse('2026-10-01T04:00:00Z');
    for (const tz of ['Asia/Tokyo', 'America/Sao_Paulo']) {
      expect(comFuso(tz, () => periodoAnterior(t))).toBe('2026-09');
    }
  });
  it('janeiro volta para dezembro do ano anterior', () => {
    expect(periodoAnterior(Date.parse('2027-01-15T12:00:00Z'))).toBe('2026-12');
  });
  it('instante inválido lança (nunca "NaN-NaN")', () => {
    expect(() => periodoAnterior(Number.NaN)).toThrow();
  });
});

describe('limitesUtcDoPeriodo · 00:00 BRT = 03:00Z, fim exclusivo', () => {
  it('mês comum', () => {
    expect(limitesUtcDoPeriodo('2026-08')).toEqual({
      inicioIso: '2026-08-01T03:00:00.000Z', fimIso: '2026-09-01T03:00:00.000Z',
    });
  });
  it('dezembro vira o ano', () => {
    expect(limitesUtcDoPeriodo('2026-12')).toEqual({
      inicioIso: '2026-12-01T03:00:00.000Z', fimIso: '2027-01-01T03:00:00.000Z',
    });
  });
  it('período inválido lança', () => {
    expect(() => limitesUtcDoPeriodo('2026-13')).toThrow();
    expect(() => limitesUtcDoPeriodo('agosto')).toThrow();
  });
  it('rótulo em português', () => {
    expect(rotuloPeriodo('2026-03')).toBe('março de 2026');
  });
});

describe('deveRodarAgora · a partir das 6h BRT, uma vez por mês', () => {
  // 1º de outubro: 08:00Z = 05:00 BRT · 09:00Z = 06:00 BRT · 10:00Z = 07:00 BRT
  it('05h BRT não roda', () => {
    expect(deveRodarAgora({ agoraMs: Date.parse('2026-10-01T08:00:00Z'), jaExiste: false })).toBe(false);
  });
  it('06h BRT roda', () => {
    expect(deveRodarAgora({ agoraMs: Date.parse('2026-10-01T09:00:00Z'), jaExiste: false })).toBe(true);
  });
  it('07h e 23h BRT também rodam (o cron pode ter perdido a hora das 6)', () => {
    expect(deveRodarAgora({ agoraMs: Date.parse('2026-10-01T10:00:00Z'), jaExiste: false })).toBe(true);
    expect(deveRodarAgora({ agoraMs: Date.parse('2026-10-02T02:00:00Z'), jaExiste: false })).toBe(true);
  });
  it('um dia perdido é recuperado no dia seguinte', () => {
    expect(deveRodarAgora({ agoraMs: Date.parse('2026-10-02T12:00:00Z'), jaExiste: false })).toBe(true);
  });
  it('já existe ⇒ não roda, em hora nenhuma', () => {
    expect(deveRodarAgora({ agoraMs: Date.parse('2026-10-01T12:00:00Z'), jaExiste: true })).toBe(false);
  });
  it('a hora é a do Rio mesmo com a máquina em Tóquio', () => {
    expect(comFuso('Asia/Tokyo', () => deveRodarAgora({ agoraMs: Date.parse('2026-10-01T08:00:00Z'), jaExiste: false }))).toBe(false);
  });
});

describe('ehPastoral · lista fechada, por palavra', () => {
  const positivos = [
    'Preciso de oração pela minha família', 'Podem orar por minha mãe?', 'meu pai faleceu ontem',
    'estou com depressão', 'crise de ansiedade', 'SOS', 'quero falar com a pastora',
    'ela está no hospital', 'estamos em processo de separação', 'pensando em divórcio',
    'fui traída', 'vício em jogo', 'quero aconselhamento', 'minha avó está doente',
    'vai fazer cirurgia amanhã', 'estamos de luto',
  ];
  const negativos = [
    'qual o horário do culto?', 'como funciona a operação do estacionamento?', 'ele lutou muito no jogo',
    'como faço a inscrição no grupo?', 'agora sim, obrigado', 'onde fica a igreja?', 'quero ser voluntário',
  ];
  it.each(positivos)('pastoral: %s', (t) => { expect(ehPastoral(t)).toBe(true); });
  it.each(negativos)('não pastoral: %s', (t) => { expect(ehPastoral(t)).toBe(false); });
  it('a lista é fechada e contém as raízes decididas pelo conselho', () => {
    for (const r of ['oracao', 'orar*', 'sos', 'aconselh*', 'pastor*', 'luto', 'falec*', 'depress*', 'suicid*', 'ansied*', 'hospital*', 'cirurgi*', 'divorci*', 'vicio*']) {
      expect(PALAVRAS_PASTORAIS).toContain(r);
    }
  });
});

describe('mascararPII · o que identifica sai antes do modelo', () => {
  it('telefone com e sem máscara', () => {
    expect(mascararPII('me liga (21) 99988-7766')).toBe('me liga [telefone]');
    expect(mascararPII('zap 21999887766')).toBe('zap [telefone]');
    expect(mascararPII('+55 21 9 9988 7766')).toBe('[telefone]');
    expect(mascararPII('liga 99988-7766')).toBe('liga [telefone]');
  });
  it('CPF, e-mail e link', () => {
    expect(mascararPII('cpf 123.456.789-09')).toBe('cpf [cpf]');
    expect(mascararPII('Fulano.Silva@Gmail.com')).toBe('[email]');
    expect(mascararPII('vi em https://www.cbrio.org/grupos?x=1 ok')).toBe('vi em [link] ok');
  });
  it('data ISO fica intacta (8 dígitos não é telefone)', () => {
    expect(mascararPII('no dia 2026-09-08 às 10h')).toBe('no dia 2026-09-08 às 10h');
    // ⚠️ com hora colada, os dígitos somam 10 e a data viraria "[telefone]" —
    // é este caso que a proteção de data existe pra cobrir (o de cima passaria
    // mesmo sem ela: mutante rodado).
    expect(mascararPII('marcado para 2026-09-08 10:30')).toBe('marcado para 2026-09-08 10:30');
  });
  it('o telefone da PRÓPRIA conversa sai mesmo pela metade', () => {
    expect(mascararPII('meu número é 911112222', { telefoneConversa: '5521911112222' })).toBe('meu número é [telefone]');
    expect(mascararPII('final 1111 2222', { telefoneConversa: '5521911112222' })).toBe('final [telefone]');
  });
  it('números curtos do dia a dia ficam', () => {
    expect(mascararPII('tenho 2 filhos de 10 e 12 anos')).toBe('tenho 2 filhos de 10 e 12 anos');
  });
});

describe('prepararAmostra · dedup, teto, uma conversa por vez', () => {
  const msgs = [
    { id: 'm1', conversa_id: 'A', area: 'Grupos', texto: 'Oi, como entro num grupo?' },
    { id: 'm2', conversa_id: 'A', area: 'Grupos', texto: 'oi,   como entro num grupo?!' },
    { id: 'm3', conversa_id: 'A', area: 'Grupos', texto: 'e qual o horário?' },
    { id: 'm4', conversa_id: 'B', area: null, texto: 'onde fica a igreja' },
    { id: 'm5', conversa_id: 'C', area: 'Kids', texto: 'tem culto infantil?' },
    { id: 'm6', conversa_id: 'C', area: 'Kids', texto: '   ' },
  ];
  it('deduplica textos iguais normalizados e ignora vazio', () => {
    const r = prepararAmostra(msgs);
    expect(r.total).toBe(5);
    expect(r.distintas).toBe(4);
    expect(r.itens.map(i => i.id)).toEqual(['m1', 'm3', 'm4', 'm5']);
    expect(r.itens.map(i => i.idx)).toEqual([1, 2, 3, 4]);
    expect(r.truncado).toBe(false);
  });
  it('com teto, prioriza uma mensagem de cada conversa', () => {
    const r = prepararAmostra(msgs, { teto: 3 });
    expect(r.itens.map(i => i.id)).toEqual(['m1', 'm4', 'm5']);
    expect(r.truncado).toBe(true);
  });
  it('corta o texto longo', () => {
    const r = prepararAmostra([{ id: 'x', conversa_id: 'Z', texto: 'palavra '.repeat(100) }], { maxChars: 50 });
    expect(r.itens[0].texto.length).toBeLessThanOrEqual(51);
    expect(r.itens[0].texto.endsWith('…')).toBe(true);
  });
});

describe('normalizarSaidaModelo · fail-closed', () => {
  const amostra = prepararAmostra([
    { id: 'u1', conversa_id: 'A', texto: 'como entro num grupo' },
    { id: 'u2', conversa_id: 'B', texto: 'quero entrar em grupo de casais' },
    { id: 'u3', conversa_id: 'C', texto: 'horário do culto' },
  ]);
  it('mapeia índice para o ID real e conta mensagens únicas', () => {
    const r = normalizarSaidaModelo({
      temas: [{ tema: 'Entrar em grupo', area_sugerida: 'grupos', o_bot_saberia: false, lacuna: 'grupos de casais', mensagens: [1, 2, 2], exemplos: [2] }],
      lacunas_gerais: [{ area: 'Grupos', lacuna: 'grupos de casais', sugestao_conhecimento: 'listar os de casais' }],
    }, { amostra, areasValidas: ['Grupos', 'Kids'] });
    expect(r.temas).toHaveLength(1);
    expect(r.temas[0]).toMatchObject({ tema: 'Entrar em grupo', contagem: 2, area_sugerida: 'Grupos', o_bot_saberia: false, lacuna: 'grupos de casais' });
    expect(r.temas[0].exemplo_ids).toEqual(['u2', 'u1']);
    expect(r.lacunas).toEqual([{ area: 'Grupos', lacuna: 'grupos de casais', sugestao_conhecimento: 'listar os de casais' }]);
  });
  it('índice fora da amostra é descartado; tema só com índice inventado some', () => {
    const r = normalizarSaidaModelo({
      temas: [
        { tema: 'Culto', area_sugerida: 'Geral', o_bot_saberia: true, mensagens: [3, 99, -1, 1.5, true, 'x'] },
        { tema: 'Inventado', area_sugerida: 'Geral', o_bot_saberia: true, mensagens: [42, 77] },
      ],
      lacunas_gerais: [],
    }, { amostra, areasValidas: [] });
    expect(r.temas).toHaveLength(1);
    expect(r.temas[0].contagem).toBe(1);
    expect(r.temas[0].exemplo_ids).toEqual(['u3']);
  });
  it('uma mensagem conta em um tema só', () => {
    const r = normalizarSaidaModelo({
      temas: [
        { tema: 'A', area_sugerida: 'x', o_bot_saberia: true, mensagens: [1, 2] },
        { tema: 'B', area_sugerida: 'x', o_bot_saberia: true, mensagens: [2, 3] },
      ],
      lacunas_gerais: [],
    }, { amostra, areasValidas: [] });
    expect(r.temas.map(t => [t.tema, t.contagem])).toEqual([['A', 2], ['B', 1]]);
  });
  it('área fora da lista vira Geral', () => {
    const r = normalizarSaidaModelo({ temas: [{ tema: 'T', area_sugerida: 'Financeiro', o_bot_saberia: true, mensagens: [1] }], lacunas_gerais: [] },
      { amostra, areasValidas: ['Grupos'] });
    expect(r.temas[0].area_sugerida).toBe('Geral');
  });
  it('entrada lixo ⇒ nada', () => {
    for (const lixo of [null, undefined, 'texto', 42, [], { temas: 'x' }]) {
      expect(normalizarSaidaModelo(lixo, { amostra, areasValidas: [] }).temas).toEqual([]);
    }
  });
  it('a ferramenta pede TODOS os índices do tema (senão a contagem ficaria ≤ 5)', () => {
    const props = (TOOL_AGRUPAR.input_schema.properties.temas.items as { properties: Record<string, unknown>; required: string[] });
    expect(Object.keys(props.properties)).toContain('mensagens');
    expect(props.required).toContain('mensagens');
  });
});

describe('montarEmail · nunca leva texto de mensagem', () => {
  const MARCADOR = 'TEXTO_DE_MEMBRO_QUE_NAO_PODE_SAIR';
  const temas = [{
    tema: 'Entrar em grupo', contagem: 12, area_sugerida: 'Grupos', o_bot_saberia: false, lacuna: 'grupos de casais',
    exemplo_ids: ['u1'], texto: MARCADOR, exemplos: [{ texto: MARCADOR }], nome: MARCADOR,
  }];
  const r = montarEmail({
    periodo: '2026-08', temas, lacunas: [{ area: 'Grupos', lacuna: 'casais', sugestao_conhecimento: 'listar' }],
    totais: { total_mensagens: 300, total_conversas: 120, excluidas_pastoral: 9, excluidas_conversas_cuidados: 4, analisadas: 250 },
    urlErp: 'https://www.cbrio.org',
  });
  it('não contém o texto pendurado no tema, em lugar nenhum', () => {
    expect(r.html).not.toContain(MARCADOR);
    expect(r.text).not.toContain(MARCADOR);
    expect(r.subject).not.toContain(MARCADOR);
  });
  it('leva tema, contagem, lacuna e o link pro ERP', () => {
    expect(r.subject).toContain('agosto de 2026');
    expect(r.html).toContain('Entrar em grupo');
    expect(r.html).toContain('12');
    expect(r.text).toContain('grupos de casais');
    expect(r.html).toContain('https://www.cbrio.org/comunicacao?tab=bot');
  });
  it('escapa HTML vindo do modelo', () => {
    const e = montarEmail({ periodo: '2026-08', temas: [{ tema: '<script>x</script>', contagem: 1, area_sugerida: 'Geral', o_bot_saberia: true }], urlErp: 'https://www.cbrio.org' });
    expect(e.html).not.toContain('<script>');
  });
});

describe('sanitizarErro · motivo legível, sem segredo', () => {
  it('reconhece a conta sem crédito', () => {
    expect(sanitizarErro('400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}'))
      .toBe('anthropic_sem_credito');
  });
  it('chave ausente e chave inválida', () => {
    expect(sanitizarErro('ANTHROPIC_API_KEY não configurada')).toBe('anthropic_nao_configurada');
    expect(sanitizarErro('401 authentication_error: invalid x-api-key')).toBe('anthropic_chave_invalida');
  });
  it('remove chave, token e telefone; preserva o UUID do request', () => {
    const s = sanitizarErro('falhou sk-ant-api03-abcdef req 2f0e8a1c-4b3d-4e5f-9a1b-123456789012 token ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ab tel 21999887766');
    expect(s).not.toContain('sk-ant');
    expect(s).not.toContain('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ab');
    expect(s).not.toContain('21999887766');
    expect(s).toContain('2f0e8a1c-4b3d-4e5f-9a1b-123456789012');
  });
  it('vazio vira erro_desconhecido', () => { expect(sanitizarErro('')).toBe('erro_desconhecido'); });
});

describe('config do bot · os e-mails da varredura não se perdem', () => {
  it('lerConfigBotIa valida a lista (lower, sem repetição, teto 5, lixo ⇒ [])', () => {
    expect(lerConfigBotIa({ varredura_emails: ['Gestao@CBRio.com.br', 'x', 'gestao@cbrio.com.br', 'matheus@cbrio.com.br'] }).varredura_emails)
      .toEqual(['gestao@cbrio.com.br', 'matheus@cbrio.com.br']);
    expect(lerConfigBotIa({ varredura_emails: 'lixo' }).varredura_emails).toEqual([]);
    expect(lerConfigBotIa({ varredura_emails: 42 }).varredura_emails).toEqual([]);
    expect(lerConfigBotIa(null).varredura_emails).toEqual([]);
    expect(listaEmails(['a@a.co', 'b@b.co', 'c@c.co', 'd@d.co', 'e@e.co', 'f@f.co'])).toHaveLength(5);
    expect(listaEmails('a@a.co; b@b.co,c@c.co')).toEqual(['a@a.co', 'b@b.co', 'c@c.co']);
  });
  it('mesclarConfigBotIa preserva as chaves que a tela não conhece', () => {
    const bruto = { ativo: false, contato_humano: '21 99999-0000', varredura_emails: ['gestao@cbrio.com.br'], chave_de_outra_frente: 7 };
    const n = lerConfigBotIa({ ...bruto, contato_humano: '21 98888-1111' });
    const gravado = mesclarConfigBotIa(bruto, n);
    expect(gravado.varredura_emails).toEqual(['gestao@cbrio.com.br']);
    expect((gravado as Record<string, unknown>).chave_de_outra_frente).toBe(7);
    expect(gravado.contato_humano).toBe('21 98888-1111');
    expect((gravado as Record<string, unknown>).contato_link).toBeUndefined();
  });
});

// ── guardas ESTÁTICAS (o arquivo carrega Express/Supabase, então é por texto) ──
function semComentarios(src: string) {
  return src
    .split('\n')
    .map((l) => l.replace(/(^|[^:"'`])\/\/[^\n]*/, '$1'))
    .join('\n');
}
const raiz = path.resolve(__dirname, '../..');
const rotas = semComentarios(fs.readFileSync(path.join(raiz, 'backend/routes/comunicacao.js'), 'utf8'));
const servico = semComentarios(fs.readFileSync(path.join(raiz, 'backend/services/botIaVarredura.js'), 'utf8'));
const regua = fs.readFileSync(path.join(raiz, 'backend/utils/botIaVarredura.js'), 'utf8');

describe('guardas estáticas', () => {
  it('o cron chama rodarSeDevido num bloco protegido', () => {
    const i = rotas.indexOf("rodarSeDevido({ agoraMs: Date.now() })");
    expect(i).toBeGreaterThan(-1);
    const antes = rotas.slice(Math.max(0, i - 400), i);
    expect(antes).toMatch(/try\s*\{[^]*$/);
    expect(rotas.slice(i, i + 400)).toMatch(/catch \(e\)/);
  });
  it('o serviço consulta o interruptor pelo próprio DISPARO_ID', () => {
    expect(servico).toContain("const DISPARO_ID = 'bot_varredura_mensal'");
    expect(servico).toContain('disparoDesligado(DISPARO_ID)');
  });
  it('montarEmail não recebe texto de mensagem', () => {
    const assinatura = /function montarEmail\(\{([^}]*)\}/.exec(regua)?.[1] || '';
    expect(assinatura).not.toMatch(/texto|exemplos|mensagens/);
  });
  it('o PUT da config grava pelo merge que preserva varredura_emails', () => {
    expect(rotas).toContain('R.mesclarConfigBotIa(atual.bruto, n)');
    expect(rotas).not.toMatch(/patch\.bot_ia\s*=\s*\{/);
  });
  it('o serviço exclui Cuidados e pastoral ANTES do modelo', () => {
    const iCuidados = servico.indexOf("=== 'cuidados'");
    const iPastoral = servico.indexOf('V.ehPastoral(');
    const iModelo = servico.indexOf('await agruparComModelo(');
    expect(iCuidados).toBeGreaterThan(-1);
    expect(iPastoral).toBeGreaterThan(-1);
    expect(iCuidados).toBeLessThan(iModelo);
    expect(iPastoral).toBeLessThan(iModelo);
  });
});

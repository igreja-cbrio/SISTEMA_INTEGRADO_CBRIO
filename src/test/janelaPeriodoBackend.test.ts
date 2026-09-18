// Contrato da janela de período do SERVIDOR + espelho com o cliente.
//
// Pedido do Marcos (24/08/2026), depois da apresentação do ministerial: "nenhum
// filtro de data tem 'por ano' e aí selecionar o ano — não consigo ver a jornada
// por ano, só os últimos 6 meses ou 365 dias".
//
// ⚠️⚠️ ANO É A PRIMEIRA JANELA FECHADA DO SISTEMA. Toda outra é "últimos N dias
// a partir de agora" e só precisava de um `inicio`. É por isso que a maior parte
// dos casos aqui existe pra travar UMA coisa: **o `fim` não pode desaparecer**.
// Sem ele, escolher "2024" mostraria 2024→hoje — e erra em SILÊNCIO, porque o
// número só fica maior e nada quebra.
//
// MUTANTES que este arquivo mata (rodados):
//   · devolver `fim: null` no ano                     → 4 vermelhos
//   · formatar o `fim` com toISOString() (UTC)        → 1 vermelho
//   · ano corrente indo até 31/12 (futuro)            → 1 vermelho
//   · aceitar ano fora da faixa (2019 / 2099)         → 2 vermelhos
//   · granularidade do ano voltando a 'semana'        → 2 vermelhos
//   · tirar o `.lte` do comJanela da jornada          → 1 vermelho
//
// O "agora" é INJETADO em todo caso — nenhum depende do relógio da máquina.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  ANO_INICIAL, diaLocal, anoValido, resolverJanelaPeriodo, rotuloJanela,
} from '../../backend/utils/janelaPeriodo.js';
import {
  ANO_INICIAL as ANO_INICIAL_CLIENTE, granularidadeDaJanela, filtroPeriodo, opcoesAno,
} from '../lib/janelaPeriodo.js';

// 24/08/2026, 15h no Rio.
const AGORA = new Date('2026-08-24T15:00:00-03:00').getTime();
const DIAS = [30, 60, 90, 180, 365, 1825];
const base = { diasValidos: DIAS, diasPadrao: 90, agora: AGORA };

describe('resolverJanelaPeriodo · ano é janela FECHADA', () => {
  it('ano passado fecha em 31/12 — o `fim` é o que impede 2024→hoje', () => {
    const j = resolverJanelaPeriodo({ ...base, ano: '2024' });
    expect(j.inicio).toBe('2024-01-01');
    expect(j.fim).toBe('2024-12-31');
    expect(j.ano).toBe(2024);
    expect(j.dias).toBeNull();
  });

  it('ano CORRENTE não termina no futuro (culto nasce pré-agendado com zero)', () => {
    const j = resolverJanelaPeriodo({ ...base, ano: '2026' });
    expect(j.inicio).toBe('2026-01-01');
    expect(j.fim).toBe('2026-08-24');
  });

  it('janela MÓVEL não tem fim — o comportamento antigo fica byte a byte', () => {
    for (const d of DIAS) {
      const j = resolverJanelaPeriodo({ ...base, dias: String(d) });
      expect(j.fim).toBeNull();
      expect(j.dias).toBe(d);
      expect(j.ano).toBeNull();
    }
  });

  it('ano tem PRECEDÊNCIA sobre dias (a tela manda um ou outro, nunca os dois)', () => {
    const j = resolverJanelaPeriodo({ ...base, dias: '30', ano: '2025' });
    expect(j.ano).toBe(2025);
    expect(j.fim).toBe('2025-12-31');
  });
});

describe('resolverJanelaPeriodo · o que NÃO é ano', () => {
  it('ano antes do 1º dado real e ano no futuro caem na janela de dias', () => {
    expect(resolverJanelaPeriodo({ ...base, ano: '2019' }).ano).toBeNull();
    expect(resolverJanelaPeriodo({ ...base, ano: '2099' }).ano).toBeNull();
  });

  it('lixo no lugar do ano não vira NaN nem janela vazia', () => {
    for (const v of ['abc', '', '20xx', null, undefined, {} as any]) {
      const j = resolverJanelaPeriodo({ ...base, ano: v as any });
      expect(j.ano).toBeNull();
      expect(j.dias).toBe(90);
      expect(j.inicio).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('dias fora da allowlist cai no padrão, nunca no valor solto', () => {
    expect(resolverJanelaPeriodo({ ...base, dias: '7' }).dias).toBe(90);
    expect(resolverJanelaPeriodo({ ...base, dias: '99999' }).dias).toBe(90);
  });

  it('anoValido respeita ANO_INICIAL e o ano corrente', () => {
    expect(anoValido(ANO_INICIAL, AGORA)).toBe(true);
    expect(anoValido(ANO_INICIAL - 1, AGORA)).toBe(false);
    expect(anoValido(2026, AGORA)).toBe(true);
    expect(anoValido(2027, AGORA)).toBe(false);
  });
});

describe('diaLocal · NUNCA toISOString', () => {
  it('31/12 às 23:59 no Rio continua sendo 31/12 (em UTC seria 01/01)', () => {
    const tz = process.env.TZ;
    try {
      process.env.TZ = 'America/Sao_Paulo';
      const fimDoAno = new Date(2024, 11, 31, 23, 59, 59);
      expect(diaLocal(fimDoAno)).toBe('2024-12-31');
      // A prova de que o caso é real: em UTC o mesmo instante já virou o ano.
      expect(fimDoAno.toISOString().slice(0, 10)).toBe('2025-01-01');
    } finally {
      process.env.TZ = tz;
    }
  });
});

describe('espelho backend × cliente', () => {
  it('ANO_INICIAL é o MESMO nos dois lados', () => {
    expect(ANO_INICIAL).toBe(ANO_INICIAL_CLIENTE);
  });

  it('granularidade concorda em toda opção que a tela oferece', () => {
    for (const opt of filtroPeriodo({ comTemporada: false, agora: AGORA })) {
      const doCliente = granularidadeDaJanela(opt.dias);
      const doServidor = typeof opt.dias === 'string'
        ? resolverJanelaPeriodo({ ...base, ano: String(opt.dias).slice(4) }).gran
        : resolverJanelaPeriodo({ ...base, dias: opt.dias }).gran;
      expect(doServidor).toBe(doCliente);
    }
  });

  it('ano é sempre MÊS (365 pontos diários viram mancha)', () => {
    expect(resolverJanelaPeriodo({ ...base, ano: '2024' }).gran).toBe('mes');
    expect(granularidadeDaJanela('ano:2024')).toBe('mes');
  });

  it('todo ano que a tela oferece é aceito pelo servidor', () => {
    for (const a of opcoesAno(AGORA)) {
      const j = resolverJanelaPeriodo({ ...base, ano: a.ano });
      expect(j.ano).toBe(a.ano);
      expect(j.fim).toBeTruthy();
    }
  });
});

describe('rotuloJanela · a janela vai colada no número (lei de 03/08)', () => {
  it('nomeia o ano e os dias', () => {
    expect(rotuloJanela(resolverJanelaPeriodo({ ...base, ano: '2024' }))).toBe('2024');
    expect(rotuloJanela(resolverJanelaPeriodo({ ...base, dias: '90' }))).toBe('últimos 90 dias');
  });
});

// ⚠️ Guarda ESTÁTICA (o motor da jornada importa o cliente do Supabase, então
// não entra no gate por require). A pergunta é só uma: o corte de cima existe?
describe('jornada · o comJanela FECHA a janela de ano', () => {
  const semComentarios = (txt: string) => txt
    .split('\n')
    .map(l => l.replace(/(^|[^:])\/\/[^\n]*$/, '$1'))
    .join('\n');

  it('aplica .lte junto com o .gte', () => {
    const src = semComentarios(
      readFileSync('backend/services/jornadaEngajamento.js', 'utf8'),
    );
    const corpo = src.slice(src.indexOf('const comJanela'), src.indexOf('const membros'));
    expect(corpo).toContain('.gte(col');
    expect(corpo).toContain('.lte(col');
  });

  it('a janela de ano é reconhecida pelo motor', () => {
    const src = readFileSync('backend/services/jornadaEngajamento.js', 'utf8');
    expect(src).toContain('ehJanelaAno');
    expect(src).toContain('recorteJanela');
  });
});

// ════════════════════════════════════════════════════════════════════════════
//  PERÍODO LIVRE (De/Até) · acrescentado em 31/08/2026
//
//  ⚠️ O que estes casos protegem, em ordem de dano:
//    1. ADITIVIDADE — sem `inicio`/`fim` a função tem de responder EXATAMENTE
//       o que respondia antes; ela serve 6 módulos e um desvio aqui muda número
//       em tela que ninguém está olhando agora;
//    2. `fim` no futuro ser CLAMPADO em hoje (senão o denominador de qualquer
//       média inclui dias que não aconteceram);
//    3. intervalo invertido / data inexistente NÃO virar janela vazia — zero se
//       lê como resposta, e a pergunta foi mal digitada;
//    4. o RÓTULO sair (número acumulado sem período ao lado é comparado errado).
// ════════════════════════════════════════════════════════════════════════════
describe('resolverJanelaPeriodo · período livre', () => {
  const AGORA = Date.parse('2026-08-31T15:00:00Z');
  const base = { diasValidos: [7, 30, 90], diasPadrao: 30, agora: AGORA };

  it('⚠️⚠️ ADITIVO: sem inicio/fim, a resposta é IDÊNTICA à de antes', () => {
    const semNada = resolverJanelaPeriodo({ ...base });
    const comVazio = resolverJanelaPeriodo({ ...base, inicio: undefined, fim: undefined });
    const comNulo = resolverJanelaPeriodo({ ...base, inicio: null, fim: null });
    expect(comVazio).toEqual(semNada);
    expect(comNulo).toEqual(semNada);
    expect(semNada.dias).toBe(30);
    expect(semNada.livre).toBeUndefined();
  });

  it('resolve o intervalo pedido', () => {
    const j = resolverJanelaPeriodo({ ...base, inicio: '2026-08-01', fim: '2026-08-15' });
    expect(j.inicio).toBe('2026-08-01');
    expect(j.fim).toBe('2026-08-15');
    expect(j.livre).toBe(true);
    expect(j.dias).toBeNull();
    expect(j.ano).toBeNull();
  });

  it('⚠️ vence o `ano` (é o recorte mais específico)', () => {
    const j = resolverJanelaPeriodo({ ...base, ano: 2026, inicio: '2026-03-01', fim: '2026-03-31' });
    expect(j.livre).toBe(true);
    expect(j.inicio).toBe('2026-03-01');
  });

  it('⚠️ vence o `dias`', () => {
    const j = resolverJanelaPeriodo({ ...base, dias: 7, inicio: '2026-01-01', fim: '2026-01-31' });
    expect(j.livre).toBe(true);
  });

  it('⚠️⚠️ `fim` no futuro é CLAMPADO em hoje, e o ajuste é DECLARADO', () => {
    const j = resolverJanelaPeriodo({ ...base, inicio: '2026-08-01', fim: '2026-12-31' });
    expect(j.fim).toBe('2026-08-31');
    expect(j.fim_ajustado).toBe(true);
  });

  it('fim que não passa de hoje não é marcado como ajustado', () => {
    const j = resolverJanelaPeriodo({ ...base, inicio: '2026-08-01', fim: '2026-08-15' });
    expect(j.fim_ajustado).toBe(false);
  });

  it('um único dia é período válido', () => {
    const j = resolverJanelaPeriodo({ ...base, inicio: '2026-08-30', fim: '2026-08-30' });
    expect(j.livre).toBe(true);
    expect(j.inicio).toBe(j.fim);
  });

  it('⚠️⚠️ intervalo INVERTIDO cai na janela padrão, não em período vazio', () => {
    const j = resolverJanelaPeriodo({ ...base, inicio: '2026-08-31', fim: '2026-08-01' });
    expect(j.livre).toBeUndefined();
    expect(j.dias).toBe(30);
  });

  it('⚠️ data inexistente (31/02) não é aceita', () => {
    const j = resolverJanelaPeriodo({ ...base, inicio: '2026-02-31', fim: '2026-03-10' });
    expect(j.livre).toBeUndefined();
  });

  it('⚠️ só uma das pontas não é período livre', () => {
    expect(resolverJanelaPeriodo({ ...base, inicio: '2026-08-01' }).livre).toBeUndefined();
    expect(resolverJanelaPeriodo({ ...base, fim: '2026-08-15' }).livre).toBeUndefined();
  });

  it('formato inválido não é aceito', () => {
    for (const ruim of ['31/08/2026', '2026-8-1', 'hoje', '', '2026-08-01T00:00:00Z']) {
      expect(resolverJanelaPeriodo({ ...base, inicio: ruim, fim: '2026-08-31' }).livre).toBeUndefined();
    }
  });

  it('granularidade acompanha o TAMANHO do intervalo', () => {
    expect(resolverJanelaPeriodo({ ...base, inicio: '2026-08-01', fim: '2026-08-31' }).gran).toBe('semana');
    expect(resolverJanelaPeriodo({ ...base, inicio: '2025-01-01', fim: '2026-08-31' }).gran).toBe('mes');
  });

  it('⚠️ o RÓTULO diz o intervalo (nunca "últimos null dias")', () => {
    const j = resolverJanelaPeriodo({ ...base, inicio: '2026-08-01', fim: '2026-08-15' });
    expect(rotuloJanela(j)).toBe('01/08/2026 a 15/08/2026');
    const umDia = resolverJanelaPeriodo({ ...base, inicio: '2026-08-30', fim: '2026-08-30' });
    expect(rotuloJanela(umDia)).toBe('30/08/2026');
    // e os rótulos antigos seguem iguais
    expect(rotuloJanela(resolverJanelaPeriodo({ ...base, dias: 7 }))).toBe('últimos 7 dias');
    expect(rotuloJanela(resolverJanelaPeriodo({ ...base, ano: 2025 }))).toBe('2025');
  });
});

// ⚠️ Guarda do incidente de 02/09: um erro de digitação no NOME do parâmetro
// (`padraoDias` em vez de `diasPadrao`) fazia a régua devolver
// `inicio: "NaN-NaN-NaN"`, o PostgREST recusar e a tela de decisões do Kids
// morrer com 500. Data inventada não pode sair daqui.
describe('resolverJanelaPeriodo · nunca fabrica data inválida', () => {
  it('sem diasPadrao (parâmetro escrito errado) cai num padrão, não em NaN', () => {
    const j = resolverJanelaPeriodo({ dias: '365' } as any);
    expect(j.inicio).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(j.dias).toBe(365);
  });

  it('sem nenhum argumento também devolve data válida', () => {
    const j = resolverJanelaPeriodo({} as any);
    expect(j.inicio).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isFinite(j.dias as number)).toBe(true);
  });

  it('diasPadrao não numérico não vira NaN', () => {
    const j = resolverJanelaPeriodo({ dias: '77', diasPadrao: 'muitos' } as any);
    expect(j.inicio).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('a 1ª opção válida de diasValidos é o socorro', () => {
    const j = resolverJanelaPeriodo({ dias: '999', diasValidos: [90, 365] } as any);
    expect(j.dias).toBe(90);
    expect(j.inicio).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('🔴 diaLocal · a última linha de defesa contra "NaN-NaN-NaN"', () => {
  // ⚠️ O conserto do incidente de 02/09 é o fail-safe de `resolverJanelaPeriodo`
  // (#2826), que já está no ar. Esta guarda é defesa em profundidade: `diaLocal`
  // é EXPORTADO, e o próximo chamador não passa por aquele fail-safe.
  it('LANÇA em data inválida em vez de formatar "NaN-NaN-NaN"', () => {
    expect(() => diaLocal(new Date(NaN))).toThrow(/NaN-NaN-NaN/);
    expect(() => diaLocal(new Date('data que não existe'))).toThrow(/data inválida/);
  });

  it('recusa o que não é Date — string parece data e não é', () => {
    expect(() => diaLocal('2026-01-01' as never)).toThrow(/data inválida/);
    expect(() => diaLocal(undefined as never)).toThrow(/data inválida/);
    expect(() => diaLocal(null as never)).toThrow(/data inválida/);
  });

  it('data válida segue formatando exatamente igual', () => {
    expect(diaLocal(new Date(2026, 8, 2, 12, 0, 0))).toBe('2026-09-02');
    expect(diaLocal(new Date(2026, 0, 1, 0, 0, 0))).toBe('2026-01-01');
  });
});

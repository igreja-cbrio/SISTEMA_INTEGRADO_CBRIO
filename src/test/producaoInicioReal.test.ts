// A âncora que liga o cronograma de produção à curva de audiência do Online.
//
// ⚠️⚠️ O que este arquivo protege, em ordem de dano:
//   1. ⚠️⚠️ o `PUT /producao/culto/:id` voltar a montar o payload INTEIRO. Ele
//      fazia isso: `pontualidade_obs` e `observacoes` iam incondicionalmente,
//      então salvar um apagava o outro. Com `inicio_real` na mesma tabela, a
//      próxima tela que salvasse uma observação apagaria a âncora — e a curva
//      de audiência voltaria a não ter alinhamento, sem ninguém perceber;
//   2. ⚠️⚠️ hora inválida virar algo plausível. Um palpite de horário desloca a
//      curva INTEIRA e não fica registrado como palpite — é a lei da casa
//      "valor default plausível numa coluna de registro é palpite gravado
//      como fato";
//   3. o campo virar `timestamptz`, criando segunda fonte para a data que já
//      vive em `cultos.data`.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(__dirname, '..', '..');
const semComentarios = (src: string) => src
  .split('\n')
  .map((l) => l.replace(/(^|[^:])\/\/[^\n]*/, '$1'))
  .join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '');

const producaoJs = () => semComentarios(readFileSync(join(RAIZ, 'backend/routes/producao.js'), 'utf8'));

const putCulto = () => {
  const src = producaoJs();
  const i = src.indexOf("router.put('/culto/:id'");
  expect(i, 'PUT /culto/:id não encontrado').toBeGreaterThan(-1);
  const resto = src.slice(i);
  const fim = resto.search(/\nrouter\.(get|post|patch|put|delete)\(/);
  return fim === -1 ? resto : resto.slice(0, fim);
};

describe('⚠️⚠️ o PUT é PATCH — não apaga o resto da produção do culto', () => {
  it('só grava chave que veio no corpo (hasOwnProperty)', () => {
    expect(putCulto()).toMatch(/Object\.prototype\.hasOwnProperty\.call\(corpo,\s*k\)/);
  });

  it('⚠️⚠️ o payload NÃO traz mais pontualidade_obs incondicionalmente', () => {
    const corpo = putCulto();
    // O padrão antigo: dentro do literal do payload, sem guarda.
    const antigo = /const payload = \{[^}]*pontualidade_obs:/s;
    expect(corpo, 'payload voltou a ser montado inteiro — apaga a âncora').not.toMatch(antigo);
  });

  it('as três chaves editáveis são condicionais', () => {
    const corpo = putCulto();
    for (const k of ['pontualidade_obs', 'observacoes', 'inicio_real']) {
      expect(corpo, `${k} não está protegido por tem()`).toMatch(new RegExp(`if \\(tem\\('${k}'\\)\\)`));
    }
  });

  it('⚠️ os totais das etapas nunca são tocados aqui', () => {
    const corpo = putCulto();
    // duracao_segundos e amigos são gravados pelo PUT /etapas, não por este.
    for (const k of ['duracao_segundos', 'duracao_prevista_seg', 'pos_culto_segundos', 'duracao_minutos']) {
      expect(corpo, `${k} não deveria ser escrito por este endpoint`).not.toContain(k);
    }
  });
});

describe('⚠️⚠️ hora inválida nunca vira hora plausível', () => {
  it('existe validação HH:MM de 24h', () => {
    const src = producaoJs();
    expect(src).toMatch(/function horaOuNulo/);
    expect(src).toMatch(/\^\(\[01\]\\d\|2\[0-3\]\):\(\[0-5\]\\d\)\$/);
  });

  it('⚠️ hora malformada devolve 400, não grava silenciosamente', () => {
    const corpo = putCulto();
    expect(corpo).toMatch(/status\(400\)[\s\S]{0,120}inicio_real/);
  });

  it('⚠️ não existe hora padrão em lugar nenhum', () => {
    const src = producaoJs();
    expect(src).not.toMatch(/inicio_real[^\n]*\|\|\s*'\d{2}:\d{2}/);
    expect(src).not.toMatch(/inicio_real[^\n]*\?\?\s*'\d{2}:\d{2}/);
  });

  it('o GET devolve só HH:MM (o Postgres entrega HH:MM:SS)', () => {
    expect(producaoJs()).toMatch(/inicio_real:\s*prod\?\.inicio_real\s*\?\s*String\(prod\.inicio_real\)\.slice\(0,\s*5\)\s*:\s*null/);
  });
});

describe('⚠️ a migration declara a decisão', () => {
  const sql = () => readFileSync(
    join(RAIZ, 'supabase/migrations/20260903050000_producao_inicio_real_ancora_curva.sql'), 'utf8',
  );

  it('coluna aditiva, idempotente, sem DEFAULT', () => {
    expect(sql()).toMatch(/add column if not exists inicio_real time;/i);
    expect(sql()).not.toMatch(/DEFAULT/i);
  });

  it('⚠️ é `time`, não timestamptz (a data já vive em cultos.data)', () => {
    expect(sql()).toMatch(/inicio_real time/i);
    expect(sql()).not.toMatch(/inicio_real timestamptz/i);
  });

  it('registra por que a inferência não bastava', () => {
    const s = sql();
    // Os números medidos nos 45 cultos — sem eles a decisão vira opinião.
    expect(s).toContain('±5,6');
    expect(s).toContain('±6,6');
    expect(s).toContain('±15,4');
  });
});

describe('⚠️ a tela manda a âncora e diz para que serve', () => {
  const tela = () => readFileSync(join(RAIZ, 'src/pages/ministerial/Producao.jsx'), 'utf8');

  it('o campo existe e vai no salvarCulto', () => {
    const s = tela();
    expect(s).toMatch(/inicio_real: form\.inicio_real\?\.trim\(\) \|\| null/);
    expect(s).toMatch(/type="time"[\s\S]{0,140}form\.inicio_real/);
  });

  it('carrega o valor salvo (senão o campo zera a cada abertura)', () => {
    expect(tela()).toMatch(/inicio_real: d\.producao\?\.inicio_real \?\? ''/);
  });

  it('⚠️ explica que a transmissão começa antes do culto', () => {
    expect(tela()).toMatch(/transmiss[ãa]o começa antes/i);
  });
});

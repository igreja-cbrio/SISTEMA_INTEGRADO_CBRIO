/**
 * Guarda do contrato dos CÓDIGOS RESERVADOS (02/09/2026).
 *
 * ⚠️⚠️ Por que este teste existe: o código de retirada da criança tem 20 bits
 * (32^4) e a unicidade vem de um TRIGGER NO INSERT. Offline não há INSERT ⇒
 * não há garantia. Medido: 50 check-ins offline num namespace de 2 chars dão
 * **70% de colisão**; 100 dão 99%. Colisão = duas crianças com o mesmo código,
 * e os dois leitores do código resolvem empate em SILÊNCIO pelo mais recente.
 *
 * A saída não é gerar melhor no cliente — é **não gerar no cliente**. Este
 * teste trava, por leitura estática, as três regras que sustentam isso.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const raiz = path.resolve(__dirname, '../..');
const semComentarios = (s: string) =>
  s.split('\n').map((l) => l.replace(/(^|[^:])\/\/[^\n]*/, '$1')).join('\n');

const rota = semComentarios(readFileSync(path.join(raiz, 'backend/routes/totemKids.js'), 'utf8'));
// ⚠️ Comentário FORA antes de casar: o próprio cabeçalho da migration explica
// o bug citando `codigo`, e sem isto o teste acusaria a explicação como se
// fosse o defeito. É a armadilha de 06/08, agora no SQL.
// ⚠️⚠️ SEM o `$` de propósito (achado 03/09/2026). Em checkout Windows o arquivo
// vem com CRLF, `split('\n')` deixa um `\r` no fim de cada linha, e em JS o `\r`
// é LINE TERMINATOR — `.` não casa `\r`, então `/--.*$/` (âncora de fim de
// string) NÃO casava e o comentário ficava inteiro. Resultado: a explicação do
// bug no cabeçalho da migration era acusada como se fosse o bug, e este teste
// ficava vermelho só no Windows (verde no CI, que usa LF). `/--.*/` limpa do
// primeiro `--` até antes do terminador, nos dois formatos de linha.
const migration = readFileSync(
  path.join(raiz, 'supabase/migrations/20260902200000_kids_codigos_reservados.sql'), 'utf8')
  .split('\n').map((l) => l.replace(/--.*/, '')).join('\n');

describe('⚠️⚠️ código já IMPRESSO é imutável', () => {
  it('o retry NÃO roda quando o código veio de reserva', () => {
    // Se a sincronização gerasse outro código, o banco ficaria consistente e o
    // PAPEL no bolso do pai ficaria inválido — ninguém percebe até a retirada.
    expect(rota).toContain('const maxTentativas = reservaOk ? 1 : 5');
    expect(rota).toContain('codigoFinal = reservaOk ? codigoReservado : await gerarCodigo()');
  });

  it('colisão em código reservado vira EXCEÇÃO PARA HUMANO, nunca troca silenciosa', () => {
    expect(rota).toMatch(/if \(reservaOk\)[\s\S]{0,400}codigo_conflito: true/);
    expect(rota).toMatch(/N[ÃA]O reimprima/i);
  });

  it('⚠️ código que o cliente inventou é RECUSADO — a reserva tem que existir', () => {
    // Aceitar qualquer string abriria exatamente a porta que a pré-alocação fecha.
    expect(rota).toContain("from('kids_codigos_reservados')");
    expect(rota).toMatch(/reservaOk = !!r && r\.status === 'reservado'/);
    expect(rota).toContain('codigo_invalido: true');
  });
});

describe('⚠️⚠️ o gerador ONLINE enxerga as reservas', () => {
  it('senão sortearia um código que já está IMPRESSO em papel', () => {
    // É a metade do conserto que, esquecida, faz a outra metade produzir
    // exatamente o bug que ela evita: duas etiquetas com o mesmo código.
    expect(migration).toContain('FROM public.kids_codigos_reservados r');
    expect(migration).toMatch(/WHERE r\.codigo = v_codigo\s*\n\s*AND r\.status = 'reservado'/);
  });

  it('⚠️ usa v_codigo, nunca `codigo` (42702 quebraria TODO check-in)', () => {
    // A 1ª versão usava `codigo`, que colide com a coluna da tabela nova:
    // "column reference is ambiguous". Só apareceu no ensaio funcional —
    // corpo de plpgsql não é resolvido no CREATE.
    expect(migration).toContain('v_codigo text;');
    expect(migration).not.toMatch(/WHERE r\.codigo = codigo\b/);
  });
});

describe('⚠️ a reserva não vaza pela chave pública', () => {
  it('só service_role executa a função de reservar', () => {
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.fn_kids_reservar_codigos[^;]*FROM public, anon, authenticated/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.fn_kids_reservar_codigos[^;]*TO service_role/);
  });

  it('a tabela tem RLS e NENHUMA policy para authenticated', () => {
    // É a lista de credenciais de retirada do dia — ampliá-la ao que a anon
    // key alcança seria a lei nº 11 pelo avesso.
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY');
    expect(migration).toMatch(/FOR ALL TO service_role/);
    expect(migration).not.toMatch(/TO authenticated/);
  });
});

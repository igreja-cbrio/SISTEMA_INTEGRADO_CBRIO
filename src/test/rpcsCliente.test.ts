// ============================================================================
// Guarda: RPC chamada pelo CLIENTE tem que ter grant pra `authenticated`
//
// O incidente que este teste existe pra impedir (10/08/2026): o sweep de
// segurança revogou `authenticated` de `app_meu_qrcode` e de 3 outras RPCs do
// app. O cartão de membro passou a mostrar "QR indisponível" e o **check-in de
// batismo pelo app parou em silêncio** — o app não lê o `error` do
// `supabase.rpc()`, então permissão negada vira tela vazia.
//
// ⚠️ Checagem ESTÁTICA (o CI não tem banco): garante que o grant está DECLARADO
// em migration. Não substitui a conferência no catálogo — a marca que sobrevive
// a uma varredura manual é o `COMMENT ON FUNCTION`.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const {
  RPCS_CLIENTE,
  RPCS_FRONT_ERP,
  nomesRpcsCliente,
  grantsAuthenticatedNoSql,
  semComentariosSql,
} = require_('../../backend/utils/rpcsCliente.js');

const RAIZ = join(__dirname, '..', '..');

function todasAsMigrations(): string {
  const dir = join(RAIZ, 'supabase', 'migrations');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => readFileSync(join(dir, f), 'utf8'))
    .join('\n');
}

/**
 * Tira comentário de JS/TS antes de procurar CHAMADA.
 * ⚠️ A 1ª versão deste teste ficou vermelha por causa do comentário do PRÓPRIO
 * teste, que cita a chamada como exemplo — a mesma armadilha de 06/08, agora no
 * lado JS. Procurar comando, nunca o identificador solto.
 */
export function semComentariosJs(src: string): string {
  return String(src || '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** Varre `src/` procurando chamada de RPC — o que o front executa de fato. */
function rpcsChamadasNoFront(): Set<string> {
  const achados = new Set<string>();
  const exts = ['.js', '.jsx', '.ts', '.tsx'];
  const pilha = [join(RAIZ, 'src')];
  while (pilha.length) {
    const atual = pilha.pop()!;
    for (const ent of readdirSync(atual, { withFileTypes: true })) {
      const caminho = join(atual, ent.name);
      if (ent.isDirectory()) {
        // `src/test` é o próprio gate, não é código que roda no navegador.
        if (ent.name !== 'test') pilha.push(caminho);
        continue;
      }
      if (!exts.some((e) => ent.name.endsWith(e))) continue;
      const src = semComentariosJs(readFileSync(caminho, 'utf8'));
      const re = /supabase\s*\.\s*rpc\(\s*['"]([a-z0-9_]+)['"]/gi;
      let m;
      while ((m = re.exec(src)) !== null) achados.add(m[1].toLowerCase());
    }
  }
  return achados;
}

describe('RPCs chamadas pelo cliente', () => {
  it('⚠️ toda RPC do inventário tem grant pra authenticated em migration', () => {
    const comGrant = grantsAuthenticatedNoSql(todasAsMigrations());
    const semGrant = nomesRpcsCliente().filter((n: string) => !comGrant.has(n));
    expect(
      semGrant,
      `RPC chamada pelo cliente SEM "grant execute ... to authenticated" em ` +
        `migration: ${semGrant.join(', ')}. Sem o grant a chamada devolve ` +
        `permission denied e o app engole o erro — tela vazia, nenhum log.`,
    ).toEqual([]);
  });

  it('⚠️ MUTANTE: o casador de grant não aceita grant só pra service_role', () => {
    // Se alguém "consertar" com service_role (que o app não usa), fica vermelho.
    const so = grantsAuthenticatedNoSql(
      'grant execute on function public.app_meu_qrcode() to service_role;',
    );
    expect(so.has('app_meu_qrcode')).toBe(false);
    const certo = grantsAuthenticatedNoSql(
      'grant execute on function public.app_meu_qrcode() to authenticated;',
    );
    expect(certo.has('app_meu_qrcode')).toBe(true);
  });

  it('grant a authenticated E service_role na mesma linha conta', () => {
    const s = grantsAuthenticatedNoSql(
      'GRANT EXECUTE ON FUNCTION public.x(uuid) TO authenticated, service_role;',
    );
    expect(s.has('x')).toBe(true);
  });

  it('⚠️ COMENTÁRIO não vale como grant (a lição de 06/08)', () => {
    // A própria migration do conserto cita os nomes em comentários e em
    // queries de conferência comentadas. Casar com isso daria falso OK.
    const s = grantsAuthenticatedNoSql(
      '-- grant execute on function public.app_meu_qrcode() to authenticated;',
    );
    expect(s.size).toBe(0);
    expect(semComentariosSql('select 1; -- grant ... to authenticated')).not.toMatch(
      /authenticated/,
    );
  });

  it('toda chamada de supabase.rpc em src/ está no inventário', () => {
    const noCodigo = [...rpcsChamadasNoFront()];
    const inventariadas = new Set(RPCS_FRONT_ERP.map((r: { nome: string }) => r.nome));
    const fora = noCodigo.filter((n) => !inventariadas.has(n));
    expect(
      fora,
      `RPC chamada com a anon key no front e fora de RPCS_FRONT_ERP: ` +
        `${fora.join(', ')}. Acrescente no inventário e garanta o grant.`,
    ).toEqual([]);
  });

  it('⚠️ comentário de JS não conta como chamada (tropeço da 1ª versão)', () => {
    const fonte = [
      "// exemplo no comentário: supabase.rpc('fantasma')",
      '/* supabase.rpc("outro_fantasma") */',
      "await supabase.rpc('de_verdade');",
    ].join('\n');
    const limpo = semComentariosJs(fonte);
    expect(limpo).toMatch(/de_verdade/);
    expect(limpo).not.toMatch(/fantasma/);
    // E não pode comer o `//` de uma URL (`https://…`).
    expect(semComentariosJs("const u = 'https://cbrio.org/x';")).toMatch(/cbrio\.org/);
  });

  it('o inventário não esconde RPC sem alvo amarrado ao auth.uid()', () => {
    // Régua de admissão: se o PARÂMETRO escolhesse a pessoa, expor a função a
    // `authenticated` entregaria dado de terceiro (o furo do app_salvar_membro).
    for (const r of RPCS_CLIENTE) {
      expect(r.alvo, `${r.nome} precisa declarar o alvo`).toBe('auth.uid()');
      expect(r.assinatura).toMatch(/^public\.[a-z0-9_]+\(/);
      expect(r.tela.length).toBeGreaterThan(3);
    }
  });
});

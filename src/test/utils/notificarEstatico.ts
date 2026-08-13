// ─────────────────────────────────────────────────────────────────────────────
// Ler chamadas de `notificar({ ... })` a partir do TEXTO do arquivo.
//
// Por que estático: os arquivos de rota e o gerador importam o cliente do
// Supabase no topo, então não dá pra carregá-los num teste sem banco. O que
// sobra é conferir a forma da chamada — e é o suficiente, porque os defeitos
// desta família são de FORMA: falta de `targetIds` (o aviso abre no fallback do
// módulo e inunda ~16 pessoas) ou a chamada que simplesmente não existe.
//
// ⚠️ Este arquivo nasceu de uma DUPLICAÇÃO. O extrator vivia dentro de
// `avisoAgregado.test.ts`; quando o segundo teste precisou do mesmo parser, a
// escolha foi extrair em vez de copiar — dois parsers do mesmo texto divergem, e
// aí um guarda passa a proteger uma gramática que o outro não reconhece.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Remove comentários antes de casar padrões.
 *
 * ⚠️ ARMADILHA JÁ REGISTRADA TRÊS VEZES NESTE REPO (06/08 no
 * `appRateLimit.test.ts`, na conferência da migration `20260806140000` e no
 * `avisoAgregado.test.ts`): a documentação do conserto CITA o padrão errado como
 * exemplo do que não fazer, e a checagem acusa a explicação como se fosse
 * código. O `[^:]` preserva o `//` de uma URL.
 */
export function semComentarios(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** Lê um arquivo do backend (caminho relativo à raiz do repo), sem comentários. */
export function lerBackend(caminhoRelativo: string): string {
  return semComentarios(
    readFileSync(resolve(__dirname, '../../../', caminhoRelativo), 'utf-8'),
  );
}

/**
 * Extrai cada chamada `notificar({ ... })`, casando as chaves — o que permite
 * perguntar de UM aviso "ele tem destinatário nomeado?", coisa que um regex
 * sobre o arquivo inteiro não responde.
 */
export function chamadasNotificar(src: string): string[] {
  const blocos: string[] = [];
  const marca = 'notificar({';
  let i = src.indexOf(marca);
  while (i !== -1) {
    let nivel = 0;
    let fim = i + marca.length - 1; // aponta pro `{`
    for (let j = fim; j < src.length; j += 1) {
      if (src[j] === '{') nivel += 1;
      else if (src[j] === '}') {
        nivel -= 1;
        if (nivel === 0) { fim = j; break; }
      }
    }
    blocos.push(src.slice(i, fim + 1));
    i = src.indexOf(marca, fim);
  }
  return blocos;
}

/**
 * Corpo de uma rota do Express, do `router.<verbo>('<rota>'` até a coluna zero
 * do `});` que a fecha. Serve pra checar o que uma rota faz sem varrer o arquivo
 * inteiro (`app.js` tem mais de 4 mil linhas).
 */
export function corpoDaRota(src: string, rota: string): string {
  const i = src.indexOf(`'${rota}'`);
  if (i === -1) return '';
  const fim = src.indexOf('\n});', i);
  return src.slice(i, fim === -1 ? undefined : fim);
}

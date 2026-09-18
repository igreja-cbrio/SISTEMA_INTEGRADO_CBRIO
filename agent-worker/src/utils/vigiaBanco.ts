/**
 * ════════════════════════════════════════════════════════════════════════════
 *  O VIGIA: decide QUANDO gritar que o sistema caiu.
 *
 *  Incidente de 02/09/2026: o Supabase morreu às 14:58 UTC e ficou 1h34 fora.
 *  **Ninguém foi avisado** — o dono descobriu 1h25 depois, usando o sistema.
 *  A cura foi um clique de 4 minutos. Ou seja: 90% do prejuízo foi DETECÇÃO.
 *
 *  ⚠️⚠️ POR QUE O ALERTA NÃO SAIU, medido no código (não suposto):
 *   1. `/api/health` está catalogado como `critical` e vigiado a cada 5 min —
 *      e responde 200 `ok` com o banco MORTO (só olha env var). Disse "ok"
 *      ~19 vezes durante a queda.
 *   2. `notificar()` descobre PARA QUEM avisar consultando `profiles.email`
 *      **no banco que caiu**. O alerta morre junto com o que ele alertaria.
 *   3. O painel do Supabase dizia `ACTIVE_HEALTHY` o tempo todo.
 *
 *  ⇒ Daí as três leis deste arquivo:
 *   · a régua é DETERMINÍSTICA (um `if`, não um LLM): decidir "o banco não
 *     responde" é aritmética, e no meio de um incidente previsibilidade vale
 *     mais que inferência — além de não depender da API da Anthropic estar viva;
 *   · o destinatário vem de ENV VAR, NUNCA do banco;
 *   · o vigia mora no worker do Railway, que não compartilha destino com a
 *     Vercel nem com o Postgres.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Ciclos seguidos de falha antes de gritar. 1 é soluço de rede; 3 é morte. */
export const CICLOS_PARA_ALERTAR = 3;
/** Ciclos seguidos de sucesso para declarar "voltou". */
export const CICLOS_PARA_RECUPERAR = 2;

export type Estado = {
  falhasSeguidas: number;
  sucessosSeguidos: number;
  /** Já gritei sobre ESTE incidente? Impede re-alerta a cada minuto. */
  alertado: boolean;
  /** Quando o incidente atual começou (ms). null = não há incidente. */
  desdeMs: number | null;
};

export const estadoInicial: Estado = {
  falhasSeguidas: 0, sucessosSeguidos: 0, alertado: false, desdeMs: null,
};

export type Ciclo = {
  /** Sonda A: `select 1` direto no Postgres. É a que RESPONDE a pergunta. */
  bancoOk: boolean;
  /** Sonda B: GET na URL pública, atravessando Vercel e Cloudflare. */
  appOk: boolean;
  agoraMs: number;
};

export type Decisao = {
  estado: Estado;
  /** Gritar AGORA que caiu. */
  alertar: boolean;
  /** Gritar AGORA que voltou. */
  recuperou: boolean;
  /** Duração do incidente, só quando `recuperou`. */
  duracaoMs: number | null;
  /** O que dizer — o cruzamento das duas sondas dá o diagnóstico de graça. */
  diagnostico: 'banco_fora' | 'app_fora_banco_ok' | 'sonda_suspeita' | 'ok';
};

/**
 * ⚠️⚠️ O CRUZAMENTO das duas sondas é o que evita reiniciar a coisa errada:
 *   banco ✗ + app ✗ → o banco caiu (foi o caso de 02/09)
 *   banco ✓ + app ✗ → Vercel/Cloudflare/deploy ruim — NÃO é o banco
 *   banco ✗ + app ✓ → provavelmente a MINHA sonda está errada (rede do worker,
 *                      credencial), não o sistema. Grita, mas dizendo isso.
 */
function diagnosticar(c: Ciclo): Decisao['diagnostico'] {
  if (c.bancoOk && c.appOk) return 'ok';
  if (!c.bancoOk && !c.appOk) return 'banco_fora';
  if (c.bancoOk && !c.appOk) return 'app_fora_banco_ok';
  return 'sonda_suspeita';
}

export function avaliarCiclo(estado: Estado, c: Ciclo): Decisao {
  const diagnostico = diagnosticar(c);
  const saudavel = diagnostico === 'ok';

  if (saudavel) {
    const sucessos = estado.sucessosSeguidos + 1;
    // ⚠️ Só declara "voltou" para quem foi avisado da queda. Sem o
    // `estado.alertado`, um soluço de 2 ciclos que nunca gerou alerta mandaria
    // um "voltou" sobre um incidente que ninguém soube que existiu.
    const recuperou = estado.alertado && sucessos >= CICLOS_PARA_RECUPERAR;
    return {
      estado: recuperou
        ? { ...estadoInicial }
        : { falhasSeguidas: 0, sucessosSeguidos: sucessos, alertado: estado.alertado, desdeMs: estado.desdeMs },
      alertar: false,
      recuperou,
      duracaoMs: recuperou && estado.desdeMs ? c.agoraMs - estado.desdeMs : null,
      diagnostico,
    };
  }

  const falhas = estado.falhasSeguidas + 1;
  const desdeMs = estado.desdeMs ?? c.agoraMs;
  // ⚠️ `!estado.alertado` é o que impede alerta A CADA MINUTO durante uma queda
  // de 1h34 — seriam 94 e-mails. Alerta que vira enxurrada treina a ignorar.
  const alertar = falhas >= CICLOS_PARA_ALERTAR && !estado.alertado;

  return {
    estado: { falhasSeguidas: falhas, sucessosSeguidos: 0, alertado: estado.alertado || alertar, desdeMs },
    alertar,
    recuperou: false,
    duracaoMs: null,
    diagnostico,
  };
}

/** Texto do alerta. Sem enfeite: quem lê isso às 7h de domingo precisa AGIR. */
export function textoAlerta(d: Decisao, urlPainel: string): { assunto: string; corpo: string } {
  const mapa: Record<string, string> = {
    banco_fora: 'O BANCO NÃO RESPONDE — o sistema está fora do ar',
    app_fora_banco_ok: 'O SITE não responde, mas o banco está vivo (Vercel/Cloudflare)',
    sonda_suspeita: 'A sonda não alcança o banco, mas o site responde (pode ser a sonda)',
  };
  const assunto = `[CBRio] ${mapa[d.diagnostico] || 'Falha detectada'}`;
  const passos = d.diagnostico === 'banco_fora'
    // ⚠️ Runbook DENTRO do alerta: quem lê pode não ser quem construiu, e no
    // domingo de manhã não há tempo de procurar o procedimento.
    ? `O QUE FAZER:\n1. Abra ${urlPainel}\n2. Settings → General → "Restart project"\n3. Aguarde ~4 min e confira se voltou.\n\nNa queda de 02/09/2026 isso resolveu em 4 minutos.`
    : d.diagnostico === 'app_fora_banco_ok'
      ? `O QUE FAZER:\n1. NÃO reinicie o banco — ele está vivo.\n2. Confira o último deploy na Vercel e o status da Cloudflare.`
      : `O QUE FAZER:\n1. Confira se o site abre no seu celular.\n2. Se abrir, o problema é a sonda (rede/credencial do worker), não o sistema.`;
  return { assunto, corpo: `${mapa[d.diagnostico] || 'Falha'}\n\n${passos}` };
}

// ════════════════════════════════════════════════════════════════════════════
//  Completar o SEXO de quem está sem — bloco recolhível da aba Pessoas
//
//  Pedido do Matheus (14/08/2026): "tem muito que é só o sexo. Será que
//  conseguimos usar IA para ver pelo nome se é feminino ou masculino?"
//
//  ⚠️⚠️ Duas seções separadas DE PROPÓSITO, e a separação é a própria lei:
//
//    1. DECLARADO — a pessoa preencheu o sexo em outra porta. É dado dela:
//       aplica direto, sem revisão. Zero risco.
//    2. PALPITE POR NOME — sugestão da IA. **Nada é gravado sem alguém marcar.**
//       É a confirmação humana que legitima: o dado deixa de ser palpite da
//       máquina e vira decisão da igreja.
//
//  Juntar as duas numa lista só apagaria essa diferença — e ela é o motivo de a
//  funcionalidade poder existir sem violar a lei de 10/08 ("nunca inferir sexo
//  por nome"). O sexo decide quem entra em grupo de Homens/Mulheres.
// ════════════════════════════════════════════════════════════════════════════

import { useState } from 'react';
import { toast } from 'sonner';
import { grupos as api } from '../../api';

const C = {
  card: 'var(--cbrio-card)', border: 'var(--cbrio-border)', bg: 'var(--cbrio-bg)',
  text: 'var(--cbrio-text)', t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)',
  primary: '#00B39D', amber: '#f59e0b',
};

export default function CompletarSexoBloco({ onAplicado }) {
  const [aberto, setAberto] = useState(false);

  // Camada 1
  const [colheita, setColheita] = useState(null);
  const [colhendo, setColhendo] = useState(false);

  // Camada 2
  const [sugestoes, setSugestoes] = useState(null);
  const [marcados, setMarcados] = useState(() => new Set());
  const [sugerindo, setSugerindo] = useState(false);
  const [progresso, setProgresso] = useState(null); // {vistas,total} durante a varredura
  const [confirmando, setConfirmando] = useState(false);

  const analisar = async () => {
    setColhendo(true);
    try {
      const r = await api.sexoColher(false); // dry-run
      setColheita(r);
      if (!r.aplicaveis) toast.info('Ninguém tem sexo declarado em outra porta.');
    } catch (e) { toast.error(e?.message || 'Erro ao analisar'); }
    finally { setColhendo(false); }
  };

  const aplicarColheita = async () => {
    setColhendo(true);
    try {
      const r = await api.sexoColher(true);
      setColheita(r);
      toast.success(`${r.gravados} cadastro${r.gravados !== 1 ? 's' : ''} completado${r.gravados !== 1 ? 's' : ''} com o sexo que a pessoa já tinha declarado.`);
      onAplicado?.();
    } catch (e) { toast.error(e?.message || 'Erro ao aplicar'); }
    finally { setColhendo(false); }
  };

  // ⚠️⚠️ Varre a lista em BLOCOS, com progresso — não numa requisição só.
  // No 1º uso real (14/08) a tela ficou presa em "Consultando a IA…" e nada
  // voltou: o `request()` aborta em 30s e 400 pessoas não cabem nisso. É a lei
  // de 04/08 (operação longa vai em pedaços, com progresso real no botão).
  const pedirSugestoes = async () => {
    setSugerindo(true);
    setSugestoes(null);
    setMarcados(new Set()); // nasce TUDO DESMARCADO — ver comentário do confirmar
    let offset = 0;
    let acumuladas = [];
    let semSugestao = 0;
    let total = 0;
    let vistas = 0;
    try {
      for (;;) {
        const r = await api.sexoSugestoes(offset);
        total = r.total ?? 0;
        vistas += r.sem_sexo ?? 0;
        semSugestao += r.sem_sugestao ?? 0;
        acumuladas = acumuladas.concat(r.sugestoes || []);
        // Mostra o que já veio — a pessoa começa a revisar antes de terminar.
        setSugestoes({ sugestoes: acumuladas, sem_sexo: vistas, sem_sugestao: semSugestao, total });
        setProgresso({ vistas, total });
        if (r.proximo_offset == null) break;
        offset = r.proximo_offset;
      }
      if (!acumuladas.length) toast.info('A IA não teve confiança alta em nenhum nome.');
    } catch (e) {
      // ⚠️ O que JÁ veio fica na tela: derrubar tudo por causa do último bloco
      // faria a pessoa perder o que já dava pra confirmar.
      toast.error(`${e?.message || 'Erro ao pedir sugestões'}${acumuladas.length ? ` — as ${acumuladas.length} já carregadas continuam aí.` : ''}`);
    } finally { setSugerindo(false); setProgresso(null); }
  };

  // ⚠️⚠️ Grava em BLOCOS de 100, com progresso — e cada bloco que volta SAI da
  // lista na hora. É a lei de 04/08 aplicada ao caminho que ESCREVE: com 695 de
  // uma vez o cliente abortava em 30s enquanto o servidor seguia gravando, e a
  // mensagem mandava "tente de novo" — reprocessando o que já tinha entrado.
  //
  // ⚠️ Reconfirmar é seguro (o UPDATE tem `.is('genero', null)`, então quem já
  // foi gravado é pulado), mas a pessoa não tem como saber disso: por isso o
  // erro aqui DIZ o que já foi gravado, em vez de sugerir repetir tudo.
  const confirmar = async () => {
    const itens = (sugestoes?.sugestoes || []).filter(s => marcados.has(s.membro_id));
    if (!itens.length) return;
    setConfirmando(true);
    let gravados = 0;
    const feitos = new Set();
    try {
      for (let i = 0; i < itens.length; i += 100) {
        const bloco = itens.slice(i, i + 100);
        const r = await api.sexoConfirmar(bloco.map(x => ({ membro_id: x.membro_id, sexo: x.sexo })));
        gravados += r.gravados || 0;
        bloco.forEach(x => feitos.add(x.membro_id));
        setProgresso({ vistas: feitos.size, total: itens.length });
        // Some da lista já — se algo falhar adiante, o que entrou não volta.
        setSugestoes(s => ({ ...s, sugestoes: (s.sugestoes || []).filter(x => !feitos.has(x.membro_id)) }));
        setMarcados(m => { const n = new Set(m); bloco.forEach(x => n.delete(x.membro_id)); return n; });
      }
      toast.success(`${gravados} sexo${gravados !== 1 ? 's' : ''} gravado${gravados !== 1 ? 's' : ''}.`);
      onAplicado?.();
    } catch (e) {
      toast.error(
        gravados
          ? `${gravados} já foram gravados; o restante não. Pode clicar de novo — quem já entrou é pulado.`
          : (e?.message || 'Erro ao confirmar'),
      );
      if (gravados) onAplicado?.();
    } finally { setConfirmando(false); setProgresso(null); }
  };

  const alternar = (id) => setMarcados(s => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const btn = (extra = {}) => ({
    background: C.card, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8,
    padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', ...extra,
  });

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 12, overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => setAberto(v => !v)}
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, background: 'none', border: 'none', padding: '10px 14px', cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: C.text }}>Completar o sexo de quem está sem</span>
        <span style={{ fontSize: 11, color: C.t3 }}>{aberto ? 'ocultar' : 'abrir'}</span>
      </button>

      {aberto && (
        <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* ── 1 · DECLARADO ────────────────────────────────────────────── */}
          <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 2 }}>
              1 · O que a pessoa já declarou em outra porta
            </div>
            <p style={{ fontSize: 11.5, color: C.t3, margin: '0 0 10px', lineHeight: 1.5 }}>
              Sexo preenchido por ela mesma no voluntariado, no Next ou no batismo. É dado dela —
              aplica direto, só onde o cadastro está vazio. <strong>Não é palpite.</strong>
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={analisar} disabled={colhendo} style={btn({ cursor: colhendo ? 'wait' : 'pointer' })}>
                {colhendo ? 'Analisando…' : 'Analisar (nada é gravado)'}
              </button>
              {colheita?.aplicaveis > 0 && (
                <button onClick={aplicarColheita} disabled={colhendo}
                  style={btn({ background: C.primary, color: '#fff', border: 'none', cursor: colhendo ? 'wait' : 'pointer' })}>
                  Aplicar aos {colheita.aplicaveis}
                </button>
              )}
            </div>

            {colheita && (
              <div style={{ marginTop: 10, fontSize: 12, color: C.text }}>
                <div>
                  <strong>{colheita.sem_sexo}</strong> sem sexo · <strong>{colheita.aplicaveis}</strong> com declaração em outra porta
                  {colheita.gravados > 0 && <> · <strong style={{ color: C.primary }}>{colheita.gravados} gravados</strong></>}
                </div>
                {!!colheita.exemplos?.length && (
                  <div style={{ fontSize: 11, color: C.t3, marginTop: 6, lineHeight: 1.6 }}>
                    {colheita.exemplos.slice(0, 5).join(' · ')}{colheita.aplicaveis > 5 ? ' …' : ''}
                  </div>
                )}
                {/* ⚠️ Conflito é DECLARADO, não escondido: são as pessoas em que
                    duas portas discordam — uma delas está errada, ou são dois
                    cadastros fundidos por engano. Some da automação de propósito. */}
                {!!colheita.conflitos?.length && (
                  <div style={{ marginTop: 8, padding: 8, borderRadius: 8, background: `${C.amber}12`, border: `1px solid ${C.amber}40`, fontSize: 11, color: C.text, lineHeight: 1.6 }}>
                    <strong>{colheita.conflitos.length} com portas discordando</strong> — não foram tocadas. Uma das portas está errada,
                    ou são dois cadastros da mesma pessoa fundidos por engano. Resolver é caso a caso:{' '}
                    {colheita.conflitos.slice(0, 4).map(c => c.nome).join(' · ')}{colheita.conflitos.length > 4 ? ' …' : ''}
                  </div>
                )}
                {!!colheita.avisos?.length && (
                  <div style={{ marginTop: 8, fontSize: 11, color: C.amber }}>
                    Uma fonte não pôde ser lida: {colheita.avisos.join(' · ')} — o número acima está incompleto.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── 2 · PALPITE ──────────────────────────────────────────────── */}
          <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 2 }}>
              2 · Palpite pelo primeiro nome (IA)
            </div>
            <p style={{ fontSize: 11.5, color: C.t3, margin: '0 0 10px', lineHeight: 1.5 }}>
              A IA olha só o <strong>primeiro nome</strong> e sugere. <strong>Nada é gravado sem você marcar.</strong> Nome
              unissex (Alex, Ariel, Jean, Yuri…) não aparece — nesses casos a pessoa declara quando
              preencher o cadastro. O sexo decide em qual grupo ela pode entrar, então confira antes.
            </p>
            <button onClick={pedirSugestoes} disabled={sugerindo} style={btn({ cursor: sugerindo ? 'wait' : 'pointer' })}>
              {sugerindo
                ? (progresso ? `Consultando a IA… ${progresso.vistas} de ${progresso.total}` : 'Consultando a IA…')
                : 'Sugerir pelos nomes'}
            </button>

            {sugestoes && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 12, color: C.text, marginBottom: 8 }}>
                  <strong>{sugestoes.sugestoes.length}</strong> sugestões em {sugestoes.sem_sexo} pessoas sem sexo
                  {sugestoes.sem_sugestao > 0 && <span style={{ color: C.t3 }}> · {sugestoes.sem_sugestao} sem palpite confiável</span>}
                </div>

                {!!sugestoes.sugestoes.length && (
                  <>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                      <button onClick={() => setMarcados(new Set(sugestoes.sugestoes.map(s => s.membro_id)))} style={btn({ padding: '5px 10px', fontSize: 11 })}>
                        Marcar todas
                      </button>
                      <button onClick={() => setMarcados(new Set())} style={btn({ padding: '5px 10px', fontSize: 11 })}>
                        Desmarcar
                      </button>
                    </div>

                    <div style={{ maxHeight: 320, overflowY: 'auto', border: `1px solid ${C.border}`, borderRadius: 8 }}>
                      {sugestoes.sugestoes.map(s => (
                        <label key={s.membro_id}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderBottom: `1px solid ${C.border}`, cursor: 'pointer', fontSize: 12.5 }}>
                          <input type="checkbox" checked={marcados.has(s.membro_id)} onChange={() => alternar(s.membro_id)} />
                          <span style={{ color: C.text, flex: 1 }}>{s.nome}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: s.sexo === 'feminino' ? '#ec4899' : '#3b82f6' }}>
                            {s.sexo === 'feminino' ? 'Feminino' : 'Masculino'}
                          </span>
                        </label>
                      ))}
                    </div>

                    <button onClick={confirmar} disabled={confirmando || !marcados.size}
                      style={btn({
                        marginTop: 10, background: marcados.size ? C.primary : C.card,
                        color: marcados.size ? '#fff' : C.t3, border: marcados.size ? 'none' : `1px solid ${C.border}`,
                        cursor: confirmando ? 'wait' : (marcados.size ? 'pointer' : 'not-allowed'),
                      })}>
                      {confirmando
                        ? (progresso ? `Gravando… ${progresso.vistas} de ${progresso.total}` : 'Gravando…')
                        : `Confirmar ${marcados.size} sexo${marcados.size !== 1 ? 's' : ''}`}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

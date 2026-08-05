import { useState, useEffect, useCallback } from 'react';
import { membresia } from '../../api';
import {
  Send, AlertTriangle, RefreshCw, Mail, MessageSquare, CheckCircle2, Users,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../ui/dialog';

const C = {
  primary: '#00B39D', text: 'var(--cbrio-text)', text2: 'var(--cbrio-text2)',
  text3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  amber: '#f59e0b', red: '#ef4444', green: '#10b981',
};

const MOTIVO_LABEL = {
  sem_telefone: 'sem telefone',
  numero_errado: 'número que o nosso envio não alcança',
  sem_optin: 'sem opt-in de WhatsApp',
  sem_email: 'sem e-mail',
};

/**
 * Convite de atualização cadastral para quem está SEM CPF.
 *
 * ⚠️ Disparo SEMPRE manual, com prévia e confirmação DIGITANDO o número — é o
 * freio mais forte do sistema, e vale aqui porque é o único disparo que fala
 * com centenas de pessoas que não pediram nada. Mesma régua do "Confira a
 * lista" dos Grupos.
 *
 * ⚠️ O teto por rodada não é enfeite: a conta está em TIER_250 (250
 * destinatários únicos/24h) e a fila desiste de uma mensagem em 36h. Mandar
 * tudo de uma vez não entrega devagar — descarta o excedente em silêncio.
 */
export default function CardConviteCenso() {
  const [prev, setPrev] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [canais, setCanais] = useState(['whatsapp', 'email']);
  const [incluirVisitantes, setIncluirVisitantes] = useState(false);
  const [confirmar, setConfirmar] = useState('');
  const [disparando, setDisparando] = useState(false);
  const [resultado, setResultado] = useState(null);

  // Prévia do e-mail (HTML real, renderizado pelo servidor com a mesma função
  // do disparo). Carregada sob demanda: ninguém precisa dela pra disparar.
  const [amostraEmail, setAmostraEmail] = useState(null);
  const [carregandoAmostra, setCarregandoAmostra] = useState(false);

  // Resultado da CAMPANHA. Carrega sozinho, porque é o número que responde
  // "está funcionando?" — o painel de cobertura acima mede a igreja inteira e
  // faz uma rodada boa parecer 0,1%.
  const [resultadoCampanha, setResultadoCampanha] = useState(null);
  const [verQuemRespondeu, setVerQuemRespondeu] = useState(false);

  const carregarResultado = useCallback(async () => {
    try {
      setResultadoCampanha(await membresia.censo.disparoResultado());
    } catch { /* silencioso: é acompanhamento, não pode atrapalhar o disparo */ }
  }, []);
  useEffect(() => { carregarResultado(); }, [carregarResultado]);

  const verComoChega = async () => {
    setCarregandoAmostra(true);
    try {
      setAmostraEmail(await membresia.censo.disparoPreviewEmail(prev?.exemplo?.nome));
    } catch (e) {
      setErro(e.message || 'Erro ao carregar a prévia do e-mail');
    } finally {
      setCarregandoAmostra(false);
    }
  };

  const statusParam = incluirVisitantes ? 'membro_ativo,visitante' : 'membro_ativo';

  const carregarPrevia = useCallback(async () => {
    setCarregando(true);
    setErro('');
    setResultado(null);
    setConfirmar('');
    try {
      setPrev(await membresia.censo.disparoPreview({
        status: statusParam, canais: canais.join(','),
      }));
    } catch (e) {
      setErro(e.message || 'Erro ao montar a prévia');
    } finally {
      setCarregando(false);
    }
  }, [statusParam, canais]);

  const toggleCanal = (c) => {
    setCanais((atual) => (atual.includes(c) ? atual.filter(x => x !== c) : [...atual, c]));
    setPrev(null);
    setConfirmar('');
  };

  const totalAgora = (prev?.whatsapp?.enviar_agora || 0) + (prev?.email?.enviar_agora || 0);

  const disparar = async () => {
    setDisparando(true);
    setErro('');
    try {
      const r = await membresia.censo.disparar({ status: statusParam, canais });
      setResultado(r);
      setPrev(null);
      setConfirmar('');
      carregarResultado();   // o bloco de rodadas reflete o disparo na hora
    } catch (e) {
      // ⚠️ Timeout aqui NÃO significa que nada saiu — o envio continua no
      // servidor e o registro é gravado em blocos durante o percurso. Dizer
      // "tente de novo" (a mensagem genérica) foi o que fez o Matheus achar,
      // em 04/08, que 200 e-mails enviados não tinham sido enviados.
      setErro(e.code === 'API_TIMEOUT'
        ? 'O envio passou do tempo de espera da tela, mas provavelmente CONTINUOU no servidor. NÃO dispare de novo: clique em "Ver prévia" — quem já recebeu sai da contagem de elegíveis.'
        : (e.message || 'Erro ao disparar'));
    } finally {
      setDisparando(false);
    }
  };

  return (
    <div style={{
      marginTop: 14, padding: 14, borderRadius: 12,
      border: `1px solid ${C.border}`, background: 'var(--cbrio-card)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Send style={{ width: 14, height: 14, color: C.primary }} />
        <strong style={{ fontSize: 13, color: C.text }}>Convidar quem está sem CPF</strong>
      </div>
      <p style={{ fontSize: 11.5, color: C.text3, margin: '0 0 12px' }}>
        Manda o link do cadastro para quem não tem CPF na base mas tem celular ou e-mail.
        O CPF é a única chave forte para consolidar cadastro — quem não tem é justamente
        quem não dá para juntar sem ligar.
      </p>

      {/* Canais e público */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {[['whatsapp', 'WhatsApp', MessageSquare], ['email', 'E-mail', Mail]].map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => toggleCanal(key)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '5px 11px', borderRadius: 999, fontSize: 11.5, cursor: 'pointer',
              border: `1px solid ${canais.includes(key) ? C.primary : C.border}`,
              background: canais.includes(key) ? '#00B39D18' : 'transparent',
              color: canais.includes(key) ? C.primary : C.text2, fontWeight: 600,
            }}
          >
            <Icon style={{ width: 12, height: 12 }} />
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => { setIncluirVisitantes(v => !v); setPrev(null); setConfirmar(''); }}
          style={{
            padding: '5px 11px', borderRadius: 999, fontSize: 11.5, cursor: 'pointer',
            border: `1px solid ${incluirVisitantes ? C.amber : C.border}`,
            background: incluirVisitantes ? '#f59e0b18' : 'transparent',
            color: incluirVisitantes ? C.amber : C.text2, fontWeight: 600,
          }}
        >
          {incluirVisitantes ? 'Membros + visitantes' : 'Só membros ativos'}
        </button>
      </div>

      {/* ── RESULTADO DAS RODADAS JÁ DISPARADAS ──
          ⚠️ Este bloco mede a CAMPANHA. O painel de cobertura logo acima mede a
          IGREJA (denominador ~3.973), então 200 convites com 8 respostas
          aparecem lá como 0,1% — lê-se fracasso quando foi 4% de conversão. E
          o painel conta RESPOSTA, não CPF: em 04/08 as respostas subiam
          enquanto um bug descartava todos os CPFs, e nada na tela denunciava. */}
      {!!resultadoCampanha?.rodadas?.length && (
        <div style={{
          marginBottom: 14, padding: 12, borderRadius: 10,
          border: `1px solid ${C.border}`, background: '#00B39D0d',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <CheckCircle2 style={{ width: 13, height: 13, color: C.primary }} />
            <strong style={{ fontSize: 12, color: C.text }}>O que as rodadas já trouxeram</strong>
          </div>

          {resultadoCampanha.rodadas.map((r) => {
            const pct = r.convidados ? Math.round(1000 * r.responderam / r.convidados) / 10 : 0;
            return (
              <div key={`${r.rodada}-${r.canal}`} style={{ fontSize: 12, color: C.text2, lineHeight: 1.8 }}>
                <strong>Rodada {r.rodada}</strong> ({r.canal}):{' '}
                {r.convidados} convidados ·{' '}
                <span style={{ color: C.primary, fontWeight: 700 }}>{r.responderam} responderam ({pct}%)</span> ·{' '}
                {/* O número que É o objetivo da campanha. */}
                <span style={{ color: C.green, fontWeight: 700 }}>{r.com_cpf} passaram a ter CPF</span>
                {r.em_conflito_identidade > 0 && (
                  <> · <span style={{ color: C.amber }}>{r.em_conflito_identidade} viraram conflito de identidade</span></>
                )}
                {r.falhas_no_envio > 0 && (
                  <> · <span style={{ color: C.red }}>{r.falhas_no_envio} falharam no envio</span></>
                )}
              </div>
            );
          })}

          <p style={{ fontSize: 11, color: C.text3, margin: '6px 0 0' }}>
            Conflito de identidade não é erro: é alguém que informou um CPF já
            usado por outro cadastro — duplicata revelada, para fundir em Entradas.
          </p>

          {!!resultadoCampanha.responderam?.length && (
            <>
              <Button
                variant="outline" size="sm" style={{ marginTop: 10 }}
                onClick={() => setVerQuemRespondeu((v) => !v)}
              >
                <Users style={{ width: 13, height: 13, marginRight: 6 }} />
                {verQuemRespondeu ? 'Esconder quem respondeu' : `Ver quem respondeu (${resultadoCampanha.responderam.length})`}
              </Button>
              {verQuemRespondeu && (
                <div style={{ marginTop: 8, maxHeight: 220, overflowY: 'auto' }}>
                  {resultadoCampanha.responderam.map((p, i) => (
                    <div key={`${p.email}-${i}`} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '6px 0', borderBottom: `1px solid ${C.border}`, fontSize: 12,
                    }}>
                      <span style={{ flex: 1, color: C.text }}>{p.nome}</span>
                      <span style={{ color: C.text3, fontSize: 11 }}>{p.email}</span>
                      <span style={{
                        fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                        color: p.tem_cpf ? C.green : C.amber,
                        background: p.tem_cpf ? '#10b98118' : '#f59e0b18',
                      }}>
                        {p.tem_cpf ? 'com CPF' : 'sem CPF'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button variant="outline" size="sm" onClick={carregarPrevia} disabled={carregando || !canais.length}>
          <RefreshCw style={{ width: 13, height: 13, marginRight: 6 }} />
          {carregando ? 'Calculando…' : 'Ver prévia'}
        </Button>
        {canais.includes('email') && (
          <Button variant="outline" size="sm" onClick={verComoChega} disabled={carregandoAmostra}>
            <Mail style={{ width: 13, height: 13, marginRight: 6 }} />
            {carregandoAmostra ? 'Carregando…' : 'Ver como o e-mail chega'}
          </Button>
        )}
      </div>

      {erro && (
        <p style={{ fontSize: 12, color: C.red, marginTop: 10 }}>{erro}</p>
      )}

      {prev && prev.disponivel === false && (
        <p style={{ fontSize: 12, color: C.amber, marginTop: 10, display: 'flex', gap: 6 }}>
          <AlertTriangle style={{ width: 13, height: 13, flexShrink: 0, marginTop: 2 }} />
          {prev.aviso}
        </p>
      )}

      {prev?.disponivel && (
        <div style={{ marginTop: 12, fontSize: 12, color: C.text2, lineHeight: 1.7 }}>
          <div style={{ fontWeight: 700, color: C.text, marginBottom: 4 }}>
            Rodada {prev.rodada} · {prev.publico_sem_cpf} pessoas sem CPF neste recorte
          </div>

          {canais.includes('whatsapp') && (
            <div>
              <strong>WhatsApp:</strong> {prev.whatsapp.elegiveis} elegíveis ·{' '}
              <span style={{ color: C.primary, fontWeight: 700 }}>{prev.whatsapp.enviar_agora} saem agora</span>
              {prev.whatsapp.adiados > 0 && (
                <> · <span style={{ color: C.amber }}>{prev.whatsapp.adiados} ficam para a próxima rodada (teto de {prev.whatsapp.teto}/dia da Meta)</span></>
              )}
            </div>
          )}

          {canais.includes('email') && (
            <div>
              <strong>E-mail:</strong> {prev.email.elegiveis} elegíveis ·{' '}
              <span style={{ color: C.primary, fontWeight: 700 }}>{prev.email.enviar_agora} saem agora</span>
              {prev.email.adiados > 0 && (
                <> · <span style={{ color: C.amber }}>{prev.email.adiados} ficam para a próxima</span></>
              )}
            </div>
          )}

          {prev.ja_convidadas > 0 && (
            <div style={{ color: C.text3 }}>
              {prev.ja_convidadas} já foram convidadas em rodada anterior e não recebem de novo.
            </div>
          )}

          {!!Object.keys(prev.nao_recebem || {}).length && (
            <div style={{ color: C.text3 }}>
              Não recebem:{' '}
              {Object.entries(prev.nao_recebem)
                .map(([m, n]) => `${n} ${MOTIVO_LABEL[m] || m}`)
                .join(' · ')}
            </div>
          )}

          <div style={{ color: C.text3, fontSize: 11.5, marginTop: 4 }}>
            Link enviado: <code>{prev.link}</code>
          </div>

          {/* Bloqueios de canal — ditos ANTES de a pessoa tentar disparar */}
          {canais.includes('whatsapp') && !prev.whatsapp.configurado && (
            <p style={{ fontSize: 11.5, color: C.amber, display: 'flex', gap: 6, marginTop: 8 }}>
              <AlertTriangle style={{ width: 13, height: 13, flexShrink: 0, marginTop: 2 }} />
              O template <code>{prev.whatsapp.template}</code> ainda não está configurado.
              Crie o modelo na Meta (Utility · pt_BR · 2 variáveis: primeiro nome e link)
              e configure a env <code>WHATSAPP_TEMPLATE_CENSO_ATUALIZACAO</code>. Até lá o
              WhatsApp não sai — o e-mail funciona.
            </p>
          )}
          {canais.includes('email') && !prev.email.configurado && (
            <p style={{ fontSize: 11.5, color: C.amber, marginTop: 8 }}>
              O canal de e-mail não está configurado neste ambiente.
            </p>
          )}

          {totalAgora > 0 && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
              <p style={{ fontSize: 11.5, color: C.text2, margin: '0 0 8px' }}>
                Para confirmar, digite <strong>{totalAgora}</strong> (o total de mensagens desta rodada):
              </p>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Input
                  value={confirmar}
                  onChange={(e) => setConfirmar(e.target.value)}
                  placeholder={String(totalAgora)}
                  style={{ width: 110 }}
                />
                <Button
                  size="sm"
                  disabled={confirmar.trim() !== String(totalAgora) || disparando}
                  onClick={disparar}
                >
                  <Send style={{ width: 13, height: 13, marginRight: 6 }} />
                  {disparando ? 'Disparando…' : 'Disparar rodada'}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Prévia do e-mail · caixa de entrada simulada.
          ⚠️ O HTML vai num <iframe srcDoc>, não injetado na página: o e-mail
          tem estilo próprio e cor de fundo clara fixa, e injetado direto ele
          brigaria com o tema (e ficaria ilegível no modo escuro). O iframe é
          também o que faz a prévia ser FIEL — o e-mail renderiza isolado, como
          renderiza no Gmail. `sandbox` sem allow-scripts: é conteúdo pra olhar. */}
      <Dialog open={!!amostraEmail} onOpenChange={(v) => !v && setAmostraEmail(null)}>
        <DialogContent className="max-w-2xl flex flex-col max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Como o e-mail chega</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto min-h-0">
            <div style={{
              border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden',
              background: '#fff',
            }}>
              {/* Cabeçalho no formato de caixa de entrada, pra conferir remetente
                  e assunto — que é metade do que decide se a pessoa abre. */}
              <div style={{ padding: '12px 14px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
                <div style={{ fontSize: 11, color: '#6b7280' }}>
                  De: <strong style={{ color: '#374151' }}>CBRio</strong> &lt;noreply@cbrio.org&gt;
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginTop: 3 }}>
                  {amostraEmail?.assunto}
                </div>
              </div>
              <iframe
                title="Prévia do e-mail"
                srcDoc={`<!doctype html><meta charset="utf-8"><body style="margin:0;padding:20px;background:#fff">${amostraEmail?.html || ''}</body>`}
                sandbox=""
                style={{ width: '100%', height: 460, border: 'none', display: 'block', background: '#fff' }}
              />
            </div>
            <p style={{ fontSize: 11.5, color: C.text3, marginTop: 10 }}>
              O nome e o link acima são exemplo. No envio real, cada pessoa recebe
              o primeiro nome dela e um link próprio, que abre o cadastro dela já
              preenchido.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAmostraEmail(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {resultado && (
        <div style={{
          marginTop: 12, padding: 10, borderRadius: 10, fontSize: 12,
          border: `1px solid ${C.green}55`, background: '#10b98112', color: C.text2, lineHeight: 1.7,
        }}>
          <strong style={{ color: C.text }}>Rodada {resultado.rodada} disparada.</strong>
          <div>WhatsApp: {resultado.whatsapp?.enfileirados || 0} na fila de envio
            {resultado.whatsapp?.adiados ? ` · ${resultado.whatsapp.adiados} para a próxima` : ''}
            {resultado.whatsapp?.motivo ? ` · ${resultado.whatsapp.motivo}` : ''}
          </div>
          <div>E-mail: {resultado.email?.enviados || 0} enviados
            {resultado.email?.falhas ? ` · ${resultado.email.falhas} falharam` : ''}
            {resultado.email?.adiados ? ` · ${resultado.email.adiados} para a próxima` : ''}
            {resultado.email?.motivo ? ` · ${resultado.email.motivo}` : ''}
          </div>
          {resultado.aviso_registro && (
            <div style={{ color: C.amber, marginTop: 6 }}>{resultado.aviso_registro}</div>
          )}
          <div style={{ color: C.text3, fontSize: 11.5, marginTop: 6 }}>
            O WhatsApp sai pela fila (retry automático). Rode a próxima rodada amanhã,
            para não estourar o teto de 24h da Meta.
          </div>
        </div>
      )}
    </div>
  );
}

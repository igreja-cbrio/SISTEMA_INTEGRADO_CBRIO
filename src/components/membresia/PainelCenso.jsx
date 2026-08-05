import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { membresia } from '../../api';
import { hrefConversa } from '../../lib/conversas';
import {
  ClipboardList, ChevronDown, ChevronUp, Users, UserPlus,
  AlertTriangle, Search, MessageSquare, RefreshCw,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import CardConviteCenso from './CardConviteCenso';

const C = {
  card: 'var(--cbrio-card)', primary: '#00B39D', primaryBg: '#00B39D18',
  text: 'var(--cbrio-text)', text2: 'var(--cbrio-text2)', text3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)',
  green: '#10b981', amber: '#f59e0b', blue: '#3b82f6', red: '#ef4444',
};

const VINCULO_LABEL = {
  membro: 'Se declaram membros',
  congregado: 'Frequentam, sem ser membros',
  visitante: 'Primeira vez / conhecendo',
  nao_informado: 'Não informaram',
};

function fmtDia(iso) {
  if (!iso) return '';
  const [, m, d] = String(iso).split('-');
  return `${d}/${m}`;
}

function Tile({ icon: Icon, valor, label, cor, sub }) {
  return (
    <div style={{
      flex: '1 1 130px', minWidth: 130, padding: '12px 14px',
      background: 'var(--cbrio-card)', border: `1px solid ${C.border}`, borderRadius: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <Icon style={{ width: 13, height: 13, color: cor || C.text3 }} />
        <span style={{ fontSize: 10.5, color: C.text3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: cor || C.text, lineHeight: 1.1 }}>{valor}</div>
      {sub && <div style={{ fontSize: 10.5, color: C.text3, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

/**
 * Painel de cobertura do censo.
 *
 * ⚠️ Bloco RECOLHÍVEL acima da lista, não aba nova: a pergunta "quem falta?" é
 * do mesmo trabalho da fila de cadastros, e a Caixa de entrada dos Grupos já
 * provou que separar em aba faz ninguém achar.
 *
 * ⚠️ O rótulo da JANELA está no título, colado no número. Sem isso, "1.247
 * responderam" é ambíguo (do censo? de sempre?) e número certo parece errado.
 */
export default function PainelCenso() {
  const [aberto, setAberto] = useState(false);
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  // ⚠️ "Cobertura de quem?" é decisão da liderança, não do painel: a base viva
  // inclui ~2.9 mil `visitante` (que respondem o censo no culto e devem
  // responder) e a membresia formal é bem menor. O backend devolve os DOIS
  // recortes e aqui é um botão — assim o número nunca afirma uma definição que
  // não é nossa, e "quem falta" pode ser a lista de cobrança útil (só membros).
  const [recorte, setRecorte] = useState('base'); // 'base' | 'membros'
  const [verFaltantes, setVerFaltantes] = useState(false);
  const [faltantes, setFaltantes] = useState({ items: [], total: 0 });
  const [busca, setBusca] = useState('');
  const [offset, setOffset] = useState(0);
  const [carregandoFalt, setCarregandoFalt] = useState(false);
  const LIMITE = 50;

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      setDados(await membresia.censo.cobertura());
    } catch (e) {
      setErro(e.message || 'Erro ao carregar a cobertura do censo');
    } finally {
      setCarregando(false);
    }
  }, []);

  // Carrega SÓ quando o bloco abre (a aba de cadastros já faz 2 requisições no
  // mount; a cobertura varre a base e não precisa entrar no caminho crítico).
  useEffect(() => { if (aberto && !dados && !erro) carregar(); }, [aberto, dados, erro, carregar]);

  const carregarFaltantes = useCallback(async (novoOffset, q) => {
    setCarregandoFalt(true);
    try {
      const r = await membresia.censo.faltantes({
        limit: LIMITE, offset: novoOffset, recorte,
        ...(q && q.length >= 2 ? { q } : {}),
      });
      setFaltantes({ items: r.items || [], total: r.total || 0, aviso: r.aviso });
      setOffset(novoOffset);
    } catch (e) {
      setFaltantes({ items: [], total: 0, aviso: e.message });
    } finally {
      setCarregandoFalt(false);
    }
  }, [recorte]);

  useEffect(() => {
    if (!verFaltantes) return;
    const t = setTimeout(() => carregarFaltantes(0, busca.trim()), busca ? 350 : 0);
    return () => clearTimeout(t);
  }, [verFaltantes, busca, carregarFaltantes]);

  // recorte escolhido (cai na base quando o backend antigo não devolve `membros`)
  const rec = (recorte === 'membros' ? dados?.membros : dados?.base) || dados?.base;
  const janela = dados?.janela;
  const rotuloJanela = janela?.desde
    ? `de ${fmtDia(janela.desde)} até hoje`
    : 'nenhuma resposta ainda';

  return (
    <div style={{
      marginBottom: 20, border: `1px solid ${C.border}`, borderRadius: 14,
      background: C.card, overflow: 'hidden',
    }}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 16px', background: 'transparent', border: 'none',
          cursor: 'pointer', textAlign: 'left', color: C.text,
        }}
      >
        <ClipboardList style={{ width: 16, height: 16, color: C.primary }} />
        <span style={{ fontSize: 14, fontWeight: 700, flex: 1 }}>
          Censo · cobertura da membresia
          {dados?.disponivel && (
            <span style={{ fontSize: 11.5, fontWeight: 500, color: C.text3, marginLeft: 8 }}>
              ({rotuloJanela})
            </span>
          )}
        </span>
        {dados?.disponivel && (
          <span style={{ fontSize: 13, fontWeight: 700, color: C.primary }}>
            {rec.pct}%
          </span>
        )}
        {aberto
          ? <ChevronUp style={{ width: 15, height: 15, color: C.text3 }} />
          : <ChevronDown style={{ width: 15, height: 15, color: C.text3 }} />}
      </button>

      {aberto && (
        <div style={{ padding: '0 16px 16px', borderTop: `1px solid ${C.border}` }}>
          {carregando && (
            <p style={{ fontSize: 12.5, color: C.text3, padding: '14px 0' }}>Calculando…</p>
          )}

          {erro && (
            <div style={{ padding: '14px 0' }}>
              <p style={{ fontSize: 12.5, color: C.red, margin: 0 }}>{erro}</p>
              <Button variant="outline" size="sm" onClick={carregar} style={{ marginTop: 10 }}>
                <RefreshCw style={{ width: 13, height: 13, marginRight: 6 }} />
                Tentar de novo
              </Button>
            </div>
          )}

          {dados && !dados.disponivel && (
            <p style={{ fontSize: 12.5, color: C.amber, padding: '14px 0', margin: 0, lineHeight: 1.5 }}>
              {dados.aviso}
            </p>
          )}

          {dados?.disponivel && (
            <>
              <div style={{ display: 'flex', gap: 6, margin: '12px 0 10px', flexWrap: 'wrap' }}>
                {[
                  { id: 'base', label: `Todos os ativos (${dados.base.total})` },
                  { id: 'membros', label: `Só membresia (${dados.membros?.total ?? '—'})` },
                ].map((op) => (
                  <button
                    key={op.id}
                    type="button"
                    onClick={() => setRecorte(op.id)}
                    style={{
                      padding: '5px 12px', fontSize: 11.5, fontWeight: 600, borderRadius: 20,
                      cursor: 'pointer',
                      border: `1px solid ${recorte === op.id ? C.primary : C.border}`,
                      background: recorte === op.id ? C.primaryBg : 'transparent',
                      color: recorte === op.id ? C.primary : C.text3,
                    }}
                  >
                    {op.label}
                  </button>
                ))}
              </div>

              <p style={{ fontSize: 11.5, color: C.text3, margin: '0 0 12px', lineHeight: 1.5 }}>
                {recorte === 'membros'
                  ? 'Recorte da membresia formal (status membro ativo). É este que serve de lista de cobrança.'
                  : 'Todos os ativos, incluindo quem ainda é visitante — é o público real do QR no culto.'}
                {' '}Responder o censo <strong>não</strong> torna ninguém membro: o vínculo abaixo
                é o que a própria pessoa declarou.
              </p>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
                <Tile
                  icon={Users} cor={C.green}
                  valor={rec.respondidos} label="Já responderam"
                  sub={`de ${rec.total} ${recorte === 'membros' ? 'da membresia' : 'da base'}`}
                />
                <Tile
                  icon={Users} cor={C.amber}
                  valor={rec.faltando} label="Ainda faltam"
                />
                <Tile
                  icon={UserPlus} cor={C.blue}
                  valor={dados.submissoes.novos} label="Pessoas novas"
                  sub="não estavam na base"
                />
                <Tile
                  icon={AlertTriangle} cor={dados.submissoes.a_revisar ? C.amber : C.text3}
                  valor={dados.submissoes.a_revisar} label="A revisar"
                  sub={`${dados.submissoes.aplicados} resolvidos sozinhos`}
                />
              </div>

              {/* Barra de cobertura */}
              <div style={{
                height: 8, borderRadius: 6, background: 'var(--cbrio-border)',
                overflow: 'hidden', marginBottom: 6,
              }}>
                <div style={{
                  width: `${Math.min(100, rec.pct)}%`, height: '100%',
                  background: C.primary, transition: 'width .4s',
                }} />
              </div>
              <p style={{ fontSize: 11, color: C.text3, margin: '0 0 16px' }}>
                {dados.submissoes.total} respostas de {dados.submissoes.pessoas_ja_cadastradas + dados.submissoes.novos} pessoas
                {dados.submissoes.total > (dados.submissoes.pessoas_ja_cadastradas + dados.submissoes.novos)
                  ? ' (algumas responderam mais de uma vez — não é erro)'
                  : ''}
              </p>

              {/* Vínculo declarado */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {Object.entries(dados.por_vinculo)
                  .filter(([, n]) => n > 0)
                  .map(([k, n]) => (
                    <span key={k} style={{
                      fontSize: 11.5, padding: '5px 11px', borderRadius: 20,
                      background: C.primaryBg, color: C.text2,
                    }}>
                      {VINCULO_LABEL[k] || k}: <strong style={{ color: C.text }}>{n}</strong>
                    </span>
                  ))}
              </div>

              {/* Respostas por dia */}
              {dados.por_dia.length > 1 && (
                <div style={{ marginBottom: 16 }}>
                  <p style={{ fontSize: 10.5, color: C.text3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 8 }}>
                    Respostas por dia
                  </p>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 54, overflowX: 'auto' }}>
                    {dados.por_dia.map((d) => {
                      const max = Math.max(...dados.por_dia.map((x) => x.total)) || 1;
                      return (
                        <div key={d.dia} title={`${fmtDia(d.dia)}: ${d.total}`}
                          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minWidth: 22 }}>
                          <div style={{
                            width: 16, height: Math.max(3, (d.total / max) * 40),
                            background: C.primary, borderRadius: 3, opacity: 0.85,
                          }} />
                          <span style={{ fontSize: 9, color: C.text3 }}>{fmtDia(d.dia)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Convite de atualização cadastral (quem está sem CPF) */}
              <CardConviteCenso />

              {/* Quem falta */}
              <Button
                variant="outline" size="sm"
                style={{ marginTop: 14 }}
                onClick={() => setVerFaltantes((v) => !v)}
              >
                <Search style={{ width: 13, height: 13, marginRight: 6 }} />
                {verFaltantes ? 'Esconder quem falta' : `Ver quem falta (${rec.faltando})`}
              </Button>

              {verFaltantes && (
                <div style={{ marginTop: 12 }}>
                  <Input
                    placeholder="Buscar por nome…"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    style={{ marginBottom: 10, maxWidth: 320 }}
                  />
                  {faltantes.aviso && (
                    <p style={{ fontSize: 12, color: C.amber }}>{faltantes.aviso}</p>
                  )}
                  {carregandoFalt && (
                    <p style={{ fontSize: 12, color: C.text3 }}>Carregando…</p>
                  )}
                  {!carregandoFalt && !faltantes.items.length && !faltantes.aviso && (
                    <p style={{ fontSize: 12, color: C.text3 }}>
                      {busca ? 'Ninguém com esse nome está pendente.' : 'Todo mundo da base já respondeu.'}
                    </p>
                  )}
                  {faltantes.items.map((p) => (
                    <div key={p.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 0', borderBottom: `1px solid ${C.border}`,
                    }}>
                      <span style={{ flex: 1, fontSize: 12.5, color: C.text }}>{p.nome}</span>
                      <span style={{ fontSize: 11.5, color: C.text3 }}>{p.telefone || 'sem telefone'}</span>
                      {p.telefone && (
                        <Link
                          to={hrefConversa(p.telefone)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: C.primary }}
                        >
                          <MessageSquare style={{ width: 12, height: 12 }} />
                          Conversas
                        </Link>
                      )}
                    </div>
                  ))}
                  {faltantes.total > LIMITE && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                      <Button
                        variant="outline" size="sm" disabled={offset === 0 || carregandoFalt}
                        onClick={() => carregarFaltantes(Math.max(0, offset - LIMITE), busca.trim())}
                      >
                        Anterior
                      </Button>
                      <span style={{ fontSize: 11.5, color: C.text3 }}>
                        {offset + 1}–{Math.min(offset + LIMITE, faltantes.total)} de {faltantes.total}
                      </span>
                      <Button
                        variant="outline" size="sm"
                        disabled={offset + LIMITE >= faltantes.total || carregandoFalt}
                        onClick={() => carregarFaltantes(offset + LIMITE, busca.trim())}
                      >
                        Próxima
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

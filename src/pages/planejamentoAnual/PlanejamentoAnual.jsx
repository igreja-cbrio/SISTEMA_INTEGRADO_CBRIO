import { useState, useEffect, useCallback } from 'react';
import { CalendarRange } from 'lucide-react';
import { toast } from 'sonner';
import ModuleHeader from '../../components/layout/ModuleHeader';
import { useAuth } from '../../contexts/AuthContext';
import { planejamentoAnual as api } from '../../api';
import { C, btn, fmtData } from './comum';
import PropostasTab from './PropostasTab';
import AvaliacaoTab from './AvaliacaoTab';
import OrcamentoTab from './OrcamentoTab';
import PastorTab from './PastorTab';

const tabBtn = (ativo) => ({
  padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer',
  border: 'none', background: ativo ? C.primary : 'transparent', color: ativo ? '#fff' : C.t2,
});

// Eixo estratégico da CBRio: 2026-2030. Cada ano é um ciclo de planejamento;
// as propostas de um ciclo compõem o eixo anual daquele ano. A régua é só
// contexto visual (decisão do Yago 2026-08-13) — não toca o /expansao.
const EIXO_INICIO = 2026;
const EIXO_FIM = 2030;

function ReguaEixo({ ciclos, cicloAtual, aoSelecionar, aoCriar, podeCriar }) {
  const anoCorrente = new Date().getFullYear();
  const porAno = Object.fromEntries((ciclos || []).map((c) => [c.ano, c]));
  const anos = [];
  for (let a = EIXO_INICIO; a <= EIXO_FIM; a += 1) anos.push(a);

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: 0.4 }}>
          Eixo estratégico {EIXO_INICIO}–{EIXO_FIM}
        </span>
        <span style={{ fontSize: 11.5, color: C.t3 }}>
          · as propostas de cada ciclo compõem o eixo anual
        </span>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {anos.map((ano) => {
          const c = porAno[ano];
          const ativo = c && cicloAtual?.id === c.id;
          const publicado = Boolean(c?.publicado_em);
          const corBorda = ativo ? C.primary : publicado ? C.green : c ? C.border : 'var(--hairline)';
          return (
            <button
              key={ano}
              onClick={() => (c ? aoSelecionar(c.id) : podeCriar && aoCriar(ano))}
              disabled={!c && !podeCriar}
              title={c ? (publicado ? 'Calendário publicado' : 'Ciclo em andamento') : podeCriar ? 'Criar ciclo deste ano' : 'Ciclo ainda não criado'}
              style={{
                flex: '1 1 110px', minWidth: 100, padding: '8px 10px', borderRadius: 10, textAlign: 'left',
                border: `1px solid ${corBorda}`, cursor: c || podeCriar ? 'pointer' : 'default',
                background: ativo ? C.primaryBg : 'transparent',
                opacity: c ? 1 : 0.6,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <strong style={{ fontSize: 14, color: ativo ? C.primary : C.text }}>{ano}</strong>
                {ano === anoCorrente && (
                  <span style={{ fontSize: 9.5, fontWeight: 700, color: C.t3, border: `1px solid ${C.border}`, borderRadius: 999, padding: '0 5px' }}>
                    ano corrente
                  </span>
                )}
              </div>
              <div style={{ fontSize: 10.5, color: publicado ? C.green : c ? C.t2 : C.t3, marginTop: 2 }}>
                {publicado ? 'publicado' : c ? (c.submissao_aberta ? 'submissão aberta' : c.avaliacao_aberta ? 'em avaliação' : 'em preparação') : podeCriar ? '+ criar ciclo' : 'sem ciclo'}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function PlanejamentoAnual() {
  const { profile } = useAuth();
  const [ciclos, setCiclos] = useState([]);
  const [ciclo, setCiclo] = useState(null);
  const [constantes, setConstantes] = useState(null);
  const [locais, setLocais] = useState([]);
  const [areas, setAreas] = useState([]);
  const [aba, setAba] = useState(0);
  const [carregando, setCarregando] = useState(true);

  const carregarCiclo = useCallback(async (id) => {
    try { setCiclo(await api.ciclos.get(id)); }
    catch { toast.error('Erro ao carregar o ciclo'); }
  }, []);

  useEffect(() => {
    (async () => {
      setCarregando(true);
      try {
        const [lista, consts, locs, ars] = await Promise.all([
          api.ciclos.list(),
          api.constantes().catch(() => null),
          api.locais().catch(() => []),
          api.areas().catch(() => []),
        ]);
        setCiclos(Array.isArray(lista) ? lista : []);
        setConstantes(consts);
        setLocais(locs);
        setAreas(ars);
        if (lista?.length) await carregarCiclo(lista[0].id);
      } catch {
        toast.error('Erro ao carregar o Planejamento Anual');
      } finally { setCarregando(false); }
    })();
  }, [carregarCiclo]);

  const meuPapel = ciclo?.meu_papel || 'observador';
  const ehPastor = meuPapel === 'pastor';
  const ehAvaliador = meuPapel === 'avaliador';
  const minhaDiretoria = ciclo?.avaliadores?.find((a) => a.profile_id === profile?.id)?.diretoria || null;
  const souFinanceiro = minhaDiretoria === 'financeiro' || ehPastor;

  const abas = [
    { rotulo: 'Propostas', visivel: true },
    { rotulo: 'Avaliação', visivel: ehAvaliador || ehPastor },
    { rotulo: 'Orçamento', visivel: souFinanceiro },
    { rotulo: 'Pastor presidente', visivel: ehPastor },
  ];

  return (
    <div style={{ display: 'grid', gap: 16, padding: '24px 28px 40px', maxWidth: 1200, margin: '0 auto' }}>
      <ModuleHeader
        icon={CalendarRange}
        title="Planejamento Anual"
        subtitle="Propostas do ciclo · avaliação pelas diretorias · decisão do Pastor · calendário e orçamento"
      />

      {carregando && <p style={{ fontSize: 13, color: C.t3 }}>Carregando…</p>}

      {!carregando && !ciclos.length && (
        <p style={{ fontSize: 13, color: C.t3 }}>Nenhum ciclo de planejamento criado ainda.</p>
      )}

      {ciclo && (
        <>
          <ReguaEixo
            ciclos={ciclos}
            cicloAtual={ciclo}
            aoSelecionar={carregarCiclo}
            podeCriar={ehPastor}
            aoCriar={async (ano) => {
              try {
                const novo = await api.ciclos.create(ano);
                toast.success(`Ciclo ${ano} criado`);
                setCiclos((cs) => [novo, ...cs].sort((a, b) => b.ano - a.ano));
                await carregarCiclo(novo.id);
              } catch (e) { toast.error(e.message || 'Não foi possível criar o ciclo'); }
            }}
          />

          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            padding: '10px 14px', borderRadius: 12, background: 'var(--panel, var(--cbrio-card))',
            border: '1px solid var(--hairline)', fontSize: 12.5, color: C.t2,
          }}>
            {ciclos.length > 1 && (
              <select
                style={{ padding: '4px 8px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, fontWeight: 700 }}
                value={ciclo.id}
                onChange={(e) => carregarCiclo(e.target.value)}
              >
                {ciclos.map((c) => <option key={c.id} value={c.id}>Ciclo {c.ano}</option>)}
              </select>
            )}
            {ciclos.length <= 1 && <strong style={{ color: C.text }}>Ciclo {ciclo.ano}</strong>}
            <span>submissão <strong style={{ color: ciclo.submissao_aberta ? C.green : C.red }}>{ciclo.submissao_aberta ? 'aberta' : 'fechada'}</strong></span>
            <span>avaliação <strong style={{ color: ciclo.avaliacao_aberta ? C.green : C.red }}>{ciclo.avaliacao_aberta ? 'aberta' : 'fechada'}</strong></span>
            <span>
              {ciclo.publicado_em
                ? <>calendário <strong style={{ color: C.green }}>publicado em {fmtData(String(ciclo.publicado_em).slice(0, 10))}</strong></>
                : <>calendário <strong style={{ color: C.t3 }}>não publicado</strong></>}
            </span>
            <span style={{ marginLeft: 'auto', color: C.t3 }}>
              Diretorias: {(ciclo.avaliadores || []).map((a) => `${a.diretoria} (${a.nome || '—'})`).join(' · ')}
            </span>
          </div>

          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {abas.map((a, i) => a.visivel && (
              <button key={a.rotulo} style={tabBtn(aba === i)} onClick={() => setAba(i)}>{a.rotulo}</button>
            ))}
          </div>

          {aba === 0 && (
            <PropostasTab ciclo={ciclo} constantes={constantes} locais={locais} areas={areas}
              recarregarCiclo={() => carregarCiclo(ciclo.id)} />
          )}
          {aba === 1 && (ehAvaliador || ehPastor) && (
            <AvaliacaoTab ciclo={ciclo} constantes={constantes} minhaDiretoria={minhaDiretoria} locais={locais} />
          )}
          {aba === 2 && souFinanceiro && (
            <OrcamentoTab ciclo={ciclo} souFinanceiro={minhaDiretoria === 'financeiro'} />
          )}
          {aba === 3 && ehPastor && (
            <PastorTab ciclo={ciclo} constantes={constantes} recarregarCiclo={() => carregarCiclo(ciclo.id)} />
          )}
        </>
      )}
    </div>
  );
}

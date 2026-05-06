// ============================================================================
// /admin/grupos/geocode — valida endereços dos grupos em massa.
//
// Para cada grupo ativo: tenta encontrar lat/lng via CEP (ViaCEP+Nominatim)
// ou texto livre do "local". Pula grupos online (sem coords) e os que
// já têm coordenadas (com a opção "somente sem coords"). O endpoint
// respeita o rate limit do Nominatim (1.1s entre chamadas), então leva
// alguns minutos para 128 grupos.
//
// Após o batch, mostra a lista de FALHAS para o admin completar
// manualmente os que o sistema não conseguiu identificar.
// ============================================================================

import { useEffect, useState } from 'react';
import { grupos as api } from '../../api';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';
import { MapPin, AlertTriangle, CheckCircle2, Clock, Play, Copy, Check } from 'lucide-react';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  primary: '#00B39D', green: '#10b981', amber: '#f59e0b', red: '#ef4444',
};

export default function GruposGeocode() {
  const [temporadas, setTemporadas] = useState([]);
  const [temporadaId, setTemporadaId] = useState('');
  const [somenteSemCoords, setSomenteSemCoords] = useState(true);
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    api.temporadas().then(ts => {
      setTemporadas(ts || []);
      const ativa = (ts || []).find(t => t.ativa);
      if (ativa) setTemporadaId(ativa.id);
    }).catch(() => {});
  }, []);

  async function rodar() {
    if (!confirm(`Rodar geocode em massa? Vai levar ~3 minutos para validar todos os grupos da temporada selecionada. Pode acompanhar a evolução depois consultando a página /grupos.`)) return;
    setLoading(true);
    setResultado(null);
    try {
      const r = await api.geocodeBatch({
        temporada: temporadaId || undefined,
        somente_sem_coords: somenteSemCoords,
      });
      setResultado(r);
      toast.success(`${r.ok_count} validados, ${r.falhas_count} falhas`);
    } catch (e) {
      toast.error(e.message || 'Erro ao rodar geocode');
    } finally {
      setLoading(false);
    }
  }

  function copiarFalhas() {
    if (!resultado?.falhas?.length) return;
    const txt = resultado.falhas.map(f =>
      `• ${f.codigo || f.id.slice(0, 8)} — ${f.nome}\n  Local: ${f.local || '-'}\n  Bairro: ${f.bairro || '-'}\n  CEP: ${f.cep || '-'}\n  Motivo: ${f.motivo}`
    ).join('\n\n');
    navigator.clipboard.writeText(txt);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1500);
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <MapPin size={22} style={{ color: C.primary }} /> Validar endereços dos grupos
        </h1>
        <p style={{ fontSize: 13, color: C.t3, marginTop: 6 }}>
          Roda geocoding em massa para preencher latitude/longitude dos grupos a partir
          do endereço cadastrado. Necessário para o mapa funcionar e para a busca por raio
          (CEP) na inscrição pública.
        </p>
      </div>

      <div style={{ background: C.card, borderRadius: 12, padding: 18, border: `1px solid ${C.border}`, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.t2, marginBottom: 4, display: 'block' }}>
              Temporada
            </label>
            <select value={temporadaId} onChange={e => setTemporadaId(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'var(--cbrio-input-bg)', color: C.text, fontSize: 13 }}>
              <option value="">Todas</option>
              {temporadas.map(t => <option key={t.id} value={t.id}>{t.label}{t.ativa ? ' (atual)' : ''}</option>)}
            </select>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.t2, cursor: 'pointer', paddingBottom: 8 }}>
            <input type="checkbox" checked={somenteSemCoords} onChange={e => setSomenteSemCoords(e.target.checked)} style={{ accentColor: C.primary }} />
            Apenas grupos sem coordenadas
          </label>

          <Button onClick={rodar} disabled={loading}>
            {loading ? <><Clock size={14} style={{ marginRight: 6 }} className="animate-spin" /> Rodando (~3min)...</> : <><Play size={14} style={{ marginRight: 6 }} /> Rodar geocode em massa</>}
          </Button>
        </div>

        <div style={{ fontSize: 11, color: C.t3, marginTop: 12, padding: 10, background: 'rgba(245,158,11,0.08)', borderRadius: 8, border: `1px solid ${C.amber}40` }}>
          <strong style={{ color: C.amber }}>Atenção:</strong> a operação respeita o rate limit do Nominatim (OpenStreetMap):
          1.1s entre chamadas. Para 128 grupos pode levar até 5 minutos. Não feche a página
          até completar.
        </div>
      </div>

      {resultado && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 14 }}>
            <Stat label="Total" value={resultado.total} cor={C.primary} />
            <Stat label="Validados" value={resultado.ok_count} cor={C.green} Icon={CheckCircle2} />
            <Stat label="Falharam" value={resultado.falhas_count} cor={C.red} Icon={AlertTriangle} />
            <Stat label="Pulados" value={resultado.skip_count} cor={C.t3} />
          </div>

          {resultado.falhas?.length > 0 && (
            <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                  {resultado.falhas.length} grupos precisam de endereço completo
                </span>
                <Button size="sm" variant="outline" onClick={copiarFalhas}>
                  {copiado ? <><Check size={14} style={{ marginRight: 4 }} /> Copiado</> : <><Copy size={14} style={{ marginRight: 4 }} /> Copiar lista</>}
                </Button>
              </div>
              <div style={{ maxHeight: 540, overflowY: 'auto' }}>
                {resultado.falhas.map(f => (
                  <div key={f.id} style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <code style={{ fontSize: 11, color: C.t3, fontFamily: 'monospace' }}>{f.codigo || f.id.slice(0, 8)}</code>
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{f.nome}</span>
                      <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: f.motivo === 'sem_endereco' ? '#ef444420' : '#f59e0b20', color: f.motivo === 'sem_endereco' ? C.red : C.amber, fontWeight: 600 }}>
                        {f.motivo}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: C.t2, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                      {f.bairro && <span><strong>Bairro:</strong> {f.bairro}</span>}
                      {f.cep && <span><strong>CEP:</strong> {f.cep}</span>}
                      <span style={{ flex: 1, minWidth: 200 }}><strong>Local:</strong> {f.local || <em style={{ color: C.red }}>vazio</em>}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {resultado.falhas?.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', background: 'rgba(16,185,129,0.08)', borderRadius: 12, border: `1px solid ${C.green}40` }}>
              <CheckCircle2 size={28} style={{ color: C.green, marginBottom: 8 }} />
              <div style={{ fontSize: 14, fontWeight: 700, color: C.green }}>Todos os endereços foram validados!</div>
              <div style={{ fontSize: 12, color: C.t3, marginTop: 4 }}>O mapa e a busca por CEP estão prontos.</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, cor, Icon }) {
  return (
    <div style={{ background: C.card, borderRadius: 10, padding: '12px 14px', border: `1px solid ${C.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {Icon && <Icon size={14} style={{ color: cor }} />}
        <span style={{ fontSize: 22, fontWeight: 700, color: cor }}>{value}</span>
      </div>
      <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>{label}</div>
    </div>
  );
}

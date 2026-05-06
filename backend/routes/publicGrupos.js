// Endpoints publicos (sem auth) para o formulario de cadastro / inscricao
// poder buscar grupos. Read-only — sem mutation aqui.
const router = require('express').Router();
const { supabase } = require('../utils/supabase');

const RATE_HEADERS = ['x-forwarded-for'];
function getIp(req) {
  return (req.headers[RATE_HEADERS[0]] || '').toString().split(',')[0].trim() || req.ip;
}

function distanciaKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// GET /api/public/grupos/temporadas
router.get('/temporadas', async (req, res) => {
  try {
    const { data } = await supabase.from('mem_temporadas').select('id, label, ano, numero, ativa').order('ano', { ascending: false }).order('numero', { ascending: false });
    res.json(data || []);
  } catch { res.status(500).json({ error: 'Erro' }); }
});

// GET /api/public/grupos/buscar
router.get('/buscar', async (req, res) => {
  try {
    const { lider_nome, categoria, bairro, cep, raio_km, temporada, q } = req.query;

    let query = supabase.from('mem_grupos')
      .select('id, codigo, nome, categoria, dia_semana, horario, recorrencia, local, descricao, bairro, lat, lng, lider_id, status_temporada, temporada, foto_url')
      .eq('ativo', true);
    // Por padrao mostra so grupos com status que aceitam novos (ativo + novo + a_confirmar)
    query = query.in('status_temporada', ['ativo', 'novo', 'a_confirmar']);
    if (categoria) query = query.eq('categoria', categoria);
    if (bairro) query = query.eq('bairro', bairro);
    if (temporada) query = query.eq('temporada', temporada);
    query = query.order('nome');

    const { data: grupos, error } = await query;
    if (error) throw error;

    // Enriquecer com lider
    const liderIds = [...new Set((grupos || []).map(g => g.lider_id).filter(Boolean))];
    let lideresMap = {};
    if (liderIds.length > 0) {
      const { data: lideres } = await supabase.from('mem_membros').select('id, nome, foto_url').in('id', liderIds);
      (lideres || []).forEach(l => { lideresMap[l.id] = l; });
    }

    let resultado = (grupos || []).map(g => ({
      ...g,
      lider_nome: lideresMap[g.lider_id]?.nome || null,
      lider_foto: lideresMap[g.lider_id]?.foto_url || null,
    }));

    if (lider_nome) {
      const term = String(lider_nome).toLowerCase();
      resultado = resultado.filter(g => g.lider_nome?.toLowerCase().includes(term));
    }
    if (q) {
      const term = String(q).toLowerCase();
      resultado = resultado.filter(g =>
        g.nome?.toLowerCase().includes(term)
        || g.lider_nome?.toLowerCase().includes(term)
        || g.bairro?.toLowerCase().includes(term)
        || g.local?.toLowerCase().includes(term)
        || g.codigo?.toLowerCase().includes(term)
      );
    }

    if (cep && raio_km) {
      const cepLimpo = String(cep).replace(/\D/g, '');
      if (cepLimpo.length === 8) {
        try {
          const viaCepRes = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
          const viaCep = await viaCepRes.json();
          if (!viaCep.erro) {
            const qStr = encodeURIComponent(`${viaCep.logradouro || ''} ${viaCep.localidade} ${viaCep.uf} Brasil`.trim());
            const nomRes = await fetch(`https://nominatim.openstreetmap.org/search?q=${qStr}&format=json&limit=1`, {
              headers: { 'User-Agent': 'CBRio-Sistema/1.0 (contato@cbrio.com.br)' },
            });
            const nom = await nomRes.json();
            const cepLat = nom?.[0] ? parseFloat(nom[0].lat) : null;
            const cepLng = nom?.[0] ? parseFloat(nom[0].lon) : null;
            const raio = parseFloat(raio_km) || 20;
            if (cepLat != null && cepLng != null) {
              resultado = resultado
                .filter(g => g.lat != null && g.lng != null)
                .map(g => ({ ...g, dist_km: distanciaKm(cepLat, cepLng, Number(g.lat), Number(g.lng)) }))
                .filter(g => g.dist_km <= raio)
                .sort((a, b) => a.dist_km - b.dist_km);
            }
          }
        } catch (e) { console.warn('[public grupos buscar geocode]', e.message); }
      }
    }

    res.json(resultado);
  } catch (e) { console.error('[public grupos buscar]', e.message); res.status(500).json({ error: 'Erro ao buscar grupos' }); }
});

// GET /api/public/grupos/lideres/buscar?q=&temporada=
router.get('/lideres/buscar', async (req, res) => {
  try {
    const { q, temporada } = req.query;
    const term = String(q || '').trim().toLowerCase();
    if (term.length < 2) return res.json([]);

    let query = supabase.from('mem_grupos').select('lider_id').eq('ativo', true).not('lider_id', 'is', null);
    if (temporada) query = query.eq('temporada', temporada);
    const { data: grupos } = await query;
    const liderIds = [...new Set((grupos || []).map(g => g.lider_id))];
    if (!liderIds.length) return res.json([]);

    const { data: lideres } = await supabase
      .from('mem_membros')
      .select('id, nome, foto_url')
      .in('id', liderIds)
      .ilike('nome', `%${term}%`)
      .order('nome')
      .limit(20);

    res.json(lideres || []);
  } catch { res.status(500).json({ error: 'Erro' }); }
});

// GET /api/public/grupos/lideres/:liderId/grupos
router.get('/lideres/:liderId/grupos', async (req, res) => {
  try {
    const { temporada } = req.query;
    let query = supabase.from('mem_grupos')
      .select('id, codigo, nome, categoria, dia_semana, horario, recorrencia, local, descricao, bairro, lat, lng, lider_id, status_temporada, temporada')
      .eq('lider_id', req.params.liderId).eq('ativo', true)
      .in('status_temporada', ['ativo', 'novo', 'a_confirmar']);
    if (temporada) query = query.eq('temporada', temporada);
    const { data, error } = await query.order('nome');
    if (error) throw error;
    res.json(data || []);
  } catch { res.status(500).json({ error: 'Erro' }); }
});

module.exports = router;

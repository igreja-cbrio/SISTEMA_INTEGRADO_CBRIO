import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { painelRh } from '../../api';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Cake, CalendarDays, Megaphone, Settings } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

function formatarData(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function Bloco({ icone: Icone, titulo, children }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Icone className="h-4 w-4 text-primary" />
          {titulo}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function VazioBloco({ texto }) {
  return <p className="text-xs text-muted-foreground py-2">{texto}</p>;
}

export default function PainelRH() {
  const navigate = useNavigate();
  const { canRH } = useAuth();
  const [aniversariantes, setAniversariantes] = useState([]);
  const [eventos, setEventos] = useState([]);
  const [comunicados, setComunicados] = useState([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let ativo = true;
    Promise.all([
      painelRh.aniversariantes().catch(() => []),
      painelRh.eventos().catch(() => []),
      painelRh.comunicados().catch(() => []),
    ]).then(([anivs, evs, coms]) => {
      if (!ativo) return;
      setAniversariantes(Array.isArray(anivs) ? anivs : []);
      setEventos(Array.isArray(evs) ? evs : []);
      setComunicados(Array.isArray(coms) ? coms : []);
      setCarregando(false);
    });
    return () => { ativo = false; };
  }, []);

  if (carregando) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="pb-2"><div className="h-4 w-32 bg-muted rounded" /></CardHeader>
            <CardContent><div className="h-16 bg-muted rounded" /></CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-primary" />
          Painel de RH
        </h2>
        {canRH && (
          <button
            onClick={() => navigate('/admin/rh?tab=painel')}
            className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
          >
            <Settings className="h-3.5 w-3.5" />
            Gerenciar
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Bloco icone={Cake} titulo="Aniversariantes do mês">
          {aniversariantes.length === 0 ? (
            <VazioBloco texto="Sem aniversariantes cadastrados este mês." />
          ) : (
            <ul className="space-y-2">
              {aniversariantes.slice(0, 6).map((p) => (
                <li key={p.id} className="flex items-center gap-2 text-sm">
                  {p.foto_url ? (
                    <img src={p.foto_url} alt="" className="h-7 w-7 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="h-7 w-7 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center shrink-0">
                      {p.nome?.[0]?.toUpperCase() || '?'}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.nome}</p>
                    <p className="text-xs text-muted-foreground">dia {p.dia}{p.cargo ? ` · ${p.cargo}` : ''}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Bloco>

        <Bloco icone={CalendarDays} titulo="Próximos eventos">
          {eventos.length === 0 ? (
            <VazioBloco texto="Nenhum evento programado no momento." />
          ) : (
            <ul className="space-y-2">
              {eventos.slice(0, 6).map((e) => (
                <li key={e.id} className="text-sm">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-semibold text-primary shrink-0">{formatarData(e.data)}</span>
                    <span className="truncate font-medium">{e.nome}</span>
                  </div>
                  {e.local && <p className="text-xs text-muted-foreground pl-[calc(2.2rem)]">{e.local}</p>}
                </li>
              ))}
            </ul>
          )}
        </Bloco>

        <Bloco icone={Megaphone} titulo="Comunicados de RH">
          {comunicados.length === 0 ? (
            <VazioBloco texto="Nenhum comunicado publicado." />
          ) : (
            <ul className="space-y-3">
              {comunicados.slice(0, 4).map((c) => (
                <li key={c.id}>
                  <p className="text-sm font-medium">{c.titulo}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2">{c.corpo}</p>
                </li>
              ))}
            </ul>
          )}
        </Bloco>
      </div>
    </section>
  );
}

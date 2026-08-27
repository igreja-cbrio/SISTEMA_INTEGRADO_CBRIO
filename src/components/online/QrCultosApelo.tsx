// QRs do APELO · o que a equipe do Online leva para o overlay da transmissão.
//
// Pedido do Matheus (27/08/2026): "prefiro que esse QR code de cada culto
// esteja na aba do online, para a equipe do online pegar lá".
//
// ⚠️⚠️ POR QUE UM QR POR CULTO, e não o link fixo `/decisao`. O vídeo fica no
// YouTube para sempre. Com QR fixo, o servidor deduz o culto pelo RELÓGIO —
// então quem assiste a gravação daqui a dois anos entra no culto da semana em
// que abriu o vídeo, que nunca assistiu. Com o culto dentro do link, o QR fica
// gravado naquele vídeo e aponta para aquele culto para sempre.
//
// ⚠️ Este NÃO é o "Links do voluntário" da Integração. Aquele é o link de um
// voluntário LANÇAR a decisão de terceiros; este é o QR que a PRÓPRIA pessoa
// escaneia. Ter os dois no mesmo botão seria a receita para o link errado ir
// ao ar num domingo.
import { useCallback, useEffect, useState } from 'react';
import { online as onlineApi } from '../../api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { QrCode, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import QrLinkDialog from '../QrLinkDialog';

type CultoQr = { id: string; data: string; hora: string | null; nome: string; link: string | null };

/** Domingo da semana de `base`, em data local (nunca UTC). */
function inicioSemana(base: Date) {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  d.setDate(d.getDate() - d.getDay());
  return d;
}
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function QrCultosApelo() {
  const [semana, setSemana] = useState(() => inicioSemana(new Date()));
  const [cultos, setCultos] = useState<CultoQr[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [qr, setQr] = useState<{ link: string; titulo: string } | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null);
    const fim = new Date(semana); fim.setDate(fim.getDate() + 6);
    try {
      const r = await onlineApi.qrCultos(iso(semana), iso(fim));
      setCultos(r.cultos || []);
    } catch (e: unknown) {
      // ⚠️ Erro NUNCA vira lista vazia: "não há culto com transmissão" e "a
      // consulta falhou" levam a decisões opostas na véspera do culto.
      setErro(e instanceof Error ? e.message : 'Erro ao carregar os QRs');
      setCultos([]);
    } finally { setCarregando(false); }
  }, [semana]);
  useEffect(() => { carregar(); }, [carregar]);

  const mover = (dias: number) => {
    const d = new Date(semana); d.setDate(d.getDate() + dias); setSemana(d);
  };
  const fimSemana = new Date(semana); fimSemana.setDate(fimSemana.getDate() + 6);
  const rotulo = `${semana.getDate()}/${semana.getMonth() + 1} a ${fimSemana.getDate()}/${fimSemana.getMonth() + 1}`;
  const semLink = cultos.filter((c) => !c.link).length;

  return (
    <Card>
      <CardContent className="p-4 md:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-2"><QrCode className="h-5 w-5 text-primary" /></div>
            <div>
              <h2 className="text-base font-bold leading-tight">QR do apelo · por culto</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Baixe o cartaz e ponha no telão no momento do apelo. O QR fica gravado no vídeo —
                quem assistir a gravação meses depois entra <strong>neste</strong> culto.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" onClick={() => mover(-7)} aria-label="Semana anterior">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground min-w-[92px] text-center">{rotulo}</span>
            <Button size="icon" variant="ghost" onClick={() => mover(7)} aria-label="Próxima semana">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {carregando ? (
          <div className="py-6 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
        ) : erro ? (
          <p className="text-sm text-destructive py-3">{erro}</p>
        ) : cultos.length === 0 ? (
          <p className="text-sm text-muted-foreground py-3">
            Nenhum culto com transmissão nesta semana.
          </p>
        ) : (
          <>
            {semLink > 0 && (
              <p className="text-[11px] text-amber-600 dark:text-amber-500">
                {semLink} culto(s) sem QR disponível — falta configurar o segredo do token no
                servidor. Melhor não ir ao ar com um QR que não abre.
              </p>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              {cultos.map((c) => (
                <div key={c.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{c.nome}</div>
                    <div className="text-xs text-muted-foreground">
                      {String(c.data).split('-').reverse().join('/')}
                      {c.hora ? ` · ${c.hora.slice(0, 5)}` : ''}
                    </div>
                  </div>
                  {c.link ? (
                    <Button size="sm" variant="outline"
                      onClick={() => setQr({ link: c.link!, titulo: `${c.nome} · ${String(c.data).split('-').reverse().join('/')}` })}>
                      <QrCode className="h-3.5 w-3.5 mr-1" /> QR
                    </Button>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">indisponível</span>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {qr && (
          <QrLinkDialog
            link={qr.link}
            titulo={qr.titulo}
            nomeArquivo={`qr-apelo-${qr.titulo.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
            descricao="Vai no telão no momento do apelo e fica gravado no vídeo. Quem assistir depois cai NESTE culto."
            chamada="Decidiu seguir a Jesus agora? Queremos caminhar com você."
            /* ⚠️ Sem QR dinâmico: link curto é repontável, e repontar um QR já
               gravado num vídeo mandaria aquelas decisões para outro culto. */
            semDinamico
            onClose={() => setQr(null)}
          />
        )}
      </CardContent>
    </Card>
  );
}

#!/usr/bin/env python3
"""
Converte a planilha de KPIs ministeriais (formato longo TSV) em SQL de importação.

Uso:
  python3 scripts/importar_cultos.py planilha.tsv > output.sql

A planilha deve ser o conteúdo copiado da aba "Dados Ministeriais" em formato
TSV (Tab-Separated Values). Cabeçalho esperado:
  Semana  Data  Dia  Mês  Horário  Indicador  Valor Absoluto  Média

Apenas linhas com "Valor Absoluto" preenchido (dados reais) são importadas.
"""

import sys
import csv
from datetime import datetime
from collections import defaultdict

# ── Mapeamentos ────────────────────────────────────────────────────────────────

HORARIO_NOME = {
    'D09':    'Domingo 08:30',
    'D08':    'Domingo 08:30',
    'D11':    'Domingo 11:30',
    'D10':    'Domingo 10:00',
    'D19':    'Domingo 19:00',
    'Quarta': 'Quarta com Deus',
    'AMI':    'AMI',
}

HORARIO_HORA = {
    'D09':    '08:30:00',
    'D08':    '08:30:00',
    'D11':    '11:30:00',
    'D10':    '10:00:00',
    'D19':    '19:00:00',
    'Quarta': '20:00:00',
    'AMI':    '20:00:00',
}

# Indicador da planilha → coluna na tabela cultos
INDICADOR_COLUNA = {
    'Frequência':          'presencial_adulto',
    'Frequência Kids':     'presencial_kids',
    'Aceitações':          'decisoes_presenciais',
    'Visitantes':          'visitantes',
    'Ao vivo':             'online_pico',
    'Visitantes Online':   'visitantes_online',
    'Aceitações Online':   'decisoes_online',
    'Online DS':           'online_ds',
    'Online DDUS':         'online_ddus',
    'Voluntariado':        'voluntarios',
}

IGNORADOS = set()


def parse_int(val):
    """Converte '1.234' ou '1234' para int, retorna None se vazio/inválido."""
    if not val or not val.strip():
        return None
    val = val.strip().replace('.', '').replace(',', '')
    try:
        return int(float(val))
    except ValueError:
        return None


def parse_data(val):
    """Converte DD/MM/YYYY para YYYY-MM-DD."""
    val = val.strip()
    for fmt in ('%d/%m/%Y', '%d/%m/%y'):
        try:
            return datetime.strptime(val, fmt).strftime('%Y-%m-%d')
        except ValueError:
            continue
    return None


def sql_val(v):
    if v is None:
        return 'NULL'
    return str(v)


def main():
    if len(sys.argv) < 2:
        print("Uso: python3 scripts/importar_cultos.py <planilha.tsv>", file=sys.stderr)
        sys.exit(1)

    tsv_path = sys.argv[1]

    # chave: (data_iso, horario_code) → dict de colunas
    cultos = defaultdict(dict)
    meta_row = {}  # chave → (semana, data_original, nome_culto)

    with open(tsv_path, encoding='utf-8') as f:
        reader = csv.DictReader(f, delimiter='\t')
        for row in reader:
            data_raw   = row.get('Data', '').strip()
            horario    = row.get('Horário', '').strip()
            indicador  = row.get('Indicador', '').strip()
            valor_str  = row.get('Valor Absoluto', '').strip()
            semana     = row.get('Semana', '').strip()

            if not data_raw or not horario or not indicador:
                continue

            # Só importar dados reais (Valor Absoluto preenchido)
            if not valor_str:
                continue

            # Ignorar indicadores sem coluna mapeada
            if indicador in IGNORADOS:
                continue

            coluna = INDICADOR_COLUNA.get(indicador)
            if not coluna:
                print(f"AVISO: indicador desconhecido '{indicador}' ignorado", file=sys.stderr)
                continue

            data_iso = parse_data(data_raw)
            if not data_iso:
                print(f"AVISO: data inválida '{data_raw}' ignorada", file=sys.stderr)
                continue

            if horario not in HORARIO_NOME:
                print(f"AVISO: horário desconhecido '{horario}' ignorado", file=sys.stderr)
                continue

            valor = parse_int(valor_str)
            if valor is None:
                continue

            key = (data_iso, horario)
            cultos[key][coluna] = valor

            if key not in meta_row:
                meta_row[key] = semana

    if not cultos:
        print("Nenhum dado encontrado. Verifique o arquivo TSV.", file=sys.stderr)
        sys.exit(1)

    # ── Gerar SQL ──────────────────────────────────────────────────────────────
    print("-- Importação de cultos históricos gerada por scripts/importar_cultos.py")
    print("-- Total de cultos a importar:", len(cultos))
    print()
    print("BEGIN;")
    print()

    for (data_iso, horario), cols in sorted(cultos.items()):
        nome_servico = HORARIO_NOME[horario]
        hora         = HORARIO_HORA[horario]
        data_display = datetime.strptime(data_iso, '%Y-%m-%d').strftime('%d/%m/%Y')
        nome_culto   = f"{nome_servico} - {data_display}"

        presencial_adulto    = sql_val(cols.get('presencial_adulto'))
        presencial_kids      = sql_val(cols.get('presencial_kids'))
        decisoes_presenciais = sql_val(cols.get('decisoes_presenciais'))
        visitantes           = sql_val(cols.get('visitantes'))
        online_pico          = sql_val(cols.get('online_pico'))
        visitantes_online    = sql_val(cols.get('visitantes_online'))
        decisoes_online      = sql_val(cols.get('decisoes_online'))
        online_ds            = sql_val(cols.get('online_ds'))
        online_ddus          = sql_val(cols.get('online_ddus'))
        voluntarios          = sql_val(cols.get('voluntarios'))

        print(f"""INSERT INTO public.cultos
  (service_type_id, nome, data, hora,
   presencial_adulto, presencial_kids,
   decisoes_presenciais, visitantes,
   online_pico, visitantes_online,
   decisoes_online, online_ds, online_ddus,
   voluntarios)
SELECT
  vst.id,
  '{nome_culto}',
  '{data_iso}',
  '{hora}',
  {presencial_adulto}, {presencial_kids},
  {decisoes_presenciais}, {visitantes},
  {online_pico}, {visitantes_online},
  {decisoes_online}, {online_ds}, {online_ddus},
  {voluntarios}
FROM public.vol_service_types vst
WHERE vst.name = '{nome_servico}'
  AND NOT EXISTS (
    SELECT 1 FROM public.cultos c2
    WHERE c2.data = '{data_iso}'
      AND c2.service_type_id = vst.id
  )
LIMIT 1;
""")

    print("COMMIT;")
    print()
    print(f"-- Fim: {len(cultos)} registros gerados.")


if __name__ == '__main__':
    main()

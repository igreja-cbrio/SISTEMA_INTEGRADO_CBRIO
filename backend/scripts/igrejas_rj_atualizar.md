# Como regenerar `backend/data/igrejasRJ.json`

A lista de igrejas do estado do RJ vem do **OpenStreetMap**, via Overpass API.

⚠️ **Não é registro oficial.** O OSM é colaborativo, então a lista é boa mas
incompleta — tem ~1.900 templos cristãos com nome, e certamente falta igreja
pequena e recém-aberta. É exatamente por isso que a pergunta do censo aceita
"outra (digite o nome)": lista incompleta sem escape é pior que um campo de texto,
porque a pessoa não encontra a igreja dela e responde qualquer coisa.

A alternativa "oficial" seria o cadastro de CNPJ da Receita (CNAE 9491-0/00,
organizações religiosas), que é público mas vem em dezenas de GB — vale a pena se
algum dia a cobertura importar mais que o esforço.

## Passo a passo

```bash
cat > /tmp/overpass.txt <<'EOF'
[out:json][timeout:180];
area["ISO3166-2"="BR-RJ"][admin_level=4]->.rj;
(
  node["amenity"="place_of_worship"]["name"](area.rj);
  way["amenity"="place_of_worship"]["name"](area.rj);
  relation["amenity"="place_of_worship"]["name"](area.rj);
);
out tags center;
EOF

curl -s -X POST https://overpass-api.de/api/interpreter \
  --data-urlencode "data@/tmp/overpass.txt" -o /tmp/osm_rj.json
```

Depois filtre: só `religion=christian` ou sem religião marcada com pista no nome
(igreja/capela/catedral/paróquia/comunidade/assembleia/batista…), removendo
centro espírita, umbanda, mesquita, sinagoga e salão do reino — o censo pergunta
a **igreja** anterior da pessoa. Deduplique por nome+cidade normalizados.

O formato final é `{ _fonte, _leia, _total, igrejas: [{ nome, cidade, bairro, denom }] }`.

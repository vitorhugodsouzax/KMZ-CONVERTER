# Conversor KML/KMZ para XLSX

Node.js + Fastify + TypeScript, com R e `geocodebr`. Tela em português para enviar até 20 arquivos, completar lacunas de endereço pelo CNEFE, conferir os campos e baixar um XLSX consolidado.

## Executar

Para a configuração de hospedagem gratuita com Docker, Caddy, acesso individual e fila, veja [deploy/LEIA-ME.md](deploy/LEIA-ME.md). A publicação depende de uma conta e VM Always Free disponíveis; ainda precisa de validação Linux/CNEFE no servidor.

Requer Node.js 22 ou superior, R 4.1+ e o pacote `geocodebr`. Nesta instalação, as dependências do R ficam em `.r-library`.

### Testar localmente com busca de endereços

Instale o Node.js 22+ e o R 4.1+ (ou mais recente). No console do R, instale os pacotes necessários uma única vez:

```r
install.packages(c("geocodebr", "sf", "jsonlite"))
```

Depois, clone o repositório e execute:

```sh
git clone https://github.com/vitorhugodsouzax/KMZ-CONVERTER.git
cd KMZ-CONVERTER
npm ci
npm run build
npm start
```

Abra http://127.0.0.1:3000. No Windows, se o R foi instalado em outro local, informe o caminho antes de iniciar:

```powershell
$env:RSCRIPT_PATH="C:\Program Files\R\R-4.6.1\bin\Rscript.exe"
npm start
```

Na primeira conversão que precise buscar endereços, o `geocodebr` baixa e prepara a base CNEFE. Isso pode demorar e consumir espaço em disco; as execuções posteriores reutilizam o cache. Para rodar sem a busca automática de endereço, use `GEOCODING_DISABLED=1`.

```sh
npm ci
npm run build
npm start
```

Abra http://127.0.0.1:3000. Para desenvolvimento: `npm run dev` (recompilar após mudanças no frontend). `HOST` e `PORT` podem ser definidos no ambiente; para carregar um arquivo `.env`, execute `node --env-file=.env dist/server.js` após o build.

## Uso

1. Informe a operadora e selecione ou arraste de 1 a 20 arquivos `.kml`/`.kmz`.
2. Clique em **Ler arquivos**. A primeira busca baixa e prepara a base CNEFE; as seguintes reutilizam o cache.
3. Confira os campos sugeridos. Em **Correspondência dos campos**, escolha os nomes usados pelo fornecedor e atualize a prévia.
4. Clique em **Baixar XLSX**. A exportação usa o mapeamento atual, mesmo sem atualizar a prévia.

O botão de exemplo carrega `public/exemplo.kml`, com dados fictícios. Nenhum arquivo real de operadora foi fornecido durante o desenvolvimento.

## O que é extraído

- Placemarks, pastas, nomes, descrições, `ExtendedData/Data` e `SchemaData/SimpleData`.
- Campos em tabelas HTML de duas colunas ou linhas `campo: valor` nas descrições.
- Point, LineString, LinearRing, Polygon (incluindo buracos) e MultiGeometry.
- Todos os KMLs presentes em cada KMZ, sem descompactar arquivos no sistema de arquivos.
- Coordenadas KML em longitude/latitude/altitude, exportadas em colunas identificadas.

Campos originais têm prioridade. Quando CEP, UF, cidade, bairro ou número estiverem ausentes, o `geocodebr::geocode_reverso()` procura o endereço CNEFE mais próximo em até 1.000 m. O XLSX registra a distância e se a coordenada era um ponto exato ou o centro aproximado dos vértices de uma linha/polígono. A associação é uma aproximação e pode não trazer número. Não há dedução de faixas, validação topológica ou gravação no PostgreSQL. Datas e números de fachada são preservados como texto.

## Planilha

| Aba | Conteúdo |
| --- | --- |
| Registros | Uma linha por Placemark, arquivo de origem, campos mapeados, endereço CNEFE, distância, operadora, avisos e links |
| Coordenadas | Todos os vértices válidos, com ID do registro, ID da geometria, anel e ordem |
| Atributos | Campos originais, incluindo descrição; textos longos são divididos em partes |
| Leia-me | Origem, contagens, mapeamento e limitações |

Textos de origem são gravados como strings, nunca executados como fórmulas. A prévia mostra até 100 registros; o XLSX inclui todos os registros aceitos.

## API

| Método e rota | Entrada / saída |
| --- | --- |
| `POST /api/import` | Multipart `operator` + um ou mais campos `files`; retorna ID temporário, campos, sugestões e prévia |
| `POST /api/import/:id/preview` | JSON `{ "mapping": { "cep": "CEP", "numero_inicio": "N_inicio" } }` |
| `POST /api/import/:id/export` | Mesmo JSON; responde com o XLSX |
| `GET /api/health` | `{ "ok": true }` |

Campos de destino: `cep`, `uf`, `cidade`, `bairro`, `numero`, `numero_inicio`, `numero_fim`, `tipo`, `data_inclusao`. Use o nome exato do campo de origem, retornado em `fields`. Um mapeamento vazio permite que os campos de endereço disponíveis no CNEFE preencham as lacunas.

## Limites desta versão

Uso local: escuta `127.0.0.1` por padrão, sem autenticação. O Compose ativa autenticação pelo Caddy e isolamento por usuário; nunca exponha a porta do Node com `PROXY_AUTH=1`. Não há histórico persistente.

- Até 20 arquivos, 50 MB por arquivo e 250 MB por lote; até 250 MB de KML descompactado por KMZ.
- Até 500 entradas no KMZ, 100 mil Placemarks, 500 mil coordenadas e 1 milhão de atributos.
- Uma conversão por vez, em Worker Thread, e até duas solicitações aguardando. A leitura/geocodificação tem limite de 35 minutos; a exportação, 90 segundos. A fila não sobrevive a reinícios.
- Até três importações temporárias, por 30 minutos e até 350 MB de dados serializados; as mais antigas são removidas quando necessário. Reiniciar o servidor limpa todas.
- Links externos de NetworkLink não são acessados. KMLs internos ao KMZ são lidos uma vez por arquivo. Não deduplica Placemarks iguais em arquivos diferentes.
- Overlays de imagens e geometrias `gx:Track`/Model não são convertidos e geram avisos.
- KML em UTF-8 ou UTF-16 com BOM. DTD/entidades externas são rejeitadas.
- Altitude é preservada como na origem; não implica altitude absoluta. Metadados cartográficos como estilos não são reproduzidos no XLSX.

Não é um importador para os 56 milhões de assinantes: esta ferramenta prepara e confere arquivos de operadoras, em lotes limitados.

## Validação

```sh
npm run check
npm run build
npm test
```

Os testes cobrem KML/KMZ, campos extras, descrição HTML, múltiplas geometrias, anéis, dados inválidos, preservação de CEP, células de texto e endpoints. A suíte define `GEOCODING_DISABLED=1` no teste de Worker para não depender da base externa; a integração real foi validada separadamente com o arquivo de exemplo.

O teste de integração usa o código compilado e Workers reais; execute o build antes dos testes. `scripts/verify-ui.cjs` é um teste opcional de navegador e requer Playwright e Edge, com `PLAYWRIGHT_PATH` apontando para o pacote quando ele não está instalado no projeto. A execução visual não foi autorizada nesta sessão, portanto a aparência em navegador ainda precisa ser validada.

## Integração

`src/parser.ts` extrai os dados. `src/geocoder.ts` chama `scripts/geocode-reverse.R`, que usa o CNEFE pelo `geocodebr`. `src/model.ts` aplica a prioridade entre origem e endereço automático. `src/workbook.ts` produz o XLSX e `src/app.ts` expõe as rotas. A aplicação funciona independentemente do PostgreSQL.

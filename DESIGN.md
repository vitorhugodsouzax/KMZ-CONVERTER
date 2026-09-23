---
name: Conversor de cobertura
description: Interface clara para conferir arquivos de cobertura e exportar planilhas.
colors:
  primary: "#234b40"
  primary-hover: "#153d31"
  ink: "#243d35"
  muted: "#596860"
  background: "#f6f7f3"
  paper: "#ffffff"
  soft: "#eef2eb"
  line: "#d4dcd4"
  focus: "#648952"
typography:
  display:
    fontFamily: "Instrument, Segoe UI, sans-serif"
    fontSize: "clamp(36px, 4vw, 52px)"
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: "-.035em"
  headline:
    fontSize: "28px"
    fontWeight: 500
    letterSpacing: "-.02em"
  title:
    fontSize: "20px"
    fontWeight: 600
  body:
    fontFamily: "Instrument, Segoe UI, sans-serif"
    fontSize: "14px"
    lineHeight: 1.6
  label:
    fontSize: "14px"
    fontWeight: 600
rounded:
  control: "6px"
  inset: "8px"
  workspace: "14px"
spacing:
  small: "8px"
  medium: "16px"
  large: "24px"
  section: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    padding: "13px 22px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.primary}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  button-text:
    backgroundColor: "transparent"
    textColor: "{colors.primary}"
    padding: "10px 0"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "12px 14px"
  workspace:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.workspace}"
---

# Design System: Conversor de cobertura

## Overview

**Creative North Star: "Bancada de conferência"**

Papel claro, tinta verde-escura e divisórias finas sustentam uma ferramenta administrativa simples. Controles sólidos e tabela legível dão prioridade à conferência dos dados.

Este registro foi extraído de `public/style.css`, `public/index.html` e `web/app.ts`. **Revisão visual não verificada:** não houve execução em navegador nem inspeção de screenshots; o usuário recusou a abertura do servidor. Os comportamentos abaixo descrevem o código, não uma validação visual ou de tecnologia assistiva.

**Key Characteristics:**

- Superfícies claras e planas, com verde reservado a texto e ações.
- Hierarquia tipográfica contida e controles nativos reconhecíveis.
- Avisos explícitos e dados ausentes identificados por texto.

## Colors

A paleta combina verde profundo com branco e neutros levemente esverdeados. Os valores normativos estão no frontmatter.

### Primary

- **Verde profundo** (`primary`): ações principais e controles secundários; escurece no hover.
- **Verde de foco** (`focus`): contorno de navegação por teclado.

### Neutral

- **Tinta verde** (`ink`) e **tinta suave** (`muted`): texto principal e explicativo.
- **Papel claro** (`background`), **branco** (`paper`) e **verde suave** (`soft`): página, formulário e explicação lateral.
- **Linha vegetal** (`line`): bordas e divisórias.

Erros usam fundo pêssego e texto ferrugem; observações de qualidade usam verde suave. Mensagens textuais acompanham esses estados.

## Typography

**Display Font / Body Font:** Instrument Sans, registrado como `Instrument`, com Segoe UI e sans-serif como fallback. Fonte variável local em `/fonts/InstrumentSans.woff2`, pesos declarados de 400 a 700, `font-display: swap` e síntese desabilitada.

O título principal segue `display`; o título de resultado segue `headline`; títulos do formulário e explicação seguem `title`. A introdução usa corpo maior (16px, entrelinha 1.65); explicações seguem `body`, com até 65ch. Labels seguem `label`. A tabela usa texto compacto (13px), cabeçalhos menores (12px) e numerais tabulares. Não há fonte monoespaçada separada.

## Layout

Contêiner central de até 1280px. No desktop, cabeçalho de 84px, margens internas horizontais de 48px e início do conteúdo com 56px. A área de envio divide-se em formulário e explicação na proporção `minmax(0, 1.7fr) minmax(260px, 1fr)`. O mapeamento usa três colunas.

A tela segue envio em lote → leitura e busca CNEFE → prévia e correspondência dos campos → download. Resultados ficam ocultos até a leitura; não há histórico na interface. A tabela preserva suas colunas em uma região com rolagem horizontal, em vez de comprimir os dados.

- Até **800px**: cabeçalho de 72px, margens de 24px, formulário e explicação empilhados, mapeamento em duas colunas e cabeçalho dos resultados vertical.
- Até **480px**: margens de 20px, título principal de 38px, mapeamento em uma coluna, ações empilhadas e download com largura total.

## Elevation & Depth

Não há sombras. Bordas finas e mudanças de tom separam página, formulário, explicação e tabela. O resultado aparece com uma animação curta de recorte (250ms, ease-out), removida quando `prefers-reduced-motion` está ativo; a rolagem até o resultado também respeita essa preferência.

## Shapes

Controles têm cantos discretos (`control`); área de arquivo e tabela usam cantos intermediários (`inset`); o bloco de envio tem cantos mais abertos (`workspace`). Bordas são de 1px, com tracejado apenas na área de escolha de arquivo. Ícones são SVGs lineares inline, sem imagens raster decorativas.

## Components

### Buttons

Primário verde preenchido, com altura mínima de 48px. Secundário transparente com borda verde e hover suave. A ação de exemplo é textual e sublinhada. Durante requisições, os controles são desabilitados; botões ficam com opacidade de 55% e cursor de espera. O foco visível usa contorno de 3px com afastamento de 4px.

### Cards / Containers

O formulário ocupa uma superfície branca com borda, e a explicação ocupa uma superfície suave adjacente. Padding desktop de 32px/36px no formulário e 32px na explicação; reduzido nos breakpoints descritos acima.

### Inputs / Fields

Inputs e selects brancos, com borda verde-acinzentada, labels associados e borda mais escura no foco. O campo de operadora é obrigatório. A área de upload mantém um input nativo transparente sobre toda a superfície e evidencia `focus-within`; aceita escolha e arraste de até 20 arquivos. Limites por arquivo e por lote aparecem antes do envio, e o resumo lista os primeiros nomes selecionados.

### Navigation

Cabeçalho compacto com link de início e ícone decorativo oculto da árvore de acessibilidade. A indicação dos formatos desaparece até 800px. Não há navegação por abas nem menu.

### Preview / Mapping

Correspondência em `details` aberto por padrão, com selects rotulados. Alterações pedem atualização explícita da prévia; o download usa a seleção atual. Trocar arquivo ou editar a operadora invalida e oculta resultados anteriores. Avisos, contagem e quantidade de endereços CNEFE antecedem a tabela; campos ausentes aparecem como travessão. Arquivo de origem e distância até o endereço automático ficam visíveis na prévia para tornar lotes e aproximações auditáveis.

A página declara `pt-BR`, possui headings e regiões nomeadas, `role=status` para andamento, `role=alert` para erro e `aria-busy` no formulário. Após a leitura, o foco vai ao título dos resultados. Cabeçalhos da tabela têm `scope=col`, e sua região de rolagem é nomeada e alcançável por teclado. Contraste, leitura por leitor de tela e comportamento real nos breakpoints ainda precisam de verificação no navegador.

## Do's and Don'ts

### Do:

- **Do** preservar labels, foco visível, mensagens textuais e preferência por movimento reduzido.
- **Do** manter a tabela legível com rolagem horizontal e números tabulares.
- **Do** documentar alterações de tokens a partir do código implementado.

### Don't:

- **Don't** usar apenas cor para distinguir erro, ausência ou processamento.
- **Don't** descrever revisão visual ou acessibilidade como aprovadas sem verificação correspondente.

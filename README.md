# Cosmos Explorer — imagens da NASA por dia e por assunto

Protótipo funcional em Next.js para procurar uma **imagem do dia (APOD)** por data e,
quando a busca é por **palavra-chave**, pesquisar no acervo da **NASA Image Library**.
Nenhuma das duas APIs upstream exige chave hoje: tudo passa por rotas próprias com cache.

## Rodar localmente

Requisitos: Node 22+ (testado em v22.23.2) e npm.

```bash
npm install
npm run dev
```

Abra <http://localhost:3000>. Não é preciso configurar nada: o APOD agora vem de
`science.nasa.gov/wp-json/wp/v2/apod-basic`, que não exige `NASA_API_KEY` nem `DEMO_KEY`
(ver seção "Como funciona"). O arquivo `.env.example` ficou só por compatibilidade, caso
algum upstream volte a exigir chave no futuro.

```bash
npm run build && npm run start   # produção
npm run lint                     # ESLint (Next 16 não tem mais `next lint`)
npx tsc --noEmit                 # checagem de tipos
```

## Como funciona

```
navegador ──▶ /api/apod ──▶ science.nasa.gov/wp-json/wp/v2/apod-basic   (sem chave)
         └─▶ /api/search ──▶ images-api.nasa.gov/search                 (sem chave)
```

> Até 11/2026 o APOD usava `api.nasa.gov/planetary/apod` (com `NASA_API_KEY`/`DEMO_KEY`).
> A NASA migrou o APOD para o WordPress de `science.nasa.gov` e, na transição, aquele
> endpoint antigo ficou quebrado: devolvia `title: "NASA Science"` e uma URL de logo
> genérica para qualquer data, com ou sem chave própria — não era um problema de
> configuração do projeto. `src/lib/nasa.ts` foi migrado para a API nova (documentada no
> "APOD Feed And API User Guide" oficial), que não exige chave nenhuma.

- **Sem chave no servidor.** As duas APIs upstream (APOD e Image Library) são públicas e
  sem autenticação; o bundle do cliente só conhece `/api/...`.
- **Cache em duas camadas.** `Map` em memória + JSON em `.nasa-cache/` (gitignored).
  Entrada do dia: 10 min. Datas antigas: 24 h — poupa requisições e deixa a navegação
  instantânea ao voltar para um dia já visto.
- **Erros viram contrato.** Toda falha sai como
  `{ ok: false, error: { code, message, retryAfterSeconds } }`, e o cliente traduz para
  português (`RATE_LIMIT`, `DATE_OUT_OF_RANGE`, `QUERY_TOO_SHORT`, `UPSTREAM_ERROR`…).
  Validação local não gasta cota.
- **Normalização.** `toApodEntry` reduz o payload bruto (que vem em HTML — links,
  `<strong>`, `&nbsp;`) a um tipo estável em texto puro, resolve a forma incorporável de
  vídeo (que a API nova só expõe dentro do HTML da página legado) e trata a data em UTC
  (evita o "dia anterior" em fusos atrás de Greenwich).

## Rotas

```bash
curl "http://localhost:3000/api/apod?date=2026-09-25"
curl "http://localhost:3000/api/apod?start=2026-09-18&end=2026-09-25"
curl "http://localhost:3000/api/search?q=james+webb&mediaType=image&page=1&pageSize=24"
curl "http://localhost:3000/api/search?q=aurora&yearStart=2015&yearEnd=2020"
```

| Parâmetro | Rota | Observação |
| --- | --- | --- |
| `date` | `/api/apod` | um dia; `start`+`end` dão o intervalo |
| `start`, `end` | `/api/apod` | inclusivos; `start > end` → 400 |
| `q` | `/api/search` | mínimo 2 caracteres |
| `mediaType` | `/api/search` | `image` \| `video` \| `audio` |
| `page`, `pageSize` | `/api/search` | paginação usada pelo botão "Carregar mais" |
| `yearStart`, `yearEnd` | `/api/search` | filtro por ano de criação |

## Responsividade

Medido no navegador (iframes same-origin com o app real, comparando
`documentElement.scrollWidth` × `clientWidth`), nas duas abas e com resultados
carregados: **280, 320, 375, 414, 641, 768, 900 e 1280 px — scroll horizontal zero**.

O que sustenta isso:

- `width=device-width` no `<meta viewport>` (padrão do Next) e `themeColor` `#05060c`,
  para a barra de status do celular não abrir branca.
- Estrutura já fluida por natureza: grids com `minmax(0, …)`, `flex-wrap` em
  cabeçalho/controles/avisos/rodapé, mídia com `width: 100%` + `aspect-ratio`.
- `@media (max-width: 880px)`: o hero vira coluna única (imagem acima do texto).
- `@media (max-width: 640px)`: padding do container cai para 0,9 rem; abas ocupam a
  linha inteira; o primeiro campo dos controles (data / palavra-chave) fica em linha
  própria e os filtros curtos (tipo, de, até) vão em pares; botões, campos e abas com
  altura mínima de 44 px e os chips de atalho em 38 px; a explicação perde o scroll
  interno (`max-height: none`) — dentro de uma página que
  já rola, a caixa dupla é armadilha no toque; tira de miniaturas com colunas de 118 px.
- `.grid` usa `minmax(min(232px, 100%), 1fr)`: abaixo de ~272 px de conteúdo a coluna
  única encolhe em vez de estourar a tela.
- `.strip` tem `overscroll-behavior-x: contain` + scroll-snap, então arrastar a tira
  não empurra a página.
- `@media (hover: none)`: desliga o `translateY(-2px)` do card, que no toque ficava
  "grudado" depois de um tap.

Cantos que **não** precisam de breakpoint: a tira dos últimos dias passa do viewport de
propósito (é `overflow-x: auto`) e os chips de sugestão quebram linha sozinhos.

## Restrições da API que moldaram o projeto

Todas confirmadas contra a API real, não supostas:

1. **APOD não tem busca por palavra-chave.** Nem a API antiga nem a nova expõem isso
   (`concept_tags` do upstream antigo retornava `"functionality turned off"`). Por isso a
   busca textual vai para a Image Library, que é chaveless e tem CORS liberado — daí as
   duas abas.
2. **`per_page` do `apod-basic` tem teto de 25** (documentado). O app pede só a janela que
   realmente exibe (hoje + 7 dias anteriores), bem abaixo do limite.
3. **Imagem e vídeo vêm em campos diferentes.** Em `media_type: "image"`, a URL real está
   em `hdurl` (`url` virou o permalink do artigo). Em `media_type: "video"`, não há campo
   de mídia direto: o player (`<iframe>` do YouTube ou `<video><source>` auto-hospedado)
   vem embutido dentro de `basic_html`, e `hdurl` é só o pôster/thumbnail. O normalizador
   (`toApodEntry` + `extractVideoFromHtml` em `src/lib/nasa.ts`) faz essa extração com
   regex, sem precisar de um parser de HTML completo.
4. **`explanation` e `credit` chegam em HTML**, não texto puro (links, `<strong>`,
   entidades como `&nbsp;`/`&#8217;`). O normalizador decodifica entidades e remove tags
   antes de exibir, e tira o prefixo padrão ("Image Credit & Copyright:") do crédito.
5. **(Histórico, API antiga)** `api.nasa.gov/planetary/apod` com `DEMO_KEY` limitava a
   **10 requisições por IP com janela diária** (não "por hora" como sugeria a página de
   cadastro) — motivo original do cache em disco. Em 11/2026 esse endpoint passou a
   devolver um placeholder genérico (`title: "NASA Science"`) para qualquer data, com ou
   sem chave própria, o que forçou a migração para `science.nasa.gov/wp-json/wp/v2/
   apod-basic` (ver "Como funciona").

## Estrutura

```
src/
  app/
    page.tsx              cabeçalho + abas (Imagem do dia | Explorar acervo | Favoritos)
    layout.tsx            fontes (Geist) e metadados
    globals.css           design tokens, botões, campos, foco acessível
    page.module.css       layout das abas, calendário, favoritos
    api/apod/route.ts     proxy APOD (data ou intervalo)
    api/search/route.ts   proxy Image Library (palavra-chave)
  components/
    ApodPanel.tsx         busca por data, hero, tira dos últimos dias, calendário
    LibraryPanel.tsx      busca por palavra-chave, filtros e paginação
    FavoritesPanel.tsx    lista de favoritos salvos no navegador
    FavoriteButton.tsx    botão de estrela (☆/★) reutilizável
    FavoritesContext.tsx   provider + hook useFavorites()
    CalendarView.tsx      grid mensal para navegar o acervo por mês
    Notice.tsx            avisos de erro/cota
  lib/
    nasa.ts               cache, fetch de upstream (science.nasa.gov + images-api), normalização
    api.ts                camada de fetch do cliente + mensagens em pt-BR
    dates.ts              aritmética de datas ISO (sem fuso)
    favorites.ts          tipos e helpers de localStorage para favoritos
    http.ts               NasaError → resposta JSON padronizada
  lib/__tests__/
    dates.test.ts         14 testes para dates.ts
    nasa.test.ts          19 testes para nasa.ts (videoPlayers, opt, cacheKey)
```

## Funcionalidades

- **Imagem do dia (APOD):** busca por data com cache, player de vídeo incorporável
  (YouTube, Vimeo, mp4), tira dos últimos dias e calendário mensal para navegar o acervo.
- **Explorar acervo (Image Library):** busca por palavra-chave com paginação
  (24 → 48 resultados), filtros de tipo/ano e sugestões de busca.
- **Favoritos:** clique na estrela (☆) de qualquer imagem para salvar no navegador
  (localStorage). A aba "Favoritos" lista todos os salvos, com opção de remover
  individualmente ou limpar tudo.
- **Imagens otimizadas:** `next/image` com `remotePatterns` para domínios da NASA,
  `fill` com `sizes` responsivo e prioridade no hero.
- **Testes:** 33 testes de unidade com Vitest (`npm run test:run`).
- **Responsivo:** layout fluido de 280 a 1280+ px, zero scroll horizontal, alvos de
  toque ≥ 44 px.

## Estado atual

Funcionando e validado no navegador: todas as funcionalidades acima, `tsc` limpo,
ESLint com 0 erros, `next build` ok, 33 testes passando.

Pronto para deploy no Vercel.

## Dados e créditos

Imagens e textos: [NASA APOD](https://apod.nasa.gov/) e
[NASA Image Library](https://images.nasa.gov/). Conteúdo da NASA é, em geral, de
domínio público — mas cada entrada exibe o crédito informado pela própria agência,
e os links para a página original estão no hero.

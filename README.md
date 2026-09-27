# Cosmos Explorer — imagens da NASA por dia e por assunto

Protótipo funcional em Next.js para procurar uma **imagem do dia (APOD)** por data e,
quando a busca é por **palavra-chave**, pesquisar no acervo da **NASA Image Library**.
A chave da API nunca chega ao navegador: tudo passa por rotas próprias com cache.

## Rodar localmente

Requisitos: Node 22+ (testado em v22.23.2) e npm.

```bash
npm install
cp .env.example .env.local   # cole sua chave em NASA_API_KEY=
npm run dev
```

Abra <http://localhost:3000>. Sem `.env.local` o app cai na `DEMO_KEY` da NASA, que é
limitada a **10 requisições por IP** — a interface avisa quando isso acontece.
A aba "Explorar acervo" não depende de chave nenhuma.

> Se a aba "Imagem do dia" abrir com o aviso `RATE_LIMIT`, a cota da `DEMO_KEY` deste IP
> já estourou (ela libera no dia seguinte, não uma hora depois). É exatamente o caso de
> usar uma chave própria: o cadastro em <https://api.nasa.gov/> é gratuito e instantâneo.

Chave gratuita e instantânea em <https://api.nasa.gov/>.

```bash
npm run build && npm run start   # produção
npm run lint                     # ESLint (Next 16 não tem mais `next lint`)
npx tsc --noEmit                 # checagem de tipos
```

## Como funciona

```
navegador ──▶ /api/apod ──▶ api.nasa.gov/planetary/apod      (com NASA_API_KEY)
         └─▶ /api/search ──▶ images-api.nasa.gov/search      (sem chave)
```

- **Chave no servidor.** `src/lib/nasa.ts` lê `process.env.NASA_API_KEY` e monta a URL
  de upstream; o bundle do cliente só conhece `/api/...`.
- **Cache em duas camadas.** `Map` em memória + JSON em `.nasa-cache/` (gitignored).
  Entrada do dia: 10 min. Datas antigas: 24 h. Isso é o que torna o DEMO_KEY utilizável.
- **Erros viram contrato.** Toda falha sai como
  `{ ok: false, error: { code, message, retryAfterSeconds } }`, e o cliente traduz para
  português (`RATE_LIMIT`, `DATE_OUT_OF_RANGE`, `QUERY_TOO_SHORT`, `UPSTREAM_ERROR`…).
  Validação local não gasta cota.
- **Normalização.** `toApodEntry` reduz o payload bruto a um tipo estável, resolve a
  forma incorporável de vídeo e trata a data em UTC (evita o "dia anterior" em fusos
  atrás de Greenwich).

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

1. **APOD não tem busca por palavra-chave.** `concept_tags` retorna
   `"functionality turned off"`. Por isso a busca textual vai para a Image Library,
   que é chaveless e tem CORS liberado — daí as duas abas.
2. **`start_date`/`end_date` + `count` retorna 400** (`invalid field combination passed`),
   em qualquer valor de `count`. Já intervalos longos funcionam: um de 30 dias voltou com
   os 30 itens, sem truncamento — o teto de 12 itens da doc não se aplica. O app pede a
   janela que realmente exibe (hoje + 7 dias anteriores) para não gastar cota à toa.
3. **DEMO_KEY = 10 req por IP, com janela diária.** Confirmado com 429 reais: header
   `X-Ratelimit-Limit: 10` e `retryAfterSeconds` de ~80 000 s, apontando sempre para a
   mesma meia-noite UTC — não "por hora" como sugere a página de cadastro. É o motivo do
   proxy com cache e de recomendar uma chave própria.
4. **Vídeo do APOD vem de três formas diferentes**, todas vistas na API real: arquivo
   `.mp4` direto, YouTube já em `/embed/…` e YouTube na forma `/watch…` — esta última
   recusa `<iframe>` e fica em branco sem tratamento. O normalizador escolhe `<video>`
   quando há arquivo, converte YouTube/Vimeo para player incorporável
   (`youtube-nocookie.com/embed/…`, `player.vimeo.com/video/…`) e só então cai em link.
5. **`thumbnail_url` vem vazio (`""`), não ausente**, em boa parte das entradas — inclusive
   em vídeos com `thumbs=true`. O normalizador converte `""` em `undefined`, e a tira de
   miniaturas usa `thumbnailUrl ?? url` e aceita item sem imagem.

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
    nasa.ts               chave, cache, fetch de upstream, normalização
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

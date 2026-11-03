import { promises as fs } from "node:fs";
import path from "node:path";
import { APOD_FIRST_DATE, isIsoDate, shiftDays, todayIso } from "@/lib/dates";

/**
 * Camada de acesso às APIs da NASA.
 *
 * Fatos verificados contra a API real em 26/09/2026 (não contra a documentação):
 *  - `concept_tags` está desligado no servidor -> não há busca por texto no APOD.
 *  - `count` retorna 400 quando combinado com start_date/end_date.
 *  - DEMO_KEY permite 10 requisições/hora por IP (429 + X-Ratelimit-Limit: 10).
 *  - Requisição sem api_key falha com API_KEY_MISSING.
 *  - Limite de datas do APOD validado pelo servidor: 16/06/1995 até hoje.
 *  - images-api.nasa.gov responde CORS `*`, total_hits e links prev/next em http://.
 *
 * ATUALIZAÇÃO (02/11/2026): a NASA migrou o APOD para o WordPress de
 * science.nasa.gov e, na transição, `api.nasa.gov/planetary/apod` ficou quebrado —
 * devolve `title: "NASA Science"` e uma URL de logo genérica para qualquer data,
 * com ou sem chave própria. Isso não tinha nada a ver com NASA_API_KEY.
 * Trocamos para a API nova (ver PDF oficial "APOD Feed And API User Guide"):
 *  - Base: https://science.nasa.gov/wp-json/wp/v2/apod-basic — SEM chave.
 *  - Um dia: `/apod-basic/{YYMMDD}` (código de data legado, ex. 261102). Devolve
 *    objeto único; 404 com `{code:"apod_basic_not_found"}` se não existir.
 *  - Intervalo: `?date_from={YYMMDD}&date_to={YYMMDD}&per_page=25`. Devolve array,
 *    mais recente primeiro. `per_page` tem teto de 25 (documentado).
 *  - Para imagem: a URL de exibição é `hdurl` (`url` virou o permalink do artigo).
 *  - Para vídeo: não há campo de URL de mídia direto — o `<video><source src=...>`
 *    ou `<iframe src=...>` (YouTube) vêm dentro de `basic_html`; `hdurl` é só o
 *    pôster/thumbnail. `url` (permalink) vira o link "assistir na fonte".
 *  - `explanation`/`credit` vêm como HTML (links, `<strong>`, `&nbsp;` etc.).
 *
 * Por isso este módulo tem cache próprio, persistente em disco: reiniciar o dev
 * server não pode queimar a cota de novo.
 */

const APOD_BASE = "https://science.nasa.gov/wp-json/wp/v2/apod-basic";
const LIBRARY_URL = "https://images-api.nasa.gov/search";

export type ApodEntry = {
  date: string;
  title: string;
  explanation: string;
  mediaType: "image" | "video" | "other";
  url: string;
  hdUrl?: string;
  thumbnailUrl?: string;
  /** YouTube/Vimeo na forma incorporável — o APOD devolve a página /watch, que recusa iframe. */
  embedUrl?: string;
  /** Arquivo .mp4/.webm direto (campo `preview_url`), para tocar em <video>. */
  videoSrc?: string;
  copyright: string[];
};

export type LibraryHit = {
  nasaId: string;
  title: string;
  description: string;
  dateCreated: string;
  center: string;
  keywords: string[];
  imageUrl: string;
  previewUrl?: string;
  assetHref: string;
};

export type LibraryResult = {
  hits: LibraryHit[];
  totalHits: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
};

/** Erro de montante (NASA) ou de entrada, com status HTTP para o route handler. */
export class NasaError extends Error {
  constructor(
    message: string,
    readonly status = 502,
    readonly code = "UPSTREAM_ERROR",
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "NasaError";
  }
}

export type UpstreamMeta = {
  cache: "hit" | "miss" | "skip";
  usingDemoKey: boolean;
  keyConfigured: boolean;
};

/* ------------------------------------------------------------------ cache */

type CacheRecord = { expiresAt: number; value: unknown };

const memory = new Map<string, CacheRecord>();
const CACHE_DIR = path.join(process.cwd(), ".nasa-cache");

function cacheKey(parts: Record<string, string | number | undefined>): string {
  return Object.entries(parts)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${v}`)
    .join("_")
    .replace(/[^a-zA-Z0-9=._-]/g, "");
}

export { cacheKey };

async function cacheRead(key: string): Promise<CacheRecord | null> {
  const inMemory = memory.get(key);
  if (inMemory && inMemory.expiresAt > Date.now()) return inMemory;

  try {
    const raw = await fs.readFile(path.join(CACHE_DIR, `${key}.json`), "utf8");
    const parsed = JSON.parse(raw) as CacheRecord;
    if (parsed.expiresAt > Date.now()) {
      memory.set(key, parsed);
      return parsed;
    }
  } catch {
    // sem cache ainda, ou arquivo ilegível: segue para a API
  }
  return null;
}

async function cacheWrite(key: string, value: unknown, ttlSeconds: number) {
  const record: CacheRecord = { value, expiresAt: Date.now() + ttlSeconds * 1000 };
  memory.set(key, record);
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(path.join(CACHE_DIR, `${key}.json`), JSON.stringify(record));
  } catch {
    // cache em disco é melhoria, não requisito
  }
}

/* ------------------------------------------------------------- helpers de fetch */

async function fetchJson(url: string, label: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
  } catch {
    throw new NasaError(`Falha de rede ao consultar ${label}.`, 504, "NETWORK");
  }

  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new NasaError(`Resposta não-JSON de ${label} (HTTP ${res.status}).`, 502, "BAD_JSON");
  }

  if (!res.ok) {
    // Dois formatos de erro convivem: o antigo `{error:{code,message}}` / `{msg}`
    // da api.nasa.gov, e o novo REST do WordPress `{code,message,data:{status}}`.
    const err =
      (body as {
        error?: { code?: string; message?: string };
        msg?: string;
        code?: string;
        message?: string;
      }) ?? {};
    const message = err.error?.message ?? err.message ?? err.msg ?? `HTTP ${res.status} de ${label}.`;
    const code =
      res.status === 429
        ? "RATE_LIMIT"
        : (err.error?.code ?? err.code ?? (res.status === 400 ? "BAD_REQUEST" : "UPSTREAM_ERROR"));
    const retryAfter = Number(res.headers.get("retry-after")) || undefined;
    throw new NasaError(message, res.status === 429 ? 429 : 502, code, retryAfter);
  }
  return body;
}

/* ------------------------------------------------------------ normalização APOD */

function splitCopyright(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  return raw
    .split(/[;\n]/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** Decodifica entidades HTML comuns (numéricas e nomeadas) sem precisar de um DOM. */
function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'");
}

/** A API nova devolve `explanation`/`credit` como HTML; o app exibe texto puro. */
function stripHtml(html?: string): string {
  if (!html) return "";
  const withoutTags = html.replace(/<[^>]*>/g, " ");
  return decodeEntities(withoutTags).replace(/\s+/g, " ").trim();
}

/** Limpa o prefixo padrão ("Image Credit & Copyright:") e separa autores. */
function cleanCredit(raw?: string): string[] {
  const text = stripHtml(raw)
    .replace(/^image\s*credit\s*(?:&|and)?\s*copyright\s*:?\s*/i, "")
    .replace(/^image\s*credit\s*:?\s*/i, "")
    .replace(/^copyright\s*:?\s*/i, "")
    .trim();
  return splitCopyright(text);
}

/** `YYYY-MM-DD` -> código de data legado do APOD (`YYMMDD`), usado nas novas rotas. */
function toLegacyApodCode(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${y.slice(-2)}${m}${d}`;
}

const YOUTUBE_ID = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{6,})/i;
const VIMEO_ID = /vimeo\.com\/(?:video\/)?(\d+)/i;
const VIDEO_FILE = /\.(mp4|webm|mov|m4v)(\?.*)?$/i;

/** Converte a URL do APOD em algo que o navegador consegue embutir. */
export function videoPlayers(url: string): { embedUrl?: string; videoSrc?: string } {
  if (!url) return {};
  const youtube = YOUTUBE_ID.exec(url);
  if (youtube) return { embedUrl: `https://www.youtube-nocookie.com/embed/${youtube[1]}?rel=0` };
  const vimeo = VIMEO_ID.exec(url);
  if (vimeo) return { embedUrl: `https://player.vimeo.com/video/${vimeo[1]}` };
  if (VIDEO_FILE.test(url)) return { videoSrc: url };
  return {};
}

/** Campo opcional: a NASA devolve `""` em vez de omitir. */
export function opt(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * APOD em vídeo não traz URL de mídia num campo próprio: o player (`<iframe>` do
 * YouTube ou `<video><source>` auto-hospedado) vem embutido no `basic_html`.
 */
function extractVideoFromHtml(html?: string): { embedUrl?: string; videoSrc?: string } {
  if (!html) return {};
  const iframeMatch = /<iframe[^>]*\ssrc="([^"]+)"/i.exec(html);
  if (iframeMatch) {
    const raw = iframeMatch[1];
    const normalized = raw.startsWith("//") ? `https:${raw}` : raw;
    const players = videoPlayers(normalized);
    return { embedUrl: players.embedUrl ?? normalized };
  }
  const sourceMatch = /<source[^>]*\ssrc="([^"]+\.(?:mp4|webm|mov|m4v))"/i.exec(html);
  if (sourceMatch) return { videoSrc: sourceMatch[1] };
  return {};
}

type RawApod = {
  date?: string;
  title?: string;
  explanation?: string;
  media_type?: string;
  /** Permalink do artigo em science.nasa.gov — NÃO é a imagem (ver `hdurl`). */
  url?: string;
  /** Imagem cheia (quando `media_type` é `image`) ou pôster (quando é `video`). */
  hdurl?: string;
  /** HTML completo da página legado; único lugar com o player de vídeo. */
  basic_html?: string;
  credit?: string;
  copyright?: string;
};

function toApodEntry(raw: RawApod): ApodEntry {
  const media = raw.media_type === "video" ? "video" : raw.media_type === "image" ? "image" : "other";
  const explanation = stripHtml(raw.explanation).replace(/^explanation:\s*/i, "").trim();
  const copyright = cleanCredit(raw.credit ?? raw.copyright);
  const poster = opt(raw.hdurl);
  const date = raw.date ?? "";
  const title = raw.title?.trim() || "Sem título";

  if (media === "video") {
    const players = extractVideoFromHtml(raw.basic_html);
    return {
      date,
      title,
      explanation,
      mediaType: media,
      // Sem foto única para vídeo: `url` vira o permalink, usado como "assistir na fonte".
      url: raw.url ?? "",
      hdUrl: poster,
      thumbnailUrl: poster,
      embedUrl: players.embedUrl,
      videoSrc: players.videoSrc,
      copyright,
    };
  }

  return {
    date,
    title,
    explanation,
    mediaType: media,
    url: poster ?? raw.url ?? "",
    hdUrl: poster,
    thumbnailUrl: poster,
    copyright,
  };
}

/* ------------------------------------------------------------- API pública APOD */

/** Um dia específico. Aceita `YYYY-MM-DD`; datas fora do intervalo da NASA viram BAD_REQUEST. */
export async function getApodByDate(date: string): Promise<{ entry: ApodEntry; meta: UpstreamMeta }> {
  const ttl = date === todayIso() ? 600 : 86_400;
  const ck = cacheKey({ apod: date });

  const cached = await cacheRead(ck);
  if (cached) {
    return { entry: toApodEntry(cached.value as RawApod), meta: { cache: "hit", usingDemoKey: false, keyConfigured: true } };
  }

  const url = `${APOD_BASE}/${toLegacyApodCode(date)}`;
  const body = await fetchJson(url, "APOD");
  const entry = toApodEntry(body as RawApod);
  await cacheWrite(ck, body, ttl);
  return { entry, meta: { cache: "miss", usingDemoKey: false, keyConfigured: true } };
}

/** Intervalo inclusivo. `per_page` tem teto documentado de 25 resultados. */
export async function getApodRange(
  start: string,
  end: string,
): Promise<{ entries: ApodEntry[]; meta: UpstreamMeta }> {
  const ck = cacheKey({ apodRange: `${start}_${end}` });

  const cached = await cacheRead(ck);
  if (cached) {
    const entries = (cached.value as RawApod[]).map(toApodEntry);
    return { entries, meta: { cache: "hit", usingDemoKey: false, keyConfigured: true } };
  }

  const params = new URLSearchParams({
    date_from: toLegacyApodCode(start),
    date_to: toLegacyApodCode(end),
    per_page: "25",
  });
  const body = await fetchJson(`${APOD_BASE}?${params.toString()}`, "APOD");
  const rawList = Array.isArray(body) ? body : [body as RawApod];
  const entries = rawList.map(toApodEntry).sort((a, b) => a.date.localeCompare(b.date));
  await cacheWrite(ck, rawList, end === todayIso() ? 600 : 86_400);
  return { entries, meta: { cache: "miss", usingDemoKey: false, keyConfigured: true } };
}

/* ------------------------------------------------------------ normalização Library */

type RawRenderLink = {
  href?: string;
  rel?: string;
  render?: string;
  width?: number;
  height?: number;
};

type RawLibraryItem = {
  href?: string;
  data?: Array<{
    nasa_id?: string;
    title?: string;
    description?: string;
    date_created?: string;
    center?: string;
    keywords?: string[];
    media_type?: string;
  }>;
  links?: RawRenderLink[];
};

function https(url?: string): string | undefined {
  // A Image Library devolve links em http://; misturar com página em https quebra.
  return url?.replace(/^http:\/\//i, "https://");
}

function pickImage(links: RawRenderLink[], preference: "large" | "small"): string | undefined {
  const images = links.filter((l) => l.render === "image" && l.href);
  if (images.length === 0) return undefined;
  const named = (marker: string) => images.find((l) => l.href?.includes(marker));
  const order =
    preference === "large"
      ? ["~large.jpg", "~medium.jpg", "~small.jpg", "~thumb.jpg"]
      : ["~thumb.jpg", "~small.jpg", "~medium.jpg", "~large.jpg"];
  for (const marker of order) {
    const found = named(marker);
    if (found?.href) return https(found.href);
  }
  return https(images[0]?.href);
}

function toLibraryHit(item: RawLibraryItem): LibraryHit | null {
  const data = item.data?.[0];
  if (!data?.nasa_id) return null;
  const links = item.links ?? [];
  const imageUrl = pickImage(links, "large") ?? pickImage(links, "small");
  if (!imageUrl) return null;
  return {
    nasaId: data.nasa_id,
    title: data.title?.trim() || "Sem título",
    description: data.description?.trim() ?? "",
    dateCreated: data.date_created ?? "",
    center: data.center ?? "",
    keywords: (data.keywords ?? []).filter(Boolean).slice(0, 6),
    imageUrl,
    previewUrl: https(links.find((l) => l.rel === "preview")?.href) ?? pickImage(links, "small"),
    assetHref: https(item.href) ?? "",
  };
}

/* -------------------------------------------------------------- API pública Library */

export type LibraryQuery = {
  q: string;
  page?: number;
  pageSize?: number;
  mediaType?: string;
  yearStart?: number;
  yearEnd?: number;
};

export async function searchLibrary(
  query: LibraryQuery,
): Promise<{ result: LibraryResult; meta: UpstreamMeta }> {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, query.pageSize ?? 24));
  const ck = cacheKey({
    search: query.q.toLowerCase(),
    page,
    size: pageSize,
    type: query.mediaType,
    y0: query.yearStart,
    y1: query.yearEnd,
  });

  const meta: UpstreamMeta = { cache: "miss", usingDemoKey: false, keyConfigured: true };

  const cached = await cacheRead(ck);
  if (cached) {
    return { result: cached.value as LibraryResult, meta: { ...meta, cache: "hit" } };
  }

  const params = new URLSearchParams({
    q: query.q,
    page: String(page),
    page_size: String(pageSize),
  });
  if (query.mediaType && query.mediaType !== "all") params.set("media_type", query.mediaType);
  if (query.yearStart) params.set("year_start", String(query.yearStart));
  if (query.yearEnd) params.set("year_end", String(query.yearEnd));

  const body = (await fetchJson(`${LIBRARY_URL}?${params.toString()}`, "Image Library")) as {
    collection?: {
      items?: RawLibraryItem[];
      metadata?: { total_hits?: number };
      links?: Array<{ rel?: string; href?: string }>;
    };
  };

  const collection = body.collection;
  if (!collection) throw new NasaError("Image Library não devolveu `collection`.", 502, "BAD_SHAPE");

  const hits = (collection.items ?? [])
    .map(toLibraryHit)
    .filter((h): h is LibraryHit => h !== null);

  const totalHits = collection.metadata?.total_hits ?? hits.length;
  const pageSizeEffective = hits.length || pageSize;
  const result: LibraryResult = {
    hits,
    totalHits,
    page,
    pageSize,
    hasNext: page * pageSizeEffective < totalHits,
  };

  await cacheWrite(ck, result, 600);
  return { result, meta };
}

/* ------------------------------------------------------------------------ datas */

export { APOD_FIRST_DATE, shiftDays, todayIso };

/** Valida no servidor antes de gastar cota: a NASA já rejeita fora do intervalo dela. */
export function assertApodDate(value: string, field = "date"): string {
  if (!isIsoDate(value)) {
    throw new NasaError(`Parâmetro \`${field}\` precisa estar em YYYY-MM-DD.`, 400, "BAD_REQUEST");
  }
  const today = todayIso();
  if (value < APOD_FIRST_DATE || value > today) {
    throw new NasaError(
      `Data fora do acervo APOD. Use entre ${APOD_FIRST_DATE} e ${today}.`,
      400,
      "DATE_OUT_OF_RANGE",
    );
  }
  return value;
}

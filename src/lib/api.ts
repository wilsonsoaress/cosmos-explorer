import type { ApodEntry, LibraryResult, UpstreamMeta } from "@/lib/nasa";

/** Cliente de leitura compartilhado pelos painéis. Livre de imports de Node. */

export type Limits = { firstDate: string; lastDate: string };

export type ApodSingleResponse = { ok: true; kind: "single"; entry: ApodEntry; meta: UpstreamMeta; limits: Limits };
export type ApodRangeResponse = { ok: true; kind: "range"; entries: ApodEntry[]; meta: UpstreamMeta; limits: Limits };
export type SearchResponse = {
  ok: true;
  query: string;
  mediaType: string;
  result: LibraryResult;
  meta: UpstreamMeta;
};
export type ApiFailure = {
  ok: false;
  error: { code: string; message: string; retryAfterSeconds?: number };
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function isFailure(body: unknown): body is ApiFailure {
  return (
    typeof body === "object" &&
    body !== null &&
    (body as { ok?: unknown }).ok === false &&
    Boolean((body as { error?: unknown }).error)
  );
}

async function request<T>(url: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { signal });
  } catch (error) {
    if ((error as DOMException)?.name === "AbortError") throw error;
    throw new ApiError("Sem conexão com o servidor desta aplicação.", "OFFLINE", 0);
  }

  const body: unknown = await res.json().catch(() => null);
  if (body === null || body === undefined) {
    throw new ApiError("Resposta ilegível do servidor.", "NO_BODY", res.status);
  }
  if (isFailure(body)) {
    throw new ApiError(
      body.error.message || "A NASA recusou a requisição.",
      body.error.code || "UPSTREAM",
      res.status,
      body.error.retryAfterSeconds,
    );
  }
  return body as T;
}

export function fetchApodByDate(date: string, signal?: AbortSignal) {
  return request<ApodSingleResponse>(`/api/apod?date=${encodeURIComponent(date)}`, signal);
}

export function fetchApodRange(start: string, end: string, signal?: AbortSignal) {
  return request<ApodRangeResponse>(
    `/api/apod?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
    signal,
  );
}

export type SearchParams = {
  q: string;
  page?: number;
  pageSize?: number;
  mediaType?: string;
  yearStart?: number;
  yearEnd?: number;
};

export function fetchSearch(params: SearchParams, signal?: AbortSignal) {
  const sp = new URLSearchParams({ q: params.q });
  if (params.page) sp.set("page", String(params.page));
  if (params.pageSize) sp.set("pageSize", String(params.pageSize));
  if (params.mediaType && params.mediaType !== "all") sp.set("mediaType", params.mediaType);
  if (params.yearStart) sp.set("yearStart", String(params.yearStart));
  if (params.yearEnd) sp.set("yearEnd", String(params.yearEnd));
  return request<SearchResponse>(`/api/search?${sp.toString()}`, signal);
}

/** Texto amigável por código de erro, incluindo os limites reais da NASA. */
export function describeError(error: unknown): { message: string; code: string } {
  if (error instanceof ApiError) {
    if (error.code === "RATE_LIMIT") {
      // A NASA devolve quantos segundos faltam; abaixo de 90 min soa melhor em minutos.
      const secs = error.retryAfterSeconds ?? 0;
      const wait = secs > 0 ? ` Aguarde ~${secs >= 5400 ? `${Math.ceil(secs / 3600)} h` : `${Math.ceil(secs / 60)} min`}.` : "";
      return {
        code: error.code,
        message: `A NASA limitou as requisições desta chave (o DEMO_KEY só permite 10 por IP, e a janela não vira a cada hora).${wait} Configure NASA_API_KEY no .env.local para liberar a cota.`,
      };
    }
    if (error.code === "API_KEY_MISSING") {
      return {
        code: error.code,
        message: "Nenhuma NASA_API_KEY configurada. Gere uma grátis em api.nasa.gov e salve em .env.local.",
      };
    }
    if (error.code === "DATE_OUT_OF_RANGE") {
      return { code: error.code, message: error.message };
    }
    if (error.code === "QUERY_TOO_SHORT") {
      return { code: error.code, message: error.message };
    }
    return { code: error.code, message: error.message };
  }
  return { code: "UNKNOWN", message: "Não foi possível carregar agora." };
}

export function formatPtDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  // timeZone UTC evita o dia "anterior" em fusos atrás de Greenwich.
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatLibraryDate(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

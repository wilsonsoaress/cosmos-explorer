/**
 * Favoritos persistidos no navegador (localStorage).
 *
 * Dois tipos de item podem virar favorito:
 *  - entradas do APOD (key = `apod:<date>`)
 *  - resultados da Image Library (key = `lib:<nasaId>`)
 *
 * O formato é um JSON array ordenado por inclusão (mais recente primeiro).
 * Não há login nem sincronização: é só para o navegador de quem clicou na estrela.
 */

export type FavoriteKind = "apod" | "library";

export type FavoriteItem = {
  /** Chave única: `apod:2026-09-27` ou `lib:helix-nebula-123`. */
  key: string;
  kind: FavoriteKind;
  title: string;
  /** Data ISO (APOD) ou string vazia (Library). */
  date?: string;
  /** URL da imagem de preview. */
  imageUrl: string;
  /** URL da imagem em alta (APOD hdUrl) ou original (Library imageUrl). */
  detailUrl?: string;
  /** Texto de apoio — explicação do APOD ou descrição da Library. */
  description?: string;
  /** Créditos (APOD) ou centro (Library). */
  credit?: string;
  /** Para APOD vídeo: URL incorporável. */
  embedUrl?: string;
  /** Para APOD vídeo: arquivo direto. */
  videoSrc?: string;
  /** Para APOD: tipo de mídia. */
  mediaType?: "image" | "video" | "other";
  /** Para Library: NASA ID. */
  nasaId?: string;
  addedAt: number;
};

const STORAGE_KEY = "cosmos-explorer:favorites";
const MAX_FAVORITES = 200;

export function readFavorites(): FavoriteItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item: unknown): item is FavoriteItem =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as FavoriteItem).key === "string" &&
        typeof (item as FavoriteItem).kind === "string",
    );
  } catch {
    return [];
  }
}

export function writeFavorites(items: FavoriteItem[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_FAVORITES)));
  } catch {
    // localStorage cheio ou bloqueado: o favorito continua na sessão, mas não persiste.
  }
}

export function makeApodKey(date: string): string {
  return `apod:${date}`;
}

export function makeLibraryKey(nasaId: string): string {
  return `lib:${nasaId}`;
}

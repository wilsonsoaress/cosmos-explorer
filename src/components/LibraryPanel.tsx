"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { LibraryHit } from "@/lib/nasa";
import { describeError, fetchSearch, formatLibraryDate } from "@/lib/api";
import { APOD_FIRST_DATE, todayIso } from "@/lib/dates";
import { Notice } from "@/components/Notice";
import { FavoriteButton } from "@/components/FavoriteButton";
import { makeLibraryKey } from "@/components/FavoritesContext";
import styles from "@/app/page.module.css";

const SUGGESTIONS = [
  "James Webb",
  "Helix Nebula",
  "Mars surface",
  "Aurora",
  "Saturn rings",
  "Andromeda",
  "Eclipse",
  "Apollo",
];

const PAGE_SIZE = 24;
const EARLIEST_YEAR = Number(APOD_FIRST_DATE.slice(0, 4));
const LATEST_YEAR = Number(todayIso().slice(0, 4));

type SearchRequest = {
  q: string;
  page: number;
  mediaType: string;
  yearStart?: number;
  yearEnd?: number;
};

export function LibraryPanel() {
  const [term, setTerm] = useState("");
  const [mediaType, setMediaType] = useState("image");
  const [yearStart, setYearStart] = useState("");
  const [yearEnd, setYearEnd] = useState("");

  const [request, setRequest] = useState<SearchRequest | null>(null);
  const [hits, setHits] = useState<LibraryHit[]>([]);
  const [total, setTotal] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; code: string } | null>(null);
  const [searched, setSearched] = useState("");
  const gridRef = useRef<HTMLDivElement>(null);

  const search = (q: string, page = 1) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setError({ message: "Digite ao menos 2 caracteres.", code: "QUERY_TOO_SHORT" });
      return;
    }
    setError(null);
    setLoading(true);
    if (page === 1) setHits([]);
    setRequest({
      q: trimmed,
      page,
      mediaType,
      yearStart: Number(yearStart) || undefined,
      yearEnd: Number(yearEnd) || undefined,
    });
  };

  useEffect(() => {
    if (!request) return;
    const controller = new AbortController();
    let active = true;

    fetchSearch({ ...request, pageSize: PAGE_SIZE }, controller.signal)
      .then((res) => {
        if (!active) return;
        setHits((prev) => (request.page === 1 ? res.result.hits : [...prev, ...res.result.hits]));
        setTotal(res.result.totalHits);
        setHasNext(res.result.hasNext);
        setSearched(request.q);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!active || (err as DOMException)?.name === "AbortError") return;
        setError(describeError(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [request]);

  return (
    <div className={styles.panel}>
      <form
        className={styles.controls}
        onSubmit={(event) => {
          event.preventDefault();
          search(term, 1);
        }}
      >
        <div className={`${styles.field} ${styles.grow}`}>
          <span className={styles.fieldLabel}>Palavra-chave</span>
          <input
            type="text"
            className={styles.grow}
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="ex.: nebula, iss, jupiter, perseverance"
            aria-label="Palavra-chave da busca"
          />
        </div>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Tipo</span>
          <select
            className={styles.select}
            value={mediaType}
            onChange={(event) => setMediaType(event.target.value)}
            aria-label="Filtrar por tipo de mídia"
          >
            <option value="image">imagem</option>
            <option value="video">vídeo</option>
            <option value="audio">áudio</option>
            <option value="all">todos</option>
          </select>
        </div>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>De</span>
          <input
            type="number"
            className={styles.num}
            value={yearStart}
            min={EARLIEST_YEAR}
            max={LATEST_YEAR}
            placeholder={String(EARLIEST_YEAR)}
            onChange={(event) => setYearStart(event.target.value)}
            aria-label="Ano inicial"
          />
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Até</span>
          <input
            type="number"
            className={styles.num}
            value={yearEnd}
            min={EARLIEST_YEAR}
            max={LATEST_YEAR}
            placeholder={String(LATEST_YEAR)}
            onChange={(event) => setYearEnd(event.target.value)}
            aria-label="Ano final"
          />
        </div>

        <button type="submit" className={styles.primary} disabled={loading}>
          {loading ? "Buscando…" : "Buscar"}
        </button>
      </form>

      <div className={styles.chips}>
        <span className={styles.fieldLabel}>Sugestões:</span>
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            className={styles.chip}
            onClick={() => {
              setTerm(suggestion);
              search(suggestion, 1);
            }}
          >
            {suggestion}
          </button>
        ))}
      </div>

      {error ? (
        <Notice tone="error" code={error.code}>
          {error.message}
        </Notice>
      ) : null}

      {!request && !error ? (
        <div className={styles.empty}>
          Busca por palavra-chave usa a NASA Image Library — o APOD não oferece esse recurso, porque
          o parâmetro <code>concept_tags</code> está desligado no servidor da NASA.
        </div>
      ) : null}

      {request ? (
        <div className={styles.resultMeta}>
          <span>
            {total > 0
              ? `${total.toLocaleString("pt-BR")} resultados para “${searched}” · mostrando ${hits.length}`
              : `Nenhum resultado para “${searched}”`}
          </span>
          <span>
            {loading && hits.length === 0 ? "carregando…" : hasNext ? "há mais páginas" : "fim da lista"}
          </span>
        </div>
      ) : null}

      {loading && hits.length === 0 ? (
        <div className={styles.grid}>
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className={`${styles.skeleton} ${styles.skeletonCard}`} />
          ))}
        </div>
      ) : null}

      {hits.length > 0 ? (
        <div className={styles.grid} ref={gridRef}>
          {hits.map((hit) => (
            <article className={styles.card} key={hit.nasaId}>
              <div className={styles.favCardMediaWrap}>
                <Image
                  src={hit.previewUrl ?? hit.imageUrl}
                  alt={hit.title}
                  fill
                  sizes="(max-width: 640px) 50vw, (max-width: 900px) 33vw, 25vw"
                />
                <FavoriteButton
                  item={{
                    key: makeLibraryKey(hit.nasaId),
                    kind: "library",
                    title: hit.title,
                    imageUrl: hit.previewUrl ?? hit.imageUrl,
                    detailUrl: hit.imageUrl,
                    description: hit.description,
                    credit: hit.center,
                    nasaId: hit.nasaId,
                    addedAt: 0,
                  }}
                />
              </div>
              <div className={styles.cardBody}>
                <h3 className={styles.cardTitle}>{hit.title}</h3>
                {hit.description ? <p className={styles.cardDesc}>{hit.description}</p> : null}
                <div className={styles.cardFoot}>
                  <div className={styles.metaRow}>
                    <span className={styles.badge}>{hit.nasaId}</span>
                    {hit.center ? <span className={styles.badge}>{hit.center}</span> : null}
                    {hit.dateCreated ? (
                      <span>{formatLibraryDate(hit.dateCreated)}</span>
                    ) : null}
                  </div>
                  {hit.keywords.length > 0 ? (
                    <div className={styles.chips}>
                      {hit.keywords.slice(0, 3).map((keyword) => (
                        <button
                          key={keyword}
                          type="button"
                          className={styles.chip}
                          onClick={() => {
                            setTerm(keyword);
                            search(keyword, 1);
                          }}
                        >
                          {keyword}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <a className={styles.link} href={hit.imageUrl} target="_blank" rel="noreferrer">
                    Abrir original
                  </a>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {hasNext ? (
        <div className={styles.pager}>
          <button
            type="button"
            className={styles.primary}
            disabled={loading}
            onClick={() => {
              if (!request) return;
              search(request.q, request.page + 1);
              gridRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
            }}
          >
            {loading ? "Carregando…" : `Carregar mais (${PAGE_SIZE})`}
          </button>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import type { ApodEntry } from "@/lib/nasa";
import {
  ApiError,
  describeError,
  fetchApodByDate,
  fetchApodRange,
  formatPtDate,
  type Limits,
} from "@/lib/api";
import { APOD_FIRST_DATE, shiftDays, todayIso } from "@/lib/dates";
import { Notice } from "@/components/Notice";
import { FavoriteButton } from "@/components/FavoriteButton";
import { makeApodKey } from "@/components/FavoritesContext";
import { CalendarView } from "@/components/CalendarView";
import styles from "@/app/page.module.css";

/** Página do APOD correspondente à data, para citar a fonte original. */
function apodPageUrl(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `https://apod.nasa.gov/apod/ap${y.slice(2)}${m}${d}.html`;
}

/** Rótulo curto dd/mm para a tira de miniaturas. */
function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

export function ApodPanel() {
  const today = todayIso();
  const [byDate, setByDate] = useState<Record<string, ApodEntry>>({});
  const [knownDates, setKnownDates] = useState<string[]>([]);
  /* Começa em hoje: se a primeira carga falhar (cota da NASA, rede), o campo de data
     ainda está utilizável em vez de abrir vazio. */
  const [date, setDate] = useState(today);
  const [draft, setDraft] = useState(today);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; code: string } | null>(null);
  const [limits, setLimits] = useState<Limits | null>(null);
  const [usingDemoKey, setUsingDemoKey] = useState(false);
  const [viewMode, setViewMode] = useState<"strip" | "calendar">("strip");

  const remember = useCallback((entries: ApodEntry[], fallbackDate?: string) => {
    setByDate((prev) => {
      const next = { ...prev };
      for (const entry of entries) {
        const key = entry.date || fallbackDate;
        if (key) next[key] = { ...entry, date: key };
      }
      return next;
    });
  }, []);

  // Carga inicial: um único request de intervalo cobre o herói e a tira dos últimos dias.
  useEffect(() => {
    const controller = new AbortController();
    const end = todayIso();
    const start = shiftDays(end, -7);

    fetchApodRange(start, end, controller.signal)
      .then((res) => {
        setLimits(res.limits);
        setUsingDemoKey(res.meta.usingDemoKey);
        remember(res.entries);
        const ordered = [...res.entries]
          .map((entry) => entry.date)
          .filter(Boolean)
          .sort((a, b) => b.localeCompare(a));
        setKnownDates(ordered);
        const newest = ordered[0];
        if (!newest) {
          throw new ApiError("A NASA não devolveu imagens neste intervalo.", "EMPTY", 502);
        }
        setDate(newest);
        setDraft(newest);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if ((err as DOMException)?.name === "AbortError") return;
        setError(describeError(err));
        setLoading(false);
      });

    return () => controller.abort();
  }, [remember]);

  const openDate = useCallback(
    async (target: string) => {
      setError(null);
      if (byDate[target]) {
        setDate(target);
        setDraft(target);
        return;
      }
      setLoading(true);
      try {
        const res = await fetchApodByDate(target);
        setLimits(res.limits);
        setUsingDemoKey(res.meta.usingDemoKey);
        remember([res.entry], target);
        setKnownDates((prev) =>
          prev.includes(target) ? prev : [...prev, target].sort((a, b) => b.localeCompare(a)),
        );
        setDate(target);
        setDraft(target);
      } catch (err) {
        setError(describeError(err));
      } finally {
        setLoading(false);
      }
    },
    [byDate, remember],
  );

  const entry = byDate[date];
  const mediaSrc = entry && entry.mediaType !== "video" ? (entry.url ?? entry.thumbnailUrl) : undefined;
  const firstDate = limits?.firstDate ?? APOD_FIRST_DATE;
  const lastDate = limits?.lastDate ?? today;
  const isLatest = Boolean(entry) && entry.date === knownDates[0];

  const step = (delta: number) => {
    const target = shiftDays(date || today, delta);
    if (target < firstDate || target > lastDate) return;
    void openDate(target);
  };

  return (
    <div className={styles.panel}>
      <form
        className={styles.controls}
        onSubmit={(event) => {
          event.preventDefault();
          if (draft) void openDate(draft);
        }}
      >
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Data</span>
          <input
            type="date"
            value={draft}
            min={firstDate}
            max={lastDate}
            onChange={(event) => setDraft(event.target.value)}
            aria-label="Escolher data do APOD"
          />
        </div>
        <button type="button" className={styles.iconBtn} onClick={() => step(-1)} aria-label="Dia anterior">
          ‹
        </button>
        <button type="button" className={styles.iconBtn} onClick={() => step(1)} aria-label="Próximo dia">
          ›
        </button>
        <button type="submit" className={styles.primary}>
          Ver imagem
        </button>
        <button type="button" className={styles.ghost} onClick={() => void openDate(today)}>
          Hoje
        </button>
        <span className={`${styles.fieldLabel} ${styles.pushRight}`}>
          acervo de {formatPtDate(firstDate)}
        </span>
      </form>

      {usingDemoKey && !error ? (
        <Notice>
          Usando a DEMO_KEY da NASA: só 10 requisições por IP, e a cota não é liberada
          hora a hora. Defina{" "}
          <code>NASA_API_KEY</code> em <code>.env.local</code> para liberar a cota própria.
        </Notice>
      ) : null}

      {error ? (
        <Notice tone="error" code={error.code}>
          {error.message}
        </Notice>
      ) : null}

      {loading && !entry ? (
        <div className={`${styles.skeleton} ${styles.skeletonHero}`} aria-live="polite" />
      ) : null}

      {entry ? (
        <section className={styles.hero}>
          <div className={styles.media}>
            {entry.mediaType === "video" ? (
              /* O APOD devolve a página do YouTube (`/watch`), que recusa iframe: só a forma
                 incorporável ou o arquivo direto funcionam. Ver `videoPlayers` em lib/nasa.ts. */
              entry.videoSrc ? (
                <video
                  className={`${styles.mediaFrame} ${styles.mediaVideo}`}
                  src={entry.videoSrc}
                  poster={entry.thumbnailUrl}
                  controls
                  playsInline
                />
              ) : entry.embedUrl ? (
                <iframe
                  className={styles.mediaFrame}
                  src={entry.embedUrl}
                  title={entry.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <span className={styles.fieldLabel}>
                  vídeo sem player incorporável —{" "}
                  <a href={entry.url} target="_blank" rel="noreferrer">
                    assistir na fonte
                  </a>
                </span>
              )
            ) : mediaSrc ? (
              <Image src={mediaSrc} alt={entry.title} fill sizes="(max-width: 880px) 100vw, 60vw" priority />
            ) : (
              <span className={styles.fieldLabel}>esta entrada não tem mídia incorporável</span>
            )}
            <FavoriteButton
              variant="hero"
              item={{
                key: makeApodKey(entry.date),
                kind: "apod",
                title: entry.title,
                date: entry.date,
                imageUrl: entry.thumbnailUrl ?? entry.url ?? "",
                detailUrl: entry.hdUrl ?? entry.url,
                description: entry.explanation,
                credit: entry.copyright.join(" · "),
                embedUrl: entry.embedUrl,
                videoSrc: entry.videoSrc,
                mediaType: entry.mediaType,
                addedAt: 0,
              }}
            />
          </div>

          <div className={styles.heroBody}>
            <div className={styles.metaRow}>
              <span className={`${styles.badge} ${styles.badgeAccent}`}>{formatPtDate(entry.date)}</span>
              <span className={styles.badge}>
                {entry.mediaType === "video" ? "vídeo" : entry.mediaType === "image" ? "imagem" : "outro"}
              </span>
              {isLatest ? <span className={styles.badge}>imagem de hoje</span> : null}
            </div>

            <h2 className={styles.heroTitle}>{entry.title}</h2>

            {entry.copyright.length > 0 ? (
              <p className={styles.metaRow}>Crédito: {entry.copyright.join(" · ")}</p>
            ) : null}

            <p className={styles.explanation}>{entry.explanation}</p>

            <div className={styles.actions}>
              {entry.hdUrl ? (
                <a className={styles.link} href={entry.hdUrl} target="_blank" rel="noreferrer">
                  Abrir em alta resolução
                </a>
              ) : null}
              <a className={styles.link} href={apodPageUrl(entry.date)} target="_blank" rel="noreferrer">
                Página original do APOD
              </a>
            </div>
          </div>
        </section>
      ) : null}

      {!entry && !loading ? (
        <div className={styles.empty}>
          Nenhuma imagem para mostrar agora. A cota da NASA para este IP pode ter acabado
          de estourar — tente a aba &quot;Explorar acervo&quot;, que não depende de chave.
        </div>
      ) : null}

      {knownDates.length > 1 ? (
        <section>
          <div className={styles.calToggle}>
            <h3 className={styles.sectionTitle} style={{ margin: 0 }}>
              Navegação
            </h3>
            <button
              type="button"
              className={`${styles.calToggleBtn} ${viewMode === "strip" ? styles.calToggleBtnActive : ""}`}
              onClick={() => setViewMode("strip")}
            >
              Tira
            </button>
            <button
              type="button"
              className={`${styles.calToggleBtn} ${viewMode === "calendar" ? styles.calToggleBtnActive : ""}`}
              onClick={() => setViewMode("calendar")}
            >
              Calendário
            </button>
          </div>

          {viewMode === "strip" ? (
            <div className={styles.strip}>
              {knownDates.slice(0, 12).map((known) => {
                const item = byDate[known];
                const thumb = item?.thumbnailUrl || (item?.mediaType === "image" ? item.url : undefined);
                return (
                  <button
                    key={known}
                    type="button"
                    className={known === date ? `${styles.stripItem} ${styles.stripItemActive}` : styles.stripItem}
                    onClick={() => void openDate(known)}
                    title={`${formatPtDate(known)} · ${item?.title ?? ""}`}
                  >
                    {thumb ? (
                      <span className={styles.stripImgWrap}>
                        <Image src={thumb} alt="" fill sizes="150px" />
                      </span>
                    ) : null}
                    <span className={styles.stripCaption}>{shortDate(known)}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <CalendarView
              currentDate={date}
              knownDates={knownDates}
              firstDate={firstDate}
              lastDate={lastDate}
              onPickDate={(d) => void openDate(d)}
              thumbnailFor={(d) => {
                const item = byDate[d];
                return item?.thumbnailUrl || (item?.mediaType === "image" ? item.url : undefined);
              }}
              titleFor={(d) => byDate[d]?.title}
            />
          )}
        </section>
      ) : null}

      <p className={styles.hint}>
        {knownDates.length > 0 ? `${knownDates.length} dias abertos até agora · ` : ""}
        acervo de {formatPtDate(firstDate)} a {formatPtDate(lastDate)} · a busca por
        palavra-chave fica na aba &quot;Explorar acervo&quot;, porque o APOD não oferece
        busca textual no servidor.
      </p>
    </div>
  );
}

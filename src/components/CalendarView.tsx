"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { shiftDays, todayIso } from "@/lib/dates";
import { formatPtDate } from "@/lib/api";
import styles from "@/app/page.module.css";

type Props = {
  /** Data atualmente selecionada (highlight principal). */
  currentDate: string;
  /** Datas que já foram carregadas e têm entry disponível. */
  knownDates: string[];
  /** Data mínima permitida (primeira do APOD). */
  firstDate: string;
  /** Data máxima permitida (hoje). */
  lastDate: string;
  /** Chamado quando o usuário clica em um dia. */
  onPickDate: (date: string) => void;
  /** URL da thumbnail da entrada (opcional, para preview no hover). */
  thumbnailFor?: (date: string) => string | undefined;
  /** Título da entrada (para tooltip). */
  titleFor?: (date: string) => string | undefined;
};

const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];

/**
 * Calendário mensal para navegar o acervo do APOD.
 * Mostra um grid 7×N com os dias do mês, destacando os que já foram carregados.
 */
export function CalendarView({
  currentDate,
  knownDates,
  firstDate,
  lastDate,
  onPickDate,
  thumbnailFor,
  titleFor,
}: Props) {
  // Mês em exibição: começa no mês da data atual.
  const [viewMonth, setViewMonth] = useState(() => {
    const [y, m] = (currentDate || todayIso()).split("-").map(Number);
    return { year: y, month: m };
  });

  const { year, month } = viewMonth;
  const today = todayIso();

  const knownSet = useMemo(() => new Set(knownDates), [knownDates]);

  // Primeiro dia do mês e quantos dias tem.
  const firstOfMonth = `${year}-${String(month).padStart(2, "0")}-01`;
  const daysInMonth = useMemo(() => {
    // Avança até o próximo mês e volta 1 dia.
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const last = shiftDays(`${nextYear}-${String(nextMonth).padStart(2, "0")}-01`, -1);
    return Number(last.split("-")[2]);
  }, [year, month]);

  // Dia da semana do primeiro dia (0 = domingo).
  const firstWeekday = useMemo(() => {
    const [y, m, d] = firstOfMonth.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  }, [firstOfMonth]);

  const canGoPrev = (() => {
    // O mês anterior tem algum dia >= firstDate?
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const lastDayPrev = `${prevYear}-${String(prevMonth).padStart(2, "0")}-${String(
      new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate(),
    ).padStart(2, "0")}`;
    return lastDayPrev >= firstDate;
  })();

  const canGoNext = (() => {
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const firstDayNext = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
    return firstDayNext <= lastDate;
  })();

  const goPrev = () => {
    if (!canGoPrev) return;
    setViewMonth((prev) => {
      const m = prev.month === 1 ? 12 : prev.month - 1;
      const y = prev.month === 1 ? prev.year - 1 : prev.year;
      return { year: y, month: m };
    });
  };

  const goNext = () => {
    if (!canGoNext) return;
    setViewMonth((prev) => {
      const m = prev.month === 12 ? 1 : prev.month + 1;
      const y = prev.month === 12 ? prev.year + 1 : prev.year;
      return { year: y, month: m };
    });
  };

  const monthLabel = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  // Células do grid: espaços vazios antes do dia 1 + dias do mês.
  const cells: Array<{ day: number | null; date: string | null }> = [];
  for (let i = 0; i < firstWeekday; i++) {
    cells.push({ day: null, date: null });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ day: d, date });
  }

  return (
    <div className={styles.calWrap}>
      <div className={styles.calHeader}>
        <button
          type="button"
          className={styles.iconBtn}
          onClick={goPrev}
          disabled={!canGoPrev}
          aria-label="Mês anterior"
        >
          ‹
        </button>
        <span className={styles.calTitle}>{monthLabel}</span>
        <button
          type="button"
          className={styles.iconBtn}
          onClick={goNext}
          disabled={!canGoNext}
          aria-label="Próximo mês"
        >
          ›
        </button>
      </div>

      <div className={styles.calGrid}>
        {WEEKDAYS.map((wd, i) => (
          <span key={`wd-${i}`} className={styles.calWeekday}>
            {wd}
          </span>
        ))}

        {cells.map((cell, i) => {
          if (!cell.date) {
            return <span key={`empty-${i}`} className={styles.calCell} />;
          }

          const date = cell.date;
          const isKnown = knownSet.has(date);
          const isCurrent = date === currentDate;
          const isToday = date === today;
          const isDisabled = date < firstDate || date > lastDate;
          const thumb = thumbnailFor?.(date);
          const title = titleFor?.(date);

          return (
            <button
              key={date}
              type="button"
              className={[
                styles.calCell,
                isKnown ? styles.calCellKnown : "",
                isCurrent ? styles.calCellCurrent : "",
                isToday ? styles.calCellToday : "",
                isDisabled ? styles.calCellDisabled : "",
              ]
                .filter(Boolean)
                .join(" ")}
              disabled={isDisabled}
              onClick={() => onPickDate(date)}
              title={title ? `${formatPtDate(date)} — ${title}` : formatPtDate(date)}
            >
              {thumb && isKnown ? (
                <span className={styles.calThumb}>
                  <Image src={thumb} alt="" fill sizes="48px" />
                </span>
              ) : null}
              <span className={styles.calDay}>{cell.day}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

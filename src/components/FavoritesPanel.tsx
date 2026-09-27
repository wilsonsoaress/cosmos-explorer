"use client";

import { useState } from "react";
import Image from "next/image";
import { useFavorites, type FavoriteItem } from "@/components/FavoritesContext";
import { formatPtDate } from "@/lib/api";
import styles from "@/app/page.module.css";

/**
 * Painel de favoritos — mostra todos os itens salvos no localStorage.
 * Permite remover individualmente ou limpar tudo.
 */
export function FavoritesPanel() {
  const { items, remove, clear, count } = useFavorites();
  const [confirmClear, setConfirmClear] = useState(false);

  if (count === 0) {
    return (
      <div className={styles.panel}>
        <div className={styles.empty}>
          Nenhum favorito ainda. Clique na estrela (☆) de uma imagem do APOD ou da
          Image Library para salvar aqui — ficam guardados no seu navegador.
        </div>
      </div>
    );
  }

  const apodItems = items.filter((item) => item.kind === "apod");
  const libraryItems = items.filter((item) => item.kind === "library");

  return (
    <div className={styles.panel}>
      <div className={styles.favHeader}>
        <span className={styles.hint}>
          {count} {count === 1 ? "item salvo" : "itens salvos"} no navegador
        </span>
        {confirmClear ? (
          <div className={styles.favConfirmGroup}>
            <span className={styles.hint}>Limpar todos?</span>
            <button
              type="button"
              className={styles.ghost}
              onClick={() => {
                clear();
                setConfirmClear(false);
              }}
            >
              Sim, limpar
            </button>
            <button
              type="button"
              className={styles.ghost}
              onClick={() => setConfirmClear(false)}
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={styles.ghost}
            onClick={() => setConfirmClear(true)}
          >
            Limpar todos
          </button>
        )}
      </div>

      {apodItems.length > 0 ? (
        <section>
          <h3 className={styles.sectionTitle}>Imagens do dia ({apodItems.length})</h3>
          <div className={styles.grid}>
            {apodItems.map((item) => (
              <FavoriteCard key={item.key} item={item} onRemove={remove} />
            ))}
          </div>
        </section>
      ) : null}

      {libraryItems.length > 0 ? (
        <section>
          <h3 className={styles.sectionTitle}>Acervo ({libraryItems.length})</h3>
          <div className={styles.grid}>
            {libraryItems.map((item) => (
              <FavoriteCard key={item.key} item={item} onRemove={remove} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function FavoriteCard({ item, onRemove }: { item: FavoriteItem; onRemove: (key: string) => void }) {
  return (
    <article className={styles.card}>
      <div className={styles.favCardMediaWrap}>
        <Image
          src={item.imageUrl}
          alt={item.title}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 900px) 33vw, 25vw"
        />
        <button
          type="button"
          className={`${styles.favBtn} ${styles.favBtnActive} ${styles.favBtnCard}`}
          onClick={() => onRemove(item.key)}
          aria-label="Remover dos favoritos"
          title="Remover dos favoritos"
        >
          <span aria-hidden="true">★</span>
        </button>
      </div>
      <div className={styles.cardBody}>
        <h3 className={styles.cardTitle}>{item.title}</h3>
        {item.date ? (
          <div className={styles.metaRow}>
            <span className={`${styles.badge} ${styles.badgeAccent}`}>{formatPtDate(item.date)}</span>
            {item.mediaType ? (
              <span className={styles.badge}>
                {item.mediaType === "video" ? "vídeo" : item.mediaType === "image" ? "imagem" : "outro"}
              </span>
            ) : null}
          </div>
        ) : item.nasaId ? (
          <div className={styles.metaRow}>
            <span className={styles.badge}>{item.nasaId}</span>
          </div>
        ) : null}
        {item.description ? <p className={styles.cardDesc}>{item.description}</p> : null}
        {item.credit ? (
          <p className={styles.hint}>Crédito: {item.credit}</p>
        ) : null}
        <div className={styles.cardFoot}>
          {item.detailUrl ? (
            <a className={styles.link} href={item.detailUrl} target="_blank" rel="noreferrer">
              Abrir original
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}

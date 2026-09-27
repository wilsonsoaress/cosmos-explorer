"use client";

import { useFavorites, type FavoriteItem } from "@/components/FavoritesContext";
import styles from "@/app/page.module.css";

type Props = {
  item: FavoriteItem;
  /** Variante visual: sobre imagem escura (hero) ou sobre card. */
  variant?: "hero" | "card";
};

/**
 * Botão de estrela que adiciona/remove um item dos favoritos.
 * Fica posicionado absoluto no canto — o pai precisa ter `position: relative`.
 */
export function FavoriteButton({ item, variant = "card" }: Props) {
  const { isFavorite, toggle } = useFavorites();
  const active = isFavorite(item.key);

  return (
    <button
      type="button"
      className={`${styles.favBtn} ${active ? styles.favBtnActive : ""} ${variant === "hero" ? styles.favBtnHero : styles.favBtnCard}`}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        toggle(item);
      }}
      aria-label={active ? "Remover dos favoritos" : "Adicionar aos favoritos"}
      aria-pressed={active}
      title={active ? "Remover dos favoritos" : "Adicionar aos favoritos"}
    >
      <span aria-hidden="true">{active ? "★" : "☆"}</span>
    </button>
  );
}

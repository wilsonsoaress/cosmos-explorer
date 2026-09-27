"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import {
  type FavoriteItem,
  readFavorites,
  writeFavorites,
  makeApodKey,
  makeLibraryKey,
} from "@/lib/favorites";

type FavoritesContextValue = {
  items: FavoriteItem[];
  isFavorite: (key: string) => boolean;
  toggle: (item: FavoriteItem) => void;
  remove: (key: string) => void;
  clear: () => void;
  count: number;
};

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<FavoriteItem[]>(() =>
    typeof window !== "undefined" ? readFavorites() : [],
  );

  const persist = useCallback((next: FavoriteItem[]) => {
    setItems(next);
    writeFavorites(next);
  }, []);

  const isFavorite = useCallback(
    (key: string) => items.some((item) => item.key === key),
    [items],
  );

  const toggle = useCallback(
    (incoming: FavoriteItem) => {
      const exists = items.some((item) => item.key === incoming.key);
      if (exists) {
        persist(items.filter((item) => item.key !== incoming.key));
      } else {
        persist([{ ...incoming, addedAt: Date.now() }, ...items]);
      }
    },
    [items, persist],
  );

  const remove = useCallback(
    (key: string) => {
      persist(items.filter((item) => item.key !== key));
    },
    [items, persist],
  );

  const clear = useCallback(() => {
    persist([]);
  }, [persist]);

  return (
    <FavoritesContext.Provider
      value={{ items, isFavorite, toggle, remove, clear, count: items.length }}
    >
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext);
  if (!ctx) {
    throw new Error("useFavorites precisa estar dentro de <FavoritesProvider>.");
  }
  return ctx;
}

export { makeApodKey, makeLibraryKey };
export type { FavoriteItem };

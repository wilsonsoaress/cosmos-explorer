"use client";

import { useState } from "react";
import { ApodPanel } from "@/components/ApodPanel";
import { LibraryPanel } from "@/components/LibraryPanel";
import { FavoritesPanel } from "@/components/FavoritesPanel";
import { FavoritesProvider, useFavorites } from "@/components/FavoritesContext";
import styles from "@/app/page.module.css";

type Tab = "apod" | "library" | "favorites";

function TabBar({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const { count } = useFavorites();
  return (
    <nav className={styles.tabs} aria-label="Modos de busca">
      <button
        type="button"
        className={tab === "apod" ? `${styles.tab} ${styles.tabActive}` : styles.tab}
        aria-pressed={tab === "apod"}
        onClick={() => setTab("apod")}
      >
        Imagem do dia
      </button>
      <button
        type="button"
        className={tab === "library" ? `${styles.tab} ${styles.tabActive}` : styles.tab}
        aria-pressed={tab === "library"}
        onClick={() => setTab("library")}
      >
        Explorar acervo
      </button>
      <button
        type="button"
        className={tab === "favorites" ? `${styles.tab} ${styles.tabActive}` : styles.tab}
        aria-pressed={tab === "favorites"}
        onClick={() => setTab("favorites")}
      >
        Favoritos{count > 0 ? ` (${count})` : ""}
      </button>
    </nav>
  );
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("apod");

  return (
    <FavoritesProvider>
      <div className={styles.app}>
        <header className={`${styles.shell} ${styles.header}`}>
          <div>
            <div className={styles.brandRow}>
              <span className={styles.mark} aria-hidden="true">
                ✦
              </span>
              <div>
                <h1 className={styles.title}>Cosmos Explorer</h1>
                <p className={styles.subtitle}>
                  Imagens da NASA por dia (APOD) e por palavra-chave (Image Library)
                </p>
              </div>
            </div>
          </div>

          <TabBar tab={tab} setTab={setTab} />
        </header>

        <main className={styles.shell}>
          {tab === "apod" ? <ApodPanel /> : tab === "library" ? <LibraryPanel /> : <FavoritesPanel />}
        </main>

        <footer className={`${styles.shell} ${styles.footer}`}>
          <span>
            Dados: <a className={styles.link} href="https://api.nasa.gov/" target="_blank" rel="noreferrer">api.nasa.gov</a>{" "}
            e{" "}
            <a
              className={styles.link}
              href="https://images.nasa.gov/"
              target="_blank"
              rel="noreferrer"
            >
              images.nasa.gov
            </a>
          </span>
          <span>As requisições passam por um proxy próprio, com cache.</span>
        </footer>
      </div>
    </FavoritesProvider>
  );
}

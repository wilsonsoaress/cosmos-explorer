import type { ReactNode } from "react";
import styles from "@/app/page.module.css";

export function Notice({
  tone = "info",
  code,
  children,
}: {
  tone?: "info" | "error";
  code?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={tone === "error" ? `${styles.notice} ${styles.noticeError}` : styles.notice}
      role={tone === "error" ? "alert" : "status"}
    >
      <span>{children}</span>
      {code ? (
        <span className={styles.noticeCode}>{code}</span>
      ) : null}
    </div>
  );
}

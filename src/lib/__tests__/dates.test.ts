import { describe, it, expect } from "vitest";
import { APOD_FIRST_DATE, isIsoDate, todayIso, shiftDays, clampIso } from "@/lib/dates";

describe("dates", () => {
  describe("APOD_FIRST_DATE", () => {
    it("deve ser 1995-06-16", () => {
      expect(APOD_FIRST_DATE).toBe("1995-06-16");
    });
  });

  describe("isIsoDate", () => {
    it("aceita datas ISO válidas", () => {
      expect(isIsoDate("2026-09-27")).toBe(true);
      expect(isIsoDate("1995-06-16")).toBe(true);
      expect(isIsoDate("2000-01-01")).toBe(true);
    });

    it("rejeita formatos inválidos", () => {
      expect(isIsoDate("27/09/2026")).toBe(false);
      expect(isIsoDate("2026-9-27")).toBe(false);
      expect(isIsoDate("20260927")).toBe(false);
      expect(isIsoDate("")).toBe(false);
      expect(isIsoDate("not-a-date")).toBe(false);
    });
  });

  describe("todayIso", () => {
    it("retorna a data atual em formato ISO", () => {
      const fixed = new Date("2026-09-27T12:00:00Z");
      expect(todayIso(fixed)).toBe("2026-09-27");
    });

    it("preenche zeros à esquerda", () => {
      const fixed = new Date("2026-01-05T12:00:00Z");
      expect(todayIso(fixed)).toBe("2026-01-05");
    });
  });

  describe("shiftDays", () => {
    it("avança dias corretamente", () => {
      expect(shiftDays("2026-09-27", 1)).toBe("2026-09-28");
      expect(shiftDays("2026-09-27", 3)).toBe("2026-09-30");
    });

    it("volta dias corretamente", () => {
      expect(shiftDays("2026-09-27", -1)).toBe("2026-09-26");
      expect(shiftDays("2026-09-27", -27)).toBe("2026-08-31");
    });

    it("lida com virada de mês", () => {
      expect(shiftDays("2026-09-30", 1)).toBe("2026-10-01");
      expect(shiftDays("2026-10-01", -1)).toBe("2026-09-30");
    });

    it("lida com virada de ano", () => {
      expect(shiftDays("2026-12-31", 1)).toBe("2027-01-01");
      expect(shiftDays("2027-01-01", -1)).toBe("2026-12-31");
    });

    it("lida com ano bissexto", () => {
      expect(shiftDays("2024-02-28", 1)).toBe("2024-02-29");
      expect(shiftDays("2024-02-29", 1)).toBe("2024-03-01");
      expect(shiftDays("2023-02-28", 1)).toBe("2023-03-01");
    });

    it("retorna a mesma data com delta 0", () => {
      expect(shiftDays("2026-09-27", 0)).toBe("2026-09-27");
    });
  });

  describe("clampIso", () => {
    it("retorna a data se estiver dentro do intervalo", () => {
      expect(clampIso("2026-09-27", "2026-01-01", "2026-12-31")).toBe("2026-09-27");
    });

    it("retorna o mínimo se a data for menor", () => {
      expect(clampIso("2025-01-01", "2026-01-01", "2026-12-31")).toBe("2026-01-01");
    });

    it("retorna o máximo se a data for maior", () => {
      expect(clampIso("2027-01-01", "2026-01-01", "2026-12-31")).toBe("2026-12-31");
    });
  });
});

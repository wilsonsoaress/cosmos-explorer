import { describe, it, expect, vi, beforeEach } from "vitest";
import { videoPlayers, opt, cacheKey } from "@/lib/nasa";

describe("nasa", () => {
  describe("videoPlayers", () => {
    it("retorna embedUrl para YouTube /watch", () => {
      const result = videoPlayers("https://www.youtube.com/watch?v=mkbEhp8hJN8");
      expect(result.embedUrl).toBe("https://www.youtube-nocookie.com/embed/mkbEhp8hJN8?rel=0");
      expect(result.videoSrc).toBeUndefined();
    });

    it("retorna embedUrl para YouTube /embed/", () => {
      const result = videoPlayers("https://www.youtube.com/embed/mkbEhp8hJN8");
      expect(result.embedUrl).toBe("https://www.youtube-nocookie.com/embed/mkbEhp8hJN8?rel=0");
    });

    it("retorna embedUrl para YouTube /shorts/", () => {
      const result = videoPlayers("https://www.youtube.com/shorts/mkbEhp8hJN8");
      expect(result.embedUrl).toBe("https://www.youtube-nocookie.com/embed/mkbEhp8hJN8?rel=0");
    });

    it("retorna embedUrl para youtu.be", () => {
      const result = videoPlayers("https://youtu.be/mkbEhp8hJN8");
      expect(result.embedUrl).toBe("https://www.youtube-nocookie.com/embed/mkbEhp8hJN8?rel=0");
    });

    it("retorna embedUrl para Vimeo", () => {
      const result = videoPlayers("https://vimeo.com/123456789");
      expect(result.embedUrl).toBe("https://player.vimeo.com/video/123456789");
      expect(result.videoSrc).toBeUndefined();
    });

    it("retorna videoSrc para arquivo .mp4", () => {
      const url = "https://apod.nasa.gov/apod/video/Swift_Boost.mp4";
      const result = videoPlayers(url);
      expect(result.videoSrc).toBe(url);
      expect(result.embedUrl).toBeUndefined();
    });

    it("retorna videoSrc para arquivo .webm com query string", () => {
      const url = "https://example.com/video.webm?token=abc";
      const result = videoPlayers(url);
      expect(result.videoSrc).toBe(url);
    });

    it("retorna objeto vazio para URL não reconhecida", () => {
      const result = videoPlayers("https://example.com/page");
      expect(result.embedUrl).toBeUndefined();
      expect(result.videoSrc).toBeUndefined();
    });

    it("retorna objeto vazio para string vazia", () => {
      const result = videoPlayers("");
      expect(result.embedUrl).toBeUndefined();
      expect(result.videoSrc).toBeUndefined();
    });
  });

  describe("opt", () => {
    it("retorna a string trimada se não vazia", () => {
      expect(opt("  hello  ")).toBe("hello");
      expect(opt("hello")).toBe("hello");
    });

    it("retorna undefined para string vazia", () => {
      expect(opt("")).toBeUndefined();
    });

    it("retorna undefined para string só com espaços", () => {
      expect(opt("   ")).toBeUndefined();
    });

    it("retorna undefined para undefined", () => {
      expect(opt(undefined)).toBeUndefined();
    });
  });

  describe("cacheKey", () => {
    it("gera chave simples", () => {
      expect(cacheKey({ apod: "2026-09-27" })).toBe("apod=2026-09-27");
    });

    it("gera chave composta", () => {
      expect(cacheKey({ apodRange: "2026-09-18_2026-09-25" })).toBe(
        "apodRange=2026-09-18_2026-09-25",
      );
    });

    it("filtra valores undefined", () => {
      expect(cacheKey({ search: "james", page: 1, type: undefined })).toBe("search=james_page=1");
    });

    it("filtra valores vazios", () => {
      expect(cacheKey({ search: "james", type: "" })).toBe("search=james");
    });

    it("remove caracteres especiais", () => {
      expect(cacheKey({ q: "hello world" })).toBe("q=helloworld");
    });

    it("preserva caracteres válidos", () => {
      expect(cacheKey({ q: "hello-world_test.123" })).toBe("q=hello-world_test.123");
    });
  });
});

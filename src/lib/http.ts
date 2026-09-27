import { NasaError } from "@/lib/nasa";

/** Formato único de erro para os route handlers, espelhando o envelope `{ ok, ... }`. */
export function toErrorResponse(error: unknown): Response {
  if (error instanceof NasaError) {
    return Response.json(
      {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          retryAfterSeconds: error.retryAfterSeconds,
        },
      },
      { status: error.status },
    );
  }
  const message = error instanceof Error ? error.message : "Erro inesperado.";
  return Response.json({ ok: false, error: { code: "INTERNAL", message } }, { status: 500 });
}

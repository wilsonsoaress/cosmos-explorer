import { NextRequest } from "next/server";
import {
  APOD_FIRST_DATE,
  NasaError,
  assertApodDate,
  getApodByDate,
  getApodRange,
  todayIso,
} from "@/lib/nasa";
import { toErrorResponse } from "@/lib/http";

/**
 * GET /api/apod?date=2026-09-15
 * GET /api/apod?start=2026-09-10&end=2026-09-15   (sem `count`: combiná-lo com
 *      intervalo retorna 400 na API real)
 *
 * Mantém a NASA_API_KEY fora do bundle e absorve o limite de 10 req/h do DEMO_KEY
 * com cache em memória + disco.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  const date = searchParams.get("date");

  try {
    if (start && end) {
      const validStart = assertApodDate(start, "start");
      const validEnd = assertApodDate(end, "end");
      if (validStart > validEnd) {
        throw new NasaError("`start` precisa ser anterior a `end`.", 400, "BAD_REQUEST");
      }
      const { entries, meta } = await getApodRange(validStart, validEnd);
      return Response.json({
        ok: true,
        kind: "range" as const,
        entries,
        meta,
        limits: { firstDate: APOD_FIRST_DATE, lastDate: todayIso() },
      });
    }

    const target = assertApodDate(date || todayIso());
    const { entry, meta } = await getApodByDate(target);
    return Response.json({
      ok: true,
      kind: "single" as const,
      entry,
      meta,
      limits: { firstDate: APOD_FIRST_DATE, lastDate: todayIso() },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

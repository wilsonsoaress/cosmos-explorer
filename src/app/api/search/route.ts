import { NextRequest } from "next/server";
import { NasaError, searchLibrary } from "@/lib/nasa";
import { toErrorResponse } from "@/lib/http";

const MEDIA_TYPES = new Set(["all", "image", "video", "audio"]);

/**
 * GET /api/search?q=helix+nebula&page=1&pageSize=24&mediaType=image
 *
 * Busca textual real, que o APOD não oferece (`concept_tags` está desligado no
 * servidor da NASA). A Image Library não exige chave.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const q = searchParams.get("q")?.trim() ?? "";
  const mediaType = searchParams.get("mediaType") ?? "all";

  try {
    if (q.length < 2) {
      throw new NasaError("Digite ao menos 2 caracteres para buscar.", 400, "QUERY_TOO_SHORT");
    }
    if (!MEDIA_TYPES.has(mediaType)) {
      throw new NasaError("mediaType deve ser all, image, video ou audio.", 400, "BAD_REQUEST");
    }

    const yearStart = Number(searchParams.get("yearStart")) || undefined;
    const yearEnd = Number(searchParams.get("yearEnd")) || undefined;
    if (yearStart && yearEnd && yearStart > yearEnd) {
      throw new NasaError("Ano inicial não pode ser maior que o final.", 400, "BAD_REQUEST");
    }

    const { result, meta } = await searchLibrary({
      q,
      page: Number(searchParams.get("page")) || 1,
      pageSize: Number(searchParams.get("pageSize")) || 24,
      mediaType,
      yearStart,
      yearEnd,
    });

    return Response.json({ ok: true, query: q, mediaType, result, meta });
  } catch (error) {
    return toErrorResponse(error);
  }
}

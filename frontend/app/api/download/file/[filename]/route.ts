import { cookies } from "next/headers";
import fs from "node:fs";
import path from "node:path";
import { DOWNLOAD_COOKIE_NAME, isAuthorized } from "@/lib/download-auth";
import { resolveSafe } from "@/lib/download-fs";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;
  const c = (await cookies()).get(DOWNLOAD_COOKIE_NAME)?.value;
  if (!isAuthorized(c)) return new Response("Unauthorized", { status: 401 });

  const decoded = decodeURIComponent(filename);
  const safe = resolveSafe(decoded);
  if (!safe) return new Response("Not Found", { status: 404 });

  const stat = fs.statSync(safe);
  const nodeStream = fs.createReadStream(safe);
  const webStream = new ReadableStream<Uint8Array>({
    start(controller) {
      nodeStream.on("data", (chunk) => {
        const buf =
          typeof chunk === "string"
            ? Buffer.from(chunk)
            : chunk instanceof Buffer
              ? chunk
              : Buffer.from(chunk);
        controller.enqueue(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
      });
      nodeStream.on("end", () => controller.close());
      nodeStream.on("error", (e) => controller.error(e));
    },
    cancel() {
      nodeStream.destroy();
    },
  });

  const basename = path.basename(safe);
  const ascii = basename.replace(/[^\x20-\x7e]/g, "_");
  const utf8 = encodeURIComponent(basename);

  return new Response(webStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(stat.size),
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`,
      "Cache-Control": "no-store",
    },
  });
}

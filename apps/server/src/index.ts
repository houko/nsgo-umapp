// Umapp's server: it counts the visitors of the sites that embed /script.js and answers Umapp, as an Umami server does, at /api.

import { api } from "./api";
import { collect, type Env } from "./collect";
import { trackerScript } from "./tracker";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/script.js") {
      return new Response(trackerScript, {
        headers: {
          "Content-Type": "text/javascript; charset=utf-8",
          "Cache-Control": "public, max-age=86400",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
    if (pathname === "/api/send") return collect(request, env);
    if (pathname === "/api" || pathname.startsWith("/api/")) return api(request, env, pathname.slice(4));
    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

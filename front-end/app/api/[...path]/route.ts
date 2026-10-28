import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ path: string[] }> };

async function proxy(request: Request, { params }: RouteContext): Promise<Response> {
  const { path } = await params;
  let target: URL;
  try {
    const base = new URL(process.env.API_INTERNAL_URL || "http://localhost:8080");
    if (
      (base.protocol !== "http:" && base.protocol !== "https:") ||
      base.username ||
      base.password
    ) {
      return gatewayError();
    }
    target = new URL(`/api/${path.map(encodeURIComponent).join("/")}`, base);
    target.search = new URL(request.url).search;
  } catch {
    return gatewayError();
  }

  const headers = new Headers(request.headers);
  headers.delete("connection");
  headers.delete("content-length");
  headers.delete("host");
  headers.delete("accept-encoding");
  headers.delete("forwarded");
  headers.delete("x-forwarded-for");
  headers.delete("x-forwarded-host");
  headers.delete("x-forwarded-port");
  headers.delete("x-forwarded-proto");
  headers.delete("x-real-ip");
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      ...(hasBody ? { body: await request.arrayBuffer() } : {}),
      cache: "no-store",
      redirect: "manual",
      signal: request.signal,
    });
    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.delete("connection");
    responseHeaders.delete("content-encoding");
    responseHeaders.delete("content-length");
    responseHeaders.delete("keep-alive");
    responseHeaders.delete("transfer-encoding");
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch {
    return gatewayError();
  }
}

function gatewayError(): Response {
  return NextResponse.json(
    { error: { code: "service_unavailable", message: "Service unavailable", details: {} } },
    { status: 503 },
  );
}

export const GET = proxy;
export const HEAD = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;

const UNTRUSTED_FORWARDING_HEADERS = [
  "forwarded",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-port",
  "x-forwarded-proto",
  "x-real-ip",
  "x-vercel-forwarded-for",
  "x-platform-client-ip",
  "x-platform-forwarder-token",
];

/**
 * @param {Headers} source
 * @param {{ enabled: boolean, clientIP: string | null, token: string | undefined }} options
 * @returns {Headers}
 */
export function platformForwardingHeaders(source, options) {
  const headers = new Headers(source);
  for (const name of UNTRUSTED_FORWARDING_HEADERS) {
    headers.delete(name);
  }
  if (options.enabled && options.clientIP && options.token) {
    headers.set("X-Platform-Client-IP", options.clientIP);
    headers.set("X-Platform-Forwarder-Token", options.token);
  }
  return headers;
}

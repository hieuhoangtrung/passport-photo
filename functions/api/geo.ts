// Cloudflare Pages Function: return the visitor's country from Cloudflare's own geo data.
// No third-party lookup, nothing is logged or stored. Used only to suggest photo rules and language.
export function onRequest({ request }: { request: Request & { cf?: { country?: string } } }) {
  const country = request.cf?.country ?? request.headers.get('cf-ipcountry');
  return new Response(JSON.stringify({ country: country && country !== 'XX' && country !== 'T1' ? country : null }), {
    headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' },
  });
}

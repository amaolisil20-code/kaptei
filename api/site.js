// Lê o site de uma empresa (página inicial + páginas de contato) e devolve
// telefones, WhatsApp, e-mails e redes sociais encontrados.
import dns from 'node:dns/promises';
import net from 'node:net';

const UA = 'Mozilla/5.0 (compatible; Kaptei/1.0; ferramenta pessoal de prospeccao)';
const MAX_BYTES = 1_500_000;

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  const v = ip.toLowerCase();
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('::ffff:');
}

async function safeUrl(raw) {
  let u;
  try { u = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw); } catch { return null; }
  if (!['http:', 'https:'].includes(u.protocol)) return null;
  if (u.port && !['80', '443'].includes(u.port)) return null;
  const host = u.hostname;
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return null;
  try {
    const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
    if (!addrs.length || addrs.some(a => isPrivateIp(a.address))) return null;
  } catch { return null; }
  return u;
}

async function getPage(url, ms) {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), ms);
  try {
    let current = url;
    for (let hop = 0; hop < 4; hop++) {
      const safe = await safeUrl(current);
      if (!safe) return null;
      const r = await fetch(safe, { headers: { 'User-Agent': UA, 'Accept': 'text/html,*/*;q=0.5', 'Accept-Language': 'pt-BR,pt;q=0.9' }, redirect: 'manual', signal: ctl.signal });
      if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { current = new URL(r.headers.get('location'), safe).toString(); continue; }
      if (!r.ok) return null;
      const type = r.headers.get('content-type') || '';
      if (!type.includes('html') && !type.includes('text')) return null;
      const reader = r.body.getReader();
      const chunks = []; let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length; chunks.push(value);
        if (size > MAX_BYTES) { ctl.abort(); break; }
      }
      return { url: safe.toString(), html: Buffer.concat(chunks).toString('utf8') };
    }
    return null;
  } catch { return null; } finally { clearTimeout(to); }
}

const decode = s => s.replace(/&amp;/g, '&').replace(/&#64;|&#x40;/gi, '@').replace(/&nbsp;/g, ' ').replace(/%20/g, ' ');

function normPhone(raw) {
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('0055')) d = d.slice(4);
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.startsWith('0') && (d.length === 11 || d.length === 12)) d = d.slice(1);
  if (d.length !== 10 && d.length !== 11) return null;
  const ddd = +d.slice(0, 2);
  if (ddd < 11 || ddd > 99) return null;
  if (d.length === 11 && d[2] !== '9') return null;
  if (d.length === 10 && !/[2-5]/.test(d[2])) return null;
  if (/^(\d)\1+$/.test(d.slice(2))) return null;
  return d;
}
const fmtPhone = d => `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}`;

export function extract(html, baseUrl) {
  const text = decode(html);
  const phones = new Set(), whats = new Set(), emails = new Set();
  const social = { instagram: new Set(), facebook: new Set(), linkedin: new Set() };

  for (const m of text.matchAll(/(?:wa\.me\/|api\.whatsapp\.com\/send\/?\?phone=|web\.whatsapp\.com\/send\/?\?phone=|whatsapp:\/\/send\?phone=)\+?(\d{10,13})/gi)) {
    const p = normPhone(m[1]); if (p) whats.add(p);
  }
  for (const m of text.matchAll(/href=["']tel:([^"']+)["']/gi)) { const p = normPhone(m[1]); if (p) phones.add(p); }
  const visible = text.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
  for (const m of visible.matchAll(/(?:\+?55\s?)?\(?\b(\d{2})\)?[\s.-]?(9?\s?\d{4})[\s.-]?(\d{4})\b/g)) {
    const p = normPhone(m[1] + m[2] + m[3]); if (p) phones.add(p);
  }
  for (const m of text.matchAll(/mailto:([^"'?\s>]+)/gi)) emails.add(m[1].toLowerCase());
  for (const m of visible.matchAll(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi)) emails.add(m[0].toLowerCase());

  const links = [...text.matchAll(/href=["']([^"']+)["']/gi)].map(m => m[1]);
  for (const l of links) {
    const ig = l.match(/instagram\.com\/([A-Za-z0-9._]{2,30})/i);
    if (ig && !/^(p|reel|reels|explore|accounts|stories|tv|share)$/i.test(ig[1])) social.instagram.add('https://instagram.com/' + ig[1].replace(/\/$/, ''));
    const fb = l.match(/facebook\.com\/([A-Za-z0-9.\-]{2,80})/i);
    if (fb && !/^(sharer|share|dialog|plugins|tr|login|groups|events|profile\.php)(\.php)?$/i.test(fb[1])) social.facebook.add('https://facebook.com/' + fb[1]);
    const li = l.match(/linkedin\.com\/(company|in)\/([A-Za-z0-9\-_%]{2,100})/i);
    if (li) social.linkedin.add(`https://linkedin.com/${li[1]}/${li[2]}`);
  }
  const contactLinks = [];
  for (const l of links) {
    if (/contat|contact|fale-?conosco|atendimento|sobre|about|onde-estamos|localiza/i.test(l) && !/^(mailto|tel|javascript|#)/i.test(l)) {
      try { const u = new URL(l, baseUrl); if (u.hostname === new URL(baseUrl).hostname) contactLinks.push(u.toString().split('#')[0]); } catch {}
    }
  }
  const badEmail = e => /\.(png|jpe?g|gif|svg|webp)$/.test(e) || /(sentry|wixpress|example|exemplo|seudominio|domain\.com|godaddy|cloudflare)/.test(e);
  return {
    phones: [...phones], whats: [...whats],
    emails: [...emails].filter(e => !badEmail(e)),
    instagram: [...social.instagram], facebook: [...social.facebook], linkedin: [...social.linkedin],
    contactLinks: [...new Set(contactLinks)],
  };
}

export default async function handler(req, res) {
  const raw = String(req.query?.url ?? '').trim().slice(0, 500);
  if (!raw) return res.status(400).json({ error: 'Informe o site.' });
  const start = await safeUrl(raw);
  if (!start) return res.status(400).json({ error: 'Esse endereço não pode ser lido.' });

  const home = await getPage(start.toString(), 9000);
  if (!home) return res.status(200).json({ ok: false, error: 'O site não abriu ou está fora do ar.' });

  const found = extract(home.html, home.url);
  const guesses = ['/contato', '/contact', '/fale-conosco', '/contatos'].map(p => new URL(p, home.url).toString());
  const toVisit = [...new Set([...found.contactLinks, ...guesses])].slice(0, 4);
  const pages = await Promise.all(toVisit.map(u => getPage(u, 6000)));
  const all = [found, ...pages.filter(Boolean).map(p => extract(p.html, p.url))];
  const merge = k => [...new Set(all.flatMap(x => x[k]))];

  const whats = merge('whats');
  const phones = merge('phones').filter(p => !whats.includes(p));
  res.setHeader('Cache-Control', 's-maxage=604800, stale-while-revalidate=2592000');
  return res.status(200).json({
    ok: true,
    site: home.url,
    whatsapp: whats.slice(0, 4).map(fmtPhone),
    phones: phones.slice(0, 6).map(fmtPhone),
    emails: merge('emails').slice(0, 5),
    instagram: merge('instagram').slice(0, 2),
    facebook: merge('facebook').slice(0, 2),
    linkedin: merge('linkedin').slice(0, 2),
    pagesRead: 1 + pages.filter(Boolean).length,
    https: new URL(home.url).protocol === 'https:',
    responsive: /<meta[^>]+name=["']viewport["']/i.test(home.html),
  });
}

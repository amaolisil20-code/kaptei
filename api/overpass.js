// Busca no mapa aberto (OpenStreetMap).
// 1) Acha o retângulo da cidade ou do estado no Nominatim.
// 2) Roda a consulta no Overpass dentro desse retângulo, tentando vários servidores.

const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const UA = 'Kaptei/1.0 (ferramenta pessoal de prospeccao)';

async function bboxFor(city, state) {
  const p = new URLSearchParams({ country: 'Brasil', format: 'jsonv2', limit: '1' });
  if (city) p.set('city', city);
  if (state) p.set('state', state);
  const r = await fetch('https://nominatim.openstreetmap.org/search?' + p, { headers: { 'User-Agent': UA, 'Accept-Language': 'pt-BR' } });
  if (!r.ok) throw new Error('Nominatim HTTP ' + r.status);
  const j = await r.json();
  if (!j.length) return null;
  const [s, n, w, e] = j[0].boundingbox.map(Number);
  return `${s},${w},${n},${e}`;
}

export default async function handler(req, res) {
  const q = String(req.query?.data ?? '');
  const city = String(req.query?.city ?? '').slice(0, 80);
  const state = String(req.query?.state ?? '').slice(0, 40);
  if (!q || q.length > 6000) return res.status(400).json({ error: 'Consulta inválida.' });

  let query = q;
  if (q.includes('{{bbox}}')) {
    let bbox;
    try { bbox = await bboxFor(city, state); } catch (e) { return res.status(502).json({ error: 'Não consegui localizar a cidade agora.', detalhes: [e.message] }); }
    if (!bbox) return res.status(404).json({ error: `Não encontrei "${city || state}" no mapa.` });
    query = q.replaceAll('{{bbox}}', bbox);
  }

  const errors = [];
  const deadline = Date.now() + 55000;
  for (const url of MIRRORS) {
    const left = deadline - Date.now();
    if (left < 3000) break;
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), Math.min(left, 25000));
    try {
      const r = await fetch(url, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
        signal: ctl.signal,
      });
      clearTimeout(to);
      if (r.ok) {
        const text = await r.text();
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
        return res.status(200).send(text);
      }
      errors.push(`${new URL(url).host}: HTTP ${r.status}`);
    } catch (e) {
      clearTimeout(to);
      errors.push(`${new URL(url).host}: ${e.name === 'AbortError' ? 'tempo esgotado' : e.message}`);
    }
  }
  return res.status(502).json({ error: 'Nenhum servidor do mapa respondeu.', detalhes: errors });
}

// Busca em lugares do Overture Maps (base aberta: Meta, Microsoft, Amazon, TomTom).
// Lê só o pedaço da cidade direto do arquivo público na nuvem (DuckDB), sem baixar a base.
// Recebe: city, state, cats (padrões de categoria, ex.: "dent%,gym"), words (palavras do nome), limit.

import { DuckDBInstance } from '@duckdb/node-api';

const UA = 'Kaptei/1.0 (ferramenta pessoal de prospeccao)';
const BUCKET = 'https://overturemaps-us-west-2.s3.amazonaws.com';
const FALLBACK_RELEASE = 'release/2026-09-23.1/';

let conn = null;
let releaseCache = { at: 0, path: FALLBACK_RELEASE };

async function bboxFor(city, state) {
  const p = new URLSearchParams({ country: 'Brasil', format: 'jsonv2', limit: '1' });
  if (city) p.set('city', city);
  if (state) p.set('state', state);
  const r = await fetch('https://nominatim.openstreetmap.org/search?' + p, { headers: { 'User-Agent': UA, 'Accept-Language': 'pt-BR' } });
  if (!r.ok) throw new Error('Nominatim HTTP ' + r.status);
  const j = await r.json();
  if (!j.length) return null;
  const [s, n, w, e] = j[0].boundingbox.map(Number);
  return { s, n, w, e };
}

async function latestRelease() {
  if (Date.now() - releaseCache.at < 6 * 3600e3) return releaseCache.path;
  try {
    const r = await fetch(`${BUCKET}/?list-type=2&prefix=release/&delimiter=/`, { signal: AbortSignal.timeout(5000) });
    const prefixes = [...(await r.text()).matchAll(/<Prefix>(release\/[^<]+\/)<\/Prefix>/g)].map(m => m[1]).sort();
    if (prefixes.length) releaseCache = { at: Date.now(), path: prefixes[prefixes.length - 1] };
  } catch { releaseCache.at = Date.now(); }
  return releaseCache.path;
}

async function getConn() {
  if (conn) return conn;
  const db = await DuckDBInstance.create(':memory:');
  const c = await db.connect();
  await c.run("SET home_directory='/tmp'; SET extension_directory='/tmp/duckdb_ext';");
  await c.run("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';");
  conn = c;
  return c;
}

const lit = s => "'" + String(s).replace(/'/g, "''") + "'";
const list = (v, max) => String(v || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean).slice(0, max);
const num = v => (typeof v === 'bigint' ? Number(v) : v);
const plain = v => (v && Array.isArray(v.items) ? v.items.map(num) : num(v));
const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export default async function handler(req, res) {
  const city = String(req.query?.city ?? '').slice(0, 80);
  const state = String(req.query?.state ?? '').slice(0, 40);
  const limit = Math.min(Math.max(parseInt(req.query?.limit) || 500, 1), 1000);
  // Só letras minúsculas, _ e % nas categorias; só letras e números nas palavras (evita injeção de SQL).
  const cats = list(req.query?.cats, 20).filter(s => /^[a-z_%]+$/.test(s));
  const words = list(req.query?.words, 6).filter(s => /^[a-z0-9]+$/.test(s));
  if (!cats.length && !words.length) return res.status(400).json({ error: 'Consulta inválida.' });
  if (!city && !state) return res.status(400).json({ error: 'Informe a cidade.' });

  let box;
  try { box = await bboxFor(city, state); }
  catch (e) { return res.status(502).json({ error: 'Não consegui localizar a cidade agora.', detalhes: [e.message] }); }
  if (!box) return res.status(404).json({ error: `Não encontrei "${city || state}" no mapa.` });

  const match = [];
  if (cats.length) match.push('(' + cats.map(c => `taxonomy.primary ilike ${lit(c)} or basic_category ilike ${lit(c)}`).join(' or ') + ')');
  if (words.length) match.push('(' + words.map(w => `strip_accents(lower(names.primary)) like ${lit('%' + w + '%')}`).join(' and ') + ')');

  try {
    const c = await getConn();
    const rel = await latestRelease();
    const sql = `
      select id, names.primary as nome, taxonomy.primary as cat, basic_category as bcat, confidence as conf,
             phones, websites, emails, socials,
             addresses[1].freeform as endereco, addresses[1].locality as cidade, addresses[1].region as uf,
             (bbox.xmin + bbox.xmax) / 2 as lon, (bbox.ymin + bbox.ymax) / 2 as lat
      from read_parquet('s3://overturemaps-us-west-2/${rel}theme=places/type=place/*', hive_partitioning=1)
      where bbox.xmin between ${box.w} and ${box.e} and bbox.ymin between ${box.s} and ${box.n}
        and coalesce(operating_status, 'open') <> 'closed' and names.primary is not null
        ${city ? `and (addresses[1].locality is null or strip_accents(lower(addresses[1].locality)) = ${lit(fold(city))})` : ''}
        and (${match.join(' or ')})
      order by (len(phones) > 0) desc, confidence desc nulls last
      limit ${limit}`;
    const r = await c.runAndReadAll(sql);
    const rows = r.getRowObjects().map(o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, plain(v)])));
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json({ release: rel, rows });
  } catch (e) {
    conn = null;
    return res.status(502).json({ error: 'A base Overture não respondeu agora.', detalhes: [String(e.message || e).slice(0, 300)] });
  }
}

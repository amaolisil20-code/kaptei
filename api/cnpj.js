// Busca na base CNPJ enxuta (Receita Federal) por ramo (CNAE) e cidade, já com telefone.
// A base é um Parquet por UF, ordenado por cidade e CNAE, hospedado no Hugging Face (privado).
// O DuckDB lê só os blocos da cidade pedida, então cada busca baixa poucos MB.
//
// Variáveis de ambiente (Vercel):
//   CNPJ_BASE  endereço da pasta com uf=XX/dados.parquet
//              ex.: https://huggingface.co/datasets/USUARIO/kaptei-cnpj/resolve/main  (ou uma pasta local, nos testes)
//   HF_TOKEN   token de leitura do Hugging Face (só se o dataset for privado)
// Recebe: uf, city, cnaes (prefixos só com números, separados por vírgula), limit.

import { DuckDBInstance } from '@duckdb/node-api';

let conn = null, secretFor = '';

async function getConn(base) {
  if (!conn) {
    const db = await DuckDBInstance.create(':memory:');
    conn = await db.connect();
    await conn.run("SET home_directory='/tmp'; SET extension_directory='/tmp/duckdb_ext';");
    await conn.run('INSTALL httpfs; LOAD httpfs; SET parquet_metadata_cache=true;');
  }
  const token = process.env.HF_TOKEN || '';
  if (/^https?:/.test(base) && token && secretFor !== token) {
    const scope = base.replace(/'/g, '');
    await conn.run(`CREATE OR REPLACE SECRET kaptei_hf (TYPE http, EXTRA_HTTP_HEADERS MAP {'Authorization': 'Bearer ${token.replace(/[^A-Za-z0-9_\-]/g, '')}'}, SCOPE '${scope}')`);
    secretFor = token;
  }
  return conn;
}

const lit = s => "'" + String(s).replace(/'/g, "''") + "'";
const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
const num = v => (typeof v === 'bigint' ? Number(v) : v);
const UFS = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));

function phone(ddd, tel) {
  let t = String(tel || '').replace(/\D/g, '');
  if (t.length === 8 && /^[6-9]/.test(t)) t = '9' + t; // celular antigo: a Receita guarda sem o 9 extra
  const d = String(ddd || '').replace(/\D/g, '').replace(/^0+/, '');
  if (!t || d.length !== 2 || (t.length !== 8 && t.length !== 9)) return '';
  if (/^(\d)\1+$/.test(t)) return '';
  return `(${d}) ${t.slice(0, -4)}-${t.slice(-4)}`;
}

export default async function handler(req, res) {
  const base = String(process.env.CNPJ_BASE || '').replace(/\/$/, '');
  if (!base) return res.status(503).json({ error: 'Base CNPJ não configurada.', rows: [] });
  const uf = String(req.query?.uf ?? '').toUpperCase();
  const city = fold(req.query?.city ?? '').slice(0, 80);
  const limit = Math.min(Math.max(parseInt(req.query?.limit) || 300, 1), 1000);
  // só números nos CNAE (evita injeção de SQL)
  const cnaes = String(req.query?.cnaes ?? '').split(',').map(s => s.trim()).filter(s => /^\d{2,7}$/.test(s)).slice(0, 12);
  if (!UFS.has(uf) || !city || !cnaes.length) return res.status(400).json({ error: 'Consulta inválida.', rows: [] });

  try {
    const c = await getConn(base);
    const sql = `
      select cnpj, matriz, fantasia, razao, natureza, porte, cnae, logradouro, numero, complemento, bairro, cep, uf, cidade_nome as cidade,
             ddd1, tel1, ddd2, tel2, email, inicio
      from read_parquet(${lit(`${base}/uf=${uf}/dados.parquet`)})
      where cidade = ${lit(city)} and (${cnaes.map(x => `cnae like ${lit(x + '%')}`).join(' or ')})
      order by regexp_matches(tel1, '^[6-9]') desc, (matriz = '1') desc
      limit ${limit}`;
    const r = await c.runAndReadAll(sql);
    const rows = r.getRowObjects().map(o => {
      const x = Object.fromEntries(Object.entries(o).map(([k, v]) => [k, num(v)]));
      return {
        cnpj: x.cnpj, nome: x.fantasia || x.razao, razao: x.razao, cnae: x.cnae, porte: x.porte, mei: x.natureza === '2135', matriz: x.matriz === '1',
        endereco: [[x.logradouro, x.numero].filter(Boolean).join(', '), x.bairro].filter(Boolean).join(' · '),
        cep: x.cep, cidade: x.cidade, uf: x.uf,
        phones: [phone(x.ddd1, x.tel1), phone(x.ddd2, x.tel2)].filter(Boolean),
        email: x.email || '', inicio: x.inicio,
      };
    });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json({ rows });
  } catch (e) {
    conn = null; secretFor = '';
    const msg = String(e.message || e);
    // UF ainda sem arquivo na base: não é erro para o usuário
    if (/404|No files found/i.test(msg) && /dados\.parquet/.test(msg)) return res.status(200).json({ rows: [], semBase: true });
    return res.status(502).json({ error: 'A base CNPJ não respondeu agora.', detalhes: [msg.slice(0, 300)], rows: [] });
  }
}

// Monta a base CNPJ enxuta do Kaptei a partir do espelho público em Parquet (Receita Federal).
// Mantém só estabelecimentos ATIVOS com telefone ou e-mail e grava um arquivo por UF, ordenado por
// cidade e CNAE, em blocos pequenos: assim a busca lê poucos MB em vez da base inteira (73 milhões de linhas).
//
// Uso:  node scripts/build-cnpj.mjs <pasta-de-saida> [UF,UF,...|todas] [AAAA-MM]
// Ex.:  node scripts/build-cnpj.mjs ../cnpj-out MG 2026-09
import { DuckDBInstance } from '@duckdb/node-api';
import fs from 'node:fs';
import path from 'node:path';

const out = path.resolve(process.argv[2] || '');
const ufArg = (process.argv[3] || 'MG').toUpperCase();
const comp = process.argv[4] || '2026-09';
if (!process.argv[2]) { console.error('Informe a pasta de saída.'); process.exit(1); }
const UFS = ufArg === 'TODAS' ? 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ') : ufArg.split(',');
const base = `https://huggingface.co/datasets/cnpjaberto/cnpj-dados-receita-brasil-${comp}/resolve/main/`;
const files = dir => Array.from({ length: 10 }, (_, i) => `'${base}${dir}/${dir}${i}.parquet'`).join(',');

const c = await (await DuckDBInstance.create(':memory:')).connect();
await c.run('INSTALL httpfs; LOAD httpfs; SET threads=4;');
fs.mkdirSync(out, { recursive: true });

// Tabelas de apoio pequenas
await c.run(`create table mun as select codigo, descricao from read_parquet('${base}municipios/municipios.parquet')`);

for (const uf of [...new Set(UFS)]) {
  const t0 = Date.now();
  console.log(`[${uf}] lendo estabelecimentos ativos…`);
  await c.run(`create or replace table est as
    select cnpj_basico, cnpj_ordem, cnpj_dv, identificador_matriz_filial as matriz, nome_fantasia, cnae_fiscal_principal as cnae,
           cnae_fiscal_secundaria as cnae2, tipo_logradouro, logradouro, numero, complemento, bairro, cep, uf, municipio,
           nullif(ddd1,'') as ddd1, nullif(telefone1,'') as tel1, nullif(ddd2,'') as ddd2, nullif(telefone2,'') as tel2,
           lower(nullif(correio_eletronico,'')) as email, data_inicio_atividade as inicio
    from read_parquet([${files('estabelecimentos')}])
    where uf='${uf}' and situacao_cadastral='02' and (telefone1 is not null and telefone1<>'' or telefone2 is not null and telefone2<>'' or correio_eletronico is not null and correio_eletronico<>'')`);
  const n = (await c.runAndReadAll('select count(*) from est')).getRows()[0][0];
  console.log(`[${uf}] ${n} estabelecimentos. Juntando razão social e porte…`);
  const dest = path.join(out, `uf=${uf}`);
  fs.mkdirSync(dest, { recursive: true });
  const file = path.join(dest, 'dados.parquet').replace(/\\/g, '/');
  await c.run(`copy (
    select e.cnpj_basico || e.cnpj_ordem || e.cnpj_dv as cnpj, e.matriz, e.nome_fantasia as fantasia, emp.razao_social as razao,
           emp.natureza_juridica as natureza, emp.porte_empresa as porte, e.cnae, e.cnae2,
           trim(coalesce(e.tipo_logradouro,'') || ' ' || coalesce(e.logradouro,'')) as logradouro, e.numero, e.complemento, e.bairro, e.cep,
           e.uf, upper(strip_accents(m.descricao)) as cidade, m.descricao as cidade_nome,
           e.ddd1, e.tel1, e.ddd2, e.tel2, e.email, e.inicio
    from est e
    join (select cnpj_basico, razao_social, natureza_juridica, porte_empresa from read_parquet([${files('empresas')}])) emp using (cnpj_basico)
    left join mun m on m.codigo = e.municipio
    order by cidade, e.cnae
  ) to '${file}' (format parquet, compression zstd, row_group_size 100000)`);
  const mb = (fs.statSync(file).size / 1e6).toFixed(1);
  console.log(`[${uf}] pronto: ${file} (${mb} MB) em ${Math.round((Date.now() - t0) / 1000)}s`);
}
fs.writeFileSync(path.join(out, 'LEIAME.txt'), `Base CNPJ enxuta do Kaptei. Competência ${comp}. Fonte: Receita Federal (dados abertos) via espelho cnpjaberto no Hugging Face.\nFiltro: situação cadastral ATIVA e com telefone ou e-mail. Gerada por scripts/build-cnpj.mjs.\n`);
console.log('Concluído.');

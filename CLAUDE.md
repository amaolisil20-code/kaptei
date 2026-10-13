# Kaptei — contexto para o Claude Code

Ferramenta pessoal de prospecção da Amanda (Venturi Holding). Busca empresas, puxa contatos e abre o WhatsApp com mensagens prontas. Uso interno, não é produto à venda. Regra de custo: tudo deve rodar em planos gratuitos.

## Estrutura
- `index.html` — página única (HTML + CSS). Marca: roxo sólido `#6D3FE8` (sem degradê), fonte Sora, barra lateral roxa com a logo branca.
- `app.js` — toda a lógica do front (busca, leads, scripts, exportação CSV). Hoje salva tudo em `localStorage` (chave `kaptei.v1`).
- `logo.svg` — logo vetorizada (também é o favicon).
- `api/overpass.js` — função da Vercel: acha o retângulo da cidade no Nominatim e consulta o OpenStreetMap (Overpass) tentando 4 servidores.
- `api/site.js` — função da Vercel: lê o site da empresa + páginas de contato e devolve telefones, WhatsApp, e-mails e redes. Tem proteção contra endereços internos (SSRF).
- `supabase/schema.sql` — tabelas `lists`, `leads`, `scripts` com RLS por usuário. JÁ APLICADO no projeto Supabase `kaptei` (ref `rsidskitgowgilsynzae`, URL https://rsidskitgowgilsynzae.supabase.co, região sa-east-1, org da Venturi). Ligado ao front (login por link mágico em app.js).

## Fontes de dados (todas grátis)
- OpenStreetMap via `/api/overpass` (cobertura de telefone baixa)
- Receita Federal: BrasilAPI e minhareceita.org (consulta por CNPJ, com sócios), chamadas direto do navegador
- IBGE: lista de cidades e CNAE
- Sites das empresas via `/api/site`

## Deploy
- Vercel, projeto `kaptei` (time `amaolisil20-codes-projects`). Endereço público: https://kaptei.vercel.app
- Site estático + funções em `api/` (Node, ESM — `package.json` tem `"type": "module"`). Sem etapa de build.

## Próximos passos combinados
1. Ligar o front ao Supabase (projeto `rsidskitgowgilsynzae`) — usar SOMENTE a organização da conta amanda.silva@venturiholding.com.br (org `egwksqxdzzukarkhlsnp`), nunca a conta pessoal do Gmail: o schema já está aplicado; falta adicionar login por e-mail e trocar o `localStorage` pelas tabelas, mantendo o mesmo formato de lead.
2. Base CNPJ nacional (dados abertos da Receita → Parquet hospedado grátis) para busca por ramo/cidade com telefone.
3. Google Places só se a Amanda decidir cadastrar cartão (cota travada em 1.000/mês).
4. Perfil @ do Instagram pela API oficial da Meta.

## Cuidados
- LGPD: dados de pessoa física (sócios, MEI) só para prospecção com opção de não receber mais contato.
- Não fazer raspagem de Instagram, LinkedIn ou Google.

(()=>{
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();
const UFS=[['AC','Acre'],['AL','Alagoas'],['AP','Amapá'],['AM','Amazonas'],['BA','Bahia'],['CE','Ceará'],['DF','Distrito Federal'],['ES','Espírito Santo'],['GO','Goiás'],['MA','Maranhão'],['MT','Mato Grosso'],['MS','Mato Grosso do Sul'],['MG','Minas Gerais'],['PA','Pará'],['PB','Paraíba'],['PR','Paraná'],['PE','Pernambuco'],['PI','Piauí'],['RJ','Rio de Janeiro'],['RN','Rio Grande do Norte'],['RS','Rio Grande do Sul'],['RO','Rondônia'],['RR','Roraima'],['SC','Santa Catarina'],['SP','São Paulo'],['SE','Sergipe'],['TO','Tocantins']];

/* ---------- storage ---------- */
const KEY='kaptei.v1';
const DEFAULT_SCRIPTS=[
 {id:'s1',name:'Primeiro contato',text:'{saudacao}! Tudo bem? Falo com a {empresa}?\n\nMeu nome é Amanda, sou da Venturi. Trabalhamos com [seu produto] para empresas de {ramo} aqui em {cidade}.\n\nPosso te mandar uma explicação rápida de como funciona?'},
 {id:'s2',name:'Retorno (sem resposta)',text:'{saudacao}! Passando para retomar minha mensagem anterior para a {empresa}.\n\nSe fizer sentido, te explico em 5 minutos como [seu produto] ajuda empresas de {ramo}. Qual o melhor horário para você?'},
 {id:'s3',name:'Convite para reunião',text:'{saudacao}! Aqui é a Amanda, da Venturi.\n\nGostaria de agendar uma conversa rápida com o responsável pela {empresa} para apresentar [seu produto]. Você teria um horário esta semana?'}];
let store={leads:[],lists:['Geral'],scripts:DEFAULT_SCRIPTS,activeScript:'s1'};
try{const raw=localStorage.getItem(KEY); if(raw){const p=JSON.parse(raw); store={leads:p.leads||[],lists:p.lists?.length?p.lists:['Geral'],scripts:Array.isArray(p.scripts)?p.scripts:DEFAULT_SCRIPTS,activeScript:p.activeScript||'s1'};}}catch(e){}
const persist=()=>{try{localStorage.setItem(KEY,JSON.stringify(store))}catch(e){toast('Não foi possível salvar neste navegador.')}};

function toast(msg){const t=$('#toast');t.textContent=msg;t.hidden=false;clearTimeout(toast._t);toast._t=setTimeout(()=>t.hidden=true,2600)}

/* ---------- navigation ---------- */
function go(p){$$('.page').forEach(s=>s.hidden=s.id!=='p-'+p);
  $$('.nav button').forEach(b=>{if(b.dataset.go===p)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
  if(p==='leads')renderLeads(); if(p==='fontes')renderLists(); if(p==='scripts')renderScripts(); renderScriptBars(); window.scrollTo(0,0);}
$$('.nav button').forEach(b=>b.addEventListener('click',()=>go(b.dataset.go)));

/* ---------- filters ---------- */
const ufSel=$('#uf');
UFS.forEach(([s,n])=>ufSel.insertAdjacentHTML('beforeend',`<option value="${s}">${n}</option>`));
let cityMap={};
async function loadCities(uf){
  $('#cities').innerHTML='';cityMap={};$('#city').value='';
  if(!uf)return;
  try{const r=await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`);
    const d=await r.json(); d.forEach(m=>{cityMap[norm(m.nome)]={id:String(m.id),nome:m.nome}});
    $('#cities').innerHTML=d.map(m=>`<option value="${esc(m.nome)}">`).join('');
  }catch(e){toast('Não consegui carregar as cidades. A busca pelo estado inteiro continua funcionando.')}
}
ufSel.addEventListener('change',()=>{loadCities(ufSel.value);try{localStorage.setItem('kaptei.uf',ufSel.value)}catch(e){}});
try{const u=localStorage.getItem('kaptei.uf');if(u){ufSel.value=u;loadCities(u)}}catch(e){}

/* ---------- modes ---------- */
let mode='empresas';
$$('.modes button').forEach(b=>b.addEventListener('click',()=>{
  mode=b.dataset.mode;$$('.modes button').forEach(x=>x.setAttribute('aria-pressed',x===b));
  $('#filtersEmp').hidden=mode!=='empresas';
  $('#q').placeholder=mode==='empresas'?'Ex.: clínicas odontológicas, imobiliárias, academias…':mode==='cnpj'?'Digite o CNPJ, por exemplo 00.000.000/0001-91':'Ex.: @clinicaexemplo';
  $('#results').innerHTML='';$('#cnaeHint').hidden=true;
  if(mode==='perfil')$('#results').innerHTML=`<div class="notice info"><b>Busca por perfil @ chega na etapa 3.</b> Ela usa a API oficial do Instagram, que é gratuita mas precisa de um app na Meta ligado a uma conta comercial. Enquanto isso, use a busca de Empresas: quando a empresa tem Instagram cadastrado, ele aparece no resultado.</div>`;
  $('#q').focus();
}));

/* ---------- term → map categories ---------- */
const TAGS=[
 {k:['dentist','odonto','dental','ortodont'],t:['amenity=dentist','healthcare=dentist'],c:'Odontologia'},
 {k:['academia','crossfit','fitness','musculacao','pilates','funcional'],t:['leisure=fitness_centre','leisure=sports_centre'],c:'Academia'},
 {k:['restaurante','restaurant','churrascaria'],t:['amenity=restaurant'],c:'Restaurante'},
 {k:['lanchonete','hamburg','pizzaria','pizza','fast food','acai'],t:['amenity=fast_food','amenity=restaurant','amenity=ice_cream'],c:'Alimentação'},
 {k:['cafeteria','cafe '],t:['amenity=cafe'],c:'Café'},
 {k:['bar ','bares','boteco','pub','choperia'],t:['amenity=bar','amenity=pub'],c:'Bar'},
 {k:['imobiliari','imoveis','corretor de imo'],t:['office=estate_agent'],c:'Imobiliária'},
 {k:['laboratorio','analises clinicas','exame'],t:['healthcare=laboratory'],c:'Laboratório'},
 {k:['clinica','consultorio','medic'],t:['amenity=clinic','healthcare=clinic','amenity=doctors','healthcare=doctor'],c:'Clínica',generic:true},
 {k:['hospital'],t:['amenity=hospital'],c:'Hospital'},
 {k:['farmacia','drogaria'],t:['amenity=pharmacy','shop=chemist'],c:'Farmácia'},
 {k:['veterinari','petshop','pet shop','pet '],t:['amenity=veterinary','shop=pet'],c:'Pet'},
 {k:['advoga','advocacia','juridic'],t:['office=lawyer'],c:'Advocacia'},
 {k:['contab','contador'],t:['office=accountant','office=tax_advisor'],c:'Contabilidade'},
 {k:['salao','cabeleire','barbearia','beleza','estetica','manicure'],t:['shop=hairdresser','shop=beauty'],c:'Beleza'},
 {k:['padaria','panificadora','confeitaria'],t:['shop=bakery','shop=pastry'],c:'Padaria'},
 {k:['supermercado','mercado','mercearia','hortifruti'],t:['shop=supermarket','shop=convenience','shop=greengrocer'],c:'Mercado'},
 {k:['escola','colegio','curso','idioma','faculdade'],t:['amenity=school','amenity=language_school','amenity=college','amenity=university'],c:'Educação'},
 {k:['oficina','mecanic','autopeca','auto peca','funilaria'],t:['shop=car_repair','shop=car_parts','shop=tyres'],c:'Automotivo'},
 {k:['otica'],t:['shop=optician'],c:'Ótica'},
 {k:['psicolog','terapia','terapeut'],t:['healthcare=psychotherapist'],c:'Psicologia'},
 {k:['fisioterap'],t:['healthcare=physiotherapist'],c:'Fisioterapia'},
 {k:['nutricion'],t:['healthcare=nutrition_counselling'],c:'Nutrição'},
 {k:['hotel','pousada','hostel','motel'],t:['tourism=hotel','tourism=guest_house','tourism=hostel','tourism=motel'],c:'Hospedagem'},
 {k:['roupa','moda','boutique','vestuario'],t:['shop=clothes','shop=boutique'],c:'Moda'},
 {k:['construtora','construcao','engenharia'],t:['office=construction_company','shop=hardware','shop=doityourself','office=engineer'],c:'Construção'},
 {k:['seguro','seguradora'],t:['office=insurance'],c:'Seguros'},
 {k:['coworking'],t:['amenity=coworking_space','office=coworking'],c:'Coworking'},
 {k:['software','tecnologia','informatica','sistemas'],t:['office=it','shop=computer','office=telecommunication'],c:'Tecnologia'},
 {k:['agencia de marketing','marketing','publicidade'],t:['office=advertising_agency'],c:'Marketing'},
 {k:['igreja','templo'],t:['amenity=place_of_worship'],c:'Igreja'},
 {k:['eventos','buffet','festa'],t:['amenity=events_venue','shop=party'],c:'Eventos'},
 {k:['moveis','decoracao','planejados'],t:['shop=furniture','shop=interior_decoration'],c:'Móveis'},
 {k:['joia','relojoaria'],t:['shop=jewelry','shop=watches'],c:'Joalheria'},
 {k:['floricultura','flores'],t:['shop=florist'],c:'Floricultura'},
];
function matchTags(term){
  const n=' '+norm(term)+' ';
  let hits=TAGS.filter(x=>x.k.some(k=>n.includes(k)));
  if(hits.some(h=>!h.generic))hits=hits.filter(h=>!h.generic);
  return hits;
}
const CATLABEL={};TAGS.forEach(x=>x.t.forEach(t=>CATLABEL[t]=x.c));
function nameRegex(term){
  const words=norm(term).replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(w=>w.length>=3);
  if(!words.length)return null;
  const map={a:'[aáàâã]',e:'[eéê]',i:'[ií]',o:'[oóôõ]',u:'[uúü]',c:'[cç]'};
  const stems=words.map(w=>w.length>5?w.replace(/(s|es)$/,'').slice(0,Math.max(4,w.length-3)):w);
  return stems.map(s=>s.split('').map(ch=>map[ch]||ch).join('')).join('.*');
}

/* ---------- Overpass (OpenStreetMap) ---------- */
async function overpass(q,city,state){
  const ctl=new AbortController();const to=setTimeout(()=>ctl.abort(),65000);
  try{const r=await fetch('/api/overpass?'+new URLSearchParams({data:q,city:city||'',state:state||''}),{signal:ctl.signal});
    clearTimeout(to); if(r.ok)return await r.json();
    let msg='HTTP '+r.status;try{const j=await r.json();msg=(j.detalhes||[]).join(' · ')||j.error||msg}catch(e){}
    throw new Error(msg);
  }catch(e){clearTimeout(to);throw e}
}
function buildQuery(term){
  const hits=matchTags(term), rx=nameRegex(term);
  const parts=[];
  hits.forEach(h=>h.t.forEach(t=>{const [k,v]=t.split('=');parts.push(`nwr["${k}"="${v}"]({{bbox}});`)}));
  if(rx)parts.push(`nwr["name"~"${rx}",i][~"^(shop|amenity|office|craft|healthcare|leisure|tourism)$"~"."]({{bbox}});`);
  return {q:`[out:json][timeout:25];(${parts.join('')});out center tags 400;`,hits};
}
const first=(t,...ks)=>{for(const k of ks)if(t[k])return t[k];return ''};
const digits=s=>String(s||'').replace(/\D/g,'');
function waLink(phone){let d=digits(phone);if(!d)return '';if(d.startsWith('0'))d=d.replace(/^0+/,'');if(!d.startsWith('55'))d='55'+d;return d.length>=12?`https://wa.me/${d}`:''}
function igLink(v){if(!v)return '';if(/^https?:/i.test(v))return v;return 'https://instagram.com/'+v.replace(/^@/,'')}
function webLink(v){if(!v)return '';return /^https?:/i.test(v)?v:'https://'+v}
function catOf(t){for(const k of ['healthcare','amenity','shop','office','leisure','tourism','craft']){if(t[k]){const l=CATLABEL[k+'='+t[k]];return l||t[k].replace(/_/g,' ')}}return ''}
function toLead(el,cityName,uf){
  const t=el.tags||{};
  const phones=[first(t,'phone','contact:phone'),first(t,'mobile','contact:mobile'),first(t,'contact:whatsapp','whatsapp')].join(';').split(/[;,]/).map(s=>s.trim()).filter(Boolean);
  const addr=[[t['addr:street'],t['addr:housenumber']].filter(Boolean).join(', '),t['addr:suburb']].filter(Boolean).join(' · ');
  return {id:'osm:'+el.type+'/'+el.id,whatsapp:[],linkedin:'',source:'Mapa aberto',name:t.name||t.brand||'(sem nome)',cat:catOf(t),
    phones:[...new Set(phones)],email:first(t,'email','contact:email'),website:webLink(first(t,'website','contact:website','url')),
    instagram:igLink(first(t,'contact:instagram','instagram')),facebook:first(t,'contact:facebook','facebook'),
    address:addr,city:t['addr:city']||cityName||'',uf,cnpj:digits(first(t,'ref:vatin','ref:CNPJ','cnpj')).slice(-14),
    lat:el.lat??el.center?.lat,lon:el.lon??el.center?.lon,socios:[]};
}

/* ---------- CNAE hint (IBGE) ---------- */
let cnaeCache=null;
async function showCnae(term){
  const box=$('#cnaeHint');
  try{
    if(!cnaeCache){const r=await fetch('https://servicodados.ibge.gov.br/api/v2/cnae/subclasses');cnaeCache=(await r.json()).map(x=>({id:x.id,d:x.descricao,n:norm(x.descricao)}))}
    const words=norm(term).split(/\s+/).filter(w=>w.length>=4).map(w=>w.slice(0,Math.max(4,w.length-3)));
    if(!words.length){box.hidden=true;return}
    const m=cnaeCache.map(c=>({...c,s:words.filter(w=>c.n.includes(w)).length})).filter(c=>c.s).sort((a,b)=>b.s-a.s).slice(0,4);
    if(!m.length){box.hidden=true;return}
    box.innerHTML='<span>Ramos oficiais (CNAE) desse termo:</span>'+m.map(c=>`<span class="tag" title="${esc(c.d)}">${esc(c.id.replace(/^(\d{4})(\d)(\d{2})$/,'$1-$2/$3'))} · ${esc(c.d.length>42?c.d.slice(0,40)+'…':c.d)}</span>`).join('');
    box.hidden=false;
  }catch(e){box.hidden=true}
}

/* ---------- render helpers ---------- */
const isSaved=id=>store.leads.some(l=>l.id===id);
function contactsHTML(l){
  const rows=[];
  (l.whatsapp||[]).forEach(p=>{const w=waLink(p);rows.push(`<div class="row"><span class="k">WhatsApp</span><span class="mono">${esc(p)}</span>${w?` <a href="${w}" target="_blank" rel="noopener">abrir</a>`:''}</div>`)});
  l.phones?.forEach(p=>{const w=waLink(p);rows.push(`<div class="row"><span class="k">Telefone</span><span class="mono">${esc(p)}</span>${w?` <a href="${w}" target="_blank" rel="noopener">WhatsApp</a>`:''}</div>`)});
  if(l.email)rows.push(`<div class="row"><span class="k">E-mail</span><span>${esc(l.email)}</span></div>`);
  if(l.website)rows.push(`<div class="row"><span class="k">Site</span><a href="${esc(l.website)}" target="_blank" rel="noopener">${esc(l.website.replace(/^https?:\/\/(www\.)?/,'').replace(/\/$/,''))}</a></div>`);
  if(l.instagram)rows.push(`<div class="row"><span class="k">Instagram</span><a href="${esc(l.instagram)}" target="_blank" rel="noopener">${esc(l.instagram.replace(/^https?:\/\/(www\.)?instagram\.com\//,'@').replace(/\/$/,''))}</a></div>`);
  if(l.facebook)rows.push(`<div class="row"><span class="k">Facebook</span><a href="${esc(webLink(l.facebook.includes('.')?l.facebook:'facebook.com/'+l.facebook))}" target="_blank" rel="noopener">abrir</a></div>`);
  if(l.linkedin)rows.push(`<div class="row"><span class="k">LinkedIn</span><a href="${esc(l.linkedin)}" target="_blank" rel="noopener">abrir</a></div>`);
  if(l.cnpj&&l.cnpj.length===14)rows.push(`<div class="row"><span class="k">CNPJ</span><span class="mono">${fmtCnpj(l.cnpj)}</span></div>`);
  let st='';
  if(l.enrich==='loading')st='<div class="enrich"><span class="spinner"></span>Lendo o site…</div>';
  else if(l.enrich==='done')st=`<div class="enrich ok">${l.enrichGot?'Contatos puxados do site':'O site não mostra contatos'}</div>`;
  else if(l.enrich==='fail')st=`<div class="enrich">${esc(l.enrichMsg||'O site não abriu.')} <button class="linkbtn" data-enrich="${esc(l.id)}" type="button">Tentar de novo</button></div>`;
  else if(l.website)st=`<div class="enrich"><button class="linkbtn" data-enrich="${esc(l.id)}" type="button">Puxar contatos do site</button></div>`;
  if(!l.website)st=`<form class="siteform" data-siteform="${esc(l.id)}"><input name="site" placeholder="Achou o site? Cole aqui" aria-label="Site da empresa" autocomplete="off"><button class="btn ghost sm" type="submit">Ler site</button></form>`;
  return (rows.length?rows.join(''):'<span class="none">Sem contato no mapa.</span>')+st;
}
const gq=l=>encodeURIComponent([l.name,l.city,l.uf].filter(Boolean).join(' '));
function leadRow(l){
  const saved=isSaved(l.id);
  return `<div class="lead" data-id="${esc(l.id)}">
    <div><div class="name">${esc(l.name)}</div>
      <div class="meta">${l.cat?`<span class="cat">${esc(l.cat)}</span>`:''}${esc([l.address,l.city&&l.uf?l.city+' – '+l.uf:l.city].filter(Boolean).join(' · '))}</div></div>
    <div class="contacts">${contactsHTML(l)}</div>
    <div class="actions">
      ${contactNumber(l)?`<button class="btn sm contact-btn" data-contact="${esc(l.id)}" type="button">Entrar em contato</button>`:''}
      ${saved?'<span class="saved-badge">✓ Salvo</span>':`<button class="btn sm" data-save="${esc(l.id)}" type="button">Salvar lead</button>`}
      <a class="btn ghost sm" href="https://www.google.com/maps/search/?api=1&query=${gq(l)}" target="_blank" rel="noopener">Ver no Google</a>
      <a class="btn ghost sm" href="https://www.google.com/search?q=${gq(l)}+instagram" target="_blank" rel="noopener">Achar Instagram</a>
    </div></div>`;
}

/* ---------- search: empresas ---------- */
let lastResults=[];
const findLead=id=>lastResults.find(x=>x.id===id)||(lastCompany&&lastCompany.id===id?lastCompany:null);
function rerenderLead(l){const el=document.querySelector(`.lead[data-id="${CSS.escape(l.id)}"]`);if(el)el.outerHTML=leadRow(l)}
function mergeInto(l,d){
  const fmt=x=>digits(x);
  const known=new Set([...(l.phones||[]),...(l.whatsapp||[])].map(fmt));
  l.whatsapp=[...(l.whatsapp||[])];
  (d.whatsapp||[]).forEach(p=>{if(!known.has(fmt(p))){l.whatsapp.push(p);known.add(fmt(p))}});
  (d.phones||[]).forEach(p=>{if(!known.has(fmt(p))){l.phones.push(p);known.add(fmt(p))}});
  if(!l.email&&d.emails?.length)l.email=d.emails[0];
  if(!l.instagram&&d.instagram?.length)l.instagram=d.instagram[0];
  if(!l.facebook&&d.facebook?.length)l.facebook=d.facebook[0];
  if(!l.linkedin&&d.linkedin?.length)l.linkedin=d.linkedin[0];
  return !!(d.whatsapp?.length||d.phones?.length||d.emails?.length||d.instagram?.length||d.facebook?.length||d.linkedin?.length);
}
async function enrich(l){
  if(!l||!l.website||l.enrich==='loading')return;
  l.enrich='loading';rerenderLead(l);
  try{
    const r=await fetch('/api/site?'+new URLSearchParams({url:l.website}));
    const d=await r.json();
    if(!r.ok||!d.ok){l.enrich='fail';l.enrichMsg=d.error||'O site não abriu.'}
    else{l.enrichGot=mergeInto(l,d);l.enrich='done'}
  }catch(e){l.enrich='fail';l.enrichMsg='O site não respondeu.'}
  const saved=store.leads.find(x=>x.id===l.id);
  if(saved){Object.assign(saved,{phones:l.phones,whatsapp:l.whatsapp,email:l.email,instagram:l.instagram,facebook:l.facebook,linkedin:l.linkedin,website:l.website});persist()}
  rerenderLead(l);updateHeadCount();
}
async function enrichMany(list){
  const queue=list.filter(l=>l.website&&!l.enrich).slice(0,40);
  const worker=async()=>{while(queue.length){await enrich(queue.shift())}};
  await Promise.all([worker(),worker(),worker()]);
}
const hasContact=l=>(l.phones?.length||l.whatsapp?.length);
function updateHeadCount(){const el=document.querySelector('#withPhone');if(el)el.textContent=lastResults.filter(hasContact).length}
async function searchEmpresas(term){
  const res=$('#results'), uf=ufSel.value;
  if(!uf){res.innerHTML='<div class="notice err">Escolha o estado para buscar. A busca no Brasil inteiro de uma vez chega com a base CNPJ completa (etapa 2).</div>';ufSel.focus();return}
  const cityTxt=$('#city').value.trim(); let city=null;
  if(cityTxt){city=cityMap[norm(cityTxt)];if(!city){res.innerHTML=`<div class="notice err">Não achei a cidade "${esc(cityTxt)}" em ${uf}. Escolha uma da lista ou deixe em branco para buscar no estado todo.</div>`;return}}
  const {q,hits}=buildQuery(term);
  showCnae(term);
  res.innerHTML=`<div class="list"><div class="loading"><span class="spinner"></span>Procurando "${esc(term)}" em ${esc(city?city.nome:UFS.find(u=>u[0]===uf)[1])}… ${city?'':'(no estado todo pode demorar e às vezes não responde; prefira escolher a cidade)'}</div></div>`;
  setBusy(true);
  try{
    const d=await overpass(q,city?.nome,UFS.find(u=>u[0]===uf)[1]);
    const seen=new Set();
    lastResults=d.elements.filter(e=>e.tags&&(e.tags.name||e.tags.brand)).map(e=>toLead(e,city?.nome,uf)).filter(l=>!seen.has(l.id)&&seen.add(l.id));
    lastResults.sort((a,b)=>(!!b.website*2+b.phones.length+!!b.email+!!b.website+!!b.instagram)-(!!a.website*2+a.phones.length+!!a.email+!!a.website+!!a.instagram));
    renderResults(term,hits);
    enrichMany(lastResults);
  }catch(e){res.innerHTML=`<div class="notice err">${city?'Os servidores do mapa aberto não responderam agora. Tente de novo em alguns segundos.':'O estado inteiro é grande demais para o mapa aberto responder de uma vez. Escolha uma cidade.'}<br><span style="font-size:12px;opacity:.8">${esc(e.message||'')}</span></div>`}
  finally{setBusy(false)}
}
function renderResults(term,hits){
  const only=$('#onlyPhone').checked;
  const list=only?lastResults.filter(hasContact):lastResults;
  const withPhone=lastResults.filter(hasContact).length;
  const res=$('#results');
  if(!lastResults.length){res.innerHTML=`<div class="list"><div class="empty"><b>Nenhuma empresa encontrada para "${esc(term)}".</b>Tente um termo mais simples (por exemplo "dentista" em vez de "consultório odontológico infantil") ou busque no estado todo.</div></div>`;return}
  res.innerHTML=`<div class="res-head" style="margin-bottom:12px"><h2>${lastResults.length} empresa${lastResults.length>1?'s':''} encontrada${lastResults.length>1?'s':''}</h2>
    <p><span class="mono" id="withPhone">${withPhone}</span> com telefone${hits.length?` · categorias: ${esc([...new Set(hits.map(h=>h.c))].join(', '))}`:' · busca pelo nome'}</p></div>
    <div class="list">${list.slice(0,300).map(leadRow).join('')||'<div class="empty"><b>Nenhum resultado com telefone.</b>Desmarque "Só com telefone" para ver todos.</div>'}</div>
    ${list.length>300?'<p class="lede" style="margin-top:10px">Mostrando os 300 primeiros. Refine pela cidade para ver o resto.</p>':''}
    <p class="lede" style="margin-top:12px;font-size:12.5px">O mapa aberto não tem todas as empresas. Etapa 2 traz a base completa da Receita.</p>`;
}
$('#onlyPhone').addEventListener('change',()=>{if(lastResults.length&&mode==='empresas')renderResults($('#q').value,matchTags($('#q').value))});

/* ---------- search: CNPJ ---------- */
const fmtCnpj=c=>c.length===14?`${c.slice(0,2)}.${c.slice(2,5)}.${c.slice(5,8)}/${c.slice(8,12)}-${c.slice(12)}`:c;
let lastCompany=null;
async function searchCnpj(raw){
  const c=String(raw).toUpperCase().replace(/[^0-9A-Z]/g,'');const res=$('#results');
  if(c.length!==14){res.innerHTML='<div class="notice err">O CNPJ precisa ter 14 caracteres. Exemplo: 00.000.000/0001-91.</div>';return}
  res.innerHTML='<div class="list"><div class="loading"><span class="spinner"></span>Consultando a Receita Federal…</div></div>';setBusy(true);
  let d=null;
  for(const url of [`https://brasilapi.com.br/api/cnpj/v1/${c}`,`https://minhareceita.org/${c}`]){
    try{const r=await fetch(url);if(r.ok){d=await r.json();break}if(r.status===404){d={_404:true};break}}catch(e){}
  }
  setBusy(false);
  if(!d){res.innerHTML='<div class="notice err">A consulta não respondeu agora. Tente de novo em alguns segundos.</div>';return}
  if(d._404){res.innerHTML=`<div class="notice err">Não encontrei o CNPJ ${esc(fmtCnpj(c))} na Receita. Confira os números.</div>`;return}
  const tel=[d.ddd_telefone_1,d.ddd_telefone_2].map(t=>digits(t)).filter(t=>t.length>=10).map(t=>`(${t.slice(0,2)}) ${t.slice(2,-4)}-${t.slice(-4)}`);
  const sit=d.descricao_situacao_cadastral||'';
  const socios=(d.qsa||[]).map(s=>({nome:s.nome_socio||s.nome_socio_razao_social||'',qual:s.qualificacao_socio||s.codigo_qualificacao_socio||'',faixa:s.faixa_etaria||'',desde:s.data_entrada_sociedade||''}));
  lastCompany={id:'cnpj:'+c,source:'Receita Federal',name:d.nome_fantasia||d.razao_social,razao:d.razao_social,cat:d.cnae_fiscal_descricao||'',
    whatsapp:[],linkedin:'',phones:tel,email:(d.email||'').toLowerCase(),website:'',instagram:'',facebook:'',
    address:[[d.descricao_tipo_de_logradouro,d.logradouro].filter(Boolean).join(' ')+(d.numero?', '+d.numero:''),d.bairro].filter(Boolean).join(' · '),
    city:d.municipio?d.municipio.replace(/\w\S*/g,w=>w[0]+w.slice(1).toLowerCase()):'',uf:d.uf||'',cnpj:c,socios};
  const pill=/ATIVA/i.test(sit)?'ok':/BAIXADA|INAPTA|NULA/i.test(sit)?'err':'warn';
  res.innerHTML=`<div class="panel">
    <div class="res-head"><div><div class="eyebrow">${esc(fmtCnpj(c))}</div><h2 style="font-size:20px;margin-top:4px">${esc(lastCompany.name)}</h2>${d.nome_fantasia?`<div class="meta" style="color:var(--muted);font-size:13px">${esc(d.razao_social)}</div>`:''}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${contactNumber(lastCompany)?`<button class="btn contact-btn" data-contact="${esc(lastCompany.id)}" type="button">Entrar em contato</button>`:''}${isSaved(lastCompany.id)?'<span class="saved-badge">✓ Salvo</span>':`<button class="btn" data-save="${esc(lastCompany.id)}" type="button">Salvar lead</button>`}</div></div>
    <div class="company">
      <dl class="kv">
        <dt>Situação</dt><dd><span class="pill ${pill}">${esc(sit||'—')}</span></dd>
        <dt>Ramo</dt><dd>${esc(d.cnae_fiscal_descricao||'—')}${d.cnae_fiscal?` <span class="mono" style="color:var(--muted)">(${esc(d.cnae_fiscal)})</span>`:''}</dd>
        <dt>Porte</dt><dd>${esc(d.porte||d.descricao_porte||'—')}${d.opcao_pelo_mei?' · MEI':''}</dd>
        <dt>Abertura</dt><dd class="mono">${esc((d.data_inicio_atividade||'—').split('-').reverse().join('/'))}</dd>
      </dl>
      <dl class="kv">
        <dt>Telefone</dt><dd>${tel.length?tel.map(t=>{const w=waLink(t);return `<span class="mono">${esc(t)}</span>${w?` <a href="${w}" target="_blank" rel="noopener">WhatsApp</a>`:''}`}).join('<br>'):'—'}</dd>
        <dt>E-mail</dt><dd>${esc(lastCompany.email||'—')}</dd>
        <dt>Endereço</dt><dd>${esc(lastCompany.address||'—')}<br>${esc([lastCompany.city,lastCompany.uf].filter(Boolean).join(' – '))}${d.cep?` · <span class="mono">${esc(d.cep)}</span>`:''}</dd>
        <dt>Atalhos</dt><dd><a href="https://www.google.com/maps/search/?api=1&query=${gq(lastCompany)}" target="_blank" rel="noopener">Google</a> · <a href="https://www.google.com/search?q=${gq(lastCompany)}+instagram" target="_blank" rel="noopener">Instagram</a></dd>
      </dl>
    </div>
    <div><h2 style="margin-bottom:8px">Sócios e decisores</h2>
      ${socios.length?`<div class="table-wrap"><table><thead><tr><th>Nome</th><th>Cargo</th><th>Faixa etária</th><th>Desde</th></tr></thead><tbody>${socios.map(s=>`<tr><td>${esc(s.nome)}</td><td>${esc(s.qual)}</td><td>${esc(s.faixa||'—')}</td><td class="mono">${esc((s.desde||'—').split('-').reverse().join('/'))}</td></tr>`).join('')}</tbody></table></div>`
      :'<p class="lede" style="margin:0">A Receita não lista sócios para esta empresa (comum em MEI e empresa individual).</p>'}
    </div>
    <p class="lede" style="font-size:12.5px;margin:0">O telefone e o e-mail da Receita às vezes são do contador da empresa.</p>
  </div>`;
}

/* ---------- submit ---------- */
function setBusy(b){const g=$('#go');g.disabled=b;g.innerHTML=b?'<span class="spinner"></span>Buscando':'Buscar'}
$('#searchForm').addEventListener('submit',e=>{e.preventDefault();const q=$('#q').value.trim();
  if(mode==='perfil')return;
  if(!q){$('#q').focus();toast(mode==='cnpj'?'Digite um CNPJ.':'Digite o que você procura.');return}
  mode==='empresas'?searchEmpresas(q):searchCnpj(q)});

/* ---------- save ---------- */
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-save]');if(!b)return;
  const id=b.dataset.save;
  const l=lastResults.find(x=>x.id===id)||(lastCompany&&lastCompany.id===id?lastCompany:null);
  if(!l||isSaved(id))return;
  const list=store.lists[0];
  store.leads.unshift({...l,status:'novo',lista:currentList()||list,notes:'',savedAt:new Date().toISOString()});
  persist();refreshCounts();b.outerHTML='<span class="saved-badge">✓ Salvo</span>';toast(`Salvo em "${currentList()||list}".`);
});
document.addEventListener('click',e=>{const b=e.target.closest('[data-enrich]');if(!b)return;const l=findLead(b.dataset.enrich);if(l){l.enrich='';enrich(l)}});
document.addEventListener('submit',e=>{const f=e.target.closest('[data-siteform]');if(!f)return;e.preventDefault();
  const v=f.site.value.trim();if(!v)return;const l=findLead(f.dataset.siteform);if(!l)return;
  l.website=/^https?:/i.test(v)?v:'https://'+v;l.enrich='';enrich(l)});
/* ---------- scripts + WhatsApp ---------- */
function contactNumber(l){
  const all=[...(l.whatsapp||[]),...(l.phones||[])];
  const mobile=all.find(p=>{const d=digits(p).replace(/^55/,'');return d.length===11&&d[2]==='9'});
  return (l.whatsapp||[])[0]||mobile||all[0]||'';
}
const activeScript=()=>store.scripts.find(s=>s.id===store.activeScript)||store.scripts[0];
function saudacao(){const h=new Date().getHours();return h<12?'Bom dia':h<18?'Boa tarde':'Boa noite'}
function fillScript(text,l){
  return text.replace(/\{saudacao\}/g,saudacao()).replace(/\{empresa\}/g,l.name||'sua empresa')
    .replace(/\{cidade\}/g,l.city||'sua cidade').replace(/\{ramo\}/g,(l.cat||'seu segmento').toLowerCase());
}
function renderScriptBars(){
  const opts=store.scripts.map(s=>`<option value="${esc(s.id)}" ${s.id===store.activeScript?'selected':''}>${esc(s.name||'Sem nome')}</option>`).join('');
  $$('[data-scriptbar]').forEach(el=>{el.innerHTML=store.scripts.length?`<label for="sb-${el.closest('.page').id}">Mensagem do botão "Entrar em contato":</label><select id="sb-${el.closest('.page').id}" data-pickscript>${opts}</select> <button class="linkbtn" type="button" data-goto-scripts>Editar scripts</button>`:'<span>Crie um script para usar o botão "Entrar em contato".</span> <button class="linkbtn" type="button" data-goto-scripts>Criar script</button>'});
}
document.addEventListener('change',e=>{if(e.target.matches('[data-pickscript]')){store.activeScript=e.target.value;persist();renderScriptBars()}});
document.addEventListener('click',e=>{if(e.target.closest('[data-goto-scripts]'))go('scripts')});
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-contact]');if(!b)return;
  const id=b.dataset.contact;
  const l=store.leads.find(x=>x.id===id)||findLead(id);if(!l)return;
  const num=contactNumber(l);const sc=activeScript();
  if(!num){toast('Esse lead não tem telefone.');return}
  let d=digits(num);if(!d.startsWith('55'))d='55'+d;
  const url=`https://wa.me/${d}`+(sc?`?text=${encodeURIComponent(fillScript(sc.text,l))}`:'');
  window.open(url,'_blank','noopener');
  let saved=store.leads.find(x=>x.id===id);
  if(!saved){saved={...l,status:'contatado',lista:store.lists[0],notes:'',savedAt:new Date().toISOString()};store.leads.unshift(saved)}
  if(saved.status==='novo')saved.status='contatado';
  saved.contactedAt=new Date().toISOString();saved.lastScript=sc?.name||'';
  persist();refreshCounts();
  if(!$('#p-leads').hidden)renderLeads();
  else{const row=document.querySelector(`.lead[data-id="${CSS.escape(id)}"]`);if(row)row.outerHTML=leadRow(l)}
  toast('WhatsApp aberto. Lead marcado como contatado.');
});
function renderScripts(){
  const box=$('#scriptsBox');
  if(!store.scripts.length){box.innerHTML='<div class="list" style="grid-column:1/-1"><div class="empty"><b>Nenhum script ainda.</b>Clique em "Novo script" para escrever sua primeira mensagem.</div></div>';return}
  const sample={name:'Clínica Exemplo',city:'Uberlândia',cat:'Odontologia'};
  box.innerHTML=store.scripts.map(s=>`<div class="script ${s.id===store.activeScript?'active':''}" data-script="${esc(s.id)}">
    <input data-sf="name" value="${esc(s.name)}" aria-label="Nome do script" placeholder="Nome do script">
    <textarea data-sf="text" aria-label="Mensagem" placeholder="Escreva a mensagem…">${esc(s.text)}</textarea>
    <div class="eyebrow">Como chega para a empresa (exemplo)</div>
    <div class="preview" data-preview>${esc(fillScript(s.text,sample))}</div>
    <div class="row-actions">${s.id===store.activeScript?'<span class="active-pill">Em uso no botão</span>':`<button class="btn ghost sm" data-usescript type="button">Usar no botão</button>`}
      <button class="btn ghost sm" data-delscript type="button">Excluir</button></div>
  </div>`).join('');
}
let lastField=null;
$('#scriptsBox').addEventListener('focusin',e=>{if(e.target.matches('textarea[data-sf]'))lastField=e.target});
$('#scriptsBox').addEventListener('input',e=>{const f=e.target.dataset.sf;if(!f)return;const card=e.target.closest('[data-script]');const s=store.scripts.find(x=>x.id===card.dataset.script);if(!s)return;
  s[f]=e.target.value;persist();
  if(f==='text')card.querySelector('[data-preview]').textContent=fillScript(s.text,{name:'Clínica Exemplo',city:'Uberlândia',cat:'Odontologia'});
  if(f==='name')renderScriptBars()});
$('#scriptsBox').addEventListener('click',e=>{const card=e.target.closest('[data-script]');if(!card)return;const id=card.dataset.script;
  if(e.target.closest('[data-usescript]')){store.activeScript=id;persist();renderScripts();renderScriptBars();toast('Script em uso no botão.')}
  const del=e.target.closest('[data-delscript]');
  if(del){if(del.dataset.confirm){store.scripts=store.scripts.filter(x=>x.id!==id);if(store.activeScript===id)store.activeScript=store.scripts[0]?.id||'';persist();renderScripts();renderScriptBars();toast('Script excluído.')}
    else{del.dataset.confirm='1';del.textContent='Confirmar';setTimeout(()=>{if(del.isConnected){delete del.dataset.confirm;del.textContent='Excluir'}},3000)}}
});
document.querySelectorAll('[data-var]').forEach(c=>c.addEventListener('click',()=>{
  const t=lastField&&lastField.isConnected?lastField:$('#scriptsBox textarea');if(!t)return;
  const v=c.dataset.var,a=t.selectionStart??t.value.length,b=t.selectionEnd??a;
  t.value=t.value.slice(0,a)+v+t.value.slice(b);t.focus();t.selectionStart=t.selectionEnd=a+v.length;t.dispatchEvent(new Event('input',{bubbles:true}))}));
$('#addScript').addEventListener('click',()=>{const id='s'+Date.now();store.scripts.push({id,name:'Novo script',text:'{saudacao}! Falo com a {empresa}?\n\n'});if(!store.activeScript)store.activeScript=id;persist();renderScripts();renderScriptBars();
  const ta=document.querySelector(`[data-script="${id}"] textarea`);if(ta){ta.focus();ta.selectionStart=ta.value.length}});
function currentList(){const v=$('#fList').value;return v&&v!=='*'?v:''}

/* ---------- leads page ---------- */
function renderListSelect(){
  const sel=$('#fList'),v=sel.value||'*';
  sel.innerHTML='<option value="*">Todas as listas</option>'+store.lists.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');
  sel.value=store.lists.includes(v)||v==='*'?v:'*';
}
const STATUSES=[['novo','Novo'],['contatado','Contatado'],['respondeu','Respondeu'],['cliente','Cliente'],['descartado','Descartado']];
function filteredLeads(){
  const L=$('#fList').value,S=$('#fStatus').value,T=norm($('#fText').value);
  return store.leads.filter(l=>(L==='*'||!L||l.lista===L)&&(!S||l.status===S)&&(!T||norm([l.name,l.city,l.uf,l.cat,l.email,(l.phones||[]).join(' '),l.notes].join(' ')).includes(T)));
}
function renderLeads(){
  renderListSelect();
  const box=$('#leadsBox'),ls=filteredLeads();
  if(!store.leads.length){box.innerHTML='<div class="list"><div class="empty"><b>Nenhum lead salvo ainda.</b>Faça uma busca e clique em "Salvar lead" nas empresas que interessam.<button class="btn" type="button" data-goto="busca" style="margin-top:8px">Ir para a busca</button></div></div>';return}
  if(!ls.length){box.innerHTML='<div class="list"><div class="empty"><b>Nenhum lead com esses filtros.</b></div></div>';return}
  box.innerHTML=`<div class="list"><div class="table-wrap"><table><thead><tr><th>Empresa</th><th>Contato</th><th>Lista</th><th>Status</th><th>Anotação</th><th></th></tr></thead><tbody>
  ${ls.map(l=>{const p=(l.whatsapp||[])[0]||(l.phones||[])[0],w=p&&waLink(p);return `<tr data-id="${esc(l.id)}">
    <td style="min-width:200px"><b>${esc(l.name)}</b><div style="color:var(--muted);font-size:12px">${esc([l.cat,[l.city,l.uf].filter(Boolean).join(' – ')].filter(Boolean).join(' · '))}</div></td>
    <td style="min-width:170px;font-size:12.5px">${p?`<span class="mono">${esc(p)}</span>${w?` · <a href="${w}" target="_blank" rel="noopener">WhatsApp</a>`:''}<br>`:''}${l.email?esc(l.email)+'<br>':''}${l.instagram?`<a href="${esc(l.instagram)}" target="_blank" rel="noopener">Instagram</a>`:''}${!p&&!l.email&&!l.instagram?'<span style="color:var(--muted)">—</span>':''}</td>
    <td><select class="note-in" data-f="lista" aria-label="Lista">${store.lists.map(n=>`<option ${n===l.lista?'selected':''}>${esc(n)}</option>`).join('')}</select></td>
    <td><select class="status" data-f="status" data-s="${l.status}" aria-label="Status">${STATUSES.map(([v,t])=>`<option value="${v}" ${v===l.status?'selected':''}>${t}</option>`).join('')}</select></td>
    <td style="min-width:180px"><input class="note-in" data-f="notes" value="${esc(l.notes)}" placeholder="Anotar…" aria-label="Anotação"></td>
    <td style="white-space:nowrap">${contactNumber(l)?`<button class="btn sm contact-btn" data-contact="${esc(l.id)}" type="button">Entrar em contato</button> `:''}<button class="btn ghost sm" data-del type="button" aria-label="Remover">Remover</button></td></tr>`}).join('')}
  </tbody></table></div></div>`;
}
$('#leadsBox').addEventListener('change',e=>{const f=e.target.dataset.f;if(!f)return;const id=e.target.closest('tr').dataset.id;const l=store.leads.find(x=>x.id===id);if(!l)return;
  l[f]=e.target.value;if(f==='status'){e.target.dataset.s=l.status;if(l.status==='contatado'&&!l.contactedAt)l.contactedAt=new Date().toISOString()}persist();refreshCounts()});
$('#leadsBox').addEventListener('click',e=>{
  if(e.target.closest('[data-goto]'))return go('busca');
  const d=e.target.closest('[data-del]');if(!d)return;const tr=d.closest('tr');
  if(d.dataset.confirm){store.leads=store.leads.filter(x=>x.id!==tr.dataset.id);persist();refreshCounts();renderLeads();toast('Lead removido.')}
  else{d.dataset.confirm='1';d.textContent='Confirmar';setTimeout(()=>{if(d.isConnected){delete d.dataset.confirm;d.textContent='Remover'}},3000)}
});
['#fList','#fStatus'].forEach(s=>$(s).addEventListener('change',renderLeads));
$('#fText').addEventListener('input',renderLeads);

$('#exportBtn').addEventListener('click',()=>{
  const ls=filteredLeads();if(!ls.length){toast('Nenhum lead para exportar.');return}
  const cols=['Empresa','Razão social','Ramo','WhatsApp','Telefones','E-mail','Site','Instagram','CNPJ','Endereço','Cidade','UF','Sócios','Lista','Status','Anotação','Fonte','Salvo em'];
  const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
  const rows=ls.map(l=>[l.name,l.razao||'',l.cat,(l.whatsapp||[]).join(' / '),(l.phones||[]).join(' / '),l.email,l.website,l.instagram,l.cnpj?fmtCnpj(l.cnpj):'',l.address,l.city,l.uf,(l.socios||[]).map(s=>s.nome).join(' / '),l.lista,l.status,l.notes,l.source,(l.savedAt||'').slice(0,10).split('-').reverse().join('/')].map(q).join(';'));
  const blob=new Blob(['﻿'+[cols.map(q).join(';'),...rows].join('\r\n')],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`kaptei-leads-${new Date().toISOString().slice(0,10)}.csv`;document.body.appendChild(a);a.click();a.remove();
  toast(`${ls.length} leads exportados.`);
});

/* ---------- lists (fontes page) ---------- */
function renderLists(){$('#listsShow').innerHTML=store.lists.map(n=>`<span class="tag">${esc(n)} · ${store.leads.filter(l=>l.lista===n).length}</span>`).join('')}
$('#addList').addEventListener('click',()=>{const n=$('#newList').value.trim();if(!n)return;if(store.lists.includes(n)){toast('Essa lista já existe.');return}
  store.lists.push(n);persist();$('#newList').value='';renderLists();renderListSelect();toast(`Lista "${n}" criada.`)});

/* ---------- counters ---------- */
function refreshCounts(){
  const today=new Date().toISOString().slice(0,10);
  $('#stSaved').textContent=store.leads.length;
  $('#stContacted').textContent=store.leads.filter(l=>['contatado','respondeu','cliente'].includes(l.status)).length;
  $('#stToday').textContent=store.leads.filter(l=>(l.savedAt||'').slice(0,10)===today).length;
  $('#navCount').textContent=store.leads.length;
}
renderListSelect();refreshCounts();renderScriptBars();
})();

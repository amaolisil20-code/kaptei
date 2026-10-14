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
let store={leads:[],lists:['Geral'],scripts:[],activeScript:''};

function toast(msg){const t=$('#toast');t.textContent=msg;t.hidden=false;clearTimeout(toast._t);toast._t=setTimeout(()=>t.hidden=true,2600)}

/* ---------- Supabase (login + tabelas lists, leads, scripts) ---------- */
const SB_URL='https://rsidskitgowgilsynzae.supabase.co', SB_KEY='sb_publishable_zaLjBDzwL05bdD5-XgKINQ_rjn9Lcry';
const sb=window.supabase.createClient(SB_URL,SB_KEY);
let me=null, listIds={};
const dbFail=(what,error)=>{console.error(what,error);toast('Não consegui salvar ('+what+'). Confira a conexão.');return false};
const nul=v=>v===''||v===undefined?null:v;
function leadToRow(l){
  return {source_id:l.id,source:nul(l.source),name:l.name||'(sem nome)',razao_social:nul(l.razao),category:nul(l.cat),cnpj:nul(l.cnpj),
    phones:l.phones||[],whatsapp:l.whatsapp||[],email:nul(l.email),website:nul(l.website),instagram:nul(l.instagram),facebook:nul(l.facebook),linkedin:nul(l.linkedin),
    address:nul(l.address),city:nul(l.city),uf:nul(l.uf),socios:l.socios||[],list_id:listIds[l.lista]||null,status:l.status||'novo',notes:nul(l.notes),
    last_script:nul(l.lastScript),contacted_at:l.contactedAt||null,created_at:l.savedAt||new Date().toISOString()};
}
function rowToLead(r){
  const name=Object.keys(listIds).find(k=>listIds[k]===r.list_id);
  return {id:r.source_id,source:r.source||'',name:r.name,razao:r.razao_social||'',cat:r.category||'',cnpj:r.cnpj||'',phones:r.phones||[],whatsapp:r.whatsapp||[],
    email:r.email||'',website:r.website||'',instagram:r.instagram||'',facebook:r.facebook||'',linkedin:r.linkedin||'',address:r.address||'',city:r.city||'',uf:r.uf||'',
    socios:r.socios||[],lista:name||store.lists[0],status:r.status,notes:r.notes||'',lastScript:r.last_script||'',contactedAt:r.contacted_at||undefined,savedAt:r.created_at};
}
async function dbLead(l){const {error}=await sb.from('leads').upsert(leadToRow(l),{onConflict:'owner_id,source_id'});return error?dbFail('lead',error):true}
async function dbDelLead(id){const {error}=await sb.from('leads').delete().eq('source_id',id);if(error)dbFail('remover lead',error)}
async function dbAddList(name){const {data,error}=await sb.from('lists').upsert({name},{onConflict:'owner_id,name'}).select().single();if(error)return dbFail('lista',error);listIds[name]=data.id;return true}
async function dbActive(id){
  const a=await sb.from('scripts').update({is_active:false}).eq('is_active',true);
  const b=id?await sb.from('scripts').update({is_active:true}).eq('id',id):{};
  if(a.error||b.error)dbFail('script em uso',a.error||b.error);
}
const scriptTimers={};
function dbScript(s){clearTimeout(scriptTimers[s.id]);scriptTimers[s.id]=setTimeout(async()=>{
  const {error}=await sb.from('scripts').update({name:s.name||'Sem nome',body:s.text}).eq('id',s.id);if(error)dbFail('script',error)},600)}
async function dbDelScript(id){const {error}=await sb.from('scripts').delete().eq('id',id);if(error)dbFail('excluir script',error)}

async function fetchAll(table,order,asc){
  let out=[];
  for(let from=0;;from+=1000){
    const {data,error}=await sb.from(table).select('*').order(order,{ascending:asc}).range(from,from+999);
    if(error)throw error; out=out.concat(data); if(data.length<1000)break;
  }
  return out;
}
// Importa uma única vez o que estava salvo no navegador (chave kaptei.v1) para a conta.
async function importLocal(){
  const flag='kaptei.imported.'+me.id;
  try{if(localStorage.getItem(flag))return 0}catch(e){}
  let raw=null;try{raw=JSON.parse(localStorage.getItem(KEY))}catch(e){}
  let n=0;
  if(raw){
    const leads=(raw.leads||[]).filter(l=>l&&l.id);
    const names=[...new Set([...(raw.lists||[]),...leads.map(l=>l.lista)].filter(Boolean))];
    if(names.length){
      const {data,error}=await sb.from('lists').upsert(names.map(name=>({name})),{onConflict:'owner_id,name'}).select();
      if(error)throw error; data.forEach(r=>listIds[r.name]=r.id);
    }
    for(let i=0;i<leads.length;i+=200){
      const chunk=leads.slice(i,i+200).map(leadToRow);
      const {error}=await sb.from('leads').upsert(chunk,{onConflict:'owner_id,source_id',ignoreDuplicates:true});
      if(error)throw error; n+=chunk.length;
    }
    const {count}=await sb.from('scripts').select('id',{count:'exact',head:true});
    if(!count&&Array.isArray(raw.scripts)&&raw.scripts.length){
      const {data,error}=await sb.from('scripts').insert(raw.scripts.map(s=>({name:s.name||'Sem nome',body:s.text||'',is_active:s.id===raw.activeScript}))).select();
      if(error)throw error;
    }
  }
  try{localStorage.setItem(flag,'1')}catch(e){}
  return n;
}
async function loadAll(){
  const imported=await importLocal();
  let lists=await fetchAll('lists','created_at',true);
  if(!lists.length){const {data,error}=await sb.from('lists').insert({name:'Geral'}).select();if(error)throw error;lists=data}
  listIds={};lists.forEach(r=>listIds[r.name]=r.id);
  let scripts=await fetchAll('scripts','created_at',true);
  if(!scripts.length){const {data,error}=await sb.from('scripts').insert(DEFAULT_SCRIPTS.map((s,i)=>({name:s.name,body:s.text,is_active:i===0}))).select();if(error)throw error;scripts=data}
  store.lists=lists.map(r=>r.name);
  store.scripts=scripts.map(r=>({id:r.id,name:r.name,text:r.body}));
  store.activeScript=(scripts.find(r=>r.is_active)||scripts[0]).id;
  store.leads=(await fetchAll('leads','created_at',false)).map(rowToLead);
  return imported;
}

/* ---------- login ---------- */
const loginMsg=(t,err)=>{const m=$('#loginMsg');m.textContent=t;m.className='login-msg'+(err?' err':'');m.hidden=!t};
$('#loginForm').addEventListener('submit',async e=>{
  e.preventDefault();const email=$('#loginEmail').value.trim();if(!email)return;
  $('#loginBtn').disabled=true;loginMsg('');
  const {error}=await sb.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin+'/'}});
  $('#loginBtn').disabled=false;
  if(error)loginMsg(error.status===429?'Muitos pedidos seguidos. Espere alguns minutos e tente de novo.':'Não consegui enviar o link: '+error.message,true);
  else loginMsg('Link enviado para '+email+'. Abra o e-mail neste mesmo navegador e clique nele.');
});
document.addEventListener('click',async e=>{if(e.target.closest('[data-logout]')){await sb.auth.signOut()}});
let bootedFor=null;
async function onSession(session){
  if(!session){me=null;bootedFor=null;$('#login').hidden=false;return}
  if(bootedFor===session.user.id)return;
  bootedFor=session.user.id;me=session.user;
  try{
    const imported=await loadAll();
    $('#login').hidden=true;$('#userEmail').textContent=$('#userEmail2').textContent=me.email;
    go('busca');refreshCounts();
    if(imported)toast(`${imported} leads do navegador foram importados para a sua conta.`);
  }catch(err){console.error(err);bootedFor=null;$('#login').hidden=false;loginMsg('Entrou, mas não consegui carregar os dados: '+(err.message||err),true)}
}
sb.auth.onAuthStateChange((_ev,session)=>{setTimeout(()=>onSession(session),0)});
sb.auth.getSession().then(({data})=>onSession(data.session));

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
/* categorias do Overture Maps (padrões LIKE) para cada ramo acima */
const OVT={Odontologia:['%dent%','%orthodont%'],Academia:['gym','%fitness%','%pilates%','%yoga%','%crossfit%'],Restaurante:['restaurant','%churrascaria%','%steakhouse%'],
 Alimentação:['fast_food%','casual_eatery','%pizza%','%burger%','%ice_cream%','%acai%'],Café:['cafe','coffee_shop'],Bar:['bar','%pub%','%brewery%'],
 Imobiliária:['real_estate%','%realtor%'],Laboratório:['diagnostics_imaging_or_lab_service','%laborator%'],Clínica:['%clinic%','%doctor%'],Hospital:['hospital'],
 Farmácia:['pharmacy%','%drugstore%'],Pet:['animal_and_pet_store','animal_or_pet_service','%veterinar%','%pet_store%','%pet_groom%'],
 Advocacia:['attorney_or_law_firm','%lawyer%','legal_service'],Contabilidade:['%accountant%','%accounting%','%tax_service%'],
 Beleza:['%beauty%','%hair%','barber','%nail_salon%'],Padaria:['%bakery%','%pastry%','%patisserie%'],Mercado:['%supermarket%','%grocery%','convenience_store','%greengrocer%'],
 Educação:['place_of_learning','%school%','%language%','college_university'],Automotivo:['automotive_service','%auto_repair%','%automotive_repair%','vehicle_parts_store','%tire%'],
 Ótica:['%optic%'],Psicologia:['%psycholog%','%psychotherap%','counseling','behavioral_or_mental_health_clinic'],Fisioterapia:['physical_therapy','physical_medicine_and_rehabilitation'],
 Nutrição:['%nutrition%','%dietitian%'],Hospedagem:['hotel','lodging','%hostel%','%motel%','inn','bed_and_breakfast'],Moda:['fashion_and_apparel_store','%clothing%','%boutique%'],
 Construção:['building_or_construction_service','%construction%','hardware_home_and_garden_store','%engineer%'],Seguros:['%insurance%'],Coworking:['%coworking%'],
 Tecnologia:['%software%','%it_service%','%computer%','%telecom%'],Marketing:['%marketing%','%advertising%'],Igreja:['%place_of_worship%','%church%'],
 Eventos:['event_or_party_service','%party%','%event_planning%','event_venue'],Móveis:['%furniture%','%interior_design%','%home_decor%'],Joalheria:['%jewel%','%watch%'],
 Floricultura:['%florist%','flowers_and_gifts_store']};
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

/* ---------- Overture Maps (base aberta com mais telefones) ---------- */
function fmtPhone(p){let d=digits(p);if(d.startsWith('55')&&d.length>=12)d=d.slice(2);return d.length===11?`(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`:d.length===10?`(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`:String(p)}
async function overture(term,hits,city,state){
  const cats=[...new Set(hits.flatMap(h=>OVT[h.c]||[]))];
  const words=cats.length?[]:norm(term).replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(w=>w.length>=3).slice(0,4);
  if(!city||(!cats.length&&!words.length))return [];
  const ctl=new AbortController();const to=setTimeout(()=>ctl.abort(),65000);
  try{
    const r=await fetch('/api/overture?'+new URLSearchParams({city,state,cats:cats.join(','),words:words.join(',')}),{signal:ctl.signal});
    if(!r.ok)return [];
    return (await r.json()).rows||[];
  }catch(e){return []}finally{clearTimeout(to)}
}
function toLeadOv(r,uf,hits){
  const soc=r.socials||[];
  const ig=soc.find(s=>/instagram\.com/i.test(s))||'', fb=soc.find(s=>/facebook\.com/i.test(s))||'';
  const label=hits.length===1?hits[0].c:(r.cat||'').replace(/_/g,' ');
  return {id:'ov:'+r.id,whatsapp:[],linkedin:'',source:'Overture Maps',name:r.nome,cat:label,
    phones:[...new Set((r.phones||[]).map(fmtPhone))],email:(r.emails||[])[0]||'',website:webLink((r.websites||[])[0]||''),instagram:ig,facebook:fb,
    address:r.endereco||'',city:r.cidade||'',uf:r.uf||uf,cnpj:'',lat:r.lat,lon:r.lon,socios:[]};
}
// junta os resultados do Overture aos do mapa aberto, sem repetir a mesma empresa
function mergeOverture(rows,uf,hits){
  const keyName=l=>norm(l.name).replace(/[^a-z0-9]/g,'')+'|'+norm(l.city);
  const phones=new Set(lastResults.flatMap(l=>l.phones.map(digits).filter(Boolean)));
  const names=new Set(lastResults.map(keyName));
  let added=0;
  rows.forEach(r=>{
    const l=toLeadOv(r,uf,hits);
    if(lastResults.some(x=>x.id===l.id)||names.has(keyName(l))||l.phones.some(p=>phones.has(digits(p))))return;
    lastResults.push(l);names.add(keyName(l));l.phones.forEach(p=>phones.add(digits(p)));added++;
  });
  return added;
}
/* situação na internet: oportunidade para quem vende site, sistema e marketing */
function webStatus(l){
  if(l.website){
    if(l.siteDown)return {k:'down',t:'Site não abriu',c:'err',opp:true,tip:'O endereço cadastrado não respondeu ao Kaptei. Pode estar fora do ar ou bloquear leitura automática: abra no navegador para confirmar.'};
    const i=l.siteInfo, bad=i?[!i.https&&'sem HTTPS (navegador avisa "não seguro")',!i.responsive&&'não adaptado ao celular'].filter(Boolean):[];
    if(bad.length)return {k:'weak',t:'Site com problemas',c:'warn',opp:true,tip:bad.join(' · ')};
    return {k:'site',t:'Tem site',c:'ok',opp:false,tip:''};
  }
  if(l.instagram||l.facebook)return {k:'social',t:'Só rede social',c:'warn',opp:true,tip:'Tem Instagram/Facebook cadastrado, mas nenhum site nas bases abertas. Confirme no Google.'};
  return {k:'none',t:'Site não encontrado',c:'warn',opp:true,tip:'Não há site cadastrado nas bases abertas (OpenStreetMap e Overture). Pode existir: confira no Google antes de abordar e, se achar, cole o endereço no campo do resultado.'};
}
const webPill=l=>{const w=webStatus(l);return `<span class="pill web ${w.c}"${w.tip?` title="${esc(w.tip)}"`:''}>${w.t}</span>`};
const webMatch=(l,f)=>{if(!f)return true;const w=webStatus(l);return f==='opp'?w.opp:f==='site'?(w.k==='site'||w.k==='weak'||w.k==='down'):w.k===f};
/* sugestões por lead: sinais reais (contatos, site lido, nome) + automações típicas do ramo */
// [regex do ramo, [[ideia, motivo, pontos, condição]]]. Condições: priv (não é órgão público), nobook, noshop
const SEG_IDEAS=[
 [/hospital|maternidade|pronto.?socorro|upa\b/,[
  ['Chatbot no WhatsApp/site com horário de visita, exames, como chegar e telefones por setor','corta ligações repetidas para a recepção',66],
  ['Resultado de exames e comprovantes online com aviso automático','paciente não precisa voltar só para buscar papel',58],
  ['Pesquisa de satisfação automática após o atendimento e gestão das avaliações do Google','dá dados para melhorar e responde reclamações',52]]],
 [/odont|dent|clinic|medic|saude|psicolog|fisio|nutri|laborat|consultorio/,[
  ['Agendamento online com confirmação e lembrete automático por WhatsApp','reduz faltas e tira a recepção do telefone',68,'nobook'],
  ['Retorno automático do paciente (ex.: limpeza a cada 6 meses, revisão anual)','traz o paciente de volta sem esforço da equipe',60,'priv'],
  ['Ficha digital e envio de receitas/laudos por link seguro','menos papel e menos retrabalho',50],
  ['Captação de pacientes novos por Google Meu Negócio e landing de especialidade','atrai quem já procura o serviço',55,'priv']]],
 [/academia|pilates|crossfit|fitness|esporte|natacao|danca|luta/,[
  ['Cobrança recorrente automática e aviso de mensalidade em atraso','menos inadimplência',66,'priv'],
  ['Reativação de alunos inativos por WhatsApp','recupera receita parada',62,'priv'],
  ['Aula experimental com captura de contato e follow-up automático','mais matrículas',58,'priv'],
  ['App ou área do aluno com treino, presença e agenda de aulas','retenção',50]]],
 [/restaurante|aliment|cafe|bar\b|padaria|lanchonete|pizza|confeit|churrasc|sorvet|acai/,[
  ['Cardápio digital com pedido direto por WhatsApp','menos comissão de aplicativo de delivery',66,'noshop'],
  ['Programa de fidelidade e disparo de promoções para clientes antigos','mais recompra',58],
  ['Reservas online de mesa com confirmação automática','menos no-show',52,'nobook']]],
 [/imobili|corretor/,[
  ['CRM que distribui os contatos dos portais entre os corretores','nenhum interessado fica sem resposta',68],
  ['Resposta automática ao interessado em até 1 minuto','quem responde primeiro costuma fechar',64],
  ['Site com busca e filtros de imóveis e captura de leads','a vitrine própria diminui a dependência dos portais',58]]],
 [/advoc|juridic|contab|seguro|despach/,[
  ['Portal do cliente com envio de documentos e avisos de prazo automáticos','menos cobrança manual por documento',64],
  ['Triagem de casos por formulário inteligente','atrai cliente já qualificado',56,'priv'],
  ['Conteúdo e Google Meu Negócio para captação local','autoridade e novos contatos',50,'priv']]],
 [/beleza|salao|estetica|barbear|cabele|manicure|spa\b/,[
  ['Agenda online com confirmação e lembrete automáticos','menos buracos na agenda',68,'nobook'],
  ['Pacotes, assinatura e aviso de retorno (ex.: retoque em 30 dias)','receita recorrente',58],
  ['Vitrine de antes e depois integrada ao Instagram e ao WhatsApp','prova social que converte',50]]],
 [/pet|veterin|animal/,[
  ['Lembrete automático de vacina, vermífugo e banho por WhatsApp','retorno garantido',66],
  ['Agenda online e loja virtual de produtos','mais um canal de venda',54,'noshop']]],
 [/educa|escola|colegio|curso|idioma|faculdade|universid/,[
  ['Matrícula online e funil de interessados com follow-up automático','mais conversão de leads',64,'priv'],
  ['Comunicação com pais e alunos por WhatsApp automatizada','menos ligações para a secretaria',58],
  ['Portal com boletos, boletins e declarações automáticos','secretaria mais leve',50]]],
 [/hotel|hosped|pousada|hostel|motel/,[
  ['Motor de reservas direto no site com pagamento','menos comissão de OTA',66,'nobook'],
  ['Mensagens automáticas pré e pós-estadia (check-in, avaliação)','mais avaliações e retorno',56]]],
 [/oficina|automotiv|mecanic|autopeca|funilaria|lava/,[
  ['Orçamento online e aviso de revisão por data ou km','cliente volta sozinho',64],
  ['Acompanhamento do serviço por WhatsApp (carro pronto, aprovação de orçamento)','menos ligações e mais confiança',58]]],
 [/constru|engenh|arquitet|incorporad/,[
  ['Site com portfólio de obras e formulário de orçamento','prova social que fecha contrato',62],
  ['Painel de acompanhamento de obra para o cliente','diferencial e menos cobrança de status',52]]],
 [/mercado|moda|roupa|loja|otica|movel|moveis|joia|flor|farmac|varejo|boutique/,[
  ['Catálogo online com pedido por WhatsApp ou loja virtual','vende fora do horário da loja',64,'noshop'],
  ['Lista de clientes com disparo de ofertas e aviso de reposição','mais recompra',56]]],
 [/tecnolog|software|marketing|coworking/,[
  ['Funil de captação com CRM e automação de e-mail/WhatsApp','organiza o comercial',60],
  ['Painel de indicadores integrado às ferramentas que já usam','decisão com dados',50]]],
];
const FREEMAIL=/@(gmail|hotmail|outlook|yahoo|live|uol|bol|ig|terra)\./i;
const PUBLIC=/municipal|prefeitura|estadual|federal|secretaria|publico|sus\b|fundacao|autarquia|camara/;
const isMobile=p=>{const d=digits(p).replace(/^55/,'');return d.length===11&&d[2]==='9'};
function leadContext(l){
  const w=webStatus(l), i=l.siteInfo||null, phones=l.phones||[], wa=l.whatsapp||[];
  const read=!!i&&i.https!==undefined;
  const year=new Date().getFullYear();
  return {w,i,read,pub:PUBLIC.test(norm(l.name+' '+(l.razao||''))),
    noPhone:!phones.length&&!wa.length, landline:phones.length>0&&!wa.length&&!phones.some(isMobile),
    freeMail:!!l.email&&FREEMAIL.test(l.email),
    old:read&&!!i.year&&i.year<=year-3, builder:read&&!!i.builder, noWhats:read&&!i.whats, noForm:read&&!i.form,
    nobook:!read||!i.booking, noshop:!read||!i.shop, nochat:read&&!i.chat, notrack:read&&!i.track,
    noSocial:!l.instagram&&!l.facebook};
}
function facts(l){
  const c=leadContext(l), f=[c.w.t];
  if(c.pub)f.push('órgão público');
  if(c.landline)f.push('só telefone fixo');
  if(c.noPhone)f.push('sem telefone nas bases');
  if(c.freeMail)f.push('e-mail gratuito ('+l.email.split('@')[1]+')');
  if(c.old)f.push('site com rodapé de '+c.i.year);
  if(c.builder)f.push('site em construtor ('+c.i.builder+')');
  if(c.noWhats)f.push('site sem link de WhatsApp');
  if(c.noForm)f.push('site sem formulário');
  if(c.notrack)f.push('site sem Analytics/Pixel');
  if(c.noSocial)f.push('sem rede social');
  return f;
}
function ideas(l){
  const c=leadContext(l), w=c.w, out=[];
  const add=(t,d,s)=>out.push([t,d,s>=80?'alta':s>=55?'média':'baixa',s]);
  if(w.k==='none')add('Criar site/landing page com botão de WhatsApp e cadastro no Google Meu Negócio','não achamos site nas bases abertas; confirme no Google antes de oferecer',100);
  if(w.k==='social')add('Criar site próprio ligado ao Instagram, com WhatsApp e Google Meu Negócio','depender só de rede social limita a captação',95);
  if(w.k==='down')add('Recuperar ou refazer o site (não abriu na leitura automática)','se estiver mesmo fora do ar, cada visita é um cliente perdido; abra o endereço antes de oferecer',98);
  if(w.k==='weak')add(`Modernizar o site (${w.tip})`,'site inseguro ou ruim no celular afasta clientes e piora o Google',90);
  if(c.old)add(`Redesenhar o site (o rodapé ainda mostra © ${c.i.year})`,'site parado no tempo passa a imagem de empresa parada',84);
  if(c.noWhats)add('Colocar botão e atendimento por WhatsApp no site','hoje o site não tem nenhum link de WhatsApp',80);
  if(c.noForm&&c.noWhats)add('Formulário de contato/orçamento ligado ao CRM','o site não tem nenhuma forma de captar contato',74);
  if(c.builder)add(`Sair do construtor ${c.i.builder} para um site próprio, rápido e otimizado`,'construtores gratuitos limitam SEO e domínio',60);
  if(c.notrack)add('Instalar Analytics e Pixel e rodar campanhas locais','o site não mede nem remarketing o visitante',55);
  if(c.nochat&&!c.pub)add('Chatbot de atendimento no site e no WhatsApp','responde fora do horário e qualifica o contato',52);
  if(c.landline)add('Atendimento em WhatsApp Business com resposta automática e catálogo','só aparece telefone fixo; muita gente prefere chamar no WhatsApp',88);
  if(c.noPhone)add('Captar contatos por Google Meu Negócio e página com botão de ligar/WhatsApp','nenhum telefone encontrado nas bases',66);
  if(c.freeMail)add('E-mail profissional no domínio da empresa','usa e-mail gratuito, o que passa pouca confiança',48);
  if(c.pub){
    add('Portal do cidadão com chatbot e consulta de atendimento/fila','órgão público: o ganho está em atendimento e transparência',72);
    add('Painel de indicadores para a gestão','decisão baseada em dados do atendimento',50);
  }
  const key=norm([l.cat,l.name].join(' '));
  const seg=SEG_IDEAS.find(([rx])=>rx.test(key));
  if(seg)seg[1].forEach(([t,d,s,cond])=>{
    if(cond==='priv'&&c.pub)return;
    if(cond==='nobook'&&!c.nobook)return;
    if(cond==='noshop'&&!c.noshop)return;
    add(t,d,s);
  });
  else add('Atendimento automático no WhatsApp Business com respostas rápidas e CRM simples','centraliza os contatos e acelera a resposta',50);
  if(c.noSocial&&!c.pub)add('Presença em redes sociais com agendamento de posts','nenhuma rede social encontrada nas bases',40);
  out.sort((a,b)=>b[3]-a[3]);
  return out.slice(0,6);
}
const ideasHTML=l=>{const it=ideas(l);return `<details class="ideas"><summary>Como ajudar (${it.length} ideias)</summary><div class="facts">Sinais: ${esc(facts(l).join(' · '))}</div><ul>${it.map(([t,d,p])=>`<li><b>${esc(t)}</b> <span class="prio ${p}">${p}</span><br><span>${esc(d)}</span></li>`).join('')}</ul></details>`};
const resultScore=l=>!!l.website*2+l.phones.length+!!l.email+!!l.website+!!l.instagram;

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
    <div><div class="name">${esc(l.name)}${webPill(l)}</div>
      <div class="meta">${l.cat?`<span class="cat">${esc(l.cat)}</span>`:''}${esc([l.address,l.city&&l.uf?l.city+' – '+l.uf:l.city].filter(Boolean).join(' · '))}</div>${ideasHTML(l)}</div>
    <div class="contacts">${contactsHTML(l)}</div>
    <div class="actions">
      ${contactNumber(l)?`<button class="btn sm contact-btn" data-contact="${esc(l.id)}" type="button">Entrar em contato</button>`:''}
      ${saved?'<span class="saved-badge">✓ Salvo</span>':`<button class="btn sm" data-save="${esc(l.id)}" type="button">Salvar lead</button>`}
      ${webStatus(l).k==='none'||webStatus(l).k==='social'?`<a class="btn ghost sm" href="https://www.google.com/search?q=${gq(l)}+site+oficial" target="_blank" rel="noopener">Conferir site no Google</a>`:''}<a class="btn ghost sm" href="https://www.google.com/maps/search/?api=1&query=${gq(l)}" target="_blank" rel="noopener">Ver no Google</a>
      <a class="btn ghost sm" href="https://www.google.com/search?q=${gq(l)}+instagram" target="_blank" rel="noopener">Achar Instagram</a>
    </div></div>`;
}

/* ---------- search: empresas ---------- */
let lastResults=[], searchTok=0;
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
    if(!r.ok||!d.ok){l.enrich='fail';l.enrichMsg=d.error||'O site não abriu.';l.siteDown=r.ok&&d.ok===false}
    else{l.enrichGot=mergeInto(l,d);l.enrich='done';l.siteDown=false;l.siteInfo={https:d.https,responsive:d.responsive,...(d.signals||{})}}
  }catch(e){l.enrich='fail';l.enrichMsg='O site não respondeu.'}
  const saved=store.leads.find(x=>x.id===l.id);
  if(saved){Object.assign(saved,{phones:l.phones,whatsapp:l.whatsapp,email:l.email,instagram:l.instagram,facebook:l.facebook,linkedin:l.linkedin,website:l.website});dbLead(saved)}
  rerenderLead(l);updateHeadCount();
}
async function enrichMany(list){
  const queue=list.filter(l=>l.website&&!l.enrich).slice(0,40);
  const worker=async()=>{while(queue.length){await enrich(queue.shift())}};
  await Promise.all([worker(),worker(),worker()]);
  if(mode==='empresas'&&($('#fSiteBusca').value||$('#fOrdem').value==='opp')&&lastResults.length)renderResults($('#q').value,matchTags($('#q').value));
}
const hasContact=l=>(l.phones?.length||l.whatsapp?.length);
function updateHeadCount(){const el=document.querySelector('#withPhone');if(el)el.textContent=lastResults.filter(hasContact).length}
async function searchEmpresas(term){
  const res=$('#results'), uf=ufSel.value;
  if(!uf){res.innerHTML='<div class="notice err">Escolha o estado para buscar. A busca no Brasil inteiro de uma vez chega com a base CNPJ completa (etapa 2).</div>';ufSel.focus();return}
  const cityTxt=$('#city').value.trim(); let city=null;
  if(cityTxt){city=cityMap[norm(cityTxt)];if(!city){res.innerHTML=`<div class="notice err">Não achei a cidade "${esc(cityTxt)}" em ${uf}. Escolha uma da lista ou deixe em branco para buscar no estado todo.</div>`;return}}
  const {q,hits}=buildQuery(term);
  res.innerHTML=`<div class="list"><div class="loading"><span class="spinner"></span>Procurando "${esc(term)}" em ${esc(city?city.nome:UFS.find(u=>u[0]===uf)[1])}… ${city?'':'(no estado todo pode demorar e às vezes não responde; prefira escolher a cidade)'}</div></div>`;
  setBusy(true);
  const stateName=UFS.find(u=>u[0]===uf)[1];
  const tok=++searchTok;
  const ovP=overture(term,hits,city?.nome,stateName);   // roda junto com o mapa aberto
  lastResults=[];
  const addOverture=async()=>{
    const rows=await ovP;if(tok!==searchTok)return 0;const added=mergeOverture(rows,uf,hits);
    if(added){lastResults.sort((a,b)=>resultScore(b)-resultScore(a));if(mode==='empresas'&&$('#results').querySelector('.list,.res-head,.notice')){renderResults(term,hits)}enrichMany(lastResults)}
    return added;
  };
  try{
    const d=await overpass(q,city?.nome,stateName);
    const seen=new Set();
    lastResults=d.elements.filter(e=>e.tags&&(e.tags.name||e.tags.brand)).map(e=>toLead(e,city?.nome,uf)).filter(l=>!seen.has(l.id)&&seen.add(l.id));
    lastResults.sort((a,b)=>resultScore(b)-resultScore(a));
    renderResults(term,hits);
    enrichMany(lastResults);
    if(city){setBusy(false);$('#withPhone')?.insertAdjacentHTML('afterend',' <span class="mono" id="ovWait">· buscando mais na base Overture…</span>');await addOverture();$('#ovWait')?.remove()}
  }catch(e){
    if(city){const added=await addOverture();if(added){setBusy(false);return}}
    res.innerHTML=`<div class="notice err">${city?'Os servidores do mapa aberto não responderam agora. Tente de novo em alguns segundos.':'O estado inteiro é grande demais para o mapa aberto responder de uma vez. Escolha uma cidade.'}<br><span style="font-size:12px;opacity:.8">${esc(e.message||'')}</span></div>`}
  finally{setBusy(false)}
}
function renderResults(term,hits){
  const only=$('#onlyPhone').checked;
  const fs=$('#fSiteBusca').value;
  let list=lastResults.filter(l=>(!only||hasContact(l))&&webMatch(l,fs));
  if($('#fOrdem').value==='opp'){const sc=new Map(list.map(l=>[l,ideas(l)[0][3]]));list=[...list].sort((a,b)=>(!!hasContact(b)-!!hasContact(a))||sc.get(b)-sc.get(a))}
  const semSite=lastResults.filter(l=>webStatus(l).opp).length;
  const withPhone=lastResults.filter(hasContact).length;
  const res=$('#results');
  if(!lastResults.length){res.innerHTML=`<div class="list"><div class="empty"><b>Nenhuma empresa encontrada para "${esc(term)}".</b>Tente um termo mais simples (por exemplo "dentista" em vez de "consultório odontológico infantil") ou busque no estado todo.</div></div>`;return}
  res.innerHTML=`<div class="res-head" style="margin-bottom:12px"><h2>${lastResults.length} empresa${lastResults.length>1?'s':''} encontrada${lastResults.length>1?'s':''}</h2>
    <p><span class="mono" id="withPhone">${withPhone}</span> com telefone · <span class="mono">${semSite}</span> possíveis oportunidades de site${hits.length?` · categorias: ${esc([...new Set(hits.map(h=>h.c))].join(', '))}`:' · busca pelo nome'}</p></div>
    <div class="list">${list.slice(0,300).map(leadRow).join('')||'<div class="empty"><b>Nenhum resultado com esses filtros.</b>Desmarque "Só com telefone" ou mude "Presença na internet" para ver todos.</div>'}</div>
    ${list.length>300?'<p class="lede" style="margin-top:10px">Mostrando os 300 primeiros. Refine pela cidade para ver o resto.</p>':''}
    <p class="lede" style="margin-top:12px;font-size:12.5px">Fontes: © colaboradores do OpenStreetMap e Overture Maps Foundation. Nenhuma base tem todas as empresas.</p>`;
}
try{const o=localStorage.getItem('kaptei.ordem');if(o)$('#fOrdem').value=o}catch(e){}
$('#fOrdem').addEventListener('change',()=>{try{localStorage.setItem('kaptei.ordem',$('#fOrdem').value)}catch(e){}});
['#onlyPhone','#fSiteBusca','#fOrdem'].forEach(id=>$(id).addEventListener('change',()=>{if(lastResults.length&&mode==='empresas')renderResults($('#q').value,matchTags($('#q').value))}));

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
  const nl={...l,status:'novo',lista:currentList()||list,notes:'',savedAt:new Date().toISOString()};
  store.leads.unshift(nl);dbLead(nl);refreshCounts();b.outerHTML='<span class="saved-badge">✓ Salvo</span>';toast(`Salvo em "${currentList()||list}".`);
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
document.addEventListener('change',e=>{if(e.target.matches('[data-pickscript]')){store.activeScript=e.target.value;dbActive(store.activeScript);renderScriptBars()}});
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
  dbLead(saved);refreshCounts();
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
  s[f]=e.target.value;dbScript(s);
  if(f==='text')card.querySelector('[data-preview]').textContent=fillScript(s.text,{name:'Clínica Exemplo',city:'Uberlândia',cat:'Odontologia'});
  if(f==='name')renderScriptBars()});
$('#scriptsBox').addEventListener('click',e=>{const card=e.target.closest('[data-script]');if(!card)return;const id=card.dataset.script;
  if(e.target.closest('[data-usescript]')){store.activeScript=id;dbActive(id);renderScripts();renderScriptBars();toast('Script em uso no botão.')}
  const del=e.target.closest('[data-delscript]');
  if(del){if(del.dataset.confirm){store.scripts=store.scripts.filter(x=>x.id!==id);clearTimeout(scriptTimers[id]);dbDelScript(id);if(store.activeScript===id){store.activeScript=store.scripts[0]?.id||'';dbActive(store.activeScript)}renderScripts();renderScriptBars();toast('Script excluído.')}
    else{del.dataset.confirm='1';del.textContent='Confirmar';setTimeout(()=>{if(del.isConnected){delete del.dataset.confirm;del.textContent='Excluir'}},3000)}}
});
document.querySelectorAll('[data-var]').forEach(c=>c.addEventListener('click',()=>{
  const t=lastField&&lastField.isConnected?lastField:$('#scriptsBox textarea');if(!t)return;
  const v=c.dataset.var,a=t.selectionStart??t.value.length,b=t.selectionEnd??a;
  t.value=t.value.slice(0,a)+v+t.value.slice(b);t.focus();t.selectionStart=t.selectionEnd=a+v.length;t.dispatchEvent(new Event('input',{bubbles:true}))}));
$('#addScript').addEventListener('click',async()=>{
  const {data,error}=await sb.from('scripts').insert({name:'Novo script',body:'{saudacao}! Falo com a {empresa}?\n\n',is_active:!store.activeScript}).select().single();
  if(error)return dbFail('novo script',error);
  const id=data.id;store.scripts.push({id,name:data.name,text:data.body});if(!store.activeScript)store.activeScript=id;renderScripts();renderScriptBars();
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
  return store.leads.filter(l=>(L==='*'||!L||l.lista===L)&&(!S||l.status===S)&&webMatch(l,$('#fSite').value)&&(!T||norm([l.name,l.city,l.uf,l.cat,l.email,(l.phones||[]).join(' '),l.notes].join(' ')).includes(T)));
}
function renderLeads(){
  renderListSelect();
  const box=$('#leadsBox'),ls=filteredLeads();
  if(!store.leads.length){box.innerHTML='<div class="list"><div class="empty"><b>Nenhum lead salvo ainda.</b>Faça uma busca e clique em "Salvar lead" nas empresas que interessam.<button class="btn" type="button" data-goto="busca" style="margin-top:8px">Ir para a busca</button></div></div>';return}
  if(!ls.length){box.innerHTML='<div class="list"><div class="empty"><b>Nenhum lead com esses filtros.</b></div></div>';return}
  box.innerHTML=`<div class="list"><div class="table-wrap"><table><thead><tr><th>Empresa</th><th>Contato</th><th>Lista</th><th>Status</th><th>Anotação</th><th></th></tr></thead><tbody>
  ${ls.map(l=>{const p=(l.whatsapp||[])[0]||(l.phones||[])[0],w=p&&waLink(p);return `<tr data-id="${esc(l.id)}">
    <td style="min-width:200px"><b>${esc(l.name)}</b>${webPill(l)}<div style="color:var(--muted);font-size:12px">${esc([l.cat,[l.city,l.uf].filter(Boolean).join(' – ')].filter(Boolean).join(' · '))}</div>${ideasHTML(l)}</td>
    <td style="min-width:170px;font-size:12.5px">${p?`<span class="mono">${esc(p)}</span>${w?` · <a href="${w}" target="_blank" rel="noopener">WhatsApp</a>`:''}<br>`:''}${l.email?esc(l.email)+'<br>':''}${l.instagram?`<a href="${esc(l.instagram)}" target="_blank" rel="noopener">Instagram</a>`:''}${!p&&!l.email&&!l.instagram?'<span style="color:var(--muted)">—</span>':''}</td>
    <td><select class="note-in" data-f="lista" aria-label="Lista">${store.lists.map(n=>`<option ${n===l.lista?'selected':''}>${esc(n)}</option>`).join('')}</select></td>
    <td><select class="status" data-f="status" data-s="${l.status}" aria-label="Status">${STATUSES.map(([v,t])=>`<option value="${v}" ${v===l.status?'selected':''}>${t}</option>`).join('')}</select></td>
    <td style="min-width:180px"><input class="note-in" data-f="notes" value="${esc(l.notes)}" placeholder="Anotar…" aria-label="Anotação"></td>
    <td style="white-space:nowrap">${contactNumber(l)?`<button class="btn sm contact-btn" data-contact="${esc(l.id)}" type="button">Entrar em contato</button> `:''}<button class="btn ghost sm" data-del type="button" aria-label="Remover">Remover</button></td></tr>`}).join('')}
  </tbody></table></div></div>`;
}
$('#leadsBox').addEventListener('change',e=>{const f=e.target.dataset.f;if(!f)return;const id=e.target.closest('tr').dataset.id;const l=store.leads.find(x=>x.id===id);if(!l)return;
  l[f]=e.target.value;if(f==='status'){e.target.dataset.s=l.status;if(l.status==='contatado'&&!l.contactedAt)l.contactedAt=new Date().toISOString()}dbLead(l);refreshCounts()});
$('#leadsBox').addEventListener('click',e=>{
  if(e.target.closest('[data-goto]'))return go('busca');
  const d=e.target.closest('[data-del]');if(!d)return;const tr=d.closest('tr');
  if(d.dataset.confirm){store.leads=store.leads.filter(x=>x.id!==tr.dataset.id);dbDelLead(tr.dataset.id);refreshCounts();renderLeads();toast('Lead removido.')}
  else{d.dataset.confirm='1';d.textContent='Confirmar';setTimeout(()=>{if(d.isConnected){delete d.dataset.confirm;d.textContent='Remover'}},3000)}
});
['#fList','#fStatus','#fSite'].forEach(s=>$(s).addEventListener('change',renderLeads));
$('#fText').addEventListener('input',renderLeads);

$('#exportBtn').addEventListener('click',()=>{
  const ls=filteredLeads();if(!ls.length){toast('Nenhum lead para exportar.');return}
  const cols=['Empresa','Razão social','Ramo','WhatsApp','Telefones','E-mail','Site','Situação na internet','Sugestões','Instagram','CNPJ','Endereço','Cidade','UF','Sócios','Lista','Status','Anotação','Fonte','Salvo em'];
  const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
  const rows=ls.map(l=>[l.name,l.razao||'',l.cat,(l.whatsapp||[]).join(' / '),(l.phones||[]).join(' / '),l.email,l.website,webStatus(l).t,ideas(l).map(i=>i[0]).join(' | '),l.instagram,l.cnpj?fmtCnpj(l.cnpj):'',l.address,l.city,l.uf,(l.socios||[]).map(s=>s.nome).join(' / '),l.lista,l.status,l.notes,l.source,(l.savedAt||'').slice(0,10).split('-').reverse().join('/')].map(q).join(';'));
  const blob=new Blob(['﻿'+[cols.map(q).join(';'),...rows].join('\r\n')],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`kaptei-leads-${new Date().toISOString().slice(0,10)}.csv`;document.body.appendChild(a);a.click();a.remove();
  toast(`${ls.length} leads exportados.`);
});

/* ---------- lists (fontes page) ---------- */
function renderLists(){$('#listsShow').innerHTML=store.lists.map(n=>`<span class="tag">${esc(n)} · ${store.leads.filter(l=>l.lista===n).length}</span>`).join('')}
$('#addList').addEventListener('click',async()=>{const n=$('#newList').value.trim();if(!n)return;if(store.lists.includes(n)){toast('Essa lista já existe.');return}
  if(!await dbAddList(n))return;
  store.lists.push(n);$('#newList').value='';renderLists();renderListSelect();toast(`Lista "${n}" criada.`)});

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

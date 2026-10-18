// CRUSCOTTO_ANDAMENTO_INCASSI_V1 — modulo opzionale di sola lettura.
// Il modulo non viene importato durante login/avvio del Cruscotto.
const fmtEuro = new Intl.NumberFormat('it-IT', {style:'currency',currency:'EUR'});
const fmtPct = new Intl.NumberFormat('it-IT', {minimumFractionDigits:1,maximumFractionDigits:1});
const dataLocale = d => [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const inizioGiorno = d => new Date(d.getFullYear(),d.getMonth(),d.getDate());
function sposta(d,giorni) { const copy=inizioGiorno(d); copy.setDate(copy.getDate()+giorni);return copy; }
const giorniFra=(a,b)=>Math.round((Date.UTC(b.getFullYear(),b.getMonth(),b.getDate())-Date.UTC(a.getFullYear(),a.getMonth(),a.getDate()))/86400000);
export function periodoAndamento(tipo, oggi=new Date()) {
  const fine=inizioGiorno(oggi); let dal, dalPrecedente, alPrecedente;
  if(tipo==='7' || tipo==='30') {
    const n=Number(tipo);dal=sposta(fine,1-n);alPrecedente=sposta(dal,-1);dalPrecedente=sposta(dal,-n);
  } else if(tipo==='mese') {
    dal=new Date(fine.getFullYear(),fine.getMonth(),1);
    dalPrecedente=new Date(fine.getFullYear(),fine.getMonth()-1,1);
    const ultimoPrecedente=new Date(fine.getFullYear(),fine.getMonth(),0).getDate();
    alPrecedente=new Date(dalPrecedente.getFullYear(),dalPrecedente.getMonth(),Math.min(fine.getDate(),ultimoPrecedente));
  } else throw new Error('Periodo non valido.');
  return {tipo,dal:dataLocale(dal),fine:dataLocale(fine),precedenteDal:dataLocale(dalPrecedente),precedenteFine:dataLocale(alPrecedente),letturaDal:dataLocale(dalPrecedente)};
}
function gruppoPerData(oggetto,campo) {
  if(oggetto!==null && (typeof oggetto!=='object'||Array.isArray(oggetto))) throw new Error('Archivio ricevuto non valido.');
  const gruppi=new Map();
  for(const [id,r] of Object.entries(oggetto||{})) {
    if(!r || typeof r!=='object'||Array.isArray(r)) throw new Error('Movimento ricevuto non valido.');
    const data=r[campo];
    if(typeof data!=='string'||!/\d{4}-\d{2}-\d{2}/.test(data)) throw new Error('Data dello storico non valida.');
    if(!gruppi.has(data)) gruppi.set(data,{});
    gruppi.get(data)[id]=r;
  }
  return gruppi;
}
function parseData(s) { const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d); }
const arrotonda=v=>Math.round((v+Number.EPSILON)*100)/100;
export function calcolaAndamento(tipo, dati, riepiloga, oggi=new Date()) {
  if(!Array.isArray(dati)||dati.length!==3||typeof riepiloga!=='function') throw new Error('Dati dell’andamento non disponibili.');
  const periodo=periodoAndamento(tipo,oggi);
  const [live, vendite, movimenti]=dati;
  const v=gruppoPerData(vendite,'GIORNO'),m=gruppoPerData(movimenti,'data');
  const giornoOggi=dataLocale(oggi);
  const valori=[];
  for(let d=parseData(periodo.letturaDal);dataLocale(d)<=periodo.fine;d=sposta(d,1)) {
    const data=dataLocale(d);
    // riutilizza, SENZA modificarla, l'aggregazione V2 già collaudata.
    const r=riepiloga([data===giornoOggi?live:null,v.get(data)||null,m.get(data)||null]);
    valori.push({data,incasso:arrotonda(r.contanti+r.pos),saldo:arrotonda(r.totale),contanti:arrotonda(r.contanti),pos:arrotonda(r.pos),scontrini:r.scontrini,baseMedia:r.media*r.scontrini,entrate:r.entrate,uscite:r.uscite});
  }
  const attuali=valori.filter(r=>r.data>=periodo.dal&&r.data<=periodo.fine);
  const precedenti=valori.filter(r=>r.data>=periodo.precedenteDal&&r.data<=periodo.precedenteFine);
  const somma=(a,k)=>arrotonda(a.reduce((tot,r)=>tot+r[k],0));
  const corrente=somma(attuali,'incasso');const precedente=somma(precedenti,'incasso');
  const scontrini=somma(attuali,'scontrini');
  return {periodo,attuali,precedenti,incasso:corrente,precedente,percentuale:precedente===0?null:((corrente-precedente)/Math.abs(precedente))*100,
    contanti:somma(attuali,'contanti'),pos:somma(attuali,'pos'),saldo:somma(attuali,'saldo'),scontrini,
    mediaScontrino:scontrini>0?somma(attuali,'baseMedia')/scontrini:0,
    mediaGiornaliera:attuali.length?corrente/attuali.length:0,
    giornoMigliore:attuali.length?[...attuali].sort((a,b)=>b.incasso-a.incasso)[0]:null};
}
const CSS=`
.andamento-tabs{display:flex;gap:7px;margin:12px 0 14px;flex-wrap:wrap}
.andamento-tabs button{flex:1;min-width:68px;border:1px solid #62502e;background:#181f27;color:#e9e9e9;border-radius:9px;padding:11px 7px;font-size:13px;font-weight:700;cursor:pointer}
.andamento-tabs button[aria-pressed="true"]{color:#1a160b;background:#e3b341;border-color:#e3b341}
.andamento-caption{color:#abb3bd;font-size:12px;margin:8px 0 12px;line-height:1.5}
.andamento-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
.andamento-kpi{min-width:0;border:1px solid rgba(227,179,65,.3);border-radius:12px;background:#131923;padding:12px 10px;overflow-wrap:anywhere}
.andamento-kpi small{display:block;color:#a8b0bc;font-size:11px;line-height:1.35;margin-bottom:7px}
.andamento-kpi strong{display:block;font-size:clamp(15px,4vw,22px);font-variant-numeric:tabular-nums;color:#f8f8f8}
.andamento-kpi.principale strong{color:#52ce7b}
.andamento-kpi .variazione{display:block;margin-top:6px;font-size:12px;font-weight:600}
.andamento-kpi .positivo{color:#56ce7e}.andamento-kpi .negativo{color:#fa7777}.andamento-kpi .neutro{color:#c5ad78}
.andamento-chart-card{margin-top:13px;border:1px solid rgba(227,179,65,.35);border-radius:12px;background:#111721;padding:12px 9px}
.andamento-chart-card h3{color:#e3b341;font-size:14px;margin:0 0 8px}
.andamento-plot{position:relative;width:100%;height:195px;display:block}
.andamento-plot .grid-line{stroke:#364150;stroke-width:.65;stroke-dasharray:2 3}
.andamento-plot .andamento-area{fill:rgba(46,160,67,.12)}
.andamento-plot .andamento-line{fill:none;stroke:#50cf83;stroke-width:2.25;stroke-linejoin:round;stroke-linecap:round}
.andamento-plot .plot-label{font-size:10px;fill:#a8b0bc}
.andamento-plot .plot-value{font-size:10px;fill:#e3b341}
.andamento-plot circle{fill:#e3b341}
.andamento-legenda{font-size:12px;color:#b8c0cc;margin-top:6px}
.andamento-info{font-size:12px;color:#b8c0cc;line-height:1.6;margin-top:11px}
.andamento-stato{color:#d1d5db;font-size:13px;padding:10px 3px}
.andamento-errore{color:#ffc2b9!important}
.andamento-riprova{border:1px solid #b78d39;border-radius:9px;background:#252012;color:#f3d99b;padding:9px 13px;margin-top:8px;font-size:13px}
@media(max-width:360px){.andamento-kpi{padding:10px 8px}.andamento-tabs button{font-size:12px;padding:10px 5px}}
`;
function testo(tag,text,cls='') {const el=document.createElement(tag);el.textContent=text;if(cls)el.className=cls;return el;}
function grafico(dati) {
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 340 195');svg.classList.add('andamento-plot');
  svg.setAttribute('role','img');svg.setAttribute('aria-label','Grafico degli incassi netti giornalieri per il periodo selezionato');
  const vals=dati.map(d=>d.incasso), n=Math.max(vals.length,1), minimo=Math.min(0,...vals), massimo=Math.max(0,...vals);
  const distanza=massimo-minimo||1, sx=i=>34+(n===1?140:(i/(n-1))*295), sy=v=>162-(v-minimo)/distanza*130;
  const NS='http://www.w3.org/2000/svg';
  const elem=(tag,attrs)=>{const e=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));svg.append(e);return e;};
  for(let i=0;i<=3;i++){const val=minimo+(massimo-minimo)*i/3;const y=sy(val);
    elem('line',{x1:34,y1:y,x2:330,y2:y,class:'grid-line'});
    const l=elem('text',{x:30,y:y+3,'text-anchor':'end',class:'plot-label'});l.textContent=val>=1000?Math.round(val/1000)+'k':Math.round(val).toString();
  }
  if(!dati.length)return svg;
  const points=dati.map((d,i)=>[sx(i),sy(d.incasso)]);
  const zero=sy(0);const area=`M ${points[0][0]} ${zero} `+points.map(p=>`L ${p[0]} ${p[1]}`).join(' ')+` L ${points[points.length-1][0]} ${zero} Z`;
  elem('path',{d:area,class:'andamento-area'});
  elem('polyline',{points:points.map(p=>p.join(',')).join(' '),class:'andamento-line'});
  for(let i=0;i<dati.length;i++){
    if(i===0||i===dati.length-1||((dati.length<=10)?true:(i%Math.max(1,Math.ceil(dati.length/6))===0))){
      const l=elem('text',{x:sx(i),y:182,'text-anchor':'middle',class:'plot-label'});l.textContent=dati[i].data.slice(8);
    }
    if(dati.length<=7)elem('circle',{cx:points[i][0],cy:points[i][1],r:3});
  }
  return svg;
}
function mostra(d,root) {
  root.replaceChildren();
  const grid=testo('div','','andamento-grid');
  const elemento=(label,value,cls,optional)=>{const card=testo('div','','andamento-kpi '+(cls||''));card.append(testo('small',label),testo('strong',value));if(optional)card.append(optional);grid.append(card);};
  const variazione=testo('span',d.percentuale==null?'Confronto non disponibile':(d.percentuale>=0?'+':'')+fmtPct.format(d.percentuale)+'% rispetto al periodo precedente','variazione '+(d.percentuale==null?'neutro':d.percentuale>=0?'positivo':'negativo'));
  elemento('Incassi netti vendite',fmtEuro.format(d.incasso),'principale',variazione);
  elemento('Media giornaliera',fmtEuro.format(d.mediaGiornaliera));
  elemento('Contanti',fmtEuro.format(d.contanti));
  elemento('POS',fmtEuro.format(d.pos));
  elemento('Scontrini commerciali',String(d.scontrini));
  elemento('Media scontrino',fmtEuro.format(d.mediaScontrino));
  elemento('Saldo complessivo',fmtEuro.format(d.saldo));
  elemento('Giorno migliore',d.giornoMigliore?fmtEuro.format(d.giornoMigliore.incasso):'—');
  root.append(grid);
  const chart=testo('section','','andamento-chart-card');chart.append(testo('h3','Incassi netti per giornata'),grafico(d.attuali));
  chart.append(testo('div',`Dal ${d.periodo.dal.split('-').reverse().join('/')} al ${d.periodo.fine.split('-').reverse().join('/')} · confronto ${d.periodo.precedenteDal.split('-').reverse().join('/')}–${d.periodo.precedenteFine.split('-').reverse().join('/')}`,'andamento-legenda'));
  root.append(chart);
  root.append(testo('p','Incassi netti vendite = Contanti + POS, inclusi eventuali resi registrati; saldo complessivo = incassi + entrate extra − uscite. Media scontrino secondo le regole V2. Nessuna modifica ai dati Firebase.','andamento-info'));
  if(d.percentuale===null)root.append(testo('p','La percentuale non è calcolabile perché il periodo precedente ha incassi pari a zero.','andamento-info'));
}
export function montaAndamento(container,{leggiIntervallo,riepiloga,autenticato}) {
  if(typeof leggiIntervallo!=='function'||typeof riepiloga!=='function')throw new Error('Funzioni del Cruscotto non disponibili.');
  if(!document.getElementById('stile-andamento-v1')) {const el=document.createElement('style');el.id='stile-andamento-v1';el.textContent=CSS;document.head.append(el);}
  const buttons=testo('div','','andamento-tabs');const output=testo('div','','andamento-output');const stato=testo('div','','andamento-stato');
  let active=null,seq=0,controller=null;
  const all=[['7','7 giorni'],['30','30 giorni'],['mese','Questo mese']];
  const scegli=async tipo=>{
    controller?.abort();controller=new AbortController();const current=++seq;active=tipo;
    for(const b of buttons.children)b.setAttribute('aria-pressed',String(b.dataset.periodo===tipo));
    output.replaceChildren();stato.className='andamento-stato';stato.textContent='Caricamento andamento…';
    try {
      if(!autenticato())throw new Error('Sessione scaduta. Effettua nuovamente l’accesso.');
      const oggi=new Date();
      const p=periodoAndamento(tipo,oggi);
      const ris=await leggiIntervallo(p.letturaDal,p.fine,{signal:controller.signal});
      if(current!==seq||!container.isConnected)return;
      if(!autenticato())throw new Error('Sessione terminata.');
      mostra(calcolaAndamento(tipo,ris,riepiloga,oggi),output);
      stato.textContent='';
    }catch(error){if(current!==seq||!container.isConnected||controller.signal.aborted)return;
      stato.className='andamento-stato andamento-errore';stato.textContent=error?.message||'Impossibile leggere lo storico. Verifica permessi e connessione.';
      const retry=testo('button','RIPROVA','andamento-riprova');retry.type='button';retry.addEventListener('click',()=>scegli(active));stato.append(retry);
    }
  };
  for(const [value,label] of all){const b=testo('button',label);b.type='button';b.dataset.periodo=value;b.setAttribute('aria-pressed','false');b.addEventListener('click',()=>scegli(value));buttons.append(b);}
  container.append(buttons,stato,output);
  scegli('7');
  return ()=>{seq++;controller?.abort();};
}

import {lazy,Suspense,useEffect,useRef,useState} from 'react';
import type {Attempt,CaseFile,Role,Services,TurnFeedback} from './types';
import data from './content/scenarios.json';
import {newAttempt,roleNames,assessHearing,parseAttempts} from './training';
import {api,SourcePanel} from './services';
import {Avatar,Icon} from './ui';
import {useAcademyMotion,useAcademyReveals} from './academyMotion';
import EmptySearch from './EmptySearch';
const Court=lazy(()=>import('./FullHearing'));
const cases=data as unknown as CaseFile[];
const courts=[['criminal','Jinoyat sudlari','Jinoyat ishlari va tegishli ma’muriy huquqbuzarlik ishlari.'],['civil','Fuqarolik sudlari','Oila, mehnat, uy-joy, meros va shaxsiy nizolar.'],['economic','Iqtisodiy sudlar','Tadbirkorlar va tashkilotlar o‘rtasidagi tijoriy nizolar.'],['administrative','Ma’muriy sudlar','Davlat organlari qarori va harakatsizligi ustidan nizolar.']];
const roles:Role[]=['advokat','sudya','prokuror'];
const avatar={advokat:'madina',sudya:'kamol',prokuror:'sardor',fuqaro:'dilnoza'};
const storage='huquqbek-independent-v1';
function saved(){try{return parseAttempts(localStorage.getItem(storage),cases).filter(a=>cases.some(c=>c.id===a.caseId));}catch{return[];}}
export default function Scenarios({services,onActive}:{services:Services;onActive:(v:boolean)=>void}){
 const[filter,setFilter]=useState('all'),[search,setSearch]=useState(''),[selected,setSelected]=useState<CaseFile|null>(null),[role,setRole]=useState<Role>('advokat'),[items,setItems]=useState<Attempt[]>(saved),[active,setActive]=useState(''),[report,setReport]=useState(false),[error,setError]=useState('');
 useEffect(()=>{if(!selected)return;const previous=document.activeElement as HTMLElement|null;const oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';const dialog=document.querySelector('.scenario-brief') as HTMLElement|null;dialog?.querySelector<HTMLButtonElement>('button')?.focus();const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){setSelected(null);return;}if(e.key!=='Tab'||!dialog)return;const targets=[...dialog.querySelectorAll<HTMLElement>('button,a[href],input,select,textarea,summary')].filter(el=>!el.hasAttribute('disabled')&&el.getClientRects().length);const first=targets[0],last=targets.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}};document.addEventListener('keydown',key);return()=>{document.body.style.overflow=oldOverflow;document.removeEventListener('keydown',key);previous?.focus();};},[selected]);
 const a=items.find(x=>x.id===active),c=cases.find(x=>x.id===a?.caseId);
 const catalog=useRef<HTMLElement>(null);
 const listing=!a||!c;
 useAcademyMotion(catalog,listing?'scenarios':null);
 useAcademyReveals(catalog,listing?filter+'|'+search:null);
 const results=cases.filter(c=>(filter==='all'||filter===c.courtType)&&c.title.toLowerCase().includes(search.toLowerCase()));
 useEffect(()=>{onActive(!!a&&!report);return()=>onActive(false);},[!!a,report]);
 function update(next:Attempt){setItems(old=>{const nextItems=[next,...old.filter(x=>x.id!==next.id)].slice(0,40);try{localStorage.setItem(storage,JSON.stringify(nextItems));}catch{setError('Brauzer xotirasiga saqlanmadi. Sahifani yopishdan oldin hisobotni nusxalang.');}return nextItems;});setActive(next.id);}
 if(a&&c&&!report)return <Suspense fallback={<p>Sud zali yuklanmoqda…</p>}><Court key={a.id} a={a} c={c} services={services} update={update} back={()=>setActive('')} review={()=>setReport(true)}/></Suspense>;
 if(a&&c&&report)return <ScenarioReport a={a} c={c} services={services} back={()=>{setActive('');setReport(false);}} resume={()=>setReport(false)}/>;
 return <>
  <section className="scenario-catalog" ref={catalog}>
   <header className="academy-banner scenario-banner" data-academy-intro>
    <div className="academy-banner-art" aria-hidden="true"/>
    <div className="academy-banner-copy">
     <span className="learn-eyebrow" data-academy-enter>MUSTAQIL AMALIYOT · 4 SUD TURI</span>
     <h1 data-academy-enter>Real hayot ssenariylari</h1>
     <p className="learn-lead" data-academy-enter>Ishni va rolingizni tanlang. Hujjatlarni o‘rganing, taraflar bilan gaplashing, dalillarni tekshiring va o‘z xulosangizni asoslang. Bu yerda dars kaliti yoki tayyor javob yo‘q.</p>
    </div>
   </header>
   <div className="scenario-courts">
    <button aria-pressed={filter==='all'} onClick={()=>setFilter('all')} data-academy-card>
     <Icon name="scales"/><b>Barcha sudlar</b><small>{cases.length} ssenariy</small>
    </button>
    {courts.map(([id,name,description])=>(
     <button key={id} aria-pressed={filter===id} onClick={()=>setFilter(id)} data-academy-card>
      <Icon name={id==='criminal'?'cases':'book'}/><b>{name}</b><small>{description}</small><span>{cases.filter(c=>c.courtType===id).length} ssenariy</span>
     </button>
    ))}
   </div>
   <div className="scenario-toolbar">
    <input className="learn-search" aria-label="Ssenariy qidirish" placeholder="Ish nomi yoki mavzu…" value={search} onChange={e=>setSearch(e.target.value)}/>
    <output aria-live="polite">{results.length} ssenariy</output>
   </div>
   <div className="all-room-grid">
    {results.length===0&&<EmptySearch reset={()=>{setSearch('');setFilter('all');}}/>}
    {results.map(c=>(
     <button className="learn-card scenario-card" key={c.id} data-academy-card data-court={c.courtType}
      onClick={()=>{setSelected(c);if(role==='prokuror'&&!c.trial?.prosecutorAllowed)setRole('advokat');}}>
      <small>{courts.find(x=>x[0]===c.courtType)?.[1]} · {c.trial?.prosecutorAllowed?3:2} protsessual rol</small>
      <h3>{c.title}</h3>
      <p>{c.facts[0].slice(0,150)}…</p>
      <span>{c.source.type==='adapted_training'?'Arxivdan moslashtirilgan':'Mualliflik o‘quv mashqi'} · {c.duration} daqiqa</span>
      <b>Sud ishini ochish <span className="scenario-card-arrow" aria-hidden="true">↗</span></b>
     </button>
    ))}
   </div>
   </section><article className="learn-course-note"><Icon name="book"/><p><b>Manbalar shaffofligi.</b> Rasmiy ochiq xabarlar va arxivdagi o‘quv vaziyatlari alohida ko‘rsatiladi. Asl sud hujjati olinmagan materiallar rekonstruksiya deb belgilangan. Har bir ishda manba cheklovlari ko‘rinadi. Ma’muriy huquqbuzarlik tasnif mashqi alohida ssenariy tahririni kutmoqda. <a href="https://toshkent-vil.adliya.uz/uz/news/detail.php?ID=74145" target="_blank" rel="noreferrer">Sud tizimi haqida</a></p></article>{items.length>0&&<><h2>So‘nggi urinishlaringiz</h2><div className="learn-room-list">{items.map(a=><button className="learn-room-row" key={a.id} onClick={()=>{setActive(a.id);setReport(false);}}><Icon name={a.completed?'check':'play'}/><div><b>{cases.find(c=>c.id===a.caseId)?.title}</b><small>{roleNames[a.role]} · {new Date(a.updatedAt).toLocaleDateString('uz-UZ')}</small></div><span>{a.completed?'Hisobot':'Davom ettirish'}</span></button>)}</div><p className="learn-muted">Yangi majlisning bosqichi, nutqlar va o‘quv qarori shu profilning mahalliy serverida saqlanadi. Kurs kalitlaridan alohida.</p></>}{error&&<p role="alert">{error}</p>}
 {selected&&<div className="scenario-overlay" role="dialog" aria-modal="true" aria-label="Sud ishini tanlash"><article className="scenario-brief"><button className="brief-close" onClick={()=>setSelected(null)} aria-label="Yopish">×</button><span className="learn-eyebrow">ISH BILAN TANISHING</span><h2>{selected.title}</h2>{selected.facts.map(t=><p key={t}>{t}</p>)}<p className="learn-muted">{selected.source.summary}</p><h3>Kim bo‘lib qatnashasiz?</h3><div className="scenario-roles">{roles.map(r=><button key={r} aria-pressed={role===r} disabled={r==='prokuror'&&!selected.trial?.prosecutorAllowed} onClick={()=>setRole(r)}><Avatar id={avatar[r]} color="#91b6a4" size={58}/><b>{roleNames[r]}</b></button>)}</div><p>{selected.rolePrompts[role]?.opening}</p>{selected.trial?.available===false&&<p className="learn-badge">{selected.trial.reason}</p>}<p className="learn-muted">{selected.trial?.prosecutorBasis}</p><details><summary>Hujjatlar va huquqiy tayanch</summary><SourcePanel c={selected}/><ul>{selected.evidence.map(e=><li key={e.id}>{e.id} · {e.title}</li>)}</ul></details><p className="learn-muted">24 tinglovchili ochiq zal. Sudya, kotib, taraflar, ikki vakil va chaqiriladigan guvoh alohida suhbatdoshlar. Ochiq majlis hamma ishlar uchun majburiy qoida emas. Jarayon o‘quv modeli sifatida qisqartirilgan.</p><button className="learn-primary" disabled={selected.trial?.available===false} onClick={()=>{const next=newAttempt(selected,role,avatar[role]);next.mode='immersive';update(next);setSelected(null);}}>Mustaqil sudni boshlash <Icon name="play"/></button></article></div>}</>;
}
function ScenarioReport({a,c,services,back,resume}:{a:Attempt;c:CaseFile;services:Services;back:()=>void;resume:()=>void}){
 const r=assessHearing(a,c),[feedback,setFeedback]=useState<TurnFeedback|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{try{setFeedback(JSON.parse(localStorage.getItem('hb-scenario-feedback-'+a.id)||'null'));}catch{}},[a.id]);
 const analyze=async()=>{setBusy(true);setError('');try{const f=await api<TurnFeedback>('/api/analyze',{caseId:c.id,role:a.role,stage:'reasoning',text:a.final?.text,position:a.final?.position,sourceIds:a.final?.sourceIds,evidence:a.evidence});setFeedback(f);try{localStorage.setItem('hb-scenario-feedback-'+a.id,JSON.stringify(f));}catch{setError('AI hisoboti brauzerga saqlanmadi.');}}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 return <><button onClick={back}>← Ssenariylarga qaytish</button><section className="room-heading"><div><span className="learn-eyebrow">MUSTAQIL SUD HISOBOTI</span><h1>{c.title}</h1><p>{roleNames[a.role]} · {a.completed?'Yakunlangan':'Davom etmoqda'}</p></div><Avatar id={a.avatar} color="#91b6a4" size={85}/></section><article className="learn-card"><h2>Tayyorgarlik mezonlari: {r.score}/100</h2><p>{r.outcomeLabel}</p><p className="learn-muted">Ball jarayon va asoslash mezonlarini ko‘rsatadi. Yutuq yoki mag‘lubiyatning haqiqiy huquqiy bahosi emas.</p>{r.dimensions.map(d=><p key={d.label}>{d.label}: {d.score}/{d.max}</p>)}</article><div className="scenario-report-grid">{[["Kuchli jihatlar",r.strengths],["Yaxshilash kerak",r.mistakes],["Keyingi qadam",r.nextSteps]].map(([title,items])=><article className="learn-card" key={title as string}><h3>{title as string}</h3><ul>{(items as string[]).map(x=><li key={x}>{x}</li>)}</ul></article>)}</div><article className="learn-card"><h2>O‘z xulosangiz</h2><p>{a.final?.position}</p><p>{a.final?.text||'Xulosa hali yozilmagan.'}</p>{!a.completed?<button onClick={resume}>Sudga qaytish</button>:<button disabled={busy||!services.groq.configured} onClick={()=>void analyze()}>{busy?'Tahlil qilinmoqda…':'Groq bilan xulosani baholash'}</button>}{error&&<p role="alert">{error}</p>}{feedback&&<><h3>QonunAI fikri</h3><p>{feedback.summary}</p><ul>{feedback.strengths.map(x=><li key={x}>{x}</li>)}</ul><h4>Tavsiyalar</h4><ul>{feedback.improvements.map(x=><li key={x}>{x}</li>)}</ul><p className="learn-muted">AI fikri · huquqshunos tekshiruvi kerak.</p></>}</article></>;
}

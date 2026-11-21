import {lazy,Suspense,useEffect,useRef,useState} from 'react';
import type {Career,Level,Catalog,Learner,LearningRoom,LearningAttempt} from './learningTypes';
import type {Services} from './types';
import {api,offline,ServicesModal} from './services';
import {Icon,Avatar} from './ui';
import {startRecording} from './voice';
import type {Recording} from './voice';
import {speech} from './speech';
import ReadingQuestion from './ReadingQuestion';
import AcademyHeader from './AcademyHeader';
import AcademySkeleton from './AcademySkeleton';
import EmptySearch from './EmptySearch';
import './huquqbek.css';
import './learning.css';
import AcademyHero from './AcademyHero';
import { useAcademyMotion, useAcademyReveals } from './academyMotion';
import SpotlightCard from './vendor/react-bits/SpotlightCard';
import './academy.css';
import './academyControls.css';
import './casefile.css';
import './exams.css';
import Select from './Select';
import { ClickSpark, CountUp, SplitText } from './vendor/react-bits/Effects';
import type { ExamLevel, Role } from './commerceTypes';
const Lab=lazy(()=>import('./LearningLab'));
const Scenarios=lazy(()=>import('./Scenarios'));
const Archive=lazy(()=>import('./LibraryApp'));
const Login=lazy(()=>import('./Login'));
const Pricing=lazy(()=>import('./Pricing'));
const ExamHub=lazy(()=>import('./Exams').then(m=>({default:m.ExamHub})));
const ExamMode=lazy(()=>import('./Exams').then(m=>({default:m.ExamMode})));
const Certificates=lazy(()=>import('./Certificates'));
const VerifyPage=lazy(()=>import('./Certificates').then(m=>({default:m.VerifyPage})));
const examRoles=['advokat','prokuror','sudya'],examLevels=['beginner','junior','senior'];
const Paywall=({kind}:{kind:'lesson'|'lab'})=><article className="case-paper paywall"><span className="case-stamp purple">Premium</span><h2>{kind==='lesson'?'Bu dars Premium obuna bilan ochiladi':'Bu laboratoriya Premium obuna bilan ochiladi'}</h2><p>{kind==='lesson'?'Har yo‘nalishdagi 1- va 2-darslar bepul. 3-darsdan boshlab Premium obuna kerak.':'Butun katalogda faqat 3 ta laboratoriya bepul. Qolganlari Premium obuna bilan ochiladi.'} Premium: <b>99 000 so‘m/oy</b> yoki <b>999 000 so‘m/yil</b>. Natijalaringiz saqlanib qoladi.</p><a className="learn-primary" href="#/pricing">Obuna narxlarini ko‘rish</a></article>;
const career:Record<Career,{name:string;description:string;avatar:string;color:string;icon:string}>={
 advokat:{name:'Advokat',description:'Tinglang. Dalillarni bog‘lang. Huquqni himoya qiling.',avatar:'madina',color:'#2d6b4a',icon:'book'},
 sudya:{name:'Sudya',description:'Taraflarni tinglang. Xolis baholang. Qaroringizni asoslang.',avatar:'kamol',color:'#7a3a35',icon:'scales'},
 prokuror:{name:'Prokuror',description:'Da’voni tekshiring. Qonuniylikni saqlang. Mas’uliyatli pozitsiya bildiring.',avatar:'sardor',color:'#2f4f7a',icon:'cases'},
};
const careers=Object.keys(career) as Career[];
function route(){return location.hash.replace(/^#\/?/,'').split('/').filter(Boolean);}
function navigate(path:string){location.hash='/'+path;}
export default function LearningApp(){
 const [catalog,setCatalog]=useState<Catalog|null>(null),[profile,setProfile]=useState<Learner|null>(null),[current,setCurrent]=useState(route),[room,setRoom]=useState<LearningRoom|null>(null),[attempt,setAttempt]=useState<LearningAttempt|null>(null),[lab,setLab]=useState(false),[theoryRead,setTheoryRead]=useState(false),[services,setServices]=useState<Services>(offline),[settings,setSettings]=useState(false),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[search,setSearch]=useState(''),[answers,setAnswers]=useState<Career[]>([]),[name,setName]=useState(''),[loadError,setLoadError]=useState(''),[courtActive,setCourtActive]=useState(false);
 const [view,arg,arg2]=current;
 const [examLive,setExamLive]=useState(false);
 const main=useRef<HTMLElement>(null);
 const [roomError,setRoomError]=useState('');
 const [retryRoom,setRetryRoom]=useState(0);
 const motionPage=catalog&&profile&&!lab&&!courtActive&&view!=='archive'&&view!=='scenarios'&&view!=='exam' ? current.join('/') : null;
 useAcademyMotion(main,motionPage);
 useAcademyReveals(main, motionPage===null ? null : [motionPage, view==='rooms'?search:'', room?.id].join('|'));
 useEffect(()=>{const change=()=>{setCurrent(route());setLab(false);window.scrollTo(0,0);};window.addEventListener('hashchange',change);return()=>window.removeEventListener('hashchange',change);},[]);
 useEffect(()=>{const v=window.visualViewport;const resize=()=>document.documentElement.style.setProperty('--learning-height',`${v?.height||window.innerHeight}px`);resize();v?.addEventListener('resize',resize);return()=>{v?.removeEventListener('resize',resize);document.documentElement.style.removeProperty('--learning-height');};},[]);
 const refresh=async()=>{const p=await api<Learner>('/api/learning/profile');setProfile(p);setName(p.name==='O‘quvchi'?'':p.name);return p;};
 useEffect(()=>{document.title='HuquqBek · Huquqni amalda o‘rganing';void Promise.all([api<Catalog>('/api/learning/catalog'),refresh(),api<Services>('/api/status')]).then(([c,,s])=>{setCatalog(c);setServices(s);}).catch(e=>setLoadError(e.message));},[]);
 useEffect(()=>{if(view!=='room'||!arg){setRoom(null);return;}let active=true;setRoomError('');setRoom(null);setTheoryRead(false);setAttempt(null);void api<LearningRoom>('/api/learning/rooms/'+encodeURIComponent(arg)).then(r=>{if(active)setRoom(r);}).catch(e=>{if(active)setRoomError(e.message);});return()=>{active=false;};},[view,arg,retryRoom]);
 useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(''),7000);return()=>clearTimeout(t);},[notice]);
 useEffect(()=>{void api<{version:string}>('/__huquqbek_health').then(h=>{if(h.version!==import.meta.env.VITE_APP_VERSION)setNotice('Server va interfeys versiyasi mos emas. Yangi HuquqBek havolasini oching.');}).catch(()=>{});},[]);
 if(loadError)return <div className="learn-app learn-loading"><Icon name="scales" size={50}/><h1>HuquqBek serveriga ulanib bo‘lmadi</h1><p>{loadError}</p><button onClick={()=>location.reload()}>Qayta urinish</button></div>;
 if(!catalog||!profile)return <div className="learn-app academy-ui"><AcademySkeleton label="HuquqBek o‘quv maydoni tayyorlanmoqda…"/></div>;
 if(view==='archive')return <><button className="learn-archive-return" onClick={()=>navigate('dashboard')}>O‘quv yo‘nalishlariga qaytish</button><Suspense fallback={<AcademySkeleton label="Yuklanmoqda…"/>}><Archive/></Suspense></>;
 const logout=async()=>{if(!confirm('Hisobdan chiqasizmi? Natijalaringiz Google hisobingizda saqlanib qoladi.'))return;await api('/api/learning/auth/logout',{});location.hash='/login';location.reload();};
 const onLogin=(p:Learner)=>{setProfile(p);setName(p.name==='O‘quvchi'?'':p.name);navigate(p.interests?'dashboard':'interest');};
 if((!profile.account&&!profile.onboarding&&view!=='verify')||view==='login')return <div className="learn-app academy-ui"><Suspense fallback={<AcademySkeleton label="Yuklanmoqda…"/>}><Login onDone={onLogin}/></Suspense></div>;
 const completed=new Set(profile.completed.map(c=>c.room)),recommended=profile.interests?.recommended||[],activePath:Career=profile.activePath||recommended[0]||'advokat',path=careers.includes(arg as Career)?arg as Career:activePath;
 const needsTest=!profile.interests&&!['verify','interest-result'].includes(view||'');
 const choosePath=async(p:Career,go?:string)=>{try{setProfile(await api<Learner>('/api/learning/active-path',{path:p}));if(go)navigate(go);}catch(e){setNotice((e as Error).message);}};
 const showTest=view==='interest'||needsTest,activeRoom=room&&view==='room'?room:null;
 const begin=async()=>{if(!room||busy)return;setBusy(true);try{setAttempt(await api('/api/learning/start',{roomId:room.id}));setLab(true);}catch(e){const err=e as Error&{code?:string};setNotice(err.message);if(err.code==='PREMIUM_REQUIRED')navigate('pricing');}finally{setBusy(false);}};
 const finish=async()=>{const previous=profile?.certificates.length||0;const updated=await refresh();setLab(false);if(room)setRoom({...room,completed:true});setNotice(updated.certificates.length>previous?'Kalit qabul qilindi. Xona yakunlandi! Sertifikatingiz profilingizda.':'Kalit qabul qilindi. Xona yakunlandi!');};
 const submitInterests=async()=>{setBusy(true);try{await api('/api/learning/interests',{answers});await refresh();navigate('interest-result');}catch(e){setNotice((e as Error).message);}finally{setBusy(false);}};
 const nextRoom=(p:Career)=>catalog.rooms.find(r=>r.path===p&&!completed.has(r.id));
 const recent=profile.attempts.find(a=>a.status!=='completed'&&!completed.has(a.roomId)),currentRoom=(recent&&catalog.rooms.find(r=>r.id===recent.roomId&&r.path===activePath))||nextRoom(activePath)||catalog.rooms.find(r=>!completed.has(r.id)),roomPercent=recent?.progress||0,overall=Math.round(completed.size/45*100);
 const roomMatches=view==='rooms'?catalog.rooms.filter(r=>(r.title+' '+r.id+' '+r.path).toLocaleLowerCase().includes(search.toLocaleLowerCase())):[];
 const renderPaths=()=>(
  <div className="learn-path-grid academy-role-grid">
   {careers.map(id=>{
    const role=career[id];
    const finished=catalog.rooms.filter(room=>room.path===id&&completed.has(room.id)).length;
    return (
     <SpotlightCard key={id} className={'academy-path-spotlight path-'+id} data-academy-tilt data-academy-card spotlightColor={role.color} intensity={0.24} proximity={0} grain={0}>
      <button className={'learn-path-card path-'+id} onClick={()=>void choosePath(id,'path/'+id)}>
       <Icon name={role.icon} size={172}/>
       <div className="path-top">
        <Icon name={role.icon} size={27}/>
        {activePath===id?<span>Joriy yo‘nalish</span>:recommended.includes(id)&&<span>Sizga tavsiya</span>}
       </div>
       <h2>{role.name}</h2>
       <p>{role.description}</p>
       <div className="path-meta"><span>15 xona</span><span>3 daraja</span></div>
       <progress aria-label={role.name} max={15} value={finished}/>
       <footer><small>{finished}/15 yakunlangan</small><b>{activePath===id?'Davom ettirish':'Shu yo‘nalishni tanlash'} <span aria-hidden="true">↗</span></b></footer>
      </button>
     </SpotlightCard>
    );
   })}
  </div>
 );
 return <div className={'learn-app'+(!lab&&!courtActive?' academy-ui':'')+(lab?' lab-active':'')+(courtActive?' independent-active':'')}>
  {!lab&&<><div className="learn-content">{!courtActive&&<AcademyHeader view={view} name={profile.name} navigate={navigate} signedIn={!!profile.account} onLogout={()=>void logout()}/>}<main ref={main} className={'learn-main'+(!view||view==='dashboard'?' academy-home':'')}>
   {showTest?<section className="interest-page"><span className="learn-eyebrow">BOSHLASHDAN OLDIN · TAXMINAN 2 DAQIQA</span><h1>Sizga qaysi yo‘nalish yaqin?</h1><p className="learn-lead">O‘zingizga yaqin javobni tanlang. Bu qiziqishlar so‘rovnomasi — psixologik tashxis yoki kasbga yaroqlilik bahosi emas.</p><div className="interest-progress"><progress max={6} value={answers.length}/><span>{Math.min(answers.length+1,6)} / 6</span></div>{answers.length<6?<article className="interest-question" key={answers.length}><h2>{catalog.questions[answers.length].prompt}</h2>{catalog.questions[answers.length].options.map((o,i)=><button key={o.id} className="interest-option" onClick={()=>setAnswers(a=>[...a,o.id])}><span>{String.fromCharCode(65+i)}</span>{o.text}</button>)}{answers.length>0&&<button className="learn-link" onClick={()=>setAnswers(a=>a.slice(0,-1))}>Oldingi savol</button>}</article>:<article className="interest-question"><Icon name="check" size={42}/><h2>Javoblaringiz tayyor</h2><p>Tavsiya qiziqishlaringizga asoslanadi. Bu bilim darajangizni belgilamaydi. Uchala yo‘nalish ham siz uchun ochiq.</p><button className="learn-primary" aria-busy={busy} disabled={busy} onClick={()=>void submitInterests()}>Tavsiyamni ko‘rish</button><button className="learn-link" onClick={()=>setAnswers([])}>Qayta javob berish</button></article>}{profile.interests&&<button className="learn-link" onClick={()=>navigate('paths')}>Yo‘nalishni o‘zim tanlayman</button>}</section>:
   view==='interest-result'&&profile.interests?<section className="case-page interest-result">
     <header className="case-heading" data-stamp="Natija"><span className="case-docket">YO‘NALISH TESTI NATIJASI</span><h1>{recommended.length===1?<>Sizning yo‘nalishingiz: <em>{career[recommended[0]].name}</em></>:'Bir nechta yo‘nalish sizga teng darajada yaqin'}</h1><p>{recommended.length===1?'Dashboard endi shu yo‘nalishdan davom etadi. Uni istalgan payt «Yo‘nalishlar» sahifasida o‘zgartirishingiz mumkin.':'Qaysi biridan boshlashni tanlang — dashboard shu yo‘nalishdan davom etadi.'} Bu qiziqishlar so‘rovnomasi, kasbiy yoki psixologik tashxis emas.</p></header>
     <div className="case-grid">{careers.map(id=>{const sc=profile.interests!.scores[id]||0,top=recommended.includes(id);return <article key={id} className={'dossier-card'+(top?' top':'')} style={{['--role' as string]:({advokat:'#4cc38a',sudya:'#e5675e',prokuror:'#5b9cf0'} as Record<Career,string>)[id]}}><div className="dossier-seal" aria-hidden="true"><Icon name={career[id].icon} size={24}/></div><span className="case-docket">{sc}/6 JAVOB</span><h3>{career[id].name}</h3>{top&&<span className="case-stamp green">Sizga mos</span>}<p>{career[id].description}</p><progress max={6} value={sc} aria-label={career[id].name}/>{top&&<button className={recommended.length===1||profile.activePath===id?'learn-primary':'case-button-sand'} onClick={()=>void choosePath(id,'dashboard')}>{recommended.length===1?'O‘qishni boshlash':'Shu yo‘nalishdan boshlash'}</button>}</article>;})}</div>
    </section>:
   view==='scenarios'?<Suspense fallback={<AcademySkeleton label="Ssenariylar yuklanmoqda…"/>}><Scenarios services={services} onActive={setCourtActive}/></Suspense>:
   view==='room'?room&&room.id===arg?<><div className="learn-breadcrumb"><button onClick={()=>navigate('path/'+room.path)}>{career[room.path].name} yo‘nalishi</button><span>{room.level} / {room.id}</span></div><section data-academy-reveal className="room-heading"><div><span className="learn-eyebrow">NAZARIYA + 3D LAB</span><h1>{room.title}</h1><p>{room.duration_minutes} daqiqa · {room.capstone?'Bosqich yakuniy laboratoriyasi':'Mavzu laboratoriyasi'}</p></div><Avatar id={career[room.path].avatar} color={career[room.path].color} size={84}/></section>{room.access&&!room.access.lesson?<Paywall kind="lesson"/>:room.locked?<article className="learn-card"><h2>Bu xona hali ochilmagan</h2><p>Oldingi xonani uning lab kaliti bilan yakunlang.</p><button className="learn-primary" onClick={()=>navigate('room/'+room.prerequisites[0])}>Oldingi xonaga o‘tish</button></article>:<div className="room-layout"><article className="room-theory"><span className="learn-badge">MANBALI DARS · AMALIY TAHLIL</span><h2>Avval tushunamiz</h2>{room.lesson?<><p className="lesson-objective">{room.lesson.objective}</p><p className="lesson-source-status">{room.lesson.status} · {room.lesson.auditedAt}</p>{room.lesson.sections.map((section,i)=><section data-academy-reveal className="lesson-section" key={i}><div className="lesson-section-heading"><span>{i+1}</span><h2>{section.title}</h2></div><p>{section.body}</p><a href={section.source_url} target="_blank" rel="noreferrer" className="lesson-reference">Rasmiy huquqiy manba <Icon name="external" size={13}/></a>{section.articles.length>0&&<details className="lesson-original"><summary>Asl manbadagi tegishli moddalar</summary>{section.articles.map(a=><article key={a.url+a.title}><a href={a.url} target="_blank" rel="noreferrer">{a.title}</a>{a.excerpt&&<blockquote data-raw>{a.excerpt}</blockquote>}</article>)}</details>}{i<2&&room.knowledge?.[i]&&<ReadingQuestion roomId={room.id} check={room.knowledge[i]} onUpdate={setRoom}/>}</section>)}</>:room.theory.map((t,i)=><section className="theory-part" key={i}><span>{i+1}</span><p>{t}</p></section>)}<div data-academy-reveal className="room-example"><Icon name="book"/><div><h3>Amaliy misol</h3><p>{room.worked_example}</p></div></div><h2>Endi o‘zingiz sinab ko‘ring</h2><p>{room.lab.scenario}</p><ul>{room.lab.tasks.map(t=><li key={t}>{t}</li>)}</ul><p className="learn-muted">Labda uchta sintetik material va uch vaziyatli qaror mavjud. Har xona uchun o‘z materiallari va savollari beriladi. 3D sud muhiti umumiy.</p>{room.completed?<div className="room-complete"><Icon name="check"/><h3>Xona yakunlangan</h3><p>Kalit qabul qilingan va natija serverda saqlangan.</p><button className="learn-primary" onClick={()=>{const n=nextRoom(room.path);navigate(n?'room/'+n.id:'profile');}}>Keyingi qadam</button><button onClick={()=>void begin()}>Lab qaydlarini ko‘rish</button></div>:<><label className="learn-checkbox"><input type="checkbox" checked={theoryRead} onChange={e=>setTheoryRead(e.target.checked)}/>Nazariya va misolni ko‘rib chiqdim, oraliq savollarni bajardim. Amaliyotga tayyorman.</label>{room.access&&!room.access.lab?<Paywall kind="lab"/>:<button className="learn-primary room-launch" aria-busy={busy} disabled={!theoryRead||busy||!!room.knowledge?.some(q=>!q.passed)} onClick={()=>void begin()}><Icon name="play"/>3D laboratoriyani boshlash</button>}</>}</article><aside className="room-sources"><h3>Huquqiy tayanch</h3>{room.legal_sources.map(s=><article key={s.source_id}><a href={s.url} target="_blank" rel="noreferrer">{s.source_id} <Icon name="external" size={14}/></a><p>{s.locator}</p>{s.article_links.slice(0,3).map((a,i)=><a className="source-article" href={a.url} key={a.url+i} target="_blank" rel="noreferrer">{a.title}</a>)}</article>)}<details><summary>Ta’lim adabiyotlari</summary>{room.education_sources.map(s=><p key={s.source_id}><a href={s.url} target="_blank" rel="noreferrer">{s.source_id}</a><small>{s.scope}</small></p>)}</details><p className="learn-muted">Manba tahriri vaziyat sanasiga mos tekshiriladi. Katalog havolasi kitobning to‘liq matni emas.</p></aside></div>}</>:roomError?<section className="learn-card" role="alert"><p>{roomError}</p><button onClick={()=>setRetryRoom(n=>n+1)}>Qayta urinish</button></section>:<AcademySkeleton layout="lesson" label="Xona yuklanmoqda…"/>:
   view==='path'?<><div className="learn-breadcrumb"><button onClick={()=>navigate('paths')}>Barcha yo‘nalishlar</button></div><section className={'path-hero academy-banner path-'+path} data-academy-intro><div className="academy-banner-art academy-role-emblem" aria-hidden="true"><Icon name={career[path].icon} size={230}/></div><Avatar id={career[path].avatar} color={career[path].color} size={100}/><div className="academy-banner-copy" data-academy-enter><span className="learn-eyebrow">KASBIY AMALIYOT YO‘LI</span><h1>{career[path].name}</h1><p>{career[path].description}</p><span>15 xona · 3 daraja · Har xonada 3D vaziyat</span><div className="case-row" style={{marginTop:14}}>{activePath===path?<span className="case-stamp green">Joriy yo‘nalish</span>:<button className="learn-primary" onClick={()=>void choosePath(path)}>Asosiy yo‘nalish qilish</button>}</div></div></section>{(['Beginner','Junior','Senior'] as const).map((level,i)=><section className="path-level" key={level} data-academy-reveal><div className="level-heading"><div><span className="learn-eyebrow">{i===0?'ASOSLARNI QURING':i===1?'AMALIYOTNI RIVOJLANTIRING':'MURAKKAB VAZIYATLARNI TAHLIL QILING'}</span><h2>{level} <small>{['Boshlang‘ich','O‘rta','Ilg‘or'][i]}</small></h2></div><span>{catalog.rooms.filter(r=>r.path===path&&r.level===level&&completed.has(r.id)).length}/5</span></div><div className="learn-room-list">{catalog.rooms.filter(r=>r.path===path&&r.level===level).map((r,n)=>{const locked=r.prerequisites.some(id=>!completed.has(id)),done=completed.has(r.id);return <button data-academy-card className={'learn-room-row'+(done?' done':'')+(locked?' locked':'')} key={r.id} onClick={()=>navigate('room/'+r.id)}><span className="room-number">{done?<Icon name="check"/>:n+1}</span><div><b>{r.title}</b><small>{r.id} · {r.duration_minutes} daqiqa · 3D lab {r.capstone?'· Yakuniy':''}</small></div>{catalog.premium?.active?null:r.freeLab?<span className="access-chip free">Bepul lab</span>:r.freeLesson?<span className="access-chip free">Bepul dars</span>:<span className="access-chip premium">Premium</span>}<span>{done?'Yakunlangan':locked?'Qulflangan':'Boshlash'}</span></button>;})}</div></section>)}</>:
   (view==='profile'||view==='certificates')?<>{view==='profile'&&<><section data-academy-reveal className="profile-banner"><Avatar id="madina" color="#a78bfa" size={90}/><div><span className="learn-eyebrow">SHAXSIY PROFIL</span><h1>{profile.name}</h1><p>{completed.size}/45 xona yakunlangan</p></div><button onClick={()=>setSettings(true)}><Icon name="settings"/>Ovoz va AI</button></section><section className="learning-stats profile-stats">
     <div><Icon name="check" size={21}/><b><CountUp to={completed.size}/><small>/45</small></b><span>Yakunlangan xonalar</span></div>
     <div><Icon name="users" size={21}/><b>{careers.filter(p=>catalog.rooms.some(r=>r.path===p&&completed.has(r.id))).length}<small>/3</small></b><span>Boshlangan yo‘nalishlar</span></div>
     <div><Icon name="scales" size={21}/><b><CountUp to={profile.attempts.length}/></b><span>Boshlangan 3D lablar</span></div>
     <div><Icon name="star" size={21}/><b><CountUp to={Math.round(completed.size/45*100)}/><small>%</small></b><span>Umumiy jarayon</span></div>
    </section><div className="profile-tabs"><a href="#account" onClick={e=>{e.preventDefault();document.getElementById('profile-account')?.scrollIntoView({behavior:'smooth'});}}>Hisob</a><a href="#/certificates">Sertifikatlar</a><a href="#/exams">Imtihonlar</a><a href="#/pricing">Obuna va xaridlar</a></div><section id="profile-account"><h2>Hisob ma’lumotlari</h2><p className="learn-muted">Mahalliy o‘quv profili: natijalar ushbu brauzer va serverga bog‘langan. Imtihon va sertifikat uchun to‘liq ism-familiyangizni saqlang.</p><form className="learn-name-form" onSubmit={e=>{e.preventDefault();void api<Learner>('/api/learning/profile',{name}).then(setProfile).then(()=>setNotice('Ism saqlandi.')).catch(e=>setNotice(e.message));}}><label>Ism va familiya<input value={name} onChange={e=>setName(e.target.value)} maxLength={80} required minLength={2} placeholder="Ism Familiya"/></label><button>Ismni saqlash</button></form></section>
    <section className="dossier-card account-card"><div className="dossier-seal" aria-hidden="true"><Icon name="users" size={24}/></div><span className="case-docket">HISOB</span><h3>{profile.account?'Google hisobi ulangan':'Mehmon rejimi'}</h3>{profile.account?<><dl className="case-kv"><dt>Email</dt><dd data-raw>{profile.account.email}</dd><dt>Saqlash</dt><dd>Natijalar hisobingizga saqlanadi</dd></dl><button className="case-button-sand" onClick={()=>void logout()}>Hisobdan chiqish</button></>:<><p>Natijalar faqat shu brauzerda. Google bilan kirsangiz, ular hisobingizga qo‘shiladi va boshqa qurilmada ham davom etadi.</p><button className="learn-primary" onClick={()=>navigate('login')}>Google bilan kirish</button></>}</section></>}
    <Suspense fallback={<AcademySkeleton label="Sertifikatlar yuklanmoqda…"/>}><Certificates key={current.join('/')} focus={view==='certificates'&&examRoles.includes(arg)&&examLevels.includes(arg2)?{role:arg as Role,level:arg2 as ExamLevel}:null} profileName={profile.name} legacy={profile.certificates} notify={setNotice} roomProgress={(r,l)=>catalog.rooms.filter(x=>x.path===r&&x.level.toLowerCase()===l&&completed.has(x.id)).length}/></Suspense></>:
   view==='pricing'?<Suspense fallback={<AcademySkeleton label="Narxlar yuklanmoqda…"/>}><Pricing notify={setNotice} initialRole={examRoles.includes(arg)?arg as Role:undefined}/></Suspense>:
   view==='exams'?<Suspense fallback={<AcademySkeleton label="Imtihonlar yuklanmoqda…"/>}><ExamHub/></Suspense>:
   view==='exam'&&examRoles.includes(arg)&&examLevels.includes(arg2)?<Suspense fallback={<AcademySkeleton label="Imtihon yuklanmoqda…"/>}><ExamMode key={arg+arg2} role={arg as Role} level={arg2 as ExamLevel} profileName={profile.name} notify={setNotice} onLiveChange={setExamLive}/></Suspense>:
   view==='verify'&&arg?<Suspense fallback={<AcademySkeleton label="Tekshirilmoqda…"/>}><VerifyPage id={arg}/></Suspense>:
   view==='rooms'?<><span className="learn-eyebrow">45 AMALIY XONA</span><h1>Bugun nimani o‘rganamiz?</h1><input className="learn-search" aria-label="Xonalarni qidirish" placeholder="Mavzu, yo‘nalish yoki xona raqami…" value={search} onChange={e=>setSearch(e.target.value)}/><div className="all-room-grid">{roomMatches.length===0&&<EmptySearch reset={()=>setSearch('')}/>}
    {roomMatches.map(r=><button className="learn-card room-file" data-path={r.path} data-academy-card key={r.id} onClick={()=>navigate('room/'+r.id)}><small>{career[r.path].name} · {r.level} · {r.id} {!catalog.premium?.active&&(r.freeLab||r.freeLesson?<span className="access-chip free">Bepul</span>:<span className="access-chip premium">Premium</span>)}</small><h3>{r.title}</h3><span>{completed.has(r.id)?'✓ Yakunlangan':r.prerequisites.some(id=>!completed.has(id))?'Oldingi xonadan so‘ng ochiladi':'Boshlash mumkin'}</span></button>)}</div></>:
   view==='paths'?<>
    <section className="academy-banner academy-paths-banner" data-academy-intro>
     <div className="academy-banner-art" aria-hidden="true"/>
     <div className="academy-banner-copy">
      <span className="learn-eyebrow" data-academy-enter>KASBIY YO‘NALISHLAR</span>
      <h1 data-academy-enter>Kasbiy yo‘lingizni tanlang.</h1>
      <p className="learn-lead" data-academy-enter>Har yo‘nalishda Beginner, Junior va Senior darajalari. Nazariyani o‘rganing, real hayotga yaqin vaziyatni 3D sudda sinang va kalitingizni topshiring.</p>
     </div>
    </section>
    {renderPaths()}
   </>:
   <>
    <AcademyHero
     resume={!!recent||completed.size>0}
     onStart={()=>navigate(currentRoom?'room/'+currentRoom.id:'profile')}
     onScenarios={()=>navigate('scenarios')}
    />
    <div className="learn-section-head" data-academy-reveal>
     <h2><SplitText text="Sizning yo‘nalishingiz"/></h2>
     <button onClick={()=>navigate('paths')}>Yo‘nalishni o‘zgartirish</button>
    </div>
    <section className={'active-path dossier-card'} data-academy-reveal style={{['--role' as string]:({advokat:'#4cc38a',sudya:'#e5675e',prokuror:'#5b9cf0'} as Record<Career,string>)[activePath]}}>
     <div className="dossier-seal" aria-hidden="true"><Icon name={career[activePath].icon} size={26}/></div>
     <span className="case-docket">JORIY YO‘NALISH · {catalog.rooms.filter(r=>r.path===activePath&&completed.has(r.id)).length}/15 XONA</span>
     <h3>{career[activePath].name}</h3>
     <p>{career[activePath].description}</p>
     <div className="active-path-levels">{(['Beginner','Junior','Senior'] as Level[]).map(l=>{const n=catalog.rooms.filter(r=>r.path===activePath&&r.level===l&&completed.has(r.id)).length;return <div key={l}><span className="case-docket">{l.toUpperCase()}</span><b>{n}/5</b><progress max={5} value={n} aria-label={l}/></div>;})}</div>
     {currentRoom?<dl className="case-kv"><dt>Keyingi xona</dt><dd>{currentRoom.id} · {currentRoom.title}</dd><dt>Jarayon</dt><dd>{roomPercent}%</dd></dl>:<p>Bu yo‘nalishdagi barcha xonalar yakunlangan!</p>}
     <div className="case-row">{currentRoom&&<button className="learn-primary" onClick={()=>navigate('room/'+currentRoom.id)}>{recent?'Xonani davom ettirish':'Davom ettirish'}<Icon name="play" size={16}/></button>}<button className="case-button-sand" onClick={()=>navigate('path/'+activePath)}>Yo‘nalish xonalari</button></div>
    </section>
    <article className="scenario-promo exam-promo" data-academy-reveal>
     <div>
      <span className="learn-eyebrow">SERTIFIKATLASH IMTIHONI</span>
      <h2>Bilimingizni rasmiy sinovdan o‘tkazing.</h2>
      <p>50 ta test savoli va 2 ta amaliy holat, kamera nazorati ostida. 70/100 dan yuqori natija — rol va daraja sertifikati.</p>
     </div>
     <div className="case-row"><button className="learn-primary" onClick={()=>navigate('exams')}>Imtihonlar <Icon name="play"/></button><button onClick={()=>navigate('pricing')}>Narxlar</button></div>
    </article>
   </>}
  </main><footer className="learning-footer">HuquqBek · Nazariya. Amaliyot. Asos.</footer></div></>}
  {lab&&room&&attempt&&<Suspense fallback={<div className="learn-loading">Laboratoriya yuklanmoqda…</div>}><Lab room={room} attempt={attempt} setAttempt={setAttempt} services={services} back={()=>setLab(false)} finish={finish} notify={setNotice}/></Suspense>}
  {!courtActive&&!examLive&&view!=='exam'&&<Tutor room={activeRoom} services={services} notify={setNotice}/>}
  {!lab&&!courtActive&&<ClickSpark/>}
  {settings&&<ServicesModal services={services} onUpdate={setServices} onClose={()=>setSettings(false)}/>}
  {notice&&<div key={notice} className="learn-toast" role="status">{!lab&&!courtActive&&<span className="notice-mark" aria-hidden="true">i</span>}{notice}<button onClick={()=>setNotice('')} aria-label="Xabarni yopish"><Icon name="close" size={17}/></button></div>}
 </div>;
}

function Tutor({room,services,notify}:{room:LearningRoom|null;services:Services;notify:(s:string)=>void}){
 const [open,setOpen]=useState(false),[text,setText]=useState(''),[messages,setMessages]=useState<{who:string;text:string}[]>([]),[busy,setBusy]=useState(false),[recording,setRecording]=useState(false),[transcribing,setTranscribing]=useState(false),[actor,setActor]=useState('CH_QONUNAI');const recorder=useRef<Recording|null>(null),generation=useRef(0),mounted=useRef(true),scroll=useRef<HTMLDivElement>(null);
 useEffect(()=>{generation.current++;setMessages([]);setText('');setBusy(false);recorder.current?.cancel();setRecording(false);setTranscribing(false);speech.stop(false);},[room?.id]);
 useEffect(()=>{if(!open){recorder.current?.cancel();setRecording(false);setTranscribing(false);}},[open]);
 useEffect(()=>{recorder.current?.cancel();setRecording(false);setTranscribing(false);},[actor]);
 useEffect(()=>{const talk=(e:Event)=>{const next=(e as CustomEvent<string>).detail;if(!['CH_ADVOCATE','CH_JUDGE','CH_PROSECUTOR'].includes(next))return;generation.current++;setBusy(false);setMessages([]);setActor(next);setOpen(true);};window.addEventListener('huquqbek-talk',talk);return()=>window.removeEventListener('huquqbek-talk',talk);},[]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;generation.current++;recorder.current?.cancel();};},[]);
 useEffect(()=>{scroll.current?.scrollTo(0,scroll.current.scrollHeight);},[messages,busy,open]);
 const send=async()=>{if(busy||text.trim().length<2)return;const mine=generation.current,clean=text.trim(),history=[...messages,{who:'user',text:clean}];setMessages(history);setText('');setBusy(true);try{const r=await api<{text:string;actor:string}>('/api/learning/tutor',{roomId:room?.id,text:clean,actor,history});if(!mounted.current||mine!==generation.current)return;setMessages([...history,{who:'assistant',text:r.text}]);void speech.say({actor:r.actor,text:r.text},services.voicelab.configured);}catch(e){if(mounted.current&&mine===generation.current){setMessages([...history,{who:'assistant',text:'AI javobi kelmadi. '+(room?'Manbalarni ko‘ring yoki nazariyani qayta o‘qing.':'Yo‘nalish va birinchi xonani tanlang.')}]);notify((e as Error).message);}}finally{if(mounted.current&&mine===generation.current)setBusy(false);}};
 const mic=async()=>{if(recording){recorder.current?.stop();return;}try{const mine=generation.current;recorder.current=await startRecording({onFinal:t=>{if(mounted.current&&mine===generation.current){setText(s=>(s?s+' ':'')+t);setTranscribing(false);}},onStopped:()=>{if(mounted.current&&mine===generation.current){setRecording(false);setTranscribing(true);}},onError:m=>{if(mounted.current&&mine===generation.current){setRecording(false);setTranscribing(false);notify(m);}}});if(mine!==generation.current||!mounted.current){recorder.current.cancel();return;}setRecording(true);}catch(e){notify((e as Error).message);}};
 return <><button className="qonun-launch" aria-expanded={open} onClick={()=>setOpen(!open)}><img src="/assets/characters/qonunai_portrait.png" alt=""/><span>QonunAI<small>Yordamchingiz</small></span><Icon name={open?'close':'book'} size={18}/></button>{open&&<section className="qonun-panel" aria-label="QonunAI yordamchisi"><header><div><b>QonunAI</b><small>{room?room.id+' · '+room.title:'Yo‘nalish va o‘qish bo‘yicha yordam'}</small></div><button onClick={()=>setOpen(false)} aria-label="Yordamchini yopish"><Icon name="close" size={18}/></button></header><div className="tutor-actor"><Select label="Suhbatdosh" value={actor} onChange={v=>{generation.current++;setBusy(false);setMessages([]);setActor(v);speech.stop(false);}} options={[{value:'CH_QONUNAI',label:'QonunAI yordamchi',text:'qonunai'},{value:'CH_ADVOCATE',label:'Advokat',text:'advokat'},{value:'CH_JUDGE',label:'Sudya',text:'sudya'},{value:'CH_PROSECUTOR',label:'Prokuror',text:'prokuror'}]}/></div><div className="qonun-messages" ref={scroll} role="log">{!messages.length&&<p>Salom! {room?'Nazariya, manba yoki labdagi keyingi qadamni tushuntirishim mumkin.':'Qaysi yo‘nalishdan boshlashni tushunishga yordam beraman.'} Tayyor kalit bermayman.</p>}{messages.map((m,i)=><p className={m.who} key={i}>{m.text}</p>)}{busy&&<p className="tutor-pending">Javob tayyorlanmoqda…</p>}</div><form onSubmit={e=>{e.preventDefault();void send();}}><textarea aria-label="QonunAI uchun xabar" rows={2} value={text} maxLength={3000} onChange={e=>setText(e.target.value)} placeholder="Savolingizni yozing yoki gapiring…"/><div><button type="button" disabled={!services.voicelab.configured||busy||transcribing} onClick={()=>void mic()}><Icon name="mic" size={17}/>{recording?'To‘xtatish':transcribing?'Tanilmoqda…':'Gapirish'}</button><button type="button" onClick={()=>speech.stop()}>Ovozni to‘xtatish</button><button className="learn-primary" aria-busy={busy} disabled={busy||recording||transcribing||text.trim().length<2}>Yuborish</button></div>{(recording||transcribing)&&<button type="button" onClick={()=>{recorder.current?.cancel();setRecording(false);setTranscribing(false);}}>Yozuvni bekor qilish</button>}<small>Tanilgan matnni yuborishdan oldin tekshiring. AI izohi tekshiruvni talab qiladi.</small></form></section>}</>;
}

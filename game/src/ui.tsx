import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
export function Icon({name,size=20}:{name:string;size?:number}){
 const paths:Record<string,ReactNode>={
  scales:<><path d="M12 3v18M5 21h14M4 7h16M6 7l-4 8h8L6 7ZM18 7l-4 8h8l-4-8Z"/></>,
  cases:<path d="M3 7V5h7l2 2h9v13H3V7Z"/>,book:<><path d="M12 5v16M12 5C8 2 3 4 3 4v15s5-2 9 2c4-4 9-2 9-2V4s-5-2-9 1Z"/></>,
  check:<path d="m5 12 4 4L20 5"/>,close:<path d="m6 6 12 12M6 18 18 6"/>,search:<><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></>,
  mic:<><rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></>,
  users:<><circle cx="9" cy="7" r="4"/><path d="M2 22v-4c0-6 14-6 14 0v4M17 3a4 4 0 0 1 0 8M18 15c4 0 4 3 4 7"/></>,
  chart:<><path d="M4 3v18h17M8 17v-5M13 17V7M18 17v-9"/></>,settings:<><path d="M3 6h18M3 12h18M3 18h18"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="9" cy="18" r="2"/></>,
  play:<path d="m8 4 12 8-12 8V4Z"/>,clock:<><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></>,volume:<><path d="m11 4-6 5H2v6h3l6 5V4ZM15 8c3 2 3 6 0 8M18 4c6 4 6 12 0 16"/></>,
  external:<><path d="M14 3h7v7M21 3l-11 11M10 3H3v18h18v-7"/></>,
  logout:<><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11"/></>,login:<><path d="M15 4h4v16h-4M10 8l4 4-4 4M3 12h11"/></>,star:<path d="m12 2 3 6 7 1-5 5 1 8-6-4-6 4 1-8-5-5 7-1 3-6Z"/>,
 };
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]||paths.book}</svg>;
}
export function Avatar({id,color,size=54}:{id:string;color:string;size?:number}){
 const female=['madina','dilnoza','malika'].includes(id); const dark=['sardor','jasur','malika'].includes(id);
 return <svg viewBox="0 0 80 80" width={size} height={size} aria-hidden="true"><rect width="80" height="80" rx="24" fill={color}/><path d="M10 82c0-33 60-33 60 0" fill={id==='sardor'?'#213d4f':id==='kamol'?'#263634':'#faf8ef'}/><path d="M29 61 40 74l11-13" fill="#d9a180"/><path d={female?'M21 49V31c0-28 39-28 39 0v25H21Z':'M22 34c-5-35 46-31 37 3Z'} fill={dark?'#342e2b':'#574034'}/><ellipse cx="40" cy="36" rx="16" ry="21" fill="#e5b190"/><path d={female?'M22 29c-2-20 33-26 37 4-8-1-17-7-20-14-3 6-9 9-17 10':'M23 28c-2-19 34-24 36 3-8-3-15-8-17-13-7 8-13 9-19 10'} fill={dark?'#342e2b':'#574034'}/><path d="M30 37h3M47 37h3M36 47q4 3 8 0" stroke="#704b3d" strokeWidth="1.6" strokeLinecap="round" fill="none"/>{id==='kamol'&&<path d="M24 35h14v8H24Zm18 0h14v8H42Zm-4 3h4" stroke="#344942" fill="none" strokeWidth="1.5"/>}</svg>;
}
export function Modal({title,onClose,children,wide=false}:{title:string;onClose:()=>void;children:ReactNode;wide?:boolean}){
 const ref=useRef<HTMLDivElement>(null);const close=useRef(onClose);close.current=onClose;
 useEffect(()=>{const before=document.activeElement as HTMLElement;ref.current?.focus();const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();close.current();}if(e.key==='Tab'){const a=Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input,textarea,select')||[]);const first=a[0],last=a.at(-1);if(!a.length){e.preventDefault();return;}if(e.shiftKey&&(document.activeElement===first||document.activeElement===ref.current)){e.preventDefault();last?.focus();}else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===ref.current)) {e.preventDefault();first?.focus();}}};document.addEventListener('keydown',key);const old=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.removeEventListener('keydown',key);document.body.style.overflow=old;before?.focus();};},[]);
 return <div className="hb-modal-shade" onClick={e=>{if(e.target===e.currentTarget)onClose();}}><div className={'hb-modal'+(wide?' hb-wide':'')} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}><header><h2>{title}</h2><button className="hb-icon-button" onClick={onClose} aria-label="Yopish"><Icon name="close"/></button></header>{children}</div></div>;
}

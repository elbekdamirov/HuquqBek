import {getLanguage,changeLanguage} from './i18n';
import type {Language} from './i18n';
import Select from './Select';
export default function LanguageControl(){return <div className="language-control language-select" data-raw><Select<Language> compact ariaLabel="Til / Language / Язык" value={getLanguage()} onChange={v=>{if(v!==getLanguage())changeLanguage(v);}} options={[{value:'uz',label:'O‘zbekcha',text:'ozbekcha'},{value:'ru',label:'Русский',text:'русский'},{value:'en',label:'English',text:'english'}]}/></div>;}

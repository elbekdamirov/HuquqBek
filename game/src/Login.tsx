import { useEffect, useRef, useState } from 'react';
import { api } from './services';
import { Icon } from './ui';
import type { Learner } from './learningTypes';

declare global { interface Window { google?: { accounts: { id: { initialize: (o: object) => void; renderButton: (el: HTMLElement, o: object) => void } } } } }
interface AuthConfig { googleClientId: string | null; devLogin: boolean }

let gisLoading: Promise<void> | null = null;
function loadGis() {
  gisLoading ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = () => resolve(); s.onerror = () => { gisLoading = null; reject(new Error('Google skriptini yuklab bo‘lmadi.')); };
    document.head.appendChild(s);
  });
  return gisLoading;
}

/** Sign-in page: Google (ID-token, verified on the server), development demo account, or continue as guest. */
export default function Login({ onDone }: { onDone: (p: Learner) => void }) {
  const [config, setConfig] = useState<AuthConfig | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [devEmail, setDevEmail] = useState('');
  const button = useRef<HTMLDivElement>(null), wrap = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => { void api<AuthConfig>('/api/learning/auth/config').then(setConfig).catch(e => setError(e.message)); }, []);
  useEffect(() => {
    if (!config?.googleClientId || !button.current) return;
    let alive = true;
    loadGis().then(() => {
      if (!alive || !window.google || !button.current) return;
      window.google.accounts.id.initialize({
        client_id: config.googleClientId, ux_mode: 'popup',
        callback: async (r: { credential: string }) => {
          setBusy(true); setError('');
          try { onDone(await api<Learner>('/api/learning/auth/google', { credential: r.credential })); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
        },
      });
      // Google's official button is laid invisibly over our styled one: the click still goes to Google's own iframe.
      const width = Math.min(400, Math.max(200, Math.round(wrap.current?.getBoundingClientRect().width || 320)));
      window.google.accounts.id.renderButton(button.current, { theme: 'filled_black', size: 'large', shape: 'rectangular', text: 'continue_with', width, locale: 'uz' });
      setReady(true);
    }).catch(e => setError((e as Error).message));
    return () => { alive = false; };
  }, [config, onDone]);

  const guest = async () => { setBusy(true); try { onDone(await api<Learner>('/api/learning/auth/guest', {})); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  const dev = async () => { setBusy(true); setError(''); try { onDone(await api<Learner>('/api/learning/auth/dev', { email: devEmail })); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };

  return <div className="login-page">
    <section className="login-card">
      <div className="login-seal" aria-hidden="true"><img src="/brand/huquqbek-courthouse.svg" alt="" /></div>
      <span className="case-docket">HUQUQBEK · KIRISH</span>
      <h1>Sud zaliga xush kelibsiz.</h1>
      <p>Hisobingiz bilan kiring — xonalar, laboratoriyalar, imtihon natijalari va sertifikatlar Google hisobingizga saqlanadi va istalgan qurilmada davom etadi.</p>
      <div className="login-actions">
        {config?.googleClientId ? <div ref={wrap} className={'google-signin' + (ready ? ' ready' : '') + (busy ? ' busy' : '')}>
          <div className="google-face" aria-hidden="true">
            <span className="google-mark"><svg viewBox="0 0 48 48" width="20" height="20"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.6 13.3l7.9 6.2C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 7l7.2 5.6c4.2-3.9 7.1-9.6 7.1-17.1z"/><path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.2C.9 16.6 0 20.2 0 24s.9 7.4 2.6 10.8l7.9-6.2z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.2-5.6c-2.2 1.5-5.1 2.4-8.7 2.4-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.2C6.6 42.6 14.6 48 24 48z"/></svg></span>
            <span className="google-label">{busy ? 'Tekshirilmoqda…' : 'Google orqali kirish'}</span>
            <Icon name="play" size={14} />
          </div>
          <div ref={button} className="google-hit" aria-label="Google orqali kirish" />
        </div>
          : config && <div className="case-banner-note warn"><Icon name="settings" size={18} /><span><b>Google orqali kirish sozlanmagan.</b> <code>game/.env</code> fayliga <code>GOOGLE_CLIENT_ID=…</code> yozib, serverni qayta ishga tushiring — shunda bu yerda Google tugmasi chiqadi.</span></div>}
        {config?.devLogin && <details className="login-dev"><summary>Demo hisob <span>ishlab chiqish rejimi</span></summary>
          <form onSubmit={e => { e.preventDefault(); void dev(); }}>
            <input type="email" required aria-label="Demo email" placeholder="siz@example.com" value={devEmail} onChange={e => setDevEmail(e.target.value)} />
            <button disabled={busy}>Kirish</button>
          </form>
        </details>}
        <div className="login-or"><span>yoki</span></div>
        <button className="case-button-sand" disabled={busy} onClick={() => void guest()}>Mehmon sifatida davom etish</button>
        <small className="case-muted">Mehmon rejimida natijalar faqat shu brauzerda saqlanadi. Keyinroq profil sahifasidan kirsangiz, ular hisobingizga qo‘shiladi.</small>
      </div>
      {error && <p className="login-error" role="alert">{error}</p>}
    </section>
  </div>;
}

import React from "react";

// Pure SVG renderer of the approved HuquqBek certificate (spec Appendix A). Real text nodes, no innerHTML.
export type CertRole = 'advokat' | 'prokuror' | 'sudya';
export type CertLevel = 'beginner' | 'junior' | 'senior';
export type CertLang = 'uz' | 'en' | 'ru';
type RoleTheme = { accent: string; light: string; dark: string; code: string; title: Record<CertLang, string>; mention: Record<CertLang, string> };
export const ROLES: Record<CertRole, RoleTheme> = {
  advokat: {
    accent: "#32e880", light: "#86ffc0", dark: "#126c40", code: "ADV",
    title: { uz: "ADVOKAT", en: "ADVOCATE", ru: "АДВОКАТ" },
    mention: { uz: "advokat", en: "advocate", ru: "адвоката" },
  },
  prokuror: {
    accent: "#249bff", light: "#81cbff", dark: "#125fba", code: "PRK",
    title: { uz: "PROKUROR", en: "PROSECUTOR", ru: "ПРОКУРОР" },
    mention: { uz: "prokuror", en: "prosecutor", ru: "прокурора" },
  },
  sudya: {
    accent: "#ff4f58", light: "#ff9594", dark: "#a82137", code: "SUD",
    title: { uz: "SUDYA", en: "JUDGE", ru: "СУДЬЯ" },
    mention: { uz: "sudya", en: "judge", ru: "судьи" },
  },
};
export const LEVELS: CertLevel[] = ["beginner", "junior", "senior"];
const LANGS: Record<CertLang, Record<string, string>> = {
  uz: {
    brand: "HUQUQIY TAʼLIM PLATFORMASI", certificate: "SERTIFIKAT",
    certified: "USHBU SERTIFIKAT TASDIQLAYDI:",
    line1: "HuquqBek platformasida", line2: "roli bo‘yicha huquqiy",
    line3: "bilim va amaliy ko‘nikmalarni muvaffaqiyatli o‘zlashtirgan.",
    certId: "SERTIFIKAT ID", date: "BERILGAN SANA", emptyName: "ISM FAMILIYA",
  },
  en: {
    brand: "LEGAL EDUCATION PLATFORM", certificate: "CERTIFICATE",
    certified: "THIS CERTIFICATE CONFIRMS:",
    line1: "Successfully certified on HuquqBek in the", line2: "learning track,",
    line3: "demonstrating legal knowledge and practical skills.",
    certId: "CERTIFICATE ID", date: "DATE OF ISSUE", emptyName: "FIRST LAST NAME",
  },
  ru: {
    brand: "ПЛАТФОРМА ПРАВОВОГО ОБУЧЕНИЯ", certificate: "СЕРТИФИКАТ",
    certified: "НАСТОЯЩИМ ПОДТВЕРЖДАЕТСЯ:",
    line1: "Успешно пройдено обучение HuquqBek", line2: "по направлению",
    line3: "и освоены правовые знания и практические навыки.",
    certId: "НОМЕР СЕРТИФИКАТА", date: "ДАТА ВЫДАЧИ", emptyName: "ИМЯ ФАМИЛИЯ",
  },
};

export function formatDate(value?: string) {
  if (typeof value === "string" && /^\d{2}\.\d{2}\.\d{4}$/.test(value)) return value;
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

function JusticeMark({ x = 0, y = 0, scale = 1, color = "#fff" }: { x?: number; y?: number; scale?: number; color?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} stroke={color} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path strokeWidth="3" d="M50 6v81M20 27h60M50 6l-7 8h14zM25 27 9 63m16-36 16 36m34-36L59 63m16-36 16 36" />
      <path strokeWidth="3" d="M3 63h44c-3 12-11 19-22 19S6 75 3 63Zm50 0h44c-3 12-11 19-22 19s-19-7-22-19Z" />
      <path strokeWidth="3" d="M50 85C32 76 17 75 2 80v9c17-4 33-1 48 8 15-9 31-12 48-8v-9c-15-5-30-4-48 5Z" />
    </g>
  );
}

function Laurel({ centerX, centerY, r = 125, color }: { centerX: number; centerY: number; r?: number; color: string }) {
  // Leaves follow left and right sides of the achievement badge.
  return (
    <g fill={color} opacity=".84">
      {Array.from({ length: 8 }, (_, n) => {
        const angle = (124 + n * 16) * Math.PI / 180;
        const a = { x: centerX + r * Math.cos(angle), y: centerY + r * Math.sin(angle) };
        const b = { x: centerX - r * Math.cos(angle), y: centerY + r * Math.sin(angle) };
        return (
          <React.Fragment key={n}>
            <ellipse cx={a.x} cy={a.y} rx="6" ry="17" transform={`rotate(${-(angle * 180 / Math.PI + 30)} ${a.x} ${a.y})`} />
            <ellipse cx={b.x} cy={b.y} rx="6" ry="17" transform={`rotate(${angle * 180 / Math.PI + 30} ${b.x} ${b.y})`} />
          </React.Fragment>
        );
      })}
    </g>
  );
}

function Courthouse({ color }: { color: string }) {
  return (
    <g transform="translate(62 813)" fill="none" stroke={color} opacity=".56" strokeWidth="5" strokeLinejoin="round">
      <path d="M0 61 178 0l222 61v22H0z M8 89h388 M12 229h382 M0 241h405" />
      {Array.from({ length: 6 }, (_, i) => (
        <g key={i} transform={`translate(${23 + i * 62} 0)`}>
          <path d="M0 92h43M5 100v124m33-124v124M-3 224h49" />
          <path d="M4 108h35M4 217h35" strokeWidth="2" />
        </g>
      ))}
      <path fill={color} opacity=".22" stroke="none" d="M0 61 178 0l222 61v22H0zM4 241h401v14H4z" />
    </g>
  );
}

function scallopPath(cx: number, cy: number, innerR: number, outerR: number, count = 66) {
  return Array.from({ length: count * 2 }, (_, i) => {
    const a = (-Math.PI / 2) + i * Math.PI / count;
    const r = i % 2 === 0 ? outerR : innerR;
    return `${i === 0 ? "M" : "L"}${(cx + Math.cos(a) * r).toFixed(2)} ${(cy + Math.sin(a) * r).toFixed(2)}`;
  }).join(" ") + " Z";
}

/**
 * The certificate SVG contains real editable text and vector artwork.
 * It intentionally does not rely on a static screenshot or external images.
 */
export function HuquqBekCertificateArt({
  role = "advokat", level = "beginner", lang = "uz", firstName = "",
  lastName = "", certificateId = "", issuedAt,
  svgRef,
}: { role?: CertRole; level?: CertLevel; lang?: CertLang; firstName?: string; lastName?: string; certificateId?: string; issuedAt?: string; svgRef?: React.Ref<SVGSVGElement> }) {
  const selectedRole = ROLES[role] || ROLES.advokat;
  const selectedLevel = LEVELS.includes(level) ? level : "beginner";
  const t = LANGS[lang] || LANGS.uz;
  const accent = selectedRole.accent;
  const bright = selectedRole.light;
  const dark = selectedRole.dark;
  const roleName = selectedRole.title[lang] || selectedRole.title.uz;
  const roleMention = selectedRole.mention[lang] || selectedRole.mention.uz;
  const names = [firstName?.trim(), lastName?.trim()].filter(Boolean);
  const fullName = (lang === "uz" || lang === "ru" ? names.reverse() : names).join(" ") || t.emptyName;
  const nameFont = fullName.length > 32 ? 39 : fullName.length > 26 ? 45 : fullName.length > 22 ? 53 : fullName.length > 17 ? 64 : 73;
  const headingFont = roleName.length > 9 ? 87 : roleName.length > 8 ? 104 : 122;
  const dateString = formatDate(issuedAt);
  return (
    <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" width="1600" height="1000" role="img" aria-label={`${roleName} ${selectedLevel.toUpperCase()} certificate`}>
      <defs>
        <linearGradient id="hqb-bg" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#050b1a"/><stop offset=".55" stopColor="#0a1425"/><stop offset="1" stopColor="#020d1c"/></linearGradient>
        <linearGradient id="hqb-accent" x1="0" y1="0" x2="1" y2=".2"><stop stopColor={bright}/><stop offset=".45" stopColor={accent}/><stop offset="1" stopColor={dark}/></linearGradient>
        <radialGradient id="hqb-halo"><stop stopColor={accent} stopOpacity=".29"/><stop offset=".4" stopColor={accent} stopOpacity=".10"/><stop offset="1" stopColor={accent} stopOpacity="0"/></radialGradient>
        <radialGradient id="hqb-corner"><stop stopColor={accent} stopOpacity=".54"/><stop offset="1" stopColor={accent} stopOpacity="0"/></radialGradient>
        <linearGradient id="hqb-shield" x1="0" y1="0" x2="0" y2="1"><stop stopColor={dark}/><stop offset="1" stopColor="#06111e"/></linearGradient>
        <linearGradient id="hqb-ribbon" x1="0" y1="0" x2="1" y2="0"><stop stopColor={bright}/><stop offset=".46" stopColor={accent}/><stop offset="1" stopColor={accent} stopOpacity="0"/></linearGradient>
        <linearGradient id="hqb-text" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#ffffff"/><stop offset="1" stopColor="#dce5f2"/></linearGradient>
        <filter id="hqb-blur"><feGaussianBlur stdDeviation="35"/></filter>
        <filter id="hqb-line-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <clipPath id="hqb-clip"><rect x="56" y="32" width="1488" height="940" rx="34"/></clipPath>
      </defs>
      <rect width="1600" height="1000" fill="#030918" />
      <g clipPath="url(#hqb-clip)">
        <rect x="56" y="32" width="1488" height="940" fill="#081223"/>
        <circle cx="1185" cy="396" r="470" fill="url(#hqb-halo)"/>
        <ellipse cx="82" cy="48" rx="420" ry="280" fill="url(#hqb-corner)" opacity=".9" />
        <ellipse cx="1480" cy="1010" rx="510" ry="300" fill="url(#hqb-corner)" opacity=".7" />
        {Array.from({ length: 5 }, (_, i) => <circle key={i} cx="1185" cy="396" r={185 + i * 45} fill="none" stroke={accent} strokeOpacity={.075 - i * .010} strokeWidth="32"/>)}
        <Courthouse color={accent}/>
        <path d="M450 976h1010" stroke={accent} strokeWidth="9" filter="url(#hqb-line-glow)" opacity=".9" />
      </g>
      <rect x="56" y="32" width="1488" height="940" rx="34" fill="none" stroke={accent} strokeOpacity=".35" strokeWidth="3"/>
      <path d="M94 33H610M1542 612v320a40 40 0 0 1-40 40H1230" fill="none" stroke={accent} strokeWidth="3" filter="url(#hqb-line-glow)"/>

      {/* Header */}
      <JusticeMark x={144} y={91} scale={.91} color="#ffffff"/>
      <line x1="257" y1="100" x2="257" y2="160" stroke={accent} strokeWidth="3"/>
      <text x="280" y="133" fill="#fff" fontSize="43" fontWeight="800" fontFamily="Arial, sans-serif">HUQUQBEK</text>
      <text x="280" y="165" fill="#dce3f1" fontSize={lang === "ru" ? 14 : 17} letterSpacing="3" fontFamily="Arial, sans-serif">{t.brand}</text>

      {/* Title and certificate band */}
      <text x="145" y="349" fontFamily="Arial, sans-serif" fontSize={headingFont} fontWeight="900" letterSpacing="-1.2" fill="#f8fbff">{roleName}</text>
      <rect x="145" y="380" width="850" height="78" rx="9" fill={accent}/>
      <text x="187" y="432" fontFamily="Arial, sans-serif" fontSize={lang === "ru" ? 35 : 40} fontWeight="800" letterSpacing={lang === "ru" ? 5 : 10} fill="#071020">{t.certificate}</text>
      <text x="149" y="537" fontFamily="Arial, sans-serif" fontSize={lang === "ru" ? 22 : 24} letterSpacing="4" fill="#f4f6ff">{t.certified}</text>
      <text x="145" y="620" fontFamily="Arial, sans-serif" fontSize={nameFont} fontWeight="900" fill="#f8fbff">{fullName}</text>
      <line x1="148" y1="651" x2="883" y2="651" stroke={accent} strokeWidth="4.5" strokeLinecap="round" />

      {/* Three-line achievement statement with the role colored */}
      {lang === "uz" ? (
        <g fill="#eff4ff" fontFamily="Arial, sans-serif" fontSize="25">
          <text x="148" y="702">{t.line1}<tspan fill={bright} fontWeight="bold"> {roleMention}</tspan> {t.line2}</text>
          <text x="148" y="739">{t.line3}</text>
        </g>
      ) : lang === "en" ? (
        <g fill="#eff4ff" fontFamily="Arial, sans-serif" fontSize="25">
          <text x="148" y="702">{t.line1}</text>
          <text x="148" y="739"><tspan fill={bright} fontWeight="bold">{roleMention}</tspan> learning track, demonstrating legal</text>
          <text x="148" y="775">knowledge and practical skills.</text>
        </g>
      ) : (
        <g fill="#eff4ff" fontFamily="Arial, sans-serif" fontSize="24">
          <text x="148" y="702">{t.line1}</text>
          <text x="148" y="739">{t.line2} <tspan fill={bright} fontWeight="bold">{roleMention}</tspan>; освоены</text>
          <text x="148" y="774">правовые знания и практические навыки.</text>
        </g>
      )}

      {/* Glowing shield badge at right */}
      <path d="M1180 154 1366 225v220c0 60-63 116-186 188-123-72-186-128-186-188V225Z" fill={dark} stroke={accent} strokeWidth="17" strokeLinejoin="round" filter="url(#hqb-line-glow)" />
      <path d="M1180 154 1366 225v220c0 60-63 116-186 188-123-72-186-128-186-188V225Z" fill="none" stroke={bright} strokeWidth="5" strokeOpacity=".75" />
      <Laurel centerX={1180} centerY={330} r={114} color={accent}/>
      <JusticeMark x={1120} y={214} scale={1.2} color="#fff"/>
      <text x="1180" y="398" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="39" fontWeight="800" fill="#ffffff">HUQUQBEK</text>
      <path d="M999 430h362v73H999Z" fill={accent} />
      <text x="1180" y="482" textAnchor="middle" fontSize="51" fontWeight="900" fill="#07111c" fontFamily="Arial, sans-serif">{selectedLevel.toUpperCase()}</text>
      <path d="M1180 548l7 14 14 7-14 7-7 14-7-14-14-7 14-7Z" fill={accent}/>

      {/* ID and issue date come from backend; don't invent verification IDs */}
      <g fontFamily="Arial, sans-serif">
        <text x="517" y="847" letterSpacing="3" fill="#e7ebf6" fontSize="17">{t.certId}</text>
        {/* Long IDs are fitted into the column (517 → 749 divider) instead of running into the date. */}
        <text x="517" y="887" fill="#fff" fontSize={(certificateId || "").length > 14 ? 21 : 26} fontWeight="800" {...((certificateId || "").length > 14 ? { textLength: 215, lengthAdjust: "spacingAndGlyphs" } : {})}>{certificateId || "—"}</text>
        <line x1="749" y1="819" x2="749" y2="891" stroke="#cbd3e1" strokeOpacity=".7"/>
        <text x="796" y="847" letterSpacing="3" fill="#e7ebf6" fontSize="17">{t.date}</text>
        <text x="796" y="887" fill="#fff" fontSize="26" fontWeight="800">{dateString}</text>
      </g>

      {/* Small stamp, right aligned and below the badge (no signatures) */}
      <path d={scallopPath(1239, 817, 99, 108)} fill={dark} fillOpacity=".40" stroke={accent} strokeWidth="3" />
      <circle cx="1239" cy="817" r="94" fill="#061321" stroke={accent} strokeWidth="5"/>
      <circle cx="1239" cy="817" r="76" fill="none" stroke={bright} strokeWidth="2"/>
      <text x="1239" y="768" fontFamily="Arial, sans-serif" fontWeight="800" fontSize="21" fill={bright} textAnchor="middle" letterSpacing="2">HUQUQBEK</text>
      <JusticeMark x={1209} y={790} scale={.59} color={accent}/>
      <text x="1239" y="880" fontFamily="Arial, sans-serif" fontSize="17" fontWeight="800" fill={bright} textAnchor="middle" letterSpacing="2">SERTIFIKAT</text>
    </svg>
  );
}


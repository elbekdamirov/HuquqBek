// Original HuquqBek training scenarios (authored for this project; not copied from any third-party service).
// Run: node scripts/original-scenarios.mjs  → appends/updates entries in src/content/scenarios.json (idempotent by id).
import { readFileSync, writeFileSync } from 'node:fs';

const L = {
  jpk: { label: 'Jinoyat-protsessual kodeksi', url: 'https://lex.uz/docs/-111460' },
  jk: { label: 'Jinoyat kodeksi', url: 'https://lex.uz/docs/-111453' },
  konst: { label: 'Jinoyat protsessining konstitutsiyaviy kafolatlari', url: 'https://gov.uz/oz/mfa/sections/view/14475' },
  fk: { label: 'Fuqarolik kodeksi', url: 'https://lex.uz/mact/-111189' },
  fpk: { label: 'Fuqarolik protsessual kodeksi', url: 'https://lex.uz/docs/-3517337' },
  ipk: { label: 'Iqtisodiy protsessual kodeks', url: 'https://lex.uz/docs/-3523891' },
  msiyk: { label: 'Ma’muriy sud ishlarini yuritish to‘g‘risidagi kodeks', url: 'https://lex.uz/docs/-3527353' },
  mk: { label: 'Mehnat kodeksi', url: 'https://lex.uz/docs/-6257288' },
};
const SRC = 'HuquqBek mualliflik o‘quv vaziyati';
const note = 'Tegishli sanadagi tahrirni tekshiring.';
const ev = (id, title, body, helps) => ({ id, title, body: `${id} · ${title}\nO‘QUV HUJJATI (SINTETIK)\n\n${body}\n\nTekshiring: kim tuzgan, qachon, asl nusxa bormi va bu material nimani isbotlay olmaydi?`, helps, sourceNote: `${SRC}. Sintetik o‘quv hujjati, haqiqiy ish materiali emas; haqiqiy sud qarori tasdiqlanmagan.`, kind: 'Matnli o‘quv material', authenticity: 'training_reconstruction', providedBy: 'Ish kartasidagi taraf', origin: SRC, limitations: 'Asl hujjat yoki video fayli emas. Haqiqiy ishda olish tartibi alohida tekshiriladi.' });
const scenario = ({ id, courtType, category, title, difficulty, duration, facts, issue, client, opponent, evidence, refs, roles, trialReason }) => ({
  id, courtType, independent: true, category, title, subtitle: 'Mustaqil sud amaliyoti', difficulty, duration, region: 'O‘zbekiston · o‘quv vaziyati',
  source: { url: refs[0].url, title: SRC, type: 'original_training', date: null, summary: `${SRC}. Barcha shaxslar va hujjatlar to‘qima; haqiqiy sud qarori tasdiqlanmagan.`, outcome: 'Sud qarori manbasi va ish raqami mavjud emas (to‘qima vaziyat).' },
  facts, issue, stakes: 'Asosli va xolis xulosa', client: { ...client, privateFact: client.privateFact || 'Qo‘shimcha yashirin fakt yo‘q.', opening: client.goal }, opponent: { settlement: 'Aniq kelishuv shartlari berilmagan.', ...opponent },
  evidence, legalRefs: refs.map((r, i) => ({ id: 'L' + (i + 1), label: r.label, url: r.url, note })), clientQuestions: [], decisions: [],
  reviewStatus: `Huquqshunos va o‘qituvchi tahriri kutilmoqda. ${SRC}; haqiqiy sud qarori tasdiqlanmagan.`,
  rolePrompts: {
    advokat: { opening: roles.advokat, finalTask: 'Dalillar, qarama-qarshi fikr va manbaga tayangan himoya xulosasini yozing.' },
    sudya: { opening: roles.sudya, finalTask: 'Har bir dalilga baho berib, asoslangan o‘quv qarorini yozing.' },
    prokuror: { opening: roles.prokuror, finalTask: 'Qonuniylik nuqtayi nazaridan dalilga mos pozitsiyangizni yozing.' },
  },
  trial: { available: false, reason: trialReason || 'Bu vaziyat dalillarni baholash mashqi sifatida tuzilgan; to‘liq protsessual bosqichlar alohida tahrir kutmoqda.' },
});

const list = [
  scenario({
    id: 'SC-ushlash-xabar', courtType: 'criminal', category: 'criminal', title: 'Ushlangan shaxs qarindoshiga xabar bera olmadi', difficulty: 'Oson', duration: 25,
    facts: ['Namangan shahridagi bozorda telefon o‘g‘irlangani haqida ariza tushgach, 16:30 da Farhod (24) gumon qilinuvchi sifatida ushlandi. Bayonnomada «qarindoshlarga xabar berildi» deb yozilgan, lekin onasi kechasi 22:00 gacha o‘g‘lini qidirib yurgan. Advokat 21:00 da kelgan, ammo uni 22:40 gacha kiritishmagan.'],
    issue: 'Ushlab turishdagi protsessual huquqlar buzilganmi va bu ishdagi dalillarga qanday ta’sir qiladi?',
    client: { name: 'Farhod T. (gumon qilinuvchi)', goal: '«Men onamga qo‘ng‘iroq qilishni so‘radim, telefonimni olib qo‘yishdi. Advokatsiz menga tushuntirish yozdirishdi.»' },
    opponent: { name: 'Tergovchi', position: '«Xabar berish tartibi bajarilgan, bayonnomada qayd etilgan. Tushuntirish ixtiyoriy yozilgan.»' },
    evidence: [
      ev('E1', 'Ushlab turish bayonnomasi', 'Ushlangan vaqti: 16:30. «Qarindoshlariga xabar berildi» degan bandda kimga, qachon va qanday usulda xabar berilgani ko‘rsatilmagan.', 'Xabar berish faktining aniqligini baholang.'),
      ev('E2', 'Onaning qo‘ng‘iroqlar ro‘yxati', 'Onaning telefonida 17:10–22:05 oralig‘ida o‘g‘lining raqamiga 14 marta chiqilgan qo‘ng‘iroq bor. Kiruvchi qo‘ng‘iroq yo‘q.', 'Bayonnomadagi yozuv bilan solishtiring.'),
      ev('E3', 'Navbatchi qism jurnali', 'Advokat 21:02 da kelgani qayd etilgan. Gumon qilinuvchi bilan uchrashuv 22:40 da boshlangan. Kechikish sababi yozilmagan.', 'Himoyachiga kirish huquqi qachondan ta’minlanganini aniqlang.'),
      ev('E4', 'Gumon qilinuvchining yozma tushuntirishi', 'Tushuntirish 20:15 da yozilgan, advokat imzosi yo‘q. Matnda «huquqlarim tushuntirildi» degan bosma ibora bor.', 'Advokatsiz olingan bayonning dalil sifatidagi kuchini baholang.'),
    ],
    refs: [L.jpk, L.konst, L.jk],
    roles: { advokat: 'Mijozning ushlab turishdagi huquqlari buzilganini dalil bilan ko‘rsating.', sudya: 'Ushlab turish qonuniyligini va bayonlarning maqbulligini xolis baholang.', prokuror: 'Tergov harakatlari qonuniyligini nazorat qiluvchi sifatida baho bering.' },
  }),
  scenario({
    id: 'SC-tintuv-xolis', courtType: 'criminal', category: 'criminal', title: 'Xolislarsiz o‘tkazilgan tintuv', difficulty: 'O‘rta', duration: 35,
    facts: ['Samarqandda giyohvand vosita saqlashda gumon qilingan Jamshid (31) xonadonida soat 06:10 da tintuv o‘tkazildi. Bayonnomada ikki xolis imzosi bor, biroq qo‘shni xolislardan biri o‘sha paytda boshqa shaharda bo‘lganini aytmoqda. Topilgan paket fotosuratga olinmagan, muhrlangani ham ko‘rsatilmagan.'],
    issue: 'Tintuv tartibiga rioya qilinmagan bo‘lsa, topilgan ashyoviy dalil maqbul hisoblanadimi?',
    client: { name: 'Jamshid R. (ayblanuvchi)', goal: '«Paket meniki emas. Ular kelganda xonada faqat xotinim va men bor edik, xolis yo‘q edi.»' },
    opponent: { name: 'Davlat ayblovchisi', position: '«Bayonnomada xolislar imzosi bor. Ekspertiza paketdagi moddani aniqlagan.»' },
    evidence: [
      ev('E1', 'Tintuv bayonnomasi', 'Boshlanish 06:10, tugash 06:55. Xolislar: A. Karimov va B. Usmonov imzolari. Topilgan buyum: «oq rangli polietilen paket». Muhrlash va fotosurat haqida band bo‘sh.', 'Rasmiylashtirish to‘liqligini tekshiring.'),
      ev('E2', 'Xolis B. Usmonovning tushuntirishi', '«O‘sha kuni ertalab Toshkentda edim, poyezd chiptam bor. Bayonnomani keyinroq uchastka idorasida imzolaganman.»', 'Xolis ishtirokining haqiqiyligini baholang.'),
      ev('E3', 'Poyezd chiptasi nusxasi', 'Samarqand–Toshkent, jo‘nash 05:30, xolis nomida. Asl nusxa sudga hali taqdim etilmagan.', 'Isbot kuchi va cheklovlarini aniqlang.'),
      ev('E4', 'Ekspert xulosasi', 'Taqdim etilgan paketdagi modda giyohvand vosita deb topilgan. Paket ekspertga qachon va qanday holatda topshirilgani ko‘rsatilmagan.', 'Saqlash zanjiri uzilmaganmi?'),
    ],
    refs: [L.jpk, L.jk, L.konst],
    roles: { advokat: 'Tintuvdagi qoidabuzarliklar asosida dalilni chiqarib tashlashni so‘rang.', sudya: 'Dalilning maqbulligini protsessual qoidalar bo‘yicha xolis hal qiling.', prokuror: 'Ayblovni faqat qonuniy olingan dalillar bilan qo‘llab-quvvatlang.' },
  }),
  scenario({
    id: 'SC-prokuror-asos', courtType: 'criminal', category: 'criminal', title: 'Prokuror nazorati: «kiyimi o‘xshash edi»', difficulty: 'O‘rta', duration: 30,
    facts: ['Qarshi shahrida avtomobil oynasi sindirilib, sumka o‘g‘irlandi. Patrul 40 daqiqadan keyin qora kurtkadagi Bekzod (19) ni ushladi. Ushlash asosi: «guvohning tasviriga kiyimi o‘xshash». Bekzoddan o‘g‘irlangan narsa topilmagan, guvoh esa uni tanib ko‘rsatishga hali chaqirilmagan.'],
    issue: 'Ushlab turish uchun qonuniy asos yetarlimi va prokuror qanday choralar ko‘rishi kerak?',
    client: { name: 'Tuman prokuraturasi (nazorat)', goal: '«Ushlash asoslari qonunga mosligini 24 soat ichida tekshirishimiz kerak.»' },
    opponent: { name: 'Tergovchi', position: '«Guvoh qora kurtkali yigitni ko‘rgan. Gumon qilinuvchi voqea joyiga yaqin yurgan.»' },
    evidence: [
      ev('E1', 'Guvohning tushuntirishi', '«Qorong‘i edi, yuzini ko‘rmadim. Qora kurtka kiygan, o‘rta bo‘yli yigit yugurib ketdi.»', 'Tavsifning aniqligini baholang.'),
      ev('E2', 'Shaxsiy ko‘rik bayonnomasi', 'Bekzoddan telefon, kalitlar va 35 000 so‘m topilgan. O‘g‘irlangan sumka yoki undagi narsalar yo‘q.', 'Ushlash asosini qo‘llab-quvvatlaydimi?'),
      ev('E3', 'Ko‘cha kamerasi haqidagi ma’lumotnoma', 'Voqea joyidagi kamera ishlamagan. Qo‘shni do‘kon kamerasi so‘ralmagan.', 'Tekshirilmagan dalil manbalarini aniqlang.'),
    ],
    refs: [L.jpk, L.konst],
    roles: { advokat: 'Ushlash asossiz ekanini ko‘rsatib, ozod qilishni so‘rang.', sudya: 'Ushlash asoslari bo‘yicha taraflar dalillarini xolis baholang.', prokuror: 'Nazorat qiluvchi prokuror sifatida ushlash qonuniyligi va keyingi tergov harakatlari bo‘yicha qaror qiling.' },
    trialReason: 'Bu vaziyat sudgacha nazorat bosqichini mashq qiladi; sud majlisi bosqichlari qo‘llanmaydi.',
  }),
  scenario({
    id: 'SC-ehtiyot-chorasi', courtType: 'criminal', category: 'criminal', title: 'Qamoq yoki uy qamog‘i: ehtiyot chorasini tanlash', difficulty: 'Murakkab', duration: 40,
    facts: ['Toshkentda firibgarlikda ayblangan Nodira (35) ga nisbatan tergovchi qamoqqa olish ehtiyot chorasini so‘radi. Nodira ilgari sudlanmagan, ikki voyaga yetmagan farzandi bor, doimiy yashash joyi va ish joyi mavjud. Tergov uning chet elga chiqish uchun chipta qidirganini da’vo qilmoqda.'],
    issue: 'Qamoqqa olish zarurligi isbotlanganmi yoki yengilroq ehtiyot chorasi yetarlimi?',
    client: { name: 'Nodira S. (ayblanuvchi)', goal: '«Men qochmayman. Chipta qidirgan sahifa — opamning Dubaydagi to‘yi uchun, u ham bir oy oldin.»' },
    opponent: { name: 'Tergovchi', position: '«Ayblanuvchi chet elga chiqib ketishi mumkin. Jabrlanuvchilar soni ko‘p, guvohlarga ta’sir qilishi ehtimoli bor.»' },
    evidence: [
      ev('E1', 'Brauzer tarixi ko‘chirmasi', 'Bir oy oldin avia chiptalar sahifasi ochilgan; bron yoki to‘lov qilinmagan.', 'Qochish xavfini qanchalik isbotlaydi?'),
      ev('E2', 'Ish joyidan tavsifnoma', 'Olti yildan beri buxgalter, intizomiy jazosi yo‘q.', 'Shaxsini tavsiflovchi holatlar.'),
      ev('E3', 'Farzandlar tug‘ilganlik guvohnomalari', 'Ikki farzand: 7 va 11 yosh. Otasi bilan nikoh bekor qilingan.', 'Oilaviy holatni baholang.'),
      ev('E4', 'Jabrlanuvchilar ro‘yxati', 'Besh nafar jabrlanuvchi, umumiy zarar 180 mln so‘m. Ikkitasi bilan zarar qoplangani haqida tilxat.', 'Jinoyat og‘irligi va zararni qoplash holatini tortib ko‘ring.'),
    ],
    refs: [L.jpk, L.jk, L.konst],
    roles: { advokat: 'Qamoqqa olish o‘rniga uy qamog‘i yoki boshqa choraning yetarliligini asoslang.', sudya: 'Ehtiyot chorasi bo‘yicha taraflarni tinglab, mutanosib qaror chiqaring.', prokuror: 'Qamoq zarurligi faktlar bilan isbotlanganini yoki isbotlanmaganini xolis baholang.' },
  }),
  scenario({
    id: 'SC-ijara-garov', courtType: 'civil', category: 'consumer', title: 'Ijara garov puli qaytarilmadi', difficulty: 'Oson', duration: 25,
    facts: ['Dilfuza Andijonda kvartirani bir yilga ijaraga olib, garov sifatida 6 000 000 so‘m to‘lagan. Shartnoma tugagach, uy egasi devordagi dog‘ va singan javon uchun garovni to‘liq ushlab qoldi. Kirishda topshirish-qabul dalolatnomasi tuzilmagan.'],
    issue: 'Garovni ushlab qolish uchun zarar va uning miqdori isbotlanganmi?',
    client: { name: 'Dilfuza A. (da’vogar)', goal: '«Javon kirganimdayoq qiyshiq edi. Dog‘ oddiy foydalanishdan. Garovni to‘liq qaytarishni so‘rayman.»' },
    opponent: { name: 'Uy egasi (javobgar)', position: '«Kvartira ta’mirdan keyin berilgan edi. Ta’mir ustasi 6,5 mln so‘mlik smeta yozib berdi.»' },
    evidence: [
      ev('E1', 'Ijara shartnomasi', 'Garov: 6 000 000 so‘m. «Ijarachi aybi bilan yetkazilgan zarar garovdan qoplanadi.» Topshirish dalolatnomasi tuzilishi nazarda tutilgan, lekin tuzilmagan.', 'Shartnoma shartlarini aniqlang.'),
      ev('E2', 'Chiqishdagi fotosuratlar', 'Ijarachi chiqish kuni olgan 12 ta surat: dog‘ 30×20 sm, javon eshigi ilgagi singan.', 'Zarar ko‘lamini baholang.'),
      ev('E3', 'Usta smetasi', '6 500 000 so‘m: «butun kvartirani bo‘yash» va «yangi javon». Usta uy egasining qarindoshi.', 'Miqdorning asosliligi va xolisligini tekshiring.'),
    ],
    refs: [L.fk, L.fpk],
    roles: { advokat: 'Zarar va uning miqdori isbotlanmaganini ko‘rsating.', sudya: 'Garov va zarar miqdorini dalillar asosida xolis hal qiling.', prokuror: 'Bu xususiy nizoda prokuror odatda taraf emas — ishtirok asosini tekshiring.' },
  }),
  scenario({
    id: 'SC-sinov-muddati-haq', courtType: 'civil', category: 'employment', title: 'Sinov muddatidagi ish haqi to‘lanmadi', difficulty: 'O‘rta', duration: 30,
    facts: ['Sardor Farg‘onadagi logistika kompaniyasida operator bo‘lib bir oy ishladi. Sinov muddati tugagach, ish beruvchi «sinovdan o‘tmadi» deb shartnomani bekor qildi va bir oylik ish haqini to‘lamadi: «sinov muddati — o‘qish davri, haq to‘lanmaydi».'],
    issue: 'Sinov muddatida bajarilgan ish uchun haq to‘lanishi shartmi va undirish miqdori qanday?',
    client: { name: 'Sardor M. (da’vogar)', goal: '«Har kuni 9 dan 18 gacha ishlaganman, tabelda ham bor. Ish haqimni va kechiktirish uchun kompensatsiyani so‘rayman.»' },
    opponent: { name: 'Kompaniya (javobgar)', position: '«Sinov muddati o‘qish edi, mustaqil ish bajarmagan. Shartnomada haq ko‘rsatilmagan.»' },
    evidence: [
      ev('E1', 'Mehnat shartnomasi', 'Lavozim: operator. Sinov muddati: 1 oy. Ish haqi bandi: «shtat jadvaliga muvofiq».', 'Shartnoma ish haqini istisno qiladimi?'),
      ev('E2', 'Ish vaqti tabeli', '22 ish kuni, har kuni 8 soat. Bo‘lim boshlig‘i imzosi bor.', 'Bajarilgan ish hajmini baholang.'),
      ev('E3', 'Shtat jadvali ko‘chirmasi', 'Operator lavozimi: oylik 4 200 000 so‘m.', 'Undiriladigan miqdorni aniqlang.'),
      ev('E4', 'Ichki xat', 'Kadrlar bo‘limi: «Sinovdagi xodimlarga haq to‘lanmasin». Imzosiz.', 'Ichki ko‘rsatma qonundan ustun bo‘la oladimi?'),
    ],
    refs: [L.mk, L.fpk],
    roles: { advokat: 'Mehnat qonunchiligi asosida ish haqini undirishni asoslang.', sudya: 'Mehnat munosabati va to‘lov majburiyatini xolis baholang.', prokuror: 'Mehnat huquqlari buzilishi bo‘yicha ishtirok asoslari bo‘lsa, pozitsiyangizni bildiring.' },
  }),
  scenario({
    id: 'SC-pudrat-sifat', courtType: 'economic', category: 'consumer', title: 'Pudrat ishlari: qabul dalolatnomasi izoh bilan imzolangan', difficulty: 'Murakkab', duration: 40,
    facts: ['«Qurilish-Servis» MChJ savdo markazining tomini 420 mln so‘mga ta’mirladi. Buyurtmachi qabul dalolatnomasini «oqish bor, bartaraf etilsin» degan izoh bilan imzoladi va oxirgi 30 % (126 mln so‘m) ni to‘lamadi. Pudratchi to‘liq to‘lovni talab qilmoqda.'],
    issue: 'Kamchilik izohi bilan qabul qilingan ish uchun to‘lovni ushlab qolish qonuniymi va qay miqdorda?',
    client: { name: '«Qurilish-Servis» MChJ (da’vogar)', goal: '«Dalolatnoma imzolangan — ish qabul qilingan. Oqish shamolli yomg‘ir tufayli, bizning aybimiz emas.»' },
    opponent: { name: '«Markaz Savdo» AJ (javobgar)', position: '«Ish sifatsiz. Kamchilik bartaraf etilmaguncha to‘lamaymiz, mustaqil ekspertiza ham so‘raymiz.»' },
    evidence: [
      ev('E1', 'Pudrat shartnomasi', 'Kafolat muddati 2 yil. Kamchilik aniqlansa, pudratchi 15 kunda bartaraf etadi. To‘lov: 70 % oldindan, 30 % qabuldan keyin.', 'Majburiyatlar ketma-ketligini aniqlang.'),
      ev('E2', 'Qabul dalolatnomasi', 'Imzolangan, izoh: «shimoliy qismda oqish bor, bartaraf etilsin».', 'Izoh bilan qabulning huquqiy oqibati.'),
      ev('E3', 'Buyurtmachining xati', 'Kamchilikni bartaraf etish so‘rovi 3 marta yuborilgan; pudratchi javob bermagan.', 'Pudratchi kafolat majburiyatini bajarganmi?'),
      ev('E4', 'Meteo ma’lumotnoma', 'Ko‘rsatilgan kunda kuchli shamol va yomg‘ir qayd etilgan.', 'Sabab-oqibat bog‘lanishini baholang.'),
    ],
    refs: [L.fk, L.ipk],
    roles: { advokat: 'Pudratchi manfaatini dalillar bilan himoya qiling yoki kelishuv yo‘lini taklif qiling.', sudya: 'Ish sifati, qabul va to‘lov majburiyatini xolis baholang.', prokuror: 'Xo‘jalik nizosida prokuror ishtiroki asosini tekshiring.' },
  }),
  scenario({
    id: 'SC-ruxsat-rad', courtType: 'administrative', category: 'consumer', title: 'Yozgi ayvonga ruxsat sababsiz rad etildi', difficulty: 'O‘rta', duration: 30,
    facts: ['Buxoroda kafe egasi Lola yozgi ayvon uchun hokimlikka ariza berdi. 30 kundan so‘ng bir qatorli javob keldi: «Ruxsat berish maqsadga muvofiq emas». Qo‘shni ikki kafega xuddi shu ko‘chada ruxsat berilgan.'],
    issue: 'Ma’muriy organning asoslanmagan rad javobi qonuniymi va sud qanday choralar ko‘rishi mumkin?',
    client: { name: 'Lola N. (arizachi)', goal: '«Barcha hujjatlarni topshirdim. Nima uchun rad etilganini bilmayman. Qarorni bekor qilib, qayta ko‘rishni so‘rayman.»' },
    opponent: { name: 'Tuman hokimligi', position: '«Piyodalar yo‘lagi tor, xavfsizlik nuqtayi nazaridan rad etildi.»' },
    evidence: [
      ev('E1', 'Rad javobi', '«Ruxsat berish maqsadga muvofiq emas.» Asos, normativ hujjat va shikoyat tartibi ko‘rsatilmagan.', 'Ma’muriy hujjat asoslanganmi?'),
      ev('E2', 'Ariza va ilovalar', 'Ayvon chizmasi: piyodalar uchun 2,1 m o‘tish yo‘li qoldirilgan. Yong‘in xavfsizligi xulosasi ilova qilingan.', 'Xavfsizlik vajiga javob beradimi?'),
      ev('E3', 'Qo‘shni kafelarga berilgan ruxsatnomalar', 'Shu ko‘chada 2 ta ruxsatnoma, o‘tish yo‘li 1,8 m.', 'Teng munosabat tamoyilini baholang.'),
    ],
    refs: [L.msiyk, L.konst],
    roles: { advokat: 'Rad javobi asoslanmagani va kamsituvchi ekanini ko‘rsating.', sudya: 'Ma’muriy hujjatning qonuniyligi va asoslanganligini xolis tekshiring.', prokuror: 'Ma’muriy organ faoliyati qonuniyligi bo‘yicha pozitsiya bildiring.' },
  }),
];

const file = new URL('../src/content/scenarios.json', import.meta.url);
const all = JSON.parse(readFileSync(file, 'utf8'));
for (const s of list) { const i = all.findIndex(x => x.id === s.id); if (i >= 0) all[i] = s; else all.push(s); }
writeFileSync(file, JSON.stringify(all, null, 1) + '\n');
console.log('scenarios:', all.length);

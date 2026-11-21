export type Role = 'advokat' | 'prokuror' | 'sudya';
export type ExamLevel = 'beginner' | 'junior' | 'senior';
export const ROLE_ORDER: Role[] = ['advokat', 'prokuror', 'sudya'];
export const LEVEL_ORDER: ExamLevel[] = ['beginner', 'junior', 'senior'];
export const ROLE_META: Record<Role, { name: string; color: string; soft: string; ink: string }> = {
  advokat: { name: 'Advokat', color: '#4cc38a', soft: '#2f9e6118', ink: '#0b3a20' },
  prokuror: { name: 'Prokuror', color: '#5b9cf0', soft: '#2f74c818', ink: '#08294a' },
  sudya: { name: 'Sudya', color: '#e5675e', soft: '#c8453d18', ink: '#4a0a10' },
};
export const LEVEL_NAME: Record<ExamLevel, string> = { beginner: 'Beginner', junior: 'Junior', senior: 'Senior' };

export interface Product { sku: string; family: 'role_package' | 'premium'; kind: string; title: string; role: Role | null; levels: ExamLevel[]; currency: 'USD' | 'UZS'; amountMinor: number; period: 'month' | 'year' | null; bundle: boolean; display: string }
export interface Pricing { premium: Product[]; packages: Product[]; attemptsPerLevel: number; payments: { configured: boolean; devMock: boolean } }
export interface Credits { granted: number; consumed: number; remaining: number; batch: { granted: number; remaining: number } | null; purchases: number }
export interface Order { id: string; sku: string; family: string; role: Role | null; currency: string; amountMinor: number; price: string; status: string; provider: string; created: string; paidAt: string | null }
export interface Entitlements {
  premium: { active: boolean; state: 'none' | 'active' | 'cancel_at_period_end' | 'expired' | 'cancelled'; plan: string | null; periodEnd: string | null; cancelAtPeriodEnd: boolean };
  packages: Record<Role, Record<ExamLevel, { owned: boolean; credits: Credits }>>;
  orders: Order[];
  payments: { configured: boolean; provider: string | null; devMock: boolean };
  freeLabs: string[]; freeLessonsPerPath: number;
}
export type ExamState = 'issued' | 'revoked' | 'passed_ready' | 'in_progress' | 'under_review' | 'package_required' | 'exhausted' | 'disqualified' | 'failed_retry' | 'disqualified_retry' | 'ready';
export interface ExamSlot { role: Role; level: ExamLevel; owned: boolean; credits: Credits; state: ExamState; activeAttemptId: string | null; lastAttempt: { id: string; status: string; finalScore: number | null } | null; certificateId: string | null; material: { mode: 'certified' | 'practice' | 'unavailable'; reviewedQuestions: number; totalQuestions: number; reviewedCases: number; totalCases: number } }
export interface Identity { status: 'none' | 'pending' | 'verified' | 'rejected'; method?: string; fullName?: string; note?: string | null }
export interface Eligibility { exams: Record<string, ExamSlot>; identity: Identity; identityMethod: string | null; dev: boolean; rules: { questions: number; testMinutes: number; cases: number; caseMinutes: number; casePoints: number; pass: number; max: number } }
export interface Rules { role: Role; level: ExamLevel; questions: number; testMinutes: number; cases: number; caseMinutes: number; pass: number; credits: Credits; owned: boolean; acceptedAt: string | null; cameraCheckedAt: string | null; identity: Identity; material: string }
export interface ExamAttempt {
  id: string; role: Role; level: ExamLevel; status: string; practice: boolean; attemptNumber: number; attemptsGranted: number; credits: Credits; serverNow: string;
  testStartedAt: string; testEndsAt: string; casesStartedAt: string | null; casesEndsAt: string | null; orderRef: string;
  camera: { locked: boolean; lostAt: string | null; graceMs: number }; flags: { type: string; serious: boolean; at: string }[];
  test?: { questions: { index: number; prompt: string; options: { id: string; text: string }[] }[]; answers: Record<string, string> };
  cases?: { id: string; title: string; scenario: string; submitted: boolean; opened: string[]; documents: { id: string; title: string; body: string | null; synthetic: boolean }[]; decisions: { id: string; prompt: string; options: { id: string; text: string }[]; selected: string | null }[]; workflow: { id: string; text: string }[] }[];
  result?: { testScore: number; caseScore: number; finalScore: number; pass: number; timedOut: boolean; submittedAt: string; cases: { id: string; title: string; score: number; max: number; feedback: string }[]; reviewReason: string | null; appeal: { status: string; at: string } | null; decisions: { decision: string; reason: string; at: string }[] };
}
export interface CertificateSlot { role: Role; level: ExamLevel; state: ExamState; owned: boolean; credits: Credits; lastAttempt: ExamSlot['lastAttempt']; certificate: { id: string; role: Role; level: ExamLevel; issuedAt: string; status: string; environment: string; firstName: string; lastName: string } | null }

export const STATE_LABEL: Record<ExamState, { text: string; tone: 'purple' | 'green' | 'red' | 'sand' }> = {
  issued: { text: 'Berilgan', tone: 'green' },
  revoked: { text: 'Bekor qilingan', tone: 'red' },
  passed_ready: { text: 'O‘tdi · sertifikat tayyor', tone: 'green' },
  in_progress: { text: 'Imtihon davom etmoqda', tone: 'purple' },
  under_review: { text: 'Tekshiruvda', tone: 'sand' },
  package_required: { text: 'Paket kerak', tone: 'sand' },
  exhausted: { text: '2 ta imkoniyat tugadi', tone: 'red' },
  disqualified: { text: 'Diskvalifikatsiya', tone: 'red' },
  failed_retry: { text: 'Imtihon o‘tilmadi', tone: 'red' },
  disqualified_retry: { text: 'Diskvalifikatsiya', tone: 'red' },
  ready: { text: 'Imtihonga tayyor', tone: 'purple' },
};
export const attemptsText = (c: Credits) => c.batch ? `${c.batch.granted} dan ${c.batch.remaining} imkoniyat` : '0 imkoniyat';
export const productFor = (pricing: Pricing, role: Role, level: ExamLevel) => pricing.packages.find(p => p.role === role && p.levels.length === 1 && p.levels[0] === level);

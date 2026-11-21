export type Role = 'advokat' | 'fuqaro' | 'sudya' | 'prokuror';
export type Category = 'consumer' | 'employment' | 'criminal';
export type Stage = 'interview' | 'negotiation' | 'hearing' | 'reasoning';
export interface Option { id: string; text: string; score: number; feedback: string; evidenceIds: string[]; sourceIds: string[] }
export interface Decision { id: string; stage: Stage; prompt: string; options: Option[] }
export interface LegalRef { id: string; label: string; url: string; note: string }
export interface CaseFile {
  trial?: {available:boolean;reason?:string;visitors?:number;prosecutorAllowed?:boolean;prosecutorRequired?:boolean;prosecutorBasis?:string;participants?:Record<string,{name:string;statement:string;provenance?:string}>};
  courtType?: "civil" | "criminal" | "economic" | "administrative"; independent?: boolean;
  id: string; category: Category; title: string; subtitle: string; difficulty: string; duration: number; region: string;
  source: { url: string; title: string; type: string; date: string | null; summary: string; outcome: string; locator?: string };
  facts: string[]; issue: string; stakes: string;
  client: { name: string; goal: string; privateFact: string; opening: string };
  opponent: { name: string; position: string; settlement: string };
  evidence: { id: string; title: string; body: string; helps: string; sourceNote: string;authenticity?:string;kind?:string;origin?:string;providedBy?:string;limitations?:string }[];
  legalRefs: LegalRef[]; clientQuestions: { ask: string; answer: string; tag: string }[];
  decisions: Decision[]; rolePrompts: Partial<Record<Role, { opening: string; finalTask: string }>>;
  reviewStatus: string;
}
export interface TurnFeedback { summary: string; strengths: string[]; improvements: string[]; sourceIds: string[]; evidenceIds: string[]; needsReview: boolean; provider: string; positionStatus?: string }
export interface Attempt {
  version: 2; id: string; caseId: string; role: Role; avatar: string; createdAt: string; updatedAt: string;
  index: number; answers: { questionId: string; optionId: string }[];
  evidence: Record<string, 'read' | 'submitted' | 'examined'>; asked: number[];
  turns: { id: string; stage: string; text: string; createdAt: string; feedback?: TurnFeedback }[];
  final: { position: string; evidenceIds: string[]; sourceIds: string[]; text: string } | null;
  mode?: 'immersive' | 'structured';
  court?: import('./court').CourtState;
  courtMessages?: { actor: string; who: 'user' | 'npc' | 'system'; text: string; provider?: string }[];
  sessionId?: string;
  completed: boolean; teacherNote: string;
}
export interface Report {
  score: number; outcome: string; outcomeLabel: string; roleLabel: string;
  strengths: string[]; mistakes: string[]; nextSteps: string[];
  dimensions: { label: string; score: number; max: number }[];
  reasoned: boolean; finalNeedsReview: boolean;
}
export interface ProviderStatus { configured: boolean; verified?: boolean; message?: string; model?: string }
export interface Services { groq: ProviderStatus; voicelab: ProviderStatus; sessionOnly?: boolean }

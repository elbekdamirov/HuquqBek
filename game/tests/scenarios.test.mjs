import test from 'node:test';import assert from 'node:assert/strict';
import cases from '../src/content/scenarios.json' with {type:'json'};
import {newAttempt,parseAttempts,assessHearing}from'../src/training.ts';
import {initialCourt,courtAction}from'../src/court.ts';
import{caseContext}from'../server/ai.mjs';
test('independent practice supports all four jurisdictions and three roles with reload',()=>{
 assert.deepEqual(new Set(cases.map(c=>c.courtType)),new Set(['civil','criminal','economic','administrative']));
 for(const c of cases)for(const role of ['advokat','sudya','prokuror']){
  const a=newAttempt(c,role,{advokat:'madina',sudya:'kamol',prokuror:'sardor'}[role]);a.mode='immersive';
  assert.equal(parseAttempts(JSON.stringify([a]),cases).length,1,c.id+role);
  let s=initialCourt();const ids=c.evidence.map(e=>e.id);const act=(intent,id=null)=>courtAction(s,intent,id,'CH_JUDGE',ids,ids,role,null,c.courtType);
  assert.equal(act('request_decision').ok,false);s=act('begin_hearing').state;
  assert.equal(act('call_witness').ok,false);
  for(const id of ids){s=act('submit_evidence',id).state;s=act('examine_evidence',id).state;}
  s=act('closing_argument').state;
  if(c.courtType==='criminal'){assert.equal(act('request_decision').ok,false);s=act('final_statement').state;}else assert.equal(act('final_statement').ok,false);
  s=act('request_decision').state;assert.equal(s.phase,'decision');a.court=s;a.completed=true;a.final={text:'Asosli xulosa va qarama-qarshi materiallar bahosi. '.repeat(4),position:'Asoslangan',evidenceIds:ids,sourceIds:c.legalRefs.map(r=>r.id)};
  assert.equal(parseAttempts(JSON.stringify([a]),cases)[0].completed,true);assert.ok(assessHearing(a,c).score>=0);
  assert.equal(act('submit_evidence',ids[0]).ok,false);
 }
});
test('archive provenance and generated documents remain explicit in UI and AI context',()=>{
 assert.equal(cases.filter(c=>c.source.type==='adapted_training').length,24);assert.equal(new Set(cases.map(c=>c.id)).size,cases.length);
 for(const c of cases){assert.ok(c.evidence.length);assert.ok(c.legalRefs.every(r=>r.url.startsWith('https://')));assert.ok(c.source.type==='official_case_report'?c.source.outcome.includes('Asl sud'):c.source.summary.includes('sud qarori tasdiqlanmagan'));const ctx=caseContext(c,{role:'prokuror'}, {summary:'',recent:[]});assert.equal(ctx.case.courtType,c.courtType);assert.equal(ctx.case.roleScope,c.rolePrompts.prokuror.opening);}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {library,availableRoles,avatars,newAttempt,answer,decisionsFor,evidenceAction,assess,parseAttempts} from '../src/training.ts';
import {validateReply} from '../server/ai.mjs';
test('50 distinct sourced adaptations have complete case-specific content',()=>{
 assert.equal(library.length,50);assert.equal(new Set(library.map(c=>c.id)).size,50);
 for(const [category,count] of [['consumer',17],['employment',17],['criminal',16]])assert.equal(library.filter(c=>c.category===category).length,count);
 for(const c of library){assert.equal(c.evidence.length,4);assert.equal(c.decisions.length,6);assert.equal(c.clientQuestions.length,3);assert.ok(c.source.url.startsWith('https://'));assert.equal(c.reviewStatus,'pending_educator_legal_review');for(const q of c.decisions){assert.equal(q.options.length,3);assert.ok(q.options.some(o=>o.score===2));for(const o of q.options){assert.ok(o.evidenceIds.every(id=>c.evidence.some(e=>e.id===id)));assert.ok(o.sourceIds.every(id=>c.legalRefs.some(s=>s.id===id)));}}}
});
test('all supported case/role combinations complete with separate evidence states and restorable reports',()=>{
 for(const c of library)for(const role of availableRoles(c)){
  let a=newAttempt(c,role,avatars.find(a=>a.role===role).id);
  assert.throws(()=>evidenceAction(a,c,'E1','submitted'));
  for(const e of c.evidence)a=evidenceAction(a,c,e.id,'read');
  const qs=decisionsFor(c,role);
  while(a.index<qs.length){const q=qs[a.index];if(['hearing','reasoning'].includes(q.stage)){for(const e of c.evidence){if(a.evidence[e.id]==='read')a=evidenceAction(a,c,e.id,'submitted');if(a.evidence[e.id]==='submitted')a=evidenceAction(a,c,e.id,'examined');}}a=answer(a,c,q.options.find(o=>o.score===2).id);}
  a={...a,asked:[0,1,2],completed:true,final:{position:'Asosli xulosa',text:'Tekshirilgan hujjatlarni solishtirib, qarama-qarshi ma’lumotlar va tegishli manbalarga tayangan holda ushbu o‘quv xulosasiga keldim.',evidenceIds:c.evidence.map(e=>e.id),sourceIds:c.legalRefs.map(s=>s.id)}};
  assert.ok(assess(a,c).score>=90);assert.equal(assess(a,c).finalNeedsReview,true);assert.equal(parseAttempts(JSON.stringify([a])).length,1);
  if(c.category!=='criminal')assert.ok(!availableRoles(c).includes('prokuror'));
 }
});
test('untrusted AI source IDs and corrupted saves are rejected',()=>{
 const c=library[0];const v=validateReply({text:'Javob',summary:'text',evidenceIds:['invented',c.evidence[0].id],sourceIds:['nope']},c,'CH_JUDGE','test');assert.deepEqual(v.evidenceIds,[c.evidence[0].id]);assert.deepEqual(v.sourceIds,[]);assert.equal(v.text,'Javob');
 assert.deepEqual(parseAttempts('not JSON'),[]);const a=newAttempt(c,'advokat','madina');assert.deepEqual(parseAttempts(JSON.stringify([{...a,index:3}])),[]);
});

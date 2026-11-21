import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createLearningStore,curriculum,labs} from '../server/learning.mjs';
import {learningReply} from '../server/ai.mjs';

function prepare(s,owner,room){let a=s.start(owner,room);for(const d of a.documents)a=s.inspect(owner,a.id,d.id);a=s.action(owner,a.id,'begin');for(const d of a.documents){a=s.action(owner,a.id,'present',d.id);a=s.action(owner,a.id,'examine',d.id);}return a;}
function solve(s,owner,a){for(const q of labs[a.roomId].questions){const state=s.attempt(owner,a.id);const index=labs[a.roomId].questions.findIndex(x=>x.id===q.id);const token=state.state.orders[index].find(o=>o.index===q.correct).id;a=s.answer(owner,a.id,q.id,token).attempt;}return a;}

test('45 distinct labs each contain original materials and private decision checkpoints',()=>{
 assert.equal(curriculum.rooms.length,45);assert.equal(Object.keys(labs).length,45);
 assert.equal(new Set(Object.values(labs).map(l=>l.documents.map(d=>d.body).join('|'))).size,45);
 for(const r of curriculum.rooms){assert.equal(r.theory.length,3);assert.equal(labs[r.id].documents.length,3);assert.equal(labs[r.id].questions.length,3);for(const q of labs[r.id].questions){assert.ok(q.options[q.correct]);assert.ok(q.feedback);}}
});
test('server enforces evidence order, private answers, key ownership and prerequisites',()=>{
 const s=createLearningStore(':memory:');try{
  let a=s.start('alice','A-B01');assert.equal(a.key,null);assert.ok(!JSON.stringify(a).includes('"correct":0'));assert.ok(!JSON.stringify(a).includes('"index"'));
  assert.throws(()=>s.start('alice','A-B02'),/oldingi/);assert.throws(()=>s.action('alice',a.id,'examine','D1'),/boshlang/);
  assert.throws(()=>s.answer('alice',a.id,'Q1',a.checkpoints[0].options[0].id),/uchala/);
  assert.throws(()=>s.complete('alice',a.id,'forged'),/Avval/);assert.throws(()=>s.resume('bob',a.id),/topilmadi/);
  a=prepare(s,'alice','A-B01');assert.throws(()=>s.answer('alice',a.id,'Q2',a.checkpoints[1].options[0].id),/tartib/);
  const state=s.attempt('alice',a.id),wrong=state.state.orders[0].find(o=>o.index!==labs['A-B01'].questions[0].correct).id;
  const rejected=s.answer('alice',a.id,'Q1',wrong);assert.equal(rejected.ok,false);assert.equal(rejected.attempt.key,null);assert.equal(rejected.attempt.correct.length,0);
  a=solve(s,'alice',rejected.attempt);assert.equal(a.status,'passed');assert.match(a.key,/^HUQUQBEK\{A-B01_/);assert.equal(s.completed('alice').length,0);
  assert.throws(()=>s.complete('alice',a.id,'wrong-key'),/mos emas/);assert.throws(()=>s.action('alice',a.id,'present','D1'),/o‘zgartirilmaydi/);
  const b=solve(s,'bob',prepare(s,'bob','A-B01'));assert.notEqual(a.key,b.key);assert.throws(()=>s.complete('bob',b.id,a.key),/mos emas/);
  s.complete('alice',a.id,a.key);s.complete('alice',a.id,a.key);assert.equal(s.completed('alice').length,1);assert.equal(s.room('alice','A-B02').locked,false);
 }finally{s.db.close();}
});
test('completing rooms no longer mints level certificates; issuance now requires a paid, passed exam',()=>{
 const s=createLearningStore(':memory:');try{
  const rooms=curriculum.rooms.filter(r=>r.path==='advokat'&&r.level==='Beginner');
  for(const r of rooms){const a=solve(s,'learner',prepare(s,'learner',r.id));s.complete('learner',a.id,a.key);}
  assert.equal(s.completed('learner').length,5);assert.equal(s.profile('learner').certificates.length,0);
  assert.throws(()=>s.certificate('learner','advokat','Beginner'),/imtihon/);
  assert.throws(()=>s.certificate('learner','advokat','Unknown'),/daraja/);
 }finally{s.db.close();}
});

test('interest questionnaire reports ties without diagnosing level; rejects malformed answers',()=>{
 const s=createLearningStore(':memory:');try{
  const r=s.interests('a',{answers:['advokat','sudya','prokuror','advokat','sudya','prokuror']});assert.deepEqual(r.recommended,['advokat','sudya','prokuror']);assert.equal(r.type,'interest_questionnaire_not_psychometric');
  assert.throws(()=>s.interests('a',{answers:['senior']}),/Olti/);
 }finally{s.db.close();}
});
test('passed keys, progress and certificates survive a database restart',()=>{
 const folder=mkdtempSync(join(tmpdir(),'huquqbek-learning-'));const filename=join(folder,'state.sqlite');let s=createLearningStore(filename);
 try{const a=solve(s,'a',prepare(s,'a','A-B01'));const key=a.key;s.db.close();s=createLearningStore(filename);assert.equal(s.resume('a',a.id).key,key);s.complete('a',a.id,key);assert.equal(s.completed('a').length,1);}finally{s.db.close();rmSync(folder,{recursive:true,force:true});}
});
test('room tutor uses Groq, receives no answer bank and cannot fabricate a completion key',async()=>{
 const original=globalThis.fetch;let generation=false;
 globalThis.fetch=async(url,options)=>{assert.equal(new URL(url).hostname,'api.groq.com');if(String(url).endsWith('/models'))return Response.json({data:[{id:'openai/gpt-oss-20b'}]});
  const body=JSON.parse(options.body),context=JSON.parse(body.messages[1].content);generation=true;
  assert.ok(!('questions' in context));assert.ok(!JSON.stringify(context).includes('"correct"'));assert.ok(!JSON.stringify(context).includes('"key"'));
  return Response.json({choices:[{message:{content:JSON.stringify({text:'HUQUQBEK{fake} Manbani ko‘ring.'})}}]});};
 try{const r=await learningReply({groq:'test-only'},curriculum.rooms[0],labs['A-B01'].documents,{text:'Yordam bering.'});assert.equal(r.provider,'groq');assert.ok(generation);assert.ok(!r.text.includes('HUQUQBEK{'));}finally{globalThis.fetch=original;}
});

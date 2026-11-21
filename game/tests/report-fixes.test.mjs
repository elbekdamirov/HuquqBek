import test from 'node:test';
import assert from 'node:assert/strict';
import { Quaternion, Vector3, AnimationMixer, AnimationClip, QuaternionKeyframeTrack, Bone } from 'three';
import { courtAction, initialCourt, migrateCourt, flow } from '../src/court.ts';
import { gazeYaw } from '../src/gaze.ts';
import { library, newAttempt, parseAttempts, assess } from '../src/training.ts';
import { converse, feedback, analyzeEvidence } from '../server/ai.mjs';

test('every mutating intent is blocked after decision; examination cannot resume paused or late phases', () => {
  for (const phase of [...flow, 'paused']) {
    const s = {...initialCourt(), phase, submitted:['E1']};
    const result = courtAction(s,'examine_evidence','E1','CH_JUDGE',['E1'],['E1']);
    assert.equal(result.ok,['opening','testimony','evidence'].includes(phase),phase);
  }
  const s={...initialCourt(),phase:'decision',submitted:['E1'],examined:['E1']};
  for(const intent of ['begin_hearing','call_witness','submit_evidence','examine_evidence','objection','request_break','closing_argument','final_statement','request_decision']) {
    const result=courtAction(s,intent,'E1','CH_JUDGE',['E1'],['E1']);
    assert.equal(result.ok,false,intent);assert.deepEqual(result.state,s);
  }
});

test('corrupted court fields recover and transcripts restore safely', () => {
  assert.deepEqual(migrateCourt({submitted:null,examined:42,log:'bad',challenged:[],objections:-4}),initialCourt());
  const s=migrateCourt({phase:'paused',resumeTo:'decision',submitted:['E1','E1','E99'],examined:['E2','E1'],challenged:{E99:'sustained'},log:[null,'valid']},['E1','E2']);
  assert.deepEqual(s.submitted,['E1']);assert.deepEqual(s.examined,['E1']);assert.equal(s.resumeTo,'opening');assert.deepEqual(s.log,['valid']);
  const a={...newAttempt(library[0],'advokat','madina'),court:{submitted:null,examined:42},courtMessages:[null,{text:7},{actor:'CH_CLERK',who:'npc',text:'Salom'}]};
  const restored=parseAttempts(JSON.stringify([a]))[0];
  assert.deepEqual(restored.court.submitted,[]);assert.equal(restored.courtMessages.length,1);
});

test('hearing assessment uses actual events and requires legal review without quiz answers', () => {
  const c=library[0];const a={...newAttempt(c,'advokat','madina'),mode:'immersive',completed:true,
    court:{...initialCourt(),phase:'decision',submitted:['E1','E2'],examined:['E1','E2']},
    evidence:{E1:'examined',E2:'examined'},turns:[{id:'t',stage:'final',text:'Dalillarni solishtirib asosli xulosa va qarama-qarshi fikrni tushuntiraman.',createdAt:''}],
    final:{position:'Asosli',text:'A'.repeat(120),evidenceIds:['E1','E2'],sourceIds:[c.legalRefs[0].id]}};
  const r=assess(a,c);assert.equal(r.reasoned,true);assert.equal(r.outcome,'pending_review');assert.equal(r.finalNeedsReview,true);
  assert.equal(parseAttempts(JSON.stringify([a]))[0].completed,true);assert.equal(a.answers.length,0);
});

test('bounded head overlay does not accumulate with constant or changing animation tracks', () => {
  assert.equal(gazeYaw(0,0,0),0);assert.equal(gazeYaw(.01,.01,0),0);
  assert.ok(Math.abs(gazeYaw(100,-100,0))<=.65);
  for(const changing of [false,true]) {
    const head=new Bone();head.name='head';
    const end=new Quaternion().setFromAxisAngle(new Vector3(1,0,0),changing ? .15 : 0);
    const mixer=new AnimationMixer(head);
    mixer.clipAction(new AnimationClip('body',1,[new QuaternionKeyframeTrack('.quaternion',[0,1],[0,0,0,1,...end.toArray()])])).play();
    const offset=new Quaternion();const inverse=new Quaternion();
    for(let i=0;i<1200;i++) {
      head.quaternion.multiply(inverse.copy(offset).invert());offset.identity();mixer.update(1/60);
      offset.setFromAxisAngle(new Vector3(0,1,0),.5);head.quaternion.multiply(offset);
      assert.ok(head.quaternion.angleTo(new Quaternion())<.7,'no rotation drift');
    }
  }
});

test('all AI entry points and error paths only call Groq, even with a retired provider preference', async () => {
  const original=globalThis.fetch;const urls=[];let failure=false;
  globalThis.fetch=async(url,options) => {
    urls.push(String(url));assert.equal(new URL(url).hostname,'api.groq.com');
    if(String(url).endsWith('/models')) return Response.json({data:[{id:'openai/gpt-oss-120b'},{id:'openai/gpt-oss-20b'}]});
    if(failure) return Response.json({error:{code:'bad_key'}},{status:401});
    const body=JSON.parse(options.body);assert.equal(body.model,'openai/gpt-oss-20b');
    return Response.json({choices:[{message:{content:JSON.stringify({text:'Tekshirilgan ökuv javobi.',summary:'Kuzatuv',intent:'question',strengths:[],improvements:[],evidenceIds:[],sourceIds:[]})}}]});
  };
  try {
    const c=library[0], credentials={groq:'test-only'};
    for(const mode of ['converse','analysis','decision','compare','feedback']) assert.equal((await converse(credentials,c,{actor:'CH_JUDGE',role:'advokat',text:'Qarorni asoslang',mode,history:[]})).provider,'groq');
    assert.equal((await feedback(credentials,c,{role:'advokat',text:'Huquqiy sabablar va tekshirilgan dalillar',provider:'retired'})).provider,'groq');
    assert.equal((await analyzeEvidence(credentials,c,{evidenceIds:['E1','E2']})).provider,'groq');
    failure=true;await assert.rejects(converse(credentials,c,{actor:'CH_WITNESS',text:'Salom'}));
    assert.ok(urls.length>=9);
  } finally { globalThis.fetch=original; }
});

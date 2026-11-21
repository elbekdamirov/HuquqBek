import test from 'node:test';import assert from 'node:assert/strict';import {validateHearingLegalRules} from '../server/ai.mjs';
const c={legalRefs:[{id:'LOAN'}]};
test('known Civil Code109/733 source contradictions block publication rather than becoming legal decisions',()=>{
 for(const text of ['FK109 bo‘yicha guvoh yoki boshqa dalillar bilan tasdiqlash mumkin.','FK109 böyiça guvoh yoki boşqa dalillar bilan tasdiqlaş mumkin.','Article109 allows witness testimony when written form was omitted.','FK733 yozma shaklni talab qilmaydi.'])assert.throws(()=>validateHearingLegalRules(c,{text}),{status:502});
 for(const text of ['FK109 guvoh ko‘rsatmalariga tayanishni cheklaydi; yozma va boshqa dalillar mumkin.','Article109 restricts witness proof; other written evidence remains possible.'])assert.doesNotThrow(()=>validateHearingLegalRules(c,{text}));
 assert.throws(()=>validateHearingLegalRules(c,{text:'Record reviewed.',reasons:[{text:'FK733 yozma shaklni talab qilmaydi.'}]}),{status:502});
 assert.doesNotThrow(()=>validateHearingLegalRules({legalRefs:[]},{text:'Article109 allows witness testimony.'}));
});

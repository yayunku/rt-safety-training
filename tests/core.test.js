const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {createHmac} = require('node:crypto');
const C = require('../apps-script/Core.js');
const {fixture,answers,cert} = require('./fixture.cjs');
const hmac = (secret,text) => [...createHmac('sha256',secret).update(text).digest()];

test('browser and GAS pure logic copies are identical and contain no GAS services',() => {
  const source = readFileSync('apps-script/Core.js','utf8');
  assert.equal(readFileSync('core.js','utf8'),source);
  assert.doesNotMatch(source,/\b(?:FormApp|SpreadsheetApp|CacheService|LockService|PropertiesService|UrlFetchApp)\b/);
});
for (const [label,valid,invalid] of [
  ['national ID','A123456789','A123456788'],['new ARC','A800000014','A800000015'],['old ARC','AB12345677','AB12345678']
]) test(label + ' valid and invalid checksum',() => {
  assert.equal(C.validId(valid),true);assert.equal(C.validId(' '+valid.toLowerCase()+' '),true);assert.equal(C.validId(invalid),false);
});
test('ID format and tax ID checksum including seventh digit 7',() => {
  ['A323456789','AE12345677','Ａ123456789','A12345678','A1234567890','1A23456789',''].forEach(s => assert.equal(C.validId(s),false,s));
  ['24536806','12345675','12345670','12345676'].forEach(s => assert.equal(C.validTaxId(s),true,s));
  ['24536807','12345674','1234567','123456789','abcdefgh'].forEach(s => assert.equal(C.validTaxId(s),false,s));
});
test('name NFKC, all whitespace, and Latin case normalization',() => {
  assert.equal(C.normalizeName('　王 小\t明\nＡｂｃ '),'王小明ABC');
  assert.equal(C.normalizeName(' Ｊｏｈｎ　Ｄｏｅ '),'JOHNDOE');
  assert.equal(C.maskId(' a123456789 '),'A12****789');
  assert.equal(C.maskId('AB12345677'),'AB1****677');
});
test('UTC+8 date boundary, year expiry and expiry-day inclusion',() => {
  assert.equal(C.taipeiDate('2026-10-14T15:59:59Z'),'2026-10-14');
  assert.equal(C.taipeiDate('2026-10-14T16:00:00Z'),'2026-10-15');
  assert.equal(C.taipeiDateTime('2026-10-14T16:00:00Z'),'2026-10-15T00:00:00.000+08:00');
  assert.equal(C.expiryOf(C.taipeiDate('2026-12-31T16:00:00Z')),'2028-01-01');
  assert.equal(C.expiryOf('2024-02-29'),'2025-03-01');
  assert.equal(C.statusOf(cert,'2027-10-14'),'valid');
  assert.equal(C.statusOf(cert,'2027-10-15'),'expired');
  assert.equal(C.statusOf({...cert,revoked:true},'2030-01-01'),'revoked');
  assert.equal(C.validDate('2026-02-29'),false);
  assert.equal(C.validDate('2026-10-15','2026-10-14'),false);
  assert.equal(C.validDate('2024-02-29','2026-10-14'),true);
});
test('daily cert sequence is separate per type and rolls over with UTC+8',() => {
  const rows = [{certNo:'RT-E-20261014-003'},{certNo:'RT-E-20261014-001'},{certNo:'RT-S-20261014-009'}];
  assert.equal(C.nextCertNo('E','2026-10-14',rows),'RT-E-20261014-004');
  assert.equal(C.nextCertNo('S','2026-10-14',rows),'RT-S-20261014-010');
  assert.equal(C.nextCertNo('E',C.taipeiDate('2026-10-14T16:00:00Z'),rows),'RT-E-20261015-001');
  assert.throws(() => C.nextCertNo('E','2026-10-14',[{certNo:'RT-E-20261014-999'}]),/sequence_exhausted/);
});
test('latest per type includes revoked/expired instead of older valid records',() => {
  const old = {...cert,issuedAt:'2026-01-01T12:00:00+08:00'};
  const newest = {...cert,certNo:'RT-E-20261015-001',issuedAt:'2026-10-15T12:00:00+08:00',revoked:true};
  const service = {...cert,type:'S',certNo:'RT-S-20250101-001',issuedAt:'2025-01-01T12:00:00+08:00',expiresOn:'2026-01-01'};
  const found = C.latestPerType([newest,old,service]);
  assert.deepEqual(found,[newest,service]);
  assert.deepEqual(found.map(r => C.statusOf(r,'2026-10-16')),['revoked','expired']);
});
test('token stability, exact HMAC message, base64url and signed GAS byte formatting',() => {
  const secret = 'fixture-secret', expected = createHmac('sha256',secret).update(cert.certNo).digest('base64url').slice(0,16);
  assert.equal(C.tokenFor(secret,cert.certNo,hmac),expected);
  assert.equal(C.tokenFor(secret,cert.certNo,(s,m) => hmac(s,m).map(b => b > 127 ? b-256 : b)),expected);
  assert.equal(C.lookupHash(secret,' a123456789 ',' 王 小 明 ',hmac),createHmac('sha256',secret).update('A123456789\n王小明').digest('base64url'));
  assert.notEqual(C.lookupHash(secret,'A123456789','王大明',hmac),C.lookupHash(secret,'A123456789','王小明',hmac));
  assert.equal(C.equalToken(expected,expected),true); assert.equal(C.equalToken(expected+'x',expected),false);
  assert.equal(C.equalToken(undefined,expected),false);
});
test('serialized public form is an allowlist with no answer/points fields at any depth',() => {
  const form = fixture(); form.answer = 'leak'; form.points = 100;
  form.sections[0].answers = ['leak']; form.sections[0].items[0].answerKey = 'leak';
  C.checkForm(form);
  const serialized = JSON.stringify(C.publicForm(form));
  assert.doesNotMatch(serialized,/"[^"\n]*(?:answer|correct|points)[^"\n]*"\s*:/i);
  assert.doesNotMatch(serialized,/leak/);
  assert.equal(C.publicForm(form).sections[2].items[0].graded,true);
});
test('required roles, ambiguous roles and unreadable graded keys fail closed',() => {
  const form = fixture(); form.sections[0].items = form.sections[0].items.filter(i => i.role !== 'taxId');
  assert.throws(() => C.checkForm(form),/form_misconfigured/);
  const duplicate = fixture(); duplicate.sections[0].items.push({...duplicate.sections[0].items[2],id:'99'});
  assert.throws(() => C.checkForm(duplicate),/form_misconfigured/);
  const noKey = fixture(); noKey.sections[2].items[0].correct = [];
  assert.throws(() => C.checkForm(noKey),/form_misconfigured/);
});
test('all submit validations precede grading; quiz wrong IDs identify original questions',() => {
  assert.equal(C.validateAnswers(fixture(),answers,'2026-10-14',true).ok,true);
  for (const [id,value,error] of [['1',[],'consent'],['2','12345674','taxId'],['3','A123456788','nationalId'],['4','　','required'],['6','2026-10-15','watchDate'],['8','否','gate'],['9','否','gate'],['10','incorrect','invalid'],['1',['made up'],'invalid']]) {
    assert.equal(C.validateAnswers(fixture(),{...answers,[id]:value},'2026-10-14',true).error,error);
  }
  assert.deepEqual(C.validateAnswers(fixture(),{...answers,'10':'錯誤'},'2026-10-14',true),{ok:false,error:'quiz',wrong:['10']});
  const multi = fixture(); Object.assign(multi.sections[2].items[0],{kind:'checkbox',correct:['正確','錯誤']});
  assert.equal(C.validateAnswers(multi,{...answers,'10':['錯誤','正確']},'2026-10-14',true).ok,true);
});
test('video fallback parses only type 12 IDs with JSON, without evaluating script',() => {
  const html = '<script>var FB_PUBLIC_LOAD_DATA_ = '+JSON.stringify([null,[[123,'影片','說明',12,null,null,[null,null,null,'8A8QaiF10XM']]]])+';</script>';
  assert.deepEqual(C.videoIds(html),{'123':'8A8QaiF10XM'});
  assert.throws(() => C.videoIds('window.sideEffect = true;'),/form_misconfigured/);
});
test('consent constant matches every character of Appendix A including line breaks',() => {
  const spec = readFileSync('docs/superpowers/specs/2026-10-14-two-forms-apps-script-backend-design.md','utf8');
  const expected = spec.split('## 附錄 A：')[1].split('## 附錄 B：')[0].split('\n').filter(s => s.startsWith('>')).map(s => s.replace(/^> ?/,'').replaceAll('**','')).join('\n');
  assert.equal(require('../consent.js'),expected);
});

const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const {createHmac} = require('node:crypto');
const {fixture,answers} = require('./fixture.cjs');
function harness() {
  const state = {now:Date.now(),propertyScans:0,triggers:[],modelGetters:0,getItemsCalls:0,itemByIdCalls:0,props:{FORM_ID_E:'copy-E',FORM_ID_S:'copy-S'},rows:[],cache:new Map(),submissions:[],formReads:0,fetches:0,created:0,locked:false,logs:[],failWrite:false};
  const sheet = {
    setName(){return this;},setFrozenRows(){},getMaxRows(){return 1000;},getLastRow(){return state.rows.length;},insertRowsAfter(){},
    getRange(row,col,height=1,width=1){
      return {getValues:()=>Array.from({length:height},(_,i)=>Array.from({length:width},(_,j)=>(state.rows[row+i-1] || [])[col+j-1] ?? '')),
        setValues(values){if (state.failWrite && row > 1) throw new Error('PII must never be logged');values.forEach((r,i)=>r.forEach((v,j)=>{state.rows[row+i-1] ||= [];state.rows[row+i-1][col+j-1]=v;}));return this;},
        setValue(value){return this.setValues([[value]]);},insertCheckboxes(){return this;},setNumberFormat(){return this;}};
    }
  };
  const book = {getSheets:()=>[sheet],getSheetByName:()=>sheet,setSpreadsheetTimeZone(){},getId:()=> 'registry'};
  const cache = {get:key=>state.cache.get(key)?.value || null,put:(key,value,ttl)=>state.cache.set(key,{value,ttl}),removeAll:keys=>keys.forEach(k=>state.cache.delete(k))};
  const lock = {waitLock(){state.locked=true;},tryLock(){state.locked=true;return true;},releaseLock(){state.locked=false;}};
  function formFor(type) {
    state.formReads++;
    const model = fixture(type);
    if (state.misconfigured || state.misconfiguredType === type) model.sections[0].items = model.sections[0].items.filter(i=>i.id !== '2');
    function source(item,kind) {
      const out = {getType:()=>kind,getId:()=>Number(item.id),getTitle:()=>item.title,getHelpText:()=>item.help || '',isRequired:()=>item.required,getPoints:()=>item.points || 0,
        getChoices:()=>item.options.map(option=>({getValue:()=>option,isCorrectAnswer:()=>!!item.correct?.includes(option)})),hasOtherOption:()=>false,
        createResponse:value=>({id:item.id,value})};
      for(const name of ['getTitle','getHelpText','isRequired','getPoints','getChoices','hasOtherOption']) {
        const original=out[name];out[name]=(...args)=>{state.modelGetters++;return original(...args);};
      }
      ['asImageItem','asPageBreakItem','asTextItem','asDateItem','asMultipleChoiceItem','asCheckboxItem','asVideoItem'].forEach(name=>{out[name]=()=>out;});return out;
    }
    const raw = [source({id:'99',title:model.subtitle},'IMAGE')];
    model.sections.forEach((section,index)=>{
      if(index)raw.push(source({id:String(100+index),title:section.title,help:section.description},'PAGE_BREAK'));
      raw.push(...section.items.map(i=>source(i,{text:'TEXT',date:'DATE',checkbox:'CHECKBOX',radio:'MULTIPLE_CHOICE',video:'VIDEO'}[i.kind])));
    });
    return {getTitle:()=>{state.modelGetters++;return model.title;},getDescription:()=>{state.modelGetters++;return model.sections[0].description;},getItems:()=>{state.getItemsCalls++;return raw;},getItemById:id=>{state.itemByIdCalls++;return raw.find(i=>i.getId()===id);},getPublishedUrl:()=> 'https://docs.google.com/mock',
      createResponse(){const submitted=[];return {withItemResponse(response){submitted.push(response);return this;},submit(){assert.equal(state.locked,true);state.submissions.push(submitted);return {getId:()=> 'response-'+state.submissions.length};}};}};
  }
  class Clock extends Date {
    constructor(...args){super(...(args.length ? args : [state.now]));}
    static now(){return state.now;}
  }
  const checkPropertyLock = key => {if(key.startsWith('lookupfail:'))assert.equal(state.locked,true);};
  const ctx = vm.createContext({console:{error:message=>state.logs.push(message)},Date:Clock,
    PropertiesService:{getScriptProperties:()=>({
      getProperty:key=>{checkPropertyLock(key);return state.props[key];},
      getProperties:()=>{assert.equal(state.locked,true);state.propertyScans++;return {...state.props};},
      setProperty:(key,value)=>{checkPropertyLock(key);state.props[key]=value;},
      deleteProperty:key=>{checkPropertyLock(key);delete state.props[key];}
    })},
    ScriptApp:{EventType:{CLOCK:'CLOCK'},getProjectTriggers:()=>state.triggers,
      newTrigger:handler=>({timeBased(){return this;},everyHours(hours){this.hours=hours;return this;},create(){
        assert.equal(state.locked,true);const trigger={getHandlerFunction:()=>handler,getEventType:()=> 'CLOCK',hours:this.hours};state.triggers.push(trigger);return trigger;
      }})},
    LockService:{getScriptLock:()=>lock},CacheService:{getScriptCache:()=>cache},
    SpreadsheetApp:{create:()=>{state.created++;return book;},openById:()=>book,flush(){}},
    Utilities:{getUuid:()=> 'random-fixture-uuid',Charset:{UTF_8:'utf8'},computeHmacSha256Signature:(message,secret)=>[...createHmac('sha256',secret).update(message).digest()],newBlob:text=>({getBytes:()=>Buffer.from(text)})},
    FormApp:{openById:id=>formFor(id.endsWith('E')?'E':'S')},
    UrlFetchApp:{fetch:()=>{state.fetches++;return {getContentText:()=>'<script>var FB_PUBLIC_LOAD_DATA_ = '+JSON.stringify([null,[[7,'影片','說明',12,null,null,[null,null,null,'8A8QaiF10XM']]]])+';</script>'};}},
    ContentService:{MimeType:{JSON:'application/json'},createTextOutput:text=>({text,setMimeType(){return this;}})}
  });
  vm.runInContext(fs.readFileSync('apps-script/Core.js','utf8'),ctx);
  vm.runInContext(fs.readFileSync('apps-script/Server.js','utf8'),ctx);
  return {state,ctx,get:params=>JSON.parse(ctx.doGet({parameter:params}).text),post:body=>JSON.parse(ctx.doPost({postData:{contents:JSON.stringify(body)}}).text)};
}
test('setup is idempotent and preserves all existing properties and registry rows',()=>{
  const h=harness();h.ctx.setup();const props={...h.state.props};h.state.rows.push(['existing']);h.ctx.setup();
  assert.deepEqual(h.state.props,props);assert.equal(h.state.created,1);assert.equal(h.state.rows.length,2);assert.equal(h.state.rows[0][10],'作廢');assert.equal(h.state.locked,false);
});
test('form HTTP body contains no private answer key; both caches last 7200s and clear rebuilds both types',()=>{
  const h=harness();const result=h.get({action:'form',type:'E'});assert.equal(result.ok,true);
  assert.doesNotMatch(JSON.stringify(result),/"[^"\n]*(?:answer|correct|points)[^"\n]*"\s*:/i);
  assert.doesNotMatch(h.state.cache.get('form:E').value,/"(?:correct|points)":/);
  assert.equal(h.state.fetches,1);assert.equal(h.state.cache.get('form:E').ttl,7200);
  assert.match(h.state.cache.get('form-private:E').value,/"correct":/);
  assert.equal(h.state.cache.get('form-private:E').ttl,7200);
  h.get({action:'form',type:'E'});assert.equal(h.state.formReads,1);
  h.ctx.clearFormCache();assert.equal(h.state.formReads,3);
  for(const key of ['form:E','form:S','form-private:E','form-private:S'])assert.equal(h.state.cache.get(key).ttl,7200);
  h.get({action:'form',type:'E'});assert.equal(h.state.formReads,3);
  h.state.props.FORM_ID_E='another-copy-E';h.get({action:'form',type:'E'});assert.equal(h.state.formReads,4);
});
test('setup installs exactly one hourly warmer across repeated runs',()=>{
  const h=harness();h.ctx.setup();h.ctx.setup();h.ctx.setup();
  assert.equal(h.state.triggers.length,1);
  assert.equal(h.state.triggers[0].getHandlerFunction(),'warmFormCache');
  assert.equal(h.state.triggers[0].hours,1);
});
test('submit cache hit grades without model getters or video fetch and maps items once',()=>{
  const h=harness();h.ctx.setup();h.get({action:'form',type:'E'});
  const getters=h.state.modelGetters,fetches=h.state.fetches,items=h.state.getItemsCalls;
  assert.equal(h.post({action:'submit',type:'E',answers:{...answers,'10':'錯誤'}}).error,'quiz');
  assert.equal(h.state.getItemsCalls,items);
  assert.equal(h.post({action:'submit',type:'E',answers}).ok,true);
  assert.equal(h.state.modelGetters,getters);assert.equal(h.state.fetches,fetches);
  assert.equal(h.state.getItemsCalls,items+1);assert.equal(h.state.itemByIdCalls,0);
});
test('submit private cache miss never fetches videos and ignores a different form ID cache',()=>{
  const h=harness();h.ctx.setup();
  assert.equal(h.post({action:'submit',type:'E',answers}).ok,true);
  assert.equal(h.state.fetches,0);assert.equal(h.state.getItemsCalls,1);
  assert.equal(h.state.cache.get('form-private:E').ttl,7200);
  const getters=h.state.modelGetters;h.state.props.FORM_ID_E='new-copy-E';
  assert.equal(h.post({action:'submit',type:'E',answers}).ok,true);
  assert.ok(h.state.modelGetters>getters);assert.equal(h.state.fetches,0);
  assert.equal(JSON.parse(h.state.cache.get('form-private:E').value).id,'new-copy-E');
});
test('warming rebuilds existing private and public caches, and no HTTP action exposes private data',()=>{
  const h=harness();h.ctx.warmFormCache();const reads=h.state.formReads;h.ctx.warmFormCache();assert.equal(h.state.formReads,reads+2);
  for(const type of ['E','S']) {
    const secretCache=JSON.parse(h.state.cache.get('form-private:'+type).value);
    secretCache.model.sections[2].items[0].correct=['PRIVATE_SENTINEL'];
    h.state.cache.set('form-private:'+type,{value:JSON.stringify(secretCache),ttl:7200});
    const output=JSON.stringify(h.get({action:'form',type}));
    assert.doesNotMatch(output,/PRIVATE_SENTINEL|"correct"|"points"/);
    assert.equal(h.get({action:'form-private',type}).error,'invalid');
  }
});
test('warmer still attempts S after E fails and emits no private model in logs',()=>{
  const h=harness();h.state.misconfiguredType='E';
  assert.throws(()=>h.ctx.warmFormCache(),/form_cache_warm_failed/);
  assert.equal(h.state.cache.has('form:E'),false);
  assert.equal(h.state.cache.has('form-private:E'),false);
  assert.equal(h.state.cache.get('form:S').ttl,7200);
  assert.equal(h.state.cache.get('form-private:S').ttl,7200);
  assert.deepEqual(h.state.logs,['Form cache warm failed: E']);
});
test('misconfigured role returns structured error and a safe log',()=>{
  const h=harness();h.state.misconfigured=true;assert.deepEqual(h.get({action:'form',type:'E'}),{ok:false,error:'form_misconfigured'});assert.match(h.state.logs[0],/form_misconfigured/);
});
test('invalid answers do not submit or write; success submits every section then writes masked registry',()=>{
  const h=harness();h.ctx.setup();
  for(const replacement of [{'1':[]},{'2':'24536807'},{'3':'A123456788'},{'8':'否'},{'10':'錯誤'}])assert.equal(h.post({action:'submit',type:'E',answers:{...answers,...replacement}}).ok,false);
  assert.equal(h.state.submissions.length,0);assert.equal(h.state.rows.length,1);
  const result=h.post({action:'submit',type:'E',answers});assert.equal(result.ok,true);assert.equal(result.cert.status,'valid');assert.equal(result.cert.maskedId,'A12****789');assert.equal(h.state.submissions[0].length,10);
  assert.ok(h.state.submissions[0].find(r=>r.id==='6').value instanceof Date);
  assert.equal(h.state.rows[1][1],'工程發包');assert.equal(h.state.rows[1][2],answers['2']);assert.ok(!JSON.stringify(h.state.rows).includes(answers['3']));assert.equal(h.state.locked,false);
  assert.match(h.state.rows[1][7],/\+08:00$/);
  const second=h.post({action:'submit',type:'E',answers});assert.match(second.cert.certNo,/-002$/);
  const service=h.post({action:'submit',type:'S',answers});assert.match(service.cert.certNo,/^RT-S-\d{8}-001$/);assert.equal(h.state.rows[3][1],'勞務');
});
test('verify and lookup return live revoked/expired latest records and reject invalid tokens',()=>{
  const h=harness();h.ctx.setup();const first=h.post({action:'submit',type:'E',answers});h.post({action:'submit',type:'E',answers});h.post({action:'submit',type:'S',answers});
  h.state.rows[2][10]=true;h.state.rows[3][8]='2000-01-01';
  assert.equal(h.get({action:'verify',cert:first.cert.certNo,token:first.cert.token}).cert.status,'valid');
  assert.equal(h.get({action:'verify',cert:first.cert.certNo,token:'invalid'}).error,'invalid');
  const found=h.post({action:'lookup',idNo:' a123456789 ',name:' 王 小 明 '});assert.equal(found.certs.length,2);assert.match(found.certs[0].certNo,/-002$/);assert.equal(found.certs[0].status,'revoked');assert.equal(found.certs[1].status,'expired');
});
test('lookup failure limit shares normalized ID across names and expires after 15 minutes',()=>{
  const h=harness();h.ctx.setup();
  for(let i=0;i<4;i++)assert.deepEqual(h.post({action:'lookup',idNo:'a123456789',name:'wrong'+i}),{ok:true,certs:[]});
  assert.equal(h.post({action:'lookup',idNo:'A123456789',name:'fifth'}).error,'too_many_attempts');
  assert.equal(h.post({action:'lookup',idNo:'A123456789',name:'王小明'}).error,'too_many_attempts');
  const key=Object.keys(h.state.props).find(k=>k.startsWith('lookupfail:'));
  assert.ok(!key.includes('A123456789'));assert.equal(JSON.parse(h.state.props[key]).length,5);
  h.state.now+=900000;
  assert.deepEqual(h.post({action:'lookup',idNo:'A123456789',name:'王小明'}),{ok:true,certs:[]});assert.equal(h.state.locked,false);
});
test('active lookup lockout survives cache eviction',()=>{
  const h=harness();h.ctx.setup();
  const request={action:'lookup',idNo:'A123456789',name:'wrong'};
  for(let i=0;i<5;i++)h.post(request);
  h.state.cache.clear();
  assert.equal(h.post(request).error,'too_many_attempts');
  assert.equal(h.state.locked,false);
});
test('failed lookup prunes expired properties and timestamps without touching live lockouts or configuration',()=>{
  const h=harness();h.ctx.setup();const config={...h.state.props},now=h.state.now;
  h.state.props['lookupfail:expired']=JSON.stringify([now-900001,now-900000]);
  h.state.props['lookupfail:mixed']=JSON.stringify([now-900001,now-1]);
  h.state.props['lookupfail:locked']=JSON.stringify(Array(5).fill(now-1));
  const locked=h.state.props['lookupfail:locked'];
  assert.deepEqual(h.post({action:'lookup',idNo:'A123456789',name:'wrong'}),{ok:true,certs:[]});
  assert.equal(h.state.props['lookupfail:expired'],undefined);
  assert.deepEqual(JSON.parse(h.state.props['lookupfail:mixed']),[now-1]);
  assert.equal(h.state.props['lookupfail:locked'],locked);
  for(const [key,value] of Object.entries(config))assert.equal(h.state.props[key],value);
  assert.equal(h.state.propertyScans,1);
  assert.equal(h.state.locked,false);
});
test('property capacity fails closed before identity lookup and preserves active lockouts',()=>{
  const h=harness();h.ctx.setup();h.post({action:'submit',type:'E',answers});
  const wrong={action:'lookup',idNo:'A123456789',name:'wrong'};
  for(let i=0;i<5;i++)h.post(wrong);
  // Other script settings also consume the shared quota; each value is below 9 KB.
  for(let i=0;i<26;i++)h.state.props['other:'+i]='x'.repeat(8000);
  const before={...h.state.props};h.state.cache.clear();
  assert.equal(h.post(wrong).error,'too_many_attempts');
  assert.equal(h.post({action:'lookup',idNo:'A800000014',name:'unknown'}).error,'busy');
  const lockedKey=Object.keys(h.state.props).find(k=>k.startsWith('lookupfail:'));
  h.state.props[lockedKey]=JSON.stringify([h.state.now]);
  assert.equal(h.post({action:'lookup',idNo:answers['3'],name:answers['4']}).error,'busy');
  h.state.props[lockedKey]=before[lockedKey];
  assert.deepEqual(h.state.props,before);assert.equal(h.state.locked,false);
});
test('registry failure after form submit never returns success or logs personal data',()=>{
  const h=harness();h.ctx.setup();h.state.failWrite=true;
  assert.deepEqual(h.post({action:'submit',type:'E',answers}),{ok:false,error:'server_error'});
  assert.equal(h.state.submissions.length,1);assert.equal(h.state.locked,false);assert.deepEqual(h.state.logs,['Training API: server_error']);
});
test('malformed requests return JSON errors',()=>{
  const h=harness();assert.deepEqual(JSON.parse(h.ctx.doPost({postData:{contents:'!'}}).text),{ok:false,error:'invalid'});
  assert.equal(h.get({action:'form',type:'X'}).error,'invalid');assert.equal(h.get({action:'lookup',idNo:answers['3'],name:'王小明'}).error,'invalid');
});

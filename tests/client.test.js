const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function client() {
  const requests=[],elements=new Map();
  const context=vm.createContext({URL,URLSearchParams,
    window:{addEventListener(){}},location:{hash:'#c=RT-E-20261014-001&t=abcdefghijklmnop'},
    document:{getElementById:id=>{
      if(!elements.has(id))elements.set(id,{textContent:'',classList:{toggle(){}},replaceChildren(){}});
      return elements.get(id);
    }},
    fetch:async(url,options)=>{requests.push({url:new URL(url),options});return {ok:true,json:async()=>({ok:false,error:'invalid'})};}
  });
  vm.runInContext("const API_URL = 'https://api.invalid/exec?c=legacy&sid=reserved';",context);
  vm.runInContext(fs.readFileSync('common.js','utf8')+'\nglobalThis.ui=TrainingUI;',context);
  return {context,requests};
}
test('API transport never sends reserved c or sid query parameters, for GET or POST',async()=>{
  const {context,requests}=client();
  for(const [action,data,post] of [['form',{type:'E',c:'bad',sid:'bad'},false],['verify',{cert:'RT-E-20261014-001',token:'abcdefghijklmnop',c:'bad',sid:'bad'},false],['lookup',{idNo:'A123456789',name:'王小明'},true]]){
    await assert.rejects(context.ui.api(action,data,post));
  }
  assert.equal(requests.length,3);
  for(const {url} of requests){assert.equal(url.searchParams.has('c'),false);assert.equal(url.searchParams.has('sid'),false);}
  assert.equal(requests[1].url.searchParams.get('cert'),'RT-E-20261014-001');
  assert.equal(requests[1].url.searchParams.get('token'),'abcdefghijklmnop');
  assert.ok(!requests[2].url.href.includes('A123456789'));
});
test('badge fragment c/t becomes verify API cert/token without changing the fragment',async()=>{
  const {context,requests}=client();
  vm.runInContext(fs.readFileSync('badge.js','utf8')+'\nglobalThis.RealtekBadge=window.RealtekBadge;',context);
  vm.runInContext(fs.readFileSync('verify.js','utf8'),context);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(requests.length,1);
  assert.equal(requests[0].url.searchParams.get('action'),'verify');
  assert.equal(requests[0].url.searchParams.get('cert'),'RT-E-20261014-001');
  assert.equal(requests[0].url.searchParams.get('token'),'abcdefghijklmnop');
  assert.equal(requests[0].url.searchParams.has('c'),false);
  assert.equal(requests[0].url.searchParams.has('sid'),false);
  assert.equal(context.location.hash,'#c=RT-E-20261014-001&t=abcdefghijklmnop');
});

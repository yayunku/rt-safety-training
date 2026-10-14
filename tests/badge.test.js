const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const jsQR = require('jsqr');
const {cert} = require('./fixture.cjs');
const context = vm.createContext({window:{},URL,URLSearchParams});
vm.runInContext(fs.readFileSync('badge.js','utf8'),context);
const Badge = context.window.RealtekBadge;
const url = Badge.badgeUrl(cert,'https://example.test/training.html?type=E');

test('badge URL contains certificate credentials only and rejects malformed fragments',()=>{
  assert.equal(url,'https://example.test/badge.html#c=RT-E-20261014-001&t=abcdefghijklmnop');
  assert.equal(Badge.readHash('#c=bad&t=bad'),null);
  assert.equal(Badge.readHash(new URL(url).hash).c,cert.certNo);
});
test('vendored SVG QR raster decodes with jsqr to the exact certificate URL',()=>{
  const size=720,svg=Badge.qrSVG(url,size),pixels=new Uint8ClampedArray(size*size*4).fill(255);
  const segments=[...svg.matchAll(/M([\d.]+) ([\d.]+)h([\d.]+)v([\d.]+)h-[\d.]+z/g)];
  assert.ok(segments.length>100);
  for(const [,xs,ys,ws,hs] of segments){
    const x=Number(xs),y=Number(ys),w=Number(ws),h=Number(hs);
    for(let row=Math.ceil(y);row<y+h && row<size;row++)for(let col=Math.ceil(x);col<x+w && col<size;col++){
      const offset=(row*size+col)*4;pixels[offset]=0;pixels[offset+1]=64;pixels[offset+2]=94;
    }
  }
  assert.equal(jsQR(pixels,size,size)?.data,url);
});
test('SVG keeps type, status and escaped data; export omits valid pill and retains terminal statuses',()=>{
  for(const status of ['valid','expired','revoked']){
    const svg=Badge.renderSVG({...cert,status},{url,mode:'export'});
    assert.match(svg,/電子訓練合格證明/);assert.match(svg,/工程發包類/);assert.match(svg,/RT-E-20261014-001/);
    if(status==='valid')assert.doesNotMatch(svg,/>有效<\/text>/);
    else assert.ok(svg.includes(status==='expired'?'已過期':'已作廢'));
  }
  assert.match(Badge.renderSVG({...cert,type:'S'},{url}),/#34EBB7/);
  assert.match(Badge.renderSVG({...cert,name:'<script>bad</script>'},{url}),/&lt;script&gt;/);
  assert.match(Badge.pngFileName(cert),/有效至2027-10-14\.png$/);
});
function contrast(a,b) {
  const luminance = hex => {
    const rgb=hex.replace('#','').match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);
    return rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722;
  };
  const x=luminance(a),y=luminance(b);
  return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);
}
function attributes(svg,element,className) {
  const tag=[...svg.matchAll(new RegExp('<'+element+'\\b([^>]*)>','g'))].find(m=>m[1].includes('class="'+className+'"'));
  assert.ok(tag,element+'.'+className);
  return Object.fromEntries([...tag[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));
}
test('both types use S3 white cards and preserve their band and tint for all statuses and export modes',()=>{
  for(const type of ['E','S'])for(const status of ['valid','expired','revoked'])for(const mode of ['screen','export']){
    const svg=Badge.renderSVG({...cert,type,status},{url,mode});
    assert.equal(attributes(svg,'rect','cert-card').fill,'#FFFFFF');
    assert.equal(attributes(svg,'rect','cert-card').stroke,type==='S'?'#CFE3DC':'#C9DDEB');
    assert.equal(attributes(svg,'path','cert-band').fill,type==='S'?'#34EBB7':'#0078AF');
    assert.equal(attributes(svg,'text','cert-title').fill,type==='S'?'#053D30':'#FFFFFF');
    assert.equal(attributes(svg,'rect','cert-panel').fill,type==='S'?'#F1F7F5':'#EEF5FA');
    assert.doesNotMatch(svg,/<linearGradient/);
    assert.equal(Badge.WIDTH,300);assert.equal(Badge.HEIGHT,540);
    if(status==='valid' && mode==='export')assert.doesNotMatch(svg,/class="cert-status-pill"/);
    else assert.equal(attributes(svg,'rect','cert-status-pill').fill,status==='valid'?'#1A7F4B':'#C0392B');
  }
});
test('every rendered certificate text/background pair meets 4.5:1 for both types and all statuses',()=>{
  for(const type of ['E','S'])for(const status of ['valid','expired','revoked'])for(const mode of ['screen','export']){
    const svg=Badge.renderSVG({...cert,type,status},{url,mode});
    const panel=attributes(svg,'rect','cert-panel').fill;
    for(const [,raw] of svg.matchAll(/<text\b([^>]*)>/g)){
      const attr=Object.fromEntries([...raw.matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));
      const background=attr.class==='cert-title'?attributes(svg,'path','cert-band').fill
        :attr.class==='cert-note'?'#FFFFFF'
        :attr.class==='cert-status-label'?attributes(svg,'rect','cert-status-pill').fill:panel;
      assert.ok(contrast(attr.fill,background)>=4.5,`${type} ${status} ${mode} ${attr.class || 'hint'} ${attr.fill}/${background}`);
      assert.equal(attr['fill-opacity'],undefined);
    }
  }
});

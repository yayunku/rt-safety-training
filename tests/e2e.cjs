const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {chromium} = require('playwright-core');
const jsQR = require('jsqr');
const Core = require('../apps-script/Core.js');
const {fixture,answers,cert} = require('./fixture.cjs');
const consent = require('../consent.js');

(async () => {
  const root = path.resolve(__dirname,'..');
  const base = 'http://training.test';
  let browser, passed = 0;
  try {
    const cache = path.join(os.homedir(),'.cache/ms-playwright');
    const candidates = fs.readdirSync(cache).filter(n => /^chromium-\d+$/.test(n)).sort((a,b) => Number(b.split('-')[1])-Number(a.split('-')[1]));
    const executable = process.env.CHROMIUM_PATH || candidates.flatMap(n => ['chrome-linux/chrome','chrome-linux64/chrome'].map(p => path.join(cache,n,p))).find(p => fs.existsSync(p));
    assert.ok(executable,'Set CHROMIUM_PATH or install Chromium in ~/.cache/ms-playwright');
    browser = await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox']});
    const context = await browser.newContext({viewport:{width:375,height:812},serviceWorkers:'block'});
    const page = await context.newPage(); page.setDefaultTimeout(10000);
    await page.clock.install({time:new Date('2026-10-14T06:00:00Z')});
    const urls = [], requests = [], errors = [];
    page.on('request',request => urls.push(request.url())); page.on('pageerror',error => errors.push(error.message));
    let mode = 'normal', verifyStatus = 'valid', lookupMode = 'found';
    await page.route('**/*',async route => {
      const u = new URL(route.request().url());
      if (u.origin === base) {
        const name = u.pathname.slice(1) || 'index.html';
        if (!/^(?:assets\/)?[\w.-]+$/.test(name)) return route.fulfill({status:404,body:''});
        try {
          return route.fulfill({contentType:name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.png') ? 'image/png' : name.endsWith('.webp') ? 'image/webp' : 'text/html',body:fs.readFileSync(path.join(root,name))});
        } catch (_) {return route.fulfill({status:404,body:''});}
      }
      return route.abort();
    });
    await page.route('**/docs.google.com/**',route => route.abort());
    await page.route('**/script.google.com/**',route => route.abort());
    await page.route('**/config.js',route => route.fulfill({contentType:'text/javascript',body:"const API_URL = 'https://training-api.invalid/exec';"}));
    await page.route('https://training-api.invalid/**',async route => {
      const req = route.request(), u = new URL(req.url());
      assert.equal(u.searchParams.has('c'),false);assert.equal(u.searchParams.has('sid'),false);
      const data = req.method() === 'POST' ? JSON.parse(req.postData()) : Object.fromEntries(u.searchParams);
      requests.push({method:req.method(),data,headers:req.headers()});
      if (mode === 'network') return route.abort('failed');
      if (mode === 'malformed') return route.fulfill({contentType:'application/json',body:'{}'});
      let result;
      if (data.action === 'form') {
        assert.equal(await page.locator('#message').textContent(),'載入題目中⋯（首次載入可能需要 15 秒）');
        result = Core.publicForm(fixture(data.type));
        result.subtitle += data.type === 'E' ? ' (ex 一般作業、高風險作業等)' : '（ex 保全、清潔、供膳等）';
      }
      if (data.action === 'submit') {
        assert.equal(await page.locator('#next').isDisabled(),true);
        assert.equal(await page.locator('#message').textContent(),'送出中，約需 10–20 秒，請勿關閉頁面');
        const checked = Core.validateAnswers(fixture(data.type),data.answers,'2099-01-01',true);
        result = checked.ok ? {ok:true,cert:{...cert,type:data.type,certNo:cert.certNo.replace('-E-','-'+data.type+'-')}} : checked;
      }
      if (data.action === 'verify') {assert.match(data.cert,/^RT-[ES]-/);assert.equal(data.token,cert.token);}
      if (data.action === 'verify') result = {ok:true,cert:{...cert,certNo:data.cert,type:data.cert.split('-')[1],status:verifyStatus}};
      if (data.action === 'lookup') result = lookupMode === 'limited' ? {ok:false,error:'too_many_attempts'} : {ok:true,certs:lookupMode === 'found' ? [cert,{...cert,type:'S',certNo:'RT-S-20261014-001',status:'expired'}] : []};
      await route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
    });
    const check = async (name,fn) => {await fn(); passed++; console.log('PASS '+name);};
    const noOverflow = async () => {
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 375),'no horizontal scroll at 375px');
      assert.equal(await page.locator('.m-head .logo').getAttribute('alt'),'Realtek');
      assert.ok(await page.locator('.m-head .logo').evaluate(el=>el.complete && el.naturalWidth > 0));
      assert.equal(await page.locator('.m-head .site').textContent(),'承攬商安全衛生教育訓練');
    };
    // Use real pointer/keyboard input for the visible wizard fields.
    const select = async (id,value) => {const box = page.locator('[data-item-id="'+id+'"]'); await box.getByText(value,{exact:true}).click();};
    async function start(type) {
      await page.goto(base+'/index.html');await noOverflow();
      await page.locator('a[href="training.html?type='+type+'"]').click();
      await page.locator('#training-form:not([hidden])').waitFor();
      assert.equal(await page.locator('#page-title').textContent(),type === 'E' ? '工程發包類型承攬商專用版' : '勞務類型承攬商專用版');
      assert.equal(await page.locator('#subtitle').textContent(),type === 'E' ? '(ex 一般作業、高風險作業等)' : '（ex 保全、清潔、供膳等）');
      assert.equal(await page.locator('.hero,.hero-eyebrow,.hero-divider').count(),0);
      const heading = page.locator('.page-heading');
      assert.equal(await heading.evaluate(el=>getComputedStyle(el).textAlign),'left');
      assert.equal(await heading.evaluate(el=>getComputedStyle(el).paddingTop),'24px');
      assert.equal(await page.locator('#page-title').evaluate(el=>getComputedStyle(el).fontSize),'24px');
      const headingBox = await page.locator('#page-title').boundingBox();
      const cardBox = await page.locator('.step-card').first().boundingBox();
      assert.equal(headingBox.x,cardBox.x);
      assert.equal(headingBox.width,cardBox.width);
      assert.equal((await heading.boundingBox()).width,(await page.locator('#progress').boundingBox()).width);
      const requiredItems = fixture(type).sections.flatMap(section=>section.items).filter(item=>item.required);
      assert.equal(await page.locator('.required-mark').count(),requiredItems.length);
      for (const item of requiredItems) {
        const mark = page.locator('[data-item-id="'+item.id+'"] legend .required-mark');
        assert.equal(await mark.textContent(),' *');
        assert.equal(await mark.evaluate(el=>getComputedStyle(el).color),'rgb(192, 57, 43)');
      }
      assert.equal(await page.locator('#consent-text').textContent(),consent);
      for (const id of ['2','3','4','5']) assert.equal(await page.locator('[data-item-id="'+id+'"] input').isDisabled(),true);
      assert.equal(await page.locator('#next').isDisabled(),true);
      await select('1','我同意');
      for (const id of ['2','3','4','5']) await page.locator('[data-item-id="'+id+'"] input').fill(answers[id]);
      await noOverflow(); await page.locator('#next').click();
      await page.locator('[data-item-id="6"] input').fill('2026-10-14');
      assert.equal(await page.locator('iframe').getAttribute('src'),'https://www.youtube.com/embed/8A8QaiF10XM');
    }
    async function quiz() {
      await select('8','是');await select('9','是');await page.locator('#next').click();
      await select('10','正確');await select('11','錯誤');
    }
    await check('landing A1 banner, official logo, responsive choices and sticky footer',async () => {
      for (const viewport of [{width:1280,height:900},{width:390,height:844},{width:375,height:812}]) {
        await page.setViewportSize(viewport);await page.goto(base+'/index.html');
        const logo = page.locator('.m-head .logo');
        assert.equal(await logo.getAttribute('src'),'assets/realtek-logo.png');
        assert.ok(await logo.evaluate(el=>el.complete && el.naturalWidth > 0));
        assert.equal((await logo.boundingBox()).height,30);
        const banner = page.locator('.a1-banner');
        assert.match(await banner.evaluate(el=>getComputedStyle(el).backgroundImage),/assets\/hero\.webp/);
        assert.equal(await banner.evaluate(el=>getComputedStyle(el).backgroundPosition),'70% 34%');
        assert.equal((await banner.boundingBox()).height,viewport.width >= 768 ? 300 : 200);
        const header = await page.locator('.m-head').boundingBox();
        assert.equal((await banner.boundingBox()).y,header.y + header.height);
        assert.equal(await page.locator('h1').textContent(),'承攬商安全衛生教育訓練');
        assert.equal(await page.locator('.lead').textContent(),'每位入廠承攬商作業人員，皆須完成個人線上訓練與考試。');
        assert.equal(await page.locator('.c-steps li').count(),3);
        const buttons = page.locator('.c-btn');assert.equal(await buttons.count(),3);
        const first = await buttons.nth(0).boundingBox();
        for (let i=1;i<3;i++) {
          const box = await buttons.nth(i).boundingBox();
          if (viewport.width >= 768) { assert.equal(box.y,first.y);assert.ok(box.x > first.x);assert.ok(Math.abs(box.width-first.width)<1); }
          else { assert.equal(box.x,first.x);assert.ok(box.y >= first.y+first.height); }
        }
        const footer = await page.locator('.m-foot').boundingBox();
        assert.ok(Math.abs(footer.y + footer.height - viewport.height) <= 1);
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth));
      }
      await noOverflow();
      assert.equal(await page.locator('.c-btn.s').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(52, 235, 183)');
      assert.equal(await page.locator('.c-btn.s').evaluate(el=>getComputedStyle(el).color),'rgb(5, 61, 48)');
    });
    await check('landing → E; consent locks fields; gate 否 blocks; wrong answers flagged in place',async () => {
      await start('E');await select('8','否');await select('9','是');await page.locator('#next').click();
      assert.equal(await page.locator('[data-item-id="8"]').isVisible(),true);assert.match(await page.locator('#message').textContent(),/選擇「是」/);
      await select('8','是');await select('9','否');await page.locator('#next').click();
      assert.equal(await page.locator('[data-item-id="9"]').isVisible(),true);
      await quiz();await select('10','錯誤');await page.locator('#next').click();
      await page.locator('[data-item-id="10"].wrong').waitFor();
      assert.match(await page.locator('[data-item-id="10"] .field-error').textContent(),/答錯/);
      assert.equal(await page.locator('#success').isHidden(),true);await noOverflow();
    });
    let badgeURL;
    await check('passing certificate QR decodes to c/t only; PNG and print retain certificate design',async () => {
      await select('10','正確');await page.locator('#next').click();await page.locator('#success:not([hidden])').waitFor();
      assert.equal(await page.locator('.badge-actions').getByText('下載 PNG').count(),1);
      badgeURL = await page.locator('.badge-actions a').getAttribute('href');
      assert.match(badgeURL, /\/badge\.html#c=RT-E-20261014-001&t=abcdefghijklmnop$/);
      const raster = await page.locator('.badge-qr svg').evaluate(async svg => {
        const img = new Image();img.src = 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(svg));await img.decode();
        const canvas = document.createElement('canvas');canvas.width = canvas.height = 720;const ctx = canvas.getContext('2d');ctx.drawImage(img,0,0,720,720);return Array.from(ctx.getImageData(0,0,720,720).data);
      });
      const decoded = jsQR(new Uint8ClampedArray(raster),720,720);assert.ok(decoded);assert.equal(decoded.data,badgeURL);
      const exported = await page.evaluate(async cert => {
        const svg = RealtekBadge.renderSVG(cert,{mode:'export'});
        const blob = await RealtekBadge.svgToPNGBlob(svg,2);
        const img = await createImageBitmap(blob);
        return {svg,width:img.width,height:img.height,size:blob.size};
      },cert);
      assert.equal(exported.width,600);assert.equal(exported.height,1080);assert.ok(exported.size > 10000);assert.doesNotMatch(exported.svg,/>有效<\/text>/);assert.match(exported.svg,/電子訓練合格證明/);
      const download = page.waitForEvent('download');await page.getByRole('button',{name:'下載 PNG'}).click();assert.match((await download).suggestedFilename(),/電子訓練合格證明/);
      await page.getByRole('button',{name:'列印',exact:true}).click();
      const frame = page.frameLocator('#badge-print-frame');await frame.locator('svg').waitFor({state:'attached'});assert.equal(await frame.locator('text').filter({hasText:/^有效$/}).count(),0);
      await noOverflow();
    });
    await check('landing → S uses the S3 white card with mint band and dark ink',async () => {
      await start('S');await quiz();await page.locator('#next').click();await page.locator('#success:not([hidden])').waitFor();
      assert.match(await page.locator('.badge-preview').textContent(),/勞務類/);
      assert.equal(await page.locator('.badge-preview .cert-band').getAttribute('fill'),'#34EBB7');
      assert.equal(await page.locator('.badge-preview .cert-title').getAttribute('fill'),'#053D30');
      assert.equal(await page.locator('.badge-preview .cert-card').getAttribute('fill'),'#FFFFFF');
      assert.equal(await page.locator('.badge-preview .cert-panel').getAttribute('fill'),'#F1F7F5');
      assert.equal(await page.locator('#success .cert-status').count(),0);
      assert.equal(await page.locator('#success .badge-actions a').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(52, 235, 183)');
      assert.equal(await page.locator('#success .badge-actions a').evaluate(el=>getComputedStyle(el).color),'rgb(5, 61, 48)');
      await noOverflow();
    });
    await check('badge verification valid / expired / revoked and export status',async () => {
      for (const [status,label] of [['valid','有效'],['expired','已過期'],['revoked','已作廢']]) {
        verifyStatus = status;await page.goto('about:blank');await page.goto(badgeURL);await page.locator('.cert-status-label').waitFor();assert.equal(await page.locator('.cert-status-label').textContent(),label);
        assert.equal(await page.locator('.cert-status').count(),0);
        assert.equal(await page.getByRole('link',{name:'開啟合格證明',exact:true}).count(),0);
        assert.equal(await page.getByRole('button',{name:'下載 PNG',exact:true}).count(),1);
        assert.equal(await page.getByRole('button',{name:'列印',exact:true}).count(),1);
        const svg = await page.evaluate(cert => RealtekBadge.renderSVG(cert,{mode:'export'}),{...cert,status});
        if (status === 'valid') assert.doesNotMatch(svg,/>有效<\/text>/);else assert.ok(svg.includes('>'+label+'</text>'));
        await noOverflow();
      }
    });
    await check('lookup found / not found / too_many_attempts and no ID in URLs',async () => {
      await page.goto(base+'/lookup.html');
      assert.equal(await page.locator('.page-heading h1').textContent(),'查詢合格證明');
      assert.equal(await page.locator('.page-heading').evaluate(el=>getComputedStyle(el).textAlign),'left');
      assert.equal(await page.locator('.hero,.hero-eyebrow,.hero-divider').count(),0);
      await noOverflow();await page.locator('#idNo').fill(answers['3']);await page.locator('#name').fill('王小明');
      await page.getByRole('button',{name:'查詢',exact:true}).click();await page.locator('.certificate').first().waitFor();assert.equal(await page.locator('.certificate').count(),2);
      assert.equal(await page.locator('.certificate[data-type="S"] .cert-band').getAttribute('fill'),'#34EBB7');
      assert.equal(await page.locator('.certificate[data-type="S"] .badge-actions a').evaluate(el=>getComputedStyle(el).color),'rgb(5, 61, 48)');
      await noOverflow();
      assert.equal(await page.locator('#results .cert-status').count(),0);
      assert.deepEqual(await page.locator('#results .cert-status-label').allTextContents(),['有效','已過期']);
      for (const width of [1280,390]) {
        await page.setViewportSize({width,height:844});
        const cards = page.locator('#results .certificate');
        const first = await cards.nth(0).boundingBox(), second = await cards.nth(1).boundingBox();
        if (width >= 768) { assert.equal(first.y,second.y); assert.ok(second.x >= first.x + first.width); }
        else { assert.equal(first.x,second.x); assert.ok(second.y >= first.y + first.height); }
        for (let i=0;i<2;i++) {
          const preview = await cards.nth(i).locator('.badge-preview').boundingBox();
          const link = cards.nth(i).getByRole('link',{name:'開啟合格證明',exact:true});
          assert.ok((await link.boundingBox()).y >= preview.y + preview.height);
        }
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth));
      }
      await page.setViewportSize({width:375,height:812});
      lookupMode = 'none';await page.getByRole('button',{name:'查詢',exact:true}).click();await page.getByText('查無資料',{exact:true}).waitFor();assert.equal(await page.locator('.certificate').count(),0);
      lookupMode = 'limited';await page.getByRole('button',{name:'查詢',exact:true}).click();await page.getByText(/查詢失敗次數過多/).waitFor();await noOverflow();
    });
    await check('network/API failures never show success; form retry and badge clearing',async () => {
      await start('E');await quiz();mode = 'network';await page.locator('#next').click();await page.getByText(/連線失敗/).waitFor();assert.equal(await page.locator('#success').isHidden(),true);assert.equal(await page.locator('.certificate').count(),0);
      mode = 'malformed';await page.locator('#next').click();await page.getByText(/系統暫時無法完成/).waitFor();assert.equal(await page.locator('#success').isHidden(),true);
      mode = 'network';await page.goto(base+'/training.html?type=E');await page.locator('#retry:not([hidden])').waitFor();assert.equal(await page.locator('#training-form').isHidden(),true);
      mode = 'normal';await page.locator('#retry').click();await page.locator('#training-form:not([hidden])').waitFor();
      mode = 'network';await page.goto(badgeURL);await page.locator('#retry:not([hidden])').waitFor();assert.equal(await page.locator('.certificate').count(),0);await noOverflow();
    });
    await check('placeholder config is explicit, URL privacy and simple POST contract',async () => {
      await page.unroute('**/config.js');await page.route('**/config.js',route => route.fulfill({contentType:'text/javascript',body:"const API_URL = 'REPLACE_WITH_APPS_SCRIPT_WEB_APP_URL';"}));await page.goto(base+'/lookup.html');await page.getByText('尚未設定後端',{exact:true}).waitFor();
      for (const url of urls) {assert.equal(new URL(url).searchParams.has('c'),false);assert.equal(new URL(url).searchParams.has('sid'),false);assert.ok(!decodeURIComponent(url).includes(answers['3']),url);assert.ok(!decodeURIComponent(url).includes('王小明'),url);}
      for (const request of requests.filter(r => r.method === 'POST')) assert.equal(request.headers['content-type'],'text/plain;charset=utf-8');
      assert.ok(requests.some(r => r.data.action === 'submit' && r.data.type === 'E'));
      assert.ok(requests.some(r => r.data.action === 'submit' && r.data.type === 'S'));
      assert.deepEqual(errors,[]);
    });
    console.log(`E2E: ${passed} passed, 0 failed (Chromium; 375px; all external requests intercepted)`);
  } finally { if (browser) await browser.close(); }
})().catch(err => {console.error('E2E: FAILED — ' + err.message);process.exitCode = 1;});

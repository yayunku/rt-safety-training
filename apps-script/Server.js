const REGISTRY_HEADERS = ['證號','類型','公司統編','公司名稱','姓名','身分證(遮蔽)','查詢雜湊','發證時間','有效期限','表單回應ID','作廢','作廢原因'];
const TYPE_NAMES = {E:'工程發包', S:'勞務'};
const FORM_CACHE_SECONDS = 7200;

function setup() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const props = PropertiesService.getScriptProperties();
    if (!props.getProperty('HMAC_SECRET')) props.setProperty('HMAC_SECRET', Utilities.getUuid() + Utilities.getUuid());
    if (!props.getProperty('REGISTRY_SHEET_ID')) {
      const book = SpreadsheetApp.create('承攬商電子訓練合格證明登記表');
      book.setSpreadsheetTimeZone('Asia/Taipei');
      const sheet = book.getSheets()[0];
      sheet.setName('登記表');
      sheet.getRange(1, 1, 1, REGISTRY_HEADERS.length).setValues([REGISTRY_HEADERS]);
      sheet.setFrozenRows(1);
      sheet.getRange(2, 11, sheet.getMaxRows() - 1, 1).insertCheckboxes();
      props.setProperty('REGISTRY_SHEET_ID', book.getId());
    }
    const installed = ScriptApp.getProjectTriggers().some(trigger =>
      trigger.getHandlerFunction() === 'warmFormCache' && trigger.getEventType() === ScriptApp.EventType.CLOCK);
    if (!installed) ScriptApp.newTrigger('warmFormCache').timeBased().everyHours(1).create();
  } finally { lock.releaseLock(); }
}

function clearFormCache() {
  CacheService.getScriptCache().removeAll(['form:E','form:S','form-private:E','form-private:S']);
  warmFormCache();
}

function warmFormCache() {
  let failed = false;
  for (const type of ['E','S']) {
    try { rebuildFormCaches_(type,property_('FORM_ID_' + type)); }
    catch (_) {
      // Still warm the other type; never log a private model or raw service exception.
      console.error('Form cache warm failed: ' + type);
      failed = true;
    }
  }
  if (failed) throw new Error('form_cache_warm_failed');
}

function property_(key) {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  if (!value) throw new Error('not_configured');
  return value;
}
function requireType_(type) {
  if (!Object.prototype.hasOwnProperty.call(TYPE_NAMES, type)) throw new Error('invalid');
}
function hmac_(secret, message) {
  return Utilities.computeHmacSha256Signature(message, secret, Utilities.Charset.UTF_8);
}
function json_(fn) {
  let result;
  try { result = fn(); }
  catch (err) {
    const known = ['invalid','not_configured','form_misconfigured','sequence_exhausted','busy'];
    const error = known.includes(err.message) ? err.message : 'server_error';
    // Exception messages from FormApp can contain submitted values. Log only the safe code.
    console.error('Training API: ' + error);
    result = {ok:false,error};
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}
function doGet(e) {
  return json_(() => {
    const p = e && e.parameter || {};
    if (p.action === 'form') return formAction_(p.type);
    if (p.action === 'verify') return verify_(p.cert, p.token);
    throw new Error('invalid');
  });
}
function doPost(e) {
  return json_(() => {
    let body;
    try { body = JSON.parse(e.postData.contents); } catch (_) { throw new Error('invalid'); }
    if (!body || typeof body !== 'object') throw new Error('invalid');
    if (body.action === 'submit') return submit_(body.type, body.answers);
    if (body.action === 'lookup') return lookup_(body.idNo, body.name);
    throw new Error('invalid');
  });
}
function cachedFormModel_(key, id) {
  const cached = CacheService.getScriptCache().get(key);
  if (!cached) return null;
  try {
    const entry = JSON.parse(cached);
    return entry.id === id ? entry.model : null;
  } catch (_) { return null; }
}
function cacheFormModel_(key, id, model) {
  const cache = CacheService.getScriptCache(), serialized = JSON.stringify({id,model});
  // CacheService has a 100 KB per-entry limit; larger models still work uncached.
  if (Utilities.newBlob(serialized).getBytes().length < 95000) cache.put(key,serialized,FORM_CACHE_SECONDS);
  else cache.removeAll([key]);
}
function rebuildFormCaches_(type, id) {
  const privateModel = readForm_(type,FormApp.openById(id));
  const publicModel = TrainingCore.publicForm(privateModel);
  cacheFormModel_('form-private:' + type,id,privateModel);
  cacheFormModel_('form:' + type,id,publicModel);
  return publicModel;
}
function formAction_(type) {
  requireType_(type);
  const id = property_('FORM_ID_' + type);
  const model = cachedFormModel_('form:' + type,id);
  // Sanitize even cache hits: only this explicit allowlist can leave the form endpoint.
  return model ? TrainingCore.publicForm(model) : rebuildFormCaches_(type,id);
}
function readForm_(type, form, includeVideos = true, sources) {
  const model = {type,title:form.getTitle(),subtitle:'',sections:[{title:'基本資料',description:form.getDescription(),items:[]}]};
  let section = model.sections[0], videos;
  for (const raw of sources || form.getItems()) {
    const kind = String(raw.getType());
    if (kind === 'PAGE_BREAK') {
      const page = raw.asPageBreakItem();
      section = {title:page.getTitle(),description:page.getHelpText(),items:[]};
      model.sections.push(section); continue;
    }
    if (kind === 'IMAGE') { if (!model.subtitle) model.subtitle = raw.asImageItem().getTitle(); continue; }
    const adapters = {TEXT:['text','asTextItem'],PARAGRAPH_TEXT:['text','asParagraphTextItem'],DATE:['date','asDateItem'],MULTIPLE_CHOICE:['radio','asMultipleChoiceItem'],CHECKBOX:['checkbox','asCheckboxItem'],LIST:['radio','asListItem'],VIDEO:['video','asVideoItem'],SECTION_HEADER:['header','asSectionHeaderItem']};
    if (!adapters[kind]) throw new Error('form_misconfigured');
    const [publicKind, method] = adapters[kind], source = raw[method]();
    const item = {id:String(source.getId()),sourceType:kind,kind:publicKind,title:source.getTitle(),help:source.getHelpText(),required:typeof source.isRequired === 'function' && source.isRequired(),graded:false};
    if (typeof source.getPoints === 'function') item.graded = source.getPoints() > 0;
    if (['radio','checkbox'].includes(publicKind)) {
      const choices = source.getChoices();
      item.options = choices.map(c => c.getValue());
      if (item.graded) item.correct = choices.filter(c => c.isCorrectAnswer()).map(c => c.getValue());
      if (typeof source.hasOtherOption === 'function' && source.hasOtherOption()) throw new Error('form_misconfigured');
    }
    if (publicKind === 'video' && includeVideos) {
      if (!videos) videos = TrainingCore.videoIds(UrlFetchApp.fetch(form.getPublishedUrl()).getContentText());
      item.youtubeId = videos[item.id];
      if (!item.youtubeId) throw new Error('form_misconfigured');
    }
    item.role = TrainingCore.roleOf(item);
    section.items.push(item);
  }
  return TrainingCore.checkForm(model);
}
function registry_() {
  const sheet = SpreadsheetApp.openById(property_('REGISTRY_SHEET_ID')).getSheetByName('登記表');
  if (!sheet || JSON.stringify(sheet.getRange(1, 1, 1, 12).getValues()[0]) !== JSON.stringify(REGISTRY_HEADERS)) throw new Error('not_configured');
  return sheet;
}
function records_(sheet) {
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 12).getValues().filter(r => r[0]).map(r => ({
    certNo:String(r[0]),type:r[1] === '工程發包' ? 'E' : 'S',taxId:String(r[2]),company:String(r[3]),name:String(r[4]),maskedId:String(r[5]),lookupHash:String(r[6]),
    issuedAt:r[7] instanceof Date ? TrainingCore.taipeiDateTime(r[7]) : String(r[7]),
    expiresOn:r[8] instanceof Date ? TrainingCore.taipeiDate(r[8]) : String(r[8]),revoked:r[10] === true
  }));
}
function certificate_(row, secret, now) {
  return {certNo:row.certNo,token:TrainingCore.tokenFor(secret,row.certNo,hmac_),type:row.type,company:row.company,name:row.name,maskedId:row.maskedId,issuedAt:row.issuedAt,expiresOn:row.expiresOn,status:TrainingCore.statusOf(row,TrainingCore.taipeiDate(now))};
}
function submit_(type, answers) {
  requireType_(type);
  const id = property_('FORM_ID_' + type);
  let model = cachedFormModel_('form-private:' + type,id), form, sources;
  if (!model) {
    form = FormApp.openById(id);
    sources = form.getItems();
    model = readForm_(type,form,false,sources);
    cacheFormModel_('form-private:' + type,id,model);
  }
  const checked = TrainingCore.validateAnswers(model, answers, TrainingCore.taipeiDate(new Date()), true);
  if (!checked.ok) return checked;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('busy');
  try {
    const now = new Date(), sheet = registry_(), secret = property_('HMAC_SECRET');
    const certNo = TrainingCore.nextCertNo(type, TrainingCore.taipeiDate(now), records_(sheet));
    form = form || FormApp.openById(id);
    sources = sources || form.getItems();
    const byId = new Map(sources.map(source => [String(source.getId()),source]));
    let response = form.createResponse();
    for (const item of TrainingCore.itemsOf(model)) {
      const value = checked.answers[item.id];
      if (value === undefined || value === '' || (Array.isArray(value) && !value.length)) continue;
      const source = byId.get(item.id);
      if (!source) throw new Error('form_misconfigured');
      const converters = {TEXT:'asTextItem',PARAGRAPH_TEXT:'asParagraphTextItem',DATE:'asDateItem',MULTIPLE_CHOICE:'asMultipleChoiceItem',CHECKBOX:'asCheckboxItem',LIST:'asListItem'};
      const typed = source[converters[item.sourceType]]();
      const answer = item.kind === 'date' ? new Date(value + 'T12:00:00+08:00') : value;
      response = response.withItemResponse(typed.createResponse(answer));
    }
    const f = checked.fields;
    const row = {certNo,type,company:f.company,name:f.name,maskedId:TrainingCore.maskId(f.nationalId),issuedAt:TrainingCore.taipeiDateTime(now),expiresOn:TrainingCore.expiryOf(TrainingCore.taipeiDate(now)),revoked:false};
    const hash = TrainingCore.lookupHash(secret,f.nationalId,f.name,hmac_);
    const submitted = response.submit();
    const rowNo = sheet.getLastRow() + 1;
    if (rowNo > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 1);
    // Plain text formatting preserves leading zeros and prevents user values becoming formulas.
    const text = value => String(value).startsWith('=') ? "'" + value : String(value);
    sheet.getRange(rowNo, 1, 1, 10).setNumberFormat('@').setValues([[certNo,TYPE_NAMES[type],f.taxId,text(f.company),text(f.name),row.maskedId,hash,row.issuedAt,row.expiresOn,submitted.getId()]]);
    sheet.getRange(rowNo, 11).insertCheckboxes().setValue(false);
    SpreadsheetApp.flush();
    return {ok:true,cert:certificate_(row,secret,now)};
  } finally { lock.releaseLock(); }
}
function lookup_(idNo, name) {
  if (typeof idNo !== 'string' || typeof name !== 'string' || !TrainingCore.validId(idNo) || !TrainingCore.normalizeName(name)) throw new Error('invalid');
  const secret = property_('HMAC_SECRET'), props = PropertiesService.getScriptProperties();
  const key = 'lookupfail:' + TrainingCore.attemptHash(secret,idNo,hmac_);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('busy');
  try {
    const now = new Date(), ms = now.getTime();
    const stored = props.getProperty(key);
    const attempts = (stored ? JSON.parse(stored) : []).filter(time => time > ms - 900000);
    if (attempts.length >= 5) return {ok:false,error:'too_many_attempts'};
    const pending = JSON.stringify(attempts.concat(ms));
    const properties = props.getProperties();
    for (const storedKey of Object.keys(properties)) {
      if (!storedKey.startsWith('lookupfail:')) continue;
      const active = JSON.parse(properties[storedKey]).filter(time => time > ms - 900000);
      if (!active.length) {
        props.deleteProperty(storedKey);
        delete properties[storedKey];
      } else {
        const pruned = JSON.stringify(active);
        if (pruned !== properties[storedKey]) props.setProperty(storedKey,pruned);
        properties[storedKey] = pruned;
      }
    }
    // Reserve room before checking identity, so saturation cannot permit uncounted guesses.
    // Count all properties with JSON overhead and leave ample room below the 500 KB quota.
    properties[key] = pending;
    if (Utilities.newBlob(JSON.stringify(properties)).getBytes().length > 200 * 1024) throw new Error('busy');
    const hash = TrainingCore.lookupHash(secret,idNo,name,hmac_);
    const found = TrainingCore.latestPerType(records_(registry_()).filter(r => r.lookupHash === hash));
    if (!found.length) {
      attempts.push(ms);
      props.setProperty(key,pending);
      if (attempts.length >= 5) return {ok:false,error:'too_many_attempts'};
    }
    return {ok:true,certs:found.map(r => certificate_(r,secret,now))};
  } finally { lock.releaseLock(); }
}
function verify_(certNo, token) {
  if (typeof certNo !== 'string' || !/^RT-[ES]-\d{8}-\d{3}$/.test(certNo)) throw new Error('invalid');
  const secret = property_('HMAC_SECRET');
  if (!TrainingCore.equalToken(token,TrainingCore.tokenFor(secret,certNo,hmac_))) throw new Error('invalid');
  const row = records_(registry_()).find(r => r.certNo === certNo);
  if (!row) throw new Error('invalid');
  return {ok:true,cert:certificate_(row,secret,new Date())};
}

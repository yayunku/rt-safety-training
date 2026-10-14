/* Pure logic. core.js is the identical browser copy; tests enforce parity. */
var TrainingCore = (() => {
  'use strict';
  const letters = { A:10,B:11,C:12,D:13,E:14,F:15,G:16,H:17,I:34,J:18,K:19,L:20,M:21,N:22,O:35,P:23,Q:24,R:25,S:26,T:27,U:28,V:29,W:32,X:30,Y:31,Z:33 };
  const normalizeId = value => String(value || '').trim().toUpperCase();
  const normalizeName = value => String(value || '').normalize('NFKC').replace(/\s/g, '').toUpperCase();
  function validId(value) {
    const s = normalizeId(value);
    if (!/^[A-Z](?:[1289]|[A-D])\d{8}$/.test(s)) return false;
    const first = letters[s[0]];
    const rest = /[A-D]/.test(s[1]) ? String(letters[s[1]] % 10) + s.slice(2) : s.slice(1);
    return (Math.floor(first / 10) + first % 10 * 9 + [...rest].reduce((sum, d, i) => sum + Number(d) * Math.max(8 - i, 1), 0)) % 10 === 0;
  }
  function validTaxId(value) {
    const s = String(value || '').trim();
    if (!/^\d{8}$/.test(s)) return false;
    const sum = [...s].reduce((n, d, i) => {
      const p = Number(d) * [1,2,1,2,1,2,4,1][i];
      return n + Math.floor(p / 10) + p % 10;
    }, 0);
    return sum % 5 === 0 || (s[6] === '7' && (sum + 1) % 5 === 0);
  }
  const taipeiDateTime = now => new Date(new Date(now).getTime() + 28800000).toISOString().slice(0, 23) + '+08:00';
  const taipeiDate = now => taipeiDateTime(now).slice(0, 10);
  function validDate(s, today) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const date = new Date(s + 'T00:00:00Z');
    return !isNaN(date) && date.toISOString().slice(0, 10) === s && (!today || s <= today);
  }
  function expiryOf(date) {
    const d = new Date(date.slice(0, 10) + 'T00:00:00Z');
    d.setUTCFullYear(d.getUTCFullYear() + 1);
    return d.toISOString().slice(0, 10);
  }
  const maskId = value => { const s = normalizeId(value); return s.slice(0, 3) + '****' + s.slice(-3); };
  const statusOf = (cert, today) => cert.revoked === true ? 'revoked' : today > cert.expiresOn ? 'expired' : 'valid';
  function nextCertNo(type, day, records) {
    if (!['E', 'S'].includes(type) || !validDate(day)) throw new Error('invalid');
    const prefix = 'RT-' + type + '-' + day.replace(/-/g, '') + '-';
    const max = records.reduce((n, r) => r.certNo.startsWith(prefix) ? Math.max(n, Number(r.certNo.slice(prefix.length)) || 0) : n, 0);
    if (max >= 999) throw new Error('sequence_exhausted');
    return prefix + String(max + 1).padStart(3, '0');
  }
  function latestPerType(records) {
    const latest = {};
    records.forEach(r => {
      const old = latest[r.type];
      if (!old || Date.parse(r.issuedAt) > Date.parse(old.issuedAt) || (Date.parse(r.issuedAt) === Date.parse(old.issuedAt) && r.certNo > old.certNo)) latest[r.type] = r;
    });
    return ['E','S'].filter(t => latest[t]).map(t => latest[t]);
  }
  function base64url(bytes) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let bits = 0, value = 0, out = '';
    bytes.forEach(b => {
      value = (value << 8) | (b & 255); bits += 8;
      while (bits >= 6) { bits -= 6; out += alphabet[(value >>> bits) & 63]; }
    });
    if (bits) out += alphabet[(value << (6 - bits)) & 63];
    return out;
  }
  // HMAC is injected: Utilities in GAS, node:crypto in tests. No secret is shipped to the browser.
  const tokenFor = (secret, certNo, hmac) => base64url(hmac(secret, certNo)).slice(0, 16);
  const lookupHash = (secret, id, name, hmac) => base64url(hmac(secret, normalizeId(id) + '\n' + normalizeName(name)));
  const attemptHash = (secret, id, hmac) => base64url(hmac(secret, normalizeId(id)));
  function equalToken(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    let diff = a.length ^ b.length;
    for (let i = 0; i < b.length; i++) diff |= (a.charCodeAt(i) || 0) ^ b.charCodeAt(i);
    return diff === 0;
  }
  function roleOf(item) {
    const title = item.title;
    if (title.includes('個人資料提供同意書')) return 'consent';
    if (title.includes('統編')) return 'taxId';
    if (title.includes('身分證')) return 'nationalId';
    if (title.includes('姓名')) return 'name';
    if (title.includes('公司名稱')) return 'company';
    if (item.kind === 'date') return 'watchDate';
    if (!item.graded && item.kind === 'radio' && item.options.length === 2 && item.options.includes('是') && item.options.includes('否')) return 'gate';
    return item.graded ? 'quiz' : 'other';
  }
  const itemsOf = form => form.sections.flatMap(s => s.items);
  function checkForm(form) {
    const items = itemsOf(form);
    for (const role of ['consent','taxId','nationalId','name','company']) {
      const found = items.filter(i => i.role === role);
      if (found.length !== 1 || found[0].kind !== (role === 'consent' ? 'checkbox' : 'text')) throw new Error('form_misconfigured');
    }
    if (!form.sections[0].items.some(i => i.role === 'consent')) throw new Error('form_misconfigured');
    for (const item of items.filter(i => i.graded)) {
      if (!['radio','checkbox'].includes(item.kind) || !item.correct || !item.correct.length) throw new Error('form_misconfigured');
    }
    return form;
  }
  function publicForm(form) {
    return { ok:true, type:form.type, title:form.title, subtitle:form.subtitle,
      sections:form.sections.map(section => ({ title:section.title, description:section.description,
        items:section.items.map(item => {
          const out = {};
          ['id','kind','title','help','required','youtubeId','graded','role'].forEach(k => { if (item[k] !== undefined) out[k] = item[k]; });
          if (item.options) out.options = item.options.map(String);
          return out;
        }) })) };
  }
  function validateAnswers(form, answers, today, grade) {
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return {ok:false,error:'invalid'};
    const fields = {}, normalized = {};
    for (const item of itemsOf(form)) {
      if (!['text','date','radio','checkbox'].includes(item.kind)) continue;
      let value = Object.prototype.hasOwnProperty.call(answers, item.id) ? answers[item.id] : item.kind === 'checkbox' ? [] : '';
      const required = item.required || item.graded || ['consent','taxId','nationalId','name','company','gate'].includes(item.role);
      const fail = error => ({ok:false,error,fields:[item.id]});
      if (item.kind === 'checkbox') {
        if (!Array.isArray(value) || value.some(v => typeof v !== 'string' || !item.options.includes(v)) || new Set(value).size !== value.length) return fail('invalid');
        if (required && !value.length) return fail(item.role === 'consent' ? 'consent' : 'required');
      } else {
        if (typeof value !== 'string') return fail('invalid');
        if (item.kind === 'text') value = value.trim();
        if (required && !value) return fail('required');
        if (item.kind === 'radio' && value && !item.options.includes(value)) return fail('invalid');
      }
      if (item.role === 'nationalId') { value = normalizeId(value); if (!validId(value)) return fail('nationalId'); }
      if (item.role === 'taxId' && !validTaxId(value)) return fail('taxId');
      if (item.role === 'name' && !normalizeName(value)) return fail('required');
      if (item.kind === 'date' && value && !validDate(value, today)) return fail('watchDate');
      if (item.role === 'gate' && value !== '是') return fail('gate');
      fields[item.role] = value;
      normalized[item.id] = value;
    }
    if (grade) {
      const wrong = itemsOf(form).filter(i => i.graded).filter(i => {
        const actual = Array.isArray(normalized[i.id]) ? normalized[i.id] : [normalized[i.id]];
        return actual.length !== i.correct.length || actual.some(a => !i.correct.includes(a));
      }).map(i => i.id);
      if (wrong.length) return {ok:false,error:'quiz',wrong};
    }
    return {ok:true,fields,answers:normalized};
  }
  function videoIds(html) {
    const match = html.match(/FB_PUBLIC_LOAD_DATA_\s*=\s*(\[[\s\S]*?\]);\s*(?:<\/script>|$)/);
    if (!match) throw new Error('form_misconfigured');
    const data = JSON.parse(match[1]), result = {};
    const walk = node => {
      if (!Array.isArray(node)) return;
      if (node[3] === 12 && node[6] && typeof node[6][3] === 'string') {
        const id = node[6][3];
        if (!/^[A-Za-z0-9_-]{11}$/.test(id)) throw new Error('form_misconfigured');
        result[String(node[0])] = id;
      } else node.forEach(walk);
    };
    walk(data); return result;
  }
  return {normalizeId,normalizeName,validId,validTaxId,taipeiDateTime,taipeiDate,validDate,expiryOf,maskId,statusOf,nextCertNo,latestPerType,base64url,tokenFor,lookupHash,attemptHash,equalToken,roleOf,itemsOf,checkForm,publicForm,validateAnswers,videoIds};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = TrainingCore;

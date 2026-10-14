const TrainingUI = (() => {
  const messages = {
    not_configured:'尚未設定後端', network:'連線失敗，請檢查網路後重試。若剛才已送出，請先查詢合格證明確認結果。',
    form_misconfigured:'表單設定有誤，請聯絡管理人員。', invalid:'資料或證明連結無效，請確認後再試。',
    required:'請填寫所有必填欄位。', consent:'請先閱讀並勾選個人資料提供同意書。',
    nationalId:'請輸入正確的身分證字號或居留證號。', taxId:'請輸入正確的 8 碼公司統編。',
    watchDate:'請填寫正確日期，且不得晚於今天。', gate:'請完成觀看教材及相關準備，並選擇「是」才能繼續。',
    quiz:'尚有答錯題目，請修正標示的題目，全部答對才能取得證明。',
    too_many_attempts:'查詢失敗次數過多，請於 15 分鐘後再試。',
    server_error:'系統暫時無法完成，請稍後重試；若已送出，請先查詢合格證明。',
    busy:'系統忙碌中，請稍後再試。', sequence_exhausted:'今日發證數量已達上限，請聯絡管理人員。'
  };
  const configured = () => /^https?:\/\//.test(API_URL) && !API_URL.includes('REPLACE_');
  const messageFor = code => messages[code] || messages.server_error;
  function message(text, error) {
    const el = document.getElementById('message');
    el.textContent = text; el.classList.toggle('error', !!error);
  }
  async function api(action, data, post) {
    if (!configured()) throw Object.assign(new Error(), {code:'not_configured'});
    const url = new URL(API_URL);
    // Apps Script reserves these query names, including ones left in a configured URL.
    url.searchParams.delete('c');
    url.searchParams.delete('sid');
    const options = {redirect:'follow',credentials:'omit'};
    if (post) {
      options.method = 'POST'; options.headers = {'Content-Type':'text/plain;charset=utf-8'};
      options.body = JSON.stringify({action,...data});
    } else {
      url.searchParams.set('action', action);
      // Only form type and certificate credentials belong in query strings.
      for (const k of ['type','cert','token']) if (data[k] !== undefined) url.searchParams.set(k, data[k]);
    }
    let response, result;
    try {
      response = await fetch(url, options);
      if (!response.ok) throw new Error();
      result = await response.json();
    } catch (_) { throw Object.assign(new Error(), {code:'network'}); }
    if (!result || result.ok !== true) throw Object.assign(new Error(), {code:result && result.error || 'server_error',result});
    return result;
  }
  function certIsValid(cert) {
    return cert && /^RT-[ES]-\d{8}-\d{3}$/.test(cert.certNo) && /^[\w-]{16}$/.test(cert.token) && ['E','S'].includes(cert.type) && ['valid','expired','revoked'].includes(cert.status) && ['company','name','maskedId','issuedAt','expiresOn'].every(k => typeof cert[k] === 'string');
  }
  function certificate(cert, {largeQR=false,actions=true,showStatus=true,showOpen=true} = {}) {
    if (!certIsValid(cert)) throw Object.assign(new Error(), {code:'server_error'});
    const root = document.createElement('article'); root.className = 'certificate'; root.dataset.type = cert.type;
    const url = RealtekBadge.badgeUrl(cert);
    if (showStatus) {
      const status = document.createElement('p'); status.className = 'cert-status';
      status.textContent = {valid:'有效',expired:'已過期',revoked:'已作廢'}[cert.status]; root.append(status);
    }
    const preview = document.createElement('div'); preview.className = 'badge-preview';
    preview.innerHTML = RealtekBadge.renderSVG(cert,{url}); root.append(preview);
    if (largeQR) { const qr = document.createElement('div'); qr.className = 'badge-qr'; qr.innerHTML = RealtekBadge.qrSVG(url,240); root.append(qr); }
    const buttons = document.createElement('div'); buttons.className = 'badge-actions';
    if (showOpen) {
      const open = document.createElement('a'); open.href = url; open.target = '_blank'; open.rel = 'noopener'; open.textContent = '開啟合格證明'; buttons.append(open);
    }
    if (actions) {
      const png = document.createElement('button'); png.type = 'button'; png.textContent = '下載 PNG';
      png.onclick = async () => { png.disabled = true; try { await RealtekBadge.downloadPNG(cert,{url}); } catch (_) { message('圖片產生失敗，請改用列印。',true); } finally { png.disabled = false; } };
      const print = document.createElement('button'); print.type = 'button'; print.textContent = '列印'; print.onclick = () => RealtekBadge.printBadge(cert,{url});
      buttons.append(png,print);
    }
    root.append(buttons); return root;
  }
  return {api,message,messageFor,certificate,configured};
})();

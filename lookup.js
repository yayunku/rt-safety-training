(() => {
  const form = document.getElementById('lookup-form'), results = document.getElementById('results'), button = form.querySelector('button');
  if (!TrainingUI.configured()) TrainingUI.message('尚未設定後端',true);
  form.addEventListener('submit',async event => {
    event.preventDefault(); if (button.disabled) return;
    results.replaceChildren();
    const idNo = TrainingCore.normalizeId(document.getElementById('idNo').value), name = document.getElementById('name').value;
    if (!TrainingCore.validId(idNo)) { TrainingUI.message(TrainingUI.messageFor('nationalId'),true); return; }
    if (!TrainingCore.normalizeName(name)) { TrainingUI.message('請填寫姓名。',true); return; }
    button.disabled = true; TrainingUI.message('查詢中⋯');
    try {
      const result = await TrainingUI.api('lookup',{idNo,name},true);
      if (!Array.isArray(result.certs)) throw Object.assign(new Error(),{code:'server_error'});
      const cards = result.certs.map(cert => TrainingUI.certificate(cert,{actions:false,showStatus:false}));
      results.replaceChildren(...cards); TrainingUI.message(cards.length ? '' : '查無資料');
    } catch (err) { TrainingUI.message(TrainingUI.messageFor(err.code),true); }
    finally { button.disabled = false; }
  });
})();

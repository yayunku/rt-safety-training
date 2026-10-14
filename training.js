(() => {
  const type = new URLSearchParams(location.search).get('type');
  const form = document.getElementById('training-form'), steps = document.getElementById('steps');
  const next = document.getElementById('next'), previous = document.getElementById('previous'), retry = document.getElementById('retry');
  let model, current = 0, busy = false;
  const controls = new Map(), boxes = new Map();
  function answers() {
    const result = {};
    for (const item of TrainingCore.itemsOf(model)) {
      const inputs = controls.get(item.id);
      if (!inputs) continue;
      result[item.id] = item.kind === 'checkbox' ? inputs.filter(i => i.checked).map(i => i.value)
        : item.kind === 'radio' ? (inputs.find(i => i.checked) || {}).value || '' : inputs[0].value;
    }
    return result;
  }
  function applyGates() {
    const first = model.sections[0], values = answers();
    const agreed = first.items.filter(i => i.role === 'consent').every(i => values[i.id].length > 0);
    first.items.forEach(i => { if (i.role !== 'consent') (controls.get(i.id) || []).forEach(input => { input.disabled = !agreed || busy; }); });
    next.disabled = busy || (current === 0 && !agreed);
    previous.disabled = busy;
  }
  function showStep(index) {
    current = index;
    [...steps.children].forEach((el,i) => { el.hidden = i !== index; });
    document.querySelectorAll('.progress-step').forEach((el,i) => {
      const dot = el.querySelector('.progress-dot'); dot.classList.toggle('active',i === index); dot.classList.toggle('done',i < index); dot.textContent = i < index ? '✓' : i + 1;
      if (i === index) el.setAttribute('aria-current','step'); else el.removeAttribute('aria-current');
    });
    previous.hidden = index === 0; next.textContent = index === model.sections.length - 1 ? '送出訓練登記 →' : '下一步 →';
    applyGates();
  }
  function mark(result) {
    const ids = result.wrong || result.fields || [];
    ids.forEach(id => {
      const box = boxes.get(id); if (!box) return;
      box.classList.add('wrong'); box.querySelector('.field-error').textContent = result.error === 'quiz' ? '答錯，請重新作答' : TrainingUI.messageFor(result.error);
      (controls.get(id) || []).forEach(input => input.setAttribute('aria-invalid','true'));
    });
    const first = model.sections.findIndex(s => s.items.some(i => ids.includes(i.id)));
    if (first >= 0) { showStep(first); boxes.get(ids[0]).scrollIntoView({block:'center',behavior:'smooth'}); }
  }
  function renderItem(item, body) {
    if (item.role === 'consent') {
      const notice = document.createElement('div'); notice.className = 'privacy-box'; notice.id = 'consent-text'; notice.tabIndex = 0; notice.textContent = CONSENT_TEXT; body.append(notice);
    }
    const box = document.createElement('fieldset'); box.className = 'field'; box.dataset.itemId = item.id; box.dataset.role = item.role; boxes.set(item.id,box);
    const title = document.createElement('legend'); title.textContent = item.title;
    if (item.required) {
      const mark = document.createElement('span'); mark.className = 'required-mark'; mark.textContent = ' *'; title.append(mark);
    }
    box.append(title);
    if (item.help) { const help = document.createElement('p'); help.className = 'help'; help.textContent = item.help; box.append(help); }
    const inputs = [];
    if (['text','date'].includes(item.kind)) {
      const input = document.createElement('input'); input.type = item.kind; input.setAttribute('aria-label',item.title); input.autocomplete = 'off';
      if (item.kind === 'date') { input.max = TrainingCore.taipeiDate(new Date()); input.value = input.max; }
      box.append(input); inputs.push(input);
    } else if (['radio','checkbox'].includes(item.kind)) {
      item.options.forEach((option,index) => {
        const label = document.createElement('label'); label.className = 'radio-opt';
        const input = document.createElement('input'); input.type = item.kind; input.name = 'item-' + item.id; input.value = option; input.id = 'item-' + item.id + '-' + index;
        const text = document.createElement('span'); text.textContent = option; label.append(input,text); box.append(label); inputs.push(input);
      });
    } else if (item.kind === 'video') {
      if (!/^[\w-]{11}$/.test(item.youtubeId)) throw Object.assign(new Error(),{code:'form_misconfigured'});
      const wrap = document.createElement('div'); wrap.className = 'video-wrap';
      const iframe = document.createElement('iframe'); iframe.src = 'https://www.youtube.com/embed/' + item.youtubeId; iframe.title = item.title || '訓練影片'; iframe.allowFullscreen = true; iframe.referrerPolicy = 'no-referrer'; wrap.append(iframe); box.append(wrap);
      const help = document.createElement('p'); help.className = 'help'; help.textContent = '點 YouTube 字樣到 YouTube 網頁放大觀看'; box.append(help);
    }
    const error = document.createElement('p'); error.className = 'field-error'; error.id = 'error-' + item.id; box.append(error);
    if (inputs.length) controls.set(item.id,inputs);
    inputs.forEach(input => {
      input.setAttribute('aria-describedby',error.id);
      input.addEventListener('input',() => { box.classList.remove('wrong'); error.textContent = ''; inputs.forEach(el => el.removeAttribute('aria-invalid')); });
      input.addEventListener('change',() => {
        applyGates();
        if (item.role === 'gate' && input.checked && input.value === '否') { error.textContent = TrainingUI.messageFor('gate'); box.classList.add('wrong'); }
      });
    });
    body.append(box);
  }
  async function load() {
    form.hidden = true; retry.hidden = true; TrainingUI.message('載入題目中⋯（首次載入可能需要 15 秒）');
    if (!['E','S'].includes(type)) { TrainingUI.message('請從首頁選擇工程發包或勞務類型。',true); return; }
    try {
      model = await TrainingUI.api('form',{type});
      if (!Array.isArray(model.sections) || !model.sections.length || !model.sections[0].items.some(i => i.role === 'consent')) throw Object.assign(new Error(),{code:'form_misconfigured'});
      steps.replaceChildren(); controls.clear(); boxes.clear(); document.getElementById('progress').replaceChildren();
      const subtitle = (model.subtitle || model.title).trim();
      const leadStart = subtitle.search(/[（(]/);
      document.getElementById('page-title').textContent = (leadStart < 0 ? subtitle : subtitle.slice(0,leadStart)).trim();
      const lead = document.getElementById('subtitle');
      lead.textContent = leadStart < 0 ? '' : subtitle.slice(leadStart).trim();
      lead.hidden = !lead.textContent;
      document.documentElement.dataset.trainingType = type;
      model.sections.forEach((section,index) => {
        const step = document.createElement('section'); step.className = 'step-card';
        const header = document.createElement('h2'); header.className = 'step-header'; header.textContent = (index + 1) + '. ' + section.title; step.append(header);
        const body = document.createElement('div'); body.className = 'step-body';
        if (section.description) { const desc = document.createElement('p'); desc.className = 'help'; desc.textContent = section.description; body.append(desc); }
        section.items.forEach(item => renderItem(item,body)); step.append(body); steps.append(step);
        const progress = document.createElement('div'); progress.className = 'progress-step';
        const dot = document.createElement('span'); dot.className = 'progress-dot';
        const label = document.createElement('span'); label.className = 'progress-label'; label.textContent = section.title; progress.append(dot,label); document.getElementById('progress').append(progress);
      });
      form.hidden = false; showStep(0); TrainingUI.message('');
    } catch (err) { TrainingUI.message(TrainingUI.messageFor(err.code),true); retry.hidden = false; }
  }
  previous.onclick = () => { TrainingUI.message(''); showStep(current - 1); };
  retry.onclick = load;
  form.addEventListener('submit',async event => {
    event.preventDefault(); if (busy) return;
    const values = answers(), last = current === model.sections.length - 1;
    const scope = last ? model : {sections:[model.sections[current]]};
    const validation = TrainingCore.validateAnswers(scope,values,TrainingCore.taipeiDate(new Date()),false);
    if (!validation.ok) { mark(validation); TrainingUI.message(TrainingUI.messageFor(validation.error),true); return; }
    if (!last) { TrainingUI.message(''); showStep(current + 1); window.scrollTo({top:0,behavior:'smooth'}); return; }
    busy = true; applyGates(); next.textContent = '送出中⋯'; TrainingUI.message('送出中，約需 10–20 秒，請勿關閉頁面');
    try {
      const result = await TrainingUI.api('submit',{type,answers:values},true);
      const certificate = TrainingUI.certificate(result.cert,{largeQR:true,showStatus:false});
      document.getElementById('certificate').replaceChildren(certificate);
      form.hidden = true; document.getElementById('success').hidden = false;
      document.body.classList.add('training-complete'); TrainingUI.message('');
    } catch (err) { if (err.result) mark(err.result); TrainingUI.message(TrainingUI.messageFor(err.code),true); }
    finally { busy = false; showStep(current); }
  });
  load();
})();

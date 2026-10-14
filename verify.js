(() => {
  let generation = 0;
  const retry = document.getElementById('retry'), target = document.getElementById('certificate');
  async function verify() {
    const current = ++generation;
    target.replaceChildren(); retry.hidden = true;
    const params = RealtekBadge.readHash();
    if (!params) { TrainingUI.message(TrainingUI.messageFor('invalid'),true); return; }
    TrainingUI.message('查驗中⋯');
    try {
      const result = await TrainingUI.api('verify',{cert:params.c,token:params.t});
      if (current !== generation) return;
      target.replaceChildren(TrainingUI.certificate(result.cert,{showStatus:false,showOpen:false})); TrainingUI.message('');
    } catch (err) { if (current !== generation) return; TrainingUI.message(TrainingUI.messageFor(err.code),true); retry.hidden = false; }
  }
  retry.onclick = verify;
  window.addEventListener('hashchange',verify);
  verify();
})();

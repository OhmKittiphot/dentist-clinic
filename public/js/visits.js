(function(){
  const form = document.getElementById('visitForm');
  const teethBox = document.getElementById('teethBox');
  const modeRadios = document.querySelectorAll('input[name="teethMode"]');
  const procScaling = document.getElementById('proc-scaling');
  const procFilling = document.getElementById('proc-filling');
  const procOther = document.getElementById('proc-other');
  const otherInput = document.getElementById('other-detail');
  const enableScaling = document.getElementById('enable-scaling');
  const priceScaling = document.getElementById('price-scaling');
  const enableFilling = document.getElementById('enable-filling');
  const priceFillPer = document.getElementById('price-fill-per');
  const priceFillCount = document.getElementById('price-fill-count');
  const sumScaling = document.getElementById('sum-scaling');
  const sumFilling = document.getElementById('sum-filling');
  const sumExtras = document.getElementById('sum-extras');
  const sumTotal = document.getElementById('sum-total');

  function range(a,b){ const arr=[]; for(let i=a;i<=b;i++) arr.push(i); return arr; }
  function permanentTeeth(){ return [...range(11,18),...range(21,28),...range(31,38),...range(41,48)]; }
  function primaryTeeth(){ return [...range(51,55),...range(61,65),...range(71,75),...range(81,85)]; }

  function renderTeeth(){
    const mode = [...modeRadios].find(r=>r.checked)?.value || 'permanent';
    const list = (mode === 'primary') ? primaryTeeth() : permanentTeeth();
    teethBox.innerHTML = '';
    list.forEach(no => {
      const id = `t-${no}`;
      const wrap = document.createElement('div'); wrap.className='tooth';
      wrap.innerHTML = `<input id="${id}" type="checkbox" value="${no}"><label for="${id}">${no}</label>`;
      teethBox.appendChild(wrap);
    });
    syncFillCount();
  }

  function selectedTeeth(){
    return [...teethBox.querySelectorAll('input[type=checkbox]:checked')].map(i=>i.value);
  }

  function syncFillCount(){
    priceFillCount.value = selectedTeeth().length || 0;
    updateSummary();
  }

  function updateSummary(){
    const scOn = enableScaling.checked && procScaling?.checked;
    const scAmount = scOn ? Number(priceScaling.value || 0) : 0;
    sumScaling.textContent = scOn ? `฿${scAmount}` : '—';

    const fiOn = enableFilling.checked && procFilling?.checked;
    const fiEach = Number(priceFillPer.value || 0);
    const fiCount = Number(priceFillCount.value || 0);
    const fiAmount = fiOn ? (fiEach * fiCount) : 0;
    sumFilling.textContent = fiOn ? `฿${fiAmount}` : '—';

    const extras = 0; // reserved for table extras
    sumExtras.textContent = extras ? `฿${extras}` : '—';

    const total = scAmount + fiAmount + extras;
    sumTotal.textContent = `฿${total}`;
  }

  function toggleInput(enabler, input){
    function apply(){ input.disabled = !enabler.checked; updateSummary(); }
    enabler?.addEventListener('change', apply);
    input?.addEventListener('input', updateSummary);
    apply();
  }

  function toggleOther(){
    if (!otherInput) return;
    otherInput.classList.toggle('show', procOther?.checked);
    otherInput.hidden = !procOther?.checked;
  }

  function buildHidden(name, value){
    const i = document.createElement('input');
    i.type='hidden'; i.name=name; i.value=value;
    form.appendChild(i);
  }
  function addProc(code, tooth, qty, price){
    buildHidden('procedures_codes', code);
    buildHidden('procedures_teeth', tooth || '');
    buildHidden('procedures_qty', String(qty ?? 1));
    buildHidden('procedures_price', String(price ?? 0));
  }

  form?.addEventListener('submit', (e)=>{
    if (procScaling?.checked){
      const price = enableScaling.checked ? Number(priceScaling.value || 0) : 0;
      addProc('SCALING', '', 1, price);
    }
    if (procFilling?.checked){
      const per = enableFilling.checked ? Number(priceFillPer.value || 0) : 0;
      const teeth = selectedTeeth();
      if (teeth.length === 0){
        addProc('FILLING', '', Number(priceFillCount.value || 1), per);
      } else {
        teeth.forEach(t => addProc('FILLING', t, 1, per));
      }
    }
    if (procOther?.checked && otherInput?.value){
      addProc('OTHER', '', 1, 0);
    }
  });

  renderTeeth();
  modeRadios.forEach(r=> r.addEventListener('change', renderTeeth));
  teethBox.addEventListener('change', syncFillCount);
  toggleInput(enableScaling, priceScaling);
  toggleInput(enableFilling, priceFillPer);
  priceFillCount.addEventListener('input', updateSummary);
  procOther?.addEventListener('change', toggleOther);
  toggleOther();
  updateSummary();

  // simple preview-uploader (UI เท่านั้น)
  const uploader = document.getElementById('uploader');
  const pickBtn = document.getElementById('pickBtn');
  const xrayInput = document.getElementById('xrayInput');
  const xrayList = document.getElementById('xrayList');

  function preview(files){
    xrayList.innerHTML='';
    [...files].forEach(f=>{
      const url = URL.createObjectURL(f);
      const card = document.createElement('div'); card.className='xray-card';
      card.innerHTML = `<img src="${url}" alt="${f.name}"/><div class="xray-actions"><button type="button">ลบ</button></div>`;
      card.querySelector('button').addEventListener('click', ()=> card.remove());
      xrayList.appendChild(card);
    });
  }

  pickBtn?.addEventListener('click', ()=> xrayInput?.click());
  xrayInput?.addEventListener('change', e => preview(e.target.files || []));
  ['dragenter','dragover'].forEach(ev => uploader?.addEventListener(ev, e => { e.preventDefault(); uploader.classList.add('dragover'); }));
  ;['dragleave','drop'].forEach(ev => uploader?.addEventListener(ev, e => { e.preventDefault(); uploader.classList.remove('dragover'); }));
  uploader?.addEventListener('drop', e => { const files = e.dataTransfer?.files || []; if (xrayInput) xrayInput.files = files; preview(files); });
})();

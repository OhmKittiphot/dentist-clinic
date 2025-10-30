document.addEventListener('DOMContentLoaded', () => {
  // set now
  const visitDate = document.getElementById('visit_date');
  if (visitDate) {
    const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    visitDate.value = now.toISOString().slice(0,16);
  }

  const proceduresInput = document.getElementById('procedures-input');
  const treatmentListBody = document.getElementById('treatment-list-body');
  const subtotalEl = document.getElementById('subtotal');
  const totalAmountEl = document.getElementById('total-amount');
  const amountInput = document.getElementById('amount-input');

  const toothChart = document.getElementById('tooth-chart');
  const overlay = document.getElementById('teeth-disabled-overlay');
  const helper = document.getElementById('teeth-helper');

  const adultTeethDiv = document.querySelector('.adult-teeth');
  const childTeethDiv = document.querySelector('.child-teeth');

  const allTeeth = Array.from(document.querySelectorAll('.tooth'));

  let treatmentItems = [];
  let activeRowId = null;

  // toggle adult/child
  document.querySelectorAll('input[name="tooth-type"]').forEach(r => {
    r.addEventListener('change', function(){
      adultTeethDiv.style.display = this.value === 'adult' ? 'block' : 'none';
      childTeethDiv.style.display = this.value === 'child' ? 'block' : 'none';
      clearToothSelection();
      if (activeRowId){
        const it = treatmentItems.find(i => i.id === activeRowId);
        if (it?.isPerTooth) syncToothSelection(it.tooth_no);
      }
    });
  });

  // click tooth
  allTeeth.forEach(t => {
    t.addEventListener('click', function(){
      const it = treatmentItems.find(i => i.id === activeRowId);
      if (!it || !it.isPerTooth){
        return;
      }
      this.classList.toggle('selected');
      updateSelectedTeethForActiveRow();
    });
  });

  function setOverlay(on, msg){
    if (!overlay || !toothChart) return;
    overlay.style.display = on ? 'flex' : 'none';
    overlay.querySelector('div').textContent = msg || 'เลือกแถวหัตถการที่ “ต่อซี่” ก่อน แล้วคลิกซี่ฟันที่นี่';
    toothChart.classList.toggle('disabled', !!on);
  }

  function showHelper(text){ if (helper){ helper.style.display = 'block'; helper.textContent = text; } }
  function hideHelper(){ if (helper){ helper.style.display = 'none'; helper.textContent = ''; } }

  function clearToothSelection(){ allTeeth.forEach(t => t.classList.remove('selected')); }

  function updateSelectedTeethForActiveRow(){
    const it = treatmentItems.find(i => i.id === activeRowId);
    if (!it) return;
    const selected = Array.from(document.querySelectorAll('.tooth.selected')).map(t => t.dataset.toothId);
    if (it.isPerTooth){
      it.tooth_no = selected.join(', ');
      it.qty = Math.max( selected.length, 1 );
    }else{
      it.tooth_no = '';
    }
    renderAndCalculate();
  }

  function syncToothSelection(csv){
    clearToothSelection();
    if (!csv) return;
    csv.split(',').map(s => s.trim()).filter(Boolean).forEach(id => {
      const el = document.querySelector(`.tooth[data-tooth-id='${id}']`);
      if (el) el.classList.add('selected');
    });
  }

  function detectPerTooth(proc){
    const desc = (proc.description || '').toLowerCase();
    const code = (proc.code || '').toUpperCase();
    const th = ['อุดฟัน','รักษาราก','ถอนฟัน','ครอบฟัน','วีเนียร์','เกลาราก','ผ่าฟันคุด','เอ็กซเรย์'];
    const en = ['filling','resto','root canal','extraction','crown','veneer','surgery','x-ray','xray'];
    const byDesc = th.some(k => desc.includes(k)) || en.some(k => desc.includes(k));
    const byCode = /^(FILL|RESTO|EXT|CROWN|VEN|XRAY|XRY|SURG)/.test(code);
    return byDesc || byCode;
  }

  function addProcedure(proc){
    const isPerTooth = detectPerTooth(proc);
    const item = {
      id: `proc_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
      code: proc.code,
      description: proc.description,
      price_each: Number(proc.price) || 0,
      qty: 1,
      tooth_no: '',
      isPerTooth
    };
    treatmentItems.push(item);
    setActiveRow(item.id);
    renderAndCalculate();
  }

  // expose ops
  window.removeProcedure = id => {
    treatmentItems = treatmentItems.filter(i => i.id !== id);
    if (activeRowId === id){
      activeRowId = null;
      clearToothSelection();
      document.getElementById('adult-teeth-radio').checked = true;
      adultTeethDiv.style.display = 'block';
      childTeethDiv.style.display = 'none';
      setOverlay(true);
      hideHelper();
    }
    renderAndCalculate();
  };

  window.updateQty = (id,val) => {
    const it = treatmentItems.find(i => i.id === id);
    if (it && !it.isPerTooth) it.qty = Math.max(0, parseInt(val)||0);
    renderAndCalculate();
  };

  window.updatePrice = (id,val) => {
    const it = treatmentItems.find(i => i.id === id);
    if (it) it.price_each = Number(val)||0;
    renderAndCalculate();
  };

  window.setActiveRow = id => {
    activeRowId = id;
    document.querySelectorAll('#treatment-list-body tr').forEach(r => r.classList.remove('active-row'));
    const row = document.querySelector(`#treatment-list-body tr[data-item-id='${id}']`);
    if (row) row.classList.add('active-row');

    const it = treatmentItems.find(i => i.id === id);
    clearToothSelection();

    if (it?.isPerTooth){
      syncToothSelection(it.tooth_no);
      const nums = (it.tooth_no||'').split(',').map(s => Number(s.trim())).filter(Boolean);
      const anyChild = nums.some(n => n>=51 && n<=85);
      document.getElementById(anyChild ? 'child-teeth-radio' : 'adult-teeth-radio').checked = true;
      adultTeethDiv.style.display = anyChild ? 'none':'block';
      childTeethDiv.style.display = anyChild ? 'block':'none';
      setOverlay(false);
      showHelper(`กำลังผูกซี่ให้รายการ: “${it.description}”`);
    }else{
      setOverlay(true);
      showHelper('ถ้ารายการนี้ต้องระบุซี่ ให้เปิดสวิตช์ “ต่อซี่” ในแถวรายการ');
    }
  };

  window.togglePerTooth = (id, checked) => {
    const it = treatmentItems.find(i => i.id === id);
    if (!it) return;
    it.isPerTooth = !!checked;
    if (!checked){
      it.tooth_no = '';
      clearToothSelection();
    }
    if (it.isPerTooth) it.qty = Math.max(1, (it.tooth_no ? it.tooth_no.split(',').filter(Boolean).length : 0));
    renderAndCalculate();
    if (activeRowId === id) setActiveRow(id);
  };

  // quick buttons
  document.querySelectorAll('.quick-add-proc').forEach(b => {
    b.addEventListener('click', function(){
      addProcedure({
        code: this.dataset.code,
        description: this.dataset.desc,
        price: this.dataset.price
      });
    });
  });

  // custom adder
  const addBtn = document.getElementById('add-custom-proc-btn');
  if (addBtn){
    addBtn.addEventListener('click', () => {
      const dEl = document.getElementById('custom-proc-desc');
      const pEl = document.getElementById('custom-proc-price');
      const d = dEl.value.trim();
      const p = Number(pEl.value || 0);
      if (!d || p<=0) return alert('กรุณาใส่ชื่อรายการและราคาให้ถูกต้อง');
      addProcedure({ code:`CUSTOM_${Date.now()}`, description:d, price:p });
      dEl.value = ''; pEl.value = '';
    });
  }

  function renderAndCalculate(){
    let subtotal = 0;

    if (treatmentItems.length === 0){
      treatmentListBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted p-4">ยังไม่มีรายการ</td></tr>';
      setOverlay(true);
      hideHelper();
    } else {
      treatmentListBody.innerHTML = treatmentItems.map(it => {
        subtotal += it.qty * it.price_each;
        const active = it.id === activeRowId ? 'active-row' : '';
        const qtyRO = it.isPerTooth ? 'readonly' : '';

        const descHtml = `<div class="desc"><strong>${it.description}</strong></div>`;
        const teethHtml = (it.tooth_no && it.isPerTooth)
          ? `<div class="tooth-line text-muted small">ซี่: ${it.tooth_no}</div>` : '';
        const switchHtml = `
          <div class="pertooth-line">
            <div class="custom-control custom-switch">
              <input type="checkbox" class="custom-control-input" id="sw-${it.id}" ${it.isPerTooth?'checked':''}
                     onchange="togglePerTooth('${it.id}', this.checked)">
              <label class="custom-control-label" for="sw-${it.id}">ต่อซี่</label>
            </div>
          </div>
        `;

        return `
          <tr class="${active}" data-item-id="${it.id}">
            <td class="description-cell">
              ${descHtml}
              ${teethHtml}
              ${switchHtml}
            </td>
            <td>
              <input type="number" class="form-control" value="${it.qty}" onchange="updateQty('${it.id}', this.value)" ${qtyRO}>
            </td>
            <td>
              <input type="number" step="0.01" class="form-control" value="${it.price_each.toFixed(2)}" onchange="updatePrice('${it.id}', this.value)">
            </td>
            <td>
              <button type="button" class="remove-proc-btn" onclick="removeProcedure('${it.id}')">
                <i class="fas fa-trash-alt"></i>
              </button>
            </td>
          </tr>`;
      }).join('');

      treatmentListBody.querySelectorAll('tr[data-item-id]').forEach(row => {
        row.addEventListener('click', e => {
          if (e.target.tagName.toLowerCase() !== 'input' && !e.target.closest('button') && !e.target.closest('.custom-control')) {
            setActiveRow(row.dataset.itemId);
          }
        });
      });
    }

    subtotalEl.textContent = `฿${subtotal.toFixed(2)}`;
    totalAmountEl.textContent = `฿${subtotal.toFixed(2)}`;
    amountInput.value = subtotal.toFixed(2);

    const payload = treatmentItems.map(({id,isPerTooth, ...rest}) => rest);
    proceduresInput.value = JSON.stringify(payload);
  }

  // file uploads
  const dropArea = document.getElementById('file-drop-area');
  const fileInput = document.getElementById('xray-files-input');
  const fileListDisplay = document.getElementById('file-list-display');

  if (dropArea && fileInput){
    ['dragenter','dragover','dragleave','drop'].forEach(ev => {
      dropArea.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); }, false);
    });
    dropArea.addEventListener('click', () => fileInput.click());
    dropArea.addEventListener('drop', e => fileInput.files = e.dataTransfer.files, false);
    fileInput.addEventListener('change', () => {
      fileListDisplay.innerHTML = '';
      if (fileInput.files.length){
        Array.from(fileInput.files).forEach(f => {
          fileListDisplay.innerHTML += `<div class="file-item"><span>${f.name}</span><small>${(f.size/1024).toFixed(1)} KB</small></div>`;
        });
      }
    });
  }

  // init
  renderAndCalculate();
  setOverlay(true);
});
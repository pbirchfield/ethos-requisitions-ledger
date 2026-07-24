(function(){

  async function apiGet(key){
    const res = await fetch('/api/storage?key=' + encodeURIComponent(key));
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('Storage GET failed for ' + key);
    return res.json(); // { key, value }
  }

  async function apiSet(key, value){
    const res = await fetch('/api/storage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value })
    });
    if (!res.ok) throw new Error('Storage SET failed for ' + key);
    return res.json();
  }


  const STATUSES = ["Draft","Pending Approval","Approved","Posted","Interviewing","Filled","Cancelled"];
  const DEPT_TITLES = {
    "100-Renewables": ["Civil Inspector","Director Renewable Services","Electrical Inspector","Fleet Manager","Lead - Renewables","Logistics Tech II - Renewables","Office Administrator","Operations Support Manager","Site Manager","Superintendent","Tech I - Renewables","Tech II - Renewables","Tech III - Renewables","Temporary Technician"],
    "200-Telecom": ["Apprentice Electrician","Construction Manager","Director Telecom Services","Field Construction Manager","Fleet Manager","Journeyman Electrician","Lead - Telecom","Master Electrician","Materials Coordinator","Materials Manager","Program Manager","Project Coordinator","Tech I - Telecom","Tech II - Telecom","Tech III - Telecom","Telecom Business Operations Manager"],
    "300-Office": ["Accounting Supervisor","Accounts Payable Specialist","Administrative Assistant","Chief Executive Officer","Chief Financial Officer","Controller","Fleet Manager","HR Coordinator","Human Resources Manager","Intern","Office Administrator","Payroll Manager","President","Project Controls","Project Coordinator","Recruiter - Part time","Recruiter Specialist","Safety & Training Manager"]
  };
  const STATUS_CLASS = {
    "Draft":"stamp-draft","Pending Approval":"stamp-pending","Approved":"stamp-approved",
    "Posted":"stamp-posted","Interviewing":"stamp-interviewing","Filled":"stamp-filled","Cancelled":"stamp-cancelled"
  };
  const PRIORITY_CLASS = {"Urgent":"p-urgent","High":"p-high","Medium":"p-medium","Low":"p-low"};

  let requisitions = [];
  let customTitles = {};
  let approverPasscode = null;
  const DEFAULT_PASSCODE = "ETHOS-HR-2026";
  let activeTab = "All";
  let searchTerm = "";
  let storageReady = false;

  const listArea = document.getElementById('list-area');
  const ledgerStrip = document.getElementById('ledger-strip');
  const tabsEl = document.getElementById('tabs');

  function genId(){
    const now = new Date();
    const yy = String(now.getFullYear()).slice(2);
    const mm = String(now.getMonth()+1).padStart(2,'0');
    const seq = String(Math.floor(Math.random()*900)+100);
    return `REQ-${yy}${mm}-${seq}`;
  }

  function titlesForDept(dept){
    return (DEPT_TITLES[dept] || []).concat(customTitles[dept] || []);
  }

  function currentPasscode(){
    return approverPasscode || DEFAULT_PASSCODE;
  }

  async function loadData(){
    listArea.innerHTML = '<p class="loading-note">Loading requisitions…</p>';
    try{
      const res = await apiGet('requisitions');
      requisitions = res && res.value ? JSON.parse(res.value) : [];
    }catch(e){
      requisitions = [];
    }
    try{
      const res2 = await apiGet('customTitles');
      customTitles = res2 && res2.value ? JSON.parse(res2.value) : {};
    }catch(e){
      customTitles = {};
    }
    try{
      const res3 = await apiGet('approverPasscode');
      approverPasscode = res3 && res3.value ? res3.value : null;
    }catch(e){
      approverPasscode = null;
    }
    storageReady = true;
    render();
  }

  async function persist(){
    try{
      await apiSet('requisitions', JSON.stringify(requisitions));
    }catch(e){
      console.error('Storage error', e);
    }
  }

  async function persistCustomTitles(){
    try{
      await apiSet('customTitles', JSON.stringify(customTitles));
    }catch(e){
      console.error('Storage error', e);
    }
  }

  const ARCHIVE_AFTER_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

  function isArchived(r){
    if(r.status!=="Filled" && r.status!=="Cancelled") return false;
    const since = r.statusChangedAt || r.updatedAt;
    if(!since) return false;
    return (Date.now() - new Date(since).getTime()) >= ARCHIVE_AFTER_MS;
  }

  function renderLedgerStrip(){
    const active = requisitions.filter(r=>!isArchived(r));
    const open = active.filter(r=>["Posted","Interviewing"].includes(r.status)).length;
    const pending = active.filter(r=>r.status==="Pending Approval").length;
    const interviewing = active.filter(r=>r.status==="Interviewing").length;
    const filled = active.filter(r=>r.status==="Filled").length;
    const urgent = active.filter(r=>r.priority==="Urgent" && r.status!=="Filled" && r.status!=="Cancelled").length;
    const archived = requisitions.filter(isArchived).length;
    const cells = [
      ["Open", open], ["Pending", pending], ["Interviewing", interviewing], ["Filled", filled], ["Urgent", urgent], ["Archived", archived]
    ];
    ledgerStrip.innerHTML = cells.map(([lbl,num])=>`
      <div class="ledger-cell"><div class="num">${num}</div><div class="lbl">${lbl}</div></div>
    `).join('');
  }

  function renderTabs(){
    const tabs = ["All", ...STATUSES, "Archived"];
    tabsEl.innerHTML = tabs.map(t=>`<button class="tab ${t===activeTab?'active':''}" data-tab="${t}">${t}</button>`).join('');
    tabsEl.querySelectorAll('.tab').forEach(btn=>{
      btn.addEventListener('click', ()=>{ activeTab = btn.dataset.tab; render(); });
    });
  }

  function filteredReqs(){
    return requisitions.filter(r=>{
      const archived = isArchived(r);
      let tabMatch;
      if(activeTab==="Archived") tabMatch = archived;
      else if(activeTab==="All") tabMatch = !archived;
      else tabMatch = r.status===activeTab && !archived;
      const term = searchTerm.trim().toLowerCase();
      const searchMatch = !term || [r.title,r.department,r.hiringManager].some(f=>(f||'').toLowerCase().includes(term));
      return tabMatch && searchMatch;
    }).sort((a,b)=> (b.updatedAt||'').localeCompare(a.updatedAt||''));
  }

  function renderList(){
    const items = filteredReqs();
    if(requisitions.length===0){
      listArea.innerHTML = `<div class="empty-state"><b>No requisitions yet</b>Start the intake for your first open role &mdash; it takes about a minute.</div>`;
      return;
    }
    if(items.length===0){
      listArea.innerHTML = `<div class="empty-state"><b>No matches</b>Nothing fits this filter. Try a different tab or search term.</div>`;
      return;
    }
    listArea.innerHTML = `<div class="grid">${items.map(ticketHtml).join('')}</div>`;
    items.forEach(r=>{
      const el = document.getElementById(`ticket-${r.id}`);
      el.querySelector('.ticket-summary').addEventListener('click', ()=>{
        r._expanded = !r._expanded;
        renderList();
      });
      if(r._expanded){
        bindDetailEvents(r);
      }
    });
  }

  function archiveNote(r){
    if(r.status!=="Filled" && r.status!=="Cancelled") return '';
    const since = r.statusChangedAt || r.updatedAt;
    if(!since) return '';
    const elapsed = Date.now() - new Date(since).getTime();
    const daysLeft = Math.ceil((ARCHIVE_AFTER_MS - elapsed) / (24*60*60*1000));
    if(daysLeft <= 0){
      return `<div style="font-size:11.5px; color:var(--muted); margin-top:6px;">Archived — ${r.status.toLowerCase()} over 30 days ago</div>`;
    }
    return `<div style="font-size:11.5px; color:var(--muted); margin-top:6px;">Auto-archives in ${daysLeft} day${daysLeft===1?'':'s'}</div>`;
  }

  function ticketHtml(r){
    return `
      <div class="ticket" id="ticket-${r.id}">
        <div class="ticket-summary">
          <div class="stamp ${STATUS_CLASS[r.status]||'stamp-draft'}">${r.status}</div>
          <div class="req-id">${r.id}</div>
          <h3>${escapeHtml(r.title||'Untitled role')}${r.isNewTitleRequest ? ' <span style="font-size:10.5px; font-weight:500; color:var(--brass); border:1px solid var(--brass); border-radius:2px; padding:2px 6px; vertical-align:middle; text-transform:uppercase; letter-spacing:0.04em;">New title</span>' : ''}</h3>
          ${r.customerTitle ? `<div style="font-size:12px; color:var(--muted); font-style:italic; margin:-2px 0 6px;">Customer calls it: "${escapeHtml(r.customerTitle)}"</div>` : ''}
          <div class="meta">
            <b>${escapeHtml(r.department||'—')}</b> · ${escapeHtml(r.hiringManager||'—')}<br/>
            ${escapeHtml(r.employmentType||'—')} · ${escapeHtml(r.location||'—')}<br/>
            Headcount ${r.headcount||1} · Target start ${r.targetStartDate||'—'}<br/>
            ${r.customerProject ? `Customer/Project: ${escapeHtml(r.customerProject)}<br/>` : ''}
            ${r.travelPercent ? `Travel ${escapeHtml(r.travelPercent)}%<br/>` : ''}
            ${r.presentToCustomer === 'Yes' ? `Presents to customer for selection (${escapeHtml(r.presentCount||'?')})<br/>` : ''}
          </div>
          <div class="priority-flag"><span class="priority-dot ${PRIORITY_CLASS[r.priority]||'p-low'}"></span>${r.priority||'Low'} priority</div>
          ${archiveNote(r)}
        </div>
        ${r._expanded ? detailHtml(r) : ''}
      </div>
    `;
  }

  function detailHtml(r){
    return `
      <div class="detail" onclick="event.stopPropagation()">
        ${r.isNewTitleRequest ? `
        <div class="field full" style="background:rgba(244,148,30,0.08); border:1px solid var(--brass); border-radius:3px; padding:10px 12px;">
          <label style="color:var(--brass);">New title requested</label>
          <div style="font-size:13px; color:var(--paper); margin-bottom:8px;">
            ${r.titlePromoted
              ? `"${escapeHtml(r.title)}" has been added to the standard <b>${escapeHtml(r.department)}</b> title list${r.promotedBy ? ` by ${escapeHtml(r.promotedBy)}` : ''}${r.promotedAt ? ` on ${new Date(r.promotedAt).toLocaleDateString()}` : ''}.`
              : `"${escapeHtml(r.title)}" isn't on the standard title list yet. If this is a real, recurring role, add it so future requisitions can pick it directly.`}
          </div>
          ${!r.titlePromoted ? `<button class="btn btn-primary btn-small" data-action="promote" data-id="${r.id}">Add to standard title list</button>` : ''}
        </div>
        ` : ''}
        <div class="field full">
          <label>Customer calls this role</label>
          <input data-f="customerTitle" data-id="${r.id}" value="${escapeHtml(r.customerTitle||'')}" placeholder="e.g. Assistant Site Manager — same as our Superintendent" />
        </div>
        <div class="field-row">
          <div class="field"><label>Customer / Project</label><input data-f="customerProject" data-id="${r.id}" value="${escapeHtml(r.customerProject||'')}" /></div>
          <div class="field"><label>Travel %</label><input data-f="travelPercent" data-id="${r.id}" type="number" min="0" max="100" value="${escapeHtml(r.travelPercent||'')}" /></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Present candidates to customer?</label>
            <select data-f="presentToCustomer" data-id="${r.id}">
              <option value="No" ${r.presentToCustomer!=='Yes'?'selected':''}>No</option>
              <option value="Yes" ${r.presentToCustomer==='Yes'?'selected':''}>Yes</option>
            </select>
          </div>
          <div class="field"><label>How many candidates?</label><input data-f="presentCount" data-id="${r.id}" type="number" min="1" value="${escapeHtml(r.presentCount||'')}" /></div>
        </div>
        <div class="field full">
          <label>Requirements (certs, e.g. SGRE eLearning profile, GWO BST, BTT, ART)</label>
          <textarea data-f="requirements" data-id="${r.id}">${escapeHtml(r.requirements||'')}</textarea>
        </div>
        <div class="field full">
          <label>Skills (if not already covered in job description)</label>
          <textarea data-f="skills" data-id="${r.id}">${escapeHtml(r.skills||'')}</textarea>
        </div>
        <div class="field full">
          <label>Reason for requisition</label>
          <select data-f="reason" data-id="${r.id}">
            ${["Backfill","New Headcount","Growth","Other"].map(o=>`<option ${o===r.reason?'selected':''}>${o}</option>`).join('')}
          </select>
        </div>
        <div class="field full">
          <label>Comments</label>
          <textarea data-f="comments" data-id="${r.id}" placeholder="Any additional details, context, or notes for this requisition…">${escapeHtml(r.comments||'')}</textarea>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Status</label>
            <select data-f="status" data-id="${r.id}">
              ${STATUSES.map(s=>`<option value="${s}" ${s===r.status?'selected':''}>${s}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Priority</label>
            <select data-f="priority" data-id="${r.id}">
              ${["Low","Medium","High","Urgent"].map(p=>`<option value="${p}" ${p===r.priority?'selected':''}>${p}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="field full">
          <label>Approver notes</label>
          <textarea data-f="notes" data-id="${r.id}" placeholder="e.g. Approved by Finance 7/9, contingent on Q3 budget…">${escapeHtml(r.notes||'')}</textarea>
        </div>
        <div class="detail-actions">
          <button class="btn btn-danger btn-small" data-action="delete" data-id="${r.id}">Delete requisition</button>
          <button class="btn btn-primary btn-small" data-action="save" data-id="${r.id}">Save changes</button>
        </div>
      </div>
    `;
  }

  function bindDetailEvents(r){
    const ticketEl = document.getElementById(`ticket-${r.id}`);
    ticketEl.querySelectorAll('[data-action="save"]').forEach(btn=>{
      btn.addEventListener('click', async (e)=>{
        e.stopPropagation();
        const prevStatus = r.status;
        const fields = ticketEl.querySelectorAll('[data-f]');
        fields.forEach(f=>{ r[f.dataset.f] = f.value; });
        const now = new Date().toISOString();
        if(r.status !== prevStatus) r.statusChangedAt = now;
        r.updatedAt = now;
        await persist();
        render();
      });
    });
    ticketEl.querySelectorAll('[data-action="delete"]').forEach(btn=>{
      btn.addEventListener('click', async (e)=>{
        e.stopPropagation();
        requisitions = requisitions.filter(x=>x.id!==r.id);
        await persist();
        render();
      });
    });
    ticketEl.querySelectorAll('[data-action="promote"]').forEach(btn=>{
      btn.addEventListener('click', (e)=>{
        e.stopPropagation();
        openPromoteGate(r);
      });
    });
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function render(){
    if(!storageReady) return;
    renderLedgerStrip();
    renderTabs();
    renderList();
  }

  document.getElementById('search-input').addEventListener('input', (e)=>{
    searchTerm = e.target.value;
    render();
  });

  function csvEscape(val){
    const s = (val===undefined || val===null) ? '' : String(val);
    if(/[",\n]/.test(s)) return '"' + s.replace(/"/g,'""') + '"';
    return s;
  }

  function exportCSV(){
    const rows = filteredReqs();
    const columns = [
      ["id","Req ID"],["title","Job Title"],["isNewTitleRequest","New Title Request"],
      ["customerTitle","Customer-Facing Title"],["department","Department"],["hiringManager","Hiring Manager"],
      ["customerProject","Customer / Project"],["employmentType","Employment Type"],["location","Location"],
      ["headcount","Headcount"],["targetStartDate","Target Start Date"],["travelPercent","Travel %"],
      ["presentToCustomer","Present Candidates to Customer"],["presentCount","How Many Candidates"],
      ["requirements","Requirements"],["skills","Skills"],
      ["priority","Priority"],["status","Status"],["reason","Reason"],["comments","Comments"],["notes","Approver Notes"],
      ["createdAt","Created At"],["updatedAt","Last Updated"],["statusChangedAt","Status Changed At"]
    ];
    const header = columns.map(c=>csvEscape(c[1])).join(',');
    const lines = rows.map(r=> columns.map(c=>csvEscape(r[c[0]])).join(','));
    const csv = [header, ...lines].join('\r\n');
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0,10);
    const scope = activeTab === "All" ? "all" : activeTab.toLowerCase().replace(/\s+/g,'-');
    a.href = url;
    a.download = `requisitions_${scope}_${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  document.getElementById('export-btn').addEventListener('click', exportCSV);

  // New requisition modal
  document.getElementById('new-req-btn').addEventListener('click', openNewReqModal);

  function openNewReqModal(){
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `
      <div class="panel">
        <h2>New Requisition</h2>
        <p class="panel-sub">Fill in the specifics once — this becomes the single source of truth for the role.</p>
        <div class="field-row">
          <div class="field"><label>Department *</label>
            <select id="f-department">
              <option value="" selected disabled>Select department…</option>
              <option value="100-Renewables">100 - Renewables</option>
              <option value="200-Telecom">200 - Telecom</option>
              <option value="300-Office">300 - Office</option>
            </select>
          </div>
          <div class="field"><label>Job title *</label>
            <select id="f-title" disabled>
              <option value="" selected>Select department first…</option>
            </select>
          </div>
        </div>
        <div class="field-row" id="other-title-row" style="display:none;">
          <div class="field full"><label>Requested job title</label><input id="f-title-other" placeholder="Enter the new title being requested" /></div>
        </div>
        <div class="field-row">
          <div class="field full">
            <label>Customer calls this role (optional)</label>
            <input id="f-title-customer" placeholder="e.g. customer says &quot;Assistant Site Manager&quot; — same role as our Superintendent" />
          </div>
        </div>
        <div class="field-row">
          <div class="field full"><label>Hiring manager *</label><input id="f-manager" placeholder="e.g. Jordan Lee" /></div>
        </div>
        <div class="field-row">
          <div class="field full"><label>Customer / Project</label><input id="f-customer-project" placeholder="e.g. Acme Solar — Phase 2" /></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Employment type</label>
            <select id="f-type">
              <option selected>Full-time</option><option>Part-time</option><option>Contract</option><option>Intern</option><option>Temporary</option>
            </select>
          </div>
          <div class="field"><label>Location</label><input id="f-location" placeholder="e.g. Remote (US), Denver-hybrid" /></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Headcount</label><input id="f-headcount" type="number" min="1" value="1" /></div>
          <div class="field"><label>Target start date</label><input id="f-start" type="date" /></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Travel %</label><input id="f-travel" type="number" min="0" max="100" placeholder="e.g. 25" /></div>
          <div class="field"><label>Priority</label>
            <select id="f-priority">
              <option>Low</option><option selected>Medium</option><option>High</option><option>Urgent</option>
            </select>
          </div>
        </div>
        <div class="field-row">
          <div class="field"><label>Present candidates to customer for selection?</label>
            <select id="f-present-customer">
              <option value="No" selected>No</option>
              <option value="Yes">Yes</option>
            </select>
          </div>
          <div class="field" id="present-count-field" style="display:none;">
            <label>How many candidates?</label>
            <input id="f-present-count" type="number" min="1" placeholder="e.g. 3" />
          </div>
        </div>
        <div class="field full">
          <label>Requirements (certs, e.g. SGRE eLearning profile, GWO BST, BTT, ART)</label>
          <textarea id="f-requirements" placeholder="List required certifications / training"></textarea>
        </div>
        <div class="field full">
          <label>Skills (if not already covered in job description)</label>
          <textarea id="f-skills" placeholder="Optional — only if this role needs skills beyond the standard job description"></textarea>
        </div>
        <div class="field full">
          <label>Reason for requisition</label>
          <select id="f-reason">
            <option>Backfill</option>
            <option>New Headcount</option>
            <option>Growth</option>
            <option>Other</option>
          </select>
        </div>
        <div class="field full">
          <label>Comments</label>
          <textarea id="f-comments" placeholder="Any additional details, context, or notes for this requisition…"></textarea>
        </div>
        <div class="panel-actions">
          <button class="btn btn-ghost" id="cancel-btn">Cancel</button>
          <button class="btn btn-ghost" id="save-draft-btn">Save as draft</button>
          <button class="btn btn-primary" id="submit-btn">Submit for approval</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e)=>{ if(e.target===overlay) overlay.remove(); });
    overlay.querySelector('#cancel-btn').addEventListener('click', ()=>overlay.remove());

    const deptSelect = overlay.querySelector('#f-department');
    const titleSelect = overlay.querySelector('#f-title');
    const otherRow = overlay.querySelector('#other-title-row');
    const otherInput = overlay.querySelector('#f-title-other');
    deptSelect.addEventListener('change', ()=>{
      const titles = titlesForDept(deptSelect.value);
      titleSelect.disabled = titles.length === 0;
      titleSelect.innerHTML = titles.length
        ? `<option value="" selected disabled>Select job title…</option>` + titles.map(t=>`<option value="${t}">${t}</option>`).join('') + `<option value="__other__">Other (request a new title)</option>`
        : `<option value="" selected>Select department first…</option>`;
      otherRow.style.display = 'none';
      otherInput.value = '';
    });
    titleSelect.addEventListener('change', ()=>{
      const isOther = titleSelect.value === '__other__';
      otherRow.style.display = isOther ? '' : 'none';
      if(!isOther) otherInput.value = '';
    });

    const presentSelect = overlay.querySelector('#f-present-customer');
    const presentCountField = overlay.querySelector('#present-count-field');
    presentSelect.addEventListener('change', ()=>{
      presentCountField.style.display = presentSelect.value === 'Yes' ? '' : 'none';
      if(presentSelect.value !== 'Yes') overlay.querySelector('#f-present-count').value = '';
    });

    async function submit(status){
      const isOtherTitle = titleSelect.value === '__other__';
      const title = isOtherTitle ? overlay.querySelector('#f-title-other').value.trim() : overlay.querySelector('#f-title').value.trim();
      const department = overlay.querySelector('#f-department').value.trim();
      const manager = overlay.querySelector('#f-manager').value.trim();
      if(!title || !department || !manager){
        alert(isOtherTitle && !title
          ? 'Please enter the requested job title.'
          : 'Job title, department, and hiring manager are required.');
        return;
      }
      const now = new Date().toISOString();
      const req = {
        id: genId(),
        title, department, hiringManager: manager,
        isNewTitleRequest: isOtherTitle,
        customerTitle: overlay.querySelector('#f-title-customer').value.trim(),
        customerProject: overlay.querySelector('#f-customer-project').value.trim(),
        employmentType: overlay.querySelector('#f-type').value,
        location: overlay.querySelector('#f-location').value.trim(),
        headcount: parseInt(overlay.querySelector('#f-headcount').value)||1,
        targetStartDate: overlay.querySelector('#f-start').value,
        travelPercent: overlay.querySelector('#f-travel').value,
        priority: overlay.querySelector('#f-priority').value,
        presentToCustomer: presentSelect.value,
        presentCount: presentSelect.value === 'Yes' ? overlay.querySelector('#f-present-count').value : '',
        requirements: overlay.querySelector('#f-requirements').value.trim(),
        skills: overlay.querySelector('#f-skills').value.trim(),
        reason: overlay.querySelector('#f-reason').value,
        comments: overlay.querySelector('#f-comments').value.trim(),
        status: status,
        notes: '',
        createdAt: now,
        updatedAt: now,
        statusChangedAt: now
      };
      requisitions.push(req);
      await persist();
      overlay.remove();
      activeTab = "All";
      render();
    }

    overlay.querySelector('#save-draft-btn').addEventListener('click', ()=>submit("Draft"));
    overlay.querySelector('#submit-btn').addEventListener('click', ()=>submit("Pending Approval"));
  }

  function openSettingsModal(){
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `
      <div class="panel" style="max-width:440px;">
        <h2>Approver access code</h2>
        <p class="panel-sub">This code gates who can add a requested title to the standard list. Anyone with the code can change it — share it only with approvers.</p>
        <div class="field full"><label>Current code</label><input type="text" id="s-current" placeholder="Enter current code" /></div>
        <div class="field full"><label>New code</label><input type="text" id="s-new" placeholder="Enter new code" /></div>
        <div class="field full"><label>Confirm new code</label><input type="text" id="s-confirm" placeholder="Re-enter new code" /></div>
        <div class="panel-actions">
          <button class="btn btn-ghost" id="s-cancel">Cancel</button>
          <button class="btn btn-primary" id="s-save">Update code</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e)=>{ if(e.target===overlay) overlay.remove(); });
    overlay.querySelector('#s-cancel').addEventListener('click', ()=>overlay.remove());
    overlay.querySelector('#s-save').addEventListener('click', async ()=>{
      const cur = overlay.querySelector('#s-current').value;
      const next = overlay.querySelector('#s-new').value.trim();
      const confirm = overlay.querySelector('#s-confirm').value.trim();
      if(cur !== currentPasscode()){ alert('Current code is incorrect.'); return; }
      if(!next || next !== confirm){ alert('New code and confirmation must match and cannot be blank.'); return; }
      approverPasscode = next;
      try{
        await apiSet('approverPasscode', approverPasscode);
        alert('Access code updated.');
        overlay.remove();
      }catch(e){
        alert('Could not save the new code — please try again.');
      }
    });
  }
  document.getElementById('settings-btn').addEventListener('click', openSettingsModal);

  function openPromoteGate(r){
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `
      <div class="panel" style="max-width:420px;">
        <h2>Add "${escapeHtml(r.title)}" to standard list</h2>
        <p class="panel-sub">Requires approver access code. This is logged against the requisition.</p>
        <div class="field full"><label>Your name</label><input type="text" id="p-name" placeholder="e.g. Patricia Birchfield" /></div>
        <div class="field full"><label>Access code</label><input type="text" id="p-code" placeholder="Enter approver access code" /></div>
        <div class="panel-actions">
          <button class="btn btn-ghost" id="p-cancel">Cancel</button>
          <button class="btn btn-primary" id="p-confirm">Confirm</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e)=>{ if(e.target===overlay) overlay.remove(); });
    overlay.querySelector('#p-cancel').addEventListener('click', ()=>overlay.remove());
    overlay.querySelector('#p-confirm').addEventListener('click', async ()=>{
      const name = overlay.querySelector('#p-name').value.trim();
      const code = overlay.querySelector('#p-code').value;
      if(!name){ alert('Please enter your name.'); return; }
      if(code !== currentPasscode()){ alert('Incorrect access code.'); return; }
      if(!customTitles[r.department]) customTitles[r.department] = [];
      if(!customTitles[r.department].includes(r.title)){
        customTitles[r.department].push(r.title);
      }
      r.titlePromoted = true;
      r.promotedBy = name;
      r.promotedAt = new Date().toISOString();
      r.updatedAt = r.promotedAt;
      await persistCustomTitles();
      await persist();
      overlay.remove();
      render();
    });
  }

  loadData();
})();

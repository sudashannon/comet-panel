'use strict';

let state = {
  dir: '../miao/openspec',
  changes: [],
  selectedName: null,
  changeDetail: null,
  activeArtifact: null,
  filters: { search:'', status:'all', workflow:'', phase:'' },
  chat: {
    messages: [],
    contextFiles: [],
    pendingImages: [],
    isStreaming: false,
    scrollPinned: true,
    showAtMenu: false,
    atFilter: '',
    atIndex: 0,
    showSettings: false,
    showThinking: true
  }
};

window.addEventListener('load', () => {
  document.getElementById('dir-input').value = state.dir;
  loadChanges();
  loadConfig();
});

async function api(url, opts) { const res = await fetch(url, opts||{}); if(!res.ok) throw new Error(res.statusText); return res.json(); }
async function apiText(url, opts) { const res = await fetch(url, opts||{}); if(!res.ok) throw new Error(res.statusText); return res.text(); }
function getDirParam() { return 'dir='+encodeURIComponent(state.dir); }

async function loadConfig() {
  try {
    const data = await api('/api/chat/config');
    state.chat.showThinking = true;
    if (data.providers) {
      for (const k of Object.keys(data.providers)) {
        if (data.providers[k].thinking === 'disabled') state.chat.showThinking = false;
      }
    }
  } catch (e) {}
}

async function loadChanges() {
  try { const data = await api('/api/changes?'+getDirParam()); state.changes = data.changes||[]; }
  catch(e) { state.changes = []; }
  state.selectedName = null; state.changeDetail = null; state.activeArtifact = null;
  state.chat.messages = []; state.chat.contextFiles = [];
  renderAll();
}
function onScan() { state.dir = document.getElementById('dir-input').value.trim()||'../miao/openspec'; loadChanges(); }
function onDirKey(e) { if(e.key==='Enter') onScan(); }

function onFilterChange() {
  state.filters.search = document.getElementById('search').value;
  state.filters.status = document.getElementById('filter-status').value;
  state.filters.workflow = document.getElementById('filter-workflow').value;
  state.filters.phase = document.getElementById('filter-phase').value;
  renderList();
}

function renderAll() { renderList(); renderDetail(); }

function renderList() {
  const el = document.getElementById('list-body');
  const active = state.changes.filter(c=>!c.archived), archived = state.changes.filter(c=>c.archived);
  const showA = state.filters.status!=='archived', showR = state.filters.status!=='active';
  let fa = showA?filter(active):[], fr = showR?filter(archived):[];
  document.getElementById('total-count').textContent = '共 '+(fa.length+fr.length)+' 个 change';
  let h = '';
  if(showA) h += renderGroup('ACTIVE_GROUP','活跃',fa,true);
  if(showR) h += renderGroup('ARCHIVE_GROUP','已归档',fr,false);
  if(!h) h = '<div class="no-results">没有匹配的 change</div>';
  el.innerHTML = h;
}
function filter(arr) {
  let r = arr;
  if(state.filters.search) { const q=state.filters.search.toLowerCase(); r=r.filter(c=>c.name.toLowerCase().includes(q)); }
  if(state.filters.workflow) r=r.filter(c=>c.workflow===state.filters.workflow);
  if(state.filters.phase) r=r.filter(c=>c.phase===state.filters.phase);
  return r;
}
function renderGroup(id,label,changes,active){if(!changes.length)return'';return`<div class="group-header" onclick="toggleGroup('${id}')"><span class="arrow">▼</span> ${label} <span class="count">(${changes.length})</span></div><div id="${id}">${changes.map(c=>renderRow(c,active)).join('')}</div>`;}
function renderRow(c,active){
  const pct=c.tasksTotal>0?Math.round(c.tasksCompleted/c.tasksTotal*100):0,sel=state.selectedName===c.name?' selected':'';
  if(active) return`<div class="change-row${sel}" onclick="selectChange('${esc(c.name)}')"><div class="name">${esc(c.name)}</div><span class="badge badge-${c.workflow||'full'}">${esc(c.workflow||'?')}</span><div class="progress-mini"><span>${c.tasksCompleted}/${c.tasksTotal}</span><div class="progress-mini-bar"><div class="progress-mini-fill" style="width:${pct}%"></div></div></div><span class="badge badge-${c.verifyResult}">${esc(c.verifyResult)}</span>${artifactBadges(c.artifacts)}</div>`;
  return`<div class="change-row${sel}" onclick="selectChange('${esc(c.name)}')"><div class="name-archive"><span class="date">${esc(c.createdAt)}</span> ${esc(c.name)}</div><span class="badge badge-${c.workflow||'full'}">${esc(c.workflow||'?')}</span><span class="badge badge-${c.verifyResult}">${esc(c.verifyResult)}</span></div>`;
}
function artifactBadges(a){if(!a)return'';const m=[['P','proposal'],['D','design'],['T','tasks'],['P','plan'],['R','verifyReport']];return'<div class="artifact-dots">'+m.map(([l,k])=>`<span class="artifact-dot ${a[k]?'ok':'miss'}" title="${k}">${l}</span>`).join('')+'</div>';}
function toggleGroup(id){const e=document.getElementById(id),h=e.previousElementSibling;if(e.style.display==='none'){e.style.display='';h.classList.remove('collapsed');}else{e.style.display='none';h.classList.add('collapsed');}}

async function selectChange(name) {
  state.selectedName = name; state.activeArtifact = null;
  state.chat.contextFiles = [];
  renderList();
  try { state.changeDetail = await api('/api/changes/'+encodeURIComponent(name)+'?'+getDirParam()); }
  catch(e) { state.changeDetail = null; }
  renderDetail();
  loadChatSession();
}
function renderDetail() {
  const el = document.getElementById('detail-panel'), d = state.changeDetail;
  if(!d) { el.innerHTML = '<div class="detail-empty">← 点击左侧 change 查看详情</div>'; return; }
  const pct = d.tasksTotal>0?Math.round(d.tasksCompleted/d.tasksTotal*100):0, dateStr = d.createdAt?` | ${esc(d.createdAt)}`:'';
  el.innerHTML = `<div class="detail-content"><div class="meta-bar"><div class="meta-item"><strong>Workflow:</strong> <span class="badge badge-${d.workflow||'full'}">${esc(d.workflow||'?')}</span></div><div class="meta-item"><strong>Phase:</strong> ${esc(d.phase||'?')}</div><div class="meta-item"><strong>进度:</strong> ${d.tasksCompleted}/${d.tasksTotal}</div><div class="meta-item"><strong>Verify:</strong> <span class="badge badge-${d.verifyResult||'pending'}">${esc(d.verifyResult||'pending')}</span></div><div class="meta-item meta-change-name">📋 ${esc(d.name||'')}${dateStr}</div></div><div class="detail-body"><div class="phase-tree" id="phase-tree">${renderPhaseTree(d.phases)}</div><div class="content-panel" id="content-panel"><div class="empty-state">← 点击左侧产物文件查看内容</div></div></div></div>`;
  if(!state.activeArtifact) { for(const p of d.phases) for(const a of p.artifacts) if(a.exists) { selectArtifact(a); return; } }
}

function renderPhaseTree(phases) {
  if(!phases) return '';
  return phases.map(p=>`<div class="phase-node"><div class="phase-label"><span class="dot ${p.status}"></span> ${esc(p.label)}</div>${(p.artifacts||[]).map(a=>`<div class="artifact-item${!a.exists?' missing':''}${state.activeArtifact&&state.activeArtifact.path===a.path?' active':''}" ${a.exists?`onclick="selectArtifact(${JSON.stringify(a).replace(/\"/g,'&quot;')})"`:''}>📄 ${esc(a.label)}<span style="margin-left:auto;font-size:10px;color:${a.exists?'var(--success)':'var(--muted)'}">${a.exists?'✓':'✗'}</span></div>`).join('')}</div>`).join('');
}

async function selectArtifact(art) {
  state.activeArtifact = art;
  const treeEl = document.getElementById('phase-tree');
  if(state.changeDetail&&treeEl) treeEl.innerHTML = renderPhaseTree(state.changeDetail.phases);
  if(!state.chat.contextFiles.length) state.chat.contextFiles = [{path: art.path, label: art.label}];
  renderChatContext();
  const panel = document.getElementById('content-panel');
  if(!panel) return;
  if(!art.exists) { panel.innerHTML = '<div class="empty-state">文件不存在</div>'; return; }
  panel.innerHTML = '<div class="empty-state">加载中...</div>';
  try {
    const params = new URLSearchParams({path:art.path,dir:state.dir});
    const text = await apiText('/api/artifact?'+params.toString());
    let extra = '';
    if(art.isTasks&&state.changeDetail){const d=state.changeDetail;const pct=d.tasksTotal>0?Math.round(d.tasksCompleted/d.tasksTotal*100):0;extra=`<div class="task-progress"><span class="big-text">${d.tasksCompleted}/${d.tasksTotal}</span><div class="big-bar"><div class="big-bar-fill" style="width:${pct}%"></div></div><span>${pct}%</span></div>`;}
    panel.innerHTML = extra;
    await renderMarkdown(text, panel);
  } catch(e) { panel.innerHTML = `<div class="empty-state">加载失败: ${esc(e.message)}</div>`; }
}

async function renderMarkdown(text, container) {
  if(typeof marked === 'undefined') { container.innerHTML += '<div class="markdown-body">'+esc(text)+'</div>'; return; }
  let html = marked.parse(text);
  const wrapper = document.createElement('div'); wrapper.className = 'markdown-body'; wrapper.innerHTML = html;
  container.appendChild(wrapper);
  const blocks = wrapper.querySelectorAll('code.language-mermaid');
  for (const block of blocks) {
    const code = block.textContent.trim();
    const id = 'mermaid-'+Math.random().toString(36).slice(2,9);
    try {
      if(typeof mermaid !== 'undefined') {
        const {svg} = await mermaid.render(id, code);
        block.parentElement.outerHTML = '<div class="mermaid-container">'+svg+'</div>';
      } else {
        block.parentElement.outerHTML = '<pre><code class="language-mermaid">'+esc(code)+'</code></pre>';
      }
    } catch(e) {
      block.parentElement.outerHTML = '<div class="mermaid-error">Mermaid 渲染失败: '+esc(e.message)+'</div>';
    }
  }
  fixTables(wrapper);
}

function fixTables(el) {
  el.querySelectorAll('table').forEach(tbl => {
    if(tbl.parentElement.classList.contains('table-wrapper')) return;
    const wrap = document.createElement('div');
    wrap.className = 'table-wrapper';
    wrap.style.cssText = 'overflow-x:auto;max-width:100%';
    tbl.parentNode.insertBefore(wrap, tbl);
    wrap.appendChild(tbl);
  });
}

async function loadChatSession() {
  try {
    const data = await api('/api/chat/session?change='+encodeURIComponent(state.selectedName));
    state.chat.messages = data.messages || [];
  } catch(e) { state.chat.messages = []; }
  renderChatMessages();
}

function renderChatContext() {
  const el = document.getElementById('chat-context');
  if(!el) return;
  el.innerHTML = state.chat.contextFiles.map(f=>`<span class="ctx-tag">${esc(f.label)} <span class="remove" onclick="removeContextFile('${esc(f.label)}')">×</span></span>`).join('');
}

function removeContextFile(lbl) {
  state.chat.contextFiles = state.chat.contextFiles.filter(x=>x.label!==lbl);
  renderChatContext();
}

function renderChatMessages() {
  const el = document.getElementById('chat-messages');
  if(!el) return;
  if(!state.chat.messages.length) {
    el.innerHTML = '<div style="text-align:center;color:var(--muted);padding:40px 16px;font-size:12px;">选择一个产物文件，开始对话<br>输入 @ 可索引其他文件</div>';
    return;
  }
  let html = '';
  for(const msg of state.chat.messages) {
    if(msg.role==='user') html += renderUserMsg(msg);
    else if(msg.role==='assistant') html += renderAssistantMsg(msg);
  }
  el.innerHTML = html;
  el.querySelectorAll('.markdown-body').forEach(fixTables);
  if(state.chat.scrollPinned) el.scrollTop = el.scrollHeight;
}

function renderUserMsg(msg) {
  let text = '', images = [];
  for(const b of msg.content) {
    if(b.type==='text') text = b.text;
    if(b.type==='image'&&b.source) images.push('data:'+b.source.media_type+';base64,'+b.source.data);
  }
  let imgHtml = images.length?`<div class="images">${images.map(i=>`<img src="${i}">`).join('')}</div>`:'';
  return`<div class="chat-msg user">${imgHtml}<div class="bubble">${esc(text)}</div></div>`;
}

function renderAssistantMsg(msg) {
  let text = '', thinking = '';
  for(const b of msg.content) {
    if(b.type==='text') text = b.text;
    if(b.type==='thinking') thinking += (b.thinking||'');
  }
  let thinkingHtml = '';
  if(thinking.trim()) {
    thinkingHtml = state.chat.showThinking
      ? `<div class="thinking-block" onclick="this.classList.toggle('expanded');this.dataset.expanded=this.dataset.expanded==='1'?'0':'1';this.style.maxHeight=this.dataset.expanded==='1'?'none':'30px'">💭 ${esc(thinking.slice(0,100))}${thinking.length>100?'...':''}<div style="display:none">${esc(thinking)}</div></div>`
      : '';
  }
  const md = text ? marked.parse(text) : '';
  const estTokens = Math.round((text.length+thinking.length)/2);
  return`<div class="chat-msg assistant">${thinkingHtml}<div class="bubble"><div class="markdown-body">${md}</div></div><div class="token-usage">📊 ~${estTokens} tokens</div></div>`;
}

async function sendMessage() {
  const input = document.getElementById('chat-input');
  const msg = input.value.trim();
  if(!msg && !state.chat.pendingImages.length) return;
  if(!state.selectedName) return;

  const userContent = [{type:'text',text:msg||'(image)'}];
  for(const img of state.chat.pendingImages) {
    const parts = img.split(';base64,');
    userContent.push({type:'image',source:{media_type:parts[0].replace('data:',''),data:parts[1]||''}});
  }
  const userMsg = {role:'user',content:userContent};
  state.chat.messages.push(userMsg);

  const images = [...state.chat.pendingImages];
  state.chat.pendingImages = [];
  input.value = '';
  renderPreviewImages();
  renderChatMessages();
  input.focus();

  const assistantMsg = {role:'assistant',content:[{type:'thinking',thinking:''},{type:'text',text:''}],streaming:true};
  state.chat.messages.push(assistantMsg);
  renderChatMessages();

  state.chat.isStreaming = true;
  const messagesEl = document.getElementById('chat-messages');
  const scrollBottom = () => { if(state.chat.scrollPinned) messagesEl.scrollTop = messagesEl.scrollHeight; };

  try {
    const res = await fetch('/api/chat/message', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        change: state.selectedName,
        message: msg||'请分析这张图片',
        context_files: state.chat.contextFiles.map(f => f.path),
        images: images
      })
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while(true) {
      const {done,value} = await reader.read();
      if(done) break;
      buffer += decoder.decode(value,{stream:true});
      const lines = buffer.split('\n');
      buffer = lines.pop()||'';

      for(const line of lines) {
        if(!line.startsWith('data: ')) continue;
        try {
          const event = JSON.parse(line.slice(6));
          const last = state.chat.messages[state.chat.messages.length-1];
          if(event.type==='thinking') {
            last.content[0].thinking += event.content;
          } else if(event.type==='delta') {
            last.content[1].text += event.content;
          }
        } catch(e) {}
      }
      renderChatMessages();
      scrollBottom();
    }
  } catch(e) {
    const last = state.chat.messages[state.chat.messages.length-1];
    last.content[1].text += '\n\n**[错误]** '+e.message;
  }

  state.chat.messages[state.chat.messages.length-1].streaming = false;
  state.chat.isStreaming = false;
  renderChatMessages();
}

function onChatKey(e) {
  // When @ menu is open, keys navigate/select it (and must NOT send the message)
  if (state.chat.showAtMenu) {
    const files = currentAtFiles();
    if (e.key === 'ArrowDown') { e.preventDefault(); state.chat.atIndex = Math.min(state.chat.atIndex + 1, files.length - 1); renderAtMenu(files); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); state.chat.atIndex = Math.max(state.chat.atIndex - 1, 0); renderAtMenu(files); return; }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); if (files.length) insertAtFile(files[state.chat.atIndex].label); return; }
    if (e.key === 'Escape') { e.preventDefault(); state.chat.showAtMenu = false; hideAtMenu(); return; }
  }
  // Menu closed: Enter sends the message
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
}

function onChatInput(e) {
  const input = e.target;
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 100) + 'px';

  const cursorPos = input.selectionStart;
  const text = input.value;
  const atIdx = text.lastIndexOf('@', cursorPos - 1);

  if (atIdx >= 0 && cursorPos > atIdx) {
    const fragment = text.slice(atIdx + 1, cursorPos);
    // only trigger while typing the token (no whitespace between @ and cursor)
    if (/\s/.test(fragment)) { state.chat.showAtMenu = false; hideAtMenu(); return; }
    state.chat.atFilter = fragment.toLowerCase();
    const files = currentAtFiles();
    if (files.length) {
      state.chat.showAtMenu = true;
      state.chat.atIndex = 0;
      renderAtMenu(files);
    } else {
      state.chat.showAtMenu = false; hideAtMenu();
    }
  } else {
    state.chat.showAtMenu = false; hideAtMenu();
  }
}

function currentAtFiles() {
  const f = state.chat.atFilter || '';
  return getArtifactFilesWithPaths().filter(x => x.label.toLowerCase().includes(f));
}

function renderAtMenu(files) {
  showAtMenu(files.map((x, i) =>
    `<div class="at-menu-item${i === state.chat.atIndex ? ' selected' : ''}" onmousedown="event.preventDefault();insertAtFile('${esc(x.label)}')">📄 ${esc(x.label)}</div>`
  ).join(''));
}

function insertAtFile(name) {
  const input = document.getElementById('chat-input');
  const text = input.value;
  const cursorPos = input.selectionStart;
  const atIdx = text.lastIndexOf('@', cursorPos-1);
  if (atIdx >= 0) input.value = text.slice(0, atIdx) + text.slice(cursorPos);
  // resolve label to artifact path
  const files = getArtifactFilesWithPaths();
  const match = files.find(f=>f.label===name);
  if(match && !state.chat.contextFiles.some(x=>x.path===match.path)) {
    state.chat.contextFiles.push({path: match.path, label: match.label});
    renderChatContext();
  }
  state.chat.showAtMenu = false;
  state.chat.atIndex = 0;
  state.chat.atFilter = '';
  hideAtMenu();
  input.focus();
}

function getArtifactFilesWithPaths() {
  if(!state.changeDetail) return [];
  const files = [];
  for(const p of state.changeDetail.phases) for(const a of p.artifacts) if(a.exists) files.push({path:a.path, label:a.label});
  return files;
}

function showAtMenu(html) {
  let menu = document.getElementById('at-menu');
  if(!menu) { menu = document.createElement('div'); menu.id = 'at-menu'; menu.className = 'at-menu'; document.querySelector('.chat-input-area').appendChild(menu); }
  menu.innerHTML = html;
  menu.style.display = 'block';
}
function hideAtMenu() { const menu = document.getElementById('at-menu'); if(menu) menu.style.display = 'none'; }

function onChatPaste(e) {
  const items = e.clipboardData?.items;
  if(!items) return;
  for(const item of items) {
    if(item.type.startsWith('image/')) {
      const file = item.getAsFile();
      const reader = new FileReader();
      reader.onload = () => { state.chat.pendingImages.push(reader.result); renderPreviewImages(); };
      reader.readAsDataURL(file);
    }
  }
}
function onAttachClick() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
  inp.onchange = () => { for(const f of inp.files){ const r=new FileReader(); r.onload=()=>{state.chat.pendingImages.push(r.result);renderPreviewImages();}; r.readAsDataURL(f); } };
  inp.click();
}
function renderPreviewImages() {
  const el = document.getElementById('preview-images');
  if(!el) return;
  el.innerHTML = state.chat.pendingImages.map((img,i)=>`<div class="preview-img"><img src="${img}"><span class="remove-img" onclick="removePreviewImage(${i})">×</span></div>`).join('');
}
function removePreviewImage(i) { state.chat.pendingImages.splice(i,1); renderPreviewImages(); }

function clearChat() {
  if(!state.selectedName) return;
  fetch('/api/chat/session?change='+encodeURIComponent(state.selectedName),{method:'DELETE'});
  state.chat.messages = []; state.chat.contextFiles = [];
  renderChatMessages(); renderChatContext();
}
function exportChat() {
  const md = state.chat.messages.map(m=>{
    if(m.role==='user') { const t=m.content.find(b=>b.type==='text'); return '**👤 用户:** '+(t?t.text:'(image)'); }
    if(m.role==='assistant') { const t=m.content.find(b=>b.type==='text'); return '**🤖 AI:** '+(t?t.text:'')+'\n'; }
    return '';
  }).join('\n\n---\n\n');
  const blob = new Blob(['# Chat Export: '+state.selectedName+'\n\n'+md],{type:'text/markdown'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'chat-'+state.selectedName+'.md'; a.click();
}

function toggleSettings() { state.chat.showSettings = !state.chat.showSettings; renderSettings(); }
function renderSettings() {
  let overlay = document.getElementById('settings-overlay');
  if(!state.chat.showSettings) { if(overlay) overlay.remove(); return; }
  if(!overlay) { overlay = document.createElement('div'); overlay.id = 'settings-overlay'; overlay.className = 'settings-overlay'; document.body.appendChild(overlay); }
  overlay.innerHTML = `<div class="settings-panel"><h3>⚙ Chat 设置</h3><label>Provider</label><select id="cfg-provider" onchange="onProviderChange()"><option>minimax</option></select><label>API Key</label><input id="cfg-apikey" type="password" placeholder="sk-xxxx"><label>Model</label><select id="cfg-model"></select><label>API Base URL</label><input id="cfg-apibase" placeholder="https://api.minimaxi.com"><label>Temperature</label><input id="cfg-temp" type="number" step="0.1" min="0" max="2" value="1"><label>Max Tokens</label><input id="cfg-maxtokens" type="number" value="4096"><label>Thinking</label><select id="cfg-thinking"><option value="auto">开启</option><option value="disabled">关闭</option></select><div class="settings-actions"><button class="btn-secondary" onclick="toggleSettings()">取消</button><button class="btn-primary" onclick="saveSettings()">保存</button></div></div>`;
  (async()=>{
    try {
      const provs = await api('/api/chat/providers');
      const sel = document.getElementById('cfg-provider');
      sel.innerHTML = provs.providers.map(p=>`<option value="${p.name}">${p.name}</option>`).join('');
      sel.value = provs.active;
      onProviderChange();
      const cfg = await api('/api/chat/config');
      const pc = cfg.providers[provs.active]||{};
      document.getElementById('cfg-apikey').value = pc.api_key||'';
      document.getElementById('cfg-apibase').value = pc.api_base||'';
      document.getElementById('cfg-model').value = pc.model||'';
      document.getElementById('cfg-temp').value = pc.temperature||1;
      document.getElementById('cfg-maxtokens').value = pc.max_tokens||4096;
      document.getElementById('cfg-thinking').value = pc.thinking||'auto';
    } catch(e) {}
  })();
}
function onProviderChange() {
  const name = document.getElementById('cfg-provider').value;
  fetch('/api/chat/providers').then(r=>r.json()).then(d=>{
    const p = d.providers.find(x=>x.name===name);
    if(p) { const sel = document.getElementById('cfg-model'); sel.innerHTML = p.models.map(m=>`<option>${m}</option>`).join(''); }
  });
}
async function saveSettings() {
  const prov = document.getElementById('cfg-provider').value;
  const cfg = {
    active_provider: prov,
    providers: { [prov]: {
      api_key: document.getElementById('cfg-apikey').value,
      api_base: document.getElementById('cfg-apibase').value,
      model: document.getElementById('cfg-model').value,
      temperature: parseFloat(document.getElementById('cfg-temp').value),
      max_tokens: parseInt(document.getElementById('cfg-maxtokens').value),
      thinking: document.getElementById('cfg-thinking').value
    }}
  };
  try {
    await fetch('/api/chat/config',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(cfg)});
    state.chat.showThinking = document.getElementById('cfg-thinking').value !== 'disabled';
    toggleSettings();
  } catch(e) { alert('保存失败: '+e.message); }
}

function esc(s) { if(!s) return ''; return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

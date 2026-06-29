document.addEventListener('DOMContentLoaded', () => {

  let activeTab   = 0;
  let results     = { 0: null, 1: null, 2: null, 3: null };
  let running     = false;
  let chatHistory = [];
  let agentFolderPath = null;

  const $ = (id) => document.getElementById(id);

  const runBtn       = $('runBtn');
  const runLabel     = runBtn?.querySelector('.run-label');
  const runIcon      = runBtn?.querySelector('.run-icon');
  const spinIcon     = runBtn?.querySelector('.spin-icon');
  const progressWrap = $('progressWrap');
  const progressFill = $('progressFill');
  const progressLbl  = $('progressLabel');
  const copyBtn      = $('copyBtn');
  const saveBtn      = $('saveBtn');
  const charCount    = $('charCount');
  const reqDoc       = $('reqDoc');
  const apiKeyInput  = $('apiKey');
  const sidebar      = $('sidebar');
  const chatDrawer   = $('chatDrawer');
  const chatBackdrop = $('chatBackdrop');
  const chatFab      = $('chatFab');
  const chatClose    = $('chatClose');
  const chatMessages = $('chatMessages');
  const chatInput    = $('chatInput');
  const chatSendBtn  = $('chatSend');
  const rehealBtn    = $('rehealBtn');

  console.log('DOM ready | chatFab:', !!chatFab, '| chatDrawer:', !!chatDrawer, '| runBtn:', !!runBtn);

  /* ── Sidebar ──────────────────────────────────────────── */
  $('sidebarToggle')?.addEventListener('click', () => sidebar?.classList.toggle('collapsed'));

  $('toggleKey')?.addEventListener('click', () => {
    if (apiKeyInput) apiKeyInput.type = apiKeyInput.type === 'password' ? 'text' : 'password';
  });

  /* ── Provider switching ───────────────────────────────────── */
  let activeProvider = 'anthropic';

  document.querySelectorAll('.provider-tab').forEach(btn => {
    btn.addEventListener('click', () => switchProvider(btn.dataset.provider));
  });

  $('toggleOpenAIKey')?.addEventListener('click', () => {
    const input = $('openaiKey');
    if (input) input.type = input.type === 'password' ? 'text' : 'password';
  });

  function switchProvider(provider) {
    activeProvider = provider;

    // Update tab styles
    document.querySelectorAll('.provider-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.provider === provider);
    });

    // Show/hide sections
    $('sectionAnthropic')?.toggleAttribute('hidden', provider !== 'anthropic');
    $('sectionOpenAI')?.toggleAttribute  ('hidden', provider !== 'openai');

    // Update provider badge in topbar if it exists
    const badge = $('providerBadge');
    if (badge) {
      badge.className  = `provider-badge ${provider}`;
      badge.textContent = provider === 'anthropic' ? '⬡ Claude' : '◎ OpenAI';
    }

    console.log('Provider switched to:', provider);
  }

/* ── Claude model selector ────────────────────────────────── */
  const claudeModelSelect = $('claudeModel');
  const claudeModelDesc   = $('claudeModelDesc');

  const MODEL_DESCRIPTIONS = {
    'claude-opus-4-6':    'Most capable — best for complex frameworks',
    'claude-sonnet-4-6':  'Best balance of speed and quality',
    'claude-sonnet-3-7':  'Strong reasoning and code generation',
    'claude-sonnet-3-5':  'Fast and capable for most tasks',
    'claude-haiku-3-5':   'Fastest — best for simple test cases',
  };

  claudeModelSelect?.addEventListener('change', () => {
    const model = claudeModelSelect.value;
    if (claudeModelDesc) {
      claudeModelDesc.textContent = MODEL_DESCRIPTIONS[model] || '';
    }
    console.log('Claude model selected:', model);
  });

  function getClaudeModel() {
    return claudeModelSelect?.value || 'claude-sonnet-4-6';
  }

  function getActiveApiKey() {
    if (activeProvider === 'openai') {
      return $('openaiKey')?.value.trim() ?? '';
    }
    return apiKeyInput?.value.trim() ?? '';
  }

  reqDoc?.addEventListener('input', () => {
    const n = reqDoc.value.length;
    if (charCount) charCount.textContent = n.toLocaleString() + ' character' + (n === 1 ? '' : 's');
  });

  /* ── File upload ──────────────────────────────────────────── */
  let uploadedFileText = '';

  const uploadZone  = $('uploadZone');
  const reqFile     = $('reqFile');
  const uploadInfo  = $('uploadInfo');
  const uploadLabel = $('uploadLabel');
  const uploadClear = $('uploadClear');

  uploadZone?.addEventListener('click', () => reqFile?.click());

  uploadZone?.addEventListener('dragover', e => {
    e.preventDefault();
    uploadZone.classList.add('drag-over');
  });

  uploadZone?.addEventListener('dragleave', () => {
    uploadZone.classList.remove('drag-over');
  });

  uploadZone?.addEventListener('drop', e => {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFileUpload(file);
  });

  reqFile?.addEventListener('change', () => {
    const file = reqFile.files?.[0];
    if (file) handleFileUpload(file);
  });

  uploadClear?.addEventListener('click', () => {
    uploadedFileText = '';
    if (uploadInfo)  uploadInfo.setAttribute('hidden', '');
    if (uploadZone)  uploadZone.removeAttribute('hidden');
    if (uploadLabel) uploadLabel.textContent = 'Click to upload or drag & drop';
    if (reqFile)     reqFile.value = '';
    updateCharCount();
  });

  async function handleFileUpload(file) {
    const allowed = ['text/plain','text/markdown','application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword'];

    const ext = file.name.split('.').pop().toLowerCase();
    const allowedExts = ['txt','md','pdf','docx','doc'];

    if (!allowedExts.includes(ext)) {
      showToast('Unsupported file type — use .txt .md .pdf .docx');
      return;
    }

    showToast('Reading file…');

    try {
      if (ext === 'pdf' || ext === 'docx' || ext === 'doc') {
        // For PDF/DOCX — send to Electron main process to extract text
        if (window.electronAPI?.extractFileText) {
          const arrayBuffer = await file.arrayBuffer();
          const uint8 = new Uint8Array(arrayBuffer);
          uploadedFileText = await window.electronAPI.extractFileText({
            name: file.name,
            ext,
            data: Array.from(uint8)
          });
        } else {
          // Browser fallback — read as text (works for txt/md)
          uploadedFileText = await file.text();
        }
      } else {
        // Plain text / markdown
        uploadedFileText = await file.text();
      }

      // Show file info bar
      const kb = (file.size / 1024).toFixed(1);
      if ($('uploadFileName')) $('uploadFileName').textContent = file.name;
      if ($('uploadFileSize')) $('uploadFileSize').textContent = `${kb} KB`;
      uploadInfo?.removeAttribute('hidden');
      uploadZone?.setAttribute('hidden', '');
      updateCharCount();
      showToast(`✓ ${file.name} loaded`);

    } catch (err) {
      showToast('Failed to read file: ' + err.message);
      console.error(err);
    }
  }

  function getRequirementsText() {
    // Prefer uploaded file; fall back to textarea
    return uploadedFileText || reqDoc?.value.trim() || '';
  }

  function updateCharCount() {
    const n = getRequirementsText().length;
    if (charCount) charCount.textContent = n.toLocaleString() + ' character' + (n === 1 ? '' : 's');
  }

  /* ── Tabs ─────────────────────────────────────────────── */
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => switchTab(Number(btn.dataset.tab)));
  });

  function switchTab(n) {
    activeTab = n;
    document.querySelectorAll('.tab').forEach((t, i) => {
      t.classList.toggle('active', i === n);
      t.setAttribute('aria-selected', String(i === n));
    });
    document.querySelectorAll('.panel').forEach((p, i) => {
      i === n ? p.removeAttribute('hidden') : p.setAttribute('hidden', '');
    });
    updateActionButtons();
  }

  /* ── Copy / Save ──────────────────────────────────────── */
  copyBtn?.addEventListener('click', async () => {
    const text = results[activeTab];
    if (!text) return;
    await navigator.clipboard.writeText(text);
    showToast('Copied to clipboard');
  });

  saveBtn?.addEventListener('click', async () => {
    const text = results[activeTab];
    if (!text) return;
    const names = { 0:'test-cases.md', 1:'cypress-framework.md', 2:'test-scripts.js', 3:'self-heal-report.md' };
    if (window.electronAPI?.saveOutput) {
      const res = await window.electronAPI.saveOutput({ filename: names[activeTab], content: text });
      if (res?.success) showToast('Saved to ' + res.path);
      return;
    }
    const blob = new Blob([text], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), { href: url, download: names[activeTab] }).click();
    URL.revokeObjectURL(url);
    showToast('File downloaded');
  });

  $('extractBtn')?.addEventListener('click', saveFrameworkToDisk);

  function updateActionButtons() {
    const has = !!results[activeTab];
    if (copyBtn) copyBtn.disabled = !has;
    if (saveBtn) saveBtn.disabled = !has;
  }

  /* ══════════════════════════════════════════════════════════
     SESSION PERSISTENCE
     ══════════════════════════════════════════════════════════ */

  let sessionFolderPath = null;

  const saveSessionBtn = $('saveSessionBtn');
  const loadSessionBtn = $('loadSessionBtn');
  const sessionInfoText = $('sessionInfoText');

  // ── Build session object ───────────────────────────────────
  function buildSession() {
    return {
      version:   '1.0',
      savedAt:   new Date().toISOString(),
      baseUrl:   $('baseUrl')?.value.trim()  ?? '',
      modules:   $('modules')?.value.trim()  ?? '',
      results: {
        0: results[0],
        1: results[1],
        2: results[2],
        3: results[3]
      },
      chatHistory
    };
  }

  // ── Restore session into the UI ────────────────────────────
  function restoreSession(session) {
    // Restore input fields
    if (session.baseUrl && $('baseUrl')) {
      $('baseUrl').value = session.baseUrl;
    }
    if (session.modules && $('modules')) {
      $('modules').value = session.modules;
    }

    // Restore results and render all panels
    const res = session.results ?? {};
    [0,1,2,3].forEach(i => {
      if (res[i]) {
        results[i] = res[i];
        renderPanel(i, res[i]);
        $('tab-'+i)?.classList.add('done');
        setStepState(i, 'done');
      }
    });

    // Restore chat history
    if (session.chatHistory?.length) {
      chatHistory = session.chatHistory;
      // Re-render chat messages
      if (chatMessages) {
        $('chatWelcome')?.remove();
        chatHistory.forEach(m => appendChatMessage(m.role, m.content));
      }
    }

    // Enable save button and Excel button
    if (saveSessionBtn) saveSessionBtn.disabled = false;
    if (results[0])     $('excelWrap')?.removeAttribute('hidden');

    updateActionButtons();

    // Show re-heal button if scripts exist in the restored session
if (results[2]) rehealBtn?.removeAttribute('hidden');
  }

  // ── Update session info label ──────────────────────────────
  function setSessionInfo(text, isActive = false) {
    if (sessionInfoText) sessionInfoText.textContent = text;
    const bar = $('sessionBar');
    if (bar) bar.classList.toggle('active', isActive);
  }

  // ── Save session ───────────────────────────────────────────
  saveSessionBtn?.addEventListener('click', async () => {
    if (!window.electronAPI?.saveSession) {
      showToast('Session saving only works in the desktop app');
      return;
    }

    // Pick folder if not already chosen
    if (!sessionFolderPath) {
      sessionFolderPath = await window.electronAPI.pickSessionFolder();
      if (!sessionFolderPath) return;
    }

    const session = buildSession();
    const res     = await window.electronAPI.saveSession({
      folderPath: sessionFolderPath,
      session
    });

    if (res.success) {
      const time = new Date().toLocaleTimeString();
      setSessionInfo(`Saved at ${time}`, true);
      showToast('✓ Session saved to ' + sessionFolderPath);
    } else {
      showToast('Save failed: ' + res.error);
    }
  });

  // ── Load session ───────────────────────────────────────────
  loadSessionBtn?.addEventListener('click', async () => {
    if (!window.electronAPI?.pickSessionFolder) {
      showToast('Session loading only works in the desktop app');
      return;
    }

    const folderPath = await window.electronAPI.pickSessionFolder();
    if (!folderPath) return;

    // Check if session exists and show info before loading
    const check = await window.electronAPI.checkSession({ folderPath });

    if (!check.exists) {
      showToast('No session file found in that folder');
      return;
    }

    // Confirm load
    const savedDate = new Date(check.savedAt).toLocaleString();
    const moduleList = Array.isArray(check.modules)
      ? check.modules.join(', ')
      : check.modules;
    const confirmed = window.confirm(
      `Load session?\n\nSaved: ${savedDate}\nBase URL: ${check.baseUrl}\n\nThis will replace your current results.`
    );
    if (!confirmed) return;

    const res = await window.electronAPI.loadSession({ folderPath });

    if (!res.success) {
      showToast('Load failed: ' + res.error);
      return;
    }

    // Clear current state before restoring
    results     = { 0: null, 1: null, 2: null, 3: null };
    chatHistory = [];
    [0,1,2,3].forEach(i => {
      setStepState(i, 'idle');
      $('tab-'+i)?.classList.remove('done');
      $('empty-'+i)?.removeAttribute('hidden');
      const c = $('content-'+i);
      if (c) { c.setAttribute('hidden',''); c.innerHTML = ''; }
    });
    if (chatMessages) {
      chatMessages.innerHTML = `
        <div class="chat-welcome" id="chatWelcome">
          <p>Session restored. Describe any bug or paste an error and I'll fix the code.</p>
          <div class="chat-suggestions">
            <button class="suggestion-chip" onclick="sendSuggestion(this)">Fix all import errors</button>
            <button class="suggestion-chip" onclick="sendSuggestion(this)">Fix selector errors in auth.cy.js</button>
            <button class="suggestion-chip" onclick="sendSuggestion(this)">Add missing beforeEach hooks</button>
            <button class="suggestion-chip" onclick="sendSuggestion(this)">Fix package.json dependencies</button>
          </div>
        </div>`;
    }

    sessionFolderPath = folderPath;
    restoreSession(res.session);

    const savedDate2 = new Date(res.session.savedAt).toLocaleString();
    setSessionInfo(`Loaded: ${savedDate2}`, true);
    showToast('✓ Session loaded successfully');
    switchTab(0);
  });

  // ── Auto-save after every agent run ───────────────────────
  function autoSaveSession() {
    if (!sessionFolderPath) return;
    if (!window.electronAPI?.saveSession) return;
    const session = buildSession();
    window.electronAPI.saveSession({ folderPath: sessionFolderPath, session })
      .then(res => {
        if (res.success) {
          const time = new Date().toLocaleTimeString();
          setSessionInfo(`Auto-saved at ${time}`, true);
        }
      });
  }

  /* ── Toast ────────────────────────────────────────────── */
  let toastTimer;
  function showToast(msg) {
    const toast = $('toast');
    const span  = $('toastMsg');
    if (!toast || !span) return;
    span.textContent = msg;
    toast.removeAttribute('hidden');
    requestAnimationFrame(() => toast.classList.add('visible'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.setAttribute('hidden', ''), 250);
    }, 2500);
  }

  /* ── Step / Progress ──────────────────────────────────── */
  const STEP_LABELS = {
    running: ['Generating…','Building…','Converting…','Analyzing…'],
    done:    ['✓ Done','✓ Done','✓ Done','✓ Done']
  };

  function setStepState(step, state) {
    const el     = $('step-'   + step);
    const status = $('status-' + step);
    if (!el) return;
    el.dataset.state = state;
    if (status) status.textContent = STEP_LABELS[state]?.[step] ?? '';
  }

  function setProgress(pct, label) {
    if (progressFill) progressFill.style.width = pct + '%';
    if (progressLbl)  progressLbl.textContent  = label;
  }

  /* ── Shimmer ──────────────────────────────────────────── */
  function showLoading(idx) {
    const content = $('content-' + idx);
    const empty   = $('empty-'   + idx);
    if (!content) return;
    empty?.setAttribute('hidden', '');
    content.removeAttribute('hidden');
    content.innerHTML = `
      <div class="loading-state">
        <div class="shimmer" style="height:40px;width:60%"></div>
        <div class="shimmer" style="height:28px;width:85%"></div>
        <div class="shimmer" style="height:28px;width:72%"></div>
        <div class="shimmer" style="height:28px;width:90%"></div>
        <div class="shimmer" style="height:120px;width:100%;margin-top:4px"></div>
      </div>`;
    if (activeTab === idx) switchTab(idx);
  }

  /* ── Render panels ────────────────────────────────────── */
  function renderPanel(idx, text) {
    results[idx] = text;
    const content = $('content-' + idx);
    const empty   = $('empty-'   + idx);
    const tab     = $('tab-'     + idx);
    empty?.setAttribute('hidden', '');
    content?.removeAttribute('hidden');
    tab?.classList.add('done');
    if (idx === 0)      renderTestCases(content, text);
    else if (idx === 3) renderHealLog(content, text);
    else                renderCodeBlock(content, text, idx);
    if (activeTab === idx) updateActionButtons();
    if (idx === 1) $('extractBtn') && ($('extractBtn').disabled = false);
    if (idx === 0) enableTCSelectBtn();
  }

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function renderTestCases(container, text) {
    if (!container) return;
    const lines = text.split('\n');
    let cards = [], current = null;
    lines.forEach(raw => {
      const line = raw.trim();
      if (!line) return;
      // Only treat as header if it matches strict TC-N: [UI/API] pattern
      const tcMatch = line.match(/^TC-(\d+)\s*:\s*\[(UI|API)\]\s*(.+)/i);
      if (tcMatch) {
        if (current) cards.push(current);
        current = {
          id:    `TC-${String(tcMatch[1]).padStart(3,'0')}`,
          title: tcMatch[3].replace(/\*\*/g,'').trim(),
          badge: tcMatch[2].toLowerCase(),
          body:  []
        };
      } else if (current && line && !line.match(/^(UI|API) TEST CASES/i) && !line.match(/^Base URL/i) && line !== '---') {
        // Format body lines nicely
        if (/^steps?\s*:/i.test(line)) {
          current.body.push('<strong>Steps:</strong> ' + line.replace(/^steps?\s*:\s*/i,''));
        } else if (/^preconditions?\s*:/i.test(line)) {
          current.body.push('<strong>Preconditions:</strong> ' + line.replace(/^preconditions?\s*:\s*/i,''));
        } else if (/^expected\s*results?\s*:/i.test(line)) {
          current.body.push('<strong>Expected Result:</strong> ' + line.replace(/^expected\s*results?\s*:\s*/i,''));
        } else if (/^priority\s*:/i.test(line)) {
          current.body.push('<strong>Priority:</strong> ' + line.replace(/^priority\s*:\s*/i,''));
        } else if (/^\d+[.)]\s/.test(line)) {
          current.body.push('&nbsp;&nbsp;' + line);
        } else {
          current.body.push(line);
        }
      }
    });
    if (current) cards.push(current);
    const ui  = cards.filter(c => c.badge === 'ui').length;
    const api = cards.length - ui;
    container.innerHTML = `
      <div class="summary-bar">
        <div class="summary-chip accent"><b>${cards.length}</b> test cases</div>
        <div class="summary-chip"><b>${ui}</b> UI</div>
        <div class="summary-chip"><b>${api}</b> API</div>
      </div>
      <div class="tc-grid">
        ${cards.map((c,i) => `
          <div class="tc-card">
            <div class="tc-head" role="button" tabindex="0" aria-expanded="false">
              <span class="tc-number">${c.id || 'TC-' + String(i+1).padStart(2,'0')}</span>
              <span class="tc-title">${escHtml(c.title)}</span>
              <span class="tc-badge ${c.badge}">${c.badge.toUpperCase()}</span>
              <svg class="tc-chevron" width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M5 3l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <div class="tc-body">${c.body.join('<br>')}</div>
          </div>`).join('')}
      </div>`;
    container.querySelectorAll('.tc-head').forEach(head => {
      const toggle = () => {
        const open = head.parentElement.classList.toggle('open');
        head.setAttribute('aria-expanded', String(open));
      };
      head.addEventListener('click', toggle);
      head.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    });
  }

  function renderCodeBlock(container, text, idx) {
    if (!container) return;
    const langs  = { 1:'markdown / js', 2:'javascript' };
    const colors = { 1:'#a78bfa', 2:'#34d399' };
    container.innerHTML = `
      <div class="code-block">
        <div class="code-header">
          <span class="code-dot" style="background:${colors[idx]||'#8b93a7'}"></span>
          <span class="code-lang">${langs[idx]||'text'}</span>
        </div>
        <pre>${escHtml(text)}</pre>
      </div>`;
  }

  function renderHealLog(container, text) {
    if (!container) return;
    const lines  = text.split('\n');
    const healed = lines.filter(l => /✓|HEALED:/i.test(l)).length;
    const stale  = lines.filter(l => /STALE:/i.test(l)).length;
    const html   = lines.map(raw => {
      const l = escHtml(raw);
      if (/STALE:/i.test(raw))    return `<span class="heal-line heal-stale">${l}</span>`;
      if (/REASON:/i.test(raw))   return `<span class="heal-line heal-reason">${l}</span>`;
      if (/✓|HEALED:/i.test(raw)) return `<span class="heal-line heal-ok">${l}</span>`;
      if (/STRATEGY:/i.test(raw)) return `<span class="heal-line heal-strat">${l}</span>`;
      return `<span class="heal-line heal-plain">${l}</span>`;
    }).join('\n');
    container.innerHTML = `
      <div class="summary-bar">
        <div class="summary-chip"><b>${stale}</b> fragile selectors</div>
        <div class="summary-chip accent"><b>${healed}</b> healed</div>
      </div>
      <div class="code-block" style="flex:1">
        <div class="code-header">
          <span class="code-dot" style="background:#fbbf24"></span>
          <span class="code-lang">self-heal log</span>
        </div>
        <div class="heal-log">${html}</div>
      </div>`;
  }

  /* ── File parser ──────────────────────────────────────── */
  function parseFrameworkFiles(text) {
    const files = [], seen = new Set();
    const regex = /===FILE:\s*([\w./:-]+[^=\s]+)===\s*([\s\S]*?)===ENDFILE===/g;
    let m;
    while ((m = regex.exec(text)) !== null) {
      const name = m[1].trim(), content = m[2].trim();
      if (name && content && !seen.has(name)) { seen.add(name); files.push({ name, content }); }
    }
    return files;
  }

  /* ── Save framework to disk ───────────────────────────── */
  async function saveFrameworkToDisk() {
    if (!results[1]) { showToast('Run the agent first'); return; }
    if (!window.electronAPI?.pickFolder) { showToast('Only works in the desktop app'); return; }

    // Reuse folder from agent run — only ask if not already set
    let folderPath = agentFolderPath;
    if (!folderPath) {
      folderPath = await window.electronAPI.pickFolder();
      if (!folderPath) return;
      agentFolderPath = folderPath;
    }
    const allFiles = [], seen = new Set();
    const add = (parsed) => parsed.forEach(f => { if (!seen.has(f.name)) { seen.add(f.name); allFiles.push(f); } });
    if (results[1]) add(parseFrameworkFiles(results[1]));
    if (results[2]) add(parseFrameworkFiles(results[2]));
    if (results[3]) allFiles.push({ name: 'cypress/reports/self-heal-report.md', content: results[3] });
    if (results[0]) allFiles.push({ name: 'cypress/reports/test-cases.md',       content: results[0] });
    if (allFiles.length === 0) { showToast('No files parsed — check console'); return; }
    try {
      const r = await window.electronAPI.writeFiles({ folderPath, allFiles });
      showToast(`✓ ${r.count} files written`);
    } catch (err) { showToast('Write failed: ' + err.message); }
  }

  /* ── Download test cases as Excel ────────────────────────── */
  $('excelBtn')?.addEventListener('click', downloadTestCasesExcel);

 function downloadTestCasesExcel() {
    const text = results[0];
    if (!text) { showToast('No test cases yet — run the agent first'); return; }

    const rows = parseTestCasesToRows(text);
    console.log('Parsed rows:', rows.length);

    if (rows.length === 0) {
      showToast('Could not parse test cases — check DevTools console');
      return;
    }

    if (window.electronAPI?.generateExcel) {
      // Electron path — generate proper .xlsx via Python/Node on main process
      window.electronAPI.generateExcel({ rows })
        .then(res => {
          if (res.success) showToast(`✓ Excel saved to ${res.path}`);
          else showToast('Excel error: ' + res.error);
        });
    } else {
      // Browser fallback — plain CSV
      exportCSV(rows);
    }
  }

  function exportCSV(rows) {
    const headers = ['ID','Type','Title','Preconditions','Steps','Expected Result','Priority'];
    const lines = [
      headers.join(','),
      ...rows.map(r => headers.map(h => csvCell(r[h] ?? '')).join(','))
    ];
    const csv  = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), { href: url, download: 'test-cases.csv' }).click();
    URL.revokeObjectURL(url);
    showToast(`✓ Downloaded ${rows.length} test cases as CSV`);
  }

 function parseTestCasesToRows(text) {
    const rows    = [];
    let idCounter = 1;

    // Clean up common Claude formatting noise
    const cleaned = text
      .replace(/\*\*(.*?)\*\*/g, '$1')        // remove **bold**
      .replace(/^#{1,4}\s.+$/gm, '')          // remove markdown headers
      .replace(/^---+$/gm, '')                // remove horizontal rules
      .replace(/^Base URL:.+$/gim, '')        // remove base URL lines
      .replace(/^(UI|API) TEST CASES.*$/gim, '') // remove section headers
      .replace(/^Test Cases:.*$/gim, '')      // remove "Test Cases:" lines
      .replace(/^\*{1,2}TC-/gm, 'TC-')       // remove leading ** from TC headers
      .replace(/\*{1,2}$/gm, '')             // remove trailing **
      .replace(/`/g, '')                      // remove backticks
      .trim();

    // Split into blocks on TC-N: pattern
    const blocks = cleaned.split(/\n(?=TC-\d+\s*:\s*\[(?:UI|API)\])/i);

    console.log('Cleaned blocks found:', blocks.length);
    if (blocks[0]) console.log('First block:\n', blocks[0].substring(0, 300));

    blocks.forEach(block => {
      const trimmed = block.trim();
      if (!trimmed) return;

      const lines = trimmed.split('\n').map(l => l.trim()).filter(Boolean);
      if (!lines.length) return;

      // Parse header line: TC-1: [UI] Title
      const headerMatch = lines[0].match(/^TC-(\d+)\s*:\s*\[(UI|API)\]\s*(.+)/i);
      if (!headerMatch) {
        console.log('Skipped (no header match):', lines[0].substring(0, 80));
        return;
      }

      const row = {
        'ID':              `TC-${String(headerMatch[1]).padStart(3,'0')}`,
        'Type':            headerMatch[2].toUpperCase(),
        'Title':           headerMatch[3].trim(),
        'Preconditions':   '',
        'Steps':           '',
        'Expected Result': '',
        'Priority':        'Medium'
      };

      let lastField = null;

      lines.slice(1).forEach(line => {
        // Labelled field detection
        if (/^preconditions?\s*:/i.test(line)) {
          row['Preconditions'] = line.replace(/^preconditions?\s*:\s*/i, '').trim();
          lastField = 'Preconditions';

        } else if (/^steps?\s*:/i.test(line)) {
          row['Steps'] = line.replace(/^steps?\s*:\s*/i, '').trim();
          lastField = 'Steps';

        } else if (/^expected\s*results?\s*:/i.test(line)) {
          row['Expected Result'] = line.replace(/^expected\s*results?\s*:\s*/i, '').trim();
          lastField = 'Expected Result';

        } else if (/^priority\s*:/i.test(line)) {
          row['Priority'] = line.replace(/^priority\s*:\s*/i, '').trim();
          lastField = null;

        // Numbered step line: "1. Do something"
        } else if (/^\d+[.)]\s+/.test(line)) {
          const stepText = line.replace(/^\d+[.)]\s+/, '').trim();
          row['Steps'] += (row['Steps'] ? ' | ' : '') + stepText;
          lastField = 'Steps';

        // Bullet line
        } else if (/^[-*•]\s+/.test(line)) {
          const bulletText = line.replace(/^[-*•]\s+/, '').trim();
          if (lastField === 'Expected Result') {
            row['Expected Result'] += (row['Expected Result'] ? ' | ' : '') + bulletText;
          } else {
            row['Steps'] += (row['Steps'] ? ' | ' : '') + bulletText;
            lastField = 'Steps';
          }

        // Continuation of previous field
        } else if (lastField && lastField !== 'Priority') {
          row[lastField] += ' ' + line;
        }
      });

      // Only add if has a real title (not a section header)
      if (row['Title'] && row['Title'].length > 3) {
        rows.push(row);
        idCounter++;
      }
    });

    // Fallback — if block splitting found nothing, try line scanning
    if (rows.length === 0) {
      console.log('Block split found 0 rows — falling back to line scan');
      return parseTestCasesLineScan(cleaned);
    }

    console.log(`Parsed ${rows.length} test cases`);
    return rows;
  }

  // Fallback line-by-line scanner for unexpected formats
  function parseTestCasesLineScan(text) {
    const rows    = [];
    let idCounter = 1;
    let current   = null;
    let lastField = null;

    const flush = () => {
      if (current?.title && current.title.length > 3) {
        rows.push({
          'ID':              current.id || `TC-${String(idCounter++).padStart(3,'0')}`,
          'Type':            current.type || 'UI',
          'Title':           current.title.trim(),
          'Preconditions':   (current.preconditions || '').trim(),
          'Steps':           (current.steps || '').trim(),
          'Expected Result': (current.expected || '').trim(),
          'Priority':        (current.priority || 'Medium').trim()
        });
      }
      current   = null;
      lastField = null;
    };

    text.split('\n').forEach(raw => {
      const line = raw.trim();
      if (!line) return;

      const hm = line.match(/^TC-(\d+)\s*:\s*\[(UI|API)\]\s*(.+)/i);
      if (hm) {
        flush();
        current = {
          id: `TC-${String(hm[1]).padStart(3,'0')}`,
          type: hm[2].toUpperCase(),
          title: hm[3].trim(),
          preconditions: '', steps: '', expected: '', priority: 'Medium'
        };
        lastField = null;
        return;
      }

      if (!current) return;

      if (/^preconditions?\s*:/i.test(line)) {
        current.preconditions = line.replace(/^preconditions?\s*:\s*/i,'').trim();
        lastField = 'preconditions';
      } else if (/^steps?\s*:/i.test(line)) {
        current.steps = line.replace(/^steps?\s*:\s*/i,'').trim();
        lastField = 'steps';
      } else if (/^expected\s*results?\s*:/i.test(line)) {
        current.expected = line.replace(/^expected\s*results?\s*:\s*/i,'').trim();
        lastField = 'expected';
      } else if (/^priority\s*:/i.test(line)) {
        current.priority = line.replace(/^priority\s*:\s*/i,'').trim();
        lastField = null;
      } else if (/^\d+[.)]\s+/.test(line)) {
        const s = line.replace(/^\d+[.)]\s+/,'').trim();
        current.steps += (current.steps ? ' | ' : '') + s;
        lastField = 'steps';
      } else if (lastField && lastField !== 'priority') {
        current[lastField] += ' ' + line;
      }
    });

    flush();
    return rows;
  }

  function parseOneBlock(block, idCounter) {
    const lines   = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) return null;

    // First line is always the header
    const headerLine = lines[0];
    const hm = headerLine.match(
      /^(?:#{1,3}\s*)?(?:(TC[-\s]?\d+|Test Case\s*\d+|\d+)[.:\-–]\s*)?(?:\[(UI|API)\]\s*)?(.+)/i
    );

    const row = {
      'ID':              hm?.[1] ? hm[1].replace(/\s/,'-').toUpperCase() : `TC-${String(idCounter).padStart(3,'0')}`,
      'Type':            hm?.[2]?.toUpperCase() || (/api|endpoint|request|http/i.test(headerLine) ? 'API' : 'UI'),
      'Title':           (hm?.[3] || headerLine).replace(/\*\*/g,'').trim(),
      'Preconditions':   '',
      'Steps':           '',
      'Expected Result': '',
      'Priority':        'Medium'
    };

    let lastField = null;
    lines.slice(1).forEach(line => {
      if (/^pre-?conditions?[:\s]/i.test(line)) {
        row['Preconditions'] = line.replace(/^pre-?conditions?[:\s]*/i,'').trim();
        lastField = 'Preconditions';
      } else if (/^steps?[:\s]/i.test(line)) {
        row['Steps'] = line.replace(/^steps?[:\s]*/i,'').trim();
        lastField = 'Steps';
      } else if (/^(?:expected\s*results?|expected)[:\s]/i.test(line)) {
        row['Expected Result'] = line.replace(/^(?:expected\s*results?|expected)[:\s]*/i,'').trim();
        lastField = 'Expected Result';
      } else if (/^priority[:\s]/i.test(line)) {
        row['Priority'] = line.replace(/^priority[:\s]*/i,'').trim();
        lastField = null;
      } else if (/^\d+[.)]\s/.test(line)) {
        row['Steps'] += (row['Steps'] ? ' | ' : '') + line;
        lastField = 'Steps';
      } else if (/^[-*]\s/.test(line)) {
        const clean = line.replace(/^[-*]\s/,'');
        const target = lastField === 'Expected Result' ? 'Expected Result' : 'Steps';
        row[target] += (row[target] ? ' | ' : '') + clean;
      } else if (lastField && lastField !== 'Priority') {
        row[lastField] += ' ' + line;
      }
    });

    // Must have at least a title to be valid
    return row['Title'] ? row : null;
  }

  function csvCell(val) {
    const str = String(val).replace(/\r?\n/g,' ');
    // Wrap in quotes if contains comma, quote, or newline
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g,'""') + '"';
    }
    return str;
  }

  /* ── Claude API ───────────────────────────────────────── */
 async function callClaude(apiKey, system, user, messages) {
    // Route to the correct provider
    if (activeProvider === 'openai') {
      return callOpenAI(apiKey, system, user, messages);
    }
    return callAnthropic(apiKey, system, user, messages);
  }

  /* ── Anthropic / Claude ───────────────────────────────────── */
  async function callAnthropic(apiKey, system, user, messages) {
    if (window.electronAPI?.callClaude) {
      const userContent = messages
        ? messages.map(m =>
            `${m.role === 'user' ? 'USER' : 'ASSISTANT'}: ${m.content}`
          ).join('\n\n---\n\n')
        : user;
     return window.electronAPI.callClaude({
        apiKey, system, user: userContent,
        provider: 'anthropic',
        model:    getClaudeModel()
      });
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':       'application/json',
        'x-api-key':          apiKey,
        'anthropic-version':  '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
     body: JSON.stringify({
        model:      getClaudeModel(),
        max_tokens: 8000,
        system,
        messages:   messages ?? [{ role: 'user', content: user }]
      })
    });

    if (!res.ok) {
      let msg = `Anthropic API error ${res.status}`;
      try { msg = (await res.json())?.error?.message ?? msg; } catch (_) {}
      throw new Error(msg);
    }
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    if (!data.content?.length) throw new Error('Empty response from Claude');
    return data.content.map(b => b.text || '').join('');
  }

  /* ── OpenAI ───────────────────────────────────────────────── */
  async function callOpenAI(apiKey, system, user, messages) {
    const model = $('openaiModel')?.value || 'gpt-4o';

    if (window.electronAPI?.callClaude) {
      const userContent = messages
        ? messages.map(m =>
            `${m.role === 'user' ? 'USER' : 'ASSISTANT'}: ${m.content}`
          ).join('\n\n---\n\n')
        : user;
      return window.electronAPI.callClaude({
        apiKey, system, user: userContent, provider: 'openai', model
      });
    }

    // Build messages array for OpenAI format
    const openaiMessages = [
      { role: 'system', content: system },
      ...(messages ?? [{ role: 'user', content: user }])
    ];

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        max_tokens: 8000,
        messages:   openaiMessages
      })
    });

    if (!res.ok) {
      let msg = `OpenAI API error ${res.status}`;
      try { msg = (await res.json())?.error?.message ?? msg; } catch (_) {}
      throw new Error(msg);
    }
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error('Empty response from OpenAI');
    return text;
  }

  /* ── Run Agent ────────────────────────────────────────── */
  runBtn?.addEventListener('click', startAgent);

  rehealBtn?.addEventListener('click', async () => {
  if (running) return;
  const apiKey = getActiveApiKey();
  if (!apiKey) { showToast('Enter your API key first'); return; }
  if (!results[2]) { showToast('No scripts found — run the agent first'); return; }

  running = true;
  rehealBtn.disabled = true;
  rehealBtn.querySelector('.run-label').textContent = 'Healing…';
  rehealBtn.querySelector('.run-icon').style.display  = 'none';
  rehealBtn.querySelector('.spin-icon').style.display = '';

  setStepState(3, 'running');
  showLoading(3);
  switchTab(3);

  try {
    const modules = ($('modules')?.value ?? '').split('\n').map(m => m.trim()).filter(Boolean);
    const allHealReports = [];

    for (const moduleName of modules) {
      // Extract only the scripts belonging to this module from results[2]
      const moduleScriptSnippet = results[2]
        .split('\n\n---\n\n')
        .find(chunk => chunk.toLowerCase().includes(moduleName.toLowerCase()))
        ?? results[2];

      const healReport = await callClaude(apiKey,
        `You are a test resilience engineer. Analyse Cypress specs and produce a self-healing report.
IMPORTANT: Only flag a selector if it is genuinely broken or highly likely to break (e.g. auto-generated IDs, nth-child indexes, volatile CSS class names, deeply nested positional chains).
Do NOT flag a selector simply because a different selector type is preferred. A stable ID, a meaningful class name, or any selector that reliably identifies the element is perfectly fine — leave it alone.
For every genuinely broken/fragile selector output:
STALE: <original>
REASON: specifically why this will break (not just "not preferred")
✓ HEALED: <better selector>
STRATEGY: data-cy | aria | text | composite`,
        `Module: ${moduleName}\n\nSpecs:\n${moduleScriptSnippet.substring(0, 1400)}\n\n` +
        `Flag fragile selectors. Propose healing chain: data-cy > aria > text > CSS.`
      );
      allHealReports.push(`# ${moduleName}\n\n${healReport}`);
    }

    results[3] = allHealReports.join('\n\n---\n\n');
    setStepState(3, 'done');
    $('tab-3')?.classList.add('done');
    renderPanel(3, results[3]);
    showToast('✓ Self-heal re-run complete');
    autoSaveSession();

  } catch (err) {
    setStepState(3, 'error');
    showToast('Self-heal failed: ' + err.message);
    console.error('Re-heal error:', err);
  }

  running = false;
  rehealBtn.disabled = false;
  rehealBtn.querySelector('.run-label').textContent = 'Re-run Self-Heal';
  rehealBtn.querySelector('.run-icon').style.display  = '';
  rehealBtn.querySelector('.spin-icon').style.display = 'none';
});

  async function startAgent() {
    const apiKey = getActiveApiKey();
    const baseUrl = $('baseUrl')?.value.trim() ?? '';
    const req = getRequirementsText();
    const moduleText = $('modules')?.value ?? '';
    const modules = moduleText.split('\n').map(m => m.trim()).filter(Boolean);

    if (!apiKey) {
      showToast(activeProvider === 'openai'
        ? 'Enter your OpenAI API key'
        : 'Enter your Anthropic API key');
      return;
    }
    if (!baseUrl)       { showToast('Enter the application base URL');   return; }
    if (!req) { showToast('Upload a requirements file or paste requirements'); return; }
    if (!modules.length){ showToast('Enter at least one module name');   return; }
    if (running)        return;

    running = true;

    // Disable immediately — BEFORE any await — so a second click while the
    // folder-picker dialog is open cannot trigger another pickFolder call.
    if (runBtn)   runBtn.disabled        = true;
    if (runLabel) runLabel.textContent   = 'Running…';
    if (runIcon)  runIcon.style.display  = 'none';
    if (spinIcon) spinIcon.style.display = '';

    results = { 0: null, 1: null, 2: null, 3: null };

    // Reset UI panels
    [0,1,2,3].forEach(i => {
      setStepState(i, 'idle');
      $('tab-'+i)?.classList.remove('done');
      $('empty-'+i)?.removeAttribute('hidden');
      const c = $('content-'+i);
      if (c) { c.setAttribute('hidden',''); c.innerHTML = ''; }
    });
    if (copyBtn)  copyBtn.disabled  = true;
    if (saveBtn)  saveBtn.disabled  = true;
    progressWrap?.removeAttribute('hidden');
    setProgress(0, 'Starting…');

    // Accumulated results across all modules
    const allTestCases  = [];
    const allFramework  = [];
    const allScripts    = [];
    const allHealReport = [];

    // Ask user to pick the output folder once, upfront
    let folderPath = null;
    if (window.electronAPI?.pickFolder) {
      folderPath = await window.electronAPI.pickFolder();
      if (!folderPath) {
        running = false;
        if (runBtn)   runBtn.disabled        = false;
        if (runLabel) runLabel.textContent   = 'Run Agent';
        if (runIcon)  runIcon.style.display  = '';
        if (spinIcon) spinIcon.style.display = 'none';
        return;
      }
      agentFolderPath = folderPath;   // ← save for Extract Files to reuse
    }

    try {

      // ── Generate shared project files first ──────────────
      const sharedOutput = await generateSharedFiles(apiKey, baseUrl, folderPath);
      allFramework.push(sharedOutput);

      for (let m = 0; m < modules.length; m++) {
        const moduleName = modules[m];
        const pct = Math.round((m / modules.length) * 100);
        setProgress(pct, `Module ${m+1}/${modules.length}: ${moduleName}`);

        await runModulePipeline({
          moduleName,
          apiKey,
          baseUrl,
          req,
          folderPath,
          moduleIndex: m,
          totalModules: modules.length,
          allTestCases,
          allFramework,
          allScripts,
          allHealReport
        });
      }

      // Merge all module results into the four display panels
      results[0] = allTestCases.join('\n\n---\n\n');
      results[1] = allFramework.join('\n\n');
      results[2] = allScripts.join('\n\n');
      results[3] = allHealReport.join('\n\n---\n\n');

      [0,1,2,3].forEach(i => {
        if (results[i]) {
          setStepState(i, 'done');
          $('tab-'+i)?.classList.add('done');
          renderPanel(i, results[i]);
        }
      });

      setProgress(100, `All ${modules.length} module(s) complete ✓`);
      showToast(`✓ Done — ${modules.length} module(s) generated`);
      switchTab(0);

      // Show Excel download button now that test cases exist
      $('excelWrap')?.removeAttribute('hidden');
      rehealBtn?.removeAttribute('hidden');   // ← ADD THIS LINE

      // Enable save button and auto-save if folder already chosen
      if (saveSessionBtn) saveSessionBtn.disabled = false;
      autoSaveSession();

    } catch (err) {
      [0,1,2,3].forEach(i => setStepState(i, 'error'));
      showToast('Error: ' + err.message);
      console.error('Agent error:', err);
    }

    running = false;
    if (runBtn)   runBtn.disabled        = false;
    if (runLabel) runLabel.textContent   = 'Run Agent';
    if (runIcon)  runIcon.style.display  = '';
    if (spinIcon) spinIcon.style.display = 'none';
  }

  /* ── Per-module pipeline ────────────────────────────────── */
  async function runModulePipeline({
    moduleName, apiKey, baseUrl, req, folderPath,
    moduleIndex, totalModules,
    allTestCases, allFramework, allScripts, allHealReport
  }) {
    const base = Math.round((moduleIndex / totalModules) * 100);
    const step = Math.round((1   / totalModules) * 100);

    const log = (msg) => {
      setProgress(base, `[${moduleName}] ${msg}`);
      console.log(`[${moduleName}]`, msg);
    };

    // ── Phase 1: Test cases ────────────────────────────────
    setStepState(0, 'running');
    log('Generating test cases…');
    const testCases = await callClaude(apiKey,
      `You are a senior QA engineer. Generate structured test cases for ONE module only.

You MUST use EXACTLY this format for every test case. No deviations:

TC-1: [UI] Title of test case here
Preconditions: What must be true before the test
Steps: 1. First step | 2. Second step | 3. Third step
Expected Result: What should happen after all steps
Priority: High

TC-2: [API] Title of next test case
Preconditions: ...
Steps: 1. ... | 2. ...
Expected Result: ...
Priority: Medium

STRICT RULES:
- Every TC must start with "TC-N: [UI]" or "TC-N: [API]" on its own line
- Steps MUST be on ONE line, separated by " | " between each step
- Never use sub-headers, bold text, or markdown inside a test case
- Never write "UI TEST CASES" or "API TEST CASES" as section headers
- Never put base URL or module name as a test case
- Each field label (Preconditions, Steps, Expected Result, Priority) must be on its own line
- Separate each test case with exactly one blank line
- Generate maximum 100 test cases per module, but fewer is fine if requirements are limited`,
      `Module: ${moduleName}\n\nRequirements:\n${req}\n\nBase URL: ${baseUrl}\n\n` +
      `Generate test cases for the "${moduleName}" module ONLY.`
    );
    allTestCases.push(`# ${moduleName}\n\n${testCases}`);
    setStepState(0, 'done');

    // ── Phase 2: Framework config files ───────────────────
    setStepState(1, 'running');
    log('Generating config files…');
    const configFiles = await callClaude(apiKey,
      `You are a test automation architect. Output Cypress 13 files for ONE module.
CRITICAL: Use ONLY this exact format — no other text outside markers:
===FILE: path/filename===
file content here
===ENDFILE===`,
      `Module: ${moduleName}\nBase URL: ${baseUrl}\n\n` +
      `Output ONLY these files for the ${moduleName} module:\n` +
      `1. cypress/pages/${moduleName.replace(/\s+/g,'')}/index.js  (page object)\n` +
      `2. cypress/fixtures/${moduleName.toLowerCase().replace(/\s+/g,'-')}.json  (test data)\n` +
      `3. cypress/support/${moduleName.toLowerCase().replace(/\s+/g,'-')}-commands.js  (custom commands)`
    );
    allFramework.push(configFiles);

    // ── Phase 3: Test scripts ──────────────────────────────
    log('Generating test scripts…');
    const scripts = await callClaude(apiKey,
      `You are a Cypress automation engineer. Write runnable Cypress spec files for ONE module.
CRITICAL: Use ONLY this exact format — no other text outside markers:
===FILE: path/filename===
file content here
===ENDFILE===`,
      `Module: ${moduleName}\nBase URL: ${baseUrl}\n\n` +
      `Test Cases:\n${testCases.substring(0, 1200)}\n\n` +
      `Output ONLY these spec files for the ${moduleName} module:\n` +
      `1. cypress/e2e/${moduleName.toLowerCase().replace(/\s+/g,'-')}/happy-path.cy.js\n` +
      `2. cypress/e2e/${moduleName.toLowerCase().replace(/\s+/g,'-')}/edge-cases.cy.js`
    );
    allScripts.push(scripts);
    setStepState(1, 'done');

    // ── Phase 4: Self-heal ─────────────────────────────────
    setStepState(2, 'running');
    log('Healing locators…');
    const healReport = await callClaude(apiKey,
      `You are a test resilience engineer. Analyse Cypress specs and produce a self-healing report.
IMPORTANT: Only flag a selector if it is genuinely broken or highly likely to break (e.g. auto-generated IDs, nth-child indexes, volatile CSS class names, deeply nested positional chains).
Do NOT flag a selector simply because a different selector type is preferred. A stable ID, a meaningful class name, or any selector that reliably identifies the element is perfectly fine — leave it alone.
For every genuinely broken/fragile selector output:
STALE: <original>
REASON: specifically why this will break (not just "not preferred")
✓ HEALED: <better selector>
STRATEGY: data-cy | aria | text | composite`,
      `Module: ${moduleName}\n\nSpecs:\n${scripts.substring(0, 1400)}\n\n` +
      `Flag fragile selectors. Propose healing chain: data-cy > aria > text > CSS.`
    );
    allHealReport.push(`# ${moduleName}\n\n${healReport}`);
    setStepState(2, 'done');
    setStepState(3, 'done');

    // ── Write files to disk immediately ───────────────────
    if (folderPath && window.electronAPI?.writeFiles) {
      const allFiles = [
        ...parseFrameworkFiles(configFiles),
        ...parseFrameworkFiles(scripts)
      ];

      // Also write test cases as markdown
      allFiles.push({
        name: `cypress/reports/test-cases-${moduleName.toLowerCase().replace(/\s+/g,'-')}.md`,
        content: `# ${moduleName} Test Cases\n\n${testCases}`
      });

      if (allFiles.length > 0) {
        const r = await window.electronAPI.writeFiles({ folderPath, allFiles });
        log(`✓ ${r.count} files written to disk`);
      }
    }

    setProgress(base + step, `✓ ${moduleName} complete`);
  }

/* ── Build AI failure analyzer files (injected into every framework) ── */
  function buildAnalyzerFiles(baseUrl) {
    const analyzerScript = `const fs   = require('fs');
const path = require('path');

// ── Config ────────────────────────────────────────────────────────────────
const RESULTS_PATH = path.join(__dirname, '../cypress/reports/results.json');
const REPORT_PATH  = path.join(__dirname, '../cypress/reports/failure-analysis.md');
const API_KEY      = process.env.ANTHROPIC_API_KEY || process.env.API_KEY || '';
const MODEL        = process.env.ANALYZER_MODEL    || 'claude-sonnet-4-6';

if (!API_KEY) {
  console.error('\\n❌  ANTHROPIC_API_KEY is not set. Export it and retry.\\n');
  process.exit(1);
}

// ── Load results ──────────────────────────────────────────────────────────
if (!fs.existsSync(RESULTS_PATH)) {
  console.error('\\n❌  No results file found at', RESULTS_PATH);
  console.error('    Run Cypress first: npx cypress run\\n');
  process.exit(1);
}

const raw     = fs.readFileSync(RESULTS_PATH, 'utf8');
const results = JSON.parse(raw);

// ── Extract failures ──────────────────────────────────────────────────────
const failures = [];
(results.results || results.suites || []).forEach(suite => {
  const specs = suite.tests || suite.specs || [];
  specs.forEach(test => {
    const tests = test.tests || [test];
    tests.forEach(t => {
      if (t.state === 'failed' || t.pass === false) {
        failures.push({
          suite: suite.fullFile || suite.file || suite.title || 'Unknown Suite',
          title: t.fullTitle || t.title || 'Unknown Test',
          error: (t.err && (t.err.message || t.err.estack)) || t.displayError || 'No error message'
        });
      }
    });
  });
});

if (failures.length === 0) {
  console.log('\\n✅  No failures found in results — nothing to analyze.\\n');
  process.exit(0);
}

console.log(\`\\n🔍  Found \${failures.length} failure(s). Sending to AI for analysis…\\n\`);

// ── Build prompt ──────────────────────────────────────────────────────────
const failureText = failures.map((f, i) =>
  \`### Failure \${i + 1}\\nFile: \${f.suite}\\nTest: \${f.title}\\nError:\\n\${f.error}\`
).join('\\n\\n');

const prompt = \`You are a senior QA engineer and test automation expert.
Analyze these Cypress test failures and for each one provide:

1. ROOT CAUSE — the exact technical reason it failed (selector issue, timing, network, assertion mismatch, config error, etc.)
2. CATEGORY — one of: Selector | Timing | Network | Assertion | Config | Data | Environment | Unknown
3. FIX — a concrete code fix or actionable step (include corrected code where applicable)
4. PREVENTION — how to prevent this class of failure in future

Be concise and technical. Do not repeat the error verbatim — explain what it means.

---

\${failureText}\`;

// ── Call Anthropic API ────────────────────────────────────────────────────
async function analyze() {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model:      MODEL,
      max_tokens: 4000,
      messages:   [{ role: 'user', content: prompt }]
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(\`Anthropic API error \${res.status}: \${err}\`);
  }

  const data     = await res.json();
  const analysis = data.content.map(b => b.text || '').join('');

  // ── Write report ────────────────────────────────────────────────────────
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const report = \`# AI Failure Analysis Report
Generated: \${timestamp}
Model: \${MODEL}
Failures analyzed: \${failures.length}

---

\${analysis}

---

## Raw Failures Summary

\${failures.map((f, i) => \`**\${i+1}. \${f.title}**  \\nFile: \`+\`\${f.suite}  \\nError: \${f.error.split('\\n')[0]}\`).join('\\n\\n')}
\`;

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, report, 'utf8');
  console.log(\`\\n✅  Analysis complete → \${REPORT_PATH}\\n\`);
  console.log(analysis.substring(0, 800) + (analysis.length > 800 ? '\\n…(see full report)' : ''));
}

analyze().catch(err => {
  console.error('\\n❌  Analysis failed:', err.message, '\\n');
  process.exit(1);
});
`;

    const localShell = `#!/usr/bin/env bash
# ── AI Failure Analyzer — local runner ──────────────────────────────────────
# Usage:  bash scripts/analyze-failures-local.sh
# Prereq: export ANTHROPIC_API_KEY=sk-ant-...

set -e

echo ""
echo "🤖  AI Root Cause Analyzer"
echo "───────────────────────────"

if [ -z "\${ANTHROPIC_API_KEY}" ]; then
  echo "❌  ANTHROPIC_API_KEY is not set."
  echo "    Run:  export ANTHROPIC_API_KEY=sk-ant-your-key"
  echo ""
  exit 1
fi

# Run Cypress if no results file exists yet
RESULTS="cypress/reports/results.json"
if [ ! -f "\$RESULTS" ]; then
  echo "📋  No results.json found — running Cypress first…"
  echo ""
  npx cypress run --reporter json --reporter-options "output=\$RESULTS" || true
fi

echo ""
echo "🔍  Analyzing failures…"
node scripts/analyze-failures.js

echo ""
echo "📄  Report saved to cypress/reports/failure-analysis.md"
echo ""
`;

    const githubWorkflow = `name: Cypress + AI Failure Analysis

on:
  push:
    branches: [main, master, develop]
  pull_request:
    branches: [main, master]
  workflow_dispatch:          # allow manual trigger from GitHub UI

jobs:
  cypress-and-analyze:
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Create reports directory
        run: mkdir -p cypress/reports

      - name: Run Cypress tests
        id: cypress
        run: |
          npx cypress run \\
            --reporter json \\
            --reporter-options "output=cypress/reports/results.json" || true
        env:
          CYPRESS_BASE_URL: \${{ vars.BASE_URL || '${baseUrl}' }}
          CYPRESS_USERNAME: \${{ secrets.CYPRESS_USERNAME }}
          CYPRESS_PASSWORD: \${{ secrets.CYPRESS_PASSWORD }}

      - name: Run AI Failure Analyzer
        if: always()
        run: node scripts/analyze-failures.js
        env:
          ANTHROPIC_API_KEY: \${{ secrets.ANTHROPIC_API_KEY }}
          ANALYZER_MODEL: claude-sonnet-4-6

      - name: Upload reports as artifacts
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: cypress-ai-reports
          path: |
            cypress/reports/results.json
            cypress/reports/failure-analysis.md
            cypress/screenshots/
            cypress/videos/
          retention-days: 14

      - name: Comment analysis on PR
        if: github.event_name == 'pull_request' && always()
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const reportPath = 'cypress/reports/failure-analysis.md';
            if (!fs.existsSync(reportPath)) {
              console.log('No failure analysis report found — all tests passed.');
              return;
            }
            const report = fs.readFileSync(reportPath, 'utf8');
            const body = report.length > 65000
              ? report.substring(0, 65000) + '\\n\\n_(report truncated — download artifact for full analysis)_'
              : report;
            await github.rest.issues.createComment({
              owner:    context.repo.owner,
              repo:     context.repo.repo,
              issue_number: context.issue.number,
              body: '## 🤖 AI Failure Analysis\\n\\n' + body
            });
`;

    return [
      `===FILE: scripts/analyze-failures.js===\n${analyzerScript}\n===ENDFILE===`,
      `===FILE: scripts/analyze-failures-local.sh===\n${localShell}\n===ENDFILE===`,
      `===FILE: .github/workflows/ai-failure-analysis.yml===\n${githubWorkflow}\n===ENDFILE===`
    ].join('\n\n');
  }

  /* ── Generate shared project files (runs once) ──────────── */
  async function generateSharedFiles(apiKey, baseUrl, folderPath) {
    setProgress(0, 'Generating shared project files…');
    console.log('Generating shared project files…');

    const sharedConfig = await callClaude(apiKey,
      `You are a test automation architect. Output shared Cypress 13 project config files.
CRITICAL: Use ONLY this exact format — no other text outside markers:
===FILE: path/filename===
file content here
===ENDFILE===`,
      `Base URL: ${baseUrl}

Output ONLY these files. No extra commentary outside the markers.

1. package.json — include cypress@13, @faker-js/faker, cypress-axe, dotenv
2. cypress.config.js — baseUrl set to ${baseUrl}, retries:2, video:false, specPattern: cypress/e2e/**/*.cy.js, reporter: json with output to cypress/reports/results.json
3. cypress/support/e2e.js — global hooks, import commands, axe setup
4. cypress/support/commands.js — cy.login(), cy.apiRequest(), cy.healLocator()
5. cypress/utils/selfHeal.js — healing chain: data-cy > aria-label > text > CSS > positional, logs which succeeded
6. .env.example — BASE_URL, USERNAME, PASSWORD, API_KEY, ANTHROPIC_API_KEY vars
7. README.md — setup steps: npm install, npx cypress open, env setup, folder structure, and a section explaining AI Failure Analyzer usage`
    );

    // ── Append AI failure analyzer files (static, not AI-generated) ──────
    const analyzerFiles = buildAnalyzerFiles(baseUrl);
    const sharedWithAnalyzer = sharedConfig + '\n' + analyzerFiles;

    const files = parseFrameworkFiles(sharedWithAnalyzer);
    console.log('Shared files parsed:', files.map(f => f.name));

    if (folderPath && window.electronAPI?.writeFiles && files.length > 0) {
      const r = await window.electronAPI.writeFiles({ folderPath, allFiles: files });
      console.log(`✓ ${r.count} shared files written`);
      showToast(`✓ Shared config files written (${r.count} files)`);
    }

    return sharedWithAnalyzer;
  }

  /* ══════════════════════════════════════════════════════════
     CHAT
     ══════════════════════════════════════════════════════════ */

  console.log('Wiring chat | chatFab:', !!chatFab, '| chatSendBtn:', !!chatSendBtn);

  function openChat() {
    chatDrawer?.classList.add('open');
    chatBackdrop?.classList.add('visible');
    chatFab?.classList.add('hidden');
    setTimeout(() => chatInput?.focus(), 300);
  }

  function closeChat() {
    chatDrawer?.classList.remove('open');
    chatBackdrop?.classList.remove('visible');
    chatFab?.classList.remove('hidden');
  }

  chatFab?.addEventListener('click',       openChat);
  chatClose?.addEventListener('click',     closeChat);
  chatBackdrop?.addEventListener('click',  closeChat);

  chatInput?.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
  });

  chatInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
  });

  chatSendBtn?.addEventListener('click', () => {
    console.log('Send clicked');
    sendChatMessage();
  });

  function sendSuggestion(btn) {
    if (!chatInput) return;
    chatInput.value = btn.textContent.trim();
    sendChatMessage();
  }
  window.sendSuggestion = sendSuggestion;

  function buildChatContext() {
    const parts = [];
    if (results[1]) parts.push('=== CYPRESS FRAMEWORK ===\n' + results[1]);
    if (results[2]) parts.push('=== TEST SCRIPTS ===\n'      + results[2]);
    if (results[0]) parts.push('=== TEST CASES ===\n'        + results[0].substring(0,600));
    return parts.length ? parts.join('\n\n') : 'No files generated yet — run the agent first.';
  }

  function formatChatText(raw) {
    let s = String(raw).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    s = s.replace(/===FILE:\s*([\w./:-]+)===\n?([\s\S]*?)===ENDFILE===/g,
      (_,fname,code) =>
        `<div style="margin:6px 0">` +
        `<div style="font-size:10.5px;font-weight:600;color:#00d4aa;font-family:monospace;margin-bottom:3px">${fname}</div>` +
        `<pre>${code.trim()}</pre></div>`);
    s = s.replace(/```[\w.-]*\n?([\s\S]*?)```/g, (_,c) => `<pre>${c.trim()}</pre>`);
    s = s.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    const parts = s.split(/(<pre>[\s\S]*?<\/pre>)/);
    return parts.map((p,i) => i % 2 === 0 ? p.replace(/\n/g,'<br>') : p).join('');
  }

  function appendChatMessage(role, text) {
    $('chatWelcome')?.remove();
    const wrap = document.createElement('div');
    wrap.className = 'chat-msg ' + role;
    const lbl = document.createElement('div');
    lbl.className = 'chat-msg-role';
    lbl.textContent = role === 'user' ? 'You' : 'AI Assistant';
    const body = document.createElement('div');
    body.className = 'chat-msg-body';
    body.innerHTML = formatChatText(text);
    wrap.appendChild(lbl);
    wrap.appendChild(body);
    if (role === 'assistant' && text.includes('===FILE:')) {
      const btn = document.createElement('button');
      btn.className = 'chat-apply-btn';
      btn.textContent = 'Save fixed files to disk';
      btn.addEventListener('click', () => applyFixedFiles(text));
      wrap.appendChild(btn);
    }
    chatMessages?.appendChild(wrap);
    if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function showChatTyping() {
    if (!chatMessages) return;
    const wrap = document.createElement('div');
    wrap.className = 'chat-msg assistant';
    wrap.id = 'chatTyping';
    const lbl = document.createElement('div');
    lbl.className = 'chat-msg-role';
    lbl.textContent = 'AI Assistant';
    const dots = document.createElement('div');
    dots.className = 'chat-typing';
    dots.innerHTML = '<span></span><span></span><span></span>';
    wrap.appendChild(lbl);
    wrap.appendChild(dots);
    chatMessages.appendChild(wrap);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function removeChatTyping() { $('chatTyping')?.remove(); }

  async function sendChatMessage() {
    const text   = chatInput?.value.trim();
    const apiKey = getActiveApiKey();
    console.log('sendChatMessage | text:', text?.substring(0,30), '| apiKey set:', !!apiKey);
    if (!text)   { showToast('Type a message first'); return; }
    if (!apiKey) {
      showToast(activeProvider === 'openai'
        ? 'Enter your OpenAI API key in the sidebar'
        : 'Enter your Anthropic API key in the sidebar');
      return;
    }
    if (chatInput)   { chatInput.value = ''; chatInput.style.height = 'auto'; }
    if (chatSendBtn) chatSendBtn.disabled = true;
    appendChatMessage('user', text);
    chatHistory.push({ role: 'user', content: text });
    showChatTyping();
    const system =
      `You are an expert Cypress automation engineer fixing bugs in a generated test framework.\n\n` +
      `When fixing bugs:\n` +
      `1. Output fixed files using ===FILE: path=== ... ===ENDFILE=== format\n` +
      `2. Fix only files that need changes\n` +
      `3. Briefly explain what was wrong\n\n` +
      `GENERATED CODE CONTEXT:\n${buildChatContext()}`;
    try {
      const reply = await callClaude(apiKey, system, null, chatHistory);
      removeChatTyping();
      chatHistory.push({ role: 'assistant', content: reply });
      appendChatMessage('assistant', reply);
    } catch (err) {
      removeChatTyping();
      chatHistory.pop();
      appendChatMessage('assistant', `Error: ${err.message}`);
      console.error('Chat error:', err);
    }
    if (chatSendBtn) chatSendBtn.disabled = false;
    chatInput?.focus();
  }

  async function applyFixedFiles(text) {
    const fixed = parseFrameworkFiles(text);
    if (fixed.length === 0) {
      await navigator.clipboard.writeText(text).catch(() => {});
      showToast('No file markers found — copied to clipboard');
      return;
    }
    if (!window.electronAPI?.pickFolder) {
      await navigator.clipboard.writeText(text).catch(() => {});
      showToast(`${fixed.length} file(s) copied to clipboard`);
      return;
    }
    // Reuse agent folder — only ask if not already set
    let folderPath = agentFolderPath;
    if (!folderPath) {
      folderPath = await window.electronAPI.pickFolder();
      if (!folderPath) return;
      agentFolderPath = folderPath;
    }
    try {
      const r = await window.electronAPI.writeFiles({ folderPath, allFiles: fixed });
      showToast(`✓ ${r.count} fixed file${r.count === 1 ? '' : 's'} saved`);
    } catch (err) { showToast('Save failed: ' + err.message); }
  }

  console.log('renderer.js fully initialised ✓');

  /* ══════════════════════════════════════════════════════════
     TC SELECTION SYSTEM
     ══════════════════════════════════════════════════════════ */

  let tcSelectOpen       = false;
  let allParsedTCs       = [];      // all TCs across modules
  let selectedTCIds      = new Set(); // IDs of selected TCs
  let aiRecommendedIds   = new Set(); // IDs AI recommended
  let activeModuleFilter = 'all';
  let activeTypeFilter   = 'all';
  let tcSearchQuery      = '';

  const tcSelectDrawer   = $('tcSelectDrawer');
  const tcSelectBackdrop = $('tcSelectBackdrop');
  const tcSelectBtn      = $('selectTCBtn');
  const tcSelectClose    = $('tcSelectClose');
  const tcSelectCancel   = $('tcSelectCancel');
  const tcSelectConfirm  = $('tcSelectConfirm');
  const tcSelectList     = $('tcSelectList');
  const tcSelectStats    = $('tcSelectStats');
  const tcModuleTabs     = $('tcModuleTabs');
  const tcSearchInput    = $('tcSearchInput');

  // ── Open / close ───────────────────────────────────────────
  function openTCSelect() {
    if (!results[0]) { showToast('Run the agent first to generate test cases'); return; }
    allParsedTCs     = parseTestCasesToRows(results[0]);
    if (!allParsedTCs.length) { showToast('No test cases found to select'); return; }

    // Pre-select all if nothing selected yet
    if (selectedTCIds.size === 0) {
      allParsedTCs.forEach(tc => selectedTCIds.add(tc['ID']));
    }

    buildModuleTabs();
    renderTCSelectList();
    tcSelectDrawer?.classList.add('open');
    tcSelectBackdrop?.classList.add('visible');
    tcSelectOpen = true;
  }

  function closeTCSelect() {
    tcSelectDrawer?.classList.remove('open');
    tcSelectBackdrop?.classList.remove('visible');
    tcSelectOpen = false;
  }

  tcSelectBtn?.addEventListener('click',    openTCSelect);
  tcSelectClose?.addEventListener('click',  closeTCSelect);
  tcSelectCancel?.addEventListener('click', closeTCSelect);
  tcSelectBackdrop?.addEventListener('click', closeTCSelect);

  // Enable the button when test cases are available
  function enableTCSelectBtn() {
    if (tcSelectBtn) tcSelectBtn.disabled = false;
  }

  // ── Build module tabs ───────────────────────────────────────
  function buildModuleTabs() {
    if (!tcModuleTabs) return;

    // Extract unique modules from IDs or module field
    const modules = ['all', ...new Set(allParsedTCs.map(tc => tc['Module'] || 'General'))];
    tcModuleTabs.innerHTML = '';

    modules.forEach(mod => {
      const btn = document.createElement('button');
      btn.className   = 'tc-module-tab' + (mod === activeModuleFilter ? ' active' : '');
      btn.textContent = mod === 'all' ? 'All Modules' : mod;
      btn.addEventListener('click', () => {
        activeModuleFilter = mod;
        tcModuleTabs.querySelectorAll('.tc-module-tab').forEach(b =>
          b.classList.toggle('active', b.textContent === (mod === 'all' ? 'All Modules' : mod))
        );
        renderTCSelectList();
      });
      tcModuleTabs.appendChild(btn);
    });
  }

  // ── Filter tabs ─────────────────────────────────────────────
  document.querySelectorAll('.tc-filter-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTypeFilter = btn.dataset.filter;
      document.querySelectorAll('.tc-filter-tab').forEach(b =>
        b.classList.toggle('active', b === btn)
      );
      renderTCSelectList();
    });
  });

  // ── Search ──────────────────────────────────────────────────
  tcSearchInput?.addEventListener('input', () => {
    tcSearchQuery = tcSearchInput.value.toLowerCase();
    renderTCSelectList();
  });

  // ── Auto-select buttons ─────────────────────────────────────
  $('autoSelectAll')?.addEventListener('click', () => {
    getFilteredTCs().forEach(tc => selectedTCIds.add(tc['ID']));
    renderTCSelectList();
  });

  $('autoSelectNone')?.addEventListener('click', () => {
    getFilteredTCs().forEach(tc => selectedTCIds.delete(tc['ID']));
    renderTCSelectList();
  });

  $('autoSelectHigh')?.addEventListener('click', () => {
    getFilteredTCs()
      .filter(tc => tc['Priority'] === 'High')
      .forEach(tc => selectedTCIds.add(tc['ID']));
    renderTCSelectList();
  });

  $('autoSelectUI')?.addEventListener('click', () => {
    getFilteredTCs()
      .filter(tc => tc['Type'] === 'UI')
      .forEach(tc => selectedTCIds.add(tc['ID']));
    renderTCSelectList();
  });

  $('autoSelectAPI')?.addEventListener('click', () => {
    getFilteredTCs()
      .filter(tc => tc['Type'] === 'API')
      .forEach(tc => selectedTCIds.add(tc['ID']));
    renderTCSelectList();
  });

  // ── AI Pick ─────────────────────────────────────────────────
  $('autoSelectAI')?.addEventListener('click', async () => {
    const apiKey = getActiveApiKey();
    if (!apiKey) { showToast('Enter your API key first'); return; }

    const btn = $('autoSelectAI');
    if (btn) {
      btn.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <path d="M8 2a6 6 0 1 0 6 6" stroke="currentColor" stroke-width="1.8"
            stroke-linecap="round"/>
        </svg> Thinking…`;
      btn.disabled = true;
    }

    try {
      const tcSummary = getFilteredTCs()
        .map(tc => `${tc['ID']} [${tc['Type']}] ${tc['Title']} (Priority: ${tc['Priority']})`)
        .join('\n');

      const reply = await callClaude(apiKey,
        `You are a QA automation expert. Given a list of test cases, recommend the best ones 
         to automate first based on: automation ROI, frequency of execution, stability, 
         and coverage value. Return ONLY a comma-separated list of TC IDs, nothing else.
         Example: TC-001,TC-003,TC-007`,
        `Test cases:\n${tcSummary}\n\nWhich test case IDs should be automated first?
         Return only the IDs as a comma-separated list.`
      );

      // Parse returned IDs
      const recommended = reply
        .replace(/[^TC\d,\-]/gi, '')
        .split(',')
        .map(id => id.trim().toUpperCase())
        .filter(id => id.startsWith('TC'));

      aiRecommendedIds = new Set(recommended);

      // Select the recommended ones
      selectedTCIds = new Set(recommended);
      renderTCSelectList();
      showToast(`✓ AI recommended ${recommended.length} test cases to automate`);

    } catch (err) {
      showToast('AI pick failed: ' + err.message);
    }

    if (btn) {
      btn.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <path d="M8 2l1.5 3.5L13 7l-3.5 1.5L8 12l-1.5-3.5L3 7l3.5-1.5L8 2z"
            fill="currentColor"/>
        </svg> AI Pick`;
      btn.disabled = false;
    }
  });

  // ── Get filtered TCs ────────────────────────────────────────
  function getFilteredTCs() {
    return allParsedTCs.filter(tc => {
      const matchModule = activeModuleFilter === 'all' ||
        (tc['Module'] || 'General') === activeModuleFilter;
      const matchType   = activeTypeFilter === 'all'  ||
        tc['Type'] === activeTypeFilter                ||
        tc['Priority'] === activeTypeFilter;
      const matchSearch = !tcSearchQuery ||
        tc['Title']?.toLowerCase().includes(tcSearchQuery) ||
        tc['ID']?.toLowerCase().includes(tcSearchQuery)    ||
        tc['Steps']?.toLowerCase().includes(tcSearchQuery);
      return matchModule && matchType && matchSearch;
    });
  }

  // ── Render TC list ──────────────────────────────────────────
  function renderTCSelectList() {
    if (!tcSelectList) return;
    const filtered = getFilteredTCs();
    tcSelectList.innerHTML = '';

    if (!filtered.length) {
      tcSelectList.innerHTML = `
        <div style="text-align:center;padding:40px;color:var(--c-text-3);font-size:13px">
          No test cases match the current filter
        </div>`;
      updateTCStats();
      return;
    }

    filtered.forEach(tc => {
      const id          = tc['ID'] || '';
      const isSelected  = selectedTCIds.has(id);
      const isAI        = aiRecommendedIds.has(id);
      const type        = (tc['Type'] || 'UI').toLowerCase();
      const priority    = (tc['Priority'] || 'Medium').toLowerCase();

      const row = document.createElement('div');
      row.className = [
        'tc-select-row',
        isSelected ? 'selected' : '',
        isAI ? 'ai-recommended' : ''
      ].filter(Boolean).join(' ');
      row.dataset.id = id;

      row.innerHTML = `
        <div class="tc-row-checkbox">
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="white" stroke-width="1.8"
              stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="tc-row-body">
          <div class="tc-row-top">
            <span class="tc-row-id">${escHtml(id)}</span>
            <span class="tc-row-title">${escHtml(tc['Title'] || '')}</span>
            <div class="tc-row-tags">
              <span class="tc-row-tag ${type}">${type.toUpperCase()}</span>
              <span class="tc-row-tag ${priority}">${tc['Priority'] || 'Medium'}</span>
              ${isAI ? '<span class="tc-row-tag ai">★ AI Pick</span>' : ''}
            </div>
          </div>
          <div class="tc-row-preview">${escHtml((tc['Steps'] || '').substring(0, 80))}…</div>
        </div>
      `;

      row.addEventListener('click', () => {
        if (selectedTCIds.has(id)) selectedTCIds.delete(id);
        else selectedTCIds.add(id);
        row.classList.toggle('selected');
        row.querySelector('.tc-row-checkbox svg').style.display =
          selectedTCIds.has(id) ? 'block' : 'none';
        row.querySelector('.tc-row-checkbox').style.background =
          selectedTCIds.has(id) ? 'var(--c-accent)' : 'transparent';
        row.querySelector('.tc-row-checkbox').style.borderColor =
          selectedTCIds.has(id) ? 'var(--c-accent)' : '';
        updateTCStats();
      });

      tcSelectList.appendChild(row);
    });

    updateTCStats();
  }

  // ── Update stats bar ────────────────────────────────────────
  function updateTCStats() {
    if (!tcSelectStats) return;
    const total    = allParsedTCs.length;
    const selected = selectedTCIds.size;
    const ui       = allParsedTCs.filter(tc => selectedTCIds.has(tc['ID']) && tc['Type'] === 'UI').length;
    const api      = allParsedTCs.filter(tc => selectedTCIds.has(tc['ID']) && tc['Type'] === 'API').length;
    tcSelectStats.textContent =
      `${selected} of ${total} selected  (${ui} UI · ${api} API)`;
  }

  // ── Confirm — regenerate scripts for selected TCs only ──────
  tcSelectConfirm?.addEventListener('click', async () => {
    if (selectedTCIds.size === 0) {
      showToast('Select at least one test case');
      return;
    }

    const apiKey = getActiveApiKey();
    if (!apiKey) { showToast('Enter your API key first'); return; }

    closeTCSelect();

    // Filter test cases text to selected IDs only
    const selectedTCs = allParsedTCs.filter(tc => selectedTCIds.has(tc['ID']));
    const selectedText = selectedTCs
      .map(tc =>
        `${tc['ID']}: [${tc['Type']}] ${tc['Title']}\n` +
        `Preconditions: ${tc['Preconditions']}\n` +
        `Steps: ${tc['Steps']}\n` +
        `Expected Result: ${tc['Expected Result']}\n` +
        `Priority: ${tc['Priority']}`
      ).join('\n\n');

    showToast(`Generating scripts for ${selectedTCs.length} selected test cases…`);

    // Update step UI
    setStepState(2, 'running');
    const c = $('content-2');
    if (c) { c.setAttribute('hidden',''); c.innerHTML = ''; }
    $('empty-2')?.removeAttribute('hidden');
    showLoading(2);
    switchTab(2);

    try {
      // Auth + API specs
      const scripts1 = await callClaude(apiKey,
        `You are a Cypress automation engineer. Write runnable Cypress spec files ONLY for the provided test cases.
CRITICAL: Use ONLY this format:
===FILE: path/filename===
file content here
===ENDFILE===`,
        `Base URL: ${$('baseUrl')?.value.trim()}\n\n` +
        `Generate Cypress spec files for ONLY these ${selectedTCs.length} test cases:\n\n` +
        selectedText.substring(0, 3000)
      );

      // UI flows
      const scripts2 = await callClaude(apiKey,
        `You are a Cypress automation engineer. Write runnable Cypress spec files ONLY for the provided test cases.
CRITICAL: Use ONLY this format:
===FILE: path/filename===
file content here
===ENDFILE===`,
        `Base URL: ${$('baseUrl')?.value.trim()}\n\n` +
        `Continue generating Cypress specs for remaining test cases:\n\n` +
        selectedText.substring(3000, 6000) || 'No remaining test cases.'
      );

      const combinedScripts = scripts1 + '\n' + scripts2;
      results[2] = combinedScripts;

      setStepState(2, 'done');
      $('tab-2')?.classList.add('done');
      renderPanel(2, combinedScripts);

      showToast(`✓ Scripts generated for ${selectedTCs.length} test cases`);

      // Re-run self-heal on new scripts
      setStepState(3, 'running');
      const healReport = await callClaude(apiKey,
       `You are a test resilience engineer. Analyse Cypress specs and produce a self-healing report.
IMPORTANT: Only flag a selector if it is genuinely broken or highly likely to break (e.g. auto-generated IDs, nth-child indexes, volatile CSS class names, deeply nested positional chains).
Do NOT flag a selector simply because a different selector type is preferred. A stable ID, a meaningful class name, or any selector that reliably identifies the element is perfectly fine — leave it alone.
For every genuinely broken/fragile selector output:
STALE: <original>
REASON: specifically why this will break (not just "not preferred")
✓ HEALED: <better selector>
STRATEGY: data-cy | aria | text | composite`,
        `Specs:\n${combinedScripts.substring(0, 1400)}\n\n` +
        `Flag fragile selectors. Propose: data-cy > aria > text > CSS.`
      );
      results[3] = healReport;
      setStepState(3, 'done');
      $('tab-3')?.classList.add('done');
      renderPanel(3, healReport);

    } catch (err) {
      setStepState(2, 'error');
      showToast('Script generation failed: ' + err.message);
      console.error(err);
    }
  });

  // Enable TC select button when test cases panel is populated
  const _origRenderPanel = renderPanel;
  // Hook into renderPanel to enable button when panel 0 is ready
  // (renderPanel is already defined above — add this after it)

}); // end DOMContentLoaded
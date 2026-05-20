// app.js – Domino AI Social Profile Builder (v2)
// Brand-centric, robust, and highly interactive controller

document.addEventListener('DOMContentLoaded', () => {
  // ── Element Registrations ──────────────────────────────────────────
  const profileForm = document.getElementById('profileForm');
  const launchCampaignBtn = document.getElementById('launchCampaignBtn');
  const statusPanel = document.getElementById('statusPanel');
  const statusBody = document.getElementById('statusBody');
  const statusSummary = document.getElementById('statusSummary');
  const resultsPanel = document.getElementById('resultsPanel');
  const resultsTableBody = document.getElementById('resultsTableBody');
  const verifyPanel = document.getElementById('verifyPanel');
  const verifyList = document.getElementById('verifyList');

  // Network & Proxy Guard
  const proxyIndicator = document.getElementById('proxyIndicator');
  const proxyLabel = document.getElementById('proxyLabel');
  const proxyModal = document.getElementById('proxyModal');
  const proxyModalIp = document.getElementById('proxyModalIp');
  const proxyBypassConsentCheck = document.getElementById('proxyBypassConsentCheck');
  const forceLaunchBtn = document.getElementById('forceLaunchBtn');
  const closeProxyModalBtn = document.getElementById('closeProxyModalBtn');

  // File Upload
  const imagesInput = document.getElementById('images');
  const dropLabel = document.getElementById('dropLabel');
  const previewGrid = document.getElementById('previewGrid');

  // Side Drawer Override Configuration
  const sideDrawer = document.getElementById('sideDrawer');
  const closeDrawerBtn = document.getElementById('closeDrawerBtn');
  const saveDrawerBtn = document.getElementById('saveDrawerBtn');
  const drawerTitle = document.getElementById('drawerTitle');
  const drawerPlatName = document.getElementById('drawerPlatName');
  const drawerCustomName = document.getElementById('drawerCustomName');
  const drawerCustomEmail = document.getElementById('drawerCustomEmail');
  const drawerCustomHandle = document.getElementById('drawerCustomHandle');
  const drawerCustomBio = document.getElementById('drawerCustomBio');
  const drawerCustomOccupation = document.getElementById('drawerCustomOccupation');
  const drawerCustomLocation = document.getElementById('drawerCustomLocation');

  // Settings Modal
  const settingsModal = document.getElementById('settingsModal');
  const openSettingsBtn = document.getElementById('openSettingsBtn');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const settingsFavPath = document.getElementById('settingsFavPath');
  const settingsProxyBypass = document.getElementById('settingsProxyBypass');
  const settingsProxyBypassSlider = document.getElementById('settingsProxyBypassSlider');
  const biometricStatusLabel = document.getElementById('biometricStatusLabel');
  const enrollBiometricsBtn = document.getElementById('enrollBiometricsBtn');
  const lockSessionBtn = document.getElementById('lockSessionBtn');

  // Help Modal
  const helpModal = document.getElementById('helpModal');
  const openHelpBtn = document.getElementById('openHelpBtn');
  const closeHelpBtn = document.getElementById('closeHelpBtn');
  const helpTabButtons = document.querySelectorAll('.help-tab-btn');
  const helpTabPanels = document.querySelectorAll('.help-tab-panel');

  // Premium Modal
  const premiumModal = document.getElementById('premiumModal');
  const openPremiumBtn = document.getElementById('openPremiumBtn');
  const closePremiumBtn = document.getElementById('closePremiumBtn');

  // Save / Discard Action Panel elements
  const favVaultStatus = document.getElementById('favVaultStatus');
  const saveToFavBtn = document.getElementById('saveToFavBtn');
  const customSavePathInput = document.getElementById('customSavePathInput');
  const saveToCustomBtn = document.getElementById('saveToCustomBtn');
  const downloadExcelBtn = document.getElementById('downloadExcelBtn');
  const downloadZipBtn = document.getElementById('downloadZipBtn');
  const discardPurgeBtn = document.getElementById('discardPurgeBtn');

  // General Controls
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMsg');
  const selectAllBtn = document.getElementById('selectAllBtn');
  const selectNoneBtn = document.getElementById('selectNoneBtn');
  const addCustomChannelBtn = document.getElementById('addCustomChannelBtn');
  const customChannelInput = document.getElementById('customChannelInput');

  // ── Global App Memory States ──────────────────────────────────────
  let activeCampaignId = null;
  let currentSettings = { favorite_vault_path: '', proxy_override: false };
  let perPlatformOverrides = {}; // Map of platName -> { name, email, username, bio, occupation, location }
  let currentEditingPlatform = null;
  let currentProxyStatus = { status: 'checking', ip: '', response_ms: 0, message: '', proxy_enabled_config: false };
  let eventSource = null;

  // ── Channels Catalog ──────────────────────────────────────────────
  const GLOBAL_CHANNELS = [
    { name: 'Facebook', badge: 'Global' },
    { name: 'Instagram', badge: 'Global' },
    { name: 'Twitter / X', badge: 'Global' },
    { name: 'LinkedIn', badge: 'Professional' },
    { name: 'TikTok', badge: 'Global' },
    { name: 'Reddit', badge: 'Global' },
    { name: 'YouTube', badge: 'Global' },
    { name: 'Pinterest', badge: 'Global' },
    { name: 'Snapchat', badge: 'Global' },
    { name: 'Twitch', badge: 'Global' },
    { name: 'Discord', badge: 'Global' },
    { name: 'Tumblr', badge: 'Global' },
    { name: 'Medium', badge: 'Professional' },
    { name: 'Quora', badge: 'Professional' },
    { name: 'GitHub', badge: 'Developer' },
    { name: 'Telegram', badge: 'Global' },
    { name: 'WhatsApp', badge: 'Global' },
    { name: 'StackOverflow', badge: 'Developer' }
  ];

  const ASIAN_CHANNELS = [
    { name: 'Weibo', badge: 'China' },
    { name: 'VKontakte (VK)', badge: 'Russia' },
    { name: 'Bilibili', badge: 'China' },
    { name: 'Xiaohongshu', badge: 'China' },
    { name: 'WeChat', badge: 'China' },
    { name: 'Youku', badge: 'China' },
    { name: 'Line', badge: 'Japan/Korea' },
    { name: 'Baidu', badge: 'China' }
  ];

  // ── Initialize Grids ──────────────────────────────────────────────
  function buildChannelGrid(channels, containerId) {
    const grid = document.getElementById(containerId);
    grid.innerHTML = '';
    
    channels.forEach(ch => {
      const card = document.createElement('div');
      card.className = 'channel-card checked'; // Selected by default
      card.dataset.channel = ch.name;

      card.innerHTML = `
        <div class="channel-header">
          <span class="channel-name">${ch.name}</span>
          <span class="channel-badge">${ch.badge}</span>
        </div>
        <div class="channel-footer">
          <div class="custom-check-box"></div>
          <button type="button" class="edit-override-btn">Edit Details</button>
          <input type="checkbox" class="channel-checkbox" name="platforms" value="${ch.name}" checked />
        </div>
      `;

      // Toggle action on clicking the card
      card.addEventListener('click', (e) => {
        // Prevent toggle if clicking the Edit button
        if (e.target.classList.contains('edit-override-btn')) return;
        
        const checkbox = card.querySelector('.channel-checkbox');
        checkbox.checked = !checkbox.checked;
        card.classList.toggle('checked', checkbox.checked);
      });

      // Edit override action
      card.querySelector('.edit-override-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        openDrawerForPlatform(ch.name);
      });

      grid.appendChild(card);
    });
  }

  buildChannelGrid(GLOBAL_CHANNELS, 'globalGrid');
  buildChannelGrid(ASIAN_CHANNELS, 'asianGrid');

  // ── Notification Banner Toast ──────────────────────────────────────
  function showToast(message, isError = false) {
    toastMsg.textContent = message;
    if (isError) {
      toast.classList.add('error');
    } else {
      toast.classList.remove('error');
    }
    toast.classList.add('open');
    setTimeout(() => {
      toast.classList.remove('open');
    }, 4000);
  }

  // ── Tab Management ────────────────────────────────────────────────
  const tabButtons = document.querySelectorAll('.tab-btn');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      
      btn.classList.add('active');
      const panelId = 'tab-' + btn.dataset.tab;
      document.getElementById(panelId).classList.add('active');
    });
  });

  // ── Controls Check All / Clear Active Tab ──────────────────────────
  selectAllBtn.addEventListener('click', () => {
    const activePanel = document.querySelector('.tab-panel.active');
    activePanel.querySelectorAll('.channel-card').forEach(card => {
      card.classList.add('checked');
      card.querySelector('.channel-checkbox').checked = true;
    });
    showToast("Selected all channels in active category.");
  });

  selectNoneBtn.addEventListener('click', () => {
    const activePanel = document.querySelector('.tab-panel.active');
    activePanel.querySelectorAll('.channel-card').forEach(card => {
      card.classList.remove('checked');
      card.querySelector('.channel-checkbox').checked = false;
    });
    showToast("Cleared all channels in active category.");
  });

  // Add Custom Platform
  addCustomChannelBtn.addEventListener('click', () => {
    const value = customChannelInput.value.trim();
    if (!value) return;
    
    // Add custom platform to the active category
    const activePanel = document.querySelector('.tab-panel.active');
    const targetGrid = activePanel.querySelector('.channels-grid');
    
    const card = document.createElement('div');
    card.className = 'channel-card checked';
    card.dataset.channel = value;
    card.innerHTML = `
      <div class="channel-header">
        <span class="channel-name">${value}</span>
        <span class="channel-badge">Custom</span>
      </div>
      <div class="channel-footer">
        <div class="custom-check-box"></div>
        <button type="button" class="edit-override-btn">Edit Details</button>
        <input type="checkbox" class="channel-checkbox" name="platforms" value="${value}" checked />
      </div>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.classList.contains('edit-override-btn')) return;
      const checkbox = card.querySelector('.channel-checkbox');
      checkbox.checked = !checkbox.checked;
      card.classList.toggle('checked', checkbox.checked);
    });

    card.querySelector('.edit-override-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      openDrawerForPlatform(value);
    });

    targetGrid.appendChild(card);
    customChannelInput.value = '';
    showToast(`Added custom channel "${value}".`);
  });

  customChannelInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCustomChannelBtn.click();
    }
  });

  // ── Asset Previews ────────────────────────────────────────────────
  imagesInput.addEventListener('change', () => {
    previewGrid.innerHTML = '';
    const files = Array.from(imagesInput.files).slice(0, 3);
    
    if (files.length > 0) {
      dropLabel.innerHTML = `<span>${files.length} branding asset${files.length > 1 ? 's' : ''} loaded ✓</span>`;
      files.forEach(f => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = document.createElement('img');
          img.src = e.target.result;
          img.style.width = '60px';
          img.style.height = '60px';
          img.style.objectFit = 'cover';
          img.style.borderRadius = '8px';
          img.style.border = '2px solid var(--primary)';
          previewGrid.appendChild(img);
        };
        reader.readAsDataURL(f);
      });
    } else {
      dropLabel.innerHTML = `<span>Click to select brand logos</span> or drag and drop images here<br/><small>PNG / JPG format.</small>`;
    }
  });

  // ── Drawer Platform Overrides ─────────────────────────────────────
  function openDrawerForPlatform(platName) {
    currentEditingPlatform = platName;
    drawerTitle.textContent = `${platName} Configuration Override`;
    drawerPlatName.value = platName;

    // Load existing overrides if present, otherwise set empty placeholders
    const override = perPlatformOverrides[platName] || {};
    drawerCustomName.value = override.name || '';
    drawerCustomEmail.value = override.email || '';
    drawerCustomHandle.value = override.username || '';
    drawerCustomBio.value = override.bio || '';
    drawerCustomOccupation.value = override.occupation || '';
    drawerCustomLocation.value = override.location || '';

    sideDrawer.classList.add('open');
  }

  closeDrawerBtn.addEventListener('click', () => {
    sideDrawer.classList.remove('open');
    currentEditingPlatform = null;
  });

  saveDrawerBtn.addEventListener('click', () => {
    if (!currentEditingPlatform) return;
    
    perPlatformOverrides[currentEditingPlatform] = {
      name: drawerCustomName.value.trim(),
      email: drawerCustomEmail.value.trim(),
      username: drawerCustomHandle.value.trim(),
      bio: drawerCustomBio.value.trim(),
      occupation: drawerCustomOccupation.value.trim(),
      location: drawerCustomLocation.value.trim()
    };

    sideDrawer.classList.remove('open');
    showToast(`Saved customization overrides for ${currentEditingPlatform}`);
    currentEditingPlatform = null;
  });

  // ── Network Proxy Health Assessment ──────────────────────────────
  async function assessProxyStatus() {
    proxyIndicator.className = 'proxy-dot checking';
    proxyLabel.textContent = 'Assessing local network proxies...';
    
    try {
      const res = await fetch('/api/proxy/check');
      const data = await res.json();
      currentProxyStatus = data;
      
      const statusClass = data.status === 'healthy' ? 'healthy' : data.status === 'slow' ? 'slow' : 'dead';
      proxyIndicator.className = `proxy-dot ${statusClass}`;
      
      if (data.status === 'healthy') {
        proxyLabel.textContent = `Proxy Pool Guard: Operational (IP: ${data.ip})`;
      } else if (data.status === 'slow') {
        proxyLabel.textContent = `Proxy Pool Alert: High latency (IP: ${data.ip}, ${data.response_ms}ms)`;
      } else {
        proxyLabel.textContent = `IP Shield Warning: Unprotected Direct IP (${data.ip || 'No connection'})`;
      }
    } catch (err) {
      currentProxyStatus = { status: 'dead', ip: 'Direct', response_ms: 0, message: 'Proxy Check Offline', proxy_enabled_config: false };
      proxyIndicator.className = 'proxy-dot dead';
      proxyLabel.textContent = 'IP Shield Offline: Proxy verification failed.';
    }
  }

  assessProxyStatus();

  // ── System Settings Modal Handlers ───────────────────────────────
  async function loadSystemSettings() {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      currentSettings = data;
      
      settingsFavPath.value = data.favorite_vault_path || '';
      settingsProxyBypass.checked = data.proxy_override || false;
      styleSettingsBypassSlider();

      updateObsidianSaveUI();
    } catch (err) {
      console.error("Failed to load workspace settings:", err);
    }
  }

  function styleSettingsBypassSlider() {
    if (settingsProxyBypass.checked) {
      settingsProxyBypassSlider.style.background = 'var(--primary)';
      settingsProxyBypassSlider.style.boxShadow = '0 0 6px var(--primary)';
    } else {
      settingsProxyBypassSlider.style.background = 'rgba(255,255,255,0.1)';
      settingsProxyBypassSlider.style.boxShadow = 'none';
    }
  }

  settingsProxyBypass.addEventListener('change', () => {
    styleSettingsBypassSlider();
  });

  openSettingsBtn.addEventListener('click', async () => {
    await loadSystemSettings();
    await checkBiometricRegistration();
    settingsModal.classList.add('open');
  });

  closeSettingsBtn.addEventListener('click', () => {
    settingsModal.classList.remove('open');
  });

  // Help Modal Handlers
  if (openHelpBtn && closeHelpBtn && helpModal) {
    openHelpBtn.addEventListener('click', () => {
      helpModal.classList.add('open');
    });

    closeHelpBtn.addEventListener('click', () => {
      helpModal.classList.remove('open');
    });
  }

  // Help Tab switcher
  if (helpTabButtons && helpTabPanels) {
    helpTabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        helpTabButtons.forEach(b => b.classList.remove('active'));
        helpTabPanels.forEach(p => p.classList.remove('active'));
        
        btn.classList.add('active');
        const targetPanelId = 'help-tab-' + btn.dataset.helpTab;
        const targetPanel = document.getElementById(targetPanelId);
        if (targetPanel) {
          targetPanel.classList.add('active');
        }
      });
    });
  }

  // Premium Modal Handlers
  if (openPremiumBtn && closePremiumBtn && premiumModal) {
    openPremiumBtn.addEventListener('click', () => {
      premiumModal.classList.add('open');
    });

    closePremiumBtn.addEventListener('click', () => {
      premiumModal.classList.remove('open');
    });
  }

  saveSettingsBtn.addEventListener('click', async () => {
    const updated = {
      favorite_vault_path: settingsFavPath.value.trim(),
      proxy_override: settingsProxyBypass.checked
    };

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      const data = await res.json();
      if (data.ok) {
        showToast("Domino workspace settings updated successfully.");
        settingsModal.classList.remove('open');
        await loadSystemSettings();
      } else {
        showToast("Failed to save workspace settings: " + (data.error || 'Unknown error'), true);
      }
    } catch (err) {
      showToast("Workspace API connectivity error.", true);
    }
  });

  // Biometrics Enrollment
  async function checkBiometricRegistration() {
    try {
      const res = await fetch('/api/auth/status');
      const data = await res.json();
      if (data.biometrics_registered) {
        biometricStatusLabel.textContent = "Passkey Enrolled (TouchID / Hello Active) ✓";
        enrollBiometricsBtn.disabled = true;
        enrollBiometricsBtn.textContent = "Active";
      } else {
        biometricStatusLabel.textContent = "Biometrics unconfigured.";
        enrollBiometricsBtn.disabled = false;
        enrollBiometricsBtn.textContent = "Enroll Device";
      }
    } catch {
      biometricStatusLabel.textContent = "Auth module connection failed.";
    }
  }

  // WebAuthn Enroll
  enrollBiometricsBtn.addEventListener('click', async () => {
    biometricStatusLabel.textContent = "Initiating authenticator challenge...";
    try {
      const optRes = await fetch('/api/auth/webauthn/register/options', { method: 'POST' });
      const options = await optRes.json();
      
      options.challenge = Uint8Array.from(atob(options.challenge.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
      options.user.id = Uint8Array.from(atob(options.user.id.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

      const credential = await navigator.credentials.create({ publicKey: options });
      
      const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
      
      const verifyRes = await fetch('/api/auth/webauthn/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: credential.id,
          response: {
            attestationObject: b64(credential.response.attestationObject),
            clientDataJSON: b64(credential.response.clientDataJSON)
          }
        })
      });
      
      const verifyData = await verifyRes.json();
      if (verifyData.ok) {
        showToast("Biometric passkey enrolled successfully!");
        await checkBiometricRegistration();
      } else {
        biometricStatusLabel.textContent = "Enrollment failed: " + verifyData.error;
      }
    } catch (err) {
      console.error(err);
      biometricStatusLabel.textContent = "WebAuthn challenge error.";
    }
  });

  // Lock Session
  lockSessionBtn.addEventListener('click', async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      showToast("Workspace locked. Redirecting to gateway...");
      setTimeout(() => {
        window.location.href = '/login';
      }, 1000);
    } catch {
      window.location.href = '/login';
    }
  });

  // ── Campaign Submission and Guards ───────────────────────────────
  function getSelectedPlatforms() {
    return Array.from(document.querySelectorAll('.channel-card.checked')).map(card => card.dataset.channel);
  }

  function getDefaultPersona() {
    return {
      name: document.getElementById('name').value.trim(),
      gender: document.getElementById('gender').value,
      birthday: document.getElementById('birthday').value.trim(),
      email: document.getElementById('email').value.trim(),
      occupation: document.getElementById('occupation').value.trim(),
      location: document.getElementById('location').value.trim(),
      bio: document.getElementById('bio').value.trim()
    };
  }

  profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const selected = getSelectedPlatforms();
    if (selected.length === 0) {
      showToast("Deployment error: Please check at least one target channel card.", true);
      return;
    }

    // ── Proxy Exposure Assessment Gatekeeper ──
    const bypassOverride = currentSettings.proxy_override; // settings flag
    const proxyDead = currentProxyStatus.status === 'dead' || currentProxyStatus.status === 'blocked';
    const proxyConfigDisabled = !currentProxyStatus.proxy_enabled_config;

    if ((proxyDead || proxyConfigDisabled) && !bypassOverride) {
      // Trigger warning modal
      proxyModalIp.textContent = currentProxyStatus.ip || 'Raw direct';
      proxyModal.classList.add('open');
      return;
    }

    // Proceed to launch
    executeCampaignLaunch();
  });

  // Modal Buttons Binds
  closeProxyModalBtn.addEventListener('click', () => {
    proxyModal.classList.remove('open');
  });

  proxyBypassConsentCheck.addEventListener('change', () => {
    forceLaunchBtn.disabled = !proxyBypassConsentCheck.checked;
  });

  forceLaunchBtn.addEventListener('click', () => {
    proxyModal.classList.remove('open');
    executeCampaignLaunch();
  });

  // ── Campaign Core Runner ─────────────────────────────────────────
  async function executeCampaignLaunch() {
    launchCampaignBtn.disabled = true;
    launchCampaignBtn.textContent = "Deploying Brand Matrices...";
    
    // Hide old completed campaign results
    resultsPanel.classList.add('hidden');
    statusPanel.classList.remove('hidden');
    
    const defaults = getDefaultPersona();
    const selected = getSelectedPlatforms();
    
    // Package files using standard FormData
    const formData = new FormData();
    formData.append('mode', 'per_platform');
    
    // Collect per-platform configs and inject global overrides where empty
    const platformsData = {};
    selected.forEach(p => {
      const overrides = perPlatformOverrides[p] || {};
      platformsData[p] = { ...defaults, ...overrides };
    });

    formData.append('defaults', JSON.stringify(defaults));
    formData.append('platforms', JSON.stringify(platformsData));

    // Append files
    const files = imagesInput.files;
    for (let i = 0; i < files.length; i++) {
      formData.append('images', files[i]);
    }

    try {
      const res = await fetch('/api/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'per_platform',
          defaults: defaults,
          platforms: platformsData
        })
      });

      const data = await res.json();
      if (data.error) {
        showToast("Campaign deployment rejected: " + data.error, true);
        launchCampaignBtn.disabled = false;
        launchCampaignBtn.textContent = "Deploy Brand Presence Matrix";
        return;
      }

      activeCampaignId = data.campaign_id;
      showToast(`Campaign ${activeCampaignId} launched across ${selected.length} platforms!`);

      // Start Stream Updates
      startSSEStatusStream();

    } catch (err) {
      showToast("Failed to launch background deployment threat.", true);
      launchCampaignBtn.disabled = false;
      launchCampaignBtn.textContent = "Deploy Brand Presence Matrix";
    }
  }

  // ── Real-time Status Stream Engine ──────────────────────────────
  function startSSEStatusStream() {
    if (eventSource) eventSource.close();
    
    eventSource = new EventSource('/api/status/stream');
    
    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        renderSSEProgress(data);
      } catch (err) {
        console.error("SSE stream parsing exception", err);
      }
    };

    eventSource.onerror = () => {
      // Stream error: fallback to REST polling
      console.warn("SSE connection interrupted. Falling back to HTTP polling...");
      eventSource.close();
      pollCampaignStatus();
    };
  }

  function pollCampaignStatus() {
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        renderSSEProgress(data);
        
        // Check if complete
        const activeCount = data.platforms.filter(p => ['running', 'queued'].includes(p.status)).length;
        if (activeCount === 0) {
          clearInterval(interval);
        }
      } catch (err) {
        clearInterval(interval);
      }
    }, 2000);
  }

  function renderSSEProgress(data) {
    if (!data || !data.platforms) return;

    // Stat Summary
    statusSummary.innerHTML = `
      <span class="status-pill success">${data.success || 0} Established</span>
      <span class="status-pill running">${data.running || 0} Deploying</span>
      <span class="status-pill blocked">${data.blocked || 0} Flagged</span>
      <span class="status-pill queued">${data.queued || 0} Queued</span>
    `;

    // Detailed Rows
    statusBody.innerHTML = '';
    data.platforms.forEach(p => {
      const row = document.createElement('div');
      row.className = `status-row ${p.status}`;
      
      const icon = {
        queued: '◷', running: '⟳', success: '✓', blocked: '✕',
        error: '✕', verification_needed: '⚠', placeholder: '◇',
        manual_needed: '✋', submitted: '✓', captcha: '🔒', skipped: '—'
      }[p.status] || '?';

      row.innerHTML = `
        <span class="status-icon">${icon}</span>
        <span class="status-plat">${p.platform}</span>
        <span class="status-msg">${p.message || p.status}</span>
        <div class="status-progress-wrapper">
          <div class="status-progress-bar" style="width: ${p.progress || 0}%"></div>
        </div>
      `;
      statusBody.appendChild(row);
    });

    // Check for pending Multi-factor codes needed
    loadPendingVerifications();

    // Check if campaign is fully completed across all selected channels
    const activeRunning = data.platforms.filter(p => ['running', 'queued'].includes(p.status)).length;
    if (activeRunning === 0 && data.platforms.length > 0) {
      if (eventSource) eventSource.close();
      finalizeCampaignDisplay(data);
    }
  }

  // ── Final Campaign Results & Save Manager ─────────────────────────
  function finalizeCampaignDisplay(campaignData) {
    launchCampaignBtn.disabled = false;
    launchCampaignBtn.textContent = "Deploy Brand Presence Matrix";
    
    // Clear status panels
    statusPanel.classList.add('hidden');
    
    // Display results table
    resultsTableBody.innerHTML = '';
    
    campaignData.platforms.forEach(p => {
      const tr = document.createElement('tr');
      
      const statusPill = p.status === 'success' || p.status === 'submitted'
        ? `<span class="status-pill success" style="padding:0.15rem 0.4rem;">Established</span>`
        : p.status === 'blocked' || p.status === 'captcha'
        ? `<span class="status-pill blocked" style="padding:0.15rem 0.4rem;">Flagged</span>`
        : `<span class="status-pill queued" style="padding:0.15rem 0.4rem;">Skipped</span>`;

      const link = p.profile_url 
        ? `<a href="${p.profile_url}" class="results-link" target="_blank">Open Channel &nbsp;↗</a>`
        : `<span style="color:var(--text-dim);">—</span>`;

      // Get generated username and password details
      const username = p.handle || 'Pending/Blocked';
      const password = p.password || '';

      const spoilerPass = password 
        ? `<span class="spoiler-field blurred" title="Click to reveal brand password" onclick="toggleSpoiler(this)">${password}</span>`
        : `<span style="color:var(--text-dim);">—</span>`;

      tr.innerHTML = `
        <td style="font-weight: 600;">${p.platform}</td>
        <td>${statusPill}</td>
        <td style="font-family: monospace; font-size:0.8rem;">${username}</td>
        <td>${spoilerPass}</td>
        <td>${link}</td>
      `;
      
      resultsTableBody.appendChild(tr);
    });

    // Update Save buttons paths details
    updateObsidianSaveUI();

    // Bind ZIP & excel download paths
    downloadExcelBtn.href = `/download/report_${activeCampaignId}.xlsx`;
    downloadZipBtn.href = `/download/obsidian_vault_${activeCampaignId}.zip`;

    resultsPanel.classList.remove('hidden');
    resultsPanel.scrollIntoView({ behavior: 'smooth' });
    showToast("Corporate Brand Campaign finalized successfully.");
  }

  // Update Favorite location sync box
  function updateObsidianSaveUI() {
    const path = currentSettings.favorite_vault_path;
    if (path) {
      favVaultStatus.innerHTML = `Favorite Obsidian Path: <strong style="color: var(--primary); font-family: monospace; font-size:0.75rem;">${path}</strong>`;
      saveToFavBtn.disabled = false;
    } else {
      favVaultStatus.innerHTML = `Favorite Obsidian Path: <em style="color: var(--danger);">None configured in Settings.</em>`;
      saveToFavBtn.disabled = true;
    }
  }

  // Save to Favorite Location click
  saveToFavBtn.addEventListener('click', async () => {
    if (!activeCampaignId || !currentSettings.favorite_vault_path) return;
    saveToFavBtn.disabled = true;
    saveToFavBtn.textContent = "Saving...";

    try {
      const res = await fetch(`/api/campaign/${activeCampaignId}/save-to`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: currentSettings.favorite_vault_path })
      });
      const data = await res.json();
      if (data.ok) {
        showToast("Campaign logs written directly into local Obsidian directory!");
      } else {
        showToast("Failed to write to folder: " + data.error, true);
      }
    } catch {
      showToast("API synchronization error.", true);
    } finally {
      saveToFavBtn.disabled = false;
      saveToFavBtn.textContent = "Save to Favorite Directory";
    }
  });

  // Save to Custom Location Click
  saveToCustomBtn.addEventListener('click', async () => {
    const customPath = customSavePathInput.value.trim();
    if (!activeCampaignId || !customPath) {
      showToast("Save error: Enter a target absolute folder destination.", true);
      return;
    }
    
    saveToCustomBtn.disabled = true;
    saveToCustomBtn.textContent = "Writing...";

    try {
      const res = await fetch(`/api/campaign/${activeCampaignId}/save-to`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: customPath })
      });
      const data = await res.json();
      if (data.ok) {
        showToast("Campaign logs written directly into custom Obsidian directory!");
        customSavePathInput.value = '';
      } else {
        showToast("Failed to write to target directory: " + data.error, true);
      }
    } catch {
      showToast("API synchronization error.", true);
    } finally {
      saveToCustomBtn.disabled = false;
      saveToCustomBtn.textContent = "Save";
    }
  });

  // Destructive Session Discard Click
  discardPurgeBtn.addEventListener('click', async () => {
    if (!activeCampaignId) return;
    
    const confirmScr = confirm("Are you sure you want to completely SCRUB all logs, files, and temporary campaign assets from the local server? This action is permanent and guarantees zero data-retention.");
    if (!confirmScr) return;

    discardPurgeBtn.disabled = true;
    discardPurgeBtn.textContent = "Scrubbing...";

    try {
      const res = await fetch(`/api/campaign/${activeCampaignId}/discard`, { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        showToast("Campaign files successfully scrubbed and permanently deleted from local server cache.");
        resultsPanel.classList.add('hidden');
        profileForm.reset();
        previewGrid.innerHTML = '';
        dropLabel.innerHTML = `<span>Click to select brand logos</span> or drag and drop images here<br/><small>PNG / JPG format.</small>`;
        perPlatformOverrides = {};
        activeCampaignId = null;
      } else {
        showToast("Scrub process encountered directory lock issues.", true);
      }
    } catch {
      showToast("Failed to scrub session data.", true);
    } finally {
      discardPurgeBtn.disabled = false;
      discardPurgeBtn.textContent = "Discard & Scrub Files";
    }
  });

  // ── Verification Relay Checks ─────────────────────────────────────
  async function loadPendingVerifications() {
    try {
      const res = await fetch('/api/verify/pending');
      const pending = await res.json();
      const keys = Object.keys(pending);

      if (keys.length === 0) {
        verifyPanel.classList.add('hidden');
        return;
      }

      verifyPanel.classList.remove('hidden');
      verifyList.innerHTML = '';
      
      keys.forEach(reqId => {
        const entry = pending[reqId];
        if (entry.status !== 'waiting') return;
        
        const card = document.createElement('div');
        card.style.background = 'rgba(255, 255, 255, 0.03)';
        card.style.border = '1px solid rgba(239, 68, 68, 0.2)';
        card.style.borderRadius = '8px';
        card.style.padding = '0.75rem';
        card.style.display = 'flex';
        card.style.alignItems = 'center';
        card.style.justifyContent = 'space-between';
        card.style.gap = '0.5rem';

        card.innerHTML = `
          <div style="font-size:0.8rem; line-height:1.4;">
            <strong style="color:var(--danger);">${entry.platform}</strong> Needs Code<br/>
            <span style="font-size:0.72rem; color:var(--text-dim);">${entry.type}</span>
          </div>
          <div style="display:flex; gap:0.4rem;">
            <input type="text" placeholder="Code..." id="vcode_${reqId}" style="width: 80px; padding:0.35rem 0.5rem; font-size:0.8rem; background:rgba(0,0,0,0.3); border:1px solid var(--border); border-radius:5px; color:white; text-align:center;" />
            <button type="button" class="save-btn" style="padding:0.35rem 0.75rem; font-size:0.75rem; background:var(--danger);" data-id="${reqId}">Submit</button>
          </div>
        `;

        card.querySelector('.save-btn').addEventListener('click', async () => {
          const codeInput = document.getElementById(`vcode_${reqId}`);
          const code = codeInput.value.trim();
          if (!code) return;
          
          try {
            const resSub = await fetch('/api/verify/submit', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ request_id: reqId, code: code })
            });
            const dataSub = await resSub.json();
            if (dataSub.ok) {
              showToast("Verification code successfully relayed.");
              card.remove();
            } else {
              showToast("Relay verification code failed.", true);
            }
          } catch {
            showToast("API verification error.", true);
          }
        });

        verifyList.appendChild(card);
      });
    } catch (err) {
      console.error(err);
    }
  }

  // Load Settings on Boot
  loadSystemSettings();
});

// ── Global Helper Functions ─────────────────────────────────────────
function toggleSpoiler(element) {
  element.classList.toggle('blurred');
}

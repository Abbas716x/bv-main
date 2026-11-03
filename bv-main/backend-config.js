/* ==================================================================
   X00716 NEXUS ENTERPRISE — Secure Multi-Tenant Cloud Architecture
   Client-Side Firestore Architecture for GitHub Pages & Cloud
   ================================================================== */

(function () {
    'use strict';

    // Local Storage Keys
    const SESSION_BRANCH_KEY = 'qx716_active_branch';
    const SESSION_TOKEN_KEY = 'qx716_session_token';
    const LAST_SAVE_KEY = 'qx716_last_save_ts';
    const CLIENT_ID = Math.random().toString(36).slice(2, 10);
    const AUTO_SAVE_INTERVAL = 10 * 60 * 1000;

    let currentTenant = null;
    let autoSaveTimer = null;
    let debounceSaveTimer = null;
    let lastLocalWriteTs = 0;
    let onCloudUpdateCallback = null;
    let statusHeartbeatTimer = null;

    // Secure Data Obfuscator
    const CipherEngine = {
        encode: function (data) {
            try {
                const str = JSON.stringify(data);
                return btoa(encodeURIComponent(str));
            } catch (e) {
                return JSON.stringify(data);
            }
        },
        decode: function (str) {
            try {
                if (!str) return null;
                const json = decodeURIComponent(atob(str));
                return JSON.parse(json);
            } catch (e) {
                try { return JSON.parse(str); } catch (err) { return null; }
            }
        }
    };

    // Default Fallback Tenant
    const DEFAULT_TENANT = {
        id: 'branch_zayouni',
        name: 'زیوني',
        username: 'zayouni',
        status: 'active'
    };

    function setFbStatus(state, text) {
        try {
            const dot = document.getElementById('fb-status-dot');
            const txt = document.getElementById('fb-status-text');
            if (dot) {
                dot.className = 'status-dot';
                if (state === 'online') dot.classList.add('online');
                else if (state === 'offline') dot.classList.add('offline');
                else if (state === 'sync') dot.classList.add('syncing');
            }
            if (txt && text) txt.textContent = text;
        } catch (e) {}
    }

    function flashSaveIndicator(state = 'saved') {
        try {
            const el = document.getElementById('save-indicator');
            if (!el) return;
            el.className = `save-indicator show ${state}`;
            setTimeout(() => {
                el.className = 'save-indicator';
            }, 3000);
        } catch (e) {}
    }

    function updateLastSavedDisplay(ts = null) {
        try {
            const textEl = document.getElementById('last-saved-text');
            if (!textEl) return;
            const targetTs = ts || localStorage.getItem(LAST_SAVE_KEY);
            if (!targetTs) {
                textEl.textContent = 'آخر حفظ: —';
                return;
            }
            const date = new Date(parseInt(targetTs, 10) || targetTs);
            const timeStr = date.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            textEl.textContent = `آخر حفظ: ${timeStr}`;
        } catch (e) {}
    }

    function updateBranchUI() {
        try {
            const badge = document.getElementById('branch-badge');
            const drawerName = document.getElementById('drawer-branch-name');
            if (currentTenant) {
                if (badge) badge.textContent = `فرع: ${currentTenant.name}`;
                if (drawerName) drawerName.textContent = currentTenant.name;
            } else {
                if (badge) badge.textContent = 'فرع: غير محدد';
                if (drawerName) drawerName.textContent = 'غير مسجل';
            }
        } catch (e) {}
    }

    // Authentication is authoritative on the server; browser caches never grant access.
    async function authenticateBranch(username, password) {
        const cleanUser = String(username || '').trim().toLowerCase();
        const cleanPass = String(password || '');

        if (!cleanUser || !cleanPass) throw new Error('يرجى ملء جميع الحقول');

        setFbStatus('sync', 'AUTH');
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ username: cleanUser, password: cleanPass })
        });
        const result = await response.json();
        if (!response.ok || !result.ok) {
            setFbStatus('offline', 'AUTH_ERR');
            if (result.status === 'frozen' && window.SecurityEngine) {
                window.SecurityEngine.triggerBreach(result.error);
            } else if (result.status === 'deactivated' && window.SecurityEngine) {
                window.SecurityEngine.triggerKillSwitchUI(result.error);
            }
            throw new Error(result.error || 'تعذر التحقق من بيانات الدخول');
        }
        if (result.isAdmin) {
            sessionStorage.setItem('nx_admin_session_token', result.token);
            window.location.assign(result.redirect || '/admin');
            return { isAdmin: true };
        }
        const targetBranch = result.branch;
        if (!targetBranch || !result.token) throw new Error('استجابة الدخول غير صالحة');
        currentTenant = targetBranch;
        sessionStorage.setItem(SESSION_TOKEN_KEY, result.token);
        localStorage.setItem(SESSION_BRANCH_KEY, JSON.stringify(currentTenant));
        const dataResponse = await fetch(`/api/branches/${encodeURIComponent(currentTenant.id)}/data`, {
            headers: { Authorization: `Bearer ${result.token}`, Accept: 'application/json' }
        });
        const tenantResult = await dataResponse.json();
        if (!dataResponse.ok || !tenantResult.ok) {
            sessionStorage.removeItem(SESSION_TOKEN_KEY);
            localStorage.removeItem(SESSION_BRANCH_KEY);
            currentTenant = null;
            throw new Error(tenantResult.error || 'تعذر تحميل بيانات الفرع');
        }
        if (tenantResult.data) {
            tenantResult.data._branchId = currentTenant.id;
            localStorage.setItem(getBranchStorageKey(currentTenant.id), CipherEngine.encode(tenantResult.data));
        }

        // Unlock security and clear lockdown
        if (window.SecurityEngine && typeof window.SecurityEngine.restoreActiveState === 'function') {
            window.SecurityEngine.restoreActiveState(true);
        }

        setFbStatus('online', 'ONLINE');
        updateBranchUI();
        startStatusHeartbeat();

        return currentTenant;
    }

    async function logoutBranch() {
        try {
            const previousTenant = currentTenant;
            currentTenant = null;
            if (previousTenant) {
                await logAuditEvent('LOGOUT', `تسجيل خروج الفرع: ${previousTenant.name}`);
            }
            localStorage.removeItem(SESSION_BRANCH_KEY);
            const token = sessionStorage.getItem(SESSION_TOKEN_KEY);
            if (token) fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
            sessionStorage.removeItem(SESSION_TOKEN_KEY);
            updateBranchUI();
            setFbStatus('sync', 'STANDBY');
            if (statusHeartbeatTimer) clearInterval(statusHeartbeatTimer);
        } catch (e) {}
    }

    // High-Frequency Realtime Branch Status Sync
    function startStatusHeartbeat() {
        if (statusHeartbeatTimer) clearInterval(statusHeartbeatTimer);
        statusHeartbeatTimer = setInterval(checkActiveBranchStatus, 2000);
    }

    async function checkActiveBranchStatus() {
        const token = sessionStorage.getItem(SESSION_TOKEN_KEY);
        if (!token) return false;
        try {
            const response = await fetch('/api/auth/session', {
                headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
            });
            const result = await response.json();
            if (!response.ok || result.role !== 'branch' || !result.branch) {
                setFbStatus('offline', 'AUTH_ERR');
                if (response.status === 401) {
                    currentTenant = null;
                    sessionStorage.removeItem(SESSION_TOKEN_KEY);
                    localStorage.removeItem(SESSION_BRANCH_KEY);
                    window.dispatchEvent(new CustomEvent('nexus:auth-expired'));
                }
                if (result.status === 'frozen' && window.SecurityEngine) {
                    window.SecurityEngine.triggerBreach(result.error || 'تم تجميد هذا الفرع بقرار الإدارة المركزية.');
                } else if (result.status === 'deactivated' && window.SecurityEngine) {
                    window.SecurityEngine.triggerKillSwitchUI(result.error || 'تم تعطيل هذا الفرع بقرار الإدارة العامة.');
                }
                return false;
            }
            currentTenant = result.branch;
            localStorage.setItem(SESSION_BRANCH_KEY, JSON.stringify(currentTenant));
            if (window.SecurityEngine && typeof window.SecurityEngine.restoreActiveState === 'function') {
                window.SecurityEngine.restoreActiveState(true);
            }
            updateBranchUI();
            setFbStatus('online', 'ONLINE');
            return true;
        } catch (error) {
            setFbStatus('offline', 'OFFLINE');
            return false;
        }
    }

    // Audit Log Pipeline
    async function logAuditEvent(action, details) {
        try {
            const payload = {
                branchId: currentTenant ? currentTenant.id : 'SYSTEM',
                branchName: currentTenant ? currentTenant.name : 'SYSTEM',
                branchUser: currentTenant ? currentTenant.username : 'SYSTEM',
                action,
                details,
                severity: action.includes('BREACH') ? 'critical' : 'normal'
            };

            const token = sessionStorage.getItem(SESSION_TOKEN_KEY);
            if (!token || !currentTenant) return;
            fetch('/api/audit-logs', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    Accept: 'application/json'
                },
                body: JSON.stringify(payload)
            }).catch(error => console.warn('[NEXUS Audit] Unable to record activity:', error));
        } catch (e) {}
    }

    // Storage Management (Local & Cloud Sync)
    function getBranchStorageKey(branchId = null) {
        const id = branchId || (currentTenant ? currentTenant.id : 'branch_zayouni');
        return `nx_data_${id}`;
    }

    function loadTenantLocal(defaultStateFactory) {
        try {
            const key = getBranchStorageKey();
            const raw = localStorage.getItem(key);
            if (!raw) {
                const def = defaultStateFactory();
                def._branchId = currentTenant ? currentTenant.id : 'branch_zayouni';
                return def;
            }
            const parsed = CipherEngine.decode(raw);
            if (parsed && typeof parsed === 'object') {
                parsed._branchId = currentTenant ? currentTenant.id : 'branch_zayouni';
                return parsed;
            }
        } catch (e) {}
        const fallback = defaultStateFactory();
        fallback._branchId = currentTenant ? currentTenant.id : 'branch_zayouni';
        return fallback;
    }

    function saveTenantLocal(state) {
        try {
            if (!state) return;
            const key = getBranchStorageKey();
            state._clientId = CLIENT_ID;
            state._branchId = currentTenant ? currentTenant.id : 'branch_zayouni';
            state._updatedAt = Date.now();
            localStorage.setItem(key, CipherEngine.encode(state));
            lastLocalWriteTs = Date.now();
        } catch (e) {}
    }

    function debouncedSave(stateGetter, delay = 800) {
        if (debounceSaveTimer) clearTimeout(debounceSaveTimer);
        debounceSaveTimer = setTimeout(() => {
            if (typeof stateGetter === 'function') {
                forceSaveCloud(stateGetter(), 'debounced');
            }
        }, delay);
    }

    // Save Tenant Data to Firestore
    async function forceSaveCloud(state, trigger = 'manual') {
        if (!state) return false;
        saveTenantLocal(state);

        try {
            setFbStatus('sync', 'SYNC');
            const targetId = currentTenant ? currentTenant.id : 'branch_zayouni';
            const token = sessionStorage.getItem(SESSION_TOKEN_KEY);
            if (!currentTenant || !token) throw new Error('يلزم تسجيل الدخول إلى الفرع قبل الحفظ');

            const serverResponse = await fetch(`/api/branches/${encodeURIComponent(targetId)}/data`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    Accept: 'application/json'
                },
                body: JSON.stringify({ data: state })
            });
            const serverResult = await serverResponse.json();
            if (!serverResponse.ok || !serverResult.ok) {
                throw new Error(serverResult.error || 'رفض الخادم حفظ بيانات الفرع');
            }

            const now = Date.now();
            localStorage.setItem(LAST_SAVE_KEY, String(now));
            updateLastSavedDisplay(now);
            flashSaveIndicator('saved');
            setFbStatus('online', 'ONLINE');

            return true;
        } catch (err) {
            setFbStatus('offline', 'OFFLINE');
            return false;
        }
    }

    function attachTenantSync(callback) {
        onCloudUpdateCallback = callback;
    }

    function startAutoSaveLoop(stateGetter) {
        if (autoSaveTimer) clearInterval(autoSaveTimer);
        autoSaveTimer = setInterval(() => {
            if (currentTenant && typeof stateGetter === 'function') {
                forceSaveCloud(stateGetter(), 'timer');
            }
        }, AUTO_SAVE_INTERVAL);
    }

    function bindSystemSyncListeners(stateGetter) {
        window.addEventListener('beforeunload', () => {
            if (currentTenant && typeof stateGetter === 'function') {
                saveTenantLocal(stateGetter());
            }
        });

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                if (currentTenant && typeof stateGetter === 'function') {
                    saveTenantLocal(stateGetter());
                }
            } else if (document.visibilityState === 'visible') {
                checkActiveBranchStatus();
            }
        });

        window.addEventListener('online', () => setFbStatus('online', 'ONLINE'));
        window.addEventListener('offline', () => setFbStatus('offline', 'OFFLINE'));
    }

    // Engine Initialization
    async function init() {
        currentTenant = null;
        updateBranchUI();
        setFbStatus('sync', 'AUTH');
        updateLastSavedDisplay();

        const authenticated = await checkActiveBranchStatus();
        if (authenticated) startStatusHeartbeat();
        else localStorage.removeItem(SESSION_BRANCH_KEY);

    }

    // Engine Public API
    window.BackendEngine = {
        init,
        authenticateBranch,
        logoutBranch,
        getCurrentTenant: () => currentTenant,
        loadTenantLocal,
        saveTenantLocal,
        debouncedSave,
        forceSaveCloud,
        attachTenantSync,
        startAutoSaveLoop,
        bindSystemSyncListeners,
        updateLastSavedDisplay,
        flashSaveIndicator,
        setFbStatus,
        checkActiveBranchStatus
    };

    // Auto-init on load
    if (typeof window !== 'undefined') {
        window.addEventListener('DOMContentLoaded', () => {
            init().catch(e => console.warn('[NEXUS Backend] Init note:', e));
        });
    }

})();

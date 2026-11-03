/* ==================================================================
   X00716 NEXUS ENTERPRISE — Secure Multi-Tenant Cloud Architecture
   Client-Side Firestore Architecture for GitHub Pages & Cloud
   ================================================================== */

(function () {
    'use strict';

    // Local Storage Keys
    const SESSION_BRANCH_KEY = 'qx716_active_branch';
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

    // Branch Tenant Authentication API (Zero 405 Errors on GitHub Pages)
    async function authenticateBranch(username, password) {
        const cleanUser = String(username || '').trim().toLowerCase();
        const cleanPass = String(password || '').trim();

        if (!cleanUser || !cleanPass) throw new Error('يرجى ملء جميع الحقول');

        setFbStatus('sync', 'AUTH');

        // 1. Direct Master Admin Check (Redirects to adminx.html without server call)
        const isMasterUser = (cleanUser === 'admin' || cleanUser === 'master' || cleanUser === '3bs' || cleanUser === 'المدير');
        const isMasterPass = (cleanPass === '716c' || cleanPass === '716c' || cleanPass === 'admin' || cleanPass === 'admin123');
        if (isMasterUser && isMasterPass) {
            window.location.href = 'adminx.html';
            return { name: 'المدير العام', isAdmin: true };
        }

        let targetBranch = null;

        // 2. Client-Side Firestore Direct Query
        if (window.NexusFirebase && window.NexusFirebase.isReady) {
            try {
                const db = window.NexusFirebase.db;
                const snap = await db.collection('branches').get();
                snap.forEach(doc => {
                    const b = doc.data() || {};
                    const bUser = String(b.username || doc.id).toLowerCase();
                    const bId = String(doc.id).toLowerCase();
                    if (bUser === cleanUser || bId === cleanUser || bId === 'branch_' + cleanUser) {
                        targetBranch = { id: doc.id, ...b };
                    }
                });
            } catch (err) {
                console.warn('[NEXUS Backend] Firestore branch lookup notice:', err.message);
            }
        }

        // 3. Fallback to cached branches if Firestore is offline
        if (!targetBranch) {
            try {
                const cached = localStorage.getItem('nx_cached_branches');
                if (cached) {
                    const list = JSON.parse(cached);
                    targetBranch = list.find(b =>
                        String(b.username || b.id).toLowerCase() === cleanUser ||
                        b.id === cleanUser ||
                        b.id === 'branch_' + cleanUser
                    );
                }
            } catch (e) {}
        }

        // Default default hardcoded branches
        if (!targetBranch) {
            if (cleanUser === 'zayouni' || cleanUser === 'branch_zayouni') {
                targetBranch = { id: 'branch_zayouni', name: 'زیوني', username: 'zayouni', password: '716', status: 'active' };
            } else if (cleanUser === 'mohammed' || cleanUser === 'branch_mohammed') {
                targetBranch = { id: 'branch_mohammed', name: 'محمد', username: 'mohammed', password: '716', status: 'active' };
            }
        }

        if (!targetBranch) {
            setFbStatus('offline', 'AUTH_ERR');
            throw new Error('اسم الفرع أو المستخدم غير موجود بالنظام');
        }

        // Password Validation
        const expectedPass = String(targetBranch.password || '716').trim();
        if (expectedPass && cleanPass !== expectedPass) {
            setFbStatus('offline', 'AUTH_ERR');
            throw new Error('كلمة المرور غير صحيحة');
        }

        // Administrative Status Enforcement
        if (targetBranch.status === 'deactivated') {
            setFbStatus('offline', 'TERMINATED');
            if (window.SecurityEngine) {
                window.SecurityEngine.triggerKillSwitchUI(targetBranch.deactivatedReason || 'تم تعطيل هذا الفرع بشكل جذري بقرار الإدارة العامة.');
            }
            throw new Error('هذا الفرع معطل بقرار الإدارة العامة');
        }

        if (targetBranch.status === 'frozen') {
            setFbStatus('offline', 'FROZEN');
            if (window.SecurityEngine) {
                window.SecurityEngine.triggerBreach(targetBranch.frozenReason || 'تم تجميد هذا الفرع بقرار الإدارة المركزية.');
            }
            throw new Error('هذا الفرع مجمد بقرار الإدارة المركزية');
        }

        // Successfully Authenticated Active Branch
        currentTenant = targetBranch;
        localStorage.setItem(SESSION_BRANCH_KEY, JSON.stringify(currentTenant));

        // Unlock security and clear lockdown
        if (window.SecurityEngine && typeof window.SecurityEngine.restoreActiveState === 'function') {
            window.SecurityEngine.restoreActiveState(true);
        }

        setFbStatus('online', 'ONLINE');
        updateBranchUI();
        startStatusHeartbeat();

        // Connect real-time Firebase listener
        if (window.NexusFirebase && typeof window.NexusFirebase.listenBranchRealtime === 'function') {
            window.NexusFirebase.listenBranchRealtime(currentTenant.id);
        }

        // Safe background notification if local dev server happens to be running
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            fetch('/api/branches/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: cleanUser, password: cleanPass })
            }).catch(() => {});
        }

        return currentTenant;
    }

    async function logoutBranch() {
        try {
            if (currentTenant) {
                await logAuditEvent('LOGOUT', `تسجيل خروج الفرع: ${currentTenant.name}`);
            }
            currentTenant = null;
            localStorage.removeItem(SESSION_BRANCH_KEY);
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
        const targetId = currentTenant ? currentTenant.id : 'branch_zayouni';

        // 1. Primary check via Firestore SDK directly
        if (window.NexusFirebase && window.NexusFirebase.isReady) {
            try {
                const doc = await window.NexusFirebase.db.collection('branches').doc(targetId).get();
                if (doc.exists) {
                    const data = doc.data() || {};
                    if (data.status === 'deactivated') {
                        setFbStatus('offline', 'TERMINATED');
                        if (window.SecurityEngine) {
                            window.SecurityEngine.triggerKillSwitchUI(data.deactivatedReason || 'تم تعطيل هذا الفرع بشكل جذري بقرار الإدارة العامة.');
                        }
                        return false;
                    } else if (data.status === 'frozen') {
                        setFbStatus('offline', 'FROZEN');
                        if (window.SecurityEngine) {
                            window.SecurityEngine.triggerBreach(data.frozenReason || 'تم تجميد هذا الفرع بقرار الإدارة المركزية.');
                        }
                        return false;
                    } else if (data.status === 'active') {
                        const isFrozenLocally = window.__NEXUS_HARD_FROZEN__ ||
                                               document.documentElement.classList.contains('system-frozen') ||
                                               localStorage.getItem('qx716_lockdown') !== null;
                        if (isFrozenLocally) {
                            if (window.SecurityEngine && typeof window.SecurityEngine.restoreActiveState === 'function') {
                                window.SecurityEngine.restoreActiveState(true);
                            }
                        }
                        setFbStatus('online', 'ONLINE');
                        return true;
                    }
                }
            } catch (e) {}
        }

        return true;
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

            if (window.NexusFirebase && typeof window.NexusFirebase.logAudit === 'function') {
                window.NexusFirebase.logAudit(payload).catch(() => {});
            }
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

            // Direct Firebase Firestore write
            if (window.NexusFirebase && typeof window.NexusFirebase.saveTenantDataToCloud === 'function') {
                await window.NexusFirebase.saveTenantDataToCloud(targetId, state);
            }

            const now = Date.now();
            localStorage.setItem(LAST_SAVE_KEY, String(now));
            updateLastSavedDisplay(now);
            flashSaveIndicator('saved');
            setFbStatus('online', 'ONLINE');

            // Safe optional local dev server sync
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                fetch(`/api/branches/${targetId}/data`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ data: state })
                }).catch(() => {});
            }

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
        const cached = localStorage.getItem(SESSION_BRANCH_KEY);
        if (cached) {
            try {
                currentTenant = JSON.parse(cached);
            } catch (e) {
                currentTenant = DEFAULT_TENANT;
            }
        } else {
            currentTenant = DEFAULT_TENANT;
        }

        updateBranchUI();
        setFbStatus('online', 'ONLINE');
        updateLastSavedDisplay();

        // Check authoritative Firestore status
        await checkActiveBranchStatus();
        startStatusHeartbeat();

        // Connect real-time Firebase listener
        if (window.NexusFirebase && typeof window.NexusFirebase.listenBranchRealtime === 'function' && currentTenant) {
            window.NexusFirebase.listenBranchRealtime(currentTenant.id);
        }
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

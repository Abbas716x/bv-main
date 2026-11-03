/**
 * X00716 NEXUS ENTERPRISE — Cloud Firebase Realtime Client Integration
 * Fully Client-Side Architecture for GitHub Pages & Cloud Full-Stack
 * Project: respawn-7654a
 */

(function (global) {
    'use strict';

    const FIREBASE_CONFIG = {
        apiKey: "AIzaSyAFQx3BndP3piYkONM0KSBcb5vo8xx3a5Q",
        authDomain: "respawn-7654a.firebaseapp.com",
        databaseURL: "https://respawn-7654a-default-rtdb.firebaseio.com",
        projectId: "respawn-7654a",
        storageBucket: "respawn-7654a.firebasestorage.app",
        messagingSenderId: "503079760523",
        appId: "1:503079760523:web:388e783a8dc0e0ec5a9a8e",
        measurementId: "G-HPZG403TFS"
    };

    let app = null;
    let db = null;
    let isInitialized = false;
    let branchStatusUnsubscribe = null;
    let allBranchesUnsubscribe = null;
    let auditLogsUnsubscribe = null;

    // Helper: Safely get or initialize Firestore
    function getDb() {
        if (db) return db;
        try {
            if (typeof firebase !== 'undefined') {
                if (!firebase.apps || !firebase.apps.length) {
                    app = firebase.initializeApp(FIREBASE_CONFIG);
                } else {
                    app = firebase.app();
                }
                db = firebase.firestore();
                isInitialized = true;
                console.log('⚡ [NEXUS Firebase] Connected to Firestore project:', FIREBASE_CONFIG.projectId);
            }
        } catch (e) {
            console.warn('[NEXUS Firebase] Firestore init note:', e.message);
        }
        return db;
    }

    // Try initializing immediately
    getDb();

    // Re-check when window finishes loading
    if (typeof window !== 'undefined') {
        window.addEventListener('load', () => getDb());
    }

    /**
     * LocalStorage Helper for offline fallback
     */
    function getLocalBranches() {
        try {
            const raw = localStorage.getItem('nx_cached_branches');
            if (raw) return JSON.parse(raw);
        } catch (e) {}
        return [
            {
                id: 'branch_zayouni',
                name: 'زیوني',
                username: 'zayouni',
                password: '716',
                status: 'active',
                createdAt: new Date().toISOString(),
                openCount: 1
            },
            {
                id: 'branch_mohammed',
                name: 'محمد',
                username: 'mohammed',
                password: '716',
                status: 'active',
                createdAt: new Date().toISOString(),
                openCount: 0
            }
        ];
    }

    function saveLocalBranches(branches) {
        try {
            localStorage.setItem('nx_cached_branches', JSON.stringify(branches));
        } catch (e) {}
    }

    /**
     * Listen in REAL-TIME to branch status changes (Freeze / Active / Deactivate)
     */
    function listenBranchRealtime(branchId, onStatusChange) {
        const firestore = getDb();
        if (!branchId) return null;

        if (branchStatusUnsubscribe) {
            try { branchStatusUnsubscribe(); } catch(e) {}
        }

        if (firestore) {
            try {
                branchStatusUnsubscribe = firestore.collection('branches').doc(branchId).onSnapshot((doc) => {
                    if (!doc.exists) return;
                    const data = doc.data();
                    if (!data) return;

                    console.log(`📡 [NEXUS Firebase] Realtime update for [${branchId}]:`, data.status);

                    if (typeof onStatusChange === 'function') {
                        onStatusChange(data);
                    }

                    // Administrative state dispatcher
                    if (data.status === 'frozen') {
                        const reason = data.frozenReason || 'تم تجميد هذا الفرع بقرار من الإدارة المركزية.';
                        if (window.SecurityEngine && typeof window.SecurityEngine.triggerBreach === 'function') {
                            window.SecurityEngine.triggerBreach(reason);
                        }
                    } else if (data.status === 'deactivated') {
                        const reason = data.deactivatedReason || 'تم تعطيل هذا الفرع نهائياً بقرار الإدارة العامة.';
                        if (window.SecurityEngine && typeof window.SecurityEngine.triggerKillSwitchUI === 'function') {
                            window.SecurityEngine.triggerKillSwitchUI(reason);
                        }
                    } else if (data.status === 'active') {
                        // Admin unlocked the branch in Firestore!
                        if (window.SecurityEngine && typeof window.SecurityEngine.restoreActiveState === 'function') {
                            window.SecurityEngine.restoreActiveState(true);
                        }
                    }
                }, (error) => {
                    console.warn('[NEXUS Firebase] Branch snapshot listener warning:', error.message);
                });

                return branchStatusUnsubscribe;
            } catch (err) {
                console.warn('[NEXUS Firebase] Listen error:', err);
            }
        }
        return null;
    }

    /**
     * Freeze branch in Firestore (Instant broadcast to all connected devices)
     */
    async function freezeBranchInCloud(branchId, reason) {
        const firestore = getDb();
        const breachReason = reason || 'تجميد أمني من لوحة التحكم المركزية';
        const now = new Date().toISOString();

        // Update local memory first
        const localBranches = getLocalBranches();
        const updatedLocal = localBranches.map(b => (b.id === branchId || branchId === 'all') ? { ...b, status: 'frozen', frozenReason: breachReason } : b);
        saveLocalBranches(updatedLocal);

        if (!firestore) return true;

        try {
            const payload = {
                status: 'frozen',
                frozenReason: breachReason,
                frozenAt: now,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            if (branchId === 'all') {
                const snap = await firestore.collection('branches').get();
                const batch = firestore.batch();
                snap.forEach(doc => {
                    batch.set(doc.ref, payload, { merge: true });
                });
                await batch.commit();
            } else {
                await firestore.collection('branches').doc(branchId).set(payload, { merge: true });
            }

            // Record security breach record
            await firestore.collection('security_breaches').add({
                branchId: branchId,
                reason: breachReason,
                timestamp: now,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Update system control document
            await firestore.collection('systemControl').doc('globalState').set({
                systemFrozen: true,
                lastBreachReason: breachReason,
                lastBreachAt: now,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            await logAudit({
                branchId: branchId,
                action: 'BRANCH_FROZEN',
                details: `تم تجميد الفرع [${branchId}]: ${breachReason}`,
                severity: 'critical'
            });

            return true;
        } catch (e) {
            console.warn('[NEXUS Firebase] Cloud freeze error:', e.message);
            return false;
        }
    }

    /**
     * Unfreeze branch in Firestore (Instant unlock for the branch)
     */
    async function unfreezeBranchInCloud(branchId) {
        const firestore = getDb();
        const now = new Date().toISOString();

        // Update local memory
        const localBranches = getLocalBranches();
        const updatedLocal = localBranches.map(b => (b.id === branchId || branchId === 'all') ? { ...b, status: 'active', frozenReason: null } : b);
        saveLocalBranches(updatedLocal);

        // Clear local lockdown immediately if current branch
        try {
            localStorage.removeItem('qx716_lockdown');
            sessionStorage.removeItem('qx716_lockdown');
            const activeRaw = localStorage.getItem('qx716_active_branch');
            if (activeRaw) {
                const b = JSON.parse(activeRaw);
                if (b.id === branchId || branchId === 'all') {
                    b.status = 'active';
                    delete b.frozenReason;
                    localStorage.setItem('qx716_active_branch', JSON.stringify(b));
                }
            }
        } catch (e) {}

        if (!firestore) return true;

        try {
            const payload = {
                status: 'active',
                frozenReason: null,
                unfrozenAt: now,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            if (branchId === 'all') {
                const snap = await firestore.collection('branches').get();
                const batch = firestore.batch();
                snap.forEach(doc => {
                    batch.set(doc.ref, payload, { merge: true });
                });
                await batch.commit();
            } else {
                await firestore.collection('branches').doc(branchId).set(payload, { merge: true });
            }

            // Update system control document
            await firestore.collection('systemControl').doc('globalState').set({
                systemFrozen: false,
                unfrozenAt: now,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            await logAudit({
                branchId: branchId,
                action: 'BRANCH_UNFROZEN',
                details: `تم فك تجميد الفرع [${branchId}] وإعادته للعمل النشط`,
                severity: 'normal'
            });

            return true;
        } catch (e) {
            console.warn('[NEXUS Firebase] Cloud unfreeze error:', e.message);
            return false;
        }
    }

    /**
     * Toggle branch freeze state
     * Supports boolean (true for freeze, false for unfreeze) or string ('frozen', 'active')
     */
    async function toggleFreezeBranch(branchId, statusOrIsFrozen, reason) {
        let shouldFreeze = false;
        if (typeof statusOrIsFrozen === 'boolean') {
            shouldFreeze = statusOrIsFrozen;
        } else if (typeof statusOrIsFrozen === 'string') {
            shouldFreeze = statusOrIsFrozen.toLowerCase() === 'frozen';
        }
        if (shouldFreeze) {
            return await freezeBranchInCloud(branchId, reason);
        } else {
            return await unfreezeBranchInCloud(branchId);
        }
    }

    /**
     * Admin: Create / Provision New Branch in Firestore
     */
    async function createBranchInCloud(branchData) {
        if (!branchData) return false;
        const firestore = getDb();
        const now = new Date().toISOString();

        const rawUser = String(branchData.username || branchData.id || 'branch_' + Date.now()).trim();
        const docId = branchData.id || ('branch_' + rawUser.toLowerCase().replace(/[^a-z0-9_]/g, '_'));

        const docData = {
            id: docId,
            name: branchData.name || rawUser,
            username: rawUser,
            password: String(branchData.password || '716').trim(),
            status: branchData.status || 'active',
            createdAt: branchData.createdAt || now,
            lastOpenedAt: branchData.lastOpenedAt || null,
            openCount: branchData.openCount || 0,
            frozenReason: null
        };

        // Update local cache
        const local = getLocalBranches().filter(b => b.id !== docId);
        local.unshift(docData);
        saveLocalBranches(local);

        if (!firestore) return docData;

        try {
            const cloudDoc = {
                ...docData,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            await firestore.collection('branches').doc(docId).set(cloudDoc, { merge: true });

            // Initialize default tenant operational data
            await firestore.collection('tenantData').doc(docId).set({
                data: {
                    tables: [],
                    debts: [],
                    invoices: [],
                    categories: [
                        { id: 'c1', name: 'صالات البليستيشن', icon: '🎮' },
                        { id: 'c2', name: 'المشروبات والوجبات', icon: '🥤' }
                    ],
                    products: [
                        { id: 'p1', catId: 'c1', name: 'ساعة PS5 VIP', icon: '🕐', type: 'countdown', duration: 60, price: 4000 },
                        { id: 'p2', catId: 'c2', name: 'قهوة اسبريسو', icon: '☕', type: 'single', duration: 0, price: 2000 }
                    ],
                    revenue: { daily: 0, yesterday: 0, monthly: 0 }
                },
                updatedAt: now
            }, { merge: true });

            // Audit Log
            await logAudit({
                branchId: docId,
                branchName: docData.name,
                branchUser: docData.username,
                action: 'BRANCH_CREATED',
                details: `تم إنشاء فرع جديد للنظام سحابياً: ${docData.name} (المستخدم: ${docData.username})`,
                severity: 'normal'
            });

            return docData;
        } catch (err) {
            console.error('[NEXUS Firebase] Create branch error:', err);
            throw err;
        }
    }

    /**
     * Admin: Update Branch Credentials / Details in Firestore
     */
    async function updateBranchInCloud(branchId, updates) {
        if (!branchId || !updates) return false;
        const firestore = getDb();

        // Local cache update
        const local = getLocalBranches();
        const idx = local.findIndex(b => b.id === branchId);
        if (idx !== -1) {
            local[idx] = { ...local[idx], ...updates };
            saveLocalBranches(local);
        }

        if (!firestore) return true;

        try {
            const dataToUpdate = {
                ...updates,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            await firestore.collection('branches').doc(branchId).set(dataToUpdate, { merge: true });

            await logAudit({
                branchId: branchId,
                branchName: updates.name || branchId,
                branchUser: updates.username || 'admin',
                action: 'BRANCH_UPDATED',
                details: `تم تعديل بيانات واعتماد الفرع: ${updates.name || branchId}`,
                severity: 'normal'
            });

            return true;
        } catch (err) {
            console.error('[NEXUS Firebase] Update branch error:', err);
            throw err;
        }
    }

    /**
     * Real-time Fetch & Listener for Branches with Dynamic Counters
     * Calls callback(branches, metrics: { total, active, frozen, deactivated })
     */
    function fetchBranches(callback) {
        const firestore = getDb();

        function calculateMetrics(branchesList) {
            const list = Array.isArray(branchesList) ? branchesList : [];
            return {
                total: list.length,
                active: list.filter(b => b.status === 'active').length,
                frozen: list.filter(b => b.status === 'frozen').length,
                deactivated: list.filter(b => b.status === 'deactivated').length
            };
        }

        // Return a Promise if called without callback
        if (typeof callback !== 'function') {
            if (!firestore) {
                const branches = getLocalBranches();
                return Promise.resolve({ branches, metrics: calculateMetrics(branches) });
            }
            return firestore.collection('branches').get().then(snap => {
                const branches = [];
                snap.forEach(doc => branches.push({ id: doc.id, ...doc.data() }));
                branches.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
                return { branches, metrics: calculateMetrics(branches) };
            }).catch(e => {
                const branches = getLocalBranches();
                return { branches, metrics: calculateMetrics(branches) };
            });
        }

        // Real-time snapshot listener
        if (!firestore) {
            const branches = getLocalBranches();
            callback(branches, calculateMetrics(branches));
            return () => {};
        }

        try {
            if (allBranchesUnsubscribe) {
                try { allBranchesUnsubscribe(); } catch(e) {}
            }
            allBranchesUnsubscribe = firestore.collection('branches').onSnapshot(snap => {
                const branches = [];
                snap.forEach(doc => {
                    branches.push({ id: doc.id, ...doc.data() });
                });
                branches.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
                saveLocalBranches(branches);
                const metrics = calculateMetrics(branches);
                callback(branches, metrics);
            }, err => {
                console.warn('[NEXUS Firebase] Branches snapshot error, using cached:', err.message);
                const branches = getLocalBranches();
                callback(branches, calculateMetrics(branches));
            });

            return allBranchesUnsubscribe;
        } catch (e) {
            const branches = getLocalBranches();
            callback(branches, calculateMetrics(branches));
            return () => {};
        }
    }

    /**
     * Deactivate branch permanently
     */
    async function deactivateBranchInCloud(branchId, reason) {
        const firestore = getDb();
        if (!branchId) return false;
        const now = new Date().toISOString();

        if (firestore) {
            try {
                await firestore.collection('branches').doc(branchId).set({
                    status: 'deactivated',
                    deactivatedReason: reason || 'تعطيل إداري',
                    deactivatedAt: now,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });

                await logAudit({
                    branchId: branchId,
                    action: 'BRANCH_DEACTIVATED',
                    details: `تم تعطيل الفرع نهائياً: ${branchId}`,
                    severity: 'critical'
                });
                return true;
            } catch (e) {
                console.warn('[NEXUS Firebase] Deactivate error:', e.message);
            }
        }
        return false;
    }

    /**
     * Delete branch permanently
     */
    async function deleteBranchInCloud(branchId, branchName) {
        const firestore = getDb();
        if (!branchId) return false;

        const local = getLocalBranches().filter(b => b.id !== branchId);
        saveLocalBranches(local);

        if (firestore) {
            try {
                await firestore.collection('branches').doc(branchId).delete();
                await firestore.collection('tenantData').doc(branchId).delete().catch(() => {});

                await logAudit({
                    branchId: branchId,
                    branchName: branchName || branchId,
                    action: 'BRANCH_DELETED',
                    details: `تم حذف الفرع نهائياً من قاعدة البيانات: ${branchName || branchId}`,
                    severity: 'warning'
                });
                return true;
            } catch (e) {
                console.error('[NEXUS Firebase] Delete branch error:', e);
                throw e;
            }
        }
        return true;
    }

    /**
     * Wipe Tenant Operational Data (Reset tables, debts, invoices)
     */
    async function wipeBranchDataInCloud(branchId, branchName) {
        const firestore = getDb();
        if (!branchId) return false;

        if (firestore) {
            try {
                await firestore.collection('tenantData').doc(branchId).set({
                    data: {
                        tables: [],
                        debts: [],
                        invoices: [],
                        categories: [
                            { id: 'c1', name: 'صالات البليستيشن', icon: '🎮' },
                            { id: 'c2', name: 'المشروبات والوجبات', icon: '🥤' }
                        ],
                        products: [
                            { id: 'p1', catId: 'c1', name: 'ساعة PS5 VIP', icon: '🕐', type: 'countdown', duration: 60, price: 4000 }
                        ],
                        revenue: { daily: 0, yesterday: 0, monthly: 0 }
                    },
                    updatedAt: new Date().toISOString()
                }, { merge: true });

                await logAudit({
                    branchId: branchId,
                    branchName: branchName || branchId,
                    action: 'BRANCH_DATA_WIPED',
                    details: `تم تصفير وحذف جميع بيانات وجلسات الفرع: ${branchName || branchId}`,
                    severity: 'warning'
                });
                return true;
            } catch (e) {
                console.error('[NEXUS Firebase] Wipe branch error:', e);
                throw e;
            }
        }
        return true;
    }

    /**
     * Save branch operational tenant data (tables, products, debts, revenue)
     */
    async function saveTenantDataToCloud(branchId, data) {
        const firestore = getDb();
        if (!branchId || !data) return false;
        if (!firestore) return false;

        try {
            await firestore.collection('tenantData').doc(branchId).set({
                data: data,
                updatedAt: new Date().toISOString(),
                serverTime: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            return true;
        } catch (e) {
            console.warn('[NEXUS Firebase] Tenant data save error:', e.message);
            return false;
        }
    }

    /**
     * Fetch tenant data once
     */
    async function fetchTenantDataFromCloud(branchId) {
        const firestore = getDb();
        if (!branchId || !firestore) return null;
        try {
            const doc = await firestore.collection('tenantData').doc(branchId).get();
            if (doc.exists && doc.data() && doc.data().data) {
                return doc.data().data;
            }
            return null;
        } catch (e) {
            console.warn('[NEXUS Firebase] Tenant fetch error:', e.message);
            return null;
        }
    }

    /**
     * Real-time Audit Logs Listener
     */
    function listenAuditLogs(onLogsUpdate, limitCount = 60) {
        const firestore = getDb();
        if (!firestore) {
            if (typeof onLogsUpdate === 'function') onLogsUpdate([]);
            return () => {};
        }

        try {
            if (auditLogsUnsubscribe) {
                try { auditLogsUnsubscribe(); } catch(e) {}
            }
            auditLogsUnsubscribe = firestore.collection('audit_logs')
                .orderBy('timestamp', 'desc')
                .limit(limitCount)
                .onSnapshot((snapshot) => {
                    const logs = [];
                    snapshot.forEach(doc => {
                        logs.push({ id: doc.id, ...doc.data() });
                    });
                    if (typeof onLogsUpdate === 'function') {
                        onLogsUpdate(logs);
                    }
                }, (err) => {
                    console.warn('[NEXUS Firebase] Audit logs listen warning:', err.message);
                });

            return auditLogsUnsubscribe;
        } catch (e) {
            return () => {};
        }
    }

    /**
     * Clear Audit Logs in Firestore
     */
    async function clearAuditLogsInCloud() {
        const firestore = getDb();
        if (!firestore) return false;
        try {
            const snap = await firestore.collection('audit_logs').limit(100).get();
            const batch = firestore.batch();
            snap.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            return true;
        } catch (e) {
            console.warn('[NEXUS Firebase] Clear audit logs error:', e);
            return false;
        }
    }

    /**
     * Initial Seed Helper: Ensures default branches exist in Firestore if empty
     */
    async function ensureDefaultBranchesSeeded() {
        const firestore = getDb();
        if (!firestore) return;
        try {
            const snap = await firestore.collection('branches').get();
            const now = new Date().toISOString();

            if (snap.empty) {
                console.log('⚡ [NEXUS Firebase] Seeding default branches into Firestore...');
                const defaultBranches = [
                    {
                        id: 'branch_zayouni',
                        name: 'زیوني',
                        username: 'zayouni',
                        password: '716',
                        status: 'active',
                        createdAt: now,
                        lastOpenedAt: now,
                        openCount: 1
                    },
                    {
                        id: 'branch_mohammed',
                        name: 'محمد',
                        username: 'mohammed',
                        password: '716',
                        status: 'active',
                        createdAt: now,
                        lastOpenedAt: null,
                        openCount: 0
                    }
                ];

                for (const b of defaultBranches) {
                    await createBranchInCloud(b);
                }
            } else {
                // Ensure branch_zayouni is active if previously stuck frozen
                const zayouniDoc = snap.docs.find(d => d.id === 'branch_zayouni');
                if (zayouniDoc && zayouniDoc.data().status === 'frozen') {
                    // Check if system control unfreeze was triggered
                    const globalDoc = await firestore.collection('systemControl').doc('globalState').get().catch(() => null);
                    if (globalDoc && globalDoc.exists && globalDoc.data().systemFrozen === false) {
                        await firestore.collection('branches').doc('branch_zayouni').set({
                            status: 'active',
                            frozenReason: null
                        }, { merge: true });
                    }
                }
            }
        } catch (e) {
            console.warn('[NEXUS Firebase] Seed note:', e.message);
        }
    }

    /**
     * Audit Logging
     */
    async function logAudit(entry) {
        const firestore = getDb();
        if (!firestore || !entry) return;
        try {
            await firestore.collection('audit_logs').add({
                ...entry,
                timestamp: entry.timestamp || new Date().toISOString(),
                epoch: entry.epoch || Date.now(),
                serverTime: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (e) {}
    }

    // Comprehensive Global Object Definition
    const NexusFirebase = {
        config: FIREBASE_CONFIG,
        get db() { return getDb(); },
        get app() { return app; },
        get isReady() { return !!getDb(); },
        init: getDb,

        // Branch Operations
        createBranchInCloud,
        updateBranchInCloud,
        toggleFreezeBranch,
        unfreezeBranch: unfreezeBranchInCloud,
        unfreezeBranchFromAdmin: unfreezeBranchInCloud,
        freezeBranch: freezeBranchInCloud,
        freezeBranchInCloud,
        unfreezeBranchInCloud,
        deactivateBranchInCloud,
        deleteBranchInCloud,
        wipeBranchDataInCloud,

        // Data Query & Listeners
        fetchBranches,
        listenAllBranches: fetchBranches,
        listenBranch: listenBranchRealtime,
        listenBranchRealtime,
        saveTenantDataToCloud,
        fetchTenantDataFromCloud,

        // Audit Logs & Seed
        listenAuditLogs,
        clearAuditLogsInCloud,
        ensureDefaultBranchesSeeded,
        logAudit
    };

    global.NexusFirebase = NexusFirebase;

})(typeof window !== 'undefined' ? window : this);

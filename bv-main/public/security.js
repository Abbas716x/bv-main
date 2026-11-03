/* ==================================================================
   X00716 NEXUS ENTERPRISE — Anti-Debugging & Tamper Security Core
   Active Security Shield — درع الحماية الأمني المفعّل
   Full Anti-DevTools, Anti-Inspect & Admin-Controlled Lockdown
   ================================================================== */

(function () {
    'use strict';

    const overlay = document.getElementById('security-breach-overlay');
    const killswitchOverlay = document.getElementById('killswitch-overlay');
    const killswitchMsg = document.getElementById('killswitch-msg');
    let breachActive = false;
    let killSwitchActive = false;
    let lastBreachReportTs = 0;
    const SHIELD_ACTIVE = true;

    // Retrieve active branch identifier safely
    function getActiveBranchId() {
        try {
            const raw = localStorage.getItem('qx716_active_branch');
            if (raw) {
                const b = JSON.parse(raw);
                if (b && b.id) return b.id;
            }
        } catch (e) {}
        return 'branch_zayouni';
    }

    // Radical Real Freeze: Permanent Lockdown & Central Sync
    async function triggerPermanentTamperFreeze(reason) {
        if (breachActive) return;
        breachActive = true;
        const breachReason = reason || 'محاولة فحص الأكواد أو فتح أدوات المطور (DevTools / Inspect)';

        console.warn('🚨 [NEXUS SECURITY SHIELD] BREACH DETECTED:', breachReason);

        // 1. Immediately apply hard class to root DOM (Zero Refresh Bypass)
        document.documentElement.classList.add('system-frozen');

        // 2. Instantly display security freeze overlay
        if (overlay) {
            overlay.classList.remove('hidden');
        }

        const reasonTextEl = document.getElementById('breach-reason-text');
        if (reasonTextEl) {
            reasonTextEl.innerHTML = `تم رصد محاولة فحص العناصر أو فتح أدوات المطور.<br><b class="text-rose-400">تم تجميد هذا الفرع بالكامل وتوقفه عن العمل نهائياً فوراً</b> لحماية البيانات.<br><span class="text-xs text-yellow-300 font-mono mt-1 block">سبب الرصد: ${breachReason}</span><br>لا يمكن إعادة تشغيل هذا الفرع أو فك التجميد إلا من خلال تدخل المدير العام حصراً عبر الإدارة المركزية.`;
        }

        // Close any open modals or menus
        try {
            document.querySelectorAll('.modal-bd').forEach(m => m.style.display = 'none');
            const drawer = document.getElementById('drawer');
            if (drawer) drawer.classList.remove('open');
        } catch (e) {}

        // 3. Store permanent tamper lock in local and session storage
        try {
            localStorage.setItem('qx716_lockdown', JSON.stringify({
                frozen: true,
                reason: breachReason,
                timestamp: Date.now()
            }));
            sessionStorage.setItem('qx716_lockdown', 'true');

            const raw = localStorage.getItem('qx716_active_branch');
            if (raw) {
                const b = JSON.parse(raw);
                b.status = 'frozen';
                b.frozenReason = breachReason;
                localStorage.setItem('qx716_active_branch', JSON.stringify(b));
            }
        } catch (e) {}

        // 4. Report to Firebase Firestore immediately
        const branchId = getActiveBranchId();
        if (window.NexusFirebase && typeof window.NexusFirebase.freezeBranchInCloud === 'function') {
            try {
                await window.NexusFirebase.freezeBranchInCloud(branchId, breachReason);
            } catch (err) {
                console.warn('[NEXUS Security] Firebase freeze notice:', err);
            }
        }

        // 5. Report to local server if running
        const now = Date.now();
        if (now - lastBreachReportTs > 1500) {
            lastBreachReportTs = now;
            try {
                if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                    fetch(`/api/branches/${branchId}/tamper`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            reason: breachReason,
                            clientDetails: {
                                userAgent: navigator.userAgent,
                                screen: `${window.innerWidth}x${window.innerHeight}`,
                                time: new Date().toISOString()
                            }
                        })
                    }).catch(() => {});
                }
            } catch (e) {}
        }
    }

    // Restore active state ONLY when Admin explicitly unfreezes the branch
    function restoreActiveState(isServerConfirmed = false) {
        if (!isServerConfirmed) {
            console.warn('[NEXUS Security] Restore ignored: awaiting authoritative server/admin confirmation.');
            return false;
        }

        breachActive = false;
        killSwitchActive = false;
        window.__JUST_UNFROZEN__ = Date.now();
        window.__NEXUS_HARD_FROZEN__ = false;
        window.__NEXUS_HARD_TERMINATED__ = false;

        document.documentElement.classList.remove('system-frozen');
        document.documentElement.classList.remove('system-terminated');

        if (overlay) overlay.classList.add('hidden');
        if (killswitchOverlay) killswitchOverlay.classList.add('hidden');

        try {
            localStorage.removeItem('qx716_lockdown');
            sessionStorage.removeItem('qx716_lockdown');
            const raw = localStorage.getItem('qx716_active_branch');
            if (raw) {
                const b = JSON.parse(raw);
                b.status = 'active';
                delete b.frozenReason;
                delete b.frozenAt;
                localStorage.setItem('qx716_active_branch', JSON.stringify(b));
            }
        } catch (e) {}

        console.log('✅ [NEXUS Security Shield] Active state restored by Master Admin.');
        return true;
    }

    // Remote Kill-Switch / Radical Deactivation Screen
    function triggerKillSwitchUI(reasonText) {
        killSwitchActive = true;
        document.documentElement.classList.add('system-terminated');
        try {
            if (killswitchMsg) {
                killswitchMsg.textContent = reasonText || 'تم إيقاف وتعطيل هذا الفرع بشكل جذري ونهائي بقرار الإدارة العامة المركزية.';
            }
            if (killswitchOverlay) {
                killswitchOverlay.classList.remove('hidden');
            }
            document.querySelectorAll('.modal-bd').forEach(m => m.style.display = 'none');
            const drawer = document.getElementById('drawer');
            if (drawer) drawer.classList.remove('open');
        } catch (e) {}
    }

    // ==========================================================
    // 🛡️ ACTIVE DEFENSE PROTOCOLS (تفعيل الحماية الكاملة)
    // ==========================================================

    // 1. Context Menu Interceptor (Block right click / Inspect Element)
    document.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        e.stopPropagation();
        return false;
    }, { capture: true });

    // 2. Strict Keyboard Shortcuts Interceptor (F12, Ctrl+Shift+I/J/C, Ctrl+U)
    document.addEventListener('keydown', function (e) {
        const isCtrlOrCmd = e.ctrlKey || e.metaKey;
        const key = e.key ? e.key.toUpperCase() : '';
        const keyCode = e.keyCode || e.which;

        // F12 Pressed -> Immediate Permanent Branch Freeze
        if (keyCode === 123 || key === 'F12') {
            e.preventDefault();
            e.stopPropagation();
            triggerPermanentTamperFreeze('الضغط على زر F12 لمحاولة فتح أدوات المطور');
            return false;
        }

        // Ctrl + Shift + I/J/C or Cmd + Option + I/J/C (DevTools / Console / Inspector)
        if (isCtrlOrCmd && (e.shiftKey || e.altKey) && (key === 'I' || key === 'J' || key === 'C' || keyCode === 73 || keyCode === 74 || keyCode === 67)) {
            e.preventDefault();
            e.stopPropagation();
            triggerPermanentTamperFreeze('استخدام اختصار فتح أدوات المطور (Ctrl+Shift+I/J/C)');
            return false;
        }

        // Ctrl + U (View Source Code)
        if (isCtrlOrCmd && (key === 'U' || keyCode === 85)) {
            e.preventDefault();
            e.stopPropagation();
            triggerPermanentTamperFreeze('محاولة عرض الشفرة المصدرية (Ctrl+U)');
            return false;
        }

        // Ctrl + S (Intercept Save Page)
        if (isCtrlOrCmd && (key === 'S' || keyCode === 83)) {
            e.preventDefault();
            e.stopPropagation();
            if (window.manualSave) window.manualSave(true);
            return false;
        }
    }, { capture: true });

    // 3. DevTools Outer Dimensions Inspection Trap
    let devtoolsCheckCounter = 0;
    function checkDevToolsOpen() {
        if (breachActive || killSwitchActive) return;
        // Grace period after unfreeze
        if (window.__JUST_UNFROZEN__ && (Date.now() - window.__JUST_UNFROZEN__ < 12000)) return;

        const widthThreshold = window.outerWidth - window.innerWidth > 165;
        const heightThreshold = window.outerHeight - window.innerHeight > 165;

        if (widthThreshold || heightThreshold) {
            devtoolsCheckCounter++;
            if (devtoolsCheckCounter >= 2) {
                triggerPermanentTamperFreeze('رصد فتح نافذة أدوات المطور والمفتش الجانبي (DevTools Docked)');
            }
        } else {
            devtoolsCheckCounter = 0;
        }
    }

    setInterval(checkDevToolsOpen, 2500);

    // 4. Initial state enforcement on script boot
    try {
        const lock = localStorage.getItem('qx716_lockdown');
        const branchRaw = localStorage.getItem('qx716_active_branch');
        let shouldLock = false;
        let lockReason = '';
        if (lock) {
            const l = JSON.parse(lock);
            if (l && l.frozen) {
                shouldLock = true;
                lockReason = l.reason || 'إغلاق أمني دائم مسبق (محاولة تجاوز التجميد عبر التحديث)';
            }
        }
        if (!shouldLock && branchRaw) {
            const b = JSON.parse(branchRaw);
            if (b && b.status === 'frozen') {
                shouldLock = true;
                lockReason = b.frozenReason || 'تم تجميد الفرع بقرار الإدارة المركزية';
            }
        }
        if (shouldLock) {
            triggerPermanentTamperFreeze(lockReason);
        }
    } catch (e) {}

    // 5. Connect real-time Firestore security sync
    function attachFirestoreSecuritySync() {
        const branchId = getActiveBranchId();
        if (window.NexusFirebase && typeof window.NexusFirebase.listenBranchRealtime === 'function' && branchId) {
            window.NexusFirebase.listenBranchRealtime(branchId, (branchData) => {
                if (!branchData) return;
                if (branchData.status === 'active') {
                    restoreActiveState(true);
                } else if (branchData.status === 'frozen') {
                    triggerPermanentTamperFreeze(branchData.frozenReason);
                } else if (branchData.status === 'deactivated') {
                    triggerKillSwitchUI(branchData.deactivatedReason);
                }
            });
        }
    }

    if (typeof window !== 'undefined') {
        window.addEventListener('load', () => {
            setTimeout(attachFirestoreSecuritySync, 500);
        });
    }

    // Public Security API
    window.SecurityEngine = {
        isShieldActive: () => SHIELD_ACTIVE,
        triggerBreach: triggerPermanentTamperFreeze,
        triggerKillSwitchUI: triggerKillSwitchUI,
        restoreActiveState: restoreActiveState,
        isBreachActive: () => breachActive,
        isKillSwitchActive: () => killSwitchActive
    };

    console.log('🛡️ [X00716 NEXUS] درع الحماية الأمني مفعّل بنجاح (SECURITY SHIELD: ACTIVE & ARMED)');

})();

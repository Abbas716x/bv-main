/* ==================================================================
   X00716 NEXUS ENTERPRISE — Master POS & Lounge Engine
   ================================================================== */

(function () {
    'use strict';

    // Core Utilities
    const $ = selector => document.querySelector(selector);
    const $$ = selector => document.querySelectorAll(selector);
    const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const fmt = n => new Intl.NumberFormat('en-US').format(Math.round(n || 0));
    const now = () => Date.now();

    function pad(n) { return String(n).padStart(2, '0'); }
    function timeStr(sec) {
        sec = Math.max(0, Math.floor(sec));
        return pad(Math.floor(sec / 3600)) + ':' + pad(Math.floor((sec % 3600) / 60)) + ':' + pad(sec % 60);
    }
    function dateStr(iso) {
        if (!iso) return '—';
        const d = new Date(iso);
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    function escapeHtml(s) {
        return String(s || '').replace(/[&<>"']/g, m => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[m]);
    }

    // Default In-Memory Tenant State
    const createDefaultState = () => ({
        tables: [],
        debts: [],
        invoices: [],
        categories: [
            { id: 'c1', name: 'صالات البليستيشن', icon: '🎮' },
            { id: 'c2', name: 'المشروبات الباردة والساخنة', icon: '🥤' },
            { id: 'c3', name: 'الوجبات السريعة', icon: '🍕' },
            { id: 'c4', name: 'قسم الأراجيل الفاخرة', icon: '💨' }
        ],
        products: [
            { id: 'p1', catId: 'c1', name: 'نصف ساعة PS5', icon: '⏱', type: 'countdown', duration: 30, price: 2000 },
            { id: 'p2', catId: 'c1', name: 'ساعة كاملة PS5', icon: '🕐', type: 'countdown', duration: 60, price: 4000 },
            { id: 'p3', catId: 'c1', name: 'وقت مفتوح PS5', icon: '♾', type: 'open', duration: 0, price: 4000 },
            { id: 'p4', catId: 'c2', name: 'مشروب غازي بيبسي', icon: '🥤', type: 'direct', duration: 0, price: 1000 },
            { id: 'p5', catId: 'c2', name: 'عصير برتقال طبيعي', icon: '🍊', type: 'direct', duration: 0, price: 2500 },
            { id: 'p6', catId: 'c2', name: 'مياه معدنية', icon: '💧', type: 'direct', duration: 0, price: 500 },
            { id: 'p7', catId: 'c3', name: 'بيتزا شاورما لحم', icon: '🍕', type: 'direct', duration: 0, price: 6000 },
            { id: 'p8', catId: 'c4', name: 'أركيلة تفاحتين فاخر', icon: '💨', type: 'direct', duration: 0, price: 5000 }
        ],
        revenue: { daily: 0, yesterday: 0, monthly: 0 },
        activeView: 'dashboard',
        activeTableId: null,
        pickerCatId: null,
        editingProductId: null,
        earlyItemId: null,
        managingDebtId: null
    });

    let S = createDefaultState();
    let liveTickerInterval = null;

    // Toast Notification Dispatcher
    function toast(msg, type = 'info', duration = 2800) {
        try {
            const wrap = $('#toast-wrap');
            if (!wrap) return;
            const el = document.createElement('div');
            el.className = `toast ${type}`;
            el.textContent = msg;
            wrap.appendChild(el);

            setTimeout(() => {
                el.style.transition = 'all 0.3s cubic-bezier(0.34, 1.5, 0.64, 1)';
                el.style.opacity = '0';
                el.style.transform = 'translateY(-20px) scale(0.9)';
                setTimeout(() => el.remove(), 320);
            }, duration);
        } catch (e) {}
    }

    // ==================== GLASSMORPHIC DIALOG ENGINE ====================

    let alertResolver = null;
    let confirmResolver = null;
    let promptResolver = null;

    const DialogEngine = {
        alert: function (message, title = 'تنبيه النظام') {
            return new Promise(resolve => {
                alertResolver = resolve;
                $('#sys-alert-title').textContent = title;
                $('#sys-alert-msg').textContent = message;
                openModal('modal-sys-alert');
            });
        },
        resolveAlert: function () {
            closeModal('modal-sys-alert');
            if (alertResolver) {
                const res = alertResolver;
                alertResolver = null;
                res();
            }
        },
        confirm: function (message, title = 'تأكيد الإجراء') {
            return new Promise(resolve => {
                confirmResolver = resolve;
                $('#sys-confirm-title').textContent = title;
                $('#sys-confirm-msg').textContent = message;
                openModal('modal-sys-confirm');
            });
        },
        resolveConfirm: function (val) {
            closeModal('modal-sys-confirm');
            if (confirmResolver) {
                const res = confirmResolver;
                confirmResolver = null;
                res(Boolean(val));
            }
        },
        prompt: function (message, title = 'إدخال قيمة', defaultValue = '') {
            return new Promise(resolve => {
                promptResolver = resolve;
                $('#sys-prompt-title').textContent = title;
                $('#sys-prompt-msg').textContent = message;
                const inp = $('#sys-prompt-input');
                inp.value = defaultValue;
                openModal('modal-sys-prompt');
                setTimeout(() => inp.focus(), 120);
            });
        },
        submitPrompt: function () {
            const val = $('#sys-prompt-input').value;
            closeModal('modal-sys-prompt');
            if (promptResolver) {
                const res = promptResolver;
                promptResolver = null;
                res(val);
            }
        },
        resolvePrompt: function (val) {
            closeModal('modal-sys-prompt');
            if (promptResolver) {
                const res = promptResolver;
                promptResolver = null;
                res(val);
            }
        }
    };

    window.DialogEngine = DialogEngine;

    // Viewport Helpers
    function openModal(id) {
        try {
            const el = document.getElementById(id);
            if (el) el.style.display = 'flex';
        } catch (e) {}
    }
    function closeModal(id) {
        try {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        } catch (e) {}
    }
    function openDrawer() {
        try {
            $('#drawer').classList.add('open');
            $('#drawer-overlay').classList.add('show');
        } catch (e) {}
    }
    function closeDrawer() {
        try {
            $('#drawer').classList.remove('open');
            $('#drawer-overlay').classList.remove('show');
        } catch (e) {}
    }

    // Auto-Save Bridge
    function triggerSave() {
        try {
            if (window.BackendEngine && typeof window.BackendEngine.debouncedSave === 'function') {
                window.BackendEngine.debouncedSave(() => S);
            }
        } catch (e) {}
    }

    // ==================== CALCULATION ENGINES ====================

    function itemElapsed(it) {
        if (it.type === 'direct') return 0;
        let elapsed = it.sessionElapsed || 0;
        if (it.status === 'running') {
            elapsed += (now() - it.startedAt) / 1000 - (it.pausedTotal || 0);
        }
        return Math.max(0, elapsed);
    }

    function itemTotal(it) {
        if (it.type === 'direct') return (it.price || 0) * (it.qty || 1);
        if (it.type === 'countdown') return (it.price || 0) * (it.qty || 1);
        if (it.type === 'open') {
            const elapsed = itemElapsed(it);
            return Math.round((elapsed * (it.price || 0) / 3600) * (it.qty || 1));
        }
        return 0;
    }

    function itemExpired(it) {
        if (it.type !== 'countdown') return false;
        return itemElapsed(it) >= (it.duration || 0) * 60 * (it.qty || 1);
    }

    function tableTotals(t) {
        let sub = 0;
        let early = 0;
        (t.items || []).forEach(it => {
            sub += itemTotal(it);
            early += (it.earlyPaid || 0);
        });
        const disc = Number(t.discount) || 0;
        const finalAmount = Math.max(0, sub - early - disc);
        return { sub, early, disc, final: finalAmount };
    }

    function currentTable() {
        return (S.tables || []).find(t => t.id === S.activeTableId);
    }

    // ==================== NAVIGATION & TICKER ====================

    function switchView(viewName) {
        try {
            S.activeView = viewName;
            $$('.view').forEach(v => v.classList.remove('active'));
            let target = document.getElementById('view-' + viewName);
            if (!target && viewName === 'admin-master') {
                target = document.getElementById('admin-master-view');
            }
            if (target) target.classList.add('active');

            $$('.nav-item').forEach(btn => {
                if (btn.getAttribute('data-view') === viewName) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });

            closeDrawer();
            window.scrollTo({ top: 0, behavior: 'instant' });

            if (viewName === 'dashboard') {
                renderDashboard();
            } else if (viewName === 'tables') {
                renderTables();
            } else if (viewName === 'table-detail') {
                renderTableDetail();
            } else if (viewName === 'menu') {
                renderMenu();
            } else if (viewName === 'debts') {
                renderDebts();
            } else if (viewName === 'invoices') {
                renderInvoices();
            } else if (viewName === 'admin-master') {
                if (window.SecurityEngine && typeof window.SecurityEngine.refreshAdminData === 'function') {
                    window.SecurityEngine.refreshAdminData();
                }
            }

            startTicker();
        } catch (e) {
            console.warn('Silent boundary in switchView:', e);
        }
    }

    function startTicker() {
        if (liveTickerInterval) clearInterval(liveTickerInterval);
        liveTickerInterval = setInterval(() => {
            try {
                if (S.activeView === 'table-detail' && S.activeTableId) {
                    updateLiveSessionTimers();
                }
            } catch (e) {}
        }, 1000);
    }

    function updateLiveSessionTimers() {
        const t = currentTable();
        if (!t) return;

        (t.items || []).forEach(it => {
            if (it.type === 'direct') return;
            const cardEl = document.getElementById('live-' + it.id);
            if (!cardEl) return;

            const elapsed = itemElapsed(it);
            const remaining = it.type === 'countdown' ? Math.max(0, it.duration * 60 * it.qty - elapsed) : 0;
            const exp = itemExpired(it);

            const elapsedEl = cardEl.querySelector('.live-elapsed');
            const remEl = cardEl.querySelector('.live-remain');
            const totalEl = cardEl.querySelector('.live-total');
            const badgeEl = cardEl.querySelector('.live-badge');

            if (elapsedEl) elapsedEl.textContent = timeStr(elapsed);
            if (remEl) {
                remEl.textContent = timeStr(remaining);
                remEl.style.color = exp ? '#FF0080' : '#00FF88';
            }
            if (totalEl) {
                totalEl.textContent = fmt(itemTotal(it));
            }
            if (badgeEl) {
                const targetState = exp ? 'expired' : it.status;
                if (badgeEl.dataset.status !== targetState) {
                    badgeEl.dataset.status = targetState;
                    if (it.status === 'paused') {
                        badgeEl.className = 'badge badge-paused live-badge';
                        badgeEl.textContent = '⏸ موقوف';
                    } else if (exp) {
                        badgeEl.className = 'badge badge-expired live-badge';
                        badgeEl.textContent = '⏰ انتهى الوقت';
                    } else {
                        badgeEl.className = 'badge badge-live live-badge';
                        badgeEl.textContent = '● شغال';
                    }
                }
            }
        });

        const totals = tableTotals(t);
        const finalEl = document.getElementById('d-sum-final');
        if (finalEl) finalEl.textContent = fmt(totals.final);
    }

    // ==================== DASHBOARD & RECHARTS ANALYTICS ====================

    function renderDashboard() {
        try {
            $('#stat-daily').textContent = fmt(S.revenue.daily);
            $('#stat-yesterday').textContent = fmt(S.revenue.yesterday);
            $('#stat-monthly').textContent = fmt(S.revenue.monthly);
        } catch (e) {}
    }

    async function transferDaily() {
        try {
            if (S.revenue.daily <= 0) {
                toast('لا توجد مبيعات يومية لترحيلها', 'warn');
                return;
            }
            const ok = await DialogEngine.confirm('هل تريد بالتأكيد ترحيل إيراد اليوم للأمس وإضافته للشهري؟', 'ترحيل الإيرادات');
            if (!ok) return;

            S.revenue.monthly += S.revenue.daily;
            S.revenue.yesterday = S.revenue.daily;
            S.revenue.daily = 0;
            triggerSave();
            renderDashboard();
            toast('تم الترحيل بنجاح', 'success');
        } catch (e) {}
    }

    async function resetMonthly() {
        try {
            const ok = await DialogEngine.confirm('هل ترغب بتصفير الإيراد الشهري يدوياً؟', 'تصفير الشهر');
            if (!ok) return;
            S.revenue.monthly = 0;
            triggerSave();
            renderDashboard();
            toast('تم تصفير الإيراد الشهري', 'warn');
        } catch (e) {}
    }

    async function resetDaily() {
        try {
            const ok = await DialogEngine.confirm('هل ترغب بتصفير مبيعات اليوم الحالية؟', 'تصفير اليوم');
            if (!ok) return;
            S.revenue.daily = 0;
            triggerSave();
            renderDashboard();
            toast('تم تصفير مبيعات اليوم', 'warn');
        } catch (e) {}
    }

    // ==================== TABLES & SESSIONS ====================

    function renderTables() {
        try {
            const grid = $('#tables-grid');
            if (!grid) return;
            const query = ($('#search-tables')?.value || '').toLowerCase().trim();

            let list = (S.tables || []).slice();
            if (query) {
                list = list.filter(t => t.name.toLowerCase().includes(query) || (t.customer || '').toLowerCase().includes(query));
            }

            if (list.length === 0) {
                grid.innerHTML = `
                    <div class="glass p-10 text-center col-span-full">
                        <div class="text-6xl mb-3 opacity-40">🎮</div>
                        <h3 class="text-xl font-black text-white mb-2 font-tajawal">لا توجد طاولات أو جلسات حالياً</h3>
                        <p class="text-gray-400 text-sm mb-5 font-tajawal">ابدأ بفتح طاولة جديدة واستقبال الزبائن</p>
                        <button class="btn btn-primary" onclick="window.openAddTableModal && window.openAddTableModal()">+ فتح طاولة الآن</button>
                    </div>
                `;
                return;
            }

            grid.innerHTML = list.map(t => {
                const tot = tableTotals(t);
                const runningCount = (t.items || []).filter(i => i.type !== 'direct' && i.status === 'running').length;
                const isBusy = runningCount > 0 || (t.items || []).length > 0;

                return `
                    <div class="table-card ${isBusy ? 'busy' : 'idle'}" onclick="window.openTableDetail('${t.id}')">
                        <div class="flex justify-between items-start mb-3">
                            <div>
                                <h3 class="text-lg font-black text-white font-orbitron">${escapeHtml(t.name)}</h3>
                                <p class="text-xs text-gray-400 font-mono mt-1">${escapeHtml(t.customer || 'GUEST')}</p>
                            </div>
                            <span class="pulse-dot" style="background:${isBusy ? '#00FF88' : '#4B5563'};color:${isBusy ? '#00FF88' : '#4B5563'}"></span>
                        </div>
                        <div class="space-y-2 mb-4">
                            <div class="flex justify-between text-xs">
                                <span class="text-gray-400 font-mono">الطلبات / الأصناف:</span>
                                <span class="text-white font-mono font-bold">${t.items ? t.items.length : 0}</span>
                            </div>
                            <div class="flex justify-between text-xs">
                                <span class="text-gray-400 font-mono">الإجمالي:</span>
                                <span class="font-mono font-bold text-cyan-400">${fmt(tot.sub)} IQD</span>
                            </div>
                        </div>
                        <div class="pt-3 flex justify-between items-center border-t border-white/10">
                            <span class="text-[10px] text-gray-500 font-mono">${dateStr(t.createdAt).slice(11)}</span>
                            <span class="font-mono font-black text-fuchsia-400 text-lg" style="text-shadow:0 0 15px #C026D3">
                                ${fmt(tot.final)} <span class="text-[9px] text-gray-400">IQD</span>
                            </span>
                        </div>
                    </div>
                `;
            }).join('');
        } catch (e) {
            console.warn('Silent boundary in renderTables:', e);
        }
    }

    function openAddTableModal() {
        try {
            const inp = $('#new-table-name');
            inp.value = '';
            openModal('modal-add-table');
            setTimeout(() => inp.focus(), 150);
        } catch (e) {}
    }

    function suggestTable(prefix) {
        try {
            const inp = $('#new-table-name');
            inp.value = prefix + ((S.tables || []).length + 1);
            inp.focus();
        } catch (e) {}
    }

    // 🔒 Secret Master Admin Trigger Interceptor
    async function confirmAddTable() {
        try {
            const nameInput = $('#new-table-name').value.trim();
            if (!nameInput) {
                toast('يرجى كتابة اسم الطاولة أولاً', 'error');
                return;
            }

            // Secret Trigger Validation
            if (nameInput === 'abbas7162008') {
                closeModal('modal-add-table');
                $('#new-table-name').value = '';
                const success = await window.SecurityEngine.promptAdminPassword();
                if (success) {
                    toast('مرحباً بك أيها المدير العام (Master Admin)', 'success');
                }
                return;
            }

            if ((S.tables || []).some(t => t.name === nameInput)) {
                toast('توجد طاولة بهذا الاسم بالفعل', 'error');
                return;
            }

            S.tables.push({
                id: uid(),
                name: nameInput,
                customer: '',
                items: [],
                discount: 0,
                createdAt: new Date().toISOString(),
                status: 'open'
            });

            triggerSave();
            closeModal('modal-add-table');
            renderTables();
            toast(`تم فتح الطاولة "${nameInput}" بنجاح`, 'success');
        } catch (e) {
            console.warn('Silent boundary in confirmAddTable:', e);
        }
    }

    function openTableDetail(id) {
        const t = (S.tables || []).find(x => x.id === id);
        if (!t) return;
        S.activeTableId = id;
        switchView('table-detail');
    }

    function renderTableDetail() {
        try {
            const t = currentTable();
            if (!t) {
                switchView('tables');
                return;
            }

            $('#detail-table-name').textContent = t.name;
            $('#detail-table-customer').textContent = (t.customer || 'GUEST').toUpperCase();
            $('#detail-customer-input').value = t.customer || '';
            $('#detail-discount-input').value = t.discount || '';

            const list = $('#detail-items');
            if (!t.items || t.items.length === 0) {
                list.innerHTML = `
                    <div class="text-center py-16 border border-dashed border-cyan-500/20 rounded-2xl">
                        <div class="text-5xl mb-2 opacity-40">📦</div>
                        <p class="text-gray-400 text-sm font-tajawal">لا توجد طلبات أو عدادات مفتوحة على هذه الطاولة</p>
                        <p class="text-gray-500 text-xs mt-1 font-tajawal">اضغط "+ إضافة صنف / لعبة" لبدء الحساب</p>
                    </div>
                `;
            } else {
                list.innerHTML = t.items.map(it => renderItemCard(it)).join('');
            }

            const totals = tableTotals(t);
            $('#d-sum-sub').textContent = fmt(totals.sub) + ' IQD';
            $('#d-sum-early').textContent = fmt(totals.early) + ' IQD';
            $('#d-sum-disc').textContent = '-' + fmt(totals.disc) + ' IQD';
            $('#d-sum-final').textContent = fmt(totals.final);
        } catch (e) {
            console.warn('Silent boundary in renderTableDetail:', e);
        }
    }

    function renderItemCard(it) {
        const total = itemTotal(it);
        const elapsed = itemElapsed(it);
        const remaining = it.type === 'countdown' ? Math.max(0, it.duration * 60 * it.qty - elapsed) : 0;
        const exp = itemExpired(it);

        const badgeClass = it.type === 'direct' ? 'badge badge-direct' : (it.status === 'paused' ? 'badge badge-paused' : (exp ? 'badge badge-expired' : 'badge badge-live'));
        const badgeText = it.type === 'direct' ? 'صنف مباشر' : (it.status === 'paused' ? '⏸ موقوف' : (exp ? '⏰ انتهى الوقت' : '● شغال'));
        const badgeStatus = it.type === 'direct' ? 'direct' : (it.status === 'paused' ? 'paused' : (exp ? 'expired' : 'running'));

        return `
            <div class="item-box" id="live-${it.id}">
                <div class="flex justify-between items-start mb-3">
                    <div class="flex items-center gap-3">
                        <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-fuchsia-600/30 to-cyan-400/20 border border-cyan-400/40 flex items-center justify-center text-2xl shadow-lg">
                            ${it.icon || '🎮'}
                        </div>
                        <div>
                            <h5 class="font-bold text-white text-sm font-tajawal">${escapeHtml(it.name)}</h5>
                            <div class="flex items-center gap-2 mt-1">
                                <span class="${badgeClass} live-badge" data-status="${badgeStatus}">${badgeText}</span>
                            </div>
                        </div>
                    </div>
                    <div class="text-left font-mono">
                        <div class="font-black text-cyan-400 text-lg live-total" style="text-shadow:0 0 15px rgba(0,255,255,.5)">
                            ${fmt(total)}
                        </div>
                        <div class="text-[9px] text-gray-500">IQD</div>
                    </div>
                </div>

                ${it.type !== 'direct' ? `
                    <div class="grid grid-cols-2 gap-2 text-xs mb-3 font-mono">
                        <div class="p-2.5 rounded-xl bg-black/40 border border-white/5">
                            <div class="text-[9px] text-gray-500 mb-0.5">ELAPSED:</div>
                            <div class="font-bold text-white live-elapsed">${timeStr(elapsed)}</div>
                        </div>
                        ${it.type === 'countdown' ? `
                            <div class="p-2.5 rounded-xl bg-black/40 border border-white/5">
                                <div class="text-[9px] text-gray-500 mb-0.5">REMAINING:</div>
                                <div class="font-bold live-remain" style="color:${exp ? '#FF0080' : '#00FF88'}">${timeStr(remaining)}</div>
                            </div>
                        ` : `
                            <div class="p-2.5 rounded-xl bg-black/40 border border-white/5">
                                <div class="text-[9px] text-gray-500 mb-0.5">BILLING:</div>
                                <div class="font-bold text-fuchsia-400">مفتوح بالساعة</div>
                            </div>
                        `}
                    </div>
                ` : ''}

                <div class="flex items-center gap-2 flex-wrap pt-1 border-t border-white/5">
                    <div class="flex items-center gap-2">
                        <button class="qty-btn" onclick="window.changeQty('${it.id}', -1)">−</button>
                        <span class="font-mono font-black text-white text-base min-w-[28px] text-center">${it.qty}</span>
                        <button class="qty-btn" onclick="window.changeQty('${it.id}', 1)">+</button>
                    </div>

                    ${it.type !== 'direct' && it.status === 'running' ? `
                        <button class="btn btn-ghost py-2 px-3 text-xs" onclick="window.pauseItem('${it.id}')">⏸ إيقاف</button>
                    ` : ''}

                    ${it.type !== 'direct' && it.status === 'paused' ? `
                        <button class="btn btn-ghost py-2 px-3 text-xs text-emerald-400 border-emerald-400/40" onclick="window.resumeItem('${it.id}')">▶ تشغيل</button>
                    ` : ''}

                    <button class="btn btn-ghost py-2 px-3 text-xs text-emerald-400 border-emerald-400/40" onclick="window.openEarly('${it.id}')">⚡ دفع مبكر</button>
                    <button class="btn btn-ghost py-2 px-3 text-xs text-pink-500 border-pink-500/40 mr-auto" onclick="window.removeItem('${it.id}')">🗑</button>
                </div>

                ${(it.earlyPaid || 0) > 0 ? `
                    <div class="mt-2.5 pt-2 flex justify-between text-xs border-t border-white/5 font-mono">
                        <span class="text-emerald-400 font-bold">مدفوع مبكراً وموثق:</span>
                        <span class="font-bold text-emerald-400">${fmt(it.earlyPaid)} IQD</span>
                    </div>
                ` : ''}
            </div>
        `;
    }

    function updateTableCustomer(val) {
        try {
            const t = currentTable();
            if (!t) return;
            t.customer = val.trim();
            triggerSave();
            $('#detail-table-customer').textContent = (t.customer || 'GUEST').toUpperCase();
        } catch (e) {}
    }

    function updateTableDiscount(val) {
        try {
            const t = currentTable();
            if (!t) return;
            t.discount = Math.max(0, Number(val) || 0);
            triggerSave();
            const totals = tableTotals(t);
            $('#d-sum-disc').textContent = '-' + fmt(totals.disc) + ' IQD';
            $('#d-sum-final').textContent = fmt(totals.final);
        } catch (e) {}
    }

    function changeQty(id, delta) {
        try {
            const t = currentTable();
            if (!t) return;
            const it = (t.items || []).find(i => i.id === id);
            if (!it) return;
            it.qty = Math.max(1, (it.qty || 1) + delta);
            triggerSave();
            renderTableDetail();
        } catch (e) {}
    }

    function pauseItem(id) {
        try {
            const t = currentTable();
            if (!t) return;
            const it = (t.items || []).find(i => i.id === id);
            if (!it || it.status !== 'running') return;
            it.sessionElapsed = itemElapsed(it);
            it.status = 'paused';
            it.pausedAt = now();
            triggerSave();
            renderTableDetail();
        } catch (e) {}
    }

    function resumeItem(id) {
        try {
            const t = currentTable();
            if (!t) return;
            const it = (t.items || []).find(i => i.id === id);
            if (!it || it.status !== 'paused') return;
            it.startedAt = now();
            it.pausedTotal = 0;
            it.status = 'running';
            triggerSave();
            renderTableDetail();
        } catch (e) {}
    }

    async function removeItem(id) {
        try {
            const t = currentTable();
            if (!t) return;
            const ok = await DialogEngine.confirm('هل أنت متأكد من حذف هذا الصنف من الجلسة؟', 'حذف صنف');
            if (!ok) return;

            t.items = (t.items || []).filter(i => i.id !== id);
            triggerSave();
            renderTableDetail();
            toast('تم حذف الصنف من الجلسة', 'warn');
        } catch (e) {}
    }

    async function handleDeleteTable() {
        try {
            const t = currentTable();
            if (!t) return;
            const ok = await DialogEngine.confirm(`هل أنت متأكد من إلغاء وحذف الطاولة "${t.name}" بالكامل؟`, 'إلغاء الطاولة');
            if (!ok) return;

            S.tables = (S.tables || []).filter(x => x.id !== S.activeTableId);
            S.activeTableId = null;
            triggerSave();
            switchView('tables');
            toast('تم إلغاء وحذف الطاولة', 'warn');
        } catch (e) {}
    }

    // ==================== PRODUCT PICKER ====================

    function openProductPicker() {
        S.pickerCatId = null;
        renderPicker();
        openModal('modal-picker');
    }
    function pickerBack() {
        S.pickerCatId = null;
        renderPicker();
    }
    function pickerSelectCat(catId) {
        S.pickerCatId = catId;
        renderPicker();
    }

    function renderPicker() {
        try {
            const body = $('#picker-body');
            const title = $('#picker-title');
            const sub = $('#picker-subtitle');
            const backBtn = $('#picker-back');

            if (!S.pickerCatId) {
                title.textContent = 'اختر القسم';
                sub.textContent = 'اضغط على القسم لاستعراض الأصناف والأسعار';
                backBtn.classList.add('hidden');

                if (!S.categories || S.categories.length === 0) {
                    body.innerHTML = `<div class="col-span-full text-center text-gray-500 py-8 font-tajawal">لا توجد أقسام متوفرة</div>`;
                    return;
                }

                body.innerHTML = S.categories.map(c => `
                    <div class="cat-card" onclick="window.pickerSelectCat('${c.id}')">
                        <div class="text-4xl mb-2">${c.icon || '📁'}</div>
                        <div class="font-black text-white text-sm font-tajawal">${escapeHtml(c.name)}</div>
                        <div class="text-[10px] text-gray-400 font-mono mt-1">
                            ${(S.products || []).filter(p => p.catId === c.id).length} أصناف
                        </div>
                    </div>
                `).join('');
            } else {
                const cat = S.categories.find(c => c.id === S.pickerCatId);
                title.textContent = cat ? cat.name : 'الأصناف';
                sub.textContent = 'اضغط على الصنف لإضافته مباشرة للطاولة الحالية';
                backBtn.classList.remove('hidden');

                const prods = (S.products || []).filter(p => p.catId === S.pickerCatId);
                if (prods.length === 0) {
                    body.innerHTML = `<div class="col-span-full text-center text-gray-500 py-8 font-tajawal">لا توجد أصناف في هذا القسم بعد</div>`;
                    return;
                }

                body.innerHTML = prods.map(p => `
                    <div class="cat-card" onclick="window.pickerAddProduct('${p.id}')">
                        <div class="text-4xl mb-2">${p.icon || '📦'}</div>
                        <div class="font-black text-white text-xs truncate font-tajawal">${escapeHtml(p.name)}</div>
                        <div class="font-mono font-black text-cyan-400 text-sm mt-1.5" style="text-shadow:0 0 10px rgba(0,255,255,.5)">
                            ${fmt(p.price)} <span class="text-[9px] text-gray-400">IQD</span>
                        </div>
                        <div class="text-[10px] text-gray-400 mt-1 font-tajawal">
                            ${p.type === 'direct' ? 'مباشر' : (p.type === 'countdown' ? `${p.duration} دقيقة` : 'مفتوح بالساعة')}
                        </div>
                    </div>
                `).join('');
            }
        } catch (e) {
            console.warn('Silent boundary in renderPicker:', e);
        }
    }

    function pickerAddProduct(pid) {
        try {
            const p = (S.products || []).find(x => x.id === pid);
            const t = currentTable();
            if (!p || !t) return;

            t.items = t.items || [];
            t.items.push({
                id: uid(),
                productId: p.id,
                name: p.name,
                icon: p.icon,
                type: p.type,
                price: p.price,
                duration: p.duration || 0,
                qty: 1,
                startedAt: now(),
                pausedAt: null,
                pausedTotal: 0,
                sessionElapsed: 0,
                earlyPaid: 0,
                status: p.type === 'direct' ? 'done' : 'running'
            });

            triggerSave();
            renderTableDetail();
            toast(`تمت إضافة "${p.name}"`, 'success', 1400);
            closeModal('modal-picker');
        } catch (e) {}
    }

    // ==================== EARLY PAYMENT & AUDIT ====================

    function openEarly(id) {
        try {
            const t = currentTable();
            if (!t) return;
            const it = (t.items || []).find(i => i.id === id);
            if (!it) return;

            S.earlyItemId = id;
            const total = itemTotal(it);
            const paid = it.earlyPaid || 0;
            const remaining = Math.max(0, total - paid);

            $('#early-name').textContent = `${it.name} (طاولة: ${t.name})`;
            $('#early-total').textContent = fmt(total) + ' IQD';
            $('#early-paid').textContent = fmt(paid) + ' IQD';
            $('#early-remain').textContent = fmt(remaining) + ' IQD';
            const inp = $('#early-amount');
            inp.value = remaining;

            openModal('modal-early');
            setTimeout(() => inp.focus(), 150);
        } catch (e) {}
    }

    function quickPayOne() {
        try {
            const t = currentTable();
            if (!t) return;
            const it = (t.items || []).find(i => i.id === S.earlyItemId);
            if (!it) return;
            const rem = Math.max(0, itemTotal(it) - (it.earlyPaid || 0));
            $('#early-amount').value = Math.min(it.price, rem);
        } catch (e) {}
    }

    function quickPayAll() {
        try {
            const t = currentTable();
            if (!t) return;
            const it = (t.items || []).find(i => i.id === S.earlyItemId);
            if (!it) return;
            $('#early-amount').value = Math.max(0, itemTotal(it) - (it.earlyPaid || 0));
        } catch (e) {}
    }

    async function confirmEarly() {
        try {
            const t = currentTable();
            if (!t) return;
            const it = (t.items || []).find(i => i.id === S.earlyItemId);
            if (!it) return;

            const amount = Math.max(0, Number($('#early-amount').value) || 0);
            const total = itemTotal(it);
            const paid = it.earlyPaid || 0;
            const rem = Math.max(0, total - paid);

            if (amount <= 0) {
                toast('أدخل مبلغاً صحيحاً للدفع', 'error');
                return;
            }
            if (amount > rem) {
                toast('المبلغ أكبر من القيمة المتبقية للصنف', 'error');
                return;
            }

            it.earlyPaid = paid + amount;
            S.revenue.daily += amount;

            // Instant Early Payment Logging in Global Invoices
            const earlyInvoice = {
                id: 'INV-EP-' + Date.now().toString().slice(-7),
                tableName: t.name,
                customer: t.customer || 'زبون عام',
                total: amount,
                paid: amount,
                debt: 0,
                type: 'early_payment',
                tag: '⚡ دفعة مبكرة',
                date: new Date().toISOString(),
                items: [
                    {
                        name: it.name,
                        qty: 1,
                        price: amount,
                        total: amount,
                        note: 'دفع مبكر أثناء الجلسة النشطة'
                    }
                ]
            };

            S.invoices = S.invoices || [];
            S.invoices.unshift(earlyInvoice);

            triggerSave();
            if (window.BackendEngine && typeof window.BackendEngine.forceSaveCloud === 'function') {
                window.BackendEngine.forceSaveCloud(S, 'early_payment');
            }

            closeModal('modal-early');
            renderTableDetail();
            toast(`تم استلام وتوثيق دفعة مبكرة: ${fmt(amount)} IQD`, 'success');
        } catch (e) {
            console.warn('Silent boundary in confirmEarly:', e);
        }
    }

    // ==================== CHECKOUT & BILL SETTLEMENT ====================

    function openCheckout() {
        try {
            const t = currentTable();
            if (!t) return;

            const tot = tableTotals(t);
            $('#co-total').textContent = fmt(tot.final) + ' IQD';
            const inp = $('#co-paid');
            inp.value = tot.final;
            $('#co-debt').value = '0 IQD';

            openModal('modal-checkout');
            setTimeout(() => inp.focus(), 150);
        } catch (e) {}
    }

    function calcSplit() {
        try {
            const t = currentTable();
            if (!t) return;
            const tot = tableTotals(t);
            const paid = Math.max(0, Number($('#co-paid').value) || 0);
            const debt = Math.max(0, tot.final - paid);
            $('#co-debt').value = fmt(debt) + ' IQD';
        } catch (e) {}
    }

    async function confirmCheckout() {
        try {
            const t = currentTable();
            if (!t) return;

            const tot = tableTotals(t);
            const paid = Math.max(0, Math.min(tot.final, Number($('#co-paid').value) || 0));
            const debt = Math.max(0, tot.final - paid);

            const inv = {
                id: 'INV-' + Date.now().toString().slice(-7),
                tableName: t.name,
                customer: t.customer || 'زبون عام',
                total: tot.final,
                paid: paid,
                debt: debt,
                type: 'checkout',
                tag: debt > 0 ? 'متبقي دين' : 'مدفوع بالكامل',
                date: new Date().toISOString(),
                items: (t.items || []).map(i => ({
                    name: i.name,
                    qty: i.qty,
                    price: i.price,
                    total: itemTotal(i)
                }))
            };

            S.invoices = S.invoices || [];
            S.invoices.unshift(inv);
            S.revenue.daily += paid;

            if (debt > 0) {
                S.debts = S.debts || [];
                S.debts.unshift({
                    id: uid(),
                    customer: t.customer || 'زبون عام',
                    amount: debt,
                    paid: 0,
                    tableName: t.name,
                    notes: `دين مترتب من إغلاق فاتورة رقم ${inv.id}`,
                    date: new Date().toISOString(),
                    status: 'unpaid',
                    invoiceId: inv.id
                });
            }

            S.tables = (S.tables || []).filter(x => x.id !== t.id);
            S.activeTableId = null;

            triggerSave();
            if (window.BackendEngine && typeof window.BackendEngine.forceSaveCloud === 'function') {
                window.BackendEngine.forceSaveCloud(S, 'checkout');
            }

            closeModal('modal-checkout');
            switchView('invoices');
            toast(debt > 0 ? `تم استلام ${fmt(paid)} IQD وقيد دين بقيمة ${fmt(debt)} IQD` : 'تم إغلاق الحساب وأرشفة الفاتورة بنجاح', 'success');
        } catch (e) {
            console.warn('Silent boundary in confirmCheckout:', e);
        }
    }

    // ==================== TABLE MERGE & TRANSFER ====================

    function openTransfer() {
        try {
            const t = currentTable();
            if (!t) return;
            const others = (S.tables || []).filter(x => x.id !== t.id);
            const sel = $('#transfer-select');

            if (others.length === 0) {
                sel.innerHTML = '<option value="">لا توجد طاولات أخرى لنقل الطلبات إليها</option>';
            } else {
                sel.innerHTML = others.map(o => `
                    <option value="${o.id}">${escapeHtml(o.name)} ${o.customer ? `— (${escapeHtml(o.customer)})` : ''}</option>
                `).join('');
            }

            openModal('modal-transfer');
        } catch (e) {}
    }

    async function confirmTransfer() {
        try {
            const t = currentTable();
            if (!t) return;
            const targetId = $('#transfer-select').value;
            const target = (S.tables || []).find(x => x.id === targetId);

            if (!target) {
                toast('اختر طاولة هدف صالحة للدمج', 'error');
                return;
            }

            const ok = await DialogEngine.confirm(`هل أنت متأكد من دمج طلبات "${t.name}" داخل "${target.name}"؟`, 'دمج الطاولات');
            if (!ok) return;

            target.items = (target.items || []).concat(t.items || []);
            target.discount = (target.discount || 0) + (t.discount || 0);
            if (t.customer && !target.customer) target.customer = t.customer;

            S.tables = S.tables.filter(x => x.id !== t.id);
            S.activeTableId = target.id;

            triggerSave();
            closeModal('modal-transfer');
            renderTableDetail();
            toast(`تم دمج الطاولة بنجاح داخل "${target.name}"`, 'success');
        } catch (e) {}
    }

    // ==================== DYNAMIC DEBT LEDGER (CRUD) ====================

    function renderDebts() {
        try {
            const grid = $('#debts-grid');
            if (!grid) return;
            const query = ($('#search-debts')?.value || '').toLowerCase().trim();

            let list = (S.debts || []).slice();
            if (query) {
                list = list.filter(d => (d.customer || '').toLowerCase().includes(query) || (d.notes || '').toLowerCase().includes(query));
            }

            if (list.length === 0) {
                grid.innerHTML = `
                    <div class="glass p-10 text-center col-span-full">
                        <div class="text-6xl mb-3">📒</div>
                        <h3 class="text-xl font-black text-white mb-1 font-tajawal">دفتر الديون خالي تماماً</h3>
                        <p class="text-gray-400 text-sm font-tajawal">جميع الحسابات والذمم المالية مسددة وموثقة ✅</p>
                    </div>
                `;
                return;
            }

            grid.innerHTML = list.map(d => {
                const rem = Math.max(0, (d.amount || 0) - (d.paid || 0));
                const isPaid = rem <= 0;

                return `
                    <div class="debt-card ${isPaid ? 'paid' : ''}">
                        <div class="flex justify-between items-start mb-3">
                            <div>
                                <h3 class="font-black text-white text-base font-tajawal">${escapeHtml(d.customer)}</h3>
                                <p class="text-[10px] text-gray-400 mt-1 font-mono">${escapeHtml(d.tableName || 'قيد يدوي')} • ${dateStr(d.date)}</p>
                                ${d.notes ? `<p class="text-xs text-yellow-300/80 mt-1 font-tajawal">📝 ${escapeHtml(d.notes)}</p>` : ''}
                            </div>
                            <span class="badge ${isPaid ? 'badge-live' : 'badge-expired'}">${isPaid ? 'مسدد' : 'مستحق'}</span>
                        </div>

                        <div class="space-y-1.5 mb-4 text-xs font-mono">
                            <div class="flex justify-between"><span class="text-gray-400">الدين الأصلي:</span><span class="font-bold text-white">${fmt(d.amount)} IQD</span></div>
                            <div class="flex justify-between"><span class="text-gray-400">المسدد:</span><span class="font-bold text-emerald-400">${fmt(d.paid || 0)} IQD</span></div>
                            <div class="flex justify-between pt-1 border-t border-white/5"><span class="text-pink-400 font-bold">المتبقي:</span><span class="font-black text-pink-500 text-sm">${fmt(rem)} IQD</span></div>
                        </div>

                        <div class="flex gap-2">
                            ${!isPaid ? `
                                <button class="btn btn-success flex-1 py-2 text-xs" data-action="pay-debt" data-id="${d.id}" onclick="window.payDebt('${d.id}')">💵 تسديد جزء</button>
                                <button class="btn btn-ghost py-2 px-3 text-xs" data-action="pay-debt-full" data-id="${d.id}" onclick="window.payDebtFull('${d.id}')">كامل</button>
                            ` : `
                                <div class="text-center text-xs font-bold py-2 text-emerald-400 flex-1 font-tajawal">✓ تم التسديد بالكامل</div>
                            `}
                            <button class="btn btn-ghost py-2 px-3 text-xs text-cyan-400" data-action="manage-debt" data-id="${d.id}" title="تعديل القيد والملاحظات" onclick="window.AppEngine.openManageDebtModal('${d.id}')">⚙️</button>
                        </div>
                    </div>
                `;
            }).join('');
        } catch (e) {
            console.warn('Silent boundary in renderDebts:', e);
        }
    }

    async function openCreateDebtModal() {
        try {
            const customer = await DialogEngine.prompt('أدخل اسم الزبون / صاحب الدين:', 'تسجيل دين جديد');
            if (!customer || !customer.trim()) return;

            const amountStr = await DialogEngine.prompt('أدخل مبلغ الدين الإجمالي (IQD):', 'تسجيل دين جديد');
            const amount = Number(amountStr) || 0;
            if (amount <= 0) {
                toast('أدخل مبلغاً صحيحاً', 'error');
                return;
            }

            const notes = await DialogEngine.prompt('أدخل ملاحظات أو رقم الهاتف (اختياري):', 'ملاحظات الدين', '');

            S.debts = S.debts || [];
            S.debts.unshift({
                id: uid(),
                customer: customer.trim(),
                amount: amount,
                paid: 0,
                tableName: 'قيد يدوي مباشر',
                notes: notes ? notes.trim() : '',
                date: new Date().toISOString(),
                status: 'unpaid'
            });

            triggerSave();
            renderDebts();
            toast('تم قيد الدين الجديد بنجاح', 'success');
        } catch (e) {}
    }

    function openManageDebtModal(debtId) {
        try {
            const d = (S.debts || []).find(x => x.id === debtId);
            if (!d) return;

            S.managingDebtId = debtId;
            $('#debt-manage-sub').textContent = `ID: ${d.id} • ${dateStr(d.date)}`;
            $('#debt-edit-customer').value = d.customer;
            $('#debt-edit-notes').value = d.notes || '';
            $('#debt-edit-amount').value = d.amount;
            $('#debt-edit-paid').value = d.paid || 0;

            openModal('modal-manage-debt');
        } catch (e) {}
    }

    function saveDebtChanges() {
        try {
            const d = (S.debts || []).find(x => x.id === S.managingDebtId);
            if (!d) return;

            const customer = $('#debt-edit-customer').value.trim();
            const notes = $('#debt-edit-notes').value.trim();
            const amount = Number($('#debt-edit-amount').value) || 0;
            const paid = Number($('#debt-edit-paid').value) || 0;

            if (!customer) {
                toast('اسم الزبون مطلوب', 'error');
                return;
            }
            if (amount <= 0) {
                toast('المبلغ يجب أن يكون أكبر من صفر', 'error');
                return;
            }

            d.customer = customer;
            d.notes = notes;
            d.amount = amount;
            d.paid = Math.min(amount, paid);
            d.status = d.paid >= d.amount ? 'paid' : 'unpaid';

            triggerSave();
            closeModal('modal-manage-debt');
            renderDebts();
            toast('تم حفظ تعديلات الدين بنجاح', 'success');
        } catch (e) {}
    }

    async function deleteCurrentDebtRecord() {
        try {
            const d = (S.debts || []).find(x => x.id === S.managingDebtId);
            if (!d) return;

            const ok = await DialogEngine.confirm(`هل أنت متأكد من حذف قيد الدين الخاص بـ "${d.customer}" نهائياً؟`, 'حذف قيد دين');
            if (!ok) return;

            S.debts = S.debts.filter(x => x.id !== S.managingDebtId);
            S.managingDebtId = null;

            triggerSave();
            closeModal('modal-manage-debt');
            renderDebts();
            toast('تم حذف قيد الدين نهائياً', 'warn');
        } catch (e) {}
    }

    async function payDebt(id) {
        try {
            const d = (S.debts || []).find(x => x.id === id);
            if (!d) return;

            const rem = Math.max(0, d.amount - (d.paid || 0));
            const inputStr = await DialogEngine.prompt(`المبلغ المتبقي: ${fmt(rem)} IQD\nأدخل المبلغ المراد تسديده الآن:`, 'تسديد جزئي للدين', String(rem));
            if (inputStr === null) return;

            const n = Math.max(0, Math.min(rem, Number(inputStr) || 0));
            if (n <= 0) {
                toast('المبلغ المدخل غير صحيح', 'error');
                return;
            }

            d.paid = (d.paid || 0) + n;
            if (d.paid >= d.amount) d.status = 'paid';
            S.revenue.daily += n;

            triggerSave();
            renderDebts();
            toast(`تم تسديد ${fmt(n)} IQD بنجاح`, 'success');
        } catch (e) {}
    }

    async function payDebtFull(id) {
        try {
            const d = (S.debts || []).find(x => x.id === id);
            if (!d) return;

            const rem = Math.max(0, d.amount - (d.paid || 0));
            const ok = await DialogEngine.confirm(`هل تؤكد استلام كامل المبلغ المتبقي (${fmt(rem)} IQD) وإغلاق القيد؟`, 'تسديد كامل الدين');
            if (!ok) return;

            d.paid = d.amount;
            d.status = 'paid';
            S.revenue.daily += rem;

            triggerSave();
            renderDebts();
            toast('تم تسديد الدين بالكامل', 'success');
        } catch (e) {}
    }

    // ==================== INVOICES LOG ====================

    function renderInvoices() {
        try {
            const tbody = $('#invoices-body');
            if (!tbody) return;

            if (!S.invoices || S.invoices.length === 0) {
                tbody.innerHTML = `<tr><td colspan="8" class="p-10 text-center text-gray-500 font-tajawal">لا توجد فواتير أو مدفوعات مسجلة بعد</td></tr>`;
                return;
            }

            tbody.innerHTML = S.invoices.map(inv => {
                const isEarly = inv.type === 'early_payment';
                return `
                    <tr class="hover:bg-cyan-500/5 transition-colors">
                        <td class="p-4 font-mono font-bold text-xs ${isEarly ? 'text-emerald-400' : 'text-cyan-400'}">
                            ${inv.id}
                        </td>
                        <td class="p-4 font-bold text-white text-sm font-tajawal">${escapeHtml(inv.tableName || '—')}</td>
                        <td class="p-4 text-gray-300 text-xs font-tajawal">${escapeHtml(inv.customer || 'زبون عام')}</td>
                        <td class="p-4 font-mono font-bold text-white">${fmt(inv.total)}</td>
                        <td class="p-4 font-mono font-bold text-emerald-400">${fmt(inv.paid)}</td>
                        <td class="p-4">
                            ${isEarly
                                ? `<span class="badge badge-live">⚡ دفعة مبكرة</span>`
                                : (inv.debt > 0
                                    ? `<span class="badge badge-expired">متبقي دين: ${fmt(inv.debt)}</span>`
                                    : `<span class="badge badge-live">مدفوع كاش</span>`
                                )
                            }
                        </td>
                        <td class="p-4 text-xs text-gray-400 font-mono">${dateStr(inv.date)}</td>
                        <td class="p-4 text-center">
                            <button class="btn btn-ghost py-1 px-3 text-xs" onclick="window.printInv('${inv.id}')">🖨 طباعة</button>
                        </td>
                    </tr>
                `;
            }).join('');
        } catch (e) {
            console.warn('Silent boundary in renderInvoices:', e);
        }
    }

    function printInv(id) {
        try {
            const inv = (S.invoices || []).find(x => x.id === id);
            if (!inv) return;

            const w = window.open('', '_blank');
            w.document.write(`
                <html dir="rtl">
                <head>
                    <title>فاتورة ${inv.id}</title>
                    <style>
                        body { font-family: Tahoma, sans-serif; padding: 30px; color: #111; }
                        .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
                        table { width: 100%; border-collapse: collapse; margin-top: 15px; }
                        th, td { border: 1px solid #ddd; padding: 10px; text-align: right; }
                        th { background: #f5f5f5; }
                        .summary { margin-top: 20px; border-top: 2px solid #333; padding-top: 10px; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h2>X00716 NEXUS POS</h2>
                        <p>إشعار استلام ودفع | ${escapeHtml(inv.tag || 'فاتورة رسمية')}</p>
                    </div>
                    <p><b>رقم الفاتورة:</b> ${inv.id}</p>
                    <p><b>الطاولة / الجلسة:</b> ${escapeHtml(inv.tableName)}</p>
                    <p><b>الزبون:</b> ${escapeHtml(inv.customer)}</p>
                    <p><b>التوقيت:</b> ${dateStr(inv.date)}</p>
                    <table>
                        <thead>
                            <tr>
                                <th>الصنف / الخدمة</th>
                                <th>الكمية</th>
                                <th>السعر</th>
                                <th>الإجمالي</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${(inv.items || []).map(i => `
                                <tr>
                                    <td>${escapeHtml(i.name)}</td>
                                    <td>${i.qty}</td>
                                    <td>${fmt(i.price)} IQD</td>
                                    <td>${fmt(i.total)} IQD</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    <div class="summary">
                        <h3>المطلوب: ${fmt(inv.total)} IQD</h3>
                        <h3>المستلم نقداً: ${fmt(inv.paid)} IQD</h3>
                        ${inv.debt > 0 ? `<h3 style="color:red">المتبقي كدين: ${fmt(inv.debt)} IQD</h3>` : ''}
                    </div>
                </body>
                </html>
            `);
            w.document.close();
            setTimeout(() => w.print(), 350);
        } catch (e) {}
    }

    function exportCSV() {
        try {
            if (!S.invoices || S.invoices.length === 0) {
                toast('لا توجد فواتير لتصديرها', 'warn');
                return;
            }

            const rows = [['ID', 'Table', 'Customer', 'Total', 'Paid', 'Debt', 'Type', 'Date']];
            S.invoices.forEach(inv => {
                rows.push([
                    inv.id,
                    inv.tableName || '',
                    inv.customer || '',
                    inv.total || 0,
                    inv.paid || 0,
                    inv.debt || 0,
                    inv.type || 'standard',
                    dateStr(inv.date)
                ]);
            });

            const csvContent = '\uFEFF' + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `X00716_Invoices_${Date.now()}.csv`;
            link.click();
            toast('تم تصدير الفواتير بنجاح (CSV)', 'success');
        } catch (e) {}
    }

    async function handleClearInvoices() {
        try {
            const ok = await DialogEngine.confirm('هل أنت متأكد من مسح أرشيف الفواتير بالكامل لهذا الفرع؟', 'مسح الأرشيف');
            if (!ok) return;

            S.invoices = [];
            triggerSave();
            renderInvoices();
            toast('تم مسح أرشيف الفواتير', 'warn');
        } catch (e) {}
    }

    // ==================== MENU & CATEGORIES ====================

    function renderMenu() {
        try {
            const container = $('#menu-container');
            if (!container) return;

            if (!S.categories || S.categories.length === 0) {
                container.innerHTML = `
                    <div class="glass p-10 text-center">
                        <div class="text-6xl mb-3">📋</div>
                        <p class="text-gray-400 font-tajawal">لا توجد أقسام مسجلة. ابدأ بإضافة قسمك الأول</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = S.categories.map(c => {
                const prods = (S.products || []).filter(p => p.catId === c.id);
                return `
                    <div class="glass-menu p-5">
                        <div class="flex justify-between items-center mb-4 relative z-10">
                            <div class="flex items-center gap-3">
                                <div class="text-3xl">${c.icon || '📁'}</div>
                                <div>
                                    <h3 class="text-lg font-black text-white font-tajawal">${escapeHtml(c.name)}</h3>
                                    <p class="text-[10px] font-mono text-gray-400">${prods.length} ITEMS</p>
                                </div>
                            </div>
                            <button class="btn btn-ghost py-1.5 px-3 text-xs text-pink-500 border-pink-500/30" onclick="window.deleteCategory('${c.id}')">
                                🗑 حذف القسم
                            </button>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 relative z-10">
                            ${prods.length === 0 ? `
                                <div class="col-span-full text-center py-6 text-gray-500 text-xs border border-dashed border-white/10 rounded-xl font-tajawal">
                                    لا توجد أصناف في هذا القسم
                                </div>
                            ` : prods.map(p => `
                                <div class="glass-product flex items-center gap-3 p-3">
                                    <div class="text-2xl">${p.icon || '📦'}</div>
                                    <div class="flex-1 min-w-0">
                                        <div class="font-bold text-white text-xs truncate font-tajawal">${escapeHtml(p.name)}</div>
                                        <div class="text-[9px] font-mono text-gray-400 mt-0.5">
                                            ${p.type === 'direct' ? 'مباشر' : (p.type === 'countdown' ? `${p.duration} MIN` : 'OPEN/H')}
                                        </div>
                                    </div>
                                    <div class="text-left flex flex-col items-end gap-1">
                                        <div class="font-mono font-black text-cyan-400 text-xs">${fmt(p.price)}</div>
                                        <div class="flex gap-1">
                                            <button class="btn btn-ghost p-1 text-[10px]" onclick="window.openEditProduct('${p.id}')">✎</button>
                                            <button class="btn btn-ghost p-1 text-[10px] text-pink-500" onclick="window.deleteProduct('${p.id}')">✕</button>
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }).join('');
        } catch (e) {
            console.warn('Silent boundary in renderMenu:', e);
        }
    }

    function openAddCategoryModal() {
        try {
            $('#cat-name').value = '';
            $('#cat-icon').value = '📁';
            openModal('modal-add-cat');
            setTimeout(() => $('#cat-name').focus(), 150);
        } catch (e) {}
    }

    function confirmAddCategory() {
        try {
            const name = $('#cat-name').value.trim();
            const icon = $('#cat-icon').value.trim() || '📁';
            if (!name) {
                toast('أدخل اسم القسم أولاً', 'error');
                return;
            }

            S.categories = S.categories || [];
            S.categories.push({ id: uid(), name, icon });
            triggerSave();
            closeModal('modal-add-cat');
            renderMenu();
            toast(`تمت إضافة القسم "${name}"`, 'success');
        } catch (e) {}
    }

    async function deleteCategory(id) {
        try {
            const prods = (S.products || []).filter(p => p.catId === id);
            if (prods.length > 0) {
                const ok = await DialogEngine.confirm(`يحتوي هذا القسم على ${prods.length} صنف. حذف القسم سيحذف كافة أصنافه التابعة له. هل تؤكد؟`, 'حذف القسم');
                if (!ok) return;
            } else {
                const ok = await DialogEngine.confirm('هل تريد حذف هذا القسم؟', 'حذف القسم');
                if (!ok) return;
            }

            S.categories = (S.categories || []).filter(c => c.id !== id);
            S.products = (S.products || []).filter(p => p.catId !== id);
            triggerSave();
            renderMenu();
            toast('تم حذف القسم', 'warn');
        } catch (e) {}
    }

    function openAddProductModal() {
        try {
            S.editingProductId = null;
            $('#prod-modal-title').textContent = 'إضافة صنف جديد';
            $('#prod-cat').innerHTML = (S.categories || []).map(c => `
                <option value="${c.id}">${c.icon || '📁'} ${escapeHtml(c.name)}</option>
            `).join('');

            $('#prod-name').value = '';
            $('#prod-type').value = 'direct';
            $('#prod-duration').value = '';
            $('#prod-price').value = '';
            $('#prod-icon').value = '📦';

            typeChanged();
            openModal('modal-add-prod');
            setTimeout(() => $('#prod-name').focus(), 150);
        } catch (e) {}
    }

    function openEditProduct(id) {
        try {
            const p = (S.products || []).find(x => x.id === id);
            if (!p) return;

            S.editingProductId = id;
            $('#prod-modal-title').textContent = 'تعديل الصنف';
            $('#prod-cat').innerHTML = (S.categories || []).map(c => `
                <option value="${c.id}" ${c.id === p.catId ? 'selected' : ''}>${c.icon || '📁'} ${escapeHtml(c.name)}</option>
            `).join('');

            $('#prod-name').value = p.name;
            $('#prod-type').value = p.type;
            $('#prod-duration').value = p.duration || '';
            $('#prod-price').value = p.price;
            $('#prod-icon').value = p.icon;

            typeChanged();
            openModal('modal-add-prod');
        } catch (e) {}
    }

    function typeChanged() {
        try {
            const type = $('#prod-type').value;
            const durWrap = $('#prod-duration-wrap');
            const priceLbl = $('#prod-price-lbl');

            if (type === 'countdown') {
                durWrap.classList.remove('hidden');
                priceLbl.textContent = 'السعر لكامل المدة (IQD)';
            } else if (type === 'open') {
                durWrap.classList.add('hidden');
                priceLbl.textContent = 'سعر الساعة الواحدة (IQD)';
            } else {
                durWrap.classList.add('hidden');
                priceLbl.textContent = 'السعر الثابت (IQD)';
            }
        } catch (e) {}
    }

    function confirmSaveProduct() {
        try {
            const catId = $('#prod-cat').value;
            const name = $('#prod-name').value.trim();
            const type = $('#prod-type').value;
            const duration = Number($('#prod-duration').value) || 0;
            const price = Number($('#prod-price').value) || 0;
            const icon = $('#prod-icon').value.trim() || '📦';

            if (!name) {
                toast('أدخل اسم الصنف', 'error');
                return;
            }
            if (price < 0) {
                toast('أدخل سعراً صالحاً', 'error');
                return;
            }
            if (type === 'countdown' && duration <= 0) {
                toast('أدخل مدة الدقائق للعداد التنازلي', 'error');
                return;
            }

            S.products = S.products || [];
            if (S.editingProductId) {
                const p = S.products.find(x => x.id === S.editingProductId);
                if (p) {
                    p.catId = catId;
                    p.name = name;
                    p.icon = icon;
                    p.type = type;
                    p.duration = type === 'countdown' ? duration : 0;
                    p.price = price;
                }
            } else {
                S.products.push({
                    id: uid(),
                    catId,
                    name,
                    icon,
                    type,
                    duration: type === 'countdown' ? duration : 0,
                    price
                });
            }

            triggerSave();
            closeModal('modal-add-prod');
            renderMenu();
            toast('تم حفظ الصنف بنجاح', 'success');
        } catch (e) {}
    }

    async function deleteProduct(id) {
        try {
            const ok = await DialogEngine.confirm('هل تريد حذف هذا الصنف من القائمة؟', 'حذف صنف');
            if (!ok) return;

            S.products = (S.products || []).filter(p => p.id !== id);
            triggerSave();
            renderMenu();
            toast('تم حذف الصنف', 'warn');
        } catch (e) {}
    }

    // ==================== TENANT LOGIN & AUTH ====================

    async function handleBranchLogin() {
        try {
            const user = $('#login-branch-user').value.trim();
            const pass = $('#login-branch-pass').value.trim();

            await window.BackendEngine.authenticateBranch(user, pass);
            closeModal('modal-branch-login');
            await initTenantSession();
            toast(`مرحباً بكم! تم الدخول إلى فرع: ${window.BackendEngine.getCurrentTenant().name}`, 'success');
        } catch (err) {
            toast(err.message, 'error', 3500);
        }
    }

    function switchBranchModal() {
        openModal('modal-branch-login');
        setTimeout(() => $('#login-branch-user').focus(), 150);
    }

    async function handleResetBranch() {
        try {
            const ok = await DialogEngine.confirm('⚠️ تحذير شديد: سيتم تصفير وحذف كافة بيانات الطاولات والديون والفواتير للفرع الحالي فقط!\n\nهل أنت متأكد 100%؟', 'تصفير الفرع');
            if (!ok) return;

            S = createDefaultState();
            triggerSave();
            if (window.BackendEngine && typeof window.BackendEngine.forceSaveCloud === 'function') {
                await window.BackendEngine.forceSaveCloud(S, 'branch_reset');
            }
            renderAllViews();
            toast('تم تصفير بيانات الفرع الحالي', 'error');
        } catch (e) {}
    }

    // ==================== SHORTCUTS & APP LIFECYCLE ====================

    function renderAllViews() {
        renderDashboard();
        renderTables();
        renderMenu();
        renderDebts();
        renderInvoices();
    }

    function setupKeyboardShortcuts() {
        try {
            const enterBindings = [
                { id: 'new-table-name', fn: confirmAddTable },
                { id: 'early-amount', fn: confirmEarly },
                { id: 'co-paid', fn: confirmCheckout },
                { id: 'cat-name', fn: confirmAddCategory },
                { id: 'prod-name', fn: confirmSaveProduct },
                { id: 'prod-price', fn: confirmSaveProduct },
                { id: 'prod-duration', fn: confirmSaveProduct },
                { id: 'sys-prompt-input', fn: DialogEngine.submitPrompt }
            ];

            enterBindings.forEach(b => {
                const el = document.getElementById(b.id);
                if (el) {
                    el.addEventListener('keydown', e => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            b.fn();
                        }
                    });
                }
            });

            document.addEventListener('keydown', e => {
                if (e.key === 'Escape') {
                    [
                        'modal-add-table', 'modal-picker', 'modal-early', 'modal-checkout',
                        'modal-transfer', 'modal-add-cat', 'modal-add-prod', 'modal-manage-debt',
                        'modal-stealth-admin'
                    ].forEach(id => closeModal(id));
                    closeDrawer();
                }
            });
        } catch (e) {}
    }

    async function initTenantSession() {
        try {
            const tenant = window.BackendEngine.getCurrentTenant();
            if (!tenant) {
                openModal('modal-branch-login');
                return;
            }

            S = window.BackendEngine.loadTenantLocal(createDefaultState);
            renderAllViews();
            switchView(S.activeView || 'dashboard');

            window.BackendEngine.attachTenantSync(remoteState => {
                const currentView = S.activeView || 'dashboard';
                const currentTableId = S.activeTableId;
                S = Object.assign(createDefaultState(), remoteState);
                S.activeView = currentView;
                S.activeTableId = currentTableId;
                renderAllViews();
                switchView(currentView);
            });

            window.BackendEngine.startAutoSaveLoop(() => S);
            window.BackendEngine.bindSystemSyncListeners(() => S);
        } catch (e) {
            console.warn('Silent boundary in initTenantSession:', e);
        }
    }

    setInterval(() => {
        try {
            const el = $('#live-clock');
            if (el) el.textContent = new Date().toLocaleTimeString('en-GB');
        } catch (e) {}
    }, 1000);

    // Robust Event Delegation for Dynamic Elements (Chrome Click Protection)
    function setupGlobalEventDelegation() {
        document.addEventListener('click', async function (e) {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;

            const action = btn.getAttribute('data-action');
            const id = btn.getAttribute('data-id');

            try {
                if (action === 'pay-debt') {
                    e.preventDefault();
                    e.stopPropagation();
                    await payDebt(id);
                } else if (action === 'pay-debt-full') {
                    e.preventDefault();
                    e.stopPropagation();
                    await payDebtFull(id);
                } else if (action === 'manage-debt') {
                    e.preventDefault();
                    e.stopPropagation();
                    openManageDebtModal(id);
                } else if (action === 'branch-freeze') {
                    e.preventDefault();
                    e.stopPropagation();
                    const status = btn.getAttribute('data-status');
                    if (window.SecurityEngine && window.SecurityEngine.toggleBranchFreeze) {
                        window.SecurityEngine.toggleBranchFreeze(id, status);
                    }
                } else if (action === 'branch-delete') {
                    e.preventDefault();
                    e.stopPropagation();
                    const bname = btn.getAttribute('data-name');
                    if (window.SecurityEngine && window.SecurityEngine.handleDeleteBranch) {
                        window.SecurityEngine.handleDeleteBranch(id, bname);
                    }
                }
            } catch (err) {
                console.warn('Silent event delegation error:', err);
            }
        }, false);
    }

    async function initApp() {
        try {
            // Hard Security Freeze Check (Zero Refresh Bypass)
            const lock = localStorage.getItem('qx716_lockdown');
            const branch = localStorage.getItem('qx716_active_branch');
            let isLocked = false;
            if (lock) {
                try {
                    const l = JSON.parse(lock);
                    if (l && l.frozen) isLocked = true;
                } catch (e) {}
            }
            if (branch) {
                try {
                    const b = JSON.parse(branch);
                    if (b && (b.status === 'frozen' || b.status === 'deactivated')) isLocked = true;
                } catch (e) {}
            }

            if (isLocked || window.__NEXUS_HARD_FROZEN__ || window.__NEXUS_HARD_TERMINATED__) {
                console.warn('⛔ [NEXUS SECURITY] Branch is frozen by security protocol. Normal app flow halted.');
                // Still connect backend to listen for Admin unfreeze instruction
                if (window.BackendEngine && typeof window.BackendEngine.init === 'function') {
                    await window.BackendEngine.init();
                }
                return;
            }

            setupKeyboardShortcuts();
            setupGlobalEventDelegation();

            $$('.modal-bd').forEach(modal => {
                modal.addEventListener('click', e => {
                    if (e.target === modal && modal.id !== 'modal-branch-login') {
                        modal.style.display = 'none';
                    }
                });
            });

            // Instant Real-Time Propagation across the site
            window.addEventListener('nexus:branches-updated', () => {
                try {
                    const tenant = window.BackendEngine ? window.BackendEngine.getCurrentTenant() : null;
                    if (tenant) {
                        const nameEl = document.getElementById('drawer-branch-name');
                        const badgeEl = document.getElementById('branch-badge');
                        if (nameEl) nameEl.textContent = tenant.name;
                        if (badgeEl) badgeEl.textContent = `فرع: ${tenant.name}`;
                    }
                    if (S.activeView === 'admin-master' && window.SecurityEngine) {
                        window.SecurityEngine.refreshAdminData();
                    }
                } catch (e) {}
            });

            await window.BackendEngine.init();

            // Verify status again after backend check before launching session
            const postTenant = window.BackendEngine.getCurrentTenant();
            if (postTenant && (postTenant.status === 'frozen' || postTenant.status === 'deactivated')) {
                console.warn('⛔ Branch verified as frozen/deactivated. Halting session launch.');
                return;
            }

            await initTenantSession();

            console.log('%c🚀 X00716 NEXUS Production Core Active (Protected)', 'color:#00FFFF;font-weight:black;font-size:14px');
        } catch (e) {
            console.warn('Silent boundary in initApp:', e);
        }
    }

    // Export Application Architecture API
    window.AppEngine = {
        transferDaily,
        resetMonthly,
        resetDaily,
        handleDeleteTable,
        openCreateDebtModal,
        openManageDebtModal,
        saveDebtChanges,
        deleteCurrentDebtRecord,
        handleClearInvoices,
        handleBranchLogin,
        switchBranchModal,
        handleResetBranch,
        triggerManualSave: async function (showToast = true) {
            try {
                const ok = await window.BackendEngine.forceSaveCloud(S, 'manual_button');
                if (showToast) {
                    if (ok) toast('تم الحفظ السحابي بنجاح', 'success');
                    else toast('تم الحفظ محلياً (لا يوجد اتصال)', 'warn');
                }
            } catch (e) {}
        }
    };

    // Public Surface Bindings
    Object.assign(window, {
        openDrawer, closeDrawer, switchView, openModal, closeModal,
        renderTables, openAddTableModal, suggestTable, confirmAddTable, openTableDetail,
        renderTableDetail, updateTableCustomer, updateTableDiscount,
        changeQty, pauseItem, resumeItem, removeItem,
        openProductPicker, pickerBack, pickerSelectCat, pickerAddProduct,
        openEarly, quickPayOne, quickPayAll, confirmEarly,
        openCheckout, calcSplit, confirmCheckout,
        openTransfer, confirmTransfer,
        renderDebts, payDebt, payDebtFull,
        renderInvoices, printInv, exportCSV,
        renderMenu, openAddCategoryModal, confirmAddCategory, deleteCategory,
        openAddProductModal, openEditProduct, typeChanged, confirmSaveProduct, deleteProduct
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initApp);
    } else {
        initApp();
    }
})();

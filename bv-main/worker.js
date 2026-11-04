const SESSION_TTL_SECONDS = 12 * 60 * 60;
const LOGIN_WINDOW_SECONDS = 60;
const MAX_LOGIN_ATTEMPTS = 5;
const PASSWORD_ITERATIONS = 100000;

class HttpError extends Error {
    constructor(status, message, extra = {}) {
        super(message);
        this.status = status;
        this.extra = extra;
    }
}

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
    });
}

function base64Url(bytes) {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64(value) {
    const binary = atob(value);
    return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function digest(value) {
    const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
    return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}

function constantTimeEqual(left, right) {
    const a = new TextEncoder().encode(String(left));
    const b = new TextEncoder().encode(String(right));
    let difference = a.length ^ b.length;
    const length = Math.max(a.length, b.length);
    for (let i = 0; i < length; i += 1) {
        difference |= (a[i % (a.length || 1)] || 0) ^ (b[i % (b.length || 1)] || 0);
    }
    return difference === 0;
}

async function hashPassword(password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PASSWORD_ITERATIONS },
        key,
        256
    );
    return `pbkdf2$${PASSWORD_ITERATIONS}$${base64Url(salt)}$${base64Url(new Uint8Array(bits))}`;
}

async function verifyPassword(password, stored) {
    const [algorithm, iterationsText, saltText, expectedText] = String(stored || '').split('$');
    const iterations = Number(iterationsText);
    if (algorithm !== 'pbkdf2' || !Number.isInteger(iterations) || iterations < 10000 || iterations > 500000 ||
        !saltText || !expectedText) return false;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64(saltText), iterations },
        key,
        256
    );
    return constantTimeEqual(base64Url(new Uint8Array(bits)), expectedText);
}

async function issueSession(db, role, branchId = null) {
    const token = base64Url(crypto.getRandomValues(new Uint8Array(32)));
    const tokenHash = await digest(token);
    const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
    await db.prepare(
        'INSERT INTO auth_sessions (token_hash, role, branch_id, expires_at) VALUES (?, ?, ?, ?)'
    ).bind(base64Url(tokenHash), role, branchId, expiresAt).run();
    return token;
}

function getClientIp(request) {
    return request.headers.get('CF-Connecting-IP') || 'unknown';
}

async function parseBody(request) {
    const text = await request.text();
    if (text.length > 2_000_000) throw new HttpError(413, 'حجم الطلب أكبر من الحد المسموح');
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch {
        throw new HttpError(400, 'صيغة بيانات الطلب غير صالحة');
    }
}

function rowToBranch(row) {
    if (!row) return null;
    return {
        id: row.id,
        name: row.name,
        username: row.username,
        status: row.status,
        createdAt: row.created_at,
        lastOpenedAt: row.last_opened_at,
        openCount: row.open_count,
        ...(row.frozen_reason ? { frozenReason: row.frozen_reason } : {}),
        ...(row.frozen_at ? { frozenAt: row.frozen_at } : {}),
        ...(row.unfrozen_at ? { unfrozenAt: row.unfrozen_at } : {}),
        ...(row.deactivated_at ? { deactivatedAt: row.deactivated_at } : {}),
        ...(row.deactivated_reason ? { deactivatedReason: row.deactivated_reason } : {})
    };
}

async function logEvent(db, entry) {
    const timestamp = new Date().toISOString();
    await db.prepare(`
        INSERT INTO audit_logs
            (id, branch_id, branch_name, branch_user, action, details, client_id, timestamp, epoch, severity)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
        `LOG_${Date.now().toString(36)}_${base64Url(crypto.getRandomValues(new Uint8Array(4)))}`,
        entry.branchId || 'SYSTEM',
        entry.branchName || 'النظام المركزي',
        entry.branchUser || 'SYSTEM',
        entry.action || 'EVENT',
        String(entry.details || '').slice(0, 2000),
        entry.clientId || 'unknown',
        timestamp,
        Date.now(),
        entry.severity || 'normal'
    ).run();
    await db.prepare(`
        DELETE FROM audit_logs
        WHERE id IN (SELECT id FROM audit_logs ORDER BY epoch DESC LIMIT -1 OFFSET 250)
    `).run();
}

async function checkRateLimit(db, ip) {
    const now = Math.floor(Date.now() / 1000);
    const row = await db.prepare('SELECT attempts, reset_at FROM login_attempts WHERE ip = ?')
        .bind(ip).first();
    if (!row || row.reset_at <= now) {
        await db.prepare(`
            INSERT INTO login_attempts (ip, attempts, reset_at) VALUES (?, 0, ?)
            ON CONFLICT(ip) DO UPDATE SET attempts = 0, reset_at = excluded.reset_at
        `).bind(ip, now + LOGIN_WINDOW_SECONDS).run();
        return;
    }
    if (row.attempts >= MAX_LOGIN_ATTEMPTS) {
        throw new HttpError(429, 'محاولات كثيرة. يرجى الانتظار دقيقة قبل المحاولة مجدداً.');
    }
}

async function recordFailedLogin(db, ip) {
    const now = Math.floor(Date.now() / 1000);
    await db.prepare(`
        INSERT INTO login_attempts (ip, attempts, reset_at) VALUES (?, 1, ?)
        ON CONFLICT(ip) DO UPDATE SET
            attempts = CASE WHEN reset_at <= ? THEN 1 ELSE attempts + 1 END,
            reset_at = CASE WHEN reset_at <= ? THEN excluded.reset_at ELSE reset_at END
    `).bind(ip, now + LOGIN_WINDOW_SECONDS, now, now).run();
}

async function clearFailedLogins(db, ip) {
    await db.prepare('DELETE FROM login_attempts WHERE ip = ?').bind(ip).run();
}

async function getSession(request, db) {
    const authorization = request.headers.get('Authorization') || '';
    if (!authorization.startsWith('Bearer ')) return null;
    const tokenHash = base64Url(await digest(authorization.slice(7)));
    const row = await db.prepare(`
        SELECT s.role, s.branch_id, s.expires_at, b.status AS branch_status
        FROM auth_sessions s LEFT JOIN branches b ON b.id = s.branch_id
        WHERE s.token_hash = ?
    `).bind(tokenHash).first();
    if (!row) return null;
    if (row.expires_at <= Math.floor(Date.now() / 1000)) {
        await db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').bind(tokenHash).run();
        return null;
    }
    if (row.role === 'branch' && row.branch_status !== 'active') {
        return { role: 'branch', branchId: row.branch_id, status: row.branch_status || 'missing' };
    }
    return { role: row.role, branchId: row.branch_id };
}

function requireRole(session, role) {
    if (!session || session.role !== role) {
        throw new HttpError(401, role === 'master_admin'
            ? 'صلاحية غير مصرح بها. يرجى تسجيل الدخول كمسؤول.'
            : 'جلسة الفرع غير صالحة أو منتهية. يرجى تسجيل الدخول مجدداً.');
    }
}

async function getBranch(db, id) {
    return db.prepare('SELECT * FROM branches WHERE id = ?').bind(id).first();
}

async function getTenantData(db, id) {
    const row = await db.prepare('SELECT data_json FROM tenant_data WHERE branch_id = ?').bind(id).first();
    if (!row) {
        return { tables: [], debts: [], invoices: [], categories: [], products: [], revenue: { daily: 0, yesterday: 0, monthly: 0 } };
    }
    try {
        return JSON.parse(row.data_json);
    } catch {
        throw new HttpError(500, 'تعذر قراءة بيانات الفرع المخزنة');
    }
}

function defaultTenantData() {
    return {
        tables: [],
        debts: [],
        invoices: [],
        categories: [
            { id: 'c1', name: 'صالات البليستيشن', icon: '🎮' },
            { id: 'c2', name: 'المشروبات الباردة والساخنة', icon: '🥤' }
        ],
        products: [
            { id: 'p1', catId: 'c1', name: 'ساعة PS5 VIP', icon: '🕐', type: 'countdown', duration: 60, price: 4000 }
        ],
        revenue: { daily: 0, yesterday: 0, monthly: 0 }
    };
}

async function handleLogin(request, env) {
    const body = await parseBody(request);
    const username = String(body.username || '').trim().toLowerCase();
    const password = String(body.password || '').trim();
    if (!username || !password) throw new HttpError(400, 'يرجى ملء جميع الحقول');

    const ip = getClientIp(request);
    await checkRateLimit(env.DB, ip);

    if (env.ADMIN_USERNAME && env.ADMIN_PASSWORD &&
        constantTimeEqual(username, env.ADMIN_USERNAME.trim().toLowerCase()) &&
        constantTimeEqual(password, env.ADMIN_PASSWORD)) {
        await clearFailedLogins(env.DB, ip);
        await logEvent(env.DB, {
            branchId: 'MASTER_ADMIN',
            branchName: 'المدير العام',
            branchUser: username,
            action: 'ADMIN_LOGIN_SUCCESS',
            details: 'تسجيل دخول ناجح للمدير العام',
            clientId: ip
        });
        return json({
            ok: true,
            isAdmin: true,
            role: 'master_admin',
            token: await issueSession(env.DB, 'master_admin'),
            redirect: '/admin'
        });
    }

    const branch = await env.DB.prepare('SELECT * FROM branches WHERE username = ?')
        .bind(username).first();
    const validPassword = branch ? await verifyPassword(password, branch.password_hash) : false;
    if (!branch || !validPassword) {
        await recordFailedLogin(env.DB, ip);
        await logEvent(env.DB, {
            branchId: 'SECURITY_ALERT',
            branchName: 'محاولة وصول غير مصرح',
            branchUser: username || 'unknown',
            action: 'FAILED_LOGIN',
            details: 'محاولة تسجيل دخول ببيانات غير صحيحة',
            clientId: ip,
            severity: 'warning'
        });
        throw new HttpError(401, 'اسم المستخدم أو كلمة المرور غير صحيحة');
    }
    if (branch.status === 'deactivated') {
        throw new HttpError(403, 'تم تعطيل هذا الفرع بشكل جذري ونهائي بقرار الإدارة العامة. لا يمكن فتح الفرع.', { status: 'deactivated' });
    }
    if (branch.status === 'frozen') {
        throw new HttpError(403, `هذا الفرع مجمد حالياً (${branch.frozen_reason || 'تجميد إداري'}). يرجى مراجعة الإدارة.`, { status: 'frozen' });
    }

    await clearFailedLogins(env.DB, ip);
    const openedAt = new Date().toISOString();
    await env.DB.prepare('UPDATE branches SET last_opened_at = ?, open_count = open_count + 1 WHERE id = ?')
        .bind(openedAt, branch.id).run();
    await logEvent(env.DB, {
        branchId: branch.id,
        branchName: branch.name,
        branchUser: branch.username,
        action: 'BRANCH_OPENED',
        details: `تم فتح الفرع وتسجيل الدخول: ${branch.name}`,
        clientId: ip
    });
    return json({
        ok: true,
        role: 'branch',
        token: await issueSession(env.DB, 'branch', branch.id),
        branch: { id: branch.id, name: branch.name, username: branch.username, status: branch.status, lastOpenedAt: openedAt }
    });
}

async function handleApi(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();
    const ip = getClientIp(request);

    if (method === 'OPTIONS') return new Response(null, { status: 204 });
    if (method === 'POST' && ['/api/auth/login', '/api/branches/login'].includes(path)) {
        return handleLogin(request, env);
    }

    if (method === 'POST' && ['/api/auth/admin-login', '/api/admin/login'].includes(path)) {
        const body = await parseBody(request);
        const loginRequest = new Request(request.url.replace(path, '/api/auth/login'), {
            method: 'POST',
            headers: request.headers,
            body: JSON.stringify(body)
        });
        return handleLogin(loginRequest, env);
    }

    if (method === 'POST' && path === '/api/auth/logout') {
        const authorization = request.headers.get('Authorization') || '';
        if (authorization.startsWith('Bearer ')) {
            const tokenHash = base64Url(await digest(authorization.slice(7)));
            await env.DB.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').bind(tokenHash).run();
        }
        return json({ ok: true });
    }

    const session = await getSession(request, env.DB);
    if (method === 'GET' && path === '/api/auth/session') {
        if (!session) throw new HttpError(401, 'انتهت الجلسة أو أنها غير صالحة');
        if (session.role === 'master_admin') return json({ ok: true, role: session.role });
        if (session.status !== undefined) {
            throw new HttpError(403, 'هذا الفرع غير نشط', { status: session.status });
        }
        const branch = await getBranch(env.DB, session.branchId);
        if (!branch || branch.status !== 'active') throw new HttpError(403, 'هذا الفرع غير نشط', { status: branch?.status || 'missing' });
        return json({ ok: true, role: 'branch', branch: rowToBranch(branch) });
    }

    if (method === 'GET' && path === '/api/system/status') {
        const [system, counts] = await Promise.all([
            env.DB.prepare('SELECT frozen, reason FROM system_state WHERE id = 1').first(),
            env.DB.prepare(`
                SELECT COUNT(*) AS branches_count,
                       SUM(CASE WHEN status = 'frozen' THEN 1 ELSE 0 END) AS frozen_count
                FROM branches
            `).first()
        ]);
        return json({
            systemFrozen: Boolean(system?.frozen),
            systemFrozenReason: system?.reason || null,
            branchesCount: counts?.branches_count || 0,
            frozenBranchesCount: counts?.frozen_count || 0
        });
    }

    const statusMatch = path.match(/^\/api\/branches\/([^/]+)\/status$/);
    if (method === 'GET' && statusMatch) {
        const id = decodeURIComponent(statusMatch[1]);
        const branch = await getBranch(env.DB, id);
        const system = await env.DB.prepare('SELECT frozen, reason FROM system_state WHERE id = 1').first();
        const status = branch?.status || (system?.frozen ? 'frozen' : 'active');
        return json({
            id: branch?.id || id,
            name: branch?.name || 'الفرع الافتراضي',
            status,
            frozenReason: branch?.frozen_reason || system?.reason || null,
            deactivatedReason: branch?.deactivated_reason || null,
            lastOpenedAt: branch?.last_opened_at || null,
            systemFrozen: Boolean(system?.frozen)
        });
    }

    if (method === 'GET' && path === '/api/admin/branches') {
        requireRole(session, 'master_admin');
        const { results } = await env.DB.prepare('SELECT * FROM branches ORDER BY created_at DESC').all();
        return json({ branches: results.map(rowToBranch) });
    }

    if (method === 'POST' && path === '/api/admin/branches') {
        requireRole(session, 'master_admin');
        const body = await parseBody(request);
        const name = String(body.name || '').trim();
        const username = String(body.username || '').trim().toLowerCase();
        const password = String(body.password || '').trim();
        if (!name || !username || !password) throw new HttpError(400, 'يرجى تقديم الاسم واسم المستخدم وكلمة المرور');
        if (username === String(env.ADMIN_USERNAME || '').trim().toLowerCase()) throw new HttpError(400, 'اسم المستخدم محجوز للإدارة');
        const id = `branch_${crypto.randomUUID()}`;
        const createdAt = new Date().toISOString();
        const passwordHash = await hashPassword(password);
        const data = defaultTenantData();
        try {
            await env.DB.batch([
                env.DB.prepare(`
                    INSERT INTO branches (id, name, username, password_hash, status, created_at, last_opened_at, open_count)
                    VALUES (?, ?, ?, ?, 'active', ?, NULL, 0)
                `).bind(id, name, username, passwordHash, createdAt),
                env.DB.prepare('INSERT INTO tenant_data (branch_id, data_json) VALUES (?, ?)')
                    .bind(id, JSON.stringify(data))
            ]);
        } catch (error) {
            if (String(error.message).toLowerCase().includes('unique')) {
                throw new HttpError(400, 'اسم المستخدم مسجل مسبقاً لفرع آخر');
            }
            throw error;
        }
        await logEvent(env.DB, { branchId: id, branchName: name, branchUser: username, action: 'BRANCH_CREATED', details: `تم إنشاء فرع جديد: ${name}`, clientId: ip });
        const branch = await getBranch(env.DB, id);
        return json({ ok: true, branch: rowToBranch(branch), message: 'تم إنشاء الفرع بنجاح' });
    }

    const adminBranchDataMatch = path.match(/^\/api\/admin\/branches\/([^/]+)\/data$/);
    if (method === 'GET' && adminBranchDataMatch) {
        requireRole(session, 'master_admin');
        const id = decodeURIComponent(adminBranchDataMatch[1]);
        const branch = await getBranch(env.DB, id);
        if (!branch) throw new HttpError(404, 'الفرع غير موجود');
        return json({ ok: true, branch: rowToBranch(branch), data: await getTenantData(env.DB, id) });
    }

    const adminBranchMatch = path.match(/^\/api\/admin\/branches\/([^/]+)(?:\/(freeze|deactivate|wipe))?$/);
    if (adminBranchMatch) {
        requireRole(session, 'master_admin');
        const id = decodeURIComponent(adminBranchMatch[1]);
        const action = adminBranchMatch[2] || '';
        const body = ['PUT', 'POST'].includes(method) ? await parseBody(request) : {};
        const branch = await getBranch(env.DB, id);

        if (!action && method === 'DELETE') {
            if (!branch) throw new HttpError(404, 'الفرع غير موجود');
            await env.DB.batch([
                env.DB.prepare('DELETE FROM branches WHERE id = ?').bind(id),
                env.DB.prepare('DELETE FROM tenant_data WHERE branch_id = ?').bind(id),
                env.DB.prepare('DELETE FROM auth_sessions WHERE branch_id = ?').bind(id)
            ]);
            await logEvent(env.DB, { branchId: id, branchName: branch.name, branchUser: branch.username, action: 'BRANCH_DELETED', details: `تم حذف الفرع نهائياً: ${branch.name}`, clientId: ip, severity: 'warning' });
            return json({ ok: true, message: `تم حذف الفرع (${branch.name}) بنجاح` });
        }

        if (!action && method === 'PUT') {
            if (!branch) throw new HttpError(404, 'الفرع غير موجود');
            const name = body.name ? String(body.name).trim() : branch.name;
            const username = body.username ? String(body.username).trim().toLowerCase() : branch.username;
            if (!name || !username) throw new HttpError(400, 'الاسم واسم المستخدم مطلوبان');
            if (username === String(env.ADMIN_USERNAME || '').trim().toLowerCase()) throw new HttpError(400, 'اسم المستخدم محجوز للإدارة');
            let passwordHash = branch.password_hash;
            if (body.password) passwordHash = await hashPassword(String(body.password));
            try {
                await env.DB.prepare(`
                    UPDATE branches SET name = ?, username = ?, password_hash = ? WHERE id = ?
                `).bind(name, username, passwordHash, id).run();
            } catch (error) {
                if (String(error.message).toLowerCase().includes('unique')) throw new HttpError(400, 'اسم المستخدم مسجل مسبقاً لفرع آخر');
                throw error;
            }
            if (body.password) await env.DB.prepare('DELETE FROM auth_sessions WHERE branch_id = ?').bind(id).run();
            const updated = await getBranch(env.DB, id);
            await logEvent(env.DB, { branchId: id, branchName: name, branchUser: username, action: 'BRANCH_UPDATED', details: `تم تعديل بيانات الفرع: ${name}`, clientId: ip });
            return json({ ok: true, branch: rowToBranch(updated), message: `تم تحديث بيانات الفرع (${name}) بنجاح` });
        }

        if (action === 'freeze' && method === 'PUT') {
            if (id === 'all' || id === 'system' || id === 'SYSTEM_WIDE') {
                const status = body.status === 'frozen' ? 'frozen' : 'active';
                const reason = String(body.reason || 'تم تجميد الفرع بقرار إداري من المدير العام');
                if (status === 'frozen') {
                    await env.DB.prepare(`
                        UPDATE branches SET status = 'frozen', frozen_reason = ?, frozen_at = ?
                        WHERE status != 'deactivated'
                    `).bind(reason, new Date().toISOString()).run();
                } else {
                    await env.DB.prepare(`
                        UPDATE branches SET status = 'active', frozen_reason = NULL, frozen_at = NULL, unfrozen_at = ?
                        WHERE status = 'frozen'
                    `).bind(new Date().toISOString()).run();
                }
                await env.DB.prepare('UPDATE system_state SET frozen = ?, reason = ? WHERE id = 1')
                    .bind(status === 'frozen' ? 1 : 0, status === 'frozen' ? reason : null).run();
                return json({ ok: true, status, message: 'تم تحديث حالة كافة الفروع بنجاح' });
            }
            if (!branch) throw new HttpError(404, 'الفرع غير موجود');
            const status = body.status === 'frozen' ? 'frozen' : 'active';
            const reason = String(body.reason || 'تم تجميد الفرع بقرار إداري من المدير العام');
            if (status === 'frozen') {
                await env.DB.prepare(`UPDATE branches SET status = 'frozen', frozen_reason = ?, frozen_at = ? WHERE id = ?`)
                    .bind(reason, new Date().toISOString(), id).run();
            } else {
                await env.DB.prepare(`UPDATE branches SET status = 'active', frozen_reason = NULL, frozen_at = NULL, unfrozen_at = ? WHERE id = ?`)
                    .bind(new Date().toISOString(), id).run();
                await env.DB.prepare('UPDATE system_state SET frozen = 0, reason = NULL WHERE id = 1').run();
            }
            const updated = await getBranch(env.DB, id);
            await logEvent(env.DB, {
                branchId: id, branchName: branch.name, branchUser: branch.username,
                action: status === 'frozen' ? 'BRANCH_FROZEN' : 'BRANCH_UNFROZEN',
                details: status === 'frozen' ? `تم تجميد الفرع: ${branch.name}. السبب: ${reason}` : `تم فك تجميد الفرع: ${branch.name}`,
                clientId: ip, severity: status === 'frozen' ? 'warning' : 'normal'
            });
            return json({ ok: true, branch: rowToBranch(updated), status });
        }

        if (action === 'deactivate' && method === 'PUT') {
            if (!branch) throw new HttpError(404, 'الفرع غير موجود');
            const reason = String(body.reason || 'تم تعطيل الفرع بقرار الإدارة العامة');
            await env.DB.prepare(`
                UPDATE branches SET status = 'deactivated', deactivated_reason = ?, deactivated_at = ? WHERE id = ?
            `).bind(reason, new Date().toISOString(), id).run();
            await env.DB.prepare('DELETE FROM auth_sessions WHERE branch_id = ?').bind(id).run();
            const updated = await getBranch(env.DB, id);
            await logEvent(env.DB, { branchId: id, branchName: branch.name, branchUser: branch.username, action: 'BRANCH_DEACTIVATED_RADICAL', details: `تعطيل الفرع ${branch.name}: ${reason}`, clientId: ip, severity: 'critical' });
            return json({ ok: true, branch: rowToBranch(updated), message: 'تم تعطيل الفرع جذرياً بنجاح' });
        }

        if (action === 'wipe' && method === 'POST') {
            if (!branch) throw new HttpError(404, 'الفرع غير موجود');
            await env.DB.prepare('UPDATE tenant_data SET data_json = ? WHERE branch_id = ?')
                .bind(JSON.stringify(defaultTenantData()), id).run();
            await logEvent(env.DB, { branchId: id, branchName: branch.name, branchUser: branch.username, action: 'BRANCH_DATA_WIPED', details: `تم تصفير بيانات الفرع: ${branch.name}`, clientId: ip, severity: 'warning' });
            return json({ ok: true, message: `تم تصفير بيانات الفرع (${branch.name}) بنجاح` });
        }
        throw new HttpError(404, 'المسار البرمجي غير موجود');
    }

    if (method === 'GET' && path === '/api/admin/audit-logs') {
        requireRole(session, 'master_admin');
        const { results } = await env.DB.prepare('SELECT * FROM audit_logs ORDER BY epoch DESC LIMIT 250').all();
        return json({
            logs: results.map(row => ({
                id: row.id,
                branchId: row.branch_id,
                branchName: row.branch_name,
                branchUser: row.branch_user,
                action: row.action,
                details: row.details,
                clientId: row.client_id,
                timestamp: row.timestamp,
                epoch: row.epoch,
                severity: row.severity
            }))
        });
    }
    if (method === 'DELETE' && path === '/api/admin/audit-logs') {
        requireRole(session, 'master_admin');
        await env.DB.prepare('DELETE FROM audit_logs').run();
        return json({ ok: true, message: 'تم مسح سجلات المراقبة بنجاح' });
    }

    const branchDataMatch = path.match(/^\/api\/branches\/([^/]+)\/data$/);
    if (branchDataMatch && ['GET', 'POST'].includes(method)) {
        requireRole(session, 'branch');
        const id = decodeURIComponent(branchDataMatch[1]);
        if (session.branchId !== id) throw new HttpError(401, 'جلسة غير صالحة لهذا الفرع');
        const branch = await getBranch(env.DB, id);
        if (!branch) throw new HttpError(404, 'الفرع غير موجود');
        if (branch.status !== 'active') throw new HttpError(403, 'الفرع غير نشط', { status: branch.status });
        if (method === 'GET') return json({ ok: true, data: await getTenantData(env.DB, id) });
        const body = await parseBody(request);
        if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) {
            throw new HttpError(400, 'بيانات الفرع غير صالحة');
        }
        await env.DB.prepare(`
            INSERT INTO tenant_data (branch_id, data_json) VALUES (?, ?)
            ON CONFLICT(branch_id) DO UPDATE SET data_json = excluded.data_json
        `).bind(id, JSON.stringify(body.data)).run();
        return json({ ok: true, savedAt: new Date().toISOString() });
    }

    if (method === 'POST' && path === '/api/audit-logs') {
        requireRole(session, 'branch');
        const body = await parseBody(request);
        if (String(body.branchId || '') !== session.branchId) throw new HttpError(401, 'جلسة غير صالحة لتسجيل نشاط الفرع');
        const branch = await getBranch(env.DB, session.branchId);
        if (!branch) throw new HttpError(404, 'الفرع غير موجود');
        await logEvent(env.DB, {
            branchId: branch.id, branchName: branch.name, branchUser: branch.username,
            action: body.action || 'EVENT', details: body.details || '', clientId: ip, severity: body.severity || 'normal'
        });
        return json({ ok: true });
    }

    const tamperMatch = path.match(/^\/api\/(?:branches\/([^/]+)\/tamper|system\/tamper)$/);
    if (method === 'POST' && tamperMatch) {
        const id = decodeURIComponent(tamperMatch[1] || session?.branchId || 'default');
        if (!session || (session.role === 'branch' && session.branchId !== id)) {
            throw new HttpError(401, 'جلسة غير صالحة لتسجيل هذا الحدث');
        }
        const body = await parseBody(request);
        const branch = await getBranch(env.DB, id) || await env.DB.prepare('SELECT * FROM branches ORDER BY created_at LIMIT 1').first();
        const reason = String(body.reason || 'محاولة فحص الأكواد أو فتح أدوات المطور').slice(0, 1000);
        if (branch?.unfrozen_at && Date.now() - new Date(branch.unfrozen_at).getTime() < 15000) {
            return json({ ok: true, gracePeriod: true, status: branch.status, message: 'فترة سماح نشطة بعد فك التجميد الإداري' });
        }
        if (branch) {
            await env.DB.prepare(`
                UPDATE branches SET status = 'frozen', frozen_reason = ?, frozen_at = COALESCE(frozen_at, ?) WHERE id = ?
            `).bind(reason, new Date().toISOString(), branch.id).run();
        }
        await env.DB.prepare('UPDATE system_state SET frozen = 1, reason = ? WHERE id = 1').bind(reason).run();
        await logEvent(env.DB, {
            branchId: branch?.id || 'SYSTEM_WIDE',
            branchName: branch?.name || 'كافة الفروع والنظام',
            branchUser: branch?.username || 'Unknown',
            action: 'TAMPER_SECURITY_BREACH',
            details: `تم رصد محاولة فحص: ${reason}`,
            clientId: ip,
            severity: 'critical'
        });
        return json({ ok: true, frozen: true, status: 'frozen', message: 'تم تسجيل الحدث الأمني' });
    }

    return json({ error: `المسار البرمجي غير موجود: ${method} ${path}` }, 404);
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        try {
            if (url.pathname === '/admin' || url.pathname === '/adminx') {
                return Response.redirect(new URL('/adminx.html', request.url), 302);
            }
            if (url.pathname.startsWith('/api/')) {
                try {
                    return await handleApi(request, env);
                } catch (error) {
                    if (error instanceof HttpError) {
                        return json({ error: error.message, ...error.extra }, error.status);
                    }
                    console.error('[THUNDER API] Request failed:', error);
                    return json({ ok: false, error: 'حدث خطأ غير متوقع في الخادم' }, 500);
                }
            }
            if (!env.ASSETS) return json({ error: 'لم يتم ربط ملفات الواجهة الثابتة' }, 500);
            return env.ASSETS.fetch(request);
        } catch (error) {
            console.error('[THUNDER Worker] Request failed:', error);
            return json({ error: 'تعذر إكمال الطلب' }, 500);
        }
    }
};

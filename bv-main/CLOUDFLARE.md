# نشر THUNDER على Cloudflare

يستضيف Cloudflare Worker الواجهة وواجهات `/api/*`، وتُحفظ حسابات الفروع والجلسات والبيانات في D1. لا تفتح قواعد Firestore لهذا التطبيق؛ تسجيل الدخول لا يقرأ كلمات المرور من Firebase.

## إعداد قاعدة البيانات والنشر

1. ثبّت الحزم من مجلد المشروع:

   ```sh
   npm install
   ```

2. سجّل الدخول إلى Cloudflare من جهازك:

   ```sh
   npx wrangler login
   ```

3. أنشئ قاعدة D1:

   ```sh
   npx wrangler d1 create thunder-lounge-data
   ```

   انسخ `database_id` الظاهر في النتيجة إلى `wrangler.toml` مكان `REPLACE_WITH_D1_DATABASE_ID`.

4. أنشئ أسرار حساب الأدمن. استخدم كلمة مرور قوية جديدة، ولا تستخدم كلمة المرور الافتراضية `1` على موقع عام:

   ```sh
   npx wrangler secret put ADMIN_USERNAME
   npx wrangler secret put ADMIN_PASSWORD
   ```

5. أنشئ جداول D1 ثم ابنِ وانشر الموقع:

   ```sh
   npm run cf:d1:migrate
   npm run deploy
   ```

## التحقق

- افتح رابط Worker ثم سجّل دخول الأدمن بالاسم وكلمة المرور اللذين أدخلتهما كـSecrets.
- سيُنشئ الأدمن حسابات الفروع من لوحة الإدارة؛ قاعدة D1 الجديدة لا تحتوي فروعاً افتراضية.
- جرّب `POST /api/auth/login` ببيانات غير صحيحة؛ يجب أن يعيد `401` وجسم JSON يحوي `error`.
- لا تضع كلمات المرور أو بيانات الفروع في ملفات الواجهة أو مستودع عام.

البيانات الموجودة محلياً في `data/nexus-store.json` أو Firebase لا تُنقل تلقائياً إلى D1. يلزم تصديرها واستيرادها منفصلاً قبل الاعتماد على النسخة المنشورة.

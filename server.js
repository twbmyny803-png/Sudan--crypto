const express = require("express");
const cors = require("cors");
const path = require("path");
const { Resend } = require("resend");

const app = express();
app.use(express.json());
app.use(cors());

// 🔐 مفتاح Resend (مباشر زي ما طلبت)
const resend = new Resend("re_NBwHrNvM_8V7mPxiSistfrYy1B5DXTZDg");

// قراءة صفحات الموقع
app.use(express.static(path.join(__dirname, "public")));

let users = [];
let codes = {};        // تخزين الأكواد المؤقتة للتسجيل
let resetCodes = {};   // تخزين أكواد إعادة تعيين كلمة السر

// ================== إرسال كود التحقق (للتسجيل) ==================
app.post("/send-code", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.json({ success: false, message: "أدخل الإيميل" });
  }

  const code = Math.floor(100000 + Math.random() * 900000);
  codes[email] = code;

  try {
    await resend.emails.send({
      from: "Sudan Crypto <noreply@sudancrypto.com>",
      to: email,
      subject: "كود التحقق",
      html: `<h2>كود التحقق الخاص بك: ${code}</h2>`
    });

    res.json({ success: true, message: "تم إرسال الكود" });

  } catch (err) {
    console.log(err);
    res.json({ success: false, message: "فشل إرسال الكود" });
  }
});

// ================== التحقق من الكود (للتسجيل) ==================
app.post("/verify", (req, res) => {
  const { email, code } = req.body;

  if (codes[email] == code) {
    delete codes[email];
    return res.json({ success: true });
  }

  res.json({ success: false, message: "الكود غير صحيح" });
});

// ================== تسجيل المستخدم ==================
app.post("/register", (req, res) => {
  const { name, email, phone, password, ref } = req.body;

  if (!name || !email || !phone || !password) {
    return res.json({ success: false, message: "املأ كل الحقول" });
  }

  const exists = users.find(u => u.email === email);
  if (exists) {
    return res.json({ success: false, message: "الإيميل مستخدم" });
  }

  users.push({
    name,
    email,
    phone,
    password,
    ref: ref || null,
    verified: true,
    balance: 0
  });

  res.json({ success: true, message: "تم إنشاء الحساب" });
});

// ================== تسجيل الدخول ==================
app.post("/login", (req, res) => {
  const { email, password } = req.body;

  const user = users.find(
    u => u.email === email && u.password === password
  );

  if (!user) {
    return res.json({ success: false, message: "بيانات خاطئة" });
  }

  res.json({ success: true });
});

// ================== 🔥 إعادة تعيين كلمة السر (نسيت كلمة السر) ==================

// 1. إرسال كود إعادة التعيين إلى البريد الإلكتروني
app.post("/forgot-password", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.json({ success: false, message: "أدخل البريد الإلكتروني" });
  }

  const user = users.find(u => u.email === email);
  if (!user) {
    return res.json({ success: false, message: "البريد الإلكتروني غير مسجل" });
  }

  const resetCode = Math.floor(100000 + Math.random() * 900000);
  resetCodes[email] = resetCode;

  try {
    await resend.emails.send({
      from: "Sudan Crypto <noreply@sudancrypto.com>",
      to: email,
      subject: "إعادة تعيين كلمة المرور",
      html: `
        <div style="font-family: Arial; text-align: center;">
          <h2>إعادة تعيين كلمة المرور</h2>
          <p>استخدم هذا الكود لإعادة تعيين كلمة مرورك:</p>
          <h1 style="color: #2D6AF6; font-size: 32px;">${resetCode}</h1>
          <p>هذا الكود صالح لمدة 5 دقائق.</p>
          <p>إذا لم تطلب إعادة التعيين، تجاهل هذا البريد.</p>
        </div>
      `
    });

    res.json({ success: true, message: "تم إرسال كود إعادة التعيين إلى بريدك الإلكتروني" });

  } catch (err) {
    console.error(err);
    res.json({ success: false, message: "فشل إرسال الكود" });
  }
});

// 2. التحقق من كود إعادة التعيين
app.post("/verify-reset-code", (req, res) => {
  const { email, code } = req.body;

  if (!email || !code) {
    return res.json({ success: false, message: "البريد الإلكتروني والكود مطلوبان" });
  }

  const savedCode = resetCodes[email];
  if (!savedCode) {
    return res.json({ success: false, message: "لم يتم طلب إعادة تعيين لهذا البريد" });
  }

  if (String(savedCode) === String(code)) {
    // الكود صحيح، نحذفه مؤقتاً حتى إعادة التعيين الفعلية
    // سنستخدم verifiedReset لتأكيد أن المستخدم اجتاز التحقق
    resetCodes[email + "_verified"] = true;
    return res.json({ success: true, message: "تم التحقق من الكود" });
  }

  res.json({ success: false, message: "الكود غير صحيح" });
});

// 3. تعيين كلمة سر جديدة (بعد التحقق من الكود)
app.post("/reset-password", (req, res) => {
  const { email, newPassword } = req.body;

  if (!email || !newPassword) {
    return res.json({ success: false, message: "البريد الإلكتروني وكلمة المرور مطلوبان" });
  }

  if (newPassword.length < 8) {
    return res.json({ success: false, message: "كلمة المرور يجب أن تكون 8 أحرف أو أكثر" });
  }

  const isVerified = resetCodes[email + "_verified"];
  if (!isVerified) {
    return res.json({ success: false, message: "لم يتم التحقق من الكود مسبقاً" });
  }

  const userIndex = users.findIndex(u => u.email === email);
  if (userIndex === -1) {
    return res.json({ success: false, message: "المستخدم غير موجود" });
  }

  // تحديث كلمة المرور
  users[userIndex].password = newPassword;

  // تنظيف بيانات إعادة التعيين
  delete resetCodes[email];
  delete resetCodes[email + "_verified"];

  res.json({ success: true, message: "تم تغيير كلمة المرور بنجاح" });
});

// ================== الصفحة الرئيسية ==================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ================== تشغيل السيرفر ==================
const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});

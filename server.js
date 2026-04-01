const express = require("express");
const cors = require("cors");
const path = require("path");
const { Resend } = require("resend");

const app = express();
app.use(express.json());
app.use(cors());

// 🔥 ربط Resend بطريقة آمنة
const resend = new Resend(process.env.RESEND_API_KEY);

// قراءة صفحات الموقع
app.use(express.static(path.join(__dirname, "public")));

let users = [];
let codes = {}; // تخزين الأكواد مؤقت

// 📨 تسجيل + إرسال كود
app.post("/register", async (req, res) => {
  const { name, email, phone, password } = req.body;

  if (!name || !email || !phone || !password) {
    return res.json({ success: false, message: "املأ كل الحقول" });
  }

  const exists = users.find(u => u.email === email);
  if (exists) {
    return res.json({ success: false, message: "الإيميل مستخدم" });
  }

  const code = Math.floor(100000 + Math.random() * 900000);
  codes[email] = code;

  try {
    await resend.emails.send({
      from: "Sudan Crypto <onboarding@resend.dev>", // أو دومينك
      to: email,
      subject: "كود التحقق",
      html: `<h2>كود التحقق الخاص بك: ${code}</h2>`
    });

    users.push({
      name,
      email,
      phone,
      password,
      verified: false
    });

    res.json({ success: true, message: "تم إرسال الكود" });

  } catch (err) {
    res.json({ success: false, message: "فشل إرسال الكود" });
  }
});

// 🔐 تحقق الكود
app.post("/verify", (req, res) => {
  const { email, code } = req.body;

  if (codes[email] == code) {
    let user = users.find(u => u.email === email);
    if (user) user.verified = true;

    delete codes[email];

    return res.json({ success: true });
  }

  res.json({ success: false, message: "الكود غير صحيح" });
});

// 🔑 تسجيل الدخول
app.post("/login", (req, res) => {
  const { email, password } = req.body;

  const user = users.find(
    u => u.email === email && u.password === password
  );

  if (!user) {
    return res.json({ success: false, message: "بيانات خاطئة" });
  }

  if (!user.verified) {
    return res.json({ success: false, message: "يجب التحقق أولاً" });
  }

  res.json({ success: true });
});

// الصفحة الرئيسية
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// تشغيل السيرفر
const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});

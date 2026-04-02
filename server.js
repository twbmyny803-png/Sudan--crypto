const express = require("express");
const cors = require("cors");
const path = require("path");
const { Resend } = require("resend");

const app = express();
app.use(express.json());
app.use(cors());

// 🔴 حطيت المفتاح هنا عشان يشتغل معاك مباشرة
const resend = new Resend("re_NBwHrNvM_8V7mPxiSistfrYy1B5DXTZDg");

// 📁 ملفات الموقع
app.use(express.static(path.join(__dirname, "public")));

let users = [];
let codes = {};

// ================== إرسال كود ==================
app.post("/send-code", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.json({ success: false, message: "أدخل البريد" });
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  codes[email] = code;

  try {
    await resend.emails.send({
      from: "Sudan Crypto <noreply@sudancrypto.com>",
      to: email,
      subject: "كود التحقق",
      html: `<h2 style="text-align:center;">كودك هو: ${code}</h2>`
    });

    res.json({ success: true });

  } catch (err) {
    console.log("EMAIL ERROR:", err);
    res.json({ success: false, message: "فشل إرسال الكود" });
  }
});

// ================== تحقق ==================
app.post("/verify", (req, res) => {
  const { email, code } = req.body;

  if (codes[email] === code) {
    delete codes[email];
    return res.json({ success: true });
  }

  res.json({ success: false, message: "الكود غير صحيح" });
});

// ================== تسجيل ==================
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
    password
  });

  res.json({ success: true });
});

// ================== تسجيل دخول ==================
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

// الصفحة الرئيسية
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});

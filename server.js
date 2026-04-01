const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(express.json());
app.use(cors());

// 🔥 مهم: قراءة ملفات HTML
app.use(express.static(path.join(__dirname, "public")));

let users = [];

// تسجيل مستخدم
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
    ref,
    balance: 0
  });

  res.json({ success: true, message: "تم التسجيل بنجاح" });
});

// 🔥 الصفحة الرئيسية
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// 🔥 مهم لـ Render
const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});

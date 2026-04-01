const express = require("express");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

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

app.listen(10000, () => {
  console.log("Server running on port 10000");
});

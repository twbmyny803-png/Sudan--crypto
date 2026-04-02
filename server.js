const express = require("express");
const cors = require("cors");
const path = require("path");
const { Resend } = require("resend");
const mongoose = require("mongoose");

const app = express();
app.use(express.json());
app.use(cors());

// 🔐 Resend
const resend = new Resend("re_NBwHrNvM_8V7mPxiSistfrYy1B5DXTZDg");

// 🔥 ربط MongoDB
mongoose.connect("mongodb+srv://maynwsmanswy_db_user:hOrkK68kCma6kJB5@cluster0.w0jrqw.mongodb.net/sudancrypto?retryWrites=true&w=majority")
.then(() => console.log("✅ MongoDB connected"))
.catch(err => console.log("❌ MongoDB error:", err));

// 🔼 المتغيرات العامة
let codes = {};
let resetCodes = {};
let deposits = [];
let withdrawRequests = [];

// 📦 Schema (Updated)
const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  phone: String,
  password: String,
  ref: String,
  balance: { type: Number, default: 0 },
  incomeBalance: { type: Number, default: 0 },

  isVerified: { type: Boolean, default: false },
  isBlocked: { type: Boolean, default: false },
  isFrozen: { type: Boolean, default: false },

  withdrawBlocked: { type: Boolean, default: false },

  packageName: String,
  packageStart: Date,
  packageDurationDays: Number,
  dailyProfit: Number,
  
  verificationStatus: { type: String, default: 'none' }, // 'none', 'pending', 'verified', 'rejected'
  withdrawPassword: { type: String, default: null } // حقل كلمة سر السحب
});

const User = mongoose.model("User", userSchema);

// ملفات الموقع
app.use(express.static(path.join(__dirname, "public")));

// ================== إرسال كود ==================
app.post("/send-code", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.json({ success: false, message: "أدخل الإيميل" });
  }

  const exists = await User.findOne({ email });

  if (exists) {
    return res.json({
      success: false,
      message: "هذا البريد مسجل بالفعل"
    });
  }

  const code = Math.floor(100000 + Math.random() * 900000);
  codes[email] = code;

  try {
    await resend.emails.send({
      from: "Sudan Crypto <noreply@sudancrypto.com>",
      to: email,
      subject: "كود التحقق",
      html: `<h2>كود التحقق: ${code}</h2>`
    });

    res.json({ success: true });

  } catch (err) {
    res.json({ success: false, message: "فشل الإرسال" });
  }
});

// ================== تحقق من الكود ==================
app.post("/verify", (req, res) => {
  const { email, code } = req.body;

  if (codes[email] == code) {
    delete codes[email];
    return res.json({ success: true });
  }

  res.json({ success: false });
});

// ================== تسجيل ==================
app.post("/register", async (req, res) => {
  const { name, email, phone, password, ref } = req.body;

  if (!name || !email || !phone || !password) {
    return res.json({ success: false, message: "املأ كل الحقول" });
  }

  if (password.length < 8) {
    return res.json({ success: false, message: "كلمة السر ضعيفة" });
  }

  const exists = await User.findOne({ email });
  if (exists) {
    return res.json({ success: false, message: "الإيميل مستخدم" });
  }

  const user = new User({
    name,
    email,
    phone,
    password,
    ref: ref || null
  });

  await user.save();

  res.json({ success: true });
});

// ================== تسجيل دخول ==================
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email, password });

  if (!user) {
    return res.json({ success: false, message: "بيانات غلط" });
  }

  res.json({
    success: true,
    name: user.name,
    email: user.email
  });
});

// ================== نسيت كلمة السر ==================
app.post("/forgot-password", async (req, res) => {
  const { email } = req.body;

  const user = await User.findOne({ email });
  if (!user) {
    return res.json({ success: false, message: "غير موجود" });
  }

  const code = Math.floor(100000 + Math.random() * 900000);
  resetCodes[email] = code;

  await resend.emails.send({
    from: "Sudan Crypto <noreply@sudancrypto.com>",
    to: email,
    subject: "Reset Password",
    html: `<h1>${code}</h1>`
  });

  res.json({ success: true });
});

// ================== تحقق reset ==================
app.post("/verify-reset-code", (req, res) => {
  const { email, code } = req.body;

  if (resetCodes[email] == code) {
    resetCodes[email + "_ok"] = true;
    return res.json({ success: true });
  }

  res.json({ success: false });
});

// ================== تعيين كلمة جديدة ==================
app.post("/reset-password", async (req, res) => {
  const { email, newPassword } = req.body;

  if (!resetCodes[email + "_ok"]) {
    return res.json({ success: false });
  }

  await User.updateOne({ email }, { password: newPassword });

  delete resetCodes[email];
  delete resetCodes[email + "_ok"];

  res.json({ success: true });
});

// ================== الصفحة الرئيسية ==================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ================== جلب بيانات المستخدم ==================
app.post("/user-data", async (req, res) => {
  const { email } = req.body;

  const user = await User.findOne({ email });

  if (!user) {
    return res.json({ success: false });
  }

  res.json({
    success: true,
    name: user.name,
    email: user.email,
    phone: user.phone,
    isVerified: user.isVerified || false,
    isBlocked: user.isBlocked || false,
    isFrozen: user.isFrozen || false,
    withdrawBlocked: user.withdrawBlocked || false,
    verificationStatus: user.verificationStatus || 'none',
    balance: user.balance || 0,
    incomeBalance: user.incomeBalance || 0,
    packageName: user.packageName || null
  });
});

// ================== تغيير كلمة المرور ==================
app.post("/change-password", async (req, res) => {
  const { email, oldPass, newPass } = req.body;
  const user = await User.findOne({ email, password: oldPass });
  
  if (!user) {
    return res.json({ success: false, message: "كلمة المرور الحالية غير صحيحة" });
  }

  await User.updateOne({ email }, { password: newPass });
  res.json({ success: true });
});

// ================== تعيين كلمة السحب ==================
app.post("/set-withdraw-password", async (req, res) => {
  const { email, withdrawPassword } = req.body;
  await User.updateOne({ email }, { withdrawPassword });
  res.json({ success: true });
});

// ============================================
// 🔽 ADMIN APIs & NEW FEATURES 🔽
// ============================================

// ✅ 2. عرض كل المستخدمين (مع كل البيانات)
app.get("/admin-users", async (req, res) => {
  const users = await User.find({});
  res.json({ success: true, users });
});

// ✅ 3. توثيق المستخدم
app.post("/admin-verify", async (req, res) => {
  const { email } = req.body;
  await User.updateOne({ email }, { isVerified: true, verificationStatus: 'verified' });
  res.json({ success: true });
});

// ✅ 4. تجميد الحساب
app.post("/admin-freeze", async (req, res) => {
  const { email } = req.body;
  await User.updateOne({ email }, { isFrozen: true });
  res.json({ success: true });
});

// ✅ 5. حظر الحساب
app.post("/admin-block", async (req, res) => {
  const { email } = req.body;
  await User.updateOne({ email }, { isBlocked: true });
  res.json({ success: true });
});

// ✅ 6. فك الحظر / التجميد
app.post("/admin-unblock", async (req, res) => {
  const { email } = req.body;
  await User.updateOne({ email }, { isBlocked: false, isFrozen: false });
  res.json({ success: true });
});

// ✅ 7. حذف المستخدم
app.post("/admin-delete", async (req, res) => {
  const { email } = req.body;
  await User.deleteOne({ email });
  res.json({ success: true });
});

// ✅ 8. منع السحب
app.post("/admin-block-withdraw", async (req, res) => {
  const { email } = req.body;
  await User.updateOne({ email }, { withdrawBlocked: true });
  res.json({ success: true });
});

// ✅ 9. إضافة باقة للمستخدم
app.post("/admin-add-package", async (req, res) => {
  const { email, packageName, dailyProfit, durationDays } = req.body;
  await User.updateOne(
    { email },
    {
      packageName,
      dailyProfit,
      packageDurationDays: durationDays,
      packageStart: new Date()
    }
  );
  res.json({ success: true });
});

// ✅ 10. طلبات الإيداع
app.post("/deposit-request", (req, res) => {
  deposits.push({ ...req.body, date: new Date() });
  res.json({ success: true });
});

app.get("/admin-deposits", (req, res) => {
  res.json({ success: true, deposits });
});

// ✅ 11. طلبات السحب
app.post("/withdraw-request", (req, res) => {
  withdrawRequests.push({ ...req.body, status: 'pending', date: new Date() });
  res.json({ success: true });
});

app.get("/admin-withdraws", (req, res) => {
  res.json({ success: true, withdraws: withdrawRequests });
});

app.post("/admin-approve-withdraw", (req, res) => {
  const { id } = req.body;
  // منطق بسيط للتحديث في المصفوفة (في الإنتاج يفضل استخدام DB)
  const reqIdx = withdrawRequests.findIndex(r => r.id === id);
  if (reqIdx > -1) withdrawRequests[reqIdx].status = 'approved';
  res.json({ success: true });
});

app.post("/admin-reject-withdraw", (req, res) => {
  const { id } = req.body;
  const reqIdx = withdrawRequests.findIndex(r => r.id === id);
  if (reqIdx > -1) withdrawRequests[reqIdx].status = 'rejected';
  res.json({ success: true });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("Server running on " + PORT);
});

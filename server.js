const express = require("express");
const cors = require("cors");
const path = require("path");
const { Resend } = require("resend");
const mongoose = require("mongoose");
const fs = require("fs");
const multer = require("multer");
const crypto = require("crypto");

const app = express();
app.use(express.json());
app.use(cors());

if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads");
}

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// 🔐 Resend
const resend = new Resend("re_NBwHrNvM_8V7mPxiSistfrYy1B5DXTZDg");

// 🔥 ربط MongoDB
mongoose.connect("mongodb+srv://maynwsmanswy_db_user:hOrkK68kCma6kJB5@cluster0.w0jrqw.mongodb.net/sudancrypto?retryWrites=true&w=majority")
.then(() => console.log("✅ MongoDB connected"))
.catch(err => console.log("❌ MongoDB error:", err));

// ================== إضافات فوق ==================
let codes = {};
let resetCodes = {};

// 📦 Schema (Updated)
const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  phone: String,
  password: String,
  ref: String,
  refCode: String,
  refBy: String,

  balance: { type: Number, default: 0 },
  investedAmount: { type: Number, default: 0 },
  incomeBalance: { type: Number, default: 0 },
  referralBalance: { type: Number, default: 0 },

  isVerified: { type: Boolean, default: false },
  verificationStatus: { type: String, default: 'none' },

  isBlocked: { type: Boolean, default: false },
  isFrozen: { type: Boolean, default: false },

  withdrawBlocked: { type: Boolean, default: false },
  withdrawPassword: { type: String, default: null },

  walletAddress: { type: String, default: null },
  walletLocked: { type: Boolean, default: false },

  packageName: String,
  packageStart: Date,
  packageDurationDays: Number,
  dailyProfit: Number,

  verificationFullName: String,
  verificationDocType: String,
  verificationDocNumber: String,
  verificationImages: [String],
  verificationRejectReason: { type: String, default: null },
  lastProfitDate: Date
});

const User = mongoose.model("User", userSchema);

// 🧩 4. عدل Schema (أضف name)
const depositSchema = new mongoose.Schema({
  email: String,
  name: String,
  amount: Number,
  txid: String,
  image: String,
  orderId: String,      // ✅ مهم
  packageName: String,  // ✅ مهم
  network: String,
  status: { type: String, default: "pending" },
  createdAt: { type: Date, default: Date.now }
});

const Deposit = mongoose.model("Deposit", depositSchema);

const referralTransactionSchema = new mongoose.Schema({
  email: String,
  amount: Number,
  type: { type: String, required: true },
  status: String,
  level: Number,
  createdAt: { type: Date, default: Date.now }
});

const ReferralTransaction = mongoose.model("ReferralTransaction", referralTransactionSchema);

const withdrawSchema = new mongoose.Schema({
  email: String,
  amount: Number,
  wallet: String,
  status: { type: String, default: "pending" },
  createdAt: { type: Date, default: Date.now }
});

const Withdraw = mongoose.model("Withdraw", withdrawSchema);

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + "-" + Math.round(Math.random() * 1e9) + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({ storage });

app.use(express.static(path.join(__dirname, "public")));

function generateRefCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ================== إرسال كود ==================
app.post("/send-code", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.json({ success: false, message: "أدخل الإيميل" });
  const exists = await User.findOne({ email });
  if (exists) return res.json({ success: false, message: "هذا البريد مسجل بالفعل" });
  const code = Math.floor(100000 + Math.random() * 900000);
  codes[email] = code;
  try {
    await resend.emails.send({
      from: "Sudan Crypto <noreply@sudancrypto.com>",
      to: email,
      subject: "كود التحقق",
      html: `
<div style="
background:#0a0f2a;
padding:40px;
font-family:Cairo,sans-serif;
text-align:center;
color:white;
">

<h1 style="color:#F0B90B;">
Sudan Crypto
</h1>

<p style="font-size:20px;">
كود التحقق للتسجيل
</p>

<div style="
background:#111827;
border:1px solid #F0B90B;
padding:20px;
border-radius:18px;
display:inline-block;
margin-top:20px;
">

<span style="
font-size:42px;
font-weight:bold;
letter-spacing:6px;
color:#F0B90B;
">
${code}
</span>

</div>

<p style="
margin-top:25px;
color:#aaa;
font-size:14px;
">
صلاحية الكود 10 دقائق
</p>

<p style="
color:#777;
font-size:13px;
">
لا تشارك هذا الكود مع أي شخص
</p>

</div>
`
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
  let refCode;
  let existsCode = true;
  while (existsCode) {
    refCode = generateRefCode();
    const userExists = await User.findOne({ refCode });
    if (!userExists) existsCode = false;
  }
  let refUser = null;
  if (ref) {
    refUser = await User.findOne({ refCode: ref });
  }
  const user = new User({
    name,
    email,
    phone,
    password,
    refCode: refCode,
    refBy: refUser ? refUser.refCode : null
  });
  await user.save();
  res.json({ success: true });
});

// ================== تسجيل دخول ==================
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email, password });
  if (!user) {
    return res.json({ success: false, message: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });
  }
  res.json({ success: true, name: user.name, email: user.email });
});

// ================== نسيت كلمة السر ==================
app.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.json({ success: false, message: "غير موجود" });
  const code = Math.floor(100000 + Math.random() * 900000);
  resetCodes[email] = code;
  await resend.emails.send({
    from: "Sudan Crypto <noreply@sudancrypto.com>",
    to: email,
    subject: "Reset Password",
    html: `
<div style="
background:#0a0f2a;
padding:40px;
font-family:Cairo,sans-serif;
text-align:center;
color:white;
">

<h1 style="color:#F0B90B;">
Sudan Crypto Security
</h1>

<p style="font-size:20px;">
كود إعادة تعيين كلمة المرور
</p>

<div style="
background:#111827;
border:1px solid #F0B90B;
padding:20px;
border-radius:18px;
display:inline-block;
margin-top:20px;
">

<span style="
font-size:42px;
font-weight:bold;
letter-spacing:6px;
color:#F0B90B;
">
${code}
</span>

</div>

<p style="
margin-top:25px;
color:#aaa;
font-size:14px;
">
صلاحية الكود 10 دقائق
</p>

<p style="
color:#777;
font-size:13px;
">
إذا لم تطلب إعادة تعيين كلمة المرور تجاهل الرسالة
</p>

</div>
`
  });
  res.json({ success: true });
});

app.post("/verify-reset-code", (req, res) => {
  const { email, code } = req.body;
  if (resetCodes[email] == code) {
    resetCodes[email + "_ok"] = true;
    return res.json({ success: true });
  }
  res.json({ success: false });
});

app.post("/reset-password", async (req, res) => {
  const { email, newPassword } = req.body;
  if (!resetCodes[email + "_ok"]) return res.json({ success: false });
  await User.updateOne({ email }, { password: newPassword });
  delete resetCodes[email];
  delete resetCodes[email + "_ok"];
  res.json({ success: true });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ================== جلب بيانات المستخدم ==================
app.post("/user-data", async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.json({ success: false });
  if (user.packageName && user.packageStart && user.dailyProfit) {
    const now = new Date();
    if (!user.lastProfitDate) user.lastProfitDate = user.packageStart;
    const diffTime = now - new Date(user.lastProfitDate);
    const daysPassed = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    if (daysPassed > 0) {
      for (let i = 0; i < daysPassed; i++) {
        const profit = user.dailyProfit;
        user.incomeBalance += profit;
        await ReferralTransaction.create({
          email: user.email,
          type: "daily_profit",
          amount: profit,
          status: "approved",
          createdAt: new Date()
        });
      }
      user.lastProfitDate = new Date();
      await user.save();
    }
  }
  if (!user.refCode) {
    user.refCode = generateRefCode();
    await user.save();
  }

  const now = new Date();
  let hasActivePackage = false;
  if (user.packageStart && user.packageDurationDays) {
    const endDate = new Date(user.packageStart);
    endDate.setDate(endDate.getDate() + user.packageDurationDays);
    if (now < endDate) {
      hasActivePackage = true;
    }
  }

  res.json({
    success: true,
    name: user.name,
    email: user.email,
    phone: user.phone,
    isVerified: user.isVerified || false,
    verificationStatus: user.verificationStatus || 'none',
    balance: user.balance || 0,          // يظهر في الرئيسية
    incomeBalance: user.incomeBalance || 0, // الأرباح
    withdrawable: user.incomeBalance || 0, // 👈 ده المهم
    referralBalance: user.referralBalance || 0,
    isBlocked: user.isBlocked || false,
    isFrozen: user.isFrozen || false,
    withdrawBlocked: user.withdrawBlocked || false,
    packageName: user.packageName,
    packageStart: user.packageStart,
    packageDurationDays: user.packageDurationDays,
    dailyProfit: user.dailyProfit || 0,
    lastProfitAt: user.lastProfitDate || null,
    verificationRejectReason: user.verificationRejectReason || null,
    refCode: user.refCode,
    walletAddress: user.walletAddress,
    walletLocked: user.walletLocked,
    hasActivePackage
  });
});

// ================== إرسال كود تغيير كلمة المرور ==================
app.post("/send-change-password-code", async (req, res) => {
  try {

    const { email, oldPass } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.json({
        success: false,
        message: "المستخدم غير موجود"
      });
    }

    if (user.password !== oldPass) {
      return res.json({
        success: false,
        message: "كلمة المرور الحالية غير صحيحة"
      });
    }

    const code = Math.floor(100000 + Math.random() * 900000);

    resetCodes[email + "_change"] = code;

    await resend.emails.send({
      from: "Sudan Crypto <noreply@sudancrypto.com>",
      to: email,
      subject: "كود تغيير كلمة المرور",
      html: `
<div style="
background:#0a0f2a;
padding:40px;
font-family:Cairo,sans-serif;
text-align:center;
color:white;
">

<h1 style="color:#F0B90B;">
Sudan Crypto Security
</h1>

<p style="font-size:20px;">
كود تغيير كلمة المرور
</p>

<div style="
background:#111827;
border:1px solid #F0B90B;
padding:20px;
border-radius:18px;
display:inline-block;
margin-top:20px;
">

<span style="
font-size:42px;
font-weight:bold;
letter-spacing:6px;
color:#F0B90B;
">
${code}
</span>

</div>

<p style="
margin-top:25px;
color:#aaa;
font-size:14px;
">
صلاحية الكود 10 دقائق
</p>

<p style="
color:#777;
font-size:13px;
">
لا تشارك هذا الكود مع أي شخص
</p>

</div>
`
    });

    res.json({
      success: true
    });

  } catch (err) {
    console.log(err);

    res.json({
      success: false,
      message: "فشل إرسال الكود"
    });
  }
});


// ================== تغيير كلمة المرور بالكود ==================
app.post("/confirm-change-password", async (req, res) => {

  try {

    const { email, code, newPass } = req.body;

    if (resetCodes[email + "_change"] != code) {
      return res.json({
        success: false,
        message: "كود التحقق غير صحيح"
      });
    }

    if (!newPass || newPass.length < 8) {
      return res.json({
        success: false,
        message: "كلمة المرور ضعيفة"
      });
    }

    await User.updateOne(
      { email },
      { password: newPass }
    );

    delete resetCodes[email + "_change"];

    res.json({
      success: true,
      message: "تم تغيير كلمة المرور بنجاح"
    });

  } catch (err) {

    console.log(err);

    res.json({
      success: false,
      message: "حدث خطأ"
    });
  }
});

app.post("/set-withdraw-password", async (req, res) => {
  const { email, withdrawPassword } = req.body;
  await User.updateOne({ email }, { withdrawPassword });
  res.json({ success: true });
});

app.get("/admin-users", async (req, res) => {
  const users = await User.find({});
  res.json({ success: true, users });
});

app.get("/admin-verifications", async (req, res) => {
  try {
    const users = await User.find({ verificationStatus: "pending" });
    res.json({ success: true, requests: users });
  } catch (err) {
    res.json({ success: false });
  }
});

// 🟢 موافقة التوثيق
app.post("/admin-verify", async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.json({ success: false, message: "المستخدم غير موجود" });
    }

    user.isVerified = true;
    user.verificationStatus = "verified";
    await user.save();

    res.json({ success: true });

  } catch (err) {
    console.log(err);
    res.json({ success: false });
  }
});

// 🔴 رفض التوثيق
app.post("/admin-reject-verification", async (req, res) => {
  try {
    const { email, reason } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.json({ success: false });
    }

    user.verificationStatus = "rejected";
    user.verificationRejectReason = reason || "تم الرفض";
    await user.save();

    res.json({ success: true });

  } catch (err) {
    console.log(err);
    res.json({ success: false });
  }
});

app.get("/admin-deposits", async (req, res) => {
  try {
    const deposits = await Deposit.find().sort({ createdAt: -1 });
    res.json({ success: true, deposits });
  } catch (err) {
    res.json({ success: false });
  }
});

app.post("/admin-add-balance", async (req, res) => {
  const { email, amount } = req.body;
  await User.updateOne({ email }, { $inc: { balance: Number(amount) } });
  res.json({ success: true });
});

// ➖ خصم رصيد
app.post("/admin-sub-balance", async (req, res) => {

  const { email, amount } = req.body;

  await User.updateOne(
    { email },
    { $inc: { balance: -Number(amount) } }
  );

  res.json({ success: true });

});


// 📦 إضافة باقة
app.post("/admin-add-package", async (req, res) => {

  const {
    email,
    packageName,
    dailyProfit,
    durationDays
  } = req.body;

  await User.updateOne(
    { email },
    {
      packageName,
      dailyProfit,
      packageDurationDays: durationDays,
      packageStart: new Date(),
      lastProfitDate: new Date()
    }
  );

  res.json({ success: true });

});


// ❄️ تجميد حساب
app.post("/admin-freeze", async (req, res) => {

  const { email } = req.body;

  const user = await User.findOne({ email });

  if (!user) {
    return res.json({ success: false });
  }

  user.isFrozen = !user.isFrozen;

  await user.save();

  res.json({
    success: true,
    frozen: user.isFrozen
  });

});


// 🚫 حظر حساب
app.post("/admin-block", async (req, res) => {

  const { email } = req.body;

  const user = await User.findOne({ email });

  if (!user) {
    return res.json({ success: false });
  }

  user.isBlocked = !user.isBlocked;

  await user.save();

  res.json({
    success: true,
    blocked: user.isBlocked
  });

});


// 🗑️ حذف مستخدم
app.post("/admin-delete", async (req, res) => {

  const { email } = req.body;

  await User.deleteOne({ email });

  res.json({ success: true });

});

app.post("/admin-reject-deposit", async (req, res) => {
  const { id } = req.body;
  const deposit = await Deposit.findById(id);
  if (!deposit) return res.json({ success: false });
  deposit.status = "rejected";
  await deposit.save();
  res.json({ success: true });
});

app.post("/admin-approve-deposit", async (req, res) => {
  const { id } = req.body;
  const deposit = await Deposit.findById(id);
  if (!deposit) return res.json({ success: false });
  if (deposit.status === "approved") return res.json({ success: false });
  deposit.status = "approved";
  await deposit.save();
  const user = await User.findOne({ email: deposit.email });
  if (!user) return res.json({ success: false });
  user.balance = Number(deposit.amount);
  user.investedAmount += Number(deposit.amount);
  await user.save();

  const packages = {
    "bronze": { name: "البرونزية", price: 50, daily: 2, duration: 280 },
    "silver": { name: "الفضية", price: 100, daily: 6, duration: 280 },
    "gold": { name: "الذهبية", price: 250, daily: 10, duration: 280 },
    "platinum": { name: "البلاتينية", price: 500, daily: 15, duration: 280 },
    "diamond": { name: "الماسية", price: 1000, daily: 20, duration: 280 }
  };

  const pkg = packages[deposit.packageName];
  if (pkg) {
    user.packageName = pkg.name;
    user.dailyProfit = pkg.daily;
    user.packageDurationDays = pkg.duration;
    user.packageStart = new Date();
    user.incomeBalance += pkg.daily;
    user.lastProfitDate = new Date();
    await ReferralTransaction.create({
      email: user.email,
      type: "daily_profit",
      amount: pkg.daily,
      status: "approved",
      createdAt: new Date()
    });
    await user.save();
  }
  res.json({ success: true });
});

app.post("/withdraw-request", async (req, res) => {
  const { email, amount, wallet, password } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.json({ success: false });
  const existing = await Withdraw.findOne({ email, status: "pending" });
  if (existing) return res.json({ success: false, message: "لديك طلب سحب قيد المعالجة حالياً" });
  if (user.password !== password) return res.json({ success: false, message: "كلمة المرور غير صحيحة" });
  if (user.incomeBalance < amount) return res.json({ success: false, message: "رصيد الأرباح غير كافٍ" });

  user.incomeBalance -= amount;
  await user.save();

  await Withdraw.create({ email, amount, wallet });
  res.json({ success: true });
});

app.get("/admin-withdraws", async (req, res) => {
  const withdraws = await Withdraw.find().sort({ createdAt: -1 });
  res.json({ success: true, withdraws });
});

app.post("/admin-approve-withdraw", async (req, res) => {
  const { id } = req.body;
  await Withdraw.findByIdAndUpdate(id, { status: "approved" });
  res.json({ success: true });
});

app.post("/admin-reject-withdraw", async (req, res) => {
  const { id } = req.body;
  const w = await Withdraw.findById(id);
  if (w && w.status === "pending") {
    await User.updateOne({ email: w.email }, { $inc: { incomeBalance: w.amount } });
    w.status = "rejected";
    await w.save();
  }
  res.json({ success: true });
});

app.post("/admin-update-user", async (req, res) => {
  const { email, balance, incomeBalance, isBlocked, isFrozen, withdrawBlocked } = req.body;
  await User.updateOne({ email }, {
    balance: Number(balance),
    incomeBalance: Number(incomeBalance),
    isBlocked: isBlocked === "true" || isBlocked === true,
    isFrozen: isFrozen === "true" || isFrozen === true,
    withdrawBlocked: withdrawBlocked === "true" || withdrawBlocked === true
  });
  res.json({ success: true });
});

app.post("/lock-wallet", async (req, res) => {
  const { email, walletAddress } = req.body;
  const user = await User.findOne({ email });
  if (user.walletLocked) return res.json({ success: false, message: "المحفظة مقفلة بالفعل" });
  user.walletAddress = walletAddress;
  user.walletLocked = true;
  await user.save();
  res.json({ success: true });
});

app.post("/submit-verification", upload.array("images", 2), async (req, res) => {
  try {
    const { email, fullName, docType, docNumber } = req.body;
    const files = req.files;

    if (!files || files.length < 2) {
      return res.json({ success: false, message: "يرجى رفع صورتين للهوية" });
    }

    const imageUrls = files.map(f => "/uploads/" + f.filename);

    await User.updateOne({ email }, {
      verificationFullName: fullName,
      verificationDocType: docType,
      verificationDocNumber: docNumber,
      verificationImages: imageUrls,
      verificationStatus: "pending"
    });

    res.json({ success: true });

  } catch (err) {
    console.log(err);
    res.json({ success: false, message: "حدث خطأ أثناء الرفع" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

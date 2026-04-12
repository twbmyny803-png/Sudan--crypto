const express = require("express");
const cors = require("cors");
const path = require("path");
const { Resend } = require("resend");
const mongoose = require("mongoose");
const fs = require("fs");
const multer = require("multer");
const crypto = require("crypto");
const axios = require("axios");

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
  verificationStatus: { type: String, default: 'none' },

  isBlocked: { type: Boolean, default: false },
  isFrozen: { type: Boolean, default: false },

  withdrawBlocked: { type: Boolean, default: false },
  withdrawPassword: { type: String, default: null },

  packageName: String,
  packageStart: Date,
  packageDurationDays: Number,
  dailyProfit: Number,

  verificationFullName: String,
  verificationDocType: String,
  verificationDocNumber: String,
  verificationImages: [String],
  verificationRejectReason: { type: String, default: null }
});

const User = mongoose.model("User", userSchema);

// 🧩 4. عدل Schema (أضف name)
const depositSchema = new mongoose.Schema({
  email: String,
  name: String,
  amount: Number,
  txid: String,
  image: String,
  orderId: String,

  packageName: String, // 🔥 تضيف دي
  network: String,     // 🔥 تضيف دي

  status: { type: String, default: "pending" },
  createdAt: { type: Date, default: Date.now }
});

const Deposit = mongoose.model("Deposit", depositSchema);

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

// ملفات الموقع (تأكد أن ملفات الأدمن داخل مجلد public)
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
    verificationStatus: user.verificationStatus || 'none',
    balance: user.balance || 0,
    incomeBalance: user.incomeBalance || 0,
    isBlocked: user.isBlocked || false,
    isFrozen: user.isFrozen || false,
    withdrawBlocked: user.withdrawBlocked || false,
    packageName: user.packageName || null,
    verificationRejectReason: user.verificationRejectReason || null
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
// 👤 الأدمن - المستخدمين
// ============================================
app.get("/admin-users", async (req, res) => {
  const users = await User.find({});
  res.json({ success: true, users });
});

// ✅ توثيق
app.post("/admin-verify", async (req, res) => {
  const { email } = req.body;
  await User.updateOne({ email }, { isVerified: true, verificationStatus: "verified" });
  res.json({ success: true });
});

// 📄 عرض التوثيق
app.get("/admin-verifications", async (req, res) => {
  const users = await User.find({
    verificationStatus: "pending"
  });

  res.json({ success: true, requests: users }); // 🔥 بدل users → requests
});

// ❌ رفض التوثيق
app.post("/admin-reject-verification", async (req, res) => {
  const { email, reason } = req.body;

  await User.updateOne(
    { email },
    {
      verificationStatus: "rejected",
      isVerified: false,
      verificationRejectReason: reason || "تم رفض التوثيق"
    }
  );

  res.json({ success: true });
});

// ❄️ تجميد
app.post("/admin-freeze", async (req, res) => {
  const { email } = req.body;
  await User.updateOne({ email }, { isFrozen: true });
  res.json({ success: true });
});

// 🚫 حظر
app.post("/admin-block", async (req, res) => {
  const { email } = req.body;
  await User.updateOne({ email }, { isBlocked: true });
  res.json({ success: true });
});

// 🔓 فك الحظر
app.post("/admin-unblock", async (req, res) => {
  const { email } = req.body;
  await User.updateOne({ email }, { isBlocked: false, isFrozen: false });
  res.json({ success: true });
});

// ❌ حذف مستخدم
app.post("/admin-delete", async (req, res) => {
  const { email } = req.body;
  await User.deleteOne({ email });
  res.json({ success: true });
});

// ➕ إضافة رصيد
app.post("/admin-add-balance", async (req, res) => {
  const { email, amount } = req.body;

  await User.updateOne(
    { email },
    { $inc: { balance: Number(amount) } }
  );

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

// 🔒 منع السحب
app.post("/admin-block-withdraw", async (req, res) => {
  const { email } = req.body;
  await User.updateOne({ email }, { withdrawBlocked: true });
  res.json({ success: true });
});

// 📦 إضافة باقة
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

// 🧩 1. عدل /deposit-request (تحديث أمني)
app.post("/deposit-request", async (req, res) => {
  const { email, amount, txid, image, orderId } = req.body;

  if (!email || !txid) {
    return res.json({ success: false, message: "بيانات ناقصة" });
  }

  try {
    const exists = await Deposit.findOne({ txid });
    if (exists) {
      return res.json({ success: false, message: "TXID مستخدم" });
    }

    // ❌ احذف دا مؤقتاً
    // const user = await User.findOne({ email });
    // if (!user) {
    //   return res.json({ success: false, message: "مستخدم غير موجود" });
    // }

    const deposit = new Deposit({
      email,
      name: "test", // مؤقت
      amount: Number(amount) || 0,
      txid,
      image: image || null,
      orderId,

      packageName: req.body.packageName || null, // 🔥 تضيف دي
      network: req.body.network || null          // 🔥 تضيف دي
    });

    await deposit.save();

    res.json({ success: true });

  } catch (err) {
    console.log(err);
    res.json({ success: false });
  }
});

// 📸 رفع إثبات الإيداع (تم التحديث)
app.post("/upload-proof", upload.single("file"), (req, res) => {
  try {
    const { email, txid, orderId } = req.body;

    console.log("🔥 deposit received:", email, txid); // مهم للتأكد

    if (!req.file) {
      return res.json({ success: false, message: "ما في صورة" });
    }

    const imagePath = "/uploads/" + req.file.filename;

        res.json({
      success: true,
      imageUrl: imagePath
    });

  } catch (err) {
    console.log(err);
    res.json({ success: false });
  }
});

// 🧩 3. استبدل /admin-deposits
app.get("/admin-deposits", async (req, res) => {
  const deposits = await Deposit.find().sort({ createdAt: -1 });
  res.json({ success: true, deposits });
});

// 🧩 4. استبدل قبول الإيداع
app.post("/admin-approve-deposit", async (req, res) => {
  const { id } = req.body;

  const deposit = await Deposit.findById(id);
  if (!deposit) return res.json({ success: false });

  if (deposit.status !== "pending") {
    return res.json({ success: false });
  }

  const user = await User.findOne({ email: deposit.email });
  if (!user) return res.json({ success: false });

  user.balance += Number(deposit.amount);
  await user.save();

  deposit.status = "approved";
  await deposit.save();

  res.json({ success: true });
});

// ❌ رفض الإيداع
app.post("/admin-reject-deposit", async (req, res) => {
  const { id } = req.body;

  const deposit = await Deposit.findById(id);
  if (!deposit) return res.json({ success: false });

  deposit.status = "rejected";
  await deposit.save();

  res.json({ success: true });
});

// 💸 السحب
app.post("/withdraw-request", async (req, res) => {
  const { email, amount } = req.body;

  const user = await User.findOne({ email });

  if (!user) return res.json({ success: false });

  if (user.withdrawBlocked) {
    return res.json({ success: false, message: "السحب موقوف" });
  }

  if (amount > user.balance) {
    return res.json({ success: false, message: "رصيد غير كافي" });
  }

  withdrawRequests.push({
    id: Date.now(),
    email,
    amount,
    status: "pending"
  });

  res.json({ success: true });
});

// عرض السحب
app.get("/admin-withdraws", (req, res) => {
  res.json({ success: true, requests: withdrawRequests });
});

// قبول السحب
app.post("/admin-approve-withdraw", async (req, res) => {
  const { id } = req.body;
  const request = withdrawRequests.find(r => r.id == id);
  if (!request) return res.json({ success: false });

  const user = await User.findOne({ email: request.email });
  if (!user) return res.json({ success: false });

  user.balance -= Number(request.amount);
  await user.save();

  request.status = "approved";
  res.json({ success: true });
});

// رفض السحب
app.post("/admin-reject-withdraw", (req, res) => {
  const { id } = req.body;
  const request = withdrawRequests.find(r => r.id == id);
  if (!request) return res.json({ success: false });

  request.status = "rejected";
  res.json({ success: true });
});

// ================== رفع التوثيق ==================
app.post("/submit-verification", upload.array("images"), async (req, res) => {
  try {
    const { email, fullName, docType, docNumber } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.json({ success: false, message: "المستخدم غير موجود" });
    }

    // ❌ منع التكرار
    if (user.verificationStatus === "pending") {
      return res.json({ success: false, message: "طلبك قيد المراجعة" });
    }

    if (user.verificationStatus === "verified") {
      return res.json({ success: false, message: "حسابك موثق بالفعل" });
    }

    if (!req.files || req.files.length === 0) {
      return res.json({ success: false, message: "ارفع الصور" });
    }

    const images = req.files.map(file => "/uploads/" + file.filename);

    await User.updateOne(
      { email },
      {
        verificationFullName: fullName,
        verificationDocType: docType,
        verificationDocNumber: docNumber,
        verificationImages: images,
        verificationStatus: "pending",
        verificationRejectReason: null // 🔥 يمسح السبب القديم
      }
    );

    res.json({ success: true });

  } catch (err) {
    console.log(err);
    res.json({ success: false });
  }
});

// ================== NowPayments Webhook ==================
app.post("/nowpayments-webhook", async (req, res) => {
  try {
    const ipnSecret = "vbk9TcEg/bvftZWi+O6H2m+DWCBKtosc";

    const hmac = crypto.createHmac("sha512", ipnSecret);
    hmac.update(JSON.stringify(req.body));
    const signature = hmac.digest("hex");

    if (signature !== req.headers["x-nowpayments-sig"]) {
      console.log("❌ Invalid signature");
      return res.status(400).send("Invalid signature");
    }

    const payment = req.body;

    console.log("🔥 Payment received:", payment);

    // بس لما الدفع يكتمل
    if (payment.payment_status === "finished") {

      const deposit = new Deposit({
        email: payment.order_description || "unknown",
        name: "auto",
        amount: payment.price_amount,
        txid: payment.payin_hash,
        image: null,
        orderId: payment.order_id,
        packageName: "auto",
        network: payment.pay_currency
      });

      await deposit.save();

      console.log("✅ Saved to DB");
    }

    res.sendStatus(200);

  } catch (err) {
    console.log("❌ webhook error:", err);
    res.sendStatus(500);
  }
});

// ================== CREATE PAYMENT ==================
app.post("/create-payment", async (req, res) => {
  const { amount } = req.body;

  try {
    const response = await fetch("https://api.nowpayments.io/v1/invoice", {
      method: "POST",
      headers: {
        "x-api-key": "ZYE715R-H144D4D-QB66MAZ-XK8YVGP",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        price_amount: Number(amount) || 10,
        price_currency: "usd",
        pay_currency: "usdttrc20",
        order_id: Date.now().toString(),
        order_description: "Deposit"
      })
    });

    const data = await response.json();

    if (!data.invoice_url) {
      console.log("خطأ:", data);
      return res.json({ success: false });
    }

    res.json({
      success: true,
      invoice_url: data.invoice_url
    });

  } catch (err) {
    console.log(err);
    res.json({ success: false });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

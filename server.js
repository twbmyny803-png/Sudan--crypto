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
  incomeBalance: { type: Number, default: 0 },

  isVerified: { type: Boolean, default: false },
  verificationStatus: { type: String, default: 'none' },

  isBlocked: { type: Boolean, default: false },
  isFrozen: { type: Boolean, default: false },

  withdrawBlocked: { type: Boolean, default: false },
  withdrawPassword: { type: String, default: null },

  // 📌 حقول عنوان السحب الجديد
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
  orderId: String,

  packageName: String, // 🔥 تضيف دي
  network: String,     // 🔥 تضيف دي

  status: { type: String, default: "pending" },
  createdAt: { type: Date, default: Date.now }
});

const Deposit = mongoose.model("Deposit", depositSchema);

const referralTransactionSchema = new mongoose.Schema({
  email: String,        // الشخص المستلم العمولة

  amount: Number,
  type: {
    type: String,
    required: true
  },         // نوع العملية (transfer, referral)
  status: String,        // حالة العملية (approved, pending, rejected)
  level: Number,
  createdAt: { type: Date, default: Date.now }
});

const ReferralTransaction = mongoose.model("ReferralTransaction", referralTransactionSchema);

const withdrawSchema = new mongoose.Schema({
  email: String,
  amount: Number,
  wallet: String,
  status: { type: String, default: "pending" }, // pending / approved / rejected
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

// ملفات الموقع (تأكد أن ملفات الأدمن داخل مجلد public)
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
    // تعديل: رسالة خطأ أكثر احترافية
    return res.json({ success: false, message: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });
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

  // 🔁 تحديث الأرباح عند الدخول (مهم)
  if (user.packageName && user.packageStart && user.dailyProfit) {

    const now = new Date();

    if (!user.lastProfitDate) {
      user.lastProfitDate = user.packageStart;
    }

    const diffTime = now - new Date(user.lastProfitDate);
    const daysPassed = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (daysPassed > 0) {

      for (let i = 0; i < daysPassed; i++) {

        const profit = user.dailyProfit;

        // 👇 ينزل في الأرباح
        user.incomeBalance += profit;

        // 👇 يسجل في العمليات
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
    packageName: user.packageName,
    packageStart: user.packageStart,
    packageDurationDays: user.packageDurationDays,
    verificationRejectReason: user.verificationRejectReason || null,
    refCode: user.refCode,
    walletAddress: user.walletAddress,
    walletLocked: user.walletLocked
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

// 📄 عرض طلبات التوثيق
app.get("/admin-verifications", async (req, res) => {
  try {
    const users = await User.find({
      verificationStatus: "pending"
    });

    res.json({
      success: true,
      requests: users
    });

  } catch (err) {
    res.json({ success: false });
  }
});

// 📥 عرض الإيداعات للأدمن
app.get("/admin-deposits", async (req, res) => {
  try {
    const deposits = await Deposit.find().sort({ createdAt: -1 });

    res.json({
      success: true,
      deposits
    });

  } catch (err) {
    res.json({ success: false });
  }
});

// ✅ توثيق
app.post("/admin-verify", async (req, res) => {
  const { email } = req.body;
  await User.updateOne({ email }, { isVerified: true, verificationStatus: "verified" });
  res.json({ success: true });
});

// ❌ رفض التوثيق
app.post("/admin-reject-verification", async (req, res) => {
  const { email, reason } = req.body;
  await User.updateOne({ email }, { verificationStatus: "rejected", verificationRejectReason: reason });
  res.json({ success: true });
});

// 🚫 حظر
app.post("/admin-block", async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  user.isBlocked = !user.isBlocked;
  await user.save();
  res.json({ success: true });
});

// 🗑 حذف
app.post("/admin-delete", async (req, res) => {
  const { email } = req.body;
  await User.deleteOne({ email });
  res.json({ success: true });
});

// 🔥 تحديث عنوان المحفظة (للأدمن فقط)
app.post("/admin-update-wallet", async (req, res) => {
  const { email, newWallet } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.json({ success: false, message: "المستخدم غير موجود" });
    }

    // تحقق العنوان
    if (!newWallet || !newWallet.startsWith("T") || newWallet.length < 30) {
      return res.json({ success: false, message: "عنوان غير صحيح" });
    }

    // 🔥 تحديث العنوان في حساب المستخدم
    user.walletAddress = newWallet;
    user.walletLocked = true;
    await user.save();

    // 🔥 تحديث الطلبات الحالية (المعلقة)
    await Withdraw.updateMany(
      { email: email, status: "pending" },
      { wallet: newWallet }
    );

    res.json({ success: true });

  } catch (err) {
    res.json({ success: false });
  }
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

// ❌ رفض الإيداع
app.post("/admin-reject-deposit", async (req, res) => {
  const { id } = req.body;

  const deposit = await Deposit.findById(id);
  if (!deposit) return res.json({ success: false });

  deposit.status = "rejected";
  await deposit.save();

  res.json({ success: true });
});

// ✅ قبول الإيداع
app.post("/admin-approve-deposit", async (req, res) => {
  const { id } = req.body;

  const deposit = await Deposit.findById(id);
  if (!deposit) return res.json({ success: false });

  // منع التكرار
  if (deposit.status === "approved") {
    return res.json({ success: false });
  }

  // تغيير الحالة
  deposit.status = "approved";
  await deposit.save();

  // إضافة الرصيد
  const user = await User.findOne({ email: deposit.email });
  if (!user) return res.json({ success: false });

  user.balance += Number(deposit.amount);
  await user.save();

  // 🎯 تحديد الباقات
  const packages = {
    "50": { name: "البرونزية", daily: 2, duration: 280 },
    "100": { name: "الفضية", daily: 6, duration: 280 },
    "250": { name: "الذهبية", daily: 10, duration: 280 },
    "500": { name: "البلاتينية", daily: 15, duration: 280 },
    "1000": { name: "الماسية", daily: 20, duration: 280 }
  };

  // 📦 اختيار الباقة حسب المبلغ
  const pkg = packages[String(deposit.amount)];

  if (pkg) {
    user.packageName = pkg.name;
    user.dailyProfit = pkg.daily;
    user.packageDurationDays = pkg.duration;
    user.packageStart = new Date();

    user.incomeBalance += pkg.daily; // 🔥 ربح أول يوم فوراً
    user.lastProfitDate = new Date();

    await ReferralTransaction.create({
      email: user.email,
      type: "daily_profit",
      amount: pkg.daily,
      status: "approved",
      createdAt: new Date()
    });

    await user.save(); // مهم جداً
  }

  res.json({ success: true });
});

// 💸 السحب
app.post("/withdraw-request", async (req, res) => {
  const { email, amount, wallet, password } = req.body;

  const user = await User.findOne({ email });
  if (!user) return res.json({ success: false });

  // 🚫 منع تكرار طلب السحب
  const existing = await Withdraw.findOne({
    email: email,
    status: "pending"
  });

  if (existing) {
    return res.json({
      success: false,
      message: "لديك طلب سحب قيد المعالجة حالياً"
    });
  }

  // 🔐 تحقق كلمة المرور (نفس كلمة الحساب)
  if (user.password !== password) {
    return res.json({ success: false, message: "كلمة المرور غير صحيحة" });
  }

  // 📌 تثبيت العنوان أول مرة
  if (!user.walletLocked) {
    user.walletAddress = wallet;
    user.walletLocked = true;
    await user.save();
  } else {
    // ❌ لو حاول يغير العنوان
    if (wallet !== user.walletAddress) {
      return res.json({
        success: false,
        message: "لا يمكن تغيير عنوان السحب بعد تعيينه"
      });
    }
  }

  if (user.withdrawBlocked) {
    return res.json({ success: false, message: "السحب موقوف لحسابك، تواصل مع الدعم" });
  }

  if (amount < 10) {
    return res.json({ success: false, message: "الحد الأدنى للسحب 10 USDT" });
  }

  if (amount > user.balance) {
    return res.json({ success: false, message: "رصيد غير كافي" });
  }

  // 💸 الرسوم + الخصم
  const finalAmount = amount - 1;

  // 🔥 خصم مباشر من رصيد المستخدم (نخصم المبلغ الكلي)
  user.balance -= Number(amount);
  await user.save();

  // ✍️ التخزين (نخزن المبلغ بعد خصم الرسوم)
  await Withdraw.create({
    email,
    amount: finalAmount,
    wallet,
    status: "pending"
  });

  res.json({
    success: true,
    message: "تم تقديم طلب السحب بنجاح. تستغرق المعالجة من 1 دقيقة إلى 24 ساعة. في حال تأخر الطلب لأكثر من 24 ساعة، يرجى التواصل مع خدمة العملاء."
  });
});

// عرض السحب
app.get("/admin-withdraws", async (req, res) => {
  try {
    const data = await Withdraw.find().sort({ createdAt: -1 });
    res.json({ success: true, requests: data });
  } catch (err) {
    res.json({ success: false });
  }
});

// قبول السحب
app.post("/admin-approve-withdraw", async (req, res) => {
  const { id } = req.body;

  const request = await Withdraw.findById(id);
  if (!request) return res.json({ success: false });

  request.status = "approved";
  await request.save();

  res.json({ success: true });
});

// رفض السحب
app.post("/admin-reject-withdraw", async (req, res) => {
  const { id } = req.body;

  const request = await Withdraw.findById(id);
  if (!request) return res.json({ success: false });

  const user = await User.findOne({ email: request.email });

  // 🔥 رجع الفلوس (نرجع المبلغ الأصلي قبل الرسوم)
  user.balance += (request.amount + 1);
  await user.save();

  request.status = "rejected";
  await request.save();

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

    const parsed = JSON.parse(payment.order_description);

    // 🔥 أنشئ العملية لو ما موجودة
    let deposit = await Deposit.findOne({ orderId: payment.order_id });

    if (!deposit) {
      deposit = new Deposit({
        email: parsed.email,
        name: "auto",
        amount: payment.price_amount,
        txid: payment.payin_hash,
        image: null,
        orderId: payment.order_id,
        packageName: parsed.packageName,
        network: payment.pay_currency,
        status: "pending"
      });

      await deposit.save();
    }

    // 🔥 تحديث الحالة
    deposit.status = payment.payment_status === "finished" ? "approved" : "pending";
    await deposit.save();

    if (payment.payment_status === "finished" || payment.payment_status === "confirmed") {
      const parsed = JSON.parse(payment.order_description);

      const user = await User.findOne({ email: parsed.email });

      if (!user) return res.sendStatus(200);

      const percentages = [0.10, 0.08, 0.06, 0.04, 0.02];

      let currentRef = user.refBy;

      for (let i = 0; i < 5; i++) {
        if (!currentRef) break;

        const refUser = await User.findOne({ refCode: currentRef });

        if (!refUser) break;

        const profit = payment.price_amount * percentages[i];

        refUser.incomeBalance += profit;
        await refUser.save();

        await ReferralTransaction.create({
          email: refUser.email,
    
          amount: profit,
          type: "referral",
          status: "approved",
          level: i + 1,
          createdAt: new Date()
        });

        // نطلع للمستوى الأعلى
        currentRef = refUser.refBy;
      }

      // 🔥 إضافة الرصيد
      user.balance += Number(payment.price_amount);
      await user.save();

      const packages = {
        "bronze": { name: "البرونزية", daily: 2, duration: 280 },
        "silver": { name: "الفضية", daily: 6, duration: 280 },
        "gold": { name: "الذهبية", daily: 10, duration: 280 },
        "platinum": { name: "البلاتينية", daily: 15, duration: 280 },
        "diamond": { name: "الماسية", daily: 20, duration: 280 }
      };

      const pkg = packages[String(parsed.packageName)];

      if (pkg) {
        user.packageName = pkg.name;
        user.dailyProfit = pkg.daily;
        user.packageDurationDays = pkg.duration;
        user.packageStart = new Date();

        user.incomeBalance += pkg.daily; // 🔥 ربح أول يوم فوراً
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

      console.log("🔥 تم التفعيل");
    }

    res.sendStatus(200);

  } catch (err) {
    console.log("❌ Webhook error:", err);
    res.sendStatus(500);
  }
});

// ================== CREATE PAYMENT ==================
app.post("/create-payment", async (req, res) => {
  const { amount, email, packageName } = req.body;

  try {
    const orderId = Date.now().toString();

    const response = await fetch("https://api.nowpayments.io/v1/invoice", {
      method: "POST",
      headers: {
        "x-api-key": "ZYE715R-H144D4D-QB66MAZ-XK8YVGP",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        price_amount: Number(amount),
        price_currency: "usd",
        pay_currency: "usdttrc20",
        order_id: orderId,

        order_description: JSON.stringify({
          email: email,
          packageName: packageName
        })
      })
    });

    const data = await response.json();

    // 🔥 أهم خطوة (تسجيل العملية فوراً)
    const deposit = new Deposit({
      email,
      name: "auto",
      amount: Number(amount),
      txid: null,
      image: null,
      orderId: orderId,
      packageName: packageName,
      network: "USDT",
      status: "pending"
    });

    await deposit.save();

    res.json({
      success: true,
      invoice_url: data.invoice_url
    });

  } catch (err) {
    console.log(err);
    res.json({ success: false });
  }
});

// ⏱ نظام انتهاء الوقت (تحويل العمليات المعلقة القديمة إلى expired)
setInterval(async () => {
  try {
    const expiredTime = new Date(Date.now() - 20 * 60 * 1000);
    await Deposit.updateMany(
      {
        status: "pending",
        createdAt: { $lt: expiredTime }
      },
      { status: "expired" }
    );
  } catch (err) {
    console.log("Expiration check error:", err);
  }
}, 60000);

app.get("/transactions/:email", async (req, res) => {
  const email = req.params.email;

  try {
    const deposits = await Deposit.find({ email });
    
    const withdraws = await Withdraw.find({ email });

    const referrals = await ReferralTransaction.find({
      email,
      type: { $in: ["referral", "transfer", "daily_profit"] }
    }).lean();

    const referralFormatted = referrals.map(r => ({
      type: r.type || "referral",
      amount: r.amount,
      status: r.status || "approved",
      date: r.createdAt,
      level: r.level || 0
    }));

    // ندمجهم
    const all = [
      ...deposits.map(d => ({
        type: "deposit",
        amount: d.amount,
        status: d.status,
        date: d.createdAt,
        txid: d.txid,
        network: d.network
      })),
      ...withdraws.map(w => ({
        type: "withdraw",
        amount: w.amount,
        status: w.status,
        date: w.createdAt
      })),
      ...referralFormatted
    ];

    // ترتيب حسب الأحدث
    all.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({ success: true, data: all });

  } catch (err) {
    res.json({ success: false });
  }
});

// ================== الإحالات ==================
app.get("/referrals/:email", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.params.email });
    if (!user) return res.json({ success: false });

    // 🧠 نجيب كل المستويات
    const level1 = await User.find({ refBy: user.refCode });
    const level2 = await User.find({ refBy: { $in: level1.map(u => u.refCode) } });
    const level3 = await User.find({ refBy: { $in: level2.map(u => u.refCode) } });
    const level4 = await User.find({ refBy: { $in: level3.map(u => u.refCode) } });
    const level5 = await User.find({ refBy: { $in: level4.map(u => u.refCode) } });

    res.json({
      success: true,
      refCode: user.refCode,
      income: user.incomeBalance,
      levels: {
        level1,
        level2,
        level3,
        level4,
        level5
      }
    });

  } catch (err) {
    res.json({ success: false });
  }
});

app.post("/transfer-profit", async (req, res) => {
  const { email } = req.body;

  const user = await User.findOne({ email });
  if (!user) return res.json({ success: false });

  // ❌ ما في أرباح
  if (user.incomeBalance <= 0) {
    return res.json({
      success: false,
      message: "لا توجد أرباح للتحويل"
    });
  }

  const amount = user.incomeBalance;

  // 🔥 التحويل
  user.balance += amount;
  user.incomeBalance = 0;

  await user.save();

  // 🔥 تسجيل العملية
  await ReferralTransaction.create({
    email: user.email,
    type: "transfer",
    amount: amount,
    status: "approved",
    createdAt: new Date()
  });

  res.json({
    success: true,
    amount: amount
  });
});

// 🔁 نظام الأرباح اليومية
setInterval(async () => {
  try {

    const users = await User.find({
      packageName: { $ne: null }
    });

    const now = new Date();

    for (let user of users) {

      if (!user.packageStart || !user.dailyProfit) continue;

      // ⛔ انتهاء الباقة
      const daysPassed = Math.floor((now - user.packageStart) / (1000 * 60 * 60 * 24));
      if (daysPassed >= user.packageDurationDays) continue;

      // 🔥 أول مرة
      if (!user.lastProfitDate) {
        user.lastProfitDate = user.packageStart;
      }

      const hoursPassed = (now - new Date(user.lastProfitDate)) / (1000 * 60 * 60);

      // ⛔ ما مر 24 ساعة
      if (hoursPassed < 24) continue;

      const profit = user.dailyProfit;

      // ✅ نضيف للأرباح (مش الرصيد)
      user.incomeBalance += profit;

      // تحديث الوقت
      user.lastProfitDate = new Date();

      await user.save();

      // تسجيل العملية
      await ReferralTransaction.create({
        email: user.email,
        type: "daily_profit",
        amount: profit,
        status: "approved",
        createdAt: new Date()
      });

    }

  } catch (err) {
    console.log("Daily profit error:", err);
  }
}, 60000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

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
    html: `<h1>${code}</h1>`
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
    balance: user.balance || 0,
    incomeBalance: user.incomeBalance || 0,
    referralBalance: user.referralBalance || 0,
    isBlocked: user.isBlocked || false,
    isFrozen: user.isFrozen || false,
    withdrawBlocked: user.withdrawBlocked || false,
    packageName: user.packageName,
    packageStart: user.packageStart,
    packageDurationDays: user.packageDurationDays,
    verificationRejectReason: user.verificationRejectReason || null,
    refCode: user.refCode,
    walletAddress: user.walletAddress,
    walletLocked: user.walletLocked,
    hasActivePackage
  });
});

app.post("/change-password", async (req, res) => {
  const { email, oldPass, newPass } = req.body;
  const user = await User.findOne({ email, password: oldPass });
  if (!user) return res.json({ success: false, message: "كلمة المرور الحالية غير صحيحة" });
  await User.updateOne({ email }, { password: newPass });
  res.json({ success: true });
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

app.post("/admin-update-balance", async (req, res) => {
  const { email, balance, incomeBalance } = req.body;
  await User.updateOne({ email }, { balance, incomeBalance });
  res.json({ success: true });
});

app.post("/admin-block-user", async (req, res) => {
  const { email, isBlocked } = req.body;
  await User.updateOne({ email }, { isBlocked });
  res.json({ success: true });
});

app.post("/admin-freeze-user", async (req, res) => {
  const { email, isFrozen } = req.body;
  await User.updateOne({ email }, { isFrozen });
  res.json({ success: true });
});

app.post("/admin-withdraw-block", async (req, res) => {
  const { email, withdrawBlocked } = req.body;
  await User.updateOne({ email }, { withdrawBlocked });
  res.json({ success: true });
});

app.get("/admin-deposits", async (req, res) => {
  const deposits = await Deposit.find({ status: "pending" });
  res.json({ success: true, deposits });
});

// ✅ تعديل Approve Deposit (الحل الصحيح بدون خلط)
app.post("/approve-deposit", async (req, res) => {
  const { depositId } = req.body;
  const deposit = await Deposit.findById(depositId);
  if (!deposit) return res.json({ success: false });

  const user = await User.findOne({ email: deposit.email });
  if (!user) return res.json({ success: false });

  deposit.status = "approved";
  await deposit.save();

  // تفعيل الباقة للمستخدم
  user.packageName = deposit.packageName;
  user.packageStart = new Date();
  user.lastProfitDate = new Date();
  
  // إعدادات الباقات (يمكنك تعديلها حسب الحاجة)
  if (deposit.packageName === "bronze") {
    user.packageDurationDays = 30;
    user.dailyProfit = deposit.amount * 0.05;
  } else if (deposit.packageName === "silver") {
    user.packageDurationDays = 30;
    user.dailyProfit = deposit.amount * 0.07;
  } else if (deposit.packageName === "gold") {
    user.packageDurationDays = 30;
    user.dailyProfit = deposit.amount * 0.10;
  }

  await user.save();

  // 🔥 توزيع أرباح الإحالات (5 مستويات) - الحل الصحيح
  const refPercents = [0.1, 0.05, 0.03, 0.02, 0.01];
  let currentRef = user.refBy;

  for (let i = 0; i < refPercents.length; i++) {
    if (!currentRef) break;

    const refUser = await User.findOne({ refCode: currentRef });
    if (!refUser) break;

    const bonus = Number(deposit.amount) * refPercents[i];

    // ✅ تنزل في أرباح الإحالات (NOT balance)
    refUser.incomeBalance += bonus;
    await refUser.save();

    await ReferralTransaction.create({
      email: refUser.email,
      type: "referral",
      amount: bonus,
      status: "approved",
      level: i + 1
    });

    currentRef = refUser.refBy;
  }

  res.json({ success: true });
});

app.post("/reject-deposit", async (req, res) => {
  const { depositId } = req.body;
  await Deposit.updateOne({ _id: depositId }, { status: "rejected" });
  res.json({ success: true });
});

app.get("/admin-withdraws", async (req, res) => {
  const withdraws = await Withdraw.find({ status: "pending" });
  res.json({ success: true, withdraws });
});

app.post("/approve-withdraw", async (req, res) => {
  const { withdrawId } = req.body;
  await Withdraw.updateOne({ _id: withdrawId }, { status: "approved" });
  res.json({ success: true });
});

app.post("/reject-withdraw", async (req, res) => {
  const { withdrawId } = req.body;
  const withdraw = await Withdraw.findById(withdrawId);
  await User.updateOne({ email: withdraw.email }, { $inc: { balance: withdraw.amount } });
  await Withdraw.updateOne({ _id: withdrawId }, { status: "rejected" });
  res.json({ success: true });
});

app.get("/admin-verifications", async (req, res) => {
  const users = await User.find({ verificationStatus: "pending" });
  res.json({ success: true, users });
});

app.post("/approve-verification", async (req, res) => {
  const { email } = req.body;
  await User.updateOne({ email }, { verificationStatus: "verified", isVerified: true });
  res.json({ success: true });
});

app.post("/reject-verification", async (req, res) => {
  const { email, reason } = req.body;
  await User.updateOne({ email }, { verificationStatus: "rejected", verificationRejectReason: reason });
  res.json({ success: true });
});

app.post("/submit-verification", upload.array("images"), async (req, res) => {
  try {
    const { email, fullName, docType, docNumber } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.json({ success: false, message: "المستخدم غير موجود" });
    if (user.verificationStatus === "pending") return res.json({ success: false, message: "طلبك قيد المراجعة" });
    if (user.verificationStatus === "verified") return res.json({ success: false, message: "حسابك موثق بالفعل" });
    if (!req.files || req.files.length === 0) return res.json({ success: false, message: "ارفع الصور" });
    const images = req.files.map(file => "/uploads/" + file.filename);
    await User.updateOne(
      { email },
      {
        verificationFullName: fullName,
        verificationDocType: docType,
        verificationDocNumber: docNumber,
        verificationImages: images,
        verificationStatus: "pending",
        verificationRejectReason: null
      }
    );
    res.json({ success: true });
  } catch (err) {
    console.log(err);
    res.json({ success: false });
  }
});

// ================== 🔥 المسار المعدل ==================
app.post("/submit-deposit", upload.single("image"), async (req, res) => {
  try {
    const { email, amount, txid, orderId, packageName } = req.body;

    const user = await User.findOne({ email });

    if (user.packageStart && user.packageDurationDays) {
      const endDate = new Date(user.packageStart);
      endDate.setDate(endDate.getDate() + user.packageDurationDays);

      if (new Date() < endDate) {
        return res.json({
          success: false,
          message: "لديك باقة نشطة بالفعل"
        });
      }
    }

    if (!email || !amount || !txid) {
      return res.json({ success: false, message: "بيانات ناقصة" });
    }

    const imagePath = req.file ? "/uploads/" + req.file.filename : null;

    const deposit = new Deposit({
      email,
      name: "manual",
      amount: Number(amount),
      txid,
      image: imagePath,
      orderId: orderId || Date.now().toString(),
      packageName: packageName || "bronze",
      network: "TRC20",
      status: "pending"
    });

    await deposit.save();

    res.json({ success: true, message: "تم استلام الطلب بنجاح" });

  } catch (err) {
    console.error("Deposit error:", err);
    res.json({ success: false, message: "خطأ في السيرفر" });
  }
});

setInterval(async () => {
  try {
    const expiredTime = new Date(Date.now() - 20 * 60 * 1000);
    await Deposit.updateMany(
      { status: "pending", createdAt: { $lt: expiredTime } },
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
    const all = [
      ...deposits.map(d => ({
        type: "deposit",
        amount: d.amount,
        status: d.status,
        date: d.createdAt,
        txid: d.txid,
        network: d.network,
        orderId: d.orderId
      })),
      ...withdraws.map(w => ({
        type: "withdraw",
        amount: w.amount,
        status: w.status,
        date: w.createdAt
      })),
      ...referralFormatted
    ];
    all.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json({ success: true, data: all });
  } catch (err) {
    res.json({ success: false });
  }
});

app.get("/referrals/:email", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.params.email });
    if (!user) return res.json({ success: false });
    const level1 = await User.find({ refBy: user.refCode });
    const level2 = await User.find({ refBy: { $in: level1.map(u => u.refCode) } });
    const level3 = await User.find({ refBy: { $in: level2.map(u => u.refCode) } });
    const level4 = await User.find({ refBy: { $in: level3.map(u => u.refCode) } });
    const level5 = await User.find({ refBy: { $in: level4.map(u => u.refCode) } });
    res.json({
      success: true,
      refCode: user.refCode,
      income: user.incomeBalance,
      levels: { level1, level2, level3, level4, level5 }
    });
  } catch (err) {
    res.json({ success: false });
  }
});

// ✅ التحويل الصحيح كما طلبت
app.post("/transfer-profit", async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.json({ success: false });
  
  const amount = user.incomeBalance;
  if (amount <= 0) {
    return res.json({ success: false, message: "لا توجد أرباح للتحويل" });
  }
  
  user.balance += amount;
  user.incomeBalance = 0;
  await user.save();
  await ReferralTransaction.create({
    email: user.email,
    type: "transfer",
    amount: amount,
    status: "approved",
    createdAt: new Date()
  });
  res.json({ success: true, amount: amount });
});

setInterval(async () => {
  try {
    const users = await User.find({ packageName: { $ne: null } });
    const now = new Date();
    for (let user of users) {
      if (!user.packageStart || !user.dailyProfit) continue;
      const daysPassed = Math.floor((now - user.packageStart) / (1000 * 60 * 60 * 24));
      if (daysPassed >= user.packageDurationDays) continue;
      if (!user.lastProfitDate) user.lastProfitDate = user.packageStart;
      const hoursPassed = (now - new Date(user.lastProfitDate)) / (1000 * 60 * 60);
      if (hoursPassed < 24) continue;
      const profit = user.dailyProfit;
      user.incomeBalance += profit;
      user.lastProfitDate = new Date();
      await user.save();
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

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

// 🔥 ربط MongoDB - تحسين الاتصال
mongoose.connect("mongodb+srv://maynwsmanswy_db_user:hOrkK68kCma6kJB5@cluster0.w0jrqw.mongodb.net/sudancrypto?retryWrites=true&w=majority", {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
})
.then(() => console.log("✅ MongoDB connected"))
.catch(err => console.log("❌ MongoDB error:", err));

// ================== إضافات فوق ==================
let codes = {};
let resetCodes = {};

// 📦 Schema (Updated)
const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, index: true },
  phone: String,
  password: { type: String, select: true }, // أبقيناها true لعدم تغيير منطقك
  ref: String,
  refCode: { type: String, index: true },
  refBy: { type: String, index: true },

  balance: { type: Number, default: 0 },
  investedAmount: { type: Number, default: 0 },
  incomeBalance: { type: Number, default: 0 },
  referralBalance: { type: Number, default: 0 },

  isVerified: { type: Boolean, default: false },
  verificationStatus: { type: String, default: 'none', index: true },

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

const depositSchema = new mongoose.Schema({
  email: { type: String, index: true },
  name: String,
  amount: Number,
  txid: { type: String, index: true },
  image: String,
  orderId: String,
  packageName: String,
  network: String,
  status: { type: String, default: "pending", index: true },
  createdAt: { type: Date, default: Date.now }
});

const Deposit = mongoose.model("Deposit", depositSchema);

const referralTransactionSchema = new mongoose.Schema({
  email: { type: String, index: true },
  amount: Number,
  type: { type: String, required: true },
  status: String,
  level: Number,
  createdAt: { type: Date, default: Date.now }
});

const ReferralTransaction = mongoose.model("ReferralTransaction", referralTransactionSchema);

const withdrawSchema = new mongoose.Schema({
  email: { type: String, index: true },
  amount: Number,
  wallet: String,
  status: { type: String, default: "pending", index: true },
  createdAt: { type: Date, default: Date.now }
});

const Withdraw = mongoose.model("Withdraw", withdrawSchema);

// الفهارس موجودة بالفعل في التعريف بالأعلى للسرعة

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
  const exists = await User.findOne({ email }).lean(); // تحسين السرعة بـ lean
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
  const exists = await User.findOne({ email }).lean();
  if (exists) {
    return res.json({ success: false, message: "الإيميل مستخدم" });
  }

  let refCode;
  let existsCode = true;
  while (existsCode) {
    refCode = generateRefCode();
    const userExists = await User.findOne({ refCode }).lean();
    if (!userExists) existsCode = false;
  }

  let refUser = null;
  if (ref) {
    refUser = await User.findOne({ refCode: ref }).lean();
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
  const user = await User.findOne({ email, password }).lean();
  if (!user) {
    return res.json({ success: false, message: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });
  }
  res.json({ success: true, name: user.name, email: user.email });
});

// ================== نسيت كلمة السر ==================
app.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email }).lean();
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

// ================== جلب بيانات المستخدم - تحسين السرعة ==================
app.post("/user-data", async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email }).lean(); // استخدام lean لتقليل استهلاك الذاكرة
  if (!user) return res.json({ success: false });

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
    ...user,
    withdrawable: user.incomeBalance || 0,
    hasActivePackage
  });
});

app.post("/change-password", async (req, res) => {
  const { email, oldPass, newPass } = req.body;
  const user = await User.findOne({ email, password: oldPass }).lean();
  if (!user) return res.json({ success: false, message: "كلمة المرور الحالية غير صحيحة" });
  await User.updateOne({ email }, { password: newPass });
  res.json({ success: true });
});

app.post("/set-withdraw-password", async (req, res) => {
  const { email, withdrawPassword } = req.body;
  await User.updateOne({ email }, { withdrawPassword });
  res.json({ success: true });
});

// 🚀 تحسين: إضافة Pagination لمسار admin-users
app.get("/admin-users", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const skip = (page - 1) * limit;

    const users = await User.find({})
      .sort({ _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await User.countDocuments({});
    res.json({ 
      success: true, 
      users, 
      totalPages: Math.ceil(total / limit),
      currentPage: page
    });
  } catch (err) {
    res.json({ success: false });
  }
});

app.get("/admin-verifications", async (req, res) => {
  try {
    const users = await User.find({ verificationStatus: "pending" }).lean();
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

// 🚀 تحسين: إضافة Pagination لمسار admin-deposits
app.get("/admin-deposits", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const skip = (page - 1) * limit;

    const deposits = await Deposit.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Deposit.countDocuments({});
    res.json({ 
      success: true, 
      deposits,
      totalPages: Math.ceil(total / limit),
      currentPage: page
    });
  } catch (err) {
    res.json({ success: false });
  }
});

app.post("/admin-add-balance", async (req, res) => {
  const { email, amount } = req.body;
  await User.updateOne({ email }, { $inc: { balance: Number(amount) } });
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
    user.lastProfitDate = new Date();
    await user.save();
  }

  if (user.refBy) {
    const level1 = await User.findOne({ refCode: user.refBy });
    if (level1) {
      const bonus1 = deposit.amount * 0.10;
      level1.referralBalance += bonus1;
      await level1.save();
      await new ReferralTransaction({ email: level1.email, amount: bonus1, type: 'referral', status: 'completed', level: 1 }).save();

      if (level1.refBy) {
        const level2 = await User.findOne({ refCode: level1.refBy });
        if (level2) {
          const bonus2 = deposit.amount * 0.05;
          level2.referralBalance += bonus2;
          await level2.save();
          await new ReferralTransaction({ email: level2.email, amount: bonus2, type: 'referral', status: 'completed', level: 2 }).save();

          if (level2.refBy) {
            const level3 = await User.findOne({ refCode: level2.refBy });
            if (level3) {
              const bonus3 = deposit.amount * 0.02;
              level3.referralBalance += bonus3;
              await level3.save();
              await new ReferralTransaction({ email: level3.email, amount: bonus3, type: 'referral', status: 'completed', level: 3 }).save();
            }
          }
        }
      }
    }
  }

  res.json({ success: true });
});

app.post("/deposit", upload.single("image"), async (req, res) => {
  const { email, name, amount, txid, orderId, packageName, network } = req.body;
  const image = req.file ? req.file.filename : null;

  const deposit = new Deposit({
    email,
    name,
    amount,
    txid,
    image,
    orderId,
    packageName,
    network
  });

  await deposit.save();
  res.json({ success: true });
});

// 🚀 تحسين: إضافة Pagination لمسار admin-withdraws
app.get("/admin-withdraws", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const skip = (page - 1) * limit;

    const withdraws = await Withdraw.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Withdraw.countDocuments({});
    res.json({ 
      success: true, 
      withdraws,
      totalPages: Math.ceil(total / limit),
      currentPage: page
    });
  } catch (err) {
    res.json({ success: false });
  }
});

app.post("/withdraw", async (req, res) => {
  const { email, amount, wallet, withdrawPassword } = req.body;
  const user = await User.findOne({ email });

  if (!user) return res.json({ success: false, message: "المستخدم غير موجود" });
  if (user.withdrawBlocked) return res.json({ success: false, message: "عمليات السحب محظورة لحسابك" });
  if (user.withdrawPassword !== withdrawPassword) return res.json({ success: false, message: "كلمة سر السحب غير صحيحة" });
  if (user.incomeBalance < amount) return res.json({ success: false, message: "رصيد الأرباح غير كافٍ" });

  user.incomeBalance -= amount;
  await user.save();

  const withdraw = new Withdraw({ email, amount, wallet });
  await withdraw.save();

  res.json({ success: true });
});

app.post("/admin-approve-withdraw", async (req, res) => {
  const { id } = req.body;
  await Withdraw.findByIdAndUpdate(id, { status: "approved" });
  res.json({ success: true });
});

app.post("/admin-reject-withdraw", async (req, res) => {
  const { id } = req.body;
  const withdraw = await Withdraw.findById(id);
  if (withdraw) {
    await User.updateOne({ email: withdraw.email }, { $inc: { incomeBalance: withdraw.amount } });
    withdraw.status = "rejected";
    await withdraw.save();
  }
  res.json({ success: true });
});

app.post("/verify-account", upload.array("images", 2), async (req, res) => {
  const { email, fullName, docType, docNumber } = req.body;
  const images = req.files.map(f => f.filename);

  await User.updateOne({ email }, {
    verificationFullName: fullName,
    verificationDocType: docType,
    verificationDocNumber: docNumber,
    verificationImages: images,
    verificationStatus: "pending"
  });

  res.json({ success: true });
});

app.post("/admin-block-user", async (req, res) => {
  const { email } = req.body;
  await User.updateOne({ email }, { isBlocked: true });
  res.json({ success: true });
});

app.post("/admin-unblock-user", async (req, res) => {
  const { email } = req.body;
  await User.updateOne({ email }, { isBlocked: false });
  res.json({ success: true });
});

app.post("/admin-freeze-user", async (req, res) => {
  const { email } = req.body;
  await User.updateOne({ email }, { isFrozen: true });
  res.json({ success: true });
});

app.post("/admin-unfreeze-user", async (req, res) => {
  const { email } = req.body;
  await User.updateOne({ email }, { isFrozen: false });
  res.json({ success: true });
});

app.post("/admin-block-withdraw", async (req, res) => {
  const { email } = req.body;
  await User.updateOne({ email }, { withdrawBlocked: true });
  res.json({ success: true });
});

app.post("/admin-unblock-withdraw", async (req, res) => {
  const { email } = req.body;
  await User.updateOne({ email }, { withdrawBlocked: false });
  res.json({ success: true });
});

app.post("/lock-wallet", async (req, res) => {
  const { email, walletAddress } = req.body;
  await User.updateOne({ email }, { walletAddress, walletLocked: true });
  res.json({ success: true });
});

// ================== نظام توزيع الأرباح التلقائي ==================
async function distributeProfits() {
  const users = await User.find({
    packageName: { $ne: null },
    packageStart: { $ne: null }
  });

  const now = new Date();

  for (let user of users) {
    const startDate = new Date(user.packageStart);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + user.packageDurationDays);

    if (now < endDate) {
      const lastProfit = user.lastProfitDate ? new Date(user.lastProfitDate) : startDate;
      const diffMs = now - lastProfit;
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays >= 1) {
        const totalProfit = diffDays * user.dailyProfit;
        user.incomeBalance += totalProfit;
        user.lastProfitDate = new Date();
        await user.save();
        console.log(`✅ Distributed ${totalProfit} USDT to ${user.email}`);
      }
    }
  }
}

setInterval(distributeProfits, 60 * 60 * 1000);

// ================== الإحصائيات ==================
app.get("/admin-stats", async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const verifiedUsers = await User.countDocuments({ isVerified: true });
    const pendingVerifications = await User.countDocuments({ verificationStatus: "pending" });

    const deposits = await Deposit.find({ status: "approved" }).lean();
    const totalDeposits = deposits.reduce((sum, d) => sum + d.amount, 0);

    const withdraws = await Withdraw.find({ status: "approved" }).lean();
    const totalWithdraws = withdraws.reduce((sum, w) => sum + w.amount, 0);

    const pendingDeposits = await Deposit.countDocuments({ status: "pending" });
    const pendingWithdraws = await Withdraw.countDocuments({ status: "pending" });

    res.json({
      success: true,
      stats: {
        totalUsers,
        verifiedUsers,
        pendingVerifications,
        totalDeposits,
        totalWithdraws,
        pendingDeposits,
        pendingWithdraws
      }
    });
  } catch (err) {
    res.json({ success: false });
  }
});

app.post("/admin-edit-user", async (req, res) => {
  const { email, name, phone, balance, incomeBalance, referralBalance } = req.body;
  await User.updateOne({ email }, {
    name,
    phone,
    balance: Number(balance),
    incomeBalance: Number(incomeBalance),
    referralBalance: Number(referralBalance)
  });
  res.json({ success: true });
});

app.post("/admin-delete-user", async (req, res) => {
  const { email } = req.body;
  await User.deleteOne({ email });
  await Deposit.deleteMany({ email });
  await Withdraw.deleteMany({ email });
  res.json({ success: true });
});

app.get("/referrals", async (req, res) => {
  const { email } = req.query;
  const user = await User.findOne({ email }).lean();
  if (!user) return res.json({ success: false });

  const level1 = await User.find({ refBy: user.refCode }).select("name email createdAt isVerified balance").lean();
  
  let level2 = [];
  for (let u of level1) {
    const subs = await User.find({ refBy: u.refCode }).select("name email createdAt isVerified balance").lean();
    level2 = level2.concat(subs);
  }

  let level3 = [];
  for (let u of level2) {
    const subs = await User.find({ refBy: u.refCode }).select("name email createdAt isVerified balance").lean();
    level3 = level3.concat(subs);
  }

  res.json({
    success: true,
    level1,
    level2,
    level3,
    counts: {
      l1: level1.length,
      l2: level2.length,
      l3: level3.length
    }
  });
});

app.get("/transactions", async (req, res) => {
  const { email } = req.query;
  const deposits = await Deposit.find({ email }).sort({ createdAt: -1 }).lean();
  const withdraws = await Withdraw.find({ email }).sort({ createdAt: -1 }).lean();
  const referrals = await ReferralTransaction.find({ email }).sort({ createdAt: -1 }).lean();

  res.json({ success: true, deposits, withdraws, referrals });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

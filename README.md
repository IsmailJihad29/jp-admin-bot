# 🚀 JP ADMIN — Self-Hosted Discord Bot & Cohort Automation

JP ADMIN হলো একটি শক্তিশালী Discord বট ও গুগল শিট অটোমেশন সিস্টেম, যা বুটক্যাম্প এবং ট্রেনিং কোহর্টের স্টুডেন্টদের **দৈনিক অ্যাটেন্ডেন্স, গুগল শিট রোস্টার সিঙ্ক, জব ট্র্যাকিং, উইকলি পারফরম্যান্স রিপোর্ট, ডিসকর্ড রোল ম্যানেজমেন্ট এবং প্লেসমেন্ট অ্যানালিটিক্স** পরিচালনা করতে সাহায্য করে।

এই রিপোজিটরিটি সম্পূর্ণ স্বাধীন এবং সেলফ-হোস্টেড। এটি সরাসরি আপনার **Discord Bot Application, Render Cloud Service, Google Sheet এবং Apps Script**-এর সাথে সংযুক্ত হয়ে কাজ করে।

---

## 📑 সূচিপত্র (Table of Contents)
1. [প্রয়োজনীয় জিনিসপত্র (Prerequisites)](#-১-প্রয়োজনীয়-জিনিসপত্র)
2. [ধাপ ১: Discord Bot তৈরি এবং সার্ভারে ইনভাইট](#-ধাপ-১-discord-bot-তৈরি-এবং-সার্ভারে-ইনভাইট)
3. [ধাপ ২: Google Sheets ও Apps Script ব্যাকএন্ড সেটআপ](#-ধাপ-২-google-sheets-ও-apps-script-ব্যাকএন্ড-সেটআপ)
4. [ধাপ ৩: Render-এ ক্লাউড ডিপ্লয়মেন্ট](#-ধাপ-৩-render-এ-ক্লাউড-ডিপ্লয়মেন্ট)
5. [ধাপ ৪: Discord সার্ভারে বটকে সক্রিয় করা](#-ধাপ-৪-discord-সার্ভারে-বটকে-সক্রিয়-করা)
6. [Placement Pulse ড্যাশবোর্ডের সাথে সংযোগ](#-placement-pulse-এর-সাথে-সংযোগ)
7. [কমান্ড রেফারেন্স (Command Reference)](#-প্রয়োজনীয়-কমান্ড-তালিকা)
8. [সাধারণ সমস্যা ও সমাধান (Troubleshooting)](#-সাধারণ-সমস্যা-ও-সমাধান)

---

## 🛠 ১. প্রয়োজনীয় জিনিসপত্র

- একটি Discord অ্যাকাউন্ট (যাতে টার্গেট সার্ভারে Administrator পারমিশন আছে)।
- একটি Google অ্যাকাউন্ট (কোহর্টের গুগল শিট ও Apps Script এর জন্য)।
- একটি ফ্রি [GitHub](https://github.com) অ্যাকাউন্ট।
- একটি ফ্রি [Render](https://render.com) অ্যাকাউন্ট।

---

## 🤖 ধাপ ১: Discord Bot তৈরি এবং সার্ভারে ইনভাইট

### ১.১ Bot Application তৈরি ও Token নেওয়া:
1. ব্রাউজারে [Discord Developer Portal](https://discord.com/developers/applications)-এ লগইন করুন।
2. উপরে ডানপাশে **New Application** বাটনে ক্লিক করুন।
3. নাম দিন (যেমন: `JP ADMIN Bot`) এবং **Create**-এ চাপ দিন।
4. বামপাশের মেনু থেকে **"Bot"** ট্যাবে যান:
   - **Reset Token**-এ ক্লিক করে **Yes, do it!** দিন।
   - নিচে প্রদর্শিত লম্বা টোকেনটি **Copy** করে আপনার নোটপ্যাডে সংরক্ষণ করুন (এটি পরবর্তীতে Render-এর `DISCORD_TOKEN` হিসেবে লাগবে)।
   - **PUBLIC BOT:** এটি `ON` রাখুন।
   - ⚠️ **REQUIRES OAUTH2 CODE GRANT:** এটি অবশ্যই **`OFF` (বন্ধ)** রাখবেন।
5. একটু নিচে স্ক্রল করে **Privileged Gateway Intents** সেকশনে এই ৩টি অন (টিক) করুন:
   - ✅ **Presence Intent**
   - ✅ **Server Members Intent** *(খুব জরুরি - স্টুডেন্ট রোস্টার সিঙ্ক করার জন্য)*
   - ✅ **Message Content Intent** *(খুব জরুরি - টেক্সট কমান্ড শোনার জন্য)*
6. নিচে সবুজ **Save Changes** বাটনে ক্লিক করুন।

### ১.২ বটকে Discord সার্ভারে ইনভাইট করা:
1. বামপাশের মেনু থেকে **"General Information"**-এ যান।
2. **Application ID**-র পাশের **Copy** বাটনে ক্লিক করে আইডিটি কপি করুন।
3. ব্রাউজারের নতুন ট্যাবে নিচের লিঙ্কে `YOUR_APPLICATION_ID` লেখাটি মুছে আপনার কপি করা আইডি বসিয়ে এন্টার দিন:
   ```text
   https://discord.com/oauth2/authorize?client_id=YOUR_APPLICATION_ID&permissions=8&scope=bot%20applications.commands
   ```
4. প্রদর্শিত উইন্ডো থেকে আপনার Discord সার্ভারটি নির্বাচন করুন এবং **Continue → Authorize** দিন।
5. **রোল পজিশনিং (খুব গুরুত্বপূর্ণ):** 
   - Discord সার্ভারে ঢুকে **Server Settings → Roles**-এ যান।
   - `JP ADMIN Bot`-এর রোলটিকে ড্র্যাগ করে স্টুডেন্ট রোলগুলোর **উপরে** তুলে দিন, যাতে বট স্টুডেন্টদের রোল ম্যানেজ করতে পারে।

---

## 📊 ধাপ ২: Google Sheets ও Apps Script ব্যাকএন্ড সেটআপ

1. [Google Sheets](https://sheets.google.com)-এ গিয়ে কোহর্টের জন্য একটি নতুন গুগল শিট তৈরি করুন।
2. শিটের উপরের মেনু থেকে **Extensions → Apps Script**-এ ক্লিক করুন।
3. ডিফল্ট কোড মুছে দিয়ে এই রিপোজিটরির [`Code-v19-FINAL.gs`](Code-v19-FINAL.gs) ফাইলের সম্পূর্ণ কোড কপি করে পেস্ট করুন।
4. একদম উপরে লাইন ২০-২৪ এর `CONFIG` সেকশনে প্রয়োজনীয় তথ্য দিন:
   ```javascript
   const CONFIG = {
     COHORT: 'Albatross B12', // আপনার কোহর্ট বা ব্যাচের নাম
     SECRET_KEY: 'jp_admin_secure_secret_token_9876543210', // কমপক্ষে ৩২ অক্ষরের একটি গোপন পাসওয়ার্ড
     TZ: 'Asia/Dhaka',
     // বাকি অংশ যেমন আছে তেমনই থাকবে
   ```
5. উপরে **Save** (💾) আইকনে ক্লিক করুন।
6. ফাংশন ড্রপডাউনে **`setup`** সিলেক্ট করে **Run** দিন।
   - গুগল পারমিশন চাইলে: *Review Permissions → আপনার Google অ্যাকাউন্ট সিলেক্ট করুন → Advanced → Go to ... (unsafe) → Allow* দিন।
7. উপরে ডানপাশের নীল **Deploy → New deployment**-এ ক্লিক করুন:
   - গিয়ার (⚙️) আইকন থেকে **Web app** সিলেক্ট করুন।
   - **Description:** `v1`
   - **Execute as:** `Me`
   - **Who has access:** `Anyone` *(অবশ্যই Anyone সিলেক্ট করতে হবে)*
   - **Deploy** ক্লিক করুন।
8. প্রদর্শিত **Web app URL** (যা `.../exec` দিয়ে শেষ হয়) কপি করে সংরক্ষণ করুন (এটি আপনার `COHORT_API_URL`)।

---

## ☁️ ধাপ ৩: Render-এ ক্লাউড ডিপ্লয়মেন্ট

1. [Render Dashboard](https://dashboard.render.com)-এ যান এবং GitHub দিয়ে সাইন-ইন করুন।
2. উপরে ডানপাশের **New + → Web Service**-এ ক্লিক করুন।
3. আপনার গিটহাব রিপোজিটরিটি (`jp-admin-bot`) নির্বাচন করে **Connect** দিন।
4. কনফিগারেশন সেটিংস:
   - **Name:** `jp-admin-bot`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** `Free`

5. পেজটি একটু নিচে স্ক্রল করে **"Environment Variables"** সেকশনে ক্লিক করুন এবং শুধুমাত্র নিচের এই ভেরিয়েবলগুলো যোগ করুন:

| Variable Name (Key) | Value (মান) | বিবরণ |
| :--- | :--- | :--- |
| **`DISCORD_TOKEN`** | `MTI...` | ধাপ ১ এ পাওয়া Bot Token (আবশ্যক) |
| **`JP_INSTALLER_MODE`** | `true` | ডাইনামিক মাল্টি-সার্ভার মোড সক্রিয় করার জন্য (আবশ্যক) |
| **`CENTRAL_SHEET_URL`** | `https://docs.google.com/spreadsheets/d/...` | সেন্ট্রাল মাস্টার গুগল শিটের লিংক (যেখানে সব ব্যাচ ট্র্যাক থাকবে) |
| **`COHORT_TIMEZONE`** | `Asia/Dhaka` | বাংলাদেশ টাইমজোন |
| **`BOT_ACTIVE_WINDOW`** | `always` | বট সার্বক্ষণিক সক্রিয় থাকার জন্য |

> 💡 **নোট:** Render-এ কোনো নির্দিষ্ট ব্যাচের নাম (`COHORT_NAME`) বা নির্দিষ্ট শিটের URL (`COHORT_API_URL`) দেওয়ার দরকার নেই! প্রতিটি Discord সার্ভার তার নিজস্ব গুগল শিটের সাথে ডিসকর্ড থেকেই যুক্ত হবে।

6. নিচে **"Deploy Web Service"** বাটনে ক্লিক করুন!
7. ২-৩ মিনিটের মধ্যে Render কনসোলে `Bot logged in as ...` দেখতে পাবেন।

---

## ⚡ ধাপ ৪: Discord সার্ভারে শিট কানেক্ট ও বট সক্রিয় করা

আপনি বটটিকে যেকোনো Discord সার্ভারে Invite করতে পারেন (যেমন Batch 11, Batch 12, Batch 13)।

যেকোনো সার্ভারে বট অ্যাড করার পর:
1. সার্ভারের যেকোনো চ্যানেলে গিয়ে লিখুন: **`/setup`** (বা **`!setup`**)
   - বট স্বয়ংক্রিয়ভাবে একটি প্রাইভেট চ্যানেল তৈরি বা প্রস্তুত করবে: **`#bot-admin`**।
2. **`#bot-admin`** চ্যানেলে যান। সেখানে একটি ইন্টারঅ্যাক্টিভ প্যানেল দেখতে পাবেন:
   - **`🔗 Connect Sheet / Key`** বাটনে ক্লিক করুন।
   - একটি পপআপ আসবে:
     - **Apps Script URL:** এই ব্যাচের শিট থেকে পাওয়া Web App `/exec` URL পেস্ট করুন।
     - **Secret Key:** `Code-v19-FINAL.gs`-এর `CONFIG.SECRET_KEY`-তে দেওয়া পাসওয়ার্ডটি দিন।
   - *(অথবা সরাসরি কমান্ড লিখুন: `!connectsheet <Apps Script URL> <Secret Key>`)*
   - সাথে সাথে বট ওই সার্ভারের সাথে ওই নির্দিষ্ট গুগল শিট যুক্ত করে নেবে এবং সেন্ট্রাল শিটেও রেজিস্টার করে দেবে!
3. এরপর প্যানেলের **`2 · Match channels`** এবং **`3 · Sync students`** বাটনে ক্লিক করুন (বা `!syncmembers` চালান)।
4. **`!doctor`** চালিয়ে সব চেক করে নিন।

🎉 **অভিনন্দন!** এখন আপনার বট সম্পূর্ণ ডাইনামিক। প্রতিটি Discord সার্ভার তার নিজস্ব গুগল শিটে ডাটা সংরক্ষণ করবে এবং সেন্ট্রাল শিট থেকে আপনি সব দেখতে পাবেন!

---

## 🎯 Placement Pulse-এর সাথে সংযোগ

বট একবার ডিপ্লয় হয়ে গুগল শিটে ডেটা সিঙ্ক করা শুরু করলে:
1. আপনার কোহর্ট গুগল শিটের লিংকটি কপি করুন (বা ব্রাউজার থেকে নির্দিষ্ট ট্যাবের লিংক, যেমন `#gid=...`)।
2. গুগল শিটের শেয়ারিং অপশনে **"Anyone with the link can view"** অন নিশ্চিত করুন।
3. [Placement Pulse](http://localhost:3000/projects) ড্যাশবোর্ডে গিয়ে **"+ Create Project"**-এ ক্লিক করে গুগল শিট লিংকটি পেস্ট করে সাবমিট করুন।
4. চোখের পলকে Discord বটের সমস্ত স্টুডেন্ট, অ্যাটেন্ডেন্স ও প্রোফাইল ডেটা Placement Pulse ড্যাশবোর্ডে লাইভ চলে আসবে!

---

## ⌨️ প্রয়োজনীয় কমান্ড তালিকা

| কমান্ড | বিবরণ | কার জন্য |
| :--- | :--- | :--- |
| `!setup` | সার্ভার ও চ্যানেল কনফিগারেশন সেটআপ | Supervisor / Admin |
| `!syncmembers` | Discord সার্ভার মেম্বারদের গুগল শিটে সিঙ্ক করা | Supervisor / Admin |
| `!openform` | ডেইলি অ্যাটেন্ডেন্স ফর্ম ওপেন করা | Supervisor / Admin |
| `!closeform` | ডেইলি অ্যাটেন্ডেন্স ফর্ম বন্ধ করা | Supervisor / Admin |
| `!formstatus` | বর্তমান ফর্ম লিংক ও স্ট্যাটাস দেখা | সবাই |
| `!doctor` | সিস্টেম ডায়াগনস্টিক ও কানেক্টিভিটি টেস্ট | Supervisor / Admin |
| `!rtbr` | Right To Be Referred রুলস ও র‍্যাংকিং | Supervisor / Student |
| `!centralsheet` | সেন্ট্রাল মাস্টার শিট স্ট্যাটাস ও সিঙ্ক | Supervisor / Admin |

---

## ❓ সাধারণ সমস্যা ও সমাধান (Troubleshooting)

### ১. "Integration requires code grant" এরর দেখাচ্ছে?
👉 Discord Developer Portal-এ **Bot** ট্যাবে যান এবং নিশ্চিত করুন **"REQUIRES OAUTH2 CODE GRANT"** অপশনটি **`OFF` (বন্ধ)** আছে।

### ২. বট মেসেজের উত্তর দিচ্ছে না?
👉 Discord Developer Portal-এ **Bot** ট্যাবে গিয়ে **"Message Content Intent"** অন আছে কিনা চেক করুন।

### ৩. শিটে ডেটা যাচ্ছে না বা ৪০১ / Unauthorized এরর আসছে?
👉 গুগল শিটের `Code-v19-FINAL.gs`-এর `CONFIG.SECRET_KEY` এবং Render-এর `COHORT_API_KEY` হুবহু এক আছে কিনা মিলিয়ে দেখুন।

### ৪. স্টুডেন্ট রোস্টার সিঙ্ক হচ্ছে না?
👉 **Server Members Intent** অন আছে কিনা এবং Discord সার্ভারে বটের রোলটি স্টুডেন্ট রোলের উপরে আছে কিনা নিশ্চিত করুন।

---

Developed with ❤️ for **JP Bootcamp & Placement Operations Automation**.

# កំណត់ ENV សម្រាប់ JD ANALYSIS (Windows)

ក្នុង ZIP មាន **template** មិនមែន credential ពិត៖

- `.env.example` — សម្រាប់ Docker Compose / Python configuration ហើយ Windows launcher អាចចម្លងវា (បន្ទាប់ពីអ្នកបង្កើត `.env`) ទៅ `.dev.vars`។
- `.dev.vars.example` — សម្រាប់ Cloudflare Worker local secrets ដោយផ្ទាល់។

## ជម្រើស A — ងាយស្រួលសម្រាប់ Windows Worker

1. ចម្លង `.env.example` ទៅ `.env`៖
   ```powershell
   Copy-Item .env.example .env
   ```
2. បើក `.env` ហើយដាក់ `DATABASE_URL` របស់ Neon និង API keys ដែលអ្នកមាន។ កុំបញ្ចូល Telegram values ប្រសិនបើមិនទាន់មាន Bot។
3. បើ `.dev.vars` មិនទាន់មានទេ `run_windows.bat` នឹងចម្លង `.env` ទៅ `.dev.vars` ដោយស្វ័យប្រវត្តិ។ បន្ទាប់មកចាប់ផ្ដើម៖
   ```powershell
   npm install
   npm run dev
   ```

## ជម្រើស B — កំណត់ Worker local ដាច់ដោយឡែក

1. ចម្លង `.dev.vars.example` ទៅ `.dev.vars`៖
   ```powershell
   Copy-Item .dev.vars.example .dev.vars
   ```
2. បំពេញ `DATABASE_URL` ជា Neon PostgreSQL connection string និង keys ដែលអ្នកចង់ប្រើ។
3. ដំណើរការ `npm run dev` ឬ `run_windows.bat`។

**ចំណាំ៖** បើ `.dev.vars` មានរួច វាមានអាទិភាពលើ `.env` សម្រាប់ Worker local ហើយ Windows launcher មិនសរសេរជាន់លើវាទេ។ បើអ្នកកែ `.env` ក្រោយពេល `.dev.vars` ត្រូវបានបង្កើតរួច សូមកែ `.dev.vars` ដោយដៃផងដែរ ឬ backup `.dev.vars` រួច rename វាបណ្ដោះអាសន្ន ដើម្បីឱ្យ launcher បង្កើតថ្មី។

## Production Cloudflare Worker

កំណត់ secrets ក្នុង Cloudflare ដោយ command មួយៗ ហើយបញ្ចូល value នៅពេល Wrangler សួរ៖

```powershell
npx wrangler secret put APP_PASSWORD
npx wrangler secret put DATABASE_URL
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put DEEPSEEK_API_KEY
```

`TWELVEDATA_API_KEY` និង `FINNHUB_API_KEY` ជា optional។ Telegram ក៏ optional៖

```powershell
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
```

កុំដាក់ secrets ពិតនៅក្នុង `wrangler.jsonc`, source code, GitHub ឬ ZIP។ កុំ share `.env` / `.dev.vars` ជាមួយអ្នកដទៃ។

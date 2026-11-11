# JD ANALYSIS — XAUUSD Live Market Terminal + Screenshot Analyzer

កម្មវិធី XAUUSD សម្រាប់ Windows ដែលមាន workflow ពីរដាច់ដោយឡែក៖ **Live Market Terminal** សម្រាប់ទាញ candle feed និងស្កេនសញ្ញា និង **Chart Analyzer** សម្រាប់ upload screenshot ពី 2 timeframes ហើយប្រើ Gemini Vision/DeepSeek Vision។ បន្ថែមដោយ Canvas overlays, Live Terminal Chat និង Signal History។

> **សំខាន់:** រូបភាព Chart មិនមែនជា raw OHLC feed ទេ។ Live Terminal ទាញ price/candles ពី Yahoo Finance symbol `XAUUSD=X` ប៉ុន្តែ feed អាចយឺត, មិនអាចចូលបាន ឬខុសពី quote/spread របស់ broker។ Screenshot Analyzer នៅតែប្រើតម្លៃដែលអានពី screenshot ប៉ុណ្ណោះ។ AI/OCR មិនអាចធានាថាអានលេខបានត្រឹមត្រូវ 100% នោះទេ។ ដើម្បីការពារតម្លៃក្លែងក្លាយ វាមិនបង្កើត numeric Entry/SL/TP ពីលេខដែលមិនអាចអានបានទេ។ ប្រសិនបើ provider មួយបរាជ័យ ឬមិនមានតម្លៃ Price/ATR គ្រប់គ្រាន់ វានៅតែបង្ហាញ Conditional BUY/SELL triggers និងហេតុផល WAIT។ កម្រិតដែលបានគណនាពី AI តែមួយត្រូវបានសម្គាល់ថា provisional។

## មុខងារមានក្នុង Project

- Dashboard សម្រាប់ XAUUSD តែមួយ។
- Live Chat Terminal ដាច់ដោយឡែក៖ quote/candles ពី Twelve Data ពេលកំណត់ key ឬ Yahoo Finance XAUUSD=X ជា fallback សម្រាប់ M1/M5/M15/H1, auto-refresh quote រៀងរាល់ 15 វិនាទីពេលផ្ទាំងបើក, Canvas candlesticks + EMA 9/21 overlay, RSI 14, ATR 14, MACD និង 20-candle breakout confluence scan។
- ប៊ូតុង **Analyzer · Scan Market** ដំណើរការស្កេន technical indicators ហើយស្នើ DeepSeek ឲ្យពិនិត្យ direction ដោយឡែក។ បើ AI និង technical scan មិនស្របគ្នា ប្រព័ន្ធបង្ហាញ WAIT/confirmation មិនបង្ខំ signal ទេ។ បើមិនមាន DeepSeek key វានៅតែបង្ហាញ technical scan ហើយសម្គាល់ថា AI មិនបានពិនិត្យ។
- Live Terminal Chat មាន context ផ្សេងពី DeepSeek Chat ធម្មតា ហើយមិនប្រើរូបភាពដែល upload ក្នុង Chart Analyzer ជាប្រភព live price ទេ។
- Live scans រក្សាទុកក្នុង Signal History ជា `LIVE` ដើម្បីអាចពិនិត្យ និង mark TP1/TP2/SL ពេល trade ចប់។
- Upload រូបភាព 2 timeframes (PNG/JPG/WEBP; ដល់ 12 MB ក្នុងមួយរូប)។
- Gemini Vision និង DeepSeek Vision វិភាគរូបភាពដាច់ដោយឡែក; បើ provider មួយបរាជ័យ ប្រព័ន្ធនៅតែបង្ហាញការអាន និង Conditional BUY/SELL Scenarios ពី provider ដែលដំណើរការ។
- Conditional Setup Scanner បង្ហាញលក្ខខណ្ឌ BUY/SELL ដាច់ពីការផ្ទៀងផ្ទាត់លេខ។ ការគណនា numeric levels នៅតែតម្រូវឱ្យអាន price និង ATR បានច្បាស់លើរូបទាំងពីរ។
- Canvas overlay គូស Market Structure / Zones / Annotations និង levels ដែលបានគណនាតាម scale ដែលអាចផ្ទៀងផ្ទាត់បាន។
- DeepSeek Chat មាន context ពី signal ចុងក្រោយដែលបានរក្សាទុក។
- Signal History រួមទាំងលទ្ធផល WAIT និង warnings។
- Neon PostgreSQL តាម `DATABASE_URL`; បើគ្មាន URL វាប្រើ SQLite ក្នុង `data/jd_analysis.db` ដោយស្វ័យប្រវត្តិ។
- `.env` សម្រាប់ API keys និង model IDs; មិនមាន key ឬ signal ក្លែងក្លាយក្នុង ZIP។

## 1. តម្រូវការ

- Windows 10/11
- Node.js LTS ដែល Wrangler គាំទ្រ និង npm សម្រាប់ Windows launcher
- Python 3.11 ឬ 3.12 ប្រសិនបើប្រើ Docker Compose
- Internet ដើម្បីហៅ AI APIs
- Gemini API key ពី https://aistudio.google.com/apikey
- DeepSeek API key ពី https://platform.deepseek.com/api_keys
- Neon database optional: https://neon.tech/

Gemini API មាន free tier សម្រាប់ model/កូតាដែលមានសិទ្ធិ ប៉ុន្តែមាន rate limit និងការកំណត់តាម account។ **DeepSeek API មិនគួរចាត់ទុកថាឥតគិតថ្លៃទេ**៖ ឯកសារតម្លៃផ្លូវការបច្ចុប្បន្នគិតតាម token; វាអាចប្រើ balance/credit ផ្តល់ឱ្យ account បើមាន។ សូមពិនិត្យតម្លៃ និង balance មុនប្រើជាប្រចាំ។ Quotas, eligibility និង model IDs អាចផ្លាស់ប្ដូរ។ ប្រសិនបើ model មិនអាចប្រើបាន កែ model ID ក្នុង `.env` តាមឯកសារផ្លូវការរបស់ Provider។

## 2. ដំឡើង និង Run លើ Windows

1. Extract ZIP ទៅ Folder ធម្មតា ឧ. `C:\JD_ANALYSIS`។
2. ចម្លង `.env.example` ទៅជា `.env` (ឧ. `copy .env.example .env`) ហើយបំពេញ Neon `DATABASE_URL` និង API keys ដែលអ្នកមាន។ `.env.example` គ្រាន់តែជា template ទទេ មិនមាន credentials ពិតទេ។
3. សម្រាប់ Cloudflare Worker local អ្នកក៏អាចចម្លង `.dev.vars.example` ទៅជា `.dev.vars` ហើយបញ្ចូល Worker secrets ផ្ទាល់។ បើ `.dev.vars` មិនទាន់មាន `run_windows.bat` នឹងចម្លង `.env` ទៅ `.dev.vars` ដោយស្វ័យប្រវត្តិ (បើមាន `.env`) ឬប្រើ `.dev.vars.example`។ បើ `.dev.vars` មានរួច វានឹងមិនសរសេរជាន់លើទេ។
4. Double-click `run_windows.bat`។ វាប្រើ Wrangler Worker ដូច production និងដំឡើង npm dependencies លើកដំបូង។
4. បើក Browser ទៅ `http://127.0.0.1:8787`។ Local development bind ទៅ localhost ប៉ុណ្ណោះ; authentication bypass មានសម្រាប់ process នេះតែប៉ុណ្ណោះ។
5. កុំបើក local port នេះទៅ LAN ឬ Internet។ សម្រាប់ production សូម deploy Worker ហើយកំណត់ secret `APP_PASSWORD` នៅ Cloudflare។

`run_windows.bat` គឺសម្រាប់ Worker/Aura local development។ Docker Compose នៅតែប្រើ FastAPI runtime ហើយមិនមាន Aura endpoint នេះទេ។

## 3. Run ដោយប្រើ Docker

1. ដំឡើង និងបើក Docker Desktop (Linux containers)។
2. បើមិនទាន់មាន `.env` ទេ សូមចម្លង `.env.example` ទៅជា `.env` ហើយបញ្ចូល API keys។ កុំសរសេរជាន់លើ `.env` ដែលមាន keys រួចហើយ។
3. បើក PowerShell នៅក្នុង project folder ហើយដំណើរការ `docker compose up --build -d`។
4. បើក `http://localhost:8787` លើកុំព្យូទ័រ។ ដើម្បីចូលតាម phone សូមភ្ជាប់ទៅ Wi-Fi ដូចគ្នា ហើយប្រើ `http://<IPv4-របស់កុំព្យូទ័រ>:8787` (រក IPv4 ដោយវាយ `ipconfig`)។
5. មើល logs ដោយ `docker compose logs -f` ហើយបិទ app ដោយ `docker compose down`។

Docker Compose រក្សា SQLite database និងរូប upload ក្នុង named volumes ដាច់ដោយឡែក ដូច្នេះទិន្នន័យនៅសល់ក្រោយ recreate container។ កុំប្រើ `docker compose down -v` លុះត្រាតែចង់លុប volumes និងទិន្នន័យទាំងនោះ។ API keys ត្រូវបានអានពី `.env` ហើយ `.env` មិនត្រូវបានបញ្ចូលក្នុង Docker image ទេ។ បើ Windows Firewall សួរ សូមអនុញ្ញាតតែលើ **Private networks**; កុំបើក port ទៅ Internet ឬប្រើលើ Wi-Fi សាធារណៈ ព្រោះ app មិនមាន password login ទេ។

## 4. គន្លឹះសម្រាប់ Screenshot Analyzer

សម្រាប់លេខដែលច្បាស់ជាងមុន សូមប្រើ screenshot មិន blur និងមានទំហំគ្រប់គ្រាន់។ សូមធ្វើឱ្យឃើញ៖

- Symbol `XAUUSD` និង Timeframe។
- Current-price badge ឬ last-price marker ដែលអាចសម្គាល់បាន (កុំឱ្យ AI ច្រឡំជាមួយតម្លៃ tick លើ price axis)។
- ATR Indicator ជាមួយតម្លៃលេខរបស់វា។ ប្រើ ATR period ដូចគ្នាលើ charts ទាំងពីរ បើអាចធ្វើបាន។
- រូបភាពទាំងពីរថតជិតពេលគ្នា និងពីប្រភព Chart ដូចគ្នា។
- កុំ crop ចេញ price scale ឬ ATR label ប្រសិនបើចង់ឱ្យកម្មវិធីគណនាលេខ។

បើ ATR មិនបង្ហាញជាលេខ កម្មវិធីនឹងមិនគណនា ATR ពីកម្ពស់ candle ក្នុង pixels ទេ ពីព្រោះនោះមិនមែនជា raw OHLC ឬ ATR ត្រឹមត្រូវ។

កម្មវិធីអាចបង្ហាញ **តំបន់ pullback watch សម្រាប់ BUY និង SELL** ដាច់ពីគ្នា ដោយយោងទៅលើ support/resistance និង retest លើ primary timeframe។ បើលេខមិនបានបោះពុម្ពលើ chart តែ price scale អាចអានបាន AI អាចប៉ាន់ប្រមាណ zone ហើយ UI នឹងសម្គាល់ថា estimate។ វាជាតំបន់រង់ចាំតាមលក្ខខណ្ឌ មិនមែនជា live quote ឬការបញ្ជាទិញដោយស្វ័យប្រវត្តិទេ។ បើ price scale អានមិនច្បាស់ តម្លៃ pullback អាចនៅទទេ។

## 5. ATR Formula

បើចំនួនទាំងអស់ត្រូវបានផ្ទៀងផ្ទាត់ដោយ AI ទាំងពីរ៖

- `ATR_secondary_normalized = ATR_secondary × sqrt(primary timeframe minutes / secondary timeframe minutes)`
- `Effective ATR = 0.65 × ATR_primary + 0.35 × ATR_secondary_normalized`
- `R = 1.20 × Effective ATR`
- BUY: SL = Entry − R, TP1 = Entry + R, TP2 = Entry + 1.80R
- SELL: SL = Entry + R, TP1 = Entry − R, TP2 = Entry − 1.80R
- Entry zone គឺ reference screenshot price ± 0.10 × Effective ATR

នេះជាវិធីគណនាគ្រប់គ្រងហានិភ័យដែលបានកំណត់ក្នុង project មិនមែនជារូបមន្តស្តង់ដារធានាចំណេញទេ។ កម្រិតទាំងនេះយោងតម្លៃក្នុង screenshot មិនមែន live/current broker quote។

## 6. Neon PostgreSQL (ជាជម្រើស)

1. បង្កើត Project ក្នុង Neon ហើយ copy connection string សម្រាប់ PostgreSQL។
2. ដាក់វាក្នុង `.env` (Python/FastAPI) ឬ `.dev.vars` (Cloudflare Worker local)៖

```env
DATABASE_URL=postgresql://USER:PASSWORD@YOUR-NEON-HOST/DBNAME?sslmode=require
```

3. Python/FastAPI នឹងបង្កើត table តាម SQLAlchemy `create_all()` នៅពេលចាប់ផ្ដើម។ Cloudflare Worker នឹងបង្កើត table `analysis_records` និង indexes ដោយស្វ័យប្រវត្តិនៅពេល API database endpoint ត្រូវបានហៅលើកដំបូង។ ប្រសិនបើ Python `DATABASE_URL` ទទេ ប្រព័ន្ធប្រើ SQLite local។ Worker ត្រូវការ `DATABASE_URL` ជា Neon PostgreSQL connection string។

## 7. Configuration files (.env / .dev.vars)

ZIP មាន template ទាំងពីរ៖

- `.env.example` → ចម្លងជា `.env` សម្រាប់ Docker Compose / Python settings និងអាចប្រើជាប្រភពបង្កើត `.dev.vars` ពេលប្រើ Windows launcher។
- `.dev.vars.example` → ចម្លងជា `.dev.vars` សម្រាប់ Cloudflare Worker local development។

សម្រាប់ Worker local សូមប្រាកដថា `.dev.vars` មាន `DATABASE_URL` របស់ Neon និង secret keys ដែលចាំបាច់។ សម្រាប់ production Cloudflare ត្រូវប្រើ `npx wrangler secret put NAME` ដើម្បីកំណត់ secret នីមួយៗ; កុំ upload `.env` ឬ `.dev.vars` ទៅ GitHub ឬ ZIP ដែលចែករំលែក។

`TELEGRAM_BOT_TOKEN` និង `TELEGRAM_CHAT_ID` ជាជម្រើសប៉ុណ្ណោះ។ ទុកឱ្យទទេបាន ប្រសិនបើអ្នកមិនទាន់បង្កើត Telegram Bot។

ប្រសិនបើ `.env.example` នៅតែប្រើ model ID ចាស់ អ្នកអាចប្ដូរតាម ID ដែលពិតជាមានសិទ្ធិប្រើក្នុង account របស់អ្នក។ `deepseek-flash` ត្រូវមានសិទ្ធិ Vision input; បើ API ប្រាប់ model មិនគាំទ្រ image សូមអាន docs របស់ DeepSeek ហើយកែ `DEEPSEEK_VISION_MODEL`។

## 8. Troubleshooting

- **Gemini 403 `Your project has been denied access`**៖ ជាធម្មតានេះជាបញ្ហាសិទ្ធិ/ស្ថានភាព Google Cloud project មិនមែនជា favicon ឬ DeepSeek JSON parser ទេ។ បង្កើត Gemini API authorization key ថ្មីពី AI Studio ហើយពិនិត្យ project/API access; បើនៅតែ 403 ត្រូវទាក់ទង Google AI Studio support។ បញ្ហានេះមិនអាចជួសជុលដោយកែ Python code បានទេ។ សាកល្បងបង្កើត API key ថ្មីនៅ AI Studio ហើយពិនិត្យថា key ភ្ជាប់នឹង project ដែលមានសិទ្ធិប្រើ Gemini API។ បើ key ថ្មីនៅតែត្រឡប់ 403 ដដែល សូមទាក់ទង Google support ឬបន្តប្រើ provider ផ្សេងដែលមានសិទ្ធិ។

- **API keys missing**៖ កែ `.env` ហើយ restart server។
- **Model not found / 400 / 403**៖ ពិនិត្យ model ID និងសិទ្ធិប្រើប្រាស់សម្រាប់ account របស់អ្នក។
- **429 / quota exceeded**៖ free-tier quota អស់; រង់ចាំ quota reset ឬប្រើ key/provider ដែលមាន quota។
- **WAIT / ATR unverified**៖ ធ្វើឱ្យ ATR indicator និង numeric current-price marker មើលឃើញច្បាស់លើរូបទាំងពីរ។ កុំបង្ខំប្រព័ន្ធឱ្យគណនាតម្លៃពីរូបភាពដែលអានមិនច្បាស់។
- **Database offline**៖ ពិនិត្យ Neon URL/network; ឬលុប `DATABASE_URL` ដើម្បីប្រើ SQLite local (ត្រូវ backup `data/jd_analysis.db` ប្រសិនបើចង់រក្សាប្រវត្តិ)។
- **Port 8787 already in use**៖ បិទ application instance ចាស់ ឬកែ port នៅក្នុង `run_windows.bat`។

## 9. API endpoints

- `GET /api/health` — app/database/provider config status
- `GET /api/live-market?interval=1m` — quote/candles និង indicator snapshot ពី Twelve Data (បើកំណត់ key) ឬ Yahoo fallback (`1m`, `5m`, `15m`, `60m`)
- `POST /api/live-analyze?interval=1m` — scan technical confluence, optional DeepSeek review, Canvas levels និង save live signal ទៅ history
- `POST /api/live-chat` — DeepSeek chat ជាមួយ live market context និង latest analyzer scan
- `POST /api/analyze` — multipart screenshots + timeframes
- `GET /api/history` — recent signal history
- `GET /api/history/{id}` — detail for one signal
- `POST /api/chat` — DeepSeek contextual chat
- `GET /api/ict/candles?tf=M5&symbol=XAUUSD` — candles សម្រាប់ ICT Terminal
- `POST /api/ict/scan?tf=M5&symbol=XAUUSD&ai=true` — multi-timeframe ICT scan និង save ទៅ Neon
- `GET /api/stats/daily?days=14&tz_offset_min=420` — Daily Win Rate តាម timezone របស់ browser

## Disclaimer

JD ANALYSIS គឺជាឧបករណ៍ជំនួយវិភាគប៉ុណ្ណោះ។ Yahoo Finance feed មិនមែនជា broker/MT5 quote ទេ ហើយអាចយឺត ឬមិនដំណើរការ។ តម្លៃដែលអានពី screenshot អាចចាស់ ឬ AI អានខុស។ សូមផ្ទៀងផ្ទាត់តម្លៃផ្ទាល់ក្នុង MT5 មុនសម្រេចចិត្តធ្វើ trading និងសាកល្បងដោយគ្មានប្រាក់ពិតជាមុន។

## 10. Forced-Signal Mode (ចេញ BUY/SELL រាល់ពេល) — ថ្មី

ក្នុង `.env` (មិនចាំបាច់ដាក់ក៏បាន ព្រោះ default គឺ `true`)៖

```env
FORCE_SIGNAL=true
```

- `FORCE_SIGNAL=true`៖ ប្រព័ន្ធបង្ហាញ directional candidate BUY ឬ SELL ពេលអាចបកស្រាយទិសដៅបាន ហើយបង្ហាញ Entry / SL / TP បើមាន price estimate ប្រើបាន។ វាក៏បង្ហាញ BUY និង SELL pullback watch zones ដាច់ពីគ្នា។ ប្រព័ន្ធនៅតែអាច WAIT បើ chart អានមិនបានសោះ។
- `FORCE_SIGNAL=false`៖ ត្រឡប់ទៅ strict mode ចាស់ (ចេញ WAIT ពេលពិនិត្យមិនឆ្លង)។
- **Grade A–D** បង្ហាញគុណភាពនៃការអាន chart/input មិនមែន win probability ទេ៖ A = AI ទាំងពីរយល់ស្របគ្នា ហើយ price + ATR អានបានពី screenshot; B = ល្អ; C = មានលេខខ្លះប៉ាន់ស្មាន; D = AI មិនយល់ស្រប/ប៉ាន់ស្មានភាគច្រើន។ Forced candidate មិនមែនជា trade-ready confirmation ទោះ Grade ណាក៏ដោយ។
- ករណីតែមួយដែលនៅតែចេញ WAIT៖ AI មិនអាចកំណត់ទិសដៅបានសោះ (chart មិនច្បាស់)។

### វាស់ win rate ពិតប្រាកដ
ក្នុង **Signal History** ចុចលើ signal មួយ ហើយចុច **TP1 / TP2 / SL / Not taken** ក្រោយ trade ចប់។ កម្មវិធីនឹងបង្ហាញ win rate និង average R សរុប និងតាម Grade។ នេះជាវិធីតែមួយគត់ដើម្បីដឹងថា signal "ត្រូវច្រើន" ពិតឬអត់។ (TP1 = +1R, TP2 = +1.8R, SL = −1R; មិនរាប់ spread/commission)

## 11. Deploy frontend និង backend ទៅ Cloudflare

Cloudflare deployment ប្រើ **Workers** សម្រាប់ API/backend, **Workers Static Assets** សម្រាប់ dashboard, **Neon PostgreSQL** សម្រាប់ signal history និង **R2** សម្រាប់ screenshots។ Worker មានឈ្មោះ `kimchou-ict` តាម `wrangler.jsonc`។ API របស់ Gemini/DeepSeek នៅតែត្រូវហៅទៅ provider ដើមតាម Internet; កុំដាក់ API key ឬ `DATABASE_URL` ក្នុង source code ឬ `wrangler.jsonc`។ App ដែល deploy នឹងទាមទារ Basic Auth មុនចូល API និងរូបភាព ដោយ username `jd-analysis` និង password ដែលអ្នកកំណត់ជា Worker secret។

### Run local

1. ដំឡើង Node.js LTS។
2. ក្នុង project folder ដំណើរការ `npm install`។
3. ចម្លង `.dev.vars.example` ទៅ `.dev.vars` ហើយបំពេញ `APP_PASSWORD`, `DATABASE_URL` របស់ Neon និង API key ដែលចង់ប្រើ។ សម្រាប់ Wrangler Worker ត្រូវដាក់ `DATABASE_URL` ក្នុង `.dev.vars` (មិនមែន `.env` ទេ); `.env` ត្រូវបានប្រើដោយ Python/FastAPI។ កុំលុប ឬប្ដូរ secrets ដែលមានស្រាប់ដោយចៃដន្យ។ ឯកសារ `.dev.vars` ត្រូវបាន `.gitignore` រារាំង។
4. ដំណើរការ `npm run dev`។ នៅពេល Worker ភ្ជាប់ Neon លើកដំបូង វានឹងរត់ `CREATE TABLE IF NOT EXISTS` និងបង្កើត indexes ដោយស្វ័យប្រវត្តិ។ អ្នកមិនចាំបាច់បង្កើត table ដោយដៃទេ។
5. បើក URL ដែល Wrangler បង្ហាញ រួចបើក `/api/health`។ Browser នឹងស្នើ Basic Auth; username គឺ `jd-analysis`។ បើ `database` បង្ហាញ `connected` មានន័យថា Worker ភ្ជាប់ Neon និងបានបញ្ចប់ការរៀបចំ table។

### Deploy ទៅ Cloudflare

1. ចូល Cloudflare ដោយ `npx wrangler login`។ ត្រូវមានសិទ្ធិ Workers និង R2 លើ account ក្នុង `wrangler.jsonc`; Neon connection URL ត្រូវអាចប្រើបានពី Cloudflare Workers។
2. `wrangler.jsonc` កំណត់ account ID `77fa8828b4edb71086e716e10532ae55` និង R2 bucket `jdcou-up`។ បើ account ឬ bucket មិនត្រូវ សូមកែតែការកំណត់ R2 ឱ្យត្រូវនឹង bucket ដែលមានស្រាប់។
3. ពិនិត្យថា Neon URL ភ្ជាប់ទៅ database ដែលចង់ប្រើ និង role មានសិទ្ធិ CREATE/USAGE លើ schema និង SELECT/INSERT/UPDATE។ Worker បង្កើត table/index ដោយស្វ័យប្រវត្តិនៅពេលប្រើលើកដំបូង។ R2 bucket ដែលមានស្រាប់នៅតែរក្សារូបភាព។

4. កំណត់ secrets ក្នុង account/Worker ដែល deploy ទៅ ដោយបើក prompt ម្តងមួយ ហើយបញ្ចូលតម្លៃដោយផ្ទាល់—កុំដាក់តម្លៃជា command argument:

   ```powershell
   npx wrangler secret put APP_PASSWORD
   npx wrangler secret put DATABASE_URL
   npx wrangler secret put GEMINI_API_KEY
   npx wrangler secret put DEEPSEEK_API_KEY
   npx wrangler secret put TWELVEDATA_API_KEY
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   npx wrangler secret put TELEGRAM_CHAT_ID
   ```

   `APP_PASSWORD` និង `DATABASE_URL` ចាំបាច់។ API key យ៉ាងហោចណាស់មួយត្រូវការសម្រាប់ការវិភាគ; DeepSeek key ត្រូវការសម្រាប់ Chat និង optional ICT review។ Twelve Data key ជាជម្រើស ប៉ុន្តែជួយផ្តល់ candle feed មាន fallback ទៅ Yahoo។
5. ផ្ទៀងផ្ទាត់ដោយ `npm run check` និង deploy ដោយ `npm run deploy`។ URL `workers.dev` នឹងបង្ហាញក្នុងលទ្ធផល។

### Telegram signal bot

- កំណត់ `TELEGRAM_BOT_TOKEN` និង `TELEGRAM_CHAT_ID` ជា Cloudflare Worker secrets ដូច command ខាងលើ។ នៅ local development ចម្លង `.dev.vars.example` ទៅ `.dev.vars` រួចបំពេញតម្លៃ។
- Bot ត្រូវបានចាប់ផ្ដើមដោយអ្នកប្រើ និងត្រូវអាចផ្ញើសារទៅ chat/group ដែល `TELEGRAM_CHAT_ID` សំដៅទៅ។ កុំផ្ញើ token ចូល chat ឬ commit វាទៅ Git។
- Aura Scalper ផ្ញើ BUY/SELL signal ដោយស្វ័យប្រវត្តិពេល page Aura បើក និង auto-scan រៀងរាល់ 15 វិនាទី។ ត្រូវបើក Aura page និងរក្សា browser session ឱ្យដំណើរការ; វាមិនមែនជា background cron bot ទេ។
- Chart Analyzer ផ្ញើតែក្រោយអ្នកចុច **Analyze** ហើយការវិភាគបញ្ចប់។ ICT Terminal ផ្ញើតែក្រោយអ្នកចុច **Analyzer · Scan Market** ហើយមាន BUY/SELL signal។ WAIT នៅតែត្រូវរក្សាទុកក្នុង Signal History ប៉ុន្តែមិនផ្ញើជា trade alert ទេ។
- Telegram សារនីមួយៗបង្ហាញ source ដាច់ៗ៖ `Aura Scalper Indicator`, `ICT Terminal` ឬ `Chart Analyzer · Image Analysis`។ Signal history មាន source និង timeframe ហើយ Aura ប្រើ signal key ដើម្បីទប់ការផ្ញើស្ទួនពេល refresh។
- ICT Terminal ប្រើតម្លៃ close ចុងក្រោយនៃ candle ដែលបាន scan ជា market-entry reference។ Pullback zone នៅសល់សម្រាប់ context ប៉ុណ្ណោះ មិនមែនលក្ខខណ្ឌឱ្យរង់ចាំទេ។ វាមិនបញ្ជាទិញដោយស្វ័យប្រវត្តិ និងមិនមែនជាតម្លៃ fill ពី broker ទេ។

កុំដាក់ `.env`, `.dev.vars`, API keys, `DATABASE_URL` ឬ `APP_PASSWORD` ក្នុង Git/issue/chat។ `.env` ចាស់សម្រាប់ការរត់ Python ក្នុងម៉ាស៊ីននេះប៉ុណ្ណោះ; Wrangler secrets មិនត្រូវបាន sync ពីវាដោយស្វ័យប្រវត្តិទេ។ Worker និង Python backend ចែករំលែកប្រវត្តិពីតារាង Neon ដែលមានស្រាប់; រូបភាពនៅតែរក្សាទុកក្នុង R2។ D1 resource ឬ migration file ចាស់ៗមិនត្រូវបានលុបចោលទេ ប៉ុន្តែ Worker មិនប្រើ D1 ទៀតទេ។ សូមពិនិត្យ plan, quotas និងតម្លៃ Cloudflare, Neon និង AI providers មុនដាក់ឱ្យប្រើប្រាស់ជាសាធារណៈ។

# v2.6 — Aura Scalper (ទំព័រ indicator ថ្មី)

ម៉ឺនុយ **✦ Aura Scalper** ។ Chart 1m ជា entry ប៉ុន្តែ signal នីមួយៗត្រូវឆ្លងកាត់ការពិនិត្យ bias លើ **M5 · M15 · H1 · H4 · D1**។ គ្មាន AI ទាយ — គណនាពី candle ពិតៗ (`worker/aura-engine.ts`)។

## របៀប "ចេញ signal មុនទីផ្សារ"
គ្មានប្រព័ន្ធណាទាយអនាគតបានទេ។ Aura ធ្វើឲ្យ **ទាន់ពេលជាង** ដោយ៖
1. **WATCH (ARMED)** — កំណត់ zone (Order Block) ដែលស្របនឹង bias HTF ហើយជូនដំណឹងពេលតម្លៃកំពុងជិតដល់ មុនពេលវា react។
2. **Trigger លើ M1 ដំបូងបំផុត** ជំនួសឲ្យការដេញ breakout៖
   - **SWEEP** — តម្លៃចាក់ទម្លុះ liquidity (swing high/low) រួចបិទត្រឡប់មកវិញ (stop hunt)។ Sweep លើ TF ធំ = ពិន្ទុខ្ពស់ជាង។
   - **OB** — បដិសេធ (rejection) ពី Order Block ដែលមិនទាន់ត្រូវបំបាក់។
   - **DISPLACEMENT** — candle កម្លាំងបំបែក 8-bar extreme (Normal/Scalping ប៉ុណ្ណោះ)។
3. **Score 0-100** = trigger + HTF alignment + zone + pressure + RSI + Premium/Discount + Kill zone។

## Style (3 modes ដូចរូបគំរូ)
| Style | Tag | min score | ចរិត |
|---|---|---|---|
| Normal | BALANCED | 62 | មិនចូលប្រឆាំង HTF ខ្លាំង, TP2 ≈ 2.5R |
| Scalping M1 | M1 FAST | 64 | M1 entry លឿនជាង, M5 confirmation, SL គណនាតាម ATR M1, TP1 ≈ 1R, TP2 ≈ 1.7R |
| Shadow Pulse | SNIPER TRAP | 72 | **ត្រូវការ Sweep** ជាមុន + មិនប្រឆាំង HTF, TP2 ≈ 3R, ចេញតិច |

Scalping M1 ត្រូវឆ្លងកាត់លក្ខខណ្ឌបន្ថែម៖ EMA9/EMA20 និង slope, candle close location, candle pressure proxy, មិន chase candle ធំពេក និង alignment ជាមួយ M5/M15។ វាប្រើ M1 ATR សម្រាប់ risk, cooldown 3 candles និង expire plan បន្ទាប់ពី 18 M1 candles។ ប្រសិនបើ M5 data មិនមាន ឬ M1 feed ចាស់/ទីផ្សារបិទ វានឹង WAIT ហើយមិនផ្ញើ alert ថ្មី។

**Anti-repaint:** engine កាត់ចោល candle ដែលកំពុងបង្កើត ហើយប្រើតែ candle ដែល timeframe របស់វាបានបិទរួច។ ដូច្នេះ Signal មិនចេញភ្លាមៗនៅកណ្ដាល M1 candle ទេ; វាចេញនៅពេលបិទ M1 candle ដំបូងដែលបំពេញលក្ខខណ្ឌ។ ការរង់ចាំបិទ candle គឺជាការការពារ false/repainting signal មិនមែនជាការពន្យារពេល scan ទេ។

កែ threshold ក្នុង `AURA_STYLES` (`worker/aura-engine.ts`)។

## ធាតុលើ chart
- **Buy / Sell** = signal M1 · **AURA** = grade A (score ≥ 80 និង HTF ស្រប ≥ 50)
- ◎ ក្រហម/ខៀវ = Liquidity sweep · ប្រអប់បៃតង/ក្រហម = Order Block (Big OB+ = impulse ខ្លាំង)
- **SL / TP1 / TP2** របស់ signal ចុងក្រោយ (✔ ពេលបានប៉ះ) · **Aura Line** = H1 EMA50 (baseline HTF)
- ម៉ោង UTC+7 · countdown ដល់ candle បន្ទាប់ · សំឡេង 🔔 ពេលមាន signal ថ្មី · news blackout strip

## API
`GET /api/aura/scan?symbol=XAUUSD&style=scalping|normal|shadow` (មិនទាមទារ AI key)។

## Local development
On Windows, run `run_windows.bat` to start the same Cloudflare Worker runtime used in production at `http://127.0.0.1:8787`. It installs the locked npm dependencies on first run and creates `.dev.vars` from `.env` (or `.dev.vars.example`) if needed. The launcher binds to localhost only and enables an authentication bypass only for that local development process; production still requires the `APP_PASSWORD` secret. The Aura scan can use Yahoo Finance when no Twelve Data key is configured.

## ដែនកំណត់ (សំខាន់)
- **Replay stats ជា in-sample** លើ ~300 candle M1 ដែលបានទាញ (≈5 ម៉ោង) គ្មាន spread/slippage។ ត្រូវតាមដាន win rate ពិតមុនទុកចិត្ត។ បើ candle ប៉ះទាំង SL និង TP គិតជា SL។
- Twelve Data free = 8 request/នាទី, 800/ថ្ងៃ។ Aura ហៅ 6 timeframe (cache M1 30 វិ, M5 60 វិ, H4/D1 10-15 នាទី)។ បើប្រើ poll ទាំងថ្ងៃ គួរប្រើ plan បង់ប្រាក់ ឬទុក Yahoo fallback (យឺតជាង)។ H4 ពី Yahoo គឺ aggregate ពី H1។
- ទីផ្សារមាសបិទចុងសប្តាហ៍; feed stale នឹងបង្ហាញ badge។
- ជំហាន deploy៖ `npm install` → `npm test` → `npx wrangler deploy`។

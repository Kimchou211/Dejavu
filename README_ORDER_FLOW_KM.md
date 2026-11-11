# v2.4 — Order Flow + តម្លៃ Pull-back + ការកែលម្អ Score

កំណែនេះបន្ថែមនៅក្នុង **Cloudflare Worker** (`worker/*.ts`) ដែលជា production របស់អ្នក (`wrangler.jsonc`)។

## ១. អ្វីដែលបន្ថែម

| ផ្នែក | ឯកសារ | ការងារ |
|---|---|---|
| Order flow analytics | `worker/order-flow.ts` | Delta, CVD divergence, relative volume, absorption, session VWAP, POC/VAH/VAL, ពិន្ទុ flow ក្នុងមួយ setup |
| Order flow feed | `worker/order-flow-feed.ts` | BTCUSD ← Binance taker-buy volume (ពិត) · XAUUSD ← COMEX GC=F futures volume (ប៉ាន់ស្មាន split) |
| Pull-back | `worker/ict-engine.ts` | `first_touch` (តម្លៃដំបូងដែលវា pull back មកដល់), `optimal` (limit ល្អបំផុត), `deep` (ចុងក្រោយ), `invalidation`, % retrace នៃ leg, ចម្ងាយជា ATR |
| AI mentor | `worker/ai.ts` | ទទួល `pullback` និង `order_flow` (ជា ratio ប៉ុណ្ណោះ គ្មាន volume ខ្ចៅ) ហើយ validator ទទួល VWAP/POC/VAH/VAL/LEG_END |
| UI | `static/index.html`, `ict.js`, `ui.css` | Panel "Pull-back & Order flow", checkbox "Order flow", VWAP/POC លើ chart, flow ក្នុងបញ្ជី setup |
| Tests | `tests/worker-order-flow.test.ts`, `tests/worker-api.test.ts` | ១៥ test ថ្មី (១៤ unit + ១ API) |

## ២. គុណភាពទិន្នន័យ (សំខាន់ ត្រូវអាន)

Order flow ពិតត្រូវការ data នៃអ្នកទិញ/អ្នកលក់ដែល aggressive។ **Spot XAUUSD មិនមាន volume កណ្តាលទេ** ហើយ feed បច្ចុប្បន្ន (Twelve Data/Yahoo) ផ្តល់តែ OHLC។ ដូច្នេះ៖

| គុណភាព | ប្រភព | ន័យ | Weight |
|---|---|---|---|
| `real_trades` | Binance BTCUSDT taker-buy volume | Delta ពិត (aggressor ពិត) | 100% |
| `futures_proxy` | Yahoo `GC=F` | Volume ពិតរបស់ futures តែ **split buy/sell ប៉ាន់ស្មាន** ពីរូបរាង candle | 60% |
| `ohlcv_proxy` | volume ក្នុង candle feed ខ្លួនឯង | split ប៉ាន់ស្មាន | 45% |
| `none` | គ្មាន volume | Order flow បិទ មិនបន្ថែមពិន្ទុ | 0% |

- UI បង្ហាញគុណភាពជានិច្ច (`REAL TAKER FLOW` / `ESTIMATED`)។ Reason នីមួយៗនៅលើ `Order flow (estimated):` ពេលជាការប៉ាន់ស្មាន។
- **Footprint, DOM (order book), heat-map, imbalance តាម price level មិនអាចធ្វើបានទេ** ជាមួយ feed ទាំងនេះ។ ត្រូវការ tick/L2 data បង់ប្រាក់ (ឧ. Databento, Rithmic, CME feed) ឬ API broker។

## ៣. របៀបអាន Pull-back

ឧទាហរណ៍ SELL: `Pull back UP to 4,002.70 (52% retrace)` = តម្លៃដំបូងដែល price ឡើងមកប៉ះ zone។
- **First touch** = គែម zone ជិត price ជាងគេ (ចាប់ផ្តើមមើល reaction)
- **Best limit entry** = កណ្តាល zone (ធម្មតា 62–79% retrace = OTE គឺល្អបំផុត)
- **Last-chance edge** = គែមឆ្ងាយ ក្រោយនេះមិនគួរចូល
- **Invalid** = stop ហួសចំណុចនេះ setup ស្លាប់
- `proximity`: AT_ZONE / NEAR (<0.75 ATR) / MODERATE (<2 ATR) / FAR

**Flow confirmation** (ពេល price ប៉ះ zone)៖ `CONFIRMED` = delta ត្រឡប់ទៅរក direction ឬមាន absorption · `AGAINST` = flow ប្រឆាំងខ្លាំង កុំចូល · `PENDING` = រង់ចាំ។

## ៤. ការកែលម្អ Score (ប្តូរពិត សូមអាន)

ពិន្ទុត្រូវធ្វើ rescale ដើម្បីកុំឲ្យ clamp ត្រឹម 100 ញឹកញាប់ (មុននេះ setup ល្អអាចបាន ~110 ដែលត្រូវកាត់)។

- **Counter-trend ត្រូវពិន័យ −15** (មុននេះ 0)។ Setup ទល់នឹង HTF bias អាចឈ្នះ 60 ងាយពេក ឥឡូវត្រូវស្ទើរតែល្អឥតខ្ចោះ។
- **Retrace depth** ថ្មី៖ entry នៅ 62–79% ក្នុង leg = +8 · 50–88% = +4 · ជ្រៅ >88% = −6 · រាក់ <38% = −4។
- **Displacement** ថ្មី៖ candle បំបែក structure ត្រូវមាន body ≥ 0.9 ATR (+4) បើគ្មាន (−4)។
- Weights ថ្មី៖ HTF 22/7 · sweep 20/15 · MSS 15 / BOS 8 · FVG 10 · OB 6 · kill zone 6 · CRT 5។
- Order flow បន្ថែម/ដក អតិបរមា ±15 (គុណនឹង weight គុណភាព)។
- **កែ bug**៖ សារ `CONFLICT` ធ្លាប់និយាយថា "engine says WAIT" ខុស ឥឡូវនិយាយ direction ពិតរបស់ engine។

`ICT_MIN_SCORE=60` នៅដដែល ប៉ុន្តែ scale ប្តូរ ដូច្នេះ score ក្នុង History ចាស់ មិនអាចប្រៀបធៀបផ្ទាល់នឹងថ្មីបានទេ។

## ៥. ការកំណត់

- `ORDER_FLOW=true|false` (Worker var, លំនាំដើម true) · `?flow=false` ក្នុង URL · checkbox "Order flow" ក្នុង UI។
- Flow feed បរាជ័យ = scan នៅតែដំណើរការ (ធ្លាក់ទៅ candle volume ឬបិទ flow) ហើយ UI ប្រាប់មូលហេតុ។ **Order flow មិនដែលរារាំង scan ទេ**។

## ៦. ដែនកំណត់ និងអ្វីដែលមិនទាន់ធ្វើ

- **Live feed មិនទាន់សាកល្បងពិត៖** sandbox គ្មាន internet ដូច្នេះ Binance/Yahoo GC=F ត្រូវបានតេស្តតែជាមួយ fixture និង mock (parser, merge, route, degradation)។ សូម deploy ហើយមើល `order_flow.source/quality` ក្នុង scan ដំបូង។ ប្រសិនបើ Binance ឆ្លើយ 451 (ទប់តាមតំបន់) ប្រព័ន្ធសាកល្បង mirror `data-api.binance.vision` ដោយស្វ័យប្រវត្តិ។
- **មិនបាន backtest៖** ការកែ score ផ្អែកលើ ICT logic និងតេស្តលើ data សិប្បនិម្មិត មិនមែនលើ win rate ពិតទេ។ ប្រើ Daily Win Rate ក្នុង Signal History ប្រៀបធៀបមុន/ក្រោយ ១–២ សប្តាហ៍។
- **Python (`app/`, Windows/Docker) មិនទាន់ត្រូវបាន port** ទេ។ មានតែ Worker។
- **Chart Analyzer រូបភាព** និង **Live Chat Terminal (EMA/RSI)** មិនមាន order flow (រូបភាពគ្មាន volume ពិត)។
- Futures GC=F មាន basis ធៀប spot ប៉ុន្តែ delta/volume មិនប៉ះពាល់ (ប្រើសមាមាត្រ)។
- Order flow មិនធានាឈ្នះ។ Score ជា confluence មិនមែនប្រូបាប៊ីលីតេទេ។

## ៧. Tests

```
npm test            # Worker (ត្រូវការ npm install សម្រាប់ @neondatabase/serverless)
```
ប្រតិបត្តិការនៅ sandbox៖ Worker ទាំងអស់ 47/47 (ជាមួយ stub Neon បណ្តោះអាសន្ន), `tsc --noEmit` គ្មាន error ថ្មី។

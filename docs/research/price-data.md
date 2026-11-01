# Israeli supermarket price-transparency data: research for ingestion

Researched 2026-10-31 via Firecrawl (direct curl to portals is proxy-blocked). Every claim is cited; anything not confirmed is marked **UNVERIFIED**.
Source abbreviations: [GOV](https://www.gov.il/he/departments/legalInfo/cpfta_prices_regulations) (official chain list, updated 12.08.2026), [REG](https://www.nevo.co.il/law_html/law01/501_131.htm) (the regulations, field annexes), [OIS-scraper](https://github.com/OpenIsraeliSupermarkets/israeli-supermarket-scarpers), [OIS-parsers](https://github.com/OpenIsraeliSupermarkets/israeli-supermarket-parsers), [SalSmart](https://github.com/SaharHalili95/price-comparison-platform) (working ingestion, measured 2026-10-21 from Israel), [SKILL](https://www.mcpinstall.com/skills/skills-il/food-and-dining/israeli-grocery-price-intelligence) (live probes 2026-08-27).

## Summary (10 lines)
1. Law: every large retailer publishes, per store, a Stores file plus Price/PriceFull and Promo/PromoFull XML files, gzip allowed, kept 3 months ([REG](https://www.nevo.co.il/law_html/law01/501_131.htm)).
2. Full files are due daily before store opening; delta files within 1 hour of a till update ([REG](https://www.nevo.co.il/law_html/law01/501_131.htm)).
3. No single portal. Cerberus/publishedprices (login + CSRF, or FTP) hosts Rami Levy, Yohananof, Osher Ad, Tiv Taam, Keshet, Dor Alon, Stop Market; Shufersal, Carrefour/Bitan, Super-Pharm, Hazi Hinam and Victory each have their own portal ([GOV](https://www.gov.il/he/departments/legalInfo/cpfta_prices_regulations), [SKILL](https://www.mcpinstall.com/skills/skills-il/food-and-dining/israeli-grocery-price-intelligence)).
4. Most chain sites block non-Israeli IPs; ingestion must run from an Israeli network ([OIS-scraper](https://github.com/OpenIsraeliSupermarkets/israeli-supermarket-scarpers), [SalSmart](https://github.com/SaharHalili95/price-comparison-platform)). This container cannot test any of it.
5. Dialects differ per chain (ChainId vs ChainID, "034" vs "34", ItemName vs ItemNm, Items vs Products vs Details); encodings differ (Stores in UTF-16LE+BOM, prices UTF-8; a zip can be named .gz) ([SalSmart](https://github.com/SaharHalili95/price-comparison-platform)).
6. Stores files have NO lat/lng; only Address, City (sometimes a CBS locality code), ZIPCode. You must geocode ([REG](https://www.nevo.co.il/law_html/law01/501_131.htm)).
7. ItemCode is the printed barcode when one exists, else a chain-internal code; ItemType is NOT reliable as the discriminator ([REG](https://www.nevo.co.il/law_html/law01/501_131.htm), [SO sample](https://stackoverflow.com/questions/30424816/what-is-performance-efficient-way-to-update-the-two-interconnected-table-in-post)).
8. Key rows by (ChainId, SubChainId, StoreId, ItemCode) from the file's own root element; files are per store, ~10 MB / ~13k items each ([SKILL](https://www.mcpinstall.com/skills/skills-il/food-and-dining/israeli-grocery-price-intelligence), [SalSmart](https://github.com/SaharHalili95/price-comparison-platform)).
9. Online shops have no documented barcode-search or add-to-cart deep links; Rami Levy and Shufersal only have undocumented, authenticated internal APIs (section 6).
10. Start with the Cerberus family (one client, 5+ chains; Rami Levy/Yohananof/Osher Ad verified working Oct 2026), then Carrefour/Bitan and Hazi Hinam (no login), then Shufersal.

## 1. Where each chain publishes

Chain IDs from scraper source ([OIS-scraper classes](https://github.com/OpenIsraeliSupermarkets/israeli-supermarket-scarpers/tree/main/il_supermarket_scarper/scrappers)). "Login" = Cerberus username, empty password unless noted ([GOV](https://www.gov.il/he/departments/legalInfo/cpfta_prices_regulations)).

| Chain | ChainId | Base URL | Auth | Listing type |
|---|---|---|---|---|
| Shufersal (incl. BE) | 7290027600007 | http://prices.shufersal.co.il/ | none | Paged HTML table; downloads are expiring signed Azure Blob URLs |
| Rami Levy (incl. Super Cofix, Quik) | 7290058140886 | https://url.publishedprices.co.il/login | user `RamiLevi` | Cerberus (web login or FTP) |
| Victory | 7290696200003, 7290058103393 | https://laibcatalog.co.il/victory/index.html | none | JSON API behind JS page |
| Yohananof | 7290803800003 | https://url.publishedprices.co.il/login | user `yohananof` | Cerberus |
| Osher Ad | 7290103152017 | https://url.publishedprices.co.il/login | user `osherad` | Cerberus |
| Hazi Hinam | 7290700100008 | https://shop.hazi-hinam.co.il/Prices | none | Paged HTML table, query `?d=YYYY-MM-DD&t=..&p=N` |
| Tiv Taam | 7290873255550 | https://url.publishedprices.co.il/login | user `TivTaam` | Cerberus |
| Mega / Carrefour / Yeinot Bitan | 7290055700007 | https://prices.carrefour.co.il/ | none | HTML page with inline JS `files` array |
| Super-Pharm (pharmacy) | 7290172900007 | http://prices.super-pharm.co.il/ | none | Paged MVC grid, direct `Download/*.gz` links |
| Stop Market | 7290639000004 | https://url.retail.publishedprices.co.il/login | user `Stop_Market` | Cerberus |
| Dor Alon | 7290492000005 | https://url.publishedprices.co.il/login | user `doralon` | Cerberus |
| Keshet Taamim | 7290785400000 | https://url.publishedprices.co.il/login | user `Keshet` | Cerberus |
| Machsanei Hashuk | 7290661400001, 7290633800006 | https://laibcatalog.co.il/mshuk/index.html | none | JSON API behind JS page |

Other Cerberus users on [GOV](https://www.gov.il/he/departments/legalInfo/cpfta_prices_regulations): `freshmarket` (Fresh Market/Super Dosh), `politzer`, `SalachD` and the Paz/Yellow/Super Yuda accounts (these publish a NON-empty password on gov.il; not reproduced here, read it there).
Small chains (King Store, Maayan 2000, Good Pharm, Shuk Ahir, Super Sapir, Zol VeBegadol, Bareket, Shefa Birkat Hashem) use `<name>.binaprojects.com/Main.aspx` public listings ([GOV](https://www.gov.il/he/departments/legalInfo/cpfta_prices_regulations)). Wolt publishes too: https://wm-gateway.wolt.com/isr-prices/public/v1/index.html ([GOV](https://www.gov.il/he/departments/legalInfo/cpfta_prices_regulations)).

### Access mechanics per platform
- **Cerberus, two transports.**
  - FTP: the maintained scraper connects to host `url.retail.publishedprices.co.il`, path `/`, chain username, empty password, and keeps `.gz`/`.xml` files ([cerberus.py](https://raw.githubusercontent.com/OpenIsraeliSupermarkets/israeli-supermarket-scarpers/main/il_supermarket_scarper/engines/cerberus.py)). FTP vs FTPS and port: **UNVERIFIED** (did not read the FTP helper).
  - Web: GET `/login`, read `<meta name="csrftoken">` and keep cookie; POST `/login/user` (`username`, `password`, `csrftoken`; valid chain answers 302, invalid answers 200 with the form); GET `/file` and read the NEW csrftoken; **POST** `/file/json/dir` with DataTables paging params (a GET returns HTTP 200 with `{"aaData":[],"error":"Invalid request method used for this operation."}`); download `GET /file/d/<filename>`; no session gives 302 not the file ([SKILL](https://www.mcpinstall.com/skills/skills-il/food-and-dining/israeli-grocery-price-intelligence)). SalSmart's client does CSRF login with retries/backoff and loaded Rami Levy, Yohananof, Osher Ad on 2026-10-21 ([SalSmart](https://github.com/SaharHalili95/price-comparison-platform)).
  - Not on Cerberus despite folklore: Victory, Super-Pharm, Good Pharm, Bareket, Mega (login fails); Hazi Hinam logs in but lists nothing ([SKILL](https://www.mcpinstall.com/skills/skills-il/food-and-dining/israeli-grocery-price-intelligence)).
- **Shufersal.** List with `GET https://prices.shufersal.co.il/FileObject/UpdateCategory?catID=<N>&storeId=0` (1 Price, 2 PriceFull, 3 Promo, 4 PromoFull, 5 Stores), paged with `?page=N`; links point to `pricesprodpublic.blob.core.windows.net` with an `se=` expiry about 30 min out, so list immediately before each download ([SKILL](https://www.mcpinstall.com/skills/skills-il/food-and-dining/israeli-grocery-price-intelligence), [shufersal.py](https://raw.githubusercontent.com/OpenIsraeliSupermarkets/israeli-supermarket-scarpers/main/il_supermarket_scarper/scrappers/shufersal.py)). Warning: SalSmart removed Shufersal on 2026-10-29 because "its portal timed out on every run" ([SalSmart](https://github.com/SaharHalili95/price-comparison-platform)); the OIS project flags Bareket and Quik, not Shufersal, as flaky.
- **Carrefour/Bitan.** Inline JS `const path = '<yyyyMMdd>'` and `const files = [...]` in the page; download at `https://prices.carrefour.co.il/<path>/<filename>`; history via `?p=./YYYYMMDD` ([publishprice.py](https://raw.githubusercontent.com/OpenIsraeliSupermarkets/israeli-supermarket-scarpers/main/il_supermarket_scarper/engines/publishprice.py), [SKILL](https://www.mcpinstall.com/skills/skills-il/food-and-dining/israeli-grocery-price-intelligence)). Yeinot Bitan and Mega stores are published inside the Carrefour Israel feed; standalone `prices.mega.co.il` answers 403 ([SKILL](https://www.mcpinstall.com/skills/skills-il/food-and-dining/israeli-grocery-price-intelligence)). Whether Mega still appears as a store banner: **UNVERIFIED** beyond that note.
- **Victory / Machsanei Hashuk (laibcatalog).** `GET https://laibcatalog.co.il/webapi/api/getbranches?edi=<chainId>`, `GET .../webapi/api/getfiles?edi=<chainId>` (returns the whole chain catalog regardless of branch), download `https://laibcatalog.co.il/webapi/<primaryChainId>/<fileName>`; the old `matrixcatalog.co.il` host is dead ([victory.py](https://raw.githubusercontent.com/OpenIsraeliSupermarkets/israeli-supermarket-scarpers/main/il_supermarket_scarper/scrappers/victory.py), [machsani_ashuk.py](https://raw.githubusercontent.com/OpenIsraeliSupermarkets/israeli-supermarket-scarpers/main/il_supermarket_scarper/scrappers/machsani_ashuk.py)). Conflict: SKILL's probe on 2026-08-27 got refused connections from laibcatalog; the scraper repo (commits through Oct 2026) treats it as the working source. Treat as **UNVERIFIED** from here.
- **Hazi Hinam.** Table rows: published date, file type, name (td3, scraper appends `.xml.gz`), size KB, download link td6; params `d` (date), `t` (1 price, 2 promo, 3 stores), pagination `p` ([hazihinam.py](https://raw.githubusercontent.com/OpenIsraeliSupermarkets/israeli-supermarket-scarpers/main/il_supermarket_scarper/scrappers/hazihinam.py)).
- **Super-Pharm.** Grid filter params `Category-equals` (Stores/Price/PriceFull/PromoFull), `Date-equals=dd/mm/YYYY`, `&page=N` ([super_pharm.py](https://raw.githubusercontent.com/OpenIsraeliSupermarkets/israeli-supermarket-scarpers/main/il_supermarket_scarper/scrappers/super_pharm.py)). Range is drugstore SKUs only, no fresh food ([SKILL](https://www.mcpinstall.com/skills/skills-il/food-and-dining/israeli-grocery-price-intelligence)).
- **Geo-blocking.** "Most chains' sites block access from outside of Israel"; a weekly job publishes per-chain reachability from outside vs inside Israel ([OIS-scraper README](https://github.com/OpenIsraeliSupermarkets/israeli-supermarket-scarpers), [report](https://github.com/OpenIsraeliSupermarkets/israeli-supermarket-scarpers/blob/reports/reachability/reachability.md)). Fallback: the daily Kaggle dump [erlichsefi/israeli-supermarkets-2024](https://www.kaggle.com/datasets/erlichsefi/israeli-supermarkets-2024) (raw files scraped every 4 h, pushed nightly; CC BY-NC-SA 3.0 IGO, i.e. non-commercial, check before use).

## 2. File types, naming, compression, cadence

| Type | Meaning | Source |
|---|---|---|
| `Stores` / `StoresFull` | Chain store list | [REG](https://www.nevo.co.il/law_html/law01/501_131.htm), [SKILL](https://www.mcpinstall.com/skills/skills-il/food-and-dining/israeli-grocery-price-intelligence) |
| `PriceFull` | Full daily snapshot of items + prices, one store | same |
| `Price` | Delta since last update (absent row = unchanged, not deleted) | [SKILL](https://www.mcpinstall.com/skills/skills-il/food-and-dining/israeli-grocery-price-intelligence) |
| `PromoFull` / `Promo` | Full / delta promotions | same |

- **Naming.** Law only requires a fixed prefix of chain code + sub-chain code + store number plus a timestamp ([REG](https://www.nevo.co.il/law_html/law01/501_131.htm)). Observed shapes (do not rely on one regex; match case-insensitively, parse from the right, test `pricefull`/`promofull` BEFORE `price`/`promo`):
  - 5-segment: `PriceFull7290103152017-001-034-20261021-110502.gz` ([Osher fixture](https://github.com/SaharHalili95/price-comparison-platform/tree/main/backend/tests/fixtures/feeds/osher-ad))
  - 3-segment: `pricefull7290058140886-039-202610210516.gz` ([Rami fixture](https://github.com/SaharHalili95/price-comparison-platform/tree/main/backend/tests/fixtures/feeds/rami-levy)); both shapes coexisted in one live Rami Levy listing (44 vs 93 files) ([SKILL](https://www.mcpinstall.com/skills/skills-il/food-and-dining/israeli-grocery-price-intelligence)).
  - Stores: `Stores7290058140886-000-20261021-050501.xml` (plain `.xml`, sub-chain `000`).
  - Cerberus-side filename filters used by OIS: `store`, `price[0-9]`, `promo[0-9]`, `pricef`, `promof` ([cerberus.py](https://raw.githubusercontent.com/OpenIsraeliSupermarkets/israeli-supermarket-scarpers/main/il_supermarket_scarper/engines/cerberus.py)).
- **Compression.** Law requires downloads in XML, Excel, Gzip and Deflate ([REG](https://www.nevo.co.il/law_html/law01/501_131.htm)). In practice gzip, plain XML, and zip archives that carry a `.gz` name; detect by magic bytes (`1f8b` gzip, `PK` zip), not extension ([SalSmart parsers.py](https://raw.githubusercontent.com/SaharHalili95/price-comparison-platform/main/backend/app/ingest/parsers.py)).
- **Encoding.** Stores files in UTF-16 (I read the Osher Stores fixture bytes: BOM `FF FE`, UTF-16LE, CRLF), price files UTF-8 ([fixture](https://raw.githubusercontent.com/SaharHalili95/price-comparison-platform/main/backend/tests/fixtures/feeds/osher-ad/Stores7290103152017-000-20261021-080500.xml), [SalSmart](https://github.com/SaharHalili95/price-comparison-platform)). windows-1255: **UNVERIFIED** (no source mentions it); let the XML parser honor the declaration/BOM.
- **Cadence (law).** Full price+promo files every day a store is open, no later than opening; an update file within 1 hour of the till update with all changes that day; new Stores file within a day of a change; retention 3 months; site availability 99.5% ([REG](https://www.nevo.co.il/law_html/law01/501_131.htm)). Observed: full files overnight ~01:00-05:00 IL, deltas several times a day ([SKILL](https://www.mcpinstall.com/skills/skills-il/food-and-dining/israeli-grocery-price-intelligence)). Staleness is real: some store files last updated in 2024 ([SalSmart](https://github.com/SaharHalili95/price-comparison-platform)).
- **Size.** One store's PriceFull ≈ 13,000 items ≈ 10 MB XML; Rami Levy 99 stores = 1.01M prices in 122 s, Yohananof 48 stores = 477k, Osher Ad 25 stores = 154k ([SalSmart](https://github.com/SaharHalili95/price-comparison-platform)). Stream-parse; a 34 MB file via lxml `iterparse` grew memory ~1 MB vs ~270 MB as a tree.

## 3. XML schemas

Regulation field lists (the required "uniform" fields): Annex 1 stores, Annex 2 items/prices, Annex 3 promotions, Annex 4 promo codes ([REG](https://www.nevo.co.il/law_html/law01/501_131.htm)). Real tag names below come from fixtures/parsers; both use mixed casing.

### 3a. Stores
Tags seen in a real 2026-10-21 Osher Ad file ([fixture](https://raw.githubusercontent.com/SaharHalili95/price-comparison-platform/main/backend/tests/fixtures/feeds/osher-ad/Stores7290103152017-000-20261021-080500.xml)): `Root > ChainID, ChainName, LastUpdateDate, LastUpdateTime, SubChains > SubChain > SubChainID, SubChainName, Stores > Store > StoreID, BikoretNo, StoreType, StoreName, Address, City, ZIPCode`. That is the default shape OIS expects (`SubChains/Stores`, id `StoreId`) ([base.py](https://raw.githubusercontent.com/OpenIsraeliSupermarkets/israeli-supermarket-parsers/main/il_supermarket_parsers/engines/base.py)).
- `StoreType`: 1 physical, 2 online (address = site URL), 3 physical+online ([REG](https://www.nevo.co.il/law_html/law01/501_131.htm)). `BikoretNo` = check digit.
- `City` is a CBS locality code in this fixture (`3000` = Jerusalem), or `0` for unknown, or a name in other chains ([SalSmart](https://github.com/SaharHalili95/price-comparison-platform)). Locality list: [CBS](https://www.cbs.gov.il/he/publications/Pages/2019/%D7%99%D7%99%D7%A9%D7%95%D7%91%D7%99%D7%9D-%D7%91%D7%99%D7%A9%D7%A8%D7%90%D7%9C.aspx) (exact data.gov.il resource id **UNVERIFIED**).
- Variations: Shufersal legacy `<STORES>` with `CHAINID`, `STOREID`, `LASTUPDATEDATE` upper case vs newer `SubChains/Stores` ([shufersal.py](https://raw.githubusercontent.com/OpenIsraeliSupermarkets/israeli-supermarket-parsers/main/il_supermarket_parsers/parsers/shufersal.py)); Victory legacy flat `<Store>` list, `StoreID`, no roots ([victory.py](https://raw.githubusercontent.com/OpenIsraeliSupermarkets/israeli-supermarket-parsers/main/il_supermarket_parsers/parsers/victory.py)); Tiv Taam `StoreId` + `SubChainId`; extra noise tags `XmlDocVersion`, `DllVerNo` ([other.py](https://raw.githubusercontent.com/OpenIsraeliSupermarkets/israeli-supermarket-parsers/main/il_supermarket_parsers/parsers/other.py)).

```xml
<!-- modeled on the Osher Ad Stores fixture; values illustrative -->
<Root><ChainID>7290103152017</ChainID><ChainName>Osher Ad</ChainName>
 <LastUpdateDate>2026-10-21</LastUpdateDate><LastUpdateTime>08:05:00.430</LastUpdateTime>
 <SubChains><SubChain><SubChainID>001</SubChainID><SubChainName>1</SubChainName>
  <Stores><Store><StoreID>001</StoreID><BikoretNo>6</BikoretNo><StoreType>1</StoreType>
   <StoreName>Ashdod</StoreName><Address>Example St 11</Address><City>874</City><ZIPCode>2303401</ZIPCode>
  </Store></Stores></SubChain></SubChains></Root>
```

### 3b. PriceFull / Price
Item tags from a real sample ([SO](https://stackoverflow.com/questions/30424816/what-is-performance-efficient-way-to-update-the-two-interconnected-table-in-post)): `PriceUpdateDate, ItemCode, ItemType, ItemName, ManufacturerName, ManufactureCountry, ManufacturerItemDescription, UnitQty, Quantity, UnitOfMeasure, bIsWeighted, QtyInPackage, ItemPrice, UnitOfMeasurePrice, AllowDiscount, ItemStatus` (+ `ItemId` in that 2015 sample). Header: `ChainId, SubChainId, StoreId, BikoretNo` (OIS `roots`) ([base.py](https://raw.githubusercontent.com/OpenIsraeliSupermarkets/israeli-supermarket-parsers/main/il_supermarket_parsers/engines/base.py)).
Meaning (from [REG](https://www.nevo.co.il/law_html/law01/501_131.htm) Annex 2 plus a [real value](https://www.linkedin.com/pulse/%D7%94%D7%9E%D7%97%D7%99%D7%94-%D7%99%D7%A7%D7%A8%D7%94-%D7%90%D7%95%D7%98%D7%95%D7%9E%D7%A6%D7%99%D7%94-%D7%AA%D7%A2%D7%96%D7%95%D7%A8-%D7%9C%D7%94%D7%A4%D7%97%D7%99%D7%AA-%D7%9E%D7%97%D7%99%D7%A8%D7%99%D7%9D-pavel-gomon) `UnitQty=מיליליטרים, Quantity=360.00`): `UnitQty` = unit-of-quantity word, `Quantity` = amount, `UnitOfMeasure` = price basis such as "100 גרם", `QtyInPackage` = items per pack, `ItemStatus` 0 removed / 1 price update / 2 new. `AllowDiscount` mapping to the law's "participates in promo" flag: **UNVERIFIED**.
Weighted items: law says internal barcode of a weighed item is per 1 kg / 1 l / 1 m; but real `UnitOfMeasure` for `bIsWeighted=1` includes `קילוגרם`, `ק"ג`, `100 גרם`, even `100 ק"ג` (174 of 560 weighted Carrefour items said 100 g), so normalize before comparing ([SKILL](https://www.mcpinstall.com/skills/skills-il/food-and-dining/israeli-grocery-price-intelligence)).

Known variations:
| Variation | Evidence |
|---|---|
| `ChainID/SubChainID/StoreID` vs `ChainId/SubChainId/StoreId`; IDs padded `"034"` vs `"34"` | [SalSmart](https://github.com/SaharHalili95/price-comparison-platform) |
| `ItemName` vs `ItemNm`; `ManufacturerName` vs `ManufactureName` vs `ManufacturerName`; `PriceUpdateDate` vs `PriceUpdateTime` | [parsers.py](https://raw.githubusercontent.com/SaharHalili95/price-comparison-platform/main/backend/app/ingest/parsers.py) |
| Row wrapper `Items` (default) vs `Products` vs `Details` (older Super-Pharm, Yellow) | [super_pharm.py](https://raw.githubusercontent.com/OpenIsraeliSupermarkets/israeli-supermarket-parsers/main/il_supermarket_parsers/parsers/super_pharm.py), [other.py](https://raw.githubusercontent.com/OpenIsraeliSupermarkets/israeli-supermarket-parsers/main/il_supermarket_parsers/parsers/other.py) |
| Tiv Taam sometimes `NewDataSet/item` (ADO.NET dump, lower-case `item`) | [tiv_taam.py](https://raw.githubusercontent.com/OpenIsraeliSupermarkets/israeli-supermarket-parsers/main/il_supermarket_parsers/parsers/tiv_taam.py) |
| Dates `2026-05-10T11:36:13.000` vs `2025-01-19 16:03:55` vs `2014-03-08 22:25:29` | [SalSmart](https://github.com/SaharHalili95/price-comparison-platform) |
| `Root` vs `root` casing, child `Product` instead of `Item` | **UNVERIFIED** (match tags case-insensitively anyway) |

```xml
<!-- Item block is the real SO sample; Root header per OIS roots; values illustrative -->
<Root><ChainId>7290058140886</ChainId><SubChainId>001</SubChainId><StoreId>039</StoreId><BikoretNo>5</BikoretNo>
 <Items Count="1"><Item>
  <PriceUpdateDate>2026-10-21 05:16</PriceUpdateDate><ItemCode>7290100701799</ItemCode><ItemType>1</ItemType>
  <ItemName>Table salt 1 kg</ItemName><ManufacturerName>unknown</ManufacturerName><ManufactureCountry>unknown</ManufactureCountry>
  <ManufacturerItemDescription>Table salt 1 kg</ManufacturerItemDescription><UnitQty>kg</UnitQty><Quantity>1.00</Quantity>
  <UnitOfMeasure>100 g</UnitOfMeasure><bIsWeighted>0</bIsWeighted><QtyInPackage>0</QtyInPackage>
  <ItemPrice>1.40</ItemPrice><UnitOfMeasurePrice>0.1400</UnitOfMeasurePrice><AllowDiscount>1</AllowDiscount><ItemStatus>1</ItemStatus>
 </Item></Items></Root>
```

### 3c. PromoFull / Promo
Wrapper `Promotions` (older `Sales`/`Details`), row id `PromotionId` (`PromotionID` at Victory/Bina), header same as prices, date col `PromotionUpdateDate` (or `PromotionUpdateTime`) ([base.py](https://raw.githubusercontent.com/OpenIsraeliSupermarkets/israeli-supermarket-parsers/main/il_supermarket_parsers/engines/base.py), [other.py](https://raw.githubusercontent.com/OpenIsraeliSupermarkets/israeli-supermarket-parsers/main/il_supermarket_parsers/parsers/other.py)). Two dialects: **Cerberus**: `RewardType, MinQty, DiscountedPrice, DiscountRate` directly on `<Promotion>`, club id at `Clubs/ClubId` (int). **Shufersal/Carrefour**: `PromotionID, PromotionDescription, MinNoOfItemOffered, RedemptionLimit, PromotionDays`, flat string `ClubID` like `0 - כלל הלקוחות`; reward fields one level down at `Groups/Group/PromotionItems/PromotionItem`; spelling varies (`MinPurchaseAmount` vs `MinPurchaseAmnt`, `MinNoOfItemOffered` vs `MinNoOfItemOfered`) ([SKILL](https://www.mcpinstall.com/skills/skills-il/food-and-dining/israeli-grocery-price-intelligence)). `RewardType` meanings are NOT specified anywhere found: **UNVERIFIED**; apply only after reading `PromotionDescription`. Law's promo codes 0-11 (annex 4) are a different field ([REG](https://www.nevo.co.il/law_html/law01/501_131.htm)).
```xml
<!-- Cerberus dialect, ASSEMBLED from the tag lists above; illustrative, not a captured file -->
<Root><ChainId>7290058140886</ChainId><SubChainId>001</SubChainId><StoreId>039</StoreId><BikoretNo>5</BikoretNo>
 <Promotions><Promotion><PromotionId>678445</PromotionId><PromotionDescription>2 for 10</PromotionDescription>
  <PromotionStartDate>2026-10-20</PromotionStartDate><PromotionStartHour>00:00:00</PromotionStartHour>
  <PromotionEndDate>2026-10-31</PromotionEndDate><PromotionEndHour>23:59:00</PromotionEndHour>
  <PromotionUpdateDate>2026-10-20 06:00:00</PromotionUpdateDate><RewardType>2</RewardType><MinQty>2</MinQty>
  <DiscountedPrice>10.00</DiscountedPrice><Clubs><ClubId>0</ClubId></Clubs>
  <PromotionItems><Item><ItemCode>7290100701799</ItemCode><ItemType>1</ItemType></Item></PromotionItems>
 </Promotion></Promotions></Root>
```

## 4. Store geolocation
- **No coordinates are published.** Annex 1 fields: chain/sub-chain/store codes, check digit, type, names, address, locality, ZIP, last-update date/time; no lat/lng ([REG](https://www.nevo.co.il/law_html/law01/501_131.htm)); confirmed in the real fixture tag list above.
- **How OSS projects do it.** OpenIsraeliSupermarkets has an `address-resolution-service` library that resolves a store record to validated city, street, house number, ZIP and lat/lon; "expensive lookups (geocoding, Israel Post ZIPs, LLM research) are cached in Kaggle datasets"; processed stores "now carry lat/lon" in their API ([org README](https://github.com/OpenIsraeliSupermarkets)). The repo URL returned 404 when fetched (private or renamed), so reuse is **UNVERIFIED**. Underlying geocoder not stated: **UNVERIFIED**.
- **Public datasets found.**
  - Live OIS API with enriched stores: https://data.openisraelisupermarkets.co.il/ (field schema, licence, store coverage **UNVERIFIED**).
  - Stale: [yonicd/supermarketprices `Stores/`](https://github.com/yonicd/supermarketprices) has per-chain store XML + a "stores latlon csv" (commit 2015-08-14), ~16 chains; too old to rely on.
  - No maintained, licensed, standalone "Israeli supermarket branch coordinates" dataset on GitHub or data.gov.il was found. Search was not exhaustive.
- **Recommended approach (our own).** Normalize `Address + City(+ZIP)`, decode CBS locality codes, then geocode with Nominatim (https://nominatim.org/release-docs/latest/api/Search/, structured query `street/city/postalcode`) or Google Geocoding; cache by (chain, sub, store, address hash) and only re-geocode when the Stores file address changes. Hosted Nominatim rate/usage limits and Google pricing: **UNVERIFIED** (not researched; self-host or check current terms). Expect failures on addresses like "Industrial Zone" or no house number; keep a manual-override table and fall back to city centroid.

## 5. Matching items across chains
- **Rule.** Annex 2: the barcode field is "the barcode printed on the product; if none, the chain's internal barcode"; a companion flag says 0 = internal, 1 = other (printed barcode); for weighed products the internal barcode's unit quantity is 1 kg / 1 l / 1 m ([REG](https://www.nevo.co.il/law_html/law01/501_131.htm)). In XML that is `ItemCode` + `ItemType` ([SO](https://stackoverflow.com/questions/30424816/what-is-performance-efficient-way-to-update-the-two-interconnected-table-in-post)).
- **Reality.** Packaged goods carry EAN-13 (Israeli prefix 729, imports keep foreign prefixes) so exact barcode joins work; internal codes are short, chain-specific and mean different things per chain (`100` = tomatoes at Rami Levy); store-brand/internal items cannot be cross-matched ([SalSmart](https://github.com/SaharHalili95/price-comparison-platform), [SKILL](https://www.mcpinstall.com/skills/skills-il/food-and-dining/israeli-grocery-price-intelligence)). The OIS matching service does "exact barcode for global items, text similarity for chain-internal items" ([org README](https://github.com/OpenIsraeliSupermarkets)).
- **Caveat on `ItemType`.** The SO sample has `ItemType=0` on an EAN-looking `7290100701799`, so do not trust the flag alone. Treat `ItemCode` as a GTIN when it is all digits, length 8/12/13/14 and passes the GS1 mod-10 check, then pad to GTIN-14 for the join key; otherwise keep it as `(chain_id, internal_code)`. This heuristic is mine, not from a source.
- Bonus: many staples (e.g. controlled dairy) are price-capped, so cross-chain spread is near zero; lists of controlled products were not retrievable ([SKILL](https://www.mcpinstall.com/skills/skills-il/food-and-dining/israeli-grocery-price-intelligence)).

## 6. Online ordering and deep links
Honest status: no chain documents a "search by barcode" or "add to cart" URL. Everything cart-related found is reverse-engineered, authenticated, and breakable.

| Chain | Online shop | Search / cart deep link |
|---|---|---|
| Shufersal | https://www.shufersal.co.il/online/he/ | `.../online/he/search?text=<q>` **UNVERIFIED**: my fetch of it returned only a maintenance image (Firecrawl, 2026-10-31). Product codes look like `P_4127329` (internal, not EAN). Cart only via logged-in browser automation ([shufersal-automation](https://github.com/eshaham/shufersal-automation), [MCP](https://agentskills.co.il/en/mcp/shufersal)) |
| Rami Levy | https://www.rami-levy.co.il/he/online/market ([post](https://www.facebook.com/Rami.Levy.Shivuk.Hashikma/videos/%D7%9C%D7%A7%D7%95%D7%97%D7%95%D7%AA-%D7%A8%D7%9E%D7%99-%D7%9C%D7%95%D7%99-%D7%91%D7%90%D7%99%D7%A0%D7%98%D7%A8%D7%A0%D7%98-%D7%96%D7%94-%D7%91%D7%A9%D7%91%D7%99%D7%9C%D7%9B%D7%9D-%D7%9E%D7%96%D7%9E%D7%99%D7%A0%D7%99%D7%9D-%D7%94%D7%99%D7%95%D7%9D-%D7%9E%D7%A7%D7%91%D7%9C%D7%99%D7%9D-%D7%94%D7%99%D7%95%D7%9D-%D7%9E%D7%96%D7%9E%D7%99%D7%A0%D7%99%D7%9D-%D7%91%D7%99%D7%9E%D7%99%D7%9D-%D7%90-%D7%91-%D7%A2%D7%93/995460359602959/)) | `/he/online/search?q=` **UNVERIFIED**. Internal API (undocumented, Feb 2025 capture): POST `/api/catalog` body `{"q":"..","aggs":1,"store":"331"}` and POST `/api/v2/cart` with Rami's own numeric item ids, Bearer token + cookies required ([API notes](https://github.com/shilomagen/rami-levy-mcp/blob/main/Rami-Levy-API.md), [repo](https://github.com/shilomagen/rami-levy-mcp)). Ids are not barcodes; searching by barcode via `q`: **UNVERIFIED** |
| Victory | https://www.victoryonline.co.il/ (linked from [victory.co.il](https://victory.co.il/)) | **UNVERIFIED** (not researched) |
| Yohananof | https://yochananof.co.il/ ([site](https://yochananof.co.il/)) | **UNVERIFIED** |
| Osher Ad | https://osherad.co.il/ ([site](https://osherad.co.il/en/osher-ad/)) | **UNVERIFIED** |
| Hazi Hinam | https://shop.hazi-hinam.co.il/ (price files at `/Prices`) | **UNVERIFIED** |
| Tiv Taam, Carrefour/Mega/Bitan, Keshet, Stop Market, Machsanei Hashuk | not researched | **UNVERIFIED** |

Practical plan: link out to the chain's shop home (or a text search the user can verify), show the barcode/name so the user can paste it, and treat true cart handoff as out of scope. Scraping/automating shops may breach site terms; not assessed.

## 7. Recommended ingestion approach

**Order of chains.**
1. **Cerberus client first** (one implementation, many chains): Rami Levy, Yohananof, Osher Ad verified loading 2026-10-21 (≈1.64M prices, 174 stores, 3.5 min) ([SalSmart](https://github.com/SaharHalili95/price-comparison-platform)); Tiv Taam, Keshet, Dor Alon, Stop Market differ only by username. Needs a free login (public credentials) but no account.
2. **Carrefour/Bitan** (`prices.carrefour.co.il`): no login, plain GET, file list inlined in HTML, 5-segment names ([SKILL](https://www.mcpinstall.com/skills/skills-il/food-and-dining/israeli-grocery-price-intelligence)).
3. **Hazi Hinam** (`shop.hazi-hinam.co.il/Prices`): no login, plain table, paged.
4. **Shufersal** (largest chain, but signed expiring URLs and reported timeouts) and **Victory/Hashuk** (laibcatalog, reachability unconfirmed) after the above are stable. Skip Super-Pharm for grocery comparison.
If "no login, plain listing" is the only criterion: Carrefour, Hazi Hinam, Shufersal.

**Pipeline sketch.**
1. Run the fetcher inside Israel (e.g. SalSmart targets an Oracle VM in Jerusalem); one CronJob per chain, own schedule, retries/backoff on timeout/5xx/429, identifying User-Agent, 30 s timeout ([SalSmart](https://github.com/SaharHalili95/price-comparison-platform)).
2. List files (platform-specific, section 1) right before each download; classify by name case-insensitively (longest prefix first); skip files whose timestamp is not newer than the last processed one for that store.
3. Download; require 2xx AND a valid payload (a 302 stub or HTML login page is not data). Sniff compression by magic bytes; gunzip / unzip first member.
4. Stream-parse with `lxml.iterparse`, tags matched case-insensitively, free elements after use; sniff encoding via BOM/declaration (UTF-16 Stores); read ChainId/SubChainId/StoreId from the file's root and normalize padding (`"034"` to `34`).
5. Upsert: `stores` (key chain, sub-chain, store; geocode on address change), `products` (key GTIN-14 or `(chain, internal_code)`; name, manufacturer, unit), `prices` (key chain, sub, store, item; write history row only when price changes, which made same-day reloads add 0 rows in SalSmart).
6. Apply `Price` deltas in filename-timestamp order on top of the newest `PriceFull` for that store; absent rows are unchanged; honor `ItemStatus` (0 = removed). Daily PriceFull alone is enough for an MVP.
7. Promotions: ingest PromoFull per dialect, but only apply to baskets when within date/hour window, not club-only, and `RewardType` semantics are confirmed; otherwise display as info only.
8. Per-chain freshness status (`success / partial / stale if newest file >2 days / failed`) and alert on stale feeds ([SalSmart](https://github.com/SaharHalili95/price-comparison-platform)).

**Risks to plan around:** geo-blocking (needs Israeli egress), portal layouts change without notice (OIS runs daily live tests; see [status](https://openisraelisupermarkets.github.io/Status/)), data-licence terms of any third-party dump, and the fact that nothing in this document was exercised live from this container.

## Verified live on 2026-11-01

Run from this container (US egress via an HTTPS proxy, Node's `fetch` needs `NODE_USE_ENV_PROXY=1`) with `npm run fetch` (`apps/api/src/jobs/fetch-prices.ts`, portals in `apps/api/src/providers/price-portals/`), then `npm run ingest` into a scratch DB. This supersedes the **UNVERIFIED** marks above where they conflict.

**Cerberus (`url.publishedprices.co.il`)**, confirmed step by step: `GET /login` sets cookie `cftpSID` and has `<meta name="csrftoken">`; the form posts to `/login/user` with `r`, `username`, `password` (empty), `csrftoken`; success = `302 Location: /file` plus a new `cftpSID`. `GET /file` carries a fresh csrftoken. `GET /file/json/dir` answers 200 `{"aaData":[],"error":"Invalid request method used for this operation."}`; `POST /file/json/dir` with `sEcho=1&iDisplayStart=0&iDisplayLength=100000&cd=/&csrftoken=<token>` returns every file (Rami Levy: 1089) as `{name, size, time, type:"file"}`. `GET /file/d/<name>` returns the bytes (`Content-Type: text/xml` for Stores).
- Users that log in with an empty password: `RamiLevi`, `yohananof`, `osherad`, `TivTaam`, `Keshet`, `doralon`, `Stop_Market`, `freshmarket`, `politzer`, `SalachD`.
- `url.retail.publishedprices.co.il` fails TLS: its certificate is `*.publishedprices.co.il`, which does not cover two labels (`ERR_TLS_CERT_ALTNAME_INVALID`). `Stop_Market` works on the main host.
- Listings mix both name shapes and both casings (Rami Levy: `PriceFull` 159 + `pricefull` 21, the lower-case ones 3-segment like `pricefull7290058140886-039-202611010514.gz`). Keshet's listing also holds a stale `PriceFull7290055700007-0820-202403281445.gz` (Carrefour's ChainId, 2024), so filter by the chain's own ChainId.

**Shufersal**: `GET https://prices.shufersal.co.il/FileObject/UpdateCategory?catID=<n>&storeId=0` works (5 Stores: 1 row; 2 PriceFull: 20 rows/page, 22 pages). Rows are `<tr class="webgrid-row-style|webgrid-alternating-row">`, cell 1 holds `<a href="https://pricesprodpublic.blob.core.windows.net/<cat>/<Name>.gz?sv=2014-02-14&amp;sr=b&amp;sig=..&amp;se=<~1 h ahead>&amp;sp=r">`, then date, size, type, category, branch, name. The blob URLs download without cookies. Stores name: `Stores7290027600007-000-20261101-020.gz` (3-digit time).

**Unreachable here (one attempt each, 20 s timeout)**: `prices.carrefour.co.il` and `laibcatalog.co.il` (Victory, Machsanei Hashuk): `ECONNRESET` during the TLS handshake (`curl: (35) Recv failure: Connection reset by peer`). `shop.hazi-hinam.co.il/Prices`: HTTP 403. No downloader exists for these yet.

**Files** (all ChainIds equal `chains.ts`; every PriceFull is gzip with a UTF-8 BOM, no XML declaration, `Root > ChainID, SubChainID, StoreID, BikoretNo, Items > Item`, item tags `PriceUpdateTime, ItemCode, LastSaleDateTime, ItemType, ItemName, ManufactureName, ManufactureCountry, ManufacturerItemDescription, UnitQty, Quantity, UnitOfMeasure, bIsWeighted, QtyInPackage, ItemPrice, UnitOfMeasurePrice, AllowDiscount, ItemStatus`, unless noted. Every Stores file is plain XML, UTF-16LE with BOM, `Root > ChainID, ChainName, LastUpdateDate, LastUpdateTime, SubChains > SubChain > SubChainID, SubChainName, Stores > Store > StoreID, BikoretNo, StoreType, StoreName, Address, City, ZIPCode`, unless noted.)

| Chain (key) | ChainId | Stores (sub-chains) | PriceFull fetched (items) | Notes |
|---|---|---|---|---|
| shufersal | 7290027600007 | 418 (11) | stores 1/2/3: 6542, 7435, 6192 | Stores is **gzip, UTF-8 BOM, `<?xml encoding="UTF-8"?>`, root `<Chain>`** |
| rami-levy | 7290058140886 | 99 (1) | 1/2/3: 12994, 11534, 7588 | Address like `האומן,15` |
| yohananof | 7290803800003 | 51 (1) | 1/4/5: 10679, 11101, 11627 | City always `0` |
| osher-ad | 7290103152017 | 24 (1) | 1/3/5: 6363, 6589, 6504 | |
| tiv-taam | 7290873255550 | 54 (1) | 2/3/6: 21590, 19745, 16137 | file sub-chain `000` |
| keshet | 7290785400000 | 28 (1) | 14/21: 17612, 15695; 2: 11065 | store 2 is 3-segment and another dialect: `XmlDocVersion, ChainId, SubChainId, StoreId, DllVerNo`, `PriceUpdateDate`, `ManufacturerName`; 158 items priced 0; 2 ItemCodes repeated with different prices (7.90/8.90) |
| stop-market | 7290639000004 | 11 (1) | 2/3/4: 15238, 14349, 18317 | |
| dor-alon | 7290492000005 | 157 (5) | 401/402/403: 5079, 5299, 4991 | |
| fresh-market | 7290876100000 | 48 (1) | 1/2/4: 10158, 10773, 8273 | 1 repeated ItemCode |
| politzer | 7291059100008 | 8 (1) | 1/3/8: 10636, 15055, 14524 | `StoreId` (not `StoreID`), `ManufacturerName`; City `0` |
| salach-dabach | 7290526500006 | 12 (1) | 4/7/11: 12367, 16964, 17050 | City `0` |

Data facts: no zip files and no UTF-16 price files seen; prices parse as plain decimals; StoreIds are zero-padded in names (`001`) and unpadded inside both file kinds, so they match after stripping zeros; StoreIds are unique per chain across sub-chains; blanks are filled with `לא ידוע`, `Unknown` or `unknown` (unit, manufacturer, address); City is a CBS locality code in every chain (Shufersal too) or `0` (104 of 910 stores), plus 2 Shufersal stores with an empty `<City/>`; never a name. Product overlap across these 11 chains: 28,617 codes appear in 2+ chains; no barcode differs only by leading zeros; 220 short (<8 digit) codes appear in 2+ chains, some legitimately shared (Yohananof and Fresh Market both sell supplier code `1022825`, the same cheese).

**Geocoding**: `nominatim.openstreetmap.org` answers HTTP 403 `Access denied. See https://operations.osmfoundation.org/policies/nominatim/` to this egress IP, so 0/11 Stop Market stores resolved. Run geocoding from another network or point `NOMINATIM_URL` at a self-hosted instance.

**Shops (HEAD/GET from here)**: 200: `https://www.shufersal.co.il/online/he/` (but the body is a maintenance image, as is `/online/he/search?text=<barcode>`, so no barcode deep link was confirmed), `https://www.stopmarket.co.il/`, `https://www.freshmarket.co.il/`, `https://www.doralon.co.il/` (corporate site, not a shop). 403 from Cloudflare or Radware bot protection: rami-levy.co.il/he/online/market, yochananof.co.il, osherad.co.il, victoryonline.co.il, shop.hazi-hinam.co.il, tivtaam.co.il, carrefour.co.il, keshet-teamim.co.il, mck.co.il. No answer: politzer.co.il. A 403 from a US IP does not prove the shop is down for Israeli users.

## Verified live from Israel on 2026-11-01 (issue #24)

Run from the maintainer's machine (Israeli home IP, Windows, no proxy) with `npm run fetch|ingest|geocode -w apps/api` into a scratch `DATABASE_URL`, against public Nominatim. One chain per portal format, first with `--max-stores 2`, then whole chains. Every portal answered HTTP 200. This supersedes the "Unreachable here" and "Geocoding" notes of the section above, which were made from a US IP.

**Per chain, `--max-stores 2`:** each fetched, ingested, geocoded, and `POST /api/compare` at a priced, geocoded store of the chain listed that store.

| Chain (portal) | Files listed | Stores | PriceFull (items) | Geocoded |
|---|---|---|---|---|
| stop-market (Cerberus) | 68 (10 stores with a PriceFull) | 11 | stores 2/3: 15238, 14349 | 9/11 |
| shufersal (own portal) | 425 over 22 pages (424 stores with a PriceFull) | 418 | 1/2: 6542, 7435 | 286/418 (whole chain) |
| victory (laibcatalog) | 2478 (70 stores) | 70 | 1/2: 9919, 8949 | 64/70 |
| carrefour (own portal) | 2027 (147 stores) | 147 | 2/4: 5824, 11898 | 94/147 |

**Whole chains** (fetch, ingest and geocode timed separately; ingest is `ingest-prices` over every file, geocode 1 req/s):

| Chain | Files | Download | Fetch | Ingest | Geocode | Stores | Prices | Products |
|---|---|---|---|---|---|---|---|---|
| victory | 71 (1 Stores + 70 PriceFull) | 32 MB | 14 s | 64 s | 71 s | 70 (70 with prices) | 591,845 | 17,280 |
| carrefour | 148 (1 + 147) | 87 MB | 6 s | 149 s | 149 s | 147 (147 with prices) | 1,196,383 | 22,857 |
| shufersal | 425 (1 + 424) | 114 MB | 90 s (listing ~40 s of it) | 351 s | 422 s | 418 (416 with prices) | 2,323,760 | 38,116 |

Victory is the clean reference: about 2.5 minutes end to end with the CLI as it is. Shufersal, the largest, takes about 14.5 minutes (fetch 1.5, ingest 6, geocode 7; geocoding is ~1 s per store, the 1 req/s policy limit, and later syncs only geocode stores still without coordinates). Geocoded: Victory 64/70, Carrefour 94/147, Shufersal 286/418; Compare listed a store of each. Carrefour's whole run went through `ingestPrices` with each file's name (see below), which `src/jobs/ingest-prices.ts` does not pass yet.

**Portal mechanics confirmed:**
- **Cerberus** works as recorded above (`Stop_Market` on `url.publishedprices.co.il`), one POST lists every file.
- **Shufersal**: `UpdateCategory?catID=<n>&storeId=0&page=<n>` is paged 20 rows a page (PriceFull: 22 pages); a page past the end repeats the last page. Every page takes 15-20 s however short (even the 1-row Stores page), and pages fetched in parallel each still take ~16 s, so the provider reads page 1, takes the last page from the pager's `&gt;&gt;` link and fetches the rest 6 at a time: the full listing takes ~40 s. All 425 signed blob links downloaded within their ~1 h expiry. The listing also holds 8 PriceFull files months old (2026-07-12 to 2026-10-13) for stores missing from the Stores file (closed stores): ingest now skips a file whose store is not in the Stores file instead of failing the chain.
- **laibcatalog (Victory, Machsanei Hashuk)**: `index.html` is a JS page; `GET https://laibcatalog.co.il/webapi/api/getfiles?edi=<chainId>` returns every file of the chain as JSON `[{branchNumber, fileName, fileType, fileDate, fileSize}]` in one response (Victory 2478, Machsanei Hashuk 1415), download `GET https://laibcatalog.co.il/webapi/<chainId>/<fileName>` (gzip, no cookies). `api/getbranches?edi=` gives `[{number, name}]`. Both pages use `DEFAULT_EDI` = `ids[0]` (Victory 7290696200003, Machsanei Hashuk 7290661400001); no file carries the second ChainIds in `chains.ts`. The Stores file name has another shape, `Stores7290696200003-000-20261101060100-060100.gz` (time after the date, repeated after a dash), which `parseFileName` did not parse, so fetch found "no Stores file"; fixed. Machsanei Hashuk lists two Stores files a second apart; the newer is taken. Victory's Stores is gzip UTF-8 without BOM, `SubChainId` (not `SubChainID`), City as a name; PriceFull is gzip UTF-8 without BOM. Machsanei Hashuk was only listed, not ingested.
- **Carrefour**: `GET https://prices.carrefour.co.il/` inlines `const path = '20261101';` and `const files = [{name, size, modified}, ...];` for today only; download `https://prices.carrefour.co.il/<path>/<name>`. `?p=./20261031` returned today's page again, so history is not reachable this way. Stores is plain XML, UTF-16LE with BOM (147 stores, one sub-chain); PriceFull is gzip UTF-8 with BOM. Most PriceFull files are written 05:00-05:10, so a sync just before 05:10 can see today's folder without today's PriceFull.

**Bug found in the data: Carrefour's StoreID inside the file is wrong for 74 stores.** Files named 400-473 (the former Yeinot Bitan / City stores, whose Stores names carry the old code, e.g. `בעיר חפץ חיים (1171)` = 407) carry an old StoreID inside (`PriceFull...-001-407-...` says `<StoreID>117</StoreID>`). 48 of these inner IDs are not in the Stores file (ingest failed with `store 7290055700007-103 is unknown`), and 26 are other live stores (117 is `סינמה סיטי` in Be'er Sheva, which has its own file `-117-`), so keying by the inner StoreID would overwrite those stores' prices. The file name's store matches the Stores file for all 147, so `ingestPrices(deps, chain, xml, fileName)` now takes the store from the name when given. Victory, Shufersal and Stop Market names agree with the inner StoreID.

**Geocoding (public Nominatim):** the old User-Agent `grocer-dev (contact: dev@example.com)` gets HTTP 403 `Access denied. See https://operations.osmfoundation.org/policies/nominatim/` from this Israeli IP too; the same query with `Grocer/0.1 (+https://github.com/OrhayBenaim/super-app)` gets 200, and adding an `email=` param to the old UA is still 403. The UA is now that string; no env var is needed. Of the misses, Nominatim finds nothing when the street keeps its type word (`רחוב הנגר 24` none, `הנגר 24` found; same for `דרך`, `שדרות`, `שד`, `שד.`, `רח'`), so the query now drops a leading one (Stop Market 4/11 to 9/11). Carrefour publishes City as CBS codes the parser did not know (31/147 stores), so the query fell back to the chain-branded store name; 38 more codes seen in Carrefour's and Shufersal's Stores files are now decoded (Carrefour 78/147 to 94/147). Still not found: addresses with the house number first (`2 יעקב כהן`, `65 זבוטינסקי`), mall or junction names (`קניון שבעת הכוכבי`, `צומת צמח מול כנרת`), a website as address (Victory store 97 "אינטרנט", Yeinot Bitan online `https://www.ybitan.co.il`), and streets missing from OSM. Unmapped CBS codes remain (Stop Market 96 יגור and 250 הזורע, plus 37 more codes on 39 Shufersal stores).

**Still not verified:** Hazi Hinam (`shop.hazi-hinam.co.il/Prices` answers 200 from here, but there is no downloader yet); Machsanei Hashuk ingest (listing only); Mega and Yeinot Bitan as separate banners (they are inside Carrefour's feed: 147 stores in one sub-chain).

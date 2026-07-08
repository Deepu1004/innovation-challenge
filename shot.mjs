import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const URL = process.env.URL || "http://localhost:5188/";
const OUT = process.env.OUT || "/tmp/ix.png";
const THEME = process.env.THEME || "light";
const CLICKS = process.env.CLICKS ? JSON.parse(process.env.CLICKS) : [];

const b = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu", "--force-device-scale-factor=1", "--hide-scrollbars"],
  defaultViewport: { width: 1512, height: 1000, deviceScaleFactor: 1 },
});
const page = await b.newPage();
await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: THEME }]);
// ensure our theme choice wins over saved localStorage
await page.evaluateOnNewDocument((t) => { try { localStorage.setItem("ix-theme", t); } catch {} }, THEME);
await page.goto(URL, { waitUntil: "networkidle0", timeout: 30000 });
await page.waitForSelector(".kpi", { timeout: 15000 }).catch(() => {});
for (const sel of CLICKS) {
  await page.evaluate((s) => {
    if (s.startsWith("css:")) { document.querySelector(s.slice(4))?.click(); return; }
    const els = [...document.querySelectorAll("button, .nav-item, .opt")];
    const el = els.find((e) => e.textContent && e.textContent.trim() === s)
      || els.find((e) => e.textContent && e.textContent.includes(s));
    if (el) el.click();
  }, sel);
  await new Promise((r) => setTimeout(r, 900));
}
await new Promise((r) => setTimeout(r, 2600)); // let echarts settle
await page.screenshot({ path: OUT, fullPage: true });
await b.close();
console.log("wrote", OUT);

import puppeteer from "puppeteer-core";
import fs from "node:fs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DL = "/tmp/pixdl";
fs.rmSync(DL, { recursive: true, force: true });
fs.mkdirSync(DL, { recursive: true });

const b = await puppeteer.launch({
  executablePath: CHROME, headless: "new",
  args: ["--no-sandbox", "--disable-gpu"],
  defaultViewport: { width: 1512, height: 1000 },
});
const page = await b.newPage();
const client = await page.target().createCDPSession();
await client.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: DL });
await page.goto("http://localhost:5188/", { waitUntil: "networkidle0", timeout: 30000 });
await page.waitForSelector(".export-btn", { timeout: 15000 });
await new Promise((r) => setTimeout(r, 1500));
await page.click(".export-btn");
// wait for a .pdf to finish downloading (no .crdownload)
let file = null;
for (let i = 0; i < 40; i++) {
  const files = fs.readdirSync(DL);
  const pdf = files.find((f) => f.endsWith(".pdf"));
  const partial = files.some((f) => f.endsWith(".crdownload"));
  if (pdf && !partial) { file = pdf; break; }
  await new Promise((r) => setTimeout(r, 300));
}
await b.close();
if (!file) { console.log("NO PDF DOWNLOADED"); process.exit(1); }
const buf = fs.readFileSync(`${DL}/${file}`);
const head = buf.subarray(0, 5).toString("latin1");
console.log("file:", file);
console.log("size:", (buf.length / 1024).toFixed(1), "KB");
console.log("valid PDF header:", head === "%PDF-");

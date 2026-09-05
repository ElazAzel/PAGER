import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";

const svg = await readFile(new URL("../public/pager-icon.svg", import.meta.url), "utf8");
const browser = await chromium.launch({ headless: true });
try {
  for (const [name, size, maskable] of [["icon-192.png", 192, false], ["icon-512.png", 512, false], ["icon-maskable-512.png", 512, true]]) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;background:#f3f0e9}body{display:grid;place-items:center}svg{width:${maskable ? "80%" : "100%"};height:${maskable ? "80%" : "100%"}}</style>${svg}`);
    await page.screenshot({ path: new URL(`../public/${name}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1") });
    await page.close();
    console.log(`${name}: ${size} x ${size}`);
  }
} finally { await browser.close(); }

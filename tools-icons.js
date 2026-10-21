const puppeteer = require('puppeteer-core');
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const p = await b.newPage();
  for (const s of [180, 192, 512]) {
    await p.setViewport({ width: s, height: s });
    await p.setContent(`<body style="margin:0"><div style="width:${s}px;height:${s}px;background:#000;display:flex;align-items:center;justify-content:center;flex-direction:column">
      <div style="font-size:${s * .48}px;line-height:1">⚽</div><div style="color:#B8F400;font:900 ${s * .15}px Arial">PELADA</div></div></body>`);
    await p.screenshot({ path: `public/icons/icon-${s}.png` });
  }
  await b.close();
})();

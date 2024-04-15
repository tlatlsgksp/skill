const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function scrapeWebsite() {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  const dir = './images_bus_school';

  // 뷰포트 크기 설정
  await page.setViewport({ width: 1920, height: 1080 });

  await page.goto('https://www.kduniv.ac.kr/iphak/CMS/Contents/Contents.do?mCode=MN064');

  // gap을 기준으로 페이지를 분할
  const gaps = await page.$$('.gap');

  let previousGapBoundingBox = null;

  for (let i = 0; i < gaps.length; i++) {
    const currentGap = gaps[i];

    if (previousGapBoundingBox) {
      const currentBoundingBox = await currentGap.boundingBox();

      // 페이지를 분할하기 위한 클립 영역 계산
      const clip = {
        x: previousGapBoundingBox.x,
        y: previousGapBoundingBox.y,
        width: previousGapBoundingBox.width,
        height: currentBoundingBox.y - previousGapBoundingBox.y
      };

      // 클립 영역에 따른 스크린샷 찍기
      await page.screenshot({ path: path.join(dir, `schoolbus_${i}.png`), clip });
    }

    // 이전 gap의 bounding box 업데이트
    previousGapBoundingBox = await currentGap.boundingBox();
  }

  // 마지막 gap 이후의 영역 스크린샷
  const lastGapBoundingBox = await previousGapBoundingBox;
  const footerWrap = await page.$('#footer-wrap');
  const footerBoundingBox = await footerWrap.boundingBox();
  const { width, height } = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
  }));

  const lastClip = {
    x: lastGapBoundingBox.x,
    y: lastGapBoundingBox.y,
    width: lastGapBoundingBox.width,
    height: footerBoundingBox.y - lastGapBoundingBox.y
  };

  await page.screenshot({ path: path.join(dir, `schoolbus_${gaps.length}.png`), clip: lastClip });

  await browser.close();

  console.log('스크린샷이 성공적으로 저장되었습니다.');
}

scrapeWebsite().catch(error => {
  console.error('에러 발생:', error);
});
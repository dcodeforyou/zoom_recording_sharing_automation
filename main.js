const puppeteer = require('puppeteer');
const chromeLauncher = require('chrome-launcher');
const axios = require('axios');
const Xvfb = require('xvfb');
require('dotenv').config();
const { google } = require('googleapis');
const keys = require('./keys.json');
const fs = require('fs');
const minimist = require('minimist');

const args = minimist(process.argv)

async function run() {
  const xvfb = new Xvfb()
  xvfb.start(function (err, xvfbProcess) {
    const chromeConfig = {
      chromeFlags: ['--start-maximized'],
      permissions: ['clipboardWrite'],
    }

    async function launch() {
      const chrome = await chromeLauncher.launch(chromeConfig);
      // console.log({ chrome }); // to see chrome launcher instance properties
      const response = await axios.get(
        `http://localhost:${chrome.port}/json/version`,
      )
      const { webSocketDebuggerUrl } = response.data;

      const browser = await puppeteer.connect({
        browserWSEndpoint: webSocketDebuggerUrl,
        defaultViewport: null,
        args: ['--start-maximized'],
      })

      const context = browser.defaultBrowserContext();
      await context.overridePermissions('https://us02web.zoom.us/', [
        'clipboard-read',
        'clipboard-write',
      ]);

      const page = await browser.newPage();
      const userAgent =
        'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.81 Mobile Safari/537.36'
      await page.setUserAgent(userAgent);
      await page.goto('https://zoom.us/signin', { waitUntil: ['load'] });

      if (args.via) {
        if (args.via.toLowerCase() == 'zoom') await zoomLogin(page);
        //zoom sign in
        else{
          await page.click('a.login-btn-google');
          await page.waitForNavigation();
          await gmailLogin(page);
        } //gmail sign in
      } else {
        await page.click('a.login-btn-google');
        await page.waitForNavigation();
        await gmailLogin(page); //gmail sign in
      }

      await page.waitForTimeout(5000);

      await page.click('a[tracking-id="leftNavRecording"]');

      await page.waitForSelector('div.row-container div.clearfix div.mtg-start');

      if (!fs.existsSync('./done.json')) {
        console.log('creating done json');
        fs.writeFileSync('./done.json', JSON.stringify([]), 'utf-8');
      }

      let doneMeetings = fs.readFileSync('./done.json', 'utf-8');
      let done = JSON.parse(doneMeetings);

      await page.exposeFunction("clickAt", clickAt);
      async function clickAt(selector){
        await page.click(selector);
        await page.waitForTimeout(10000);
      }
      
      //USE THIS TO CONSOLE LOG VALUES INSIDE EVALUATE METHOD
        // await page.exposeFunction("con", con);
        // function con(value){
        //   console.log(value);
        // }


      await page.exposeFunction("getMeetings", getMeetings);
      async function getMeetings(today, yesterday){
         let meetings = await page.evaluate(async function recall(today, yesterday){
            let results = [];
            let items = document.querySelectorAll('div.row-container div.clearfix');
            let shareButtons = [];
            for (let i = 0; i < items.length; i++) {
              let meetingStartTime = items[i].querySelector('div.mtg-start')[
                'innerText'
              ];
              let shareButton = await items[i].querySelector(
                  'a.btn.btn-default.sharemeet_from_myrecordinglist',
              );

              if (meetingStartTime.includes(today)) {                
                results.push(meetingStartTime);
                if(shareButton){
                  shareButtons.push(getCssPath(shareButton));
                }else{
                  shareButtons.push(undefined);
                }

                if(i == items.length - 1){
                  let nextLi = document.querySelector("li.next");
                    if(!nextLi.classList.contains('disabled')){
                      await clickAt("li.next > a");
                      items = document.querySelectorAll('div.row-container div.clearfix');
                      i = -1;
                      continue;
                    }
                }
    
              } else if (meetingStartTime.includes(yesterday)) {
                results.push(meetingStartTime);
                if(shareButton){
                  shareButtons.push(getCssPath(shareButton));
                }else{
                  shareButtons.push(undefined);
                }
    
                if(i == items.length - 1){
                  let nextLi = document.querySelector("li.next");
                    if(!nextLi.contains('disabled')){
                      await clickAt("li.next > a");
                      items = document.querySelectorAll('div.row-container div.clearfix');
                      i = -1;
                      continue;
                    }
                }
    
              }else{
                break;
              }
            }

            function getCssPath(el) {
              if (!(el instanceof Element)) 
                return;
              const path = [];
              while (el.nodeType === Node.ELEMENT_NODE) {
                let selector = el.nodeName.toLowerCase();
                if (el.id) {
                  selector += '#' + el.id;
                  path.unshift(selector);
                  break;
                } else {
                  let sib = el, nth = 1;
                  while ((sib = sib.previousElementSibling)) {
                    if (sib.nodeName.toLowerCase() == selector) 
                      nth++;
                  }
                  if (nth != 1) 
                    selector += ':nth-of-type(' + nth + ')';
                }
                path.unshift(selector);
                el = el.parentNode;
              }
              return path.join(' > ');
            }
        
            return {
              results,
              shareButtons
            };
         }, today, yesterday);
         return meetings;
      }

      let meetings = await page.evaluate(async function(){
        // let items = document.querySelectorAll('div.row-container div.clearfix');
        let date = new Date();
        const monthNames = [
          'Jan',
          'Feb',
          'Mar',
          'Apr',
          'May',
          'Jun',
          'Jul',
          'Aug',
          'Sep',
          'Oct',
          'Nov',
          'Dec',
        ];
        const daysInMonths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        let month = date.getUTCMonth();
        let day = date.getDate();
        let year = date.getFullYear();
        let today = `${monthNames[month]} ${day}, ${year}`;
        if (date.getDate() == 1) {
          switch (month) {
            case 0:
              month = monthNames[monthNames.length - 1]
              day = daysInMonths[daysInMonths.length - 1]
              year--
              break
            case 2:
              if ((year % 4 == 0 && year % 100 != 0) || year % 400 == 0) {
                day = daysInMonths[month - 1] + 1;
              } else {
                day = daysInMonths[month - 1];
              }
              month--;
              break
            default:
              month = monthNames[month - 1];
              day = daysInMonths[month - 1];
          }
        } else {
          day--;
        }

        let yesterday = `${monthNames[month]} ${day}, ${year}`;

        let meetings = await getMeetings(today, yesterday);

        return meetings;
      });

      await page.click(meetings.shareButtons[meetings.shareButtons.length - 1]);

      await page.waitForTimeout(10000);

      //CANNOT FILTER BECAUSE IT WILL SHRINK ARRAY SIZE AND DISTURB NAVIGATION
      // meetings = meetings.filter((meet) => !done.includes(meet));

      //HOW MANY TIMES WE HAVE TO BACK

      for (let i = meetings.results.length - 1; i >= 0; i--) {
        if(!meetings.shareButtons[i] || done.includes(meetings.results[i])){
          if(i != 0 && i % 15 == 0){
            await page.click("ul.dynamo_pagination > li:not(.next) > a");
            await page.waitForTimeout(7000);
          }
          continue;
        }

        await page.click(meetings.shareButtons[i]);
        await page.waitForTimeout(5000);
        await page.click('body');
        //to turn off password protection uncomment below line
        // await page.click("input[aria-describedby='password_label'] + span.zm-switch__core");
        await page.waitForTimeout(4000);
        await page.click('button.copy-to-clipboard');
        //ALLOW CLIPBOARD COPY ACCESS
        page.on('request', async function(req){
          await req.continue();
        })

        const text = await page.evaluate(function() {
          let copiedText = navigator.clipboard.readText();
          return copiedText;
        })
        await page.click('div.dialog-footer button span.zm-button__slot');

        //MAIL FORWARD - DONE
        await sendEmail(
          process.env.to,
          subject,
          text,
        );

        console.log('mail sent');

        //EXCEL ME LINK DALO
        await addLinksToSpreadSheet(meetings.results[i], text);

        console.log('spreadsheet updated');

        done = [...done, meetings.results[i]];

        //writing done meetings in done file

        // await page.click(text);
        if(i != 0 && i % 15 == 0){
            await page.click("ul.dynamo_pagination > li:not(.next) > a");
        }
        await page.waitForTimeout(10000);
      }

      fs.writeFileSync('./done.json', JSON.stringify(done), 'utf-8');

      async function addLinksToSpreadSheet(day, text) {
        const auth = new google.auth.GoogleAuth({
          keyFile: 'keys.json', //the key file
          //url to spreadsheets API
          scopes: 'https://www.googleapis.com/auth/spreadsheets',
        });

        //Auth client Object
        const authClientObject = await auth.getClient();

        //Google sheets instance
        const googleSheetsInstance = google.sheets({
          version: 'v4',
          auth: authClientObject,
        });

        // spreadsheet id
        const spreadsheetId = process.env.SHEET_ID;

        let title = `Lecture of ${day}`;
        let link = text.split('Recording:')[1];
        //write data into the google sheets
        await googleSheetsInstance.spreadsheets.values.append({
          auth, 
          spreadsheetId, //spreadsheet id
          range: 'Sheet1!A:B', 
          valueInputOption: 'USER_ENTERED', 
          resource: {
            values: [[title, link]],
          },
        })
      }

      async function sendEmail(to, subject, text) {

        if(args.via && args.via.toLowerCase() == 'zoom'){
          let gPage = await browser.newPage();
          await gPage.goto('http://accounts.google.com');
          await gPage.waitForNavigation();
        }

        let mPage = await browser.newPage();
        await mPage.goto('https://mail.google.com/mail/u/0/#inbox');
        await mPage.waitForSelector('div.T-I.T-I-KE.L3');
        await mPage.hover('div.T-I.T-I-KE.L3');
        await mPage.click('div.T-I.T-I-KE.L3');
        await mPage.waitForTimeout(7000);

        await mPage.focus('textarea.vO[aria-label="To"]');
        await mPage.keyboard.type(to);

        await mPage.focus('input[placeholder="Subject"]');
        await mPage.keyboard.type(subject);

        await mPage.focus('div.Am.Al.editable.LW-avf.tS-tW');
        await mPage.keyboard.type(text);

        await mPage.keyboard.down('ControlLeft');
        await mPage.keyboard.press('Enter');

        await mPage.waitForTimeout(10000);
        await mPage.close();
      }

      await page.screenshot({ path: 'testresult.png' });
      await browser.close();
    }

    async function zoomLogin(page) {
      await page.focus('input#email');
      await page.keyboard.type(process.env.ZOOM_EMAIL, { delay: 50 });

      await page.focus('input#password');
      await page.keyboard.type(process.env.ZOOM_PASSWORD);

      await page.keyboard.press('Enter');
      await page.waitForNavigation();
    }

    async function gmailLogin(page) {
      
      // await page.goto('http://accounts.google.com');

      await page.focus('input[type="email"]');
      await page.keyboard.type(process.env.GMAIL_EMAIL, { delay: 50 });

      await page.click('#identifierNext');

      await page.waitForNavigation();

      await page.waitForTimeout(5000);

      await page.focus('input[type="password"]');
      await page.keyboard.type(process.env.GMAIL_PASSWORD);

      await page.click('div.VfPpkd-dgl2Hf-ppHlrf-sM5MNb>button');
      await page.waitForNavigation();
    }

    launch()
      .then(function(){
        console.log('ok');
      })
      .catch(function(err){
        console.error(err);
      })
    xvfb.stop(function (err) {
      // Xvfb stopped
    })
  })
}


//COMMENT BELOW IIFE TO RUN AS CRONJOB
(async function letsGo(){
  console.log("LET'S GOOOOO......");
  await run();
})();


module.exports.run = run;

# Putting the game online

There are two pieces:
- The **game page** goes on your Hostinger website (your own domain).
- The **live server** that runs the room codes goes on Render's free plan.

Your Hostinger plan (Premium Web Hosting) can't run the live server itself. It doesn't support Node.js or the always-open connections a race needs.

## 1. Put the code on GitHub (Render reads it from there)
1. Create a free account at github.com.
2. Click **New repository**. Name it `marble-park` and leave everything else as it is. Click **Create repository**.
3. On the next page, click **uploading an existing file**. Drag in these items from the project folder:
   - `package.json`
   - the `server` folder
   - the `game` folder
4. Click **Commit changes**.

## 2. Start the live server on Render
1. Create a free account at render.com. The **Sign up with GitHub** option is easiest.
2. Click **New** → **Web Service**, then choose your `marble-park` repository.
3. Fill in these settings:
   - Language: **Node**
   - Build command: `npm install`
   - Start command: `npm start`
   - Instance type: **Free**
4. Click **Create Web Service** and wait for it to say **Live**. This takes a few minutes the first time.
5. Copy the address at the top of the page. It looks like `https://marble-park-xxxx.onrender.com`.
   - If it isn't exactly `https://marble-park.onrender.com`, send it to Claude. Claude will update one line (`GAME_SERVER`) and rebuild the page.
6. Optional check: open that address in a browser. The full game loads there too.

## 3. Put the game page on your Hostinger site
1. In hPanel, go to **Websites**, open your site and click **File Manager**.
2. Open `public_html`. Create a folder called `marble` (or any name you like) and open it.
3. Upload `site/index.html` from the project folder.
4. Visit `https://YOUR-DOMAIN/marble/` and tap **Play online with friends**.

## 4. Test with friends
- On a computer, open the page, choose **Create a room**, and note the 4-letter code.
- On a phone, open the same page, choose **Play online with friends**, enter the code and tap **Join**.
- If nobody has played for a while, the first visit shows "Waking up the game server…". That's Render's free plan starting up and takes up to about a minute.

## When you change the game later
- Run `tools/build-site.ps1` and upload the new `site/index.html` to Hostinger.
- Upload the changed files to GitHub too. Render redeploys automatically.

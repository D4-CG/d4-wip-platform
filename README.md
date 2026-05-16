# D4 WIP Intelligence Platform

Revenue cycle work-in-progress management for PE-backed healthcare platforms.

## What This Is

A multi-role revenue cycle operating system that scores every account by probability of collection, attributes stuck accounts to responsible areas, and recommends specific next actions. Built with Next.js and powered by Claude AI.

---

## Deploy to Vercel (Recommended — 20 minutes)

### Step 1 — Get your Anthropic API key

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Sign in or create a free account
3. Go to **API Keys** → **Create Key**
4. Copy the key — you'll need it in Step 4

### Step 2 — Put the project on GitHub

1. Go to [github.com](https://github.com) and sign in (or create a free account)
2. Click **New repository** → name it `d4-wip-platform` → **Create repository**
3. On your computer, open Terminal and run:

```bash
cd d4-wip-platform
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/D4-CG/d4-wip-platform.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your GitHub username.

### Step 3 — Deploy on Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click **Add New Project**
3. Find `d4-wip-platform` in the list and click **Import**
4. Leave all settings as default — Vercel detects Next.js automatically
5. Click **Deploy**

### Step 4 — Add your API key

1. In Vercel, go to your project → **Settings** → **Environment Variables**
2. Add a new variable:
   - **Name:** `ANTHROPIC_API_KEY`
   - **Value:** your API key from Step 1
3. Click **Save**
4. Go to **Deployments** → click the three dots on your latest deployment → **Redeploy**

Your platform is now live at `https://d4-wip-platform.vercel.app` (or similar).

---

## Run Locally

```bash
# Install dependencies
npm install

# Add your API key
cp .env.example .env.local
# Edit .env.local and add your ANTHROPIC_API_KEY

# Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Project Structure

```
d4-wip-platform/
├── app/
│   ├── layout.jsx          # Root layout
│   ├── page.jsx            # Main page
│   └── api/
│       └── claude/
│           └── route.js    # Anthropic API proxy (keeps key server-side)
├── components/
│   └── WIPPlatform.jsx     # Full platform component
├── .env.example            # Environment variable template
└── package.json
```

## Security Note

The Anthropic API key is never exposed in the browser. All AI calls go through `/api/claude` which runs server-side on Vercel. Your key is safe.

---

*D4 Consulting Group — Proprietary and Confidential*

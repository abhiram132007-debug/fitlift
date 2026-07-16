# FitLift — "Instagram for gym freaks"

A working starter for your app: people post a lift (exercise, weight, reps),
get a **points score based on the lift relative to their bodyweight**, and
other users can upvote/downvote posts to add or subtract points. There's a
feed, a leaderboard, and profiles.

---

## 1. Front-end vs. back-end, in plain terms

Every full app is really two separate programs talking to each other:

- **Frontend** = what runs in the user's *browser*. It draws the buttons,
  text boxes, and images, and reacts when you click things. It cannot
  permanently store anything — if you close the tab, it forgets everything
  unless it asked another program to remember for it.
  → In this project: the `frontend/` folder (`index.html`, `style.css`, `app.js`).

- **Backend** = a program that runs on a *server* (for now, your own laptop).
  It owns the database, checks passwords, and calculates the point system.
  The frontend never touches the database directly — it sends a request like
  "give me the 20 newest posts" over the network, and the backend replies.
  → In this project: the `backend/` folder (`server.js` and friends).

They talk using a **REST API**: the backend exposes URLs like
`GET /api/posts` or `POST /api/posts`, and the frontend calls them with
JavaScript's `fetch()`. Open `frontend/app.js` and search for `api(` to see
every place this happens.

The **database** (`backend/fitlift.db`, created automatically) is a single
file that stores users, posts, and votes permanently, even after you restart
the server. We're using SQLite — a real database, just stored as a file
instead of needing a separate server program.

---

## 2. Coding in VS Code — first time setup

1. **Install Node.js.** Go to https://nodejs.org, download the LTS version,
   install it. This gives you `node` (runs JavaScript outside the browser)
   and `npm` (installs code libraries other people wrote).
2. **Install VS Code** from https://code.visualstudio.com if you don't have
   it already.
3. **Open the project folder.** In VS Code: `File > Open Folder...` → select
   the `fitlift` folder (the one containing `backend/` and `frontend/`).
4. **Open the built-in terminal.** `Terminal > New Terminal` (or `` Ctrl+` ``).
   This gives you a command line *inside* VS Code — you'll use it to run
   commands instead of switching to a separate app.

---

## 3. Running the app

You need **two terminals running at the same time** — one for the backend,
one for the frontend. In VS Code you can split the terminal panel (click the
`+`/split icon).

### Terminal 1 — start the backend

```bash
cd backend
npm install        # downloads the libraries listed in package.json (only needed once)
cp .env.example .env   # creates your local config file
npm start
```

You should see `FitLift backend running at http://localhost:3001`. Leave
this running. This is your API server.

### Terminal 2 — start the frontend

The frontend is plain HTML/CSS/JS, so it doesn't need `npm install`. The
easiest way to run it is VS Code's **Live Server** extension:

1. In VS Code, open the Extensions panel (left sidebar, the four-squares icon).
2. Search for "Live Server" (by Ritwick Dey), click Install.
3. Right-click `frontend/index.html` in the file explorer → **"Open with Live Server"**.

Your browser opens automatically (usually `http://127.0.0.1:5500`). If you'd
rather not install an extension, you can instead run, in a second terminal:

```bash
cd frontend
npx serve .
```

and open the URL it prints.

Now sign up for an account (it'll ask your bodyweight), post a lift, and
watch it show up in the feed.

---

## 4. How the point system works (`backend/scoring.js`)

1. When you post a lift, the backend estimates your **one-rep max** using
   the Epley formula, so "100kg x 5 reps" and "112kg x 1 rep" score
   similarly instead of penalizing you for doing higher reps.
2. It divides that by your **bodyweight** to get a ratio
   (e.g. lifting 1.5x your bodyweight).
3. Base points = `ratio x 100`. So bench-pressing exactly your bodyweight
   for a single rep = 100 points.
4. Every upvote adds 1 point, every downvote subtracts 1, live, forever
   (see `attachVoteInfo` in `server.js`).
5. A profile's total points is just the sum of points across all their posts.

Everything here is a plain function — open `backend/scoring.js` and change
the formula anytime. For example you could add a multiplier for the specific
lift (squat vs. curls shouldn't score the same), or weight votes from
verified/experienced users more heavily.

---

## 5. Where things live (project map)

```
fitlift/
  backend/
    server.js       All API routes (signup, login, posts, votes, leaderboard)
    db.js            Creates the SQLite tables on first run
    scoring.js        The points formula — tune this
    package.json       List of libraries + the "npm start" command
    .env.example        Copy to .env; holds your JWT secret key
  frontend/
    index.html        Page structure + a <template> for one post card
    style.css          All visual styling (colors/fonts defined at the top as CSS variables)
    app.js              Routing between screens + all fetch() calls to the backend
```

---

## 6. Natural next steps

- **Real image/video uploads** instead of pasting a URL — needs a file
  storage service (e.g. Cloudflare R2 or AWS S3) since the browser can't
  save files to your server by itself.
- **Comments** on posts — same pattern as votes: a new `comments` table.
- **Follow system** so the feed shows people you follow first.
- **Deploy it** so it's a real website others can visit: backend can go on
  Render or Railway (free tiers exist), frontend on Netlify or Vercel. Ask
  me when you're ready and I'll walk you through it.
- **Verified lift videos** — since anyone could lie about their numbers,
  many lifting apps require a video attached before a post counts toward
  the leaderboard.

If anything errors out, copy the exact error text from the terminal and send
it to me — that's the fastest way to fix it.

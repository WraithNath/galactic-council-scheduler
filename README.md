# Galactic Council Scheduler

A Twilight Imperium themed web app for finding a weekend that every player can make.

- Create a game, then share the invite link.
- Each player joins with a name and preferred faction, then clicks each Saturday and Sunday to mark it **available**, **maybe** or **unavailable**.
- The summary at the top shows the best date everyone can make. It also lists full weekends where everyone is free (handy for a two-day game). If no date works, it shows the closest options and who is missing.
- Updates show up live for everyone viewing the page.

It is a plain static site (HTML, CSS and JS with no build step) that stores its data in Firebase Firestore. Both are free at this scale.

## Getting started

### 1. Get the code

```bash
git clone https://github.com/WraithNath/galactic-council-scheduler.git
cd galactic-council-scheduler
```

### 2. Set your config file

`config.js` holds the Firebase settings. The one in this repo points at the Firebase project behind the live site. To use your own Firebase project, or none at all, replace it with the template:

```bash
cp config.example.js config.js
```

If you leave `window.FIREBASE_CONFIG = null`, the app runs in **local-only mode**, where games are saved in your browser only. That is fine for trying it out. To share games with other players, set up Firebase (below) and paste your settings in.

The Firebase web config is designed to be public. It only identifies the project, and access is controlled by the Firestore rules.

### 3. Run it locally

The app must be served over HTTP. Opening `index.html` directly from disk will not work. With [Node.js](https://nodejs.org) installed:

```bash
npx serve .
```

Then open the address it prints (usually <http://localhost:3000>).

## Setting up the shared database (Firebase)

1. Go to <https://console.firebase.google.com>, click **Add project** and follow the steps (you can turn Google Analytics off).
2. Open **Build → Firestore Database → Create database**. Choose a location near you and start in **production mode**.
3. Open the **Rules** tab, replace the contents with the contents of [firestore.rules](firestore.rules), and click **Publish**.
4. Click the **gear icon ⚙** next to *Project Overview*, then **Project settings**. Stay on the **General** tab and scroll to the bottom to **Your apps**. Click the **Web** icon (`</>`), give it any nickname, leave Firebase Hosting unticked, and click **Register app**.
5. Copy just the `{ ... }` part of the `firebaseConfig` it shows into `config.js`:

   ```js
   window.FIREBASE_CONFIG = {
     apiKey: "...",
     authDomain: "your-project.firebaseapp.com",
     projectId: "your-project",
     storageBucket: "your-project.firebasestorage.app",
     messagingSenderId: "...",
     appId: "..."
   };
   ```

   Don't paste the `import` or `initializeApp` lines. The app loads Firebase itself.

You don't need **App Hosting** or the Blaze (paid) plan. Firestore works on the free Spark plan, which includes 50,000 reads and 20,000 writes per day.

## Hosting it for free

The site is just four files: `index.html`, `style.css`, `app.js` and `config.js`.

**Netlify Drop (easiest)**
1. Make sure your `config.js` is in the folder.
2. Go to <https://app.netlify.com/drop> and drag the folder onto the page. You get a public URL straight away. Sign in to a free account to keep the site permanently.

**GitHub Pages**
Commit your `config.js`, then open **Settings → Pages**, set **Source** to *Deploy from a branch*, and choose `main` and `/ (root)`. The site appears at `https://<username>.github.io/<repo-name>/` after a minute or so, and redeploys on every push.

**Firebase Hosting** also works on the free plan (`npm i -g firebase-tools`, `firebase init hosting`, `firebase deploy`).

## Notes

- Anyone with a game link can edit that game. That suits a group of friends, but don't post the link publicly.
- Weekends that have fully passed are hidden automatically. Use **+4 weekends** to extend the range.
- This is an unofficial fan tool and is not affiliated with Fantasy Flight Games.

const DEV_ARENA_URL = "https://arena-dev.chessmagic.workers.dev";
const REPOSITORY_URL = "https://github.com/amalnathsathyan/magic-chess";
const PROGRAM_ID = "FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h";
const PROGRAM_URL = `https://explorer.solana.com/address/${PROGRAM_ID}?cluster=devnet`;
const MOVE_SIGNATURE =
  "ate628i9QWc3HwkgtznTiQEUaaGvGAq4kbJKoNvFABJTHKyuLqEz77NRqHh9Dj5yA42gPeReNyPEB47z3m1SAdr";
const MOVE_URL = `https://explorer.solana.com/tx/${MOVE_SIGNATURE}?cluster=custom&customUrl=${encodeURIComponent(
  "https://devnet-as.magicblock.app"
)}`;
const SESSION_SIGNATURE =
  "ZArmZ6pAnisaT1ujzyXtywZT7YvQzNu4yDqJ1qywvc3HkuNq5bYF3czuaR124QqTmrtbwVowKthKNeu2EgjmxfN";
const SESSION_URL = `https://explorer.solana.com/tx/${SESSION_SIGNATURE}?cluster=devnet`;
const DELEGATION_SIGNATURE =
  "3WE5MwUhVnksRDYMKFfEKC7vcBzJE9sUnUHRNMWv9bHYmRLedfawyhxWij8tEboTab4B2HhLPQ9S8AUKKBuLCsv";
const DELEGATION_URL = `https://explorer.solana.com/tx/${DELEGATION_SIGNATURE}?cluster=devnet`;

const HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Magic Chess is a real-time, onchain chess arena built on Solana and MagicBlock.">
  <meta name="theme-color" content="#0a0a0c">
  <title>Magic Chess — Devnet proof</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0a0a0c;
      --panel: #101015;
      --panel-raised: #16161d;
      --line: #292932;
      --ink: #f0f0f5;
      --muted: #9d9db5;
      --green: #00e676;
      --green-dark: #042f1a;
      --amber: #ffab00;
      --max: 1120px;
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      background:
        radial-gradient(circle at 78% -10%, rgba(0, 230, 118, 0.12), transparent 30rem),
        linear-gradient(180deg, #0d0d10 0, var(--bg) 38rem);
      color: var(--ink);
      font: 16px/1.6 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    a { color: inherit; }
    a:focus-visible { outline: 3px solid var(--amber); outline-offset: 4px; }
    .skip-link { position: fixed; top: 12px; left: 12px; z-index: 20; transform: translateY(-180%); border-radius: 8px; background: var(--ink); color: var(--bg); padding: 9px 13px; }
    .skip-link:focus { transform: none; }
    .shell { width: min(var(--max), calc(100% - 40px)); margin-inline: auto; }
    header { display: flex; align-items: center; justify-content: space-between; min-height: 82px; border-bottom: 1px solid rgba(255,255,255,0.06); }
    .brand { display: flex; align-items: center; gap: 10px; font-weight: 760; letter-spacing: -0.02em; text-decoration: none; }
    .mark { display: grid; width: 28px; height: 28px; place-items: center; border: 1px solid rgba(0,230,118,.45); border-radius: 8px; background: var(--green-dark); color: var(--green); font: 800 17px/1 ui-monospace, monospace; }
    nav { display: flex; gap: 20px; color: var(--muted); font-size: .9rem; }
    nav a { text-decoration: none; }
    nav a:hover { color: var(--ink); }
    main { padding-bottom: 96px; }
    .hero { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(260px, .55fr); gap: 72px; align-items: end; min-height: 650px; padding: 90px 0 80px; }
    .eyebrow { margin: 0 0 22px; color: var(--green); font: 720 .78rem/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .14em; text-transform: uppercase; }
    h1 { max-width: 850px; margin: 0; font-size: clamp(3.2rem, 8.5vw, 7.4rem); line-height: .89; letter-spacing: -.07em; }
    .lede { max-width: 700px; margin: 30px 0 0; color: var(--muted); font-size: clamp(1.05rem, 2vw, 1.3rem); }
    .actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 36px; }
    .button { display: inline-flex; min-height: 48px; align-items: center; justify-content: center; border: 1px solid var(--line); border-radius: 10px; padding: 0 17px; font-weight: 720; text-decoration: none; transition: transform .16s ease, border-color .16s ease, background .16s ease; }
    .button:hover { transform: translateY(-2px); border-color: #4a4a56; }
    .button.primary { border-color: var(--green); background: var(--green); color: #06130c; }
    .proof-stamp { border-top: 1px solid var(--line); padding-top: 20px; color: var(--muted); }
    .proof-stamp strong { display: block; margin-bottom: 5px; color: var(--ink); font-size: 1.1rem; }
    .live { display: inline-block; width: 8px; height: 8px; margin-right: 8px; border-radius: 50%; background: var(--green); box-shadow: 0 0 18px var(--green); }
    section { border-top: 1px solid var(--line); padding: 80px 0; }
    .section-head { display: grid; grid-template-columns: .55fr 1.45fr; gap: 42px; margin-bottom: 42px; }
    h2 { margin: 0; font-size: clamp(1.8rem, 4vw, 3.3rem); line-height: 1.02; letter-spacing: -.045em; }
    .section-copy { max-width: 680px; margin: 0; color: var(--muted); font-size: 1.08rem; }
    .facts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .fact, .proof, .step { border: 1px solid var(--line); border-radius: 14px; background: rgba(16,16,21,.84); }
    .fact { min-height: 190px; padding: 22px; }
    .fact-number { color: var(--green); font: 760 2rem/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
    .fact h3 { margin: 34px 0 7px; font-size: 1rem; }
    .fact p { margin: 0; color: var(--muted); font-size: .9rem; }
    .flow { display: grid; grid-template-columns: repeat(5, 1fr); gap: 9px; }
    .step { position: relative; min-height: 210px; padding: 20px; }
    .step:not(:last-child)::after { position: absolute; top: 27px; right: -9px; z-index: 2; width: 9px; height: 1px; background: var(--green); content: ""; }
    .step-index { color: var(--green); font: 740 .77rem/1 ui-monospace, monospace; }
    .step h3 { margin: 50px 0 8px; font-size: 1rem; }
    .step p { margin: 0; color: var(--muted); font-size: .86rem; }
    .proofs { display: grid; gap: 12px; }
    .proof { display: grid; grid-template-columns: 170px 1fr auto; gap: 20px; align-items: center; padding: 19px 20px; }
    .proof-label { color: var(--muted); font: 700 .76rem/1.2 ui-monospace, monospace; letter-spacing: .08em; text-transform: uppercase; }
    .proof-value { min-width: 0; overflow-wrap: anywhere; font: .86rem/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
    .proof a { color: var(--green); font-weight: 700; text-underline-offset: 4px; white-space: nowrap; }
    .quick-start { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
    .quick-start ol { margin: 0; padding: 0; list-style: none; counter-reset: quick; }
    .quick-start li { display: grid; grid-template-columns: 36px 1fr; gap: 12px; align-items: start; padding: 17px 0; border-top: 1px solid var(--line); counter-increment: quick; }
    .quick-start li::before { display: grid; width: 26px; height: 26px; place-items: center; border-radius: 50%; background: var(--green-dark); color: var(--green); content: counter(quick); font: 720 .78rem/1 ui-monospace, monospace; }
    .note { align-self: start; border-left: 3px solid var(--amber); background: rgba(255,171,0,.07); padding: 20px 22px; color: #d6d6df; }
    .note strong { display: block; margin-bottom: 7px; color: var(--amber); }
    footer { display: flex; justify-content: space-between; gap: 30px; border-top: 1px solid var(--line); padding: 28px 0 52px; color: var(--muted); font-size: .87rem; }
    footer p { margin: 0; }
    @media (max-width: 900px) {
      .hero { grid-template-columns: 1fr; gap: 40px; min-height: auto; padding-top: 80px; }
      .proof-stamp { max-width: 420px; }
      .flow { grid-template-columns: 1fr 1fr; }
      .step:not(:last-child)::after { display: none; }
      .proof { grid-template-columns: 130px 1fr; }
      .proof a { grid-column: 2; }
    }
    @media (max-width: 640px) {
      .shell { width: min(100% - 28px, var(--max)); }
      header { min-height: 70px; }
      nav a:first-child { display: none; }
      h1 { font-size: clamp(3.1rem, 18vw, 5rem); }
      .hero { padding: 64px 0; }
      section { padding: 60px 0; }
      .section-head, .quick-start { grid-template-columns: 1fr; gap: 24px; }
      .facts, .flow { grid-template-columns: 1fr; }
      .fact { min-height: 150px; }
      .fact h3 { margin-top: 28px; }
      .proof { grid-template-columns: 1fr; gap: 7px; }
      .proof a { grid-column: auto; margin-top: 7px; }
      footer { flex-direction: column; }
    }
    @media (prefers-reduced-motion: reduce) {
      html { scroll-behavior: auto; }
      .button { transition: none; }
    }
  </style>
</head>
<body>
  <a class="skip-link" href="#content">Skip to content</a>
  <header class="shell">
    <a class="brand" href="#content" aria-label="Magic Chess home"><span class="mark" aria-hidden="true">M</span>Magic Chess</a>
    <nav aria-label="Primary navigation">
      <a href="#architecture">Architecture</a>
      <a href="#proof">Proof</a>
      <a href="${REPOSITORY_URL}" target="_blank" rel="noreferrer">GitHub ↗</a>
    </nav>
  </header>

  <main id="content" class="shell">
    <div class="hero">
      <div>
        <p class="eyebrow">Live on Solana devnet + MagicBlock ER</p>
        <h1>Chess-speed execution. Solana settlement.</h1>
        <p class="lede">Magic Chess keeps match creation, escrow, and settlement on Solana while delegated moves execute in a MagicBlock Ephemeral Rollup—with one session approval instead of a wallet popup every turn.</p>
        <div class="actions">
          <a class="button primary" href="${DEV_ARENA_URL}" target="_blank" rel="noreferrer">Open dev arena ↗</a>
          <a class="button" href="${MOVE_URL}" target="_blank" rel="noreferrer">Verify an ER move</a>
        </div>
      </div>
      <aside class="proof-stamp" aria-label="Deployment status">
        <strong><span class="live" aria-hidden="true"></span>Verified end to end</strong>
        Session creation, account delegation, and a popup-free move were replayed against the deployed devnet program.
      </aside>
    </div>

    <section aria-labelledby="live-title">
      <div class="section-head">
        <h2 id="live-title">What is live</h2>
        <p class="section-copy">A working multiplayer transaction path, not a mocked game board. The dev build uses Privy for player identity and sponsored base-layer operations, then a temporary SessionTokenV2 signer for delegated gameplay.</p>
      </div>
      <div class="facts">
        <article class="fact"><span class="fact-number">01</span><h3>Real match accounts</h3><p>Create and join write to the deployed Anchor program. The live lobby reads actual open matches.</p></article>
        <article class="fact"><span class="fact-number">02</span><h3>Fast delegated moves</h3><p>Moves run against the regional MagicBlock ER endpoint that owns the delegated match account.</p></article>
        <article class="fact"><span class="fact-number">03</span><h3>Deterministic settlement</h3><p>Timeout, commit, undelegation, and payout return the authoritative result to Solana L1.</p></article>
      </div>
    </section>

    <section id="architecture" aria-labelledby="architecture-title">
      <div class="section-head">
        <h2 id="architecture-title">One match, two execution layers</h2>
        <p class="section-copy">Custody remains on Solana. Only the mutable match state is delegated for low-latency play, and every transition is still signed and verifiable.</p>
      </div>
      <div class="flow" aria-label="Transaction lifecycle">
        <article class="step"><span class="step-index">01 / L1</span><h3>Create + escrow</h3><p>Player creates the match and funds its wager account.</p></article>
        <article class="step"><span class="step-index">02 / L1</span><h3>Join</h3><p>The opponent joins and the program locks both sides of the match.</p></article>
        <article class="step"><span class="step-index">03 / L1</span><h3>Authorize</h3><p>A scoped, expiring SessionTokenV2 is created for popup-free play.</p></article>
        <article class="step"><span class="step-index">04 / ER</span><h3>Play</h3><p>The session signer submits moves to the account’s resolved regional runtime.</p></article>
        <article class="step"><span class="step-index">05 / L1</span><h3>Settle</h3><p>Final state commits back before the program distributes the payout.</p></article>
      </div>
    </section>

    <section id="proof" aria-labelledby="proof-title">
      <div class="section-head">
        <h2 id="proof-title">Reproducible devnet proof</h2>
        <p class="section-copy">These links are from one fresh smoke-test flow. The ER link preserves the exact regional RPC returned by MagicBlock’s router.</p>
      </div>
      <div class="proofs">
        <div class="proof"><span class="proof-label">Program</span><span class="proof-value">${PROGRAM_ID}</span><a href="${PROGRAM_URL}" target="_blank" rel="noreferrer">Explorer ↗</a></div>
        <div class="proof"><span class="proof-label">SessionTokenV2</span><span class="proof-value">${SESSION_SIGNATURE}</span><a href="${SESSION_URL}" target="_blank" rel="noreferrer">Explorer ↗</a></div>
        <div class="proof"><span class="proof-label">Delegation</span><span class="proof-value">${DELEGATION_SIGNATURE}</span><a href="${DELEGATION_URL}" target="_blank" rel="noreferrer">Explorer ↗</a></div>
        <div class="proof"><span class="proof-label">ER move</span><span class="proof-value">${MOVE_SIGNATURE}</span><a href="${MOVE_URL}" target="_blank" rel="noreferrer">MagicBlock RPC ↗</a></div>
      </div>
    </section>

    <section aria-labelledby="try-title">
      <div class="section-head">
        <h2 id="try-title">Try the complete path</h2>
        <p class="section-copy">Use two clean browser profiles so each player owns a distinct wallet and session. This deployment is intentionally isolated on devnet.</p>
      </div>
      <div class="quick-start">
        <ol>
          <li>Open the dev arena in two browser profiles and sign in as two users.</li>
          <li>Create a match in the first profile, then open its link and join from the second.</li>
          <li>Approve fast play once for each player and alternate legal moves.</li>
          <li>Open each transaction link from the in-app status notification to verify its execution layer.</li>
        </ol>
        <aside class="note">
          <strong>“Popup-free” is precise UX language.</strong>
          Every move is still cryptographically signed by a temporary in-memory session key. Players do not repeatedly approve with their Privy wallet, and ER execution does not charge them a per-move L1 fee.
        </aside>
      </div>
    </section>
  </main>

  <footer class="shell">
    <p>Magic Chess · Solana devnet technical proof</p>
    <p><a href="${REPOSITORY_URL}" target="_blank" rel="noreferrer">Public source ↗</a></p>
  </footer>
</body>
</html>`;

const PAGE_HEADERS = {
  "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
  "Content-Security-Policy":
    "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; upgrade-insecure-requests",
  "Content-Type": "text/html; charset=utf-8",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

function pageResponse(method) {
  return new Response(method === "HEAD" ? null : HTML, {
    headers: PAGE_HEADERS,
    status: 200,
  });
}

export default {
  async fetch(request) {
    const { method } = request;
    const { pathname } = new URL(request.url);

    if (method !== "GET" && method !== "HEAD") {
      return new Response("Method not allowed", {
        headers: { Allow: "GET, HEAD", "Content-Type": "text/plain; charset=utf-8" },
        status: 405,
      });
    }

    if (pathname === "/health") {
      return new Response(method === "HEAD" ? null : JSON.stringify({ status: "ok" }), {
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "application/json; charset=utf-8",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    if (pathname === "/" || pathname === "/index.html") {
      return pageResponse(method);
    }

    return new Response(method === "HEAD" ? null : "Not found", {
      headers: { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff" },
      status: 404,
    });
  },
};

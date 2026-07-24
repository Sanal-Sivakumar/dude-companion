"use client";

import { useMemo, useState } from "react";

export default function Home() {
  const [copied, setCopied] = useState(false);
  const command = useMemo(() => {
    if (typeof window === "undefined") return "curl -fsSL https://this-site/install.sh | bash";
    const origin = window.location.origin;
    return `curl -fsSL ${origin}/install.sh | bash`;
  }, []);

  async function copyCommand() {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <main>
      <nav>
        <a className="wordmark" href="#top" aria-label="Dude Companion home">
          <span className="mark">D</span>Dude Companion
        </a>
        <div className="nav-links">
          <a href="#life">How it lives</a>
          <a href="#privacy">Permissions</a>
          <a className="nav-cta" href="#install">Get for Mac</a>
        </div>
      </nav>

      <section id="top" className="hero">
        <div className="hero-copy">
          <p className="availability"><span /> macOS · Apple silicon preview</p>
          <h1>A tiny roommate for your desktop.</h1>
          <p className="lede">Throw them. Chat with them. Let them perch on the edge while you work. Dude and Dudette are adorable, physics-driven companions who help without becoming another notification machine.</p>
          <div id="install" className="terminal" aria-label="Terminal installation command">
            <div className="terminal-bar"><span /><span /><span /><b>Terminal</b></div>
            <div className="command-row">
              <code><i>$</i> {command}</code>
              <button onClick={copyCommand}>{copied ? "Copied" : "Copy"}</button>
            </div>
          </div>
          <p className="install-note">One command. Drag to Applications automatically. No account required.</p>
        </div>

        <div className="hero-stage" aria-label="Dude and Dudette characters">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <img className="character male" src="/male.png" alt="Dude, an adorable hooded desktop companion" />
          <img className="character female" src="/female.png" alt="Dudette, an adorable hooded desktop companion" />
          <div className="speech-chip chip-one">CPU is calm. Suspiciously calm.</div>
          <div className="speech-chip chip-two">Your reminder is armed.</div>
          <div className="edge-label">REAL MOMENTUM</div>
        </div>
      </section>

      <section id="life" className="life">
        <div className="section-heading">
          <h2>Not a floating chatbot.<br />A little physical presence.</h2>
          <p>The companion has weight, spring, impact, posture, and an oddly specific sense of dignity.</p>
        </div>
        <div className="feature-run">
          <article><span>01</span><h3>Swing and release</h3><p>Hold, build momentum, and let go. They arc, collide, tumble, recover—or decide the floor is fine.</p></article>
          <article><span>02</span><h3>Quiet awareness</h3><p>CPU, memory, active time, and reminders are available without constant commentary.</p></article>
          <article><span>03</span><h3>Actual personality</h3><p>They walk, sit, hang, leave the screen, return with props, and make short decisions from context.</p></article>
          <article><span>04</span><h3>Your version</h3><p>Choose Dude, Dudette, or both. Change colorways, motion energy, quiet mode, and startup behavior.</p></article>
        </div>
      </section>

      <section className="wardrobe">
        <div className="wardrobe-copy">
          <h2>Wardrobe changes.<br />Tiny privacy department.</h2>
          <p>Outfits switch through a deliberately ridiculous, fully covered censor gag. Nothing explicit is ever rendered—just sheepish timing, a black rectangle, and excellent tailoring.</p>
          <div className="outfit-tags"><span>Night Ops</span><span>Ember Club</span><span>Moonlight</span><span>More coming</span></div>
        </div>
        <div className="censor-demo">
          <img src="/female.png" alt="Dudette in her Night Ops outfit" />
          <div className="censor-card">MODESTY<br />PATCH</div>
          <p>“Couture has protocols.”</p>
        </div>
      </section>

      <section id="privacy" className="privacy">
        <div>
          <p className="availability"><span /> You stay in charge</p>
          <h2>Computer control without the mystery.</h2>
        </div>
        <div className="permission-flow">
          <div><b>1</b><span><strong>You ask</strong><small>“Open Safari” or “change my wallpaper.”</small></span></div>
          <div><b>2</b><span><strong>Dude explains</strong><small>The exact action and target appear before anything happens.</small></span></div>
          <div><b>3</b><span><strong>You choose</strong><small>Cancel, allow once, or remember that one permission.</small></span></div>
        </div>
      </section>

      <section className="final-cta">
        <img src="/male.png" alt="" />
        <div><h2>Your desktop looks lonely.</h2><p>Give it a tiny hooded professional.</p></div>
        <button onClick={copyCommand}>{copied ? "Command copied" : "Copy install command"}</button>
      </section>

      <footer><span>Dude Companion · macOS preview</span><span>Original characters · Permission-gated actions · Quiet by default</span></footer>
    </main>
  );
}

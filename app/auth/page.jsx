"use client";
// ============================================================
// app/auth/page.jsx
// ============================================================
// Sign in / Sign up using Supabase Auth (browser client).
// Uses @supabase/ssr createBrowserClient — anon key only,
// safe to use in "use client" components.
//
// Flows:
//   - Email + password sign in
//   - Email + password sign up (creates user_profiles row via trigger)
//   - Magic link (passwordless email)
//   - Redirect to /garage after successful auth
//
// TODO: add Google OAuth button once provider is enabled
//       in Supabase dashboard → Authentication → Providers
// ============================================================

import { useState, useEffect } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const supabase = createBrowserSupabaseClient();

const css = `
  *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }

  .auth-wrap {
    min-height: 100vh;
    background: #0a0909;
    display: grid;
    grid-template-columns: 1fr 480px;
  }

  /* ── LEFT PANEL — branding ── */
  .auth-left {
    background: #111010;
    border-right: 1px solid #2a2828;
    display: flex; flex-direction: column;
    justify-content: space-between;
    padding: 48px;
    position: relative; overflow: hidden;
  }
  .auth-left::before {
    content: '';
    position: absolute; inset: 0;
    background-image:
      linear-gradient(rgba(232,98,26,0.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(232,98,26,0.04) 1px, transparent 1px);
    background-size: 40px 40px;
  }
  .auth-left::after {
    content: '';
    position: absolute;
    bottom: -120px; left: -120px;
    width: 500px; height: 500px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(232,98,26,0.08) 0%, transparent 70%);
    pointer-events: none;
  }
  .auth-logo {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 32px; letter-spacing: 0.08em;
    color: #f0ebe3; position: relative; z-index: 1;
  }
  .auth-logo span { color: #e8621a; }
  .auth-hero-text {
    position: relative; z-index: 1;
  }
  .auth-hero-title {
    font-family: 'Bebas Neue', sans-serif;
    font-size: clamp(52px, 6vw, 80px);
    line-height: 0.92; letter-spacing: 0.02em;
    color: #f0ebe3; margin-bottom: 20px;
  }
  .auth-hero-title .accent { color: #e8621a; }
  .auth-hero-title .outline {
    -webkit-text-stroke: 1px #8a8784;
    color: transparent;
  }
  .auth-hero-sub {
    font-size: 16px; font-weight: 500;
    color: #8a8784; line-height: 1.5; max-width: 400px;
  }
  .auth-perks {
    display: flex; flex-direction: column; gap: 12px;
    position: relative; z-index: 1;
  }
  .auth-perk {
    display: flex; align-items: center; gap: 12px;
  }
  .auth-perk-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: #e8621a; flex-shrink: 0;
    box-shadow: 0 0 6px rgba(232,98,26,0.5);
  }
  .auth-perk-text {
    font-family: 'Share Tech Mono', monospace;
    font-size: 10px; color: #8a8784; letter-spacing: 0.14em;
  }
  .auth-perk-text strong { color: #f0ebe3; }

  /* ── RIGHT PANEL — form ── */
  .auth-right {
    padding: 48px 40px;
    display: flex; flex-direction: column;
    justify-content: center;
    background: #0a0909;
  }
  .auth-tabs {
    display: grid; grid-template-columns: 1fr 1fr;
    gap: 0; margin-bottom: 32px;
    border: 1px solid #2a2828; border-radius: 2px; overflow: hidden;
  }
  .auth-tab {
    padding: 12px; text-align: center; cursor: pointer;
    font-family: 'Bebas Neue', sans-serif;
    font-size: 18px; letter-spacing: 0.08em;
    color: #8a8784; background: #111010;
    border: none; transition: all 0.2s;
  }
  .auth-tab.active {
    background: #e8621a; color: #0a0909;
  }
  .auth-tab:not(.active):hover { color: #f0ebe3; background: #1a1919; }

  /* form fields */
  .auth-form { display: flex; flex-direction: column; gap: 14px; }
  .auth-field { display: flex; flex-direction: column; gap: 6px; }
  .auth-label {
    font-family: 'Share Tech Mono', monospace;
    font-size: 9px; color: #8a8784; letter-spacing: 0.18em;
  }
  .auth-input {
    height: 48px;
    background: #111010; border: 1px solid #2a2828;
    color: #f0ebe3; font-family: 'Barlow Condensed', sans-serif;
    font-size: 16px; font-weight: 500;
    padding: 0 16px; border-radius: 2px; outline: none;
    transition: border-color 0.2s;
  }
  .auth-input:focus { border-color: #e8621a; }
  .auth-input::placeholder { color: #3a3838; }
  .auth-input.error { border-color: #b91c1c; }

  /* password toggle */
  .auth-input-wrap { position: relative; }
  .auth-input-wrap .auth-input { width: 100%; padding-right: 48px; }
  .pw-toggle {
    position: absolute; right: 14px; top: 50%;
    transform: translateY(-50%);
    background: none; border: none;
    color: #8a8784; cursor: pointer; font-size: 16px;
    transition: color 0.15s; padding: 0;
  }
  .pw-toggle:hover { color: #f0ebe3; }

  /* submit */
  .auth-submit {
    height: 50px; width: 100%;
    background: #e8621a; border: none;
    color: #0a0909; font-family: 'Bebas Neue', sans-serif;
    font-size: 22px; letter-spacing: 0.1em;
    border-radius: 2px; cursor: pointer;
    transition: all 0.2s; margin-top: 6px;
    box-shadow: 0 4px 24px rgba(232,98,26,0.25);
  }
  .auth-submit:hover:not(:disabled) {
    background: #c94f0f;
    box-shadow: 0 6px 32px rgba(232,98,26,0.4);
    transform: translateY(-1px);
  }
  .auth-submit:disabled {
    opacity: 0.5; cursor: not-allowed;
    transform: none; box-shadow: none;
  }

  /* divider */
  .auth-divider {
    display: flex; align-items: center; gap: 12px;
    margin: 6px 0;
  }
  .auth-divider-line { flex: 1; height: 1px; background: #2a2828; }
  .auth-divider-text {
    font-family: 'Share Tech Mono', monospace;
    font-size: 9px; color: #8a8784; letter-spacing: 0.15em;
  }

  /* magic link */
  .magic-btn {
    height: 48px; width: 100%;
    background: transparent; border: 1px solid #2a2828;
    color: #8a8784; font-family: 'Bebas Neue', sans-serif;
    font-size: 17px; letter-spacing: 0.08em;
    border-radius: 2px; cursor: pointer;
    transition: all 0.2s;
  }
  .magic-btn:hover { border-color: #e8621a; color: #e8621a; }

  /* messages */
  .auth-error {
    background: rgba(185,28,28,0.08);
    border: 1px solid rgba(185,28,28,0.25);
    border-radius: 2px; padding: 10px 14px;
    font-family: 'Share Tech Mono', monospace;
    font-size: 9px; color: #ef4444; letter-spacing: 0.1em;
    line-height: 1.5;
  }
  .auth-success {
    background: rgba(34,197,94,0.08);
    border: 1px solid rgba(34,197,94,0.25);
    border-radius: 2px; padding: 14px;
    font-family: 'Share Tech Mono', monospace;
    font-size: 9px; color: #22c55e; letter-spacing: 0.1em;
    line-height: 1.6; text-align: center;
  }
  .auth-success .check { font-size: 24px; display: block; margin-bottom: 8px; }

  /* footer link */
  .auth-footer {
    margin-top: 20px; text-align: center;
    font-family: 'Share Tech Mono', monospace;
    font-size: 9px; color: #8a8784; letter-spacing: 0.1em;
  }
  .auth-footer a {
    color: #e8621a; cursor: pointer; text-decoration: none;
  }
  .auth-footer a:hover { text-decoration: underline; }

  /* loading spinner */
  @keyframes spin { to { transform: rotate(360deg); } }
  .spinner {
    width: 16px; height: 16px; border-radius: 50%;
    border: 2px solid rgba(10,9,9,0.3);
    border-top-color: #0a0909;
    animation: spin 0.7s linear infinite;
    display: inline-block; vertical-align: middle; margin-right: 8px;
  }

  /* page load animation */
  @keyframes fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
  .auth-right { animation: fadeUp 0.3s ease; }

  @media (max-width: 760px) {
    .auth-wrap { grid-template-columns: 1fr; }
    .auth-left { display: none; }
    .auth-right { padding: 32px 24px; }
  }
`;

export default function AuthPage() {
  const [mode,       setMode]       = useState("signin"); // "signin" | "signup"
  const [email,      setEmail]      = useState("");
  const [password,   setPassword]   = useState("");
  const [firstName,  setFirstName]  = useState("");
  const [lastName,   setLastName]   = useState("");
  const [showPw,     setShowPw]     = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);
  const [success,    setSuccess]    = useState(null);
  const [magicSent,  setMagicSent]  = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) window.location.href = "/garage";
    });
  }, []);

  const clearMessages = () => { setError(null); setSuccess(null); };

  // ── Sign In ───────────────────────────────────────────────
  const handleSignIn = async (e) => {
    e.preventDefault();
    clearMessages(); setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      window.location.href = "/garage";
    }
  };

  // ── Sign Up ───────────────────────────────────────────────
  const handleSignUp = async (e) => {
    e.preventDefault();
    clearMessages();
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: {
        data: {
          first_name: firstName,
          last_name:  lastName,
          full_name:  `${firstName} ${lastName}`.trim(),
        },
        // Supabase sends confirmation email automatically
        // user_profiles row is created by DB trigger on auth.users insert
      },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setSuccess("Account created! Check your email to confirm your address, then sign in.");
    }
  };

  // ── Magic Link ────────────────────────────────────────────
  const handleMagicLink = async () => {
    if (!email) { setError("Enter your email address first."); return; }
    clearMessages(); setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/garage` },
    });
    setLoading(false);
    if (error) { setError(error.message); }
    else        { setMagicSent(true); }
  };

  const B = s => ({ fontFamily:"'Bebas Neue',sans-serif",     ...s });
  const M = s => ({ fontFamily:"'Share Tech Mono',monospace", ...s });

  return (
    <div className="auth-wrap">
      <style>{css}</style>

      {/* ── LEFT — Branding ── */}
      <div className="auth-left">
        <div className="auth-logo">STINKIN<span>'</span> SUPPLIES</div>

        <div className="auth-hero-text">
          <div className="auth-hero-title">
            YOUR<br/>
            <span className="accent">RIDE.</span><br/>
            YOUR<br/>
            <span className="outline">PARTS.</span>
          </div>
          <p className="auth-hero-sub">
            Sign in to access your garage, track orders, redeem points, and get fitment-specific results across 500K+ parts.
          </p>
        </div>

        <div className="auth-perks">
          {[
            ["MY GARAGE", "Save your bikes, get parts that fit"],
            ["POINTS & REWARDS", "Earn 10× points on every order"],
            ["ORDER HISTORY", "Track every build, every purchase"],
            ["WISHLIST", "Save parts for your next build"],
          ].map(([strong, sub]) => (
            <div key={strong} className="auth-perk">
              <div className="auth-perk-dot"/>
              <div className="auth-perk-text"><strong>{strong}</strong> — {sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── RIGHT — Form ── */}
      <div className="auth-right">
        <div style={M({fontSize:9, color:"#8a8784", letterSpacing:"0.2em", marginBottom:20})}>
          ACCOUNT ACCESS
        </div>

        {/* Tabs */}
        <div className="auth-tabs">
          <button className={`auth-tab ${mode==="signin"?"active":""}`} onClick={() => { setMode("signin"); clearMessages(); }}>
            SIGN IN
          </button>
          <button className={`auth-tab ${mode==="signup"?"active":""}`} onClick={() => { setMode("signup"); clearMessages(); }}>
            CREATE ACCOUNT
          </button>
        </div>

        {/* Magic link sent state */}
        {magicSent ? (
          <div className="auth-success">
            <span className="check">✉</span>
            MAGIC LINK SENT TO {email.toUpperCase()}<br/>
            CHECK YOUR INBOX AND CLICK THE LINK TO SIGN IN.<br/><br/>
            <span style={{color:"#8a8784"}}>LINK EXPIRES IN 1 HOUR.</span>
          </div>
        ) : success ? (
          <div className="auth-success">
            <span className="check">✓</span>
            {success}
          </div>
        ) : (
          <form onSubmit={mode === "signin" ? handleSignIn : handleSignUp} className="auth-form">

            {/* Sign up extra fields */}
            {mode === "signup" && (
              <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:14}}>
                <div className="auth-field">
                  <label className="auth-label">FIRST NAME</label>
                  <input className="auth-input" type="text" placeholder="John" value={firstName} onChange={e=>setFirstName(e.target.value)} required/>
                </div>
                <div className="auth-field">
                  <label className="auth-label">LAST NAME</label>
                  <input className="auth-input" type="text" placeholder="Doe" value={lastName} onChange={e=>setLastName(e.target.value)} required/>
                </div>
              </div>
            )}

            {/* Email */}
            <div className="auth-field">
              <label className="auth-label">EMAIL ADDRESS</label>
              <input
                className={`auth-input ${error&&error.toLowerCase().includes("email")?"error":""}`}
                type="email" placeholder="you@example.com"
                value={email} onChange={e=>setEmail(e.target.value)}
                required autoComplete="email"
              />
            </div>

            {/* Password */}
            <div className="auth-field">
              <label className="auth-label">
                PASSWORD {mode==="signup" && <span style={{color:"#3a3838"}}> — MIN 8 CHARACTERS</span>}
              </label>
              <div className="auth-input-wrap">
                <input
                  className={`auth-input ${error&&error.toLowerCase().includes("password")?"error":""}`}
                  type={showPw?"text":"password"}
                  placeholder={mode==="signup"?"Create a password":"Your password"}
                  value={password} onChange={e=>setPassword(e.target.value)}
                  required autoComplete={mode==="signup"?"new-password":"current-password"}
                />
                <button type="button" className="pw-toggle" onClick={() => setShowPw(s=>!s)}>
                  {showPw ? "🙈" : "👁"}
                </button>
              </div>
            </div>

            {/* Forgot password */}
            {mode === "signin" && (
              <div style={{textAlign:"right", marginTop:-6}}>
                <span
                  style={M({fontSize:9, color:"#8a8784", letterSpacing:"0.1em", cursor:"pointer"})}
                  onClick={handleMagicLink}
                >
                  FORGOT PASSWORD? SEND MAGIC LINK →
                </span>
              </div>
            )}

            {/* Error message */}
            {error && <div className="auth-error">{error.toUpperCase()}</div>}

            {/* Submit */}
            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? <><span className="spinner"/>SIGNING {mode==="signin"?"IN":"UP"}...</> : mode==="signin" ? "SIGN IN →" : "CREATE ACCOUNT →"}
            </button>

            {/* Magic link divider */}
            <div className="auth-divider">
              <div className="auth-divider-line"/>
              <span className="auth-divider-text">OR</span>
              <div className="auth-divider-line"/>
            </div>

            <button type="button" className="magic-btn" onClick={handleMagicLink} disabled={loading}>
              ✉ SEND MAGIC LINK (PASSWORDLESS)
            </button>
          </form>
        )}

        {/* Footer */}
        <div className="auth-footer">
          {mode === "signin"
            ? <>DON'T HAVE AN ACCOUNT? <a onClick={() => { setMode("signup"); clearMessages(); }}>CREATE ONE FREE</a></>
            : <>ALREADY HAVE AN ACCOUNT? <a onClick={() => { setMode("signin"); clearMessages(); }}>SIGN IN</a></>
          }
        </div>

        <div style={{...M({fontSize:8, color:"#3a3838", letterSpacing:"0.1em", textAlign:"center"}), marginTop:24}}>
          BY CREATING AN ACCOUNT YOU AGREE TO OUR TERMS OF SERVICE
        </div>
      </div>
    </div>
  );
}

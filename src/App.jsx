import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────
//  SUPABASE
// ─────────────────────────────────────────────
const SUPABASE_URL  = "https://ffqielwltmfdqpmifuzj.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZmcWllbHdsdG1mZHFwbWlmdXpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NDY4NTgsImV4cCI6MjA4NzIyMjg1OH0.IRj63P9H4rsf4ClkB9xvaEQQG4Wu7eXqVRyjKP763QU";
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

// ─────────────────────────────────────────────
//  PRICING FUNCTIONS
// ─────────────────────────────────────────────
async function fetchPokemonPrice(name, setName) {
  try {
    const q = encodeURIComponent(`name:"${name}" set.name:"${setName}"`);
    const res = await fetch(`https://api.pokemontcg.io/v2/cards?q=${q}&pageSize=1`);
    const data = await res.json();
    const card = data.data?.[0];
    if (!card) return null;
    const prices = card.tcgplayer?.prices;
    const market = prices?.holoRare?.market || prices?.normal?.market ||
      prices?.["1stEditionHolofoil"]?.market || prices?.reverseHolofoil?.market ||
      Object.values(prices || {})[0]?.market;
    return market ? { value: market, source: "TCGPlayer", cardImage: card.images?.small, cardImageLarge: card.images?.large } : null;
  } catch { return null; }
}

async function fetchMagicPrice(name, setName) {
  try {
    const q = encodeURIComponent(`!"${name}"${setName ? ` set:${setName}` : ""}`);
    const res = await fetch(`https://api.scryfall.com/cards/search?q=${q}&order=usd&limit=1`);
    const data = await res.json();
    const card = data.data?.[0];
    if (!card) return null;
    const value = parseFloat(card.prices?.usd || card.prices?.usd_foil || 0);
    const img = card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal;
    return value ? { value, source: "Scryfall", cardImage: card.image_uris?.small || card.card_faces?.[0]?.image_uris?.small, cardImageLarge: img } : null;
  } catch { return null; }
}

async function fetchLiveData(card) {
  if (card.category === "tcg") {
    if (card.game === "Pokémon") return fetchPokemonPrice(card.name, card.set_name);
    if (card.game === "Magic: The Gathering") return fetchMagicPrice(card.name, card.set_name);
  }
  return null;
}

async function fetchEbayPrice(card) {
  try {
    const isGraded = card.condition && !card.condition.startsWith("Raw");
    const suffix = card.category === "sports" ? "sports card" : "card";

    // Primary: year + name + set (raw) or year + name + grade (graded)
    // Fallback: year + name only — broad enough to always find listings
    const primary = isGraded
      ? [card.year, card.name, card.condition, suffix].filter(Boolean).join(" ")
      : [card.year, card.name, card.set_name, suffix].filter(Boolean).join(" ");
    const fallback = [card.year, card.name, suffix].filter(Boolean).join(" ");

    for (const query of [primary, fallback]) {
      if (!query.trim()) continue;
      const res = await fetch("/api/ebay-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, exact: true }),
      });
      const { items = [] } = await res.json();
      const prices = items.map(i => i.value).filter(v => v > 0).sort((a, b) => a - b);
      if (prices.length > 0) {
        const mid = Math.floor(prices.length / 2);
        return prices.length % 2 === 0
          ? Math.round(((prices[mid - 1] + prices[mid]) / 2) * 100) / 100
          : prices[mid];
      }
    }
    return null;
  } catch { return null; }
}

async function searchCardPrice(query) {
  try {
    const res = await fetch("/api/ebay-proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    const data = await res.json();
    return data.items || [];
  } catch { return []; }
}

// ─────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────
const conditions = ["Raw NM","Raw EX","Raw VG","PSA 10","PSA 9","PSA 8","PSA 7","BGS 9.5","BGS 9","BGS 8.5"];
const sports     = ["Baseball","Basketball","Football","Hockey","Soccer","Tennis"];
const tcgGames   = ["Pokémon","Magic: The Gathering","Yu-Gi-Oh!","Dragon Ball Super","One Piece","Flesh and Blood"];
const graders    = ["PSA","BGS","SGC","CGC","HGA","None"];

const conditionBadge = {
  "PSA 10":{ bg:"rgba(16,185,129,0.15)", color:"#10b981", border:"rgba(16,185,129,0.3)" },
  "BGS 9.5":{ bg:"rgba(16,185,129,0.12)",color:"#34d399", border:"rgba(52,211,153,0.3)" },
  "PSA 9": { bg:"rgba(52,211,153,0.1)",  color:"#6ee7b7", border:"rgba(110,231,183,0.25)" },
  "BGS 9": { bg:"rgba(110,231,183,0.08)",color:"#a7f3d0", border:"rgba(167,243,208,0.2)" },
  "PSA 8": { bg:"rgba(245,158,11,0.12)", color:"#f59e0b", border:"rgba(245,158,11,0.3)" },
  "BGS 8.5":{ bg:"rgba(251,191,36,0.1)", color:"#fbbf24", border:"rgba(251,191,36,0.25)" },
  "Raw NM":{ bg:"rgba(99,102,241,0.12)", color:"#818cf8", border:"rgba(129,140,248,0.3)" },
  "Raw EX":{ bg:"rgba(99,102,241,0.08)", color:"#a5b4fc", border:"rgba(165,180,252,0.2)" },
  "Raw VG":{ bg:"rgba(239,68,68,0.1)",   color:"#f87171", border:"rgba(248,113,113,0.25)" },
  "PSA 7": { bg:"rgba(239,68,68,0.1)",   color:"#f87171", border:"rgba(248,113,113,0.25)" },
};

const sportColor = { Baseball:"#f59e0b",Basketball:"#f97316",Football:"#10b981",Hockey:"#60a5fa",Soccer:"#a78bfa",Tennis:"#34d399" };
const sportEmoji = { Baseball:"⚾",Basketball:"🏀",Football:"🏈",Hockey:"🏒",Soccer:"⚽",Tennis:"🎾" };
const gameColor  = { "Pokémon":"#facc15","Magic: The Gathering":"#a78bfa","Yu-Gi-Oh!":"#60a5fa","Dragon Ball Super":"#f97316","One Piece":"#f43f5e","Flesh and Blood":"#10b981" };
const gameEmoji  = { "Pokémon":"⚡","Magic: The Gathering":"🔮","Yu-Gi-Oh!":"👁","Dragon Ball Super":"🐉","One Piece":"☠️","Flesh and Blood":"⚔️" };
const graderVerifyUrl = {
  PSA: c=>`https://www.psacard.com/cert/verify/${c}`,
  BGS: c=>`https://www.beckett.com/grading/card-lookup?item_id=${c}`,
  SGC: c=>`https://www.gosgc.com/verify/${c}`,
  CGC: c=>`https://www.cgccards.com/certlookup/${c}/`,
  HGA: c=>`https://hgagrading.com/verify/${c}`,
};

// ─────────────────────────────────────────────
//  CSS
// ─────────────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=DM+Mono:wght@400;500&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{background:#0d0d12}
  ::-webkit-scrollbar{width:4px}
  ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:2px}
  .card-item{transition:transform 0.25s cubic-bezier(.34,1.56,.64,1),box-shadow 0.25s,border-color 0.2s}
  .card-item:hover{transform:translateY(-5px) scale(1.015);box-shadow:0 24px 60px rgba(0,0,0,0.55),0 0 0 1px rgba(139,92,246,0.25)!important;border-color:rgba(139,92,246,0.4)!important}
  .card-img{transition:transform 0.35s}
  .card-item:hover .card-img{transform:scale(1.04)}
  .btn-primary{transition:all 0.2s}
  .btn-primary:hover{transform:translateY(-1px);box-shadow:0 8px 25px rgba(139,92,246,0.4)!important}
  .btn-ghost{transition:background 0.15s}
  .btn-ghost:hover{background:rgba(255,255,255,0.07)!important}
  .input-field{transition:border-color 0.2s,box-shadow 0.2s}
  .input-field:focus{border-color:rgba(139,92,246,0.6)!important;box-shadow:0 0 0 3px rgba(139,92,246,0.1)!important;outline:none}
  .shimmer{background:linear-gradient(90deg,rgba(255,255,255,0.03) 25%,rgba(255,255,255,0.08) 50%,rgba(255,255,255,0.03) 75%);background-size:200% 100%;animation:shimmer 1.6s infinite}
  .foil-bar{background:linear-gradient(90deg,#8b5cf6,#6366f1,#06b6d4,#34d399,#8b5cf6);background-size:300% 100%;animation:foilMove 3s linear infinite}
  .price-result{transition:all 0.2s;cursor:pointer}
  .price-result:hover{background:rgba(139,92,246,0.08)!important;border-color:rgba(139,92,246,0.3)!important;transform:translateY(-2px)}
  .stat-card{transition:border-color 0.2s}
  .stat-card:hover{border-color:rgba(139,92,246,0.25)!important}
  .upload-zone{border:2px dashed rgba(139,92,246,0.3);border-radius:12px;transition:border-color 0.2s,background 0.2s;cursor:pointer}
  .upload-zone:hover{border-color:rgba(139,92,246,0.6);background:rgba(139,92,246,0.05)!important}
  @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
  @keyframes foilMove{0%{background-position:0% 0}100%{background-position:300% 0}}
  @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
  @keyframes modalIn{from{opacity:0;transform:scale(0.96) translateY(10px)}to{opacity:1;transform:scale(1) translateY(0)}}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes slideIn{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:translateX(0)}}
  @keyframes authFade{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
  .fade-up{animation:fadeUp 0.4s cubic-bezier(.34,1.56,.64,1) both}
  .modal-anim{animation:modalIn 0.25s cubic-bezier(.34,1.56,.64,1) both}
  .slide-in{animation:slideIn 0.3s ease both}
  .auth-fade{animation:authFade 0.5s ease both}
  .spin{animation:spin 0.75s linear infinite;display:inline-block}
`;

// ─────────────────────────────────────────────
//  SHARED COMPONENTS
// ─────────────────────────────────────────────
function Tag({ children, color="#8b5cf6", bg="rgba(139,92,246,0.12)", border="rgba(139,92,246,0.25)" }) {
  return <span style={{ display:"inline-flex",alignItems:"center",gap:4,fontSize:11,fontWeight:600,color,background:bg,border:`1px solid ${border}`,borderRadius:6,padding:"2px 8px" }}>{children}</span>;
}

function CardPlaceholder({ card }) {
  const accent = card.category==="sports"?(sportColor[card.sport]||"#818cf8"):(gameColor[card.game]||"#818cf8");
  const emoji  = card.category==="sports"?sportEmoji[card.sport]:gameEmoji[card.game];
  const badge  = conditionBadge[card.condition]||conditionBadge["Raw NM"];
  return (
    <div style={{ width:"100%",height:"100%",borderRadius:"14px 14px 0 0",background:`linear-gradient(160deg,#1a1a2e 0%,#16213e 60%,${accent}18 100%)`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:16,position:"relative",overflow:"hidden" }}>
      <div style={{ position:"absolute",top:"30%",left:"50%",transform:"translate(-50%,-50%)",width:80,height:80,borderRadius:"50%",background:`radial-gradient(circle,${accent}25 0%,transparent 70%)` }}/>
      <div style={{ fontSize:30,marginBottom:8,position:"relative",zIndex:1 }}>{emoji}</div>
      <div style={{ fontSize:12,fontWeight:700,color:"#e5e7eb",textAlign:"center",lineHeight:1.3,marginBottom:6,position:"relative",zIndex:1,maxWidth:"100%",overflow:"hidden",textOverflow:"ellipsis" }}>{card.name}</div>
      <span style={{ fontSize:10,fontWeight:600,color:badge.color,background:badge.bg,border:`1px solid ${badge.border}`,borderRadius:5,padding:"2px 7px" }}>{card.condition}</span>
    </div>
  );
}

function MiniSparkline({ positive }) {
  const pts = positive?"0,40 20,35 40,28 60,30 80,20 100,15 120,8":"0,10 20,15 40,22 60,20 80,30 100,35 120,42";
  return (
    <svg width="120" height="50" viewBox="0 0 120 50">
      <defs><linearGradient id={`g${positive}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={positive?"#10b981":"#ef4444"} stopOpacity="0.3"/><stop offset="100%" stopColor={positive?"#10b981":"#ef4444"} stopOpacity="0"/></linearGradient></defs>
      <polygon points={`0,40 ${pts} 120,50 0,50`} fill={`url(#g${positive})`}/>
      <polyline points={pts} fill="none" stroke={positive?"#10b981":"#ef4444"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ─────────────────────────────────────────────
//  AUTH SCREEN
// ─────────────────────────────────────────────
function AuthScreen({ onAuth }) {
  const [mode, setMode]         = useState("login");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [name, setName]         = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [success, setSuccess]   = useState("");

  const inp = { width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:12,color:"#f9fafb",padding:"13px 16px",fontFamily:"inherit",fontSize:14,outline:"none",marginBottom:12 };

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true); setError(""); setSuccess("");
    try {
      if (mode==="signup") {
        const { error } = await sb.auth.signUp({ email, password, options:{ data:{ name } } });
        if (error) throw error;
        setSuccess("Account created! Check your email to confirm, then sign in.");
        setMode("login");
      } else if (mode==="forgot") {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
        if (error) throw error;
        setSuccess("Password reset email sent! Check your inbox for a link to reset your password.");
      } else {
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onAuth(data.user);
      }
    } catch(err) { setError(err.message||"Something went wrong"); }
    setLoading(false);
  }

  const subtitle = mode==="login" ? "Sign in to your collection" : mode==="signup" ? "Create your vault" : "Enter your email to reset your password";

  return (
    <div style={{ minHeight:"100vh",background:"#0d0d12",display:"flex",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"'DM Sans',sans-serif",color:"#f9fafb" }}>
      <div style={{ position:"fixed",inset:0,pointerEvents:"none",overflow:"hidden" }}>
        <div style={{ position:"absolute",top:-200,left:-200,width:600,height:600,borderRadius:"50%",background:"radial-gradient(circle,rgba(139,92,246,0.08) 0%,transparent 70%)" }}/>
        <div style={{ position:"absolute",bottom:-200,right:-200,width:500,height:500,borderRadius:"50%",background:"radial-gradient(circle,rgba(59,130,246,0.05) 0%,transparent 70%)" }}/>
      </div>
      <div className="auth-fade" style={{ width:"100%",maxWidth:420,position:"relative",zIndex:1 }}>
        <div style={{ textAlign:"center",marginBottom:40 }}>
          <div style={{ width:64,height:64,borderRadius:20,background:"linear-gradient(135deg,#8b5cf6,#6366f1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:30,margin:"0 auto 16px",boxShadow:"0 8px 32px rgba(139,92,246,0.4)" }}>🃏</div>
          <div style={{ fontSize:26,fontWeight:700,letterSpacing:-0.5,marginBottom:6 }}>Card Vault</div>
          <div style={{ fontSize:14,color:"#6b7280" }}>{subtitle}</div>
        </div>
        <div style={{ background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:24,padding:"32px" }}>
          {mode!=="forgot" ? (
            <div style={{ display:"flex",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:12,padding:4,gap:4,marginBottom:28 }}>
              {[["login","Sign In"],["signup","Sign Up"]].map(([m,lbl])=>(
                <button key={m} type="button" onClick={()=>{setMode(m);setError("");setSuccess("");}} style={{ flex:1,background:mode===m?"rgba(139,92,246,0.25)":"transparent",color:mode===m?"#c4b5fd":"#6b7280",border:mode===m?"1px solid rgba(139,92,246,0.4)":"1px solid transparent",borderRadius:9,padding:"9px",fontFamily:"inherit",fontSize:13,fontWeight:600,cursor:"pointer" }}>{lbl}</button>
              ))}
            </div>
          ) : (
            <button type="button" onClick={()=>{setMode("login");setError("");setSuccess("");}} style={{ background:"none",border:"none",color:"#8b5cf6",fontFamily:"inherit",fontSize:13,cursor:"pointer",marginBottom:20,padding:0,display:"flex",alignItems:"center",gap:6 }}>← Back to Sign In</button>
          )}
          <form onSubmit={handleSubmit}>
            {mode==="signup"&&<input className="input-field" value={name} onChange={e=>setName(e.target.value)} placeholder="Display name" style={inp} required/>}
            <input className="input-field" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email address" style={mode==="forgot"?{...inp,marginBottom:20}:inp} required/>
            {mode!=="forgot"&&<input className="input-field" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" style={{ ...inp,marginBottom:20 }} required minLength={6}/>}
            {error&&<div style={{ background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.25)",borderRadius:10,padding:"10px 14px",fontSize:13,color:"#f87171",marginBottom:16 }}>{error}</div>}
            {success&&<div style={{ background:"rgba(16,185,129,0.1)",border:"1px solid rgba(16,185,129,0.25)",borderRadius:10,padding:"10px 14px",fontSize:13,color:"#10b981",marginBottom:16 }}>{success}</div>}
            <button type="submit" className="btn-primary" disabled={loading} style={{ width:"100%",background:"linear-gradient(135deg,#8b5cf6,#7c3aed)",color:"#fff",border:"none",borderRadius:12,padding:"14px",fontFamily:"inherit",fontSize:15,fontWeight:700,cursor:loading?"not-allowed":"pointer",opacity:loading?0.7:1,boxShadow:"0 4px 20px rgba(139,92,246,0.35)" }}>
              {loading?<span className="spin">⟳</span>:mode==="login"?"Sign In →":mode==="signup"?"Create Account →":"Send Reset Link →"}
            </button>
            {mode==="login"&&<button type="button" onClick={()=>{setMode("forgot");setError("");setSuccess("");}} style={{ display:"block",width:"100%",background:"none",border:"none",color:"#6b7280",fontFamily:"inherit",fontSize:13,cursor:"pointer",marginTop:14,padding:0 }}>Forgot your password?</button>}
          </form>
        </div>
        <div style={{ textAlign:"center",marginTop:20,fontSize:12,color:"#4b5563" }}>Your collection is private and secure</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  BOTTOM NAV
// ─────────────────────────────────────────────
const NAV_ITEMS = [
  { id:"dashboard",   label:"Dashboard", icon:"⊞" },
  { id:"collection",  label:"Collection",icon:"🗂" },
  { id:"prices",      label:"Prices",    icon:"📊" },
  { id:"marketplace", label:"Market",    icon:"🏪" },
  { id:"profile",     label:"Profile",   icon:"👤" },
];

function BottomNav({ page, setPage }) {
  return (
    <div style={{ position:"fixed",bottom:0,left:0,right:0,zIndex:50,background:"rgba(13,13,18,0.95)",backdropFilter:"blur(20px)",borderTop:"1px solid rgba(255,255,255,0.08)",display:"flex",alignItems:"stretch",boxShadow:"0 -8px 40px rgba(0,0,0,0.5)" }}>
      {NAV_ITEMS.map(item=>{
        const active=page===item.id;
        return (
          <button key={item.id} onClick={()=>setPage(item.id)} style={{ flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,padding:"10px 4px 12px",background:"none",border:"none",cursor:"pointer",position:"relative",fontFamily:"inherit" }}>
            {active&&<div style={{ position:"absolute",top:0,left:"50%",transform:"translateX(-50%)",width:32,height:3,borderRadius:"0 0 3px 3px",background:"linear-gradient(90deg,#8b5cf6,#6366f1)",boxShadow:"0 2px 8px rgba(139,92,246,0.6)" }}/>}
            <div style={{ width:36,height:36,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",background:active?"rgba(139,92,246,0.2)":item.id==="dashboard"?"rgba(139,92,246,0.1)":"transparent",border:active?"1px solid rgba(139,92,246,0.3)":item.id==="dashboard"?"1px solid rgba(139,92,246,0.25)":"1px solid transparent",fontSize:18,transition:"all 0.2s",transform:active?"scale(1.05)":"scale(1)",position:"relative" }}>
              {item.icon}
              {item.id==="marketplace"&&<span style={{ position:"absolute",top:-3,right:-3,width:8,height:8,borderRadius:"50%",background:"#f59e0b",border:"2px solid #0d0d12" }}/>}
            </div>
            <span style={{ fontSize:10,fontWeight:active?700:500,color:active?"#c4b5fd":item.id==="dashboard"?"#a78bfa":"#4b5563" }}>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────
//  DASHBOARD
// ─────────────────────────────────────────────
function Dashboard({ cards, liveData, setPage, profile }) {
  const getVal = c=>liveData[c.id]?.value??c.value;
  const totalValue = cards.reduce((s,c)=>s+getVal(c),0);
  const totalCost  = cards.reduce((s,c)=>s+(c.purchase_price||0),0);
  const gain       = totalValue-totalCost;
  const gainPct    = totalCost>0?((gain/totalCost)*100).toFixed(1):0;
  const sportsVal  = cards.filter(c=>c.category==="sports").reduce((s,c)=>s+getVal(c),0);
  const tcgVal     = cards.filter(c=>c.category==="tcg").reduce((s,c)=>s+getVal(c),0);
  const topCard    = [...cards].sort((a,b)=>getVal(b)-getVal(a))[0];
  const pos        = gain>=0;

  return (
    <div className="slide-in">
      <div style={{ marginBottom:28 }}>
        <h1 style={{ fontSize:26,fontWeight:700,letterSpacing:-0.5,marginBottom:4 }}>{profile?.name?`Hey, ${profile.name.split(" ")[0]} 👋`:"Dashboard"}</h1>
        <p style={{ fontSize:14,color:"#6b7280" }}>Here's your collection overview.</p>
      </div>
      <div style={{ background:"linear-gradient(135deg,rgba(139,92,246,0.15),rgba(99,102,241,0.1),rgba(6,182,212,0.08))",border:"1px solid rgba(139,92,246,0.25)",borderRadius:20,padding:"32px 36px",marginBottom:20,position:"relative",overflow:"hidden" }}>
        <div style={{ position:"absolute",top:-60,right:-60,width:200,height:200,borderRadius:"50%",background:"radial-gradient(circle,rgba(139,92,246,0.15) 0%,transparent 70%)" }}/>
        <div style={{ fontSize:13,color:"#a78bfa",fontWeight:600,marginBottom:8 }}>TOTAL COLLECTION VALUE</div>
        <div style={{ fontSize:52,fontWeight:700,letterSpacing:-2,marginBottom:12 }}>${Math.round(totalValue).toLocaleString()}</div>
        <div style={{ display:"flex",alignItems:"center",gap:16,flexWrap:"wrap" }}>
          <span style={{ fontSize:13,color:pos?"#10b981":"#ef4444",fontWeight:600 }}>{pos?"▲":"▼"} ${Math.abs(Math.round(gain)).toLocaleString()} ({pos?"+":""}{gainPct}%)</span>
          <span style={{ fontSize:12,color:"#6b7280" }}>vs. purchase price</span>
          <MiniSparkline positive={pos}/>
        </div>
      </div>
      <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(155px,1fr))",gap:12,marginBottom:20 }}>
        {[["Total Cards",cards.length,"in vault"],["Sports",cards.filter(c=>c.category==="sports").length,`$${Math.round(sportsVal).toLocaleString()}`],["TCG",cards.filter(c=>c.category==="tcg").length,`$${Math.round(tcgVal).toLocaleString()}`],["Favorites",cards.filter(c=>c.favorite).length,"starred"],["Graded",cards.filter(c=>c.cert_number).length,"certified"],["With Photos",cards.filter(c=>c.image_url||liveData[c.id]?.cardImage).length,"have images"]].map(([lbl,val,sub])=>(
          <div key={lbl} className="stat-card" style={{ background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:16,padding:"18px 20px" }}>
            <div style={{ fontSize:11,color:"#6b7280",fontWeight:500,marginBottom:6 }}>{lbl}</div>
            <div style={{ fontSize:28,fontWeight:700,letterSpacing:-0.5,marginBottom:2 }}>{val}</div>
            <div style={{ fontSize:11,color:"#4b5563" }}>{sub}</div>
          </div>
        ))}
      </div>
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16 }}>
        <div style={{ background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:18,padding:"22px" }}>
          <div style={{ fontSize:12,color:"#6b7280",fontWeight:600,marginBottom:16 }}>👑 TOP CARD</div>
          {topCard?(
            <div style={{ display:"flex",gap:14,alignItems:"center" }}>
              <div style={{ width:56,height:76,borderRadius:8,overflow:"hidden",flexShrink:0,background:"#0a0a10" }}>
                {topCard.image_url||liveData[topCard.id]?.cardImage
                  ?<img src={topCard.image_url||liveData[topCard.id]?.cardImage} alt={topCard.name} style={{ width:"100%",height:"100%",objectFit:"cover" }}/>
                  :<div style={{ width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20 }}>{topCard.category==="sports"?sportEmoji[topCard.sport]:gameEmoji[topCard.game]}</div>}
              </div>
              <div>
                <div style={{ fontSize:16,fontWeight:700,marginBottom:3 }}>{topCard.name}</div>
                <div style={{ fontSize:11,color:"#6b7280",fontFamily:"'DM Mono',monospace",marginBottom:8 }}>{topCard.year} · {topCard.set_name}</div>
                <div style={{ fontSize:24,fontWeight:700,color:"#a78bfa" }}>${getVal(topCard).toLocaleString()}</div>
              </div>
            </div>
          ):<div style={{ fontSize:13,color:"#4b5563",textAlign:"center",padding:"20px 0" }}>Add cards to see your top card</div>}
        </div>
        <div style={{ background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:18,padding:"22px" }}>
          <div style={{ fontSize:12,color:"#6b7280",fontWeight:600,marginBottom:16 }}>📊 BREAKDOWN</div>
          {[["Sports",sportsVal,"#f97316"],["TCG",tcgVal,"#8b5cf6"]].map(([lbl,val,color])=>{
            const pct=totalValue>0?Math.round((val/totalValue)*100):0;
            return (
              <div key={lbl} style={{ marginBottom:14 }}>
                <div style={{ display:"flex",justifyContent:"space-between",marginBottom:6 }}>
                  <span style={{ fontSize:13,color:"#9ca3af" }}>{lbl}</span>
                  <span style={{ fontSize:13,fontWeight:600 }}>{pct}% · ${Math.round(val).toLocaleString()}</span>
                </div>
                <div style={{ height:6,background:"rgba(255,255,255,0.06)",borderRadius:3,overflow:"hidden" }}>
                  <div style={{ height:"100%",width:`${pct}%`,background:color,borderRadius:3 }}/>
                </div>
              </div>
            );
          })}
          <div style={{ borderTop:"1px solid rgba(255,255,255,0.06)",paddingTop:14,marginTop:4 }}>
            <div style={{ display:"flex",justifyContent:"space-between",marginBottom:4 }}>
              <span style={{ fontSize:12,color:"#6b7280" }}>Invested</span>
              <span style={{ fontSize:13,fontWeight:600 }}>${totalCost.toLocaleString()}</span>
            </div>
            <div style={{ display:"flex",justifyContent:"space-between" }}>
              <span style={{ fontSize:12,color:"#6b7280" }}>Gain/Loss</span>
              <span style={{ fontSize:13,fontWeight:600,color:pos?"#10b981":"#ef4444" }}>{pos?"+":"-"}${Math.abs(Math.round(gain)).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
      <div style={{ display:"flex",gap:12,flexWrap:"wrap" }}>
        {[["🗂 Collection","collection","#8b5cf6"],["📊 Prices","prices","#06b6d4"],["👤 Profile","profile","#10b981"]].map(([lbl,pg,color])=>(
          <button key={pg} className="btn-ghost" onClick={()=>setPage(pg)} style={{ flex:1,minWidth:130,background:`${color}12`,border:`1px solid ${color}30`,borderRadius:12,padding:"14px",fontFamily:"inherit",fontSize:13,fontWeight:600,color,cursor:"pointer" }}>{lbl}</button>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  COLLECTION
// ─────────────────────────────────────────────
function Collection({ cards, setCards, liveData, fetchAndStore, userId }) {
  const [search, setSearch]     = useState("");
  const [filter, setFilter]     = useState("all");
  const [sortBy, setSortBy]     = useState("value");
  const [showAdd, setShowAdd]   = useState(false);
  const [selected, setSelected] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const [saving, setSaving]     = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [addForm, setAddForm]   = useState({ name:"",year:"",set_name:"",number:"",condition:"Raw NM",category:"sports",sport:"Baseball",game:"Pokémon",value:"",foil:false,image_url:null,cert_number:"",cert_grader:"PSA",purchase_price:"" });

  const IS = { width:"100%",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,color:"#f9fafb",padding:"11px 14px",fontFamily:"inherit",fontSize:14,outline:"none" };
  const LS = { fontSize:12,color:"#6b7280",fontWeight:500,display:"block",marginBottom:6 };

  const getVal = c=>liveData[c.id]?.value??c.value;
  const getImg = (c,large=false)=>{ if(c.image_url)return c.image_url; const ld=liveData[c.id]; if(ld&&!ld.loading&&!ld.error)return large?(ld.cardImageLarge||ld.cardImage):ld.cardImage; return null; };

  const filtered = cards
    .filter(c=>filter==="all"||c.category===filter)
    .filter(c=>{ const q=search.toLowerCase(); return !q||c.name.toLowerCase().includes(q)||(c.set_name||"").toLowerCase().includes(q)||(c.sport||c.game||"").toLowerCase().includes(q); })
    .sort((a,b)=>{ if(sortBy==="value")return getVal(b)-getVal(a); if(sortBy==="name")return a.name.localeCompare(b.name); return (b.year||0)-(a.year||0); });

  async function handleAdd(e) {
    e.preventDefault(); setSaving(true);
    let imageUrl = null;
    if (addForm.image_url?.startsWith("data:")) {
      try {
        const base64=addForm.image_url.split(",")[1];
        const byteStr=atob(base64);
        const bytes=new Uint8Array(byteStr.length);
        for(let i=0;i<byteStr.length;i++) bytes[i]=byteStr.charCodeAt(i);
        const ext=addForm.image_url.includes("png")?"png":"jpg";
        const filename=`${userId}/${Date.now()}.${ext}`;
        const { error:upErr } = await sb.storage.from("card-images").upload(filename,bytes.buffer,{ contentType:`image/${ext}` });
        if(!upErr){ const { data:{ publicUrl } }=sb.storage.from("card-images").getPublicUrl(filename); imageUrl=publicUrl; }
      } catch(err){ console.error("Upload failed",err); }
    }
    const row = { user_id:userId,name:addForm.name,year:addForm.year,set_name:addForm.set_name,number:addForm.number,condition:addForm.condition,category:addForm.category,sport:addForm.category==="sports"?addForm.sport:null,game:addForm.category==="tcg"?addForm.game:null,value:parseFloat(addForm.value)||0,purchase_price:parseFloat(addForm.purchase_price)||0,foil:addForm.foil,favorite:false,cert_number:addForm.cert_number,cert_grader:addForm.cert_grader,image_url:imageUrl };
    const { data,error } = await sb.from("cards").insert(row).select().single();
    if(!error&&data){
      let finalCard=data;
      if(!parseFloat(addForm.value)){
        const price=await fetchEbayPrice(data);
        if(price>0){
          await sb.from("cards").update({ value:price }).eq("id",data.id);
          finalCard={ ...data, value:price };
        }
      }
      setCards(prev=>[finalCard,...prev]);
      if(data.category==="tcg"&&(data.game==="Pokémon"||data.game==="Magic: The Gathering"))fetchAndStore(finalCard);
    }
    setSaving(false); setShowAdd(false);
    setAddForm({ name:"",year:"",set_name:"",number:"",condition:"Raw NM",category:"sports",sport:"Baseball",game:"Pokémon",value:"",foil:false,image_url:null,cert_number:"",cert_grader:"PSA",purchase_price:"" });
  }

  async function toggleFav(card) {
    const { data }=await sb.from("cards").update({ favorite:!card.favorite }).eq("id",card.id).select().single();
    if(data){ setCards(prev=>prev.map(c=>c.id===card.id?data:c)); if(selected?.id===card.id)setSelected(data); }
  }

  async function deleteCard(id) {
    await sb.from("cards").delete().eq("id",id);
    setCards(prev=>prev.filter(c=>c.id!==id)); setSelected(null);
  }

  function openEdit(card) {
    setEditForm({ name:card.name||"",year:card.year||"",set_name:card.set_name||"",number:card.number||"",condition:card.condition||"Raw NM",category:card.category||"sports",sport:card.sport||"Baseball",game:card.game||"Pokémon",value:card.value?String(card.value):"",purchase_price:card.purchase_price?String(card.purchase_price):"",foil:card.foil||false,cert_number:card.cert_number||"",cert_grader:card.cert_grader||"PSA",image_url:card.image_url||null });
    setShowEdit(true);
  }

  async function handleEdit(e) {
    e.preventDefault(); setSaving(true);
    let imageUrl = editForm.image_url?.startsWith("http") ? editForm.image_url : null;
    if (editForm.image_url?.startsWith("data:")) {
      try {
        const base64=editForm.image_url.split(",")[1]; const byteStr=atob(base64); const bytes=new Uint8Array(byteStr.length);
        for(let i=0;i<byteStr.length;i++) bytes[i]=byteStr.charCodeAt(i);
        const ext=editForm.image_url.includes("png")?"png":"jpg"; const filename=`${userId}/${Date.now()}.${ext}`;
        const { error:upErr }=await sb.storage.from("card-images").upload(filename,bytes.buffer,{ contentType:`image/${ext}` });
        if(!upErr){ const { data:{ publicUrl } }=sb.storage.from("card-images").getPublicUrl(filename); imageUrl=publicUrl; }
      } catch(err){ console.error("Upload failed",err); }
    }
    const updates = { name:editForm.name,year:editForm.year,set_name:editForm.set_name,number:editForm.number,condition:editForm.condition,category:editForm.category,sport:editForm.category==="sports"?editForm.sport:null,game:editForm.category==="tcg"?editForm.game:null,value:parseFloat(editForm.value)||0,purchase_price:parseFloat(editForm.purchase_price)||0,foil:editForm.foil,cert_number:editForm.cert_number,cert_grader:editForm.cert_grader,image_url:imageUrl };
    const { data,error }=await sb.from("cards").update(updates).eq("id",selected.id).select().single();
    if(!error&&data){
      let finalCard=data;
      if(!parseFloat(editForm.value)){
        const price=await fetchEbayPrice(data);
        if(price>0){ await sb.from("cards").update({ value:price }).eq("id",data.id); finalCard={ ...data,value:price }; }
      }
      setCards(prev=>prev.map(c=>c.id===selected.id?finalCard:c));
      setSelected(finalCard);
      if(finalCard.category==="tcg"&&(finalCard.game==="Pokémon"||finalCard.game==="Magic: The Gathering"))fetchAndStore(finalCard);
    }
    setSaving(false); setShowEdit(false);
  }

  return (
    <div className="slide-in">
      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:24 }}>
        <div>
          <h1 style={{ fontSize:26,fontWeight:700,letterSpacing:-0.5,marginBottom:4 }}>Collection</h1>
          <p style={{ fontSize:14,color:"#6b7280" }}>{cards.length} cards · ${Math.round(cards.reduce((s,c)=>s+getVal(c),0)).toLocaleString()}</p>
        </div>
        <button className="btn-primary" onClick={()=>setShowAdd(true)} style={{ background:"linear-gradient(135deg,#8b5cf6,#7c3aed)",color:"#fff",border:"none",borderRadius:12,padding:"11px 22px",fontFamily:"inherit",fontSize:14,fontWeight:600,cursor:"pointer",boxShadow:"0 4px 15px rgba(139,92,246,0.3)" }}>+ Add Card</button>
      </div>

      <div style={{ display:"flex",gap:12,marginBottom:24,flexWrap:"wrap",alignItems:"center" }}>
        <div style={{ flex:1,minWidth:200,position:"relative" }}>
          <svg style={{ position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",width:15,height:15,color:"#6b7280" }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input className="input-field" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search cards…" style={{ ...IS,paddingLeft:40 }}/>
        </div>
        <div style={{ display:"flex",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:10,padding:4,gap:2 }}>
          {[["all","All"],["sports","🏆 Sports"],["tcg","🃏 TCG"]].map(([val,lbl])=>(
            <button key={val} onClick={()=>setFilter(val)} style={{ background:filter===val?"rgba(139,92,246,0.25)":"transparent",color:filter===val?"#c4b5fd":"#9ca3af",border:filter===val?"1px solid rgba(139,92,246,0.4)":"1px solid transparent",borderRadius:7,padding:"7px 14px",fontFamily:"inherit",fontSize:13,fontWeight:filter===val?600:400,cursor:"pointer" }}>{lbl}</button>
          ))}
        </div>
        <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{ ...IS,width:"auto",padding:"10px 14px",cursor:"pointer",color:"#9ca3af",fontSize:13 }}>
          <option value="value">Value ↓</option><option value="name">Name A→Z</option><option value="year">Year ↓</option>
        </select>
      </div>

      {filtered.length===0&&(
        <div style={{ textAlign:"center",padding:"80px 0",color:"#4b5563" }}>
          <div style={{ fontSize:48,marginBottom:16 }}>🃏</div>
          <div style={{ fontSize:16,fontWeight:600,color:"#6b7280",marginBottom:8 }}>{search?"No cards match your search":"Your vault is empty"}</div>
          <div style={{ fontSize:13 }}>{search?"Try a different search":"Tap + Add Card to get started"}</div>
        </div>
      )}

      <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:16,paddingBottom:40 }}>
        {filtered.map((card,i)=>{
          const ld=liveData[card.id]; const img=getImg(card); const isLive=ld?.source&&!ld.loading&&!ld.error; const badge=conditionBadge[card.condition]||conditionBadge["Raw NM"];
          return (
            <div key={card.id} className="card-item fade-up" onClick={()=>setSelected(card)} style={{ background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:18,cursor:"pointer",overflow:"hidden",animationDelay:`${i*0.04}s` }}>
              <div style={{ height:190,position:"relative",overflow:"hidden",background:"#111118" }}>
                {card.foil&&<div className="foil-bar" style={{ position:"absolute",top:0,left:0,right:0,height:3,zIndex:3 }}/>}
                {img?<img src={img} alt={card.name} className="card-img" style={{ width:"100%",height:"100%",objectFit:"cover" }}/>:ld?.loading?<div className="shimmer" style={{ width:"100%",height:"100%" }}/>:<CardPlaceholder card={card}/>}
                <div style={{ position:"absolute",top:10,left:10,right:10,display:"flex",justifyContent:"space-between",zIndex:4,pointerEvents:"none" }}>
                  {isLive?<span style={{ display:"flex",alignItems:"center",gap:4,fontSize:10,fontWeight:600,color:"#10b981",background:"rgba(13,13,18,0.75)",backdropFilter:"blur(6px)",border:"1px solid rgba(16,185,129,0.25)",borderRadius:20,padding:"3px 8px" }}><span style={{ width:5,height:5,borderRadius:"50%",background:"#10b981",boxShadow:"0 0 4px #10b981" }}/>LIVE</span>:<span/>}
                  {card.foil&&<span style={{ fontSize:10,fontWeight:600,color:"#c4b5fd",background:"rgba(13,13,18,0.75)",backdropFilter:"blur(6px)",border:"1px solid rgba(139,92,246,0.3)",borderRadius:20,padding:"3px 8px" }}>✦ Foil</span>}
                </div>
                <button onClick={e=>{e.stopPropagation();toggleFav(card);}} style={{ position:"absolute",bottom:10,right:10,zIndex:4,background:"rgba(13,13,18,0.75)",backdropFilter:"blur(6px)",border:"none",borderRadius:"50%",width:30,height:30,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:14,color:card.favorite?"#f59e0b":"rgba(255,255,255,0.3)" }}>★</button>
              </div>
              <div style={{ padding:"14px 16px" }}>
                <div style={{ fontSize:14,fontWeight:700,marginBottom:3,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>{card.name}</div>
                <div style={{ fontSize:11,color:"#6b7280",fontFamily:"'DM Mono',monospace",marginBottom:10 }}>{card.year} · {card.set_name}</div>
                <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                  <span style={{ fontSize:11,fontWeight:600,color:badge.color,background:badge.bg,border:`1px solid ${badge.border}`,borderRadius:6,padding:"2px 8px" }}>{card.condition}</span>
                  {ld?.loading?<div className="shimmer" style={{ width:55,height:20,borderRadius:6 }}/>:<span style={{ fontSize:17,fontWeight:700,letterSpacing:-0.4 }}>${getVal(card).toLocaleString()}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ADD MODAL */}
      {showAdd&&(
        <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",backdropFilter:"blur(8px)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:24 }} onClick={()=>setShowAdd(false)}>
          <div className="modal-anim" onClick={e=>e.stopPropagation()} style={{ background:"#13131a",border:"1px solid rgba(255,255,255,0.1)",borderRadius:24,padding:"32px",width:"100%",maxWidth:560,maxHeight:"92vh",overflowY:"auto",boxShadow:"0 40px 100px rgba(0,0,0,0.6)" }}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24 }}>
              <h2 style={{ fontSize:20,fontWeight:700,letterSpacing:-0.5 }}>Add Card to Vault</h2>
              <button onClick={()=>setShowAdd(false)} style={{ background:"rgba(255,255,255,0.06)",border:"none",borderRadius:8,color:"#9ca3af",width:32,height:32,cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center" }}>✕</button>
            </div>
            <form onSubmit={handleAdd}>
              <div style={{ marginBottom:18 }}>
                <label style={LS}>Category</label>
                <div style={{ display:"flex",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:12,padding:4,gap:4 }}>
                  {[["sports","🏆 Sports"],["tcg","🃏 TCG"]].map(([val,lbl])=>(
                    <button type="button" key={val} onClick={()=>setAddForm(f=>({...f,category:val}))} style={{ flex:1,background:addForm.category===val?"rgba(139,92,246,0.25)":"transparent",color:addForm.category===val?"#c4b5fd":"#6b7280",border:addForm.category===val?"1px solid rgba(139,92,246,0.4)":"1px solid transparent",borderRadius:9,padding:"9px",fontFamily:"inherit",fontSize:13,fontWeight:600,cursor:"pointer" }}>{lbl}</button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom:18 }}>
                <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6 }}>
                  <label style={LS}>Card Photo</label>
                  <span style={{ fontSize:10,fontWeight:600,color:"#8b5cf6",background:"rgba(139,92,246,0.1)",border:"1px solid rgba(139,92,246,0.2)",borderRadius:20,padding:"2px 8px" }}>☁ Saves to Cloud</span>
                </div>
                {!addForm.image_url?(
                  <label className="upload-zone" style={{ background:"rgba(139,92,246,0.03)",padding:"22px",textAlign:"center",display:"block" }}>
                    <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>{ const f=e.target.files[0]; if(!f)return; const r=new FileReader(); r.onload=ev=>setAddForm(p=>({...p,image_url:ev.target.result})); r.readAsDataURL(f); }}/>
                    <div style={{ fontSize:28,marginBottom:8 }}>📷</div>
                    <div style={{ fontSize:13,color:"#c4b5fd",fontWeight:600,marginBottom:3 }}>Upload card photo</div>
                    <div style={{ fontSize:11,color:"#6b7280" }}>Click to browse or drag & drop</div>
                  </label>
                ):(
                  <div style={{ display:"flex",gap:12,alignItems:"center",padding:"12px",background:"rgba(16,185,129,0.06)",border:"1px solid rgba(16,185,129,0.2)",borderRadius:12 }}>
                    <img src={addForm.image_url} alt="preview" style={{ width:56,height:76,objectFit:"cover",borderRadius:8,flexShrink:0 }}/>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13,fontWeight:600,color:"#10b981",marginBottom:3 }}>✓ Photo ready</div>
                      <div style={{ fontSize:11,color:"#6b7280" }}>Will upload when you save</div>
                    </div>
                    <button type="button" onClick={()=>setAddForm(f=>({...f,image_url:null}))} style={{ background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.2)",borderRadius:8,color:"#f87171",width:32,height:32,cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>✕</button>
                  </div>
                )}
              </div>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14 }}>
                <div style={{gridColumn:"1/-1"}}><label style={LS}>Card Name *</label><input required className="input-field" value={addForm.name} onChange={e=>setAddForm(f=>({...f,name:e.target.value}))} placeholder={addForm.category==="sports"?"Player name…":"Card name…"} style={IS}/></div>
                <div><label style={LS}>Year</label><input className="input-field" value={addForm.year} onChange={e=>setAddForm(f=>({...f,year:e.target.value}))} placeholder="2024" style={IS}/></div>
                <div><label style={LS}>Card #</label><input className="input-field" value={addForm.number} onChange={e=>setAddForm(f=>({...f,number:e.target.value}))} placeholder="57" style={IS}/></div>
                <div style={{gridColumn:"1/-1"}}><label style={LS}>Set / Series</label><input className="input-field" value={addForm.set_name} onChange={e=>setAddForm(f=>({...f,set_name:e.target.value}))} placeholder="e.g. Topps Chrome, Base Set…" style={IS}/></div>
                {addForm.category==="sports"
                  ?<div><label style={LS}>Sport</label><select className="input-field" value={addForm.sport} onChange={e=>setAddForm(f=>({...f,sport:e.target.value}))} style={IS}>{sports.map(s=><option key={s}>{s}</option>)}</select></div>
                  :<div><label style={LS}>Game</label><select className="input-field" value={addForm.game} onChange={e=>setAddForm(f=>({...f,game:e.target.value}))} style={IS}>{tcgGames.map(g=><option key={g}>{g}</option>)}</select></div>}
                <div><label style={LS}>Condition</label><select className="input-field" value={addForm.condition} onChange={e=>setAddForm(f=>({...f,condition:e.target.value}))} style={IS}>{conditions.map(c=><option key={c}>{c}</option>)}</select></div>
                <div><label style={LS}>Cert Grader</label><select className="input-field" value={addForm.cert_grader} onChange={e=>setAddForm(f=>({...f,cert_grader:e.target.value}))} style={IS}>{graders.map(g=><option key={g}>{g}</option>)}</select></div>
                <div><label style={LS}>Cert Number</label><input className="input-field" value={addForm.cert_number} onChange={e=>setAddForm(f=>({...f,cert_number:e.target.value}))} placeholder="Optional" style={IS}/></div>
                <div><label style={LS}>Purchase Price ($)</label><input className="input-field" type="number" min="0" step="0.01" value={addForm.purchase_price} onChange={e=>setAddForm(f=>({...f,purchase_price:e.target.value}))} placeholder="0.00" style={IS}/></div>
                <div><label style={LS}>Value ($) — leave blank to auto-fetch</label><input className="input-field" type="number" min="0" step="0.01" value={addForm.value} onChange={e=>setAddForm(f=>({...f,value:e.target.value}))} placeholder="Auto from eBay…" style={IS}/></div>
              </div>
              <label style={{ display:"flex",alignItems:"center",gap:10,marginBottom:24,cursor:"pointer" }}>
                <div style={{ width:18,height:18,borderRadius:5,flexShrink:0,background:addForm.foil?"linear-gradient(135deg,#8b5cf6,#6366f1)":"rgba(255,255,255,0.06)",border:`1px solid ${addForm.foil?"#8b5cf6":"rgba(255,255,255,0.15)"}`,display:"flex",alignItems:"center",justifyContent:"center" }} onClick={()=>setAddForm(f=>({...f,foil:!f.foil}))}>
                  {addForm.foil&&<span style={{color:"#fff",fontSize:11}}>✓</span>}
                </div>
                <span style={{fontSize:13,color:"#9ca3af"}}>Foil / Holographic</span>
              </label>
              <div style={{display:"flex",gap:10}}>
                <button type="submit" disabled={saving} style={{ flex:1,background:"linear-gradient(135deg,#8b5cf6,#7c3aed)",color:"#fff",border:"none",borderRadius:12,padding:"13px",fontFamily:"inherit",fontSize:14,fontWeight:600,cursor:saving?"not-allowed":"pointer",opacity:saving?0.7:1 }}>{saving?<><span className="spin">⟳</span> Saving…</>:"Add to Vault"}</button>
                <button type="button" onClick={()=>setShowAdd(false)} style={{ background:"rgba(255,255,255,0.05)",color:"#9ca3af",border:"1px solid rgba(255,255,255,0.08)",borderRadius:12,padding:"13px 20px",fontFamily:"inherit",fontSize:14,cursor:"pointer" }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DETAIL MODAL */}
      {selected&&(()=>{
        const ld=liveData[selected.id]; const img=getImg(selected); const imgLg=getImg(selected,true);
        const isLive=ld?.source&&!ld.loading&&!ld.error; const badge=conditionBadge[selected.condition]||conditionBadge["Raw NM"];
        const gain=getVal(selected)-(selected.purchase_price||0);
        const verifyUrl=selected.cert_number&&selected.cert_grader&&graderVerifyUrl[selected.cert_grader]?graderVerifyUrl[selected.cert_grader](selected.cert_number):null;
        return (
          <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",backdropFilter:"blur(8px)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:24 }} onClick={()=>setSelected(null)}>
            <div className="modal-anim" onClick={e=>e.stopPropagation()} style={{ background:"#13131a",border:"1px solid rgba(255,255,255,0.1)",borderRadius:24,width:"100%",maxWidth:500,maxHeight:"92vh",overflowY:"auto",boxShadow:"0 40px 100px rgba(0,0,0,0.6)",position:"relative",overflow:"hidden" }}>
              {selected.foil&&<div className="foil-bar" style={{ position:"absolute",top:0,left:0,right:0,height:3,zIndex:5 }}/>}
              <div style={{ height:240,position:"relative",background:"#0a0a10",overflow:"hidden" }}>
                {img?<><div style={{ position:"absolute",inset:0,backgroundImage:`url(${img})`,backgroundSize:"cover",backgroundPosition:"center",filter:"blur(20px) brightness(0.3)",transform:"scale(1.1)" }}/><img src={imgLg||img} alt={selected.name} onClick={()=>setLightbox(imgLg||img)} style={{ position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",maxHeight:"90%",maxWidth:"55%",objectFit:"contain",borderRadius:10,boxShadow:"0 8px 40px rgba(0,0,0,0.6)",cursor:"zoom-in" }}/></>:<CardPlaceholder card={selected}/>}
                <button onClick={()=>setSelected(null)} style={{ position:"absolute",top:12,right:12,zIndex:6,background:"rgba(13,13,18,0.75)",backdropFilter:"blur(6px)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:8,color:"#9ca3af",width:32,height:32,cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center" }}>✕</button>
              </div>
              <div style={{ padding:"22px 26px 26px" }}>
                <div style={{ display:"flex",gap:6,flexWrap:"wrap",marginBottom:10 }}>
                  <Tag>{selected.category==="sports"?selected.sport:selected.game}</Tag>
                  {isLive&&<Tag color="#10b981" bg="rgba(16,185,129,0.1)" border="rgba(16,185,129,0.25)">● Live</Tag>}
                  {selected.foil&&<Tag color="#c4b5fd" bg="rgba(139,92,246,0.1)" border="rgba(139,92,246,0.25)">✦ Foil</Tag>}
                </div>
                <h2 style={{ fontSize:22,fontWeight:700,letterSpacing:-0.5,marginBottom:4 }}>{selected.name}</h2>
                <div style={{ fontSize:12,color:"#6b7280",fontFamily:"'DM Mono',monospace",marginBottom:18 }}>{selected.year} · {selected.set_name} · #{selected.number}</div>
                <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16 }}>
                  {[["Market Value",<span style={{fontSize:24,fontWeight:700,letterSpacing:-0.5}}>${getVal(selected).toLocaleString()}</span>],["Condition",<span style={{fontSize:13,fontWeight:600,color:badge.color}}>{selected.condition}</span>],["Purchased For",<span style={{fontSize:14,fontWeight:600}}>${(selected.purchase_price||0).toLocaleString()}</span>],["Gain/Loss",<span style={{fontSize:14,fontWeight:600,color:gain>=0?"#10b981":"#ef4444"}}>{gain>=0?"+":"-"}${Math.abs(Math.round(gain)).toLocaleString()}</span>]].map(([lbl,val])=>(
                    <div key={lbl} style={{ background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:10,padding:"12px 14px" }}>
                      <div style={{ fontSize:10,color:"#4b5563",fontWeight:500,marginBottom:5,textTransform:"uppercase",letterSpacing:0.5 }}>{lbl}</div>{val}
                    </div>
                  ))}
                </div>
                {selected.cert_number&&(
                  <div style={{ background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:10,padding:"12px 14px",marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                    <div><div style={{ fontSize:10,color:"#4b5563",fontWeight:500,letterSpacing:0.5,marginBottom:3 }}>CERT NUMBER</div><div style={{ fontSize:13,fontWeight:600 }}>{selected.cert_grader} #{selected.cert_number}</div></div>
                    {verifyUrl&&<a href={verifyUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize:12,color:"#818cf8",background:"rgba(99,102,241,0.1)",border:"1px solid rgba(99,102,241,0.2)",borderRadius:8,padding:"6px 12px",textDecoration:"none",fontWeight:600 }}>Verify ↗</a>}
                  </div>
                )}
                <div style={{ display:"flex",gap:10 }}>
                  <button onClick={()=>toggleFav(selected)} className="btn-ghost" style={{ flex:1,background:"rgba(255,255,255,0.05)",color:selected.favorite?"#f59e0b":"#9ca3af",border:"1px solid rgba(255,255,255,0.08)",borderRadius:12,padding:"11px",fontFamily:"inherit",fontSize:13,fontWeight:600,cursor:"pointer" }}>{selected.favorite?"★ Unfavorite":"☆ Favorite"}</button>
                  <button onClick={()=>openEdit(selected)} className="btn-ghost" style={{ background:"rgba(139,92,246,0.1)",color:"#c4b5fd",border:"1px solid rgba(139,92,246,0.25)",borderRadius:12,padding:"11px 14px",fontFamily:"inherit",fontSize:13,fontWeight:600,cursor:"pointer" }}>✏️ Edit</button>
                  <button onClick={()=>fetchAndStore(selected)} className="btn-ghost" style={{ background:"rgba(99,102,241,0.1)",color:"#818cf8",border:"1px solid rgba(99,102,241,0.2)",borderRadius:12,padding:"11px 14px",fontFamily:"inherit",fontSize:13,cursor:"pointer" }}>{ld?.loading?<span className="spin">⟳</span>:"⟳"}</button>
                  <button onClick={()=>deleteCard(selected.id)} className="btn-ghost" style={{ background:"rgba(239,68,68,0.08)",color:"#f87171",border:"1px solid rgba(239,68,68,0.2)",borderRadius:12,padding:"11px 14px",fontFamily:"inherit",fontSize:13,cursor:"pointer" }}>🗑</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {lightbox&&<div onClick={()=>setLightbox(null)} style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",backdropFilter:"blur(12px)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",cursor:"zoom-out",padding:40 }}>
        <img src={lightbox} alt="Card" style={{ maxWidth:"90vw",maxHeight:"90vh",objectFit:"contain",borderRadius:14 }}/>
      </div>}

      {/* EDIT MODAL */}
      {showEdit&&editForm&&(
        <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",backdropFilter:"blur(8px)",zIndex:150,display:"flex",alignItems:"center",justifyContent:"center",padding:24 }} onClick={()=>setShowEdit(false)}>
          <div className="modal-anim" onClick={e=>e.stopPropagation()} style={{ background:"#13131a",border:"1px solid rgba(255,255,255,0.1)",borderRadius:24,padding:"32px",width:"100%",maxWidth:560,maxHeight:"92vh",overflowY:"auto",boxShadow:"0 40px 100px rgba(0,0,0,0.6)" }}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24 }}>
              <h2 style={{ fontSize:20,fontWeight:700,letterSpacing:-0.5 }}>Edit Card</h2>
              <button onClick={()=>setShowEdit(false)} style={{ background:"rgba(255,255,255,0.06)",border:"none",borderRadius:8,color:"#9ca3af",width:32,height:32,cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center" }}>✕</button>
            </div>
            <form onSubmit={handleEdit}>
              <div style={{ marginBottom:18 }}>
                <label style={LS}>Category</label>
                <div style={{ display:"flex",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:12,padding:4,gap:4 }}>
                  {[["sports","🏆 Sports"],["tcg","🃏 TCG"]].map(([val,lbl])=>(
                    <button type="button" key={val} onClick={()=>setEditForm(f=>({...f,category:val}))} style={{ flex:1,background:editForm.category===val?"rgba(139,92,246,0.25)":"transparent",color:editForm.category===val?"#c4b5fd":"#6b7280",border:editForm.category===val?"1px solid rgba(139,92,246,0.4)":"1px solid transparent",borderRadius:9,padding:"9px",fontFamily:"inherit",fontSize:13,fontWeight:600,cursor:"pointer" }}>{lbl}</button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom:18 }}>
                <label style={LS}>Card Photo</label>
                {!editForm.image_url?(
                  <label className="upload-zone" style={{ background:"rgba(139,92,246,0.03)",padding:"22px",textAlign:"center",display:"block" }}>
                    <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>{ const f=e.target.files[0]; if(!f)return; const r=new FileReader(); r.onload=ev=>setEditForm(p=>({...p,image_url:ev.target.result})); r.readAsDataURL(f); }}/>
                    <div style={{ fontSize:28,marginBottom:8 }}>📷</div>
                    <div style={{ fontSize:13,color:"#c4b5fd",fontWeight:600,marginBottom:3 }}>Upload new photo</div>
                    <div style={{ fontSize:11,color:"#6b7280" }}>Click to browse or drag & drop</div>
                  </label>
                ):(
                  <div style={{ display:"flex",gap:12,alignItems:"center",padding:"12px",background:"rgba(16,185,129,0.06)",border:"1px solid rgba(16,185,129,0.2)",borderRadius:12 }}>
                    <img src={editForm.image_url} alt="preview" style={{ width:56,height:76,objectFit:"cover",borderRadius:8,flexShrink:0 }}/>
                    <div style={{ flex:1 }}><div style={{ fontSize:13,fontWeight:600,color:"#10b981",marginBottom:3 }}>✓ Photo ready</div></div>
                    <button type="button" onClick={()=>setEditForm(f=>({...f,image_url:null}))} style={{ background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.2)",borderRadius:8,color:"#f87171",width:32,height:32,cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>✕</button>
                  </div>
                )}
              </div>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14 }}>
                <div style={{gridColumn:"1/-1"}}><label style={LS}>Card Name *</label><input required className="input-field" value={editForm.name} onChange={e=>setEditForm(f=>({...f,name:e.target.value}))} placeholder="Player / card name…" style={IS}/></div>
                <div><label style={LS}>Year</label><input className="input-field" value={editForm.year} onChange={e=>setEditForm(f=>({...f,year:e.target.value}))} placeholder="2024" style={IS}/></div>
                <div><label style={LS}>Card #</label><input className="input-field" value={editForm.number} onChange={e=>setEditForm(f=>({...f,number:e.target.value}))} placeholder="57" style={IS}/></div>
                <div style={{gridColumn:"1/-1"}}><label style={LS}>Set / Series</label><input className="input-field" value={editForm.set_name} onChange={e=>setEditForm(f=>({...f,set_name:e.target.value}))} placeholder="e.g. Topps Chrome…" style={IS}/></div>
                {editForm.category==="sports"
                  ?<div><label style={LS}>Sport</label><select className="input-field" value={editForm.sport} onChange={e=>setEditForm(f=>({...f,sport:e.target.value}))} style={IS}>{sports.map(s=><option key={s}>{s}</option>)}</select></div>
                  :<div><label style={LS}>Game</label><select className="input-field" value={editForm.game} onChange={e=>setEditForm(f=>({...f,game:e.target.value}))} style={IS}>{tcgGames.map(g=><option key={g}>{g}</option>)}</select></div>}
                <div><label style={LS}>Condition</label><select className="input-field" value={editForm.condition} onChange={e=>setEditForm(f=>({...f,condition:e.target.value}))} style={IS}>{conditions.map(c=><option key={c}>{c}</option>)}</select></div>
                <div><label style={LS}>Cert Grader</label><select className="input-field" value={editForm.cert_grader} onChange={e=>setEditForm(f=>({...f,cert_grader:e.target.value}))} style={IS}>{graders.map(g=><option key={g}>{g}</option>)}</select></div>
                <div><label style={LS}>Cert Number</label><input className="input-field" value={editForm.cert_number} onChange={e=>setEditForm(f=>({...f,cert_number:e.target.value}))} placeholder="Optional" style={IS}/></div>
                <div><label style={LS}>Purchase Price ($)</label><input className="input-field" type="number" min="0" step="0.01" value={editForm.purchase_price} onChange={e=>setEditForm(f=>({...f,purchase_price:e.target.value}))} placeholder="0.00" style={IS}/></div>
                <div><label style={LS}>Value ($) — leave blank to auto-fetch</label><input className="input-field" type="number" min="0" step="0.01" value={editForm.value} onChange={e=>setEditForm(f=>({...f,value:e.target.value}))} placeholder="Auto from eBay…" style={IS}/></div>
              </div>
              <label style={{ display:"flex",alignItems:"center",gap:10,marginBottom:24,cursor:"pointer" }}>
                <div style={{ width:18,height:18,borderRadius:5,flexShrink:0,background:editForm.foil?"linear-gradient(135deg,#8b5cf6,#6366f1)":"rgba(255,255,255,0.06)",border:`1px solid ${editForm.foil?"#8b5cf6":"rgba(255,255,255,0.15)"}`,display:"flex",alignItems:"center",justifyContent:"center" }} onClick={()=>setEditForm(f=>({...f,foil:!f.foil}))}>
                  {editForm.foil&&<span style={{color:"#fff",fontSize:11}}>✓</span>}
                </div>
                <span style={{fontSize:13,color:"#9ca3af"}}>Foil / Holographic</span>
              </label>
              <div style={{display:"flex",gap:10}}>
                <button type="submit" disabled={saving} style={{ flex:1,background:"linear-gradient(135deg,#8b5cf6,#7c3aed)",color:"#fff",border:"none",borderRadius:12,padding:"13px",fontFamily:"inherit",fontSize:14,fontWeight:600,cursor:saving?"not-allowed":"pointer",opacity:saving?0.7:1 }}>{saving?<><span className="spin">⟳</span> Saving…</>:"Save Changes"}</button>
                <button type="button" onClick={()=>setShowEdit(false)} style={{ background:"rgba(255,255,255,0.05)",color:"#9ca3af",border:"1px solid rgba(255,255,255,0.08)",borderRadius:12,padding:"13px 20px",fontFamily:"inherit",fontSize:14,cursor:"pointer" }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
//  PRICE CHECKER
// ─────────────────────────────────────────────
function PriceChecker() {
  const [query,setQuery]=useState("");
  const [results,setResults]=useState([]); const [loading,setLoading]=useState(false); const [searched,setSearched]=useState(false); const [selected,setSelected]=useState(null); const [priceData,setPriceData]=useState(null);
  const IS={ width:"100%",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,color:"#f9fafb",padding:"11px 36px 11px 40px",fontFamily:"inherit",fontSize:14,outline:"none" };

  async function handleSearch(e) {
    e.preventDefault(); if(!query.trim())return;
    setLoading(true); setSearched(true); setResults([]); setSelected(null); setPriceData(null);
    const [ebayItems, pokemonResult, scryfallResult] = await Promise.all([
      searchCardPrice(query),
      (async()=>{ try {
        const q=encodeURIComponent(`name:"${query}"`);
        const res=await fetch(`https://api.pokemontcg.io/v2/cards?q=${q}&pageSize=1`);
        const data=await res.json(); const card=data.data?.[0]; if(!card)return null;
        const prices=card.tcgplayer?.prices;
        const market=prices?.holoRare?.market||prices?.normal?.market||prices?.["1stEditionHolofoil"]?.market||prices?.reverseHolofoil?.market||Object.values(prices||{})[0]?.market;
        return market?{ value:market,name:card.name,set:card.set?.name,image:card.images?.small }:null;
      } catch { return null; } })(),
      (async()=>{ try {
        const q=encodeURIComponent(query);
        const res=await fetch(`https://api.scryfall.com/cards/search?q=${q}&order=usd&limit=1`);
        const data=await res.json(); const card=data.data?.[0]; if(!card)return null;
        const value=parseFloat(card.prices?.usd||card.prices?.usd_foil||0);
        return value?{ value,name:card.name,set:card.set_name,image:card.image_uris?.small||card.card_faces?.[0]?.image_uris?.small }:null;
      } catch { return null; } })(),
    ]);
    const items=ebayItems||[]; setResults(items);
    const prices=items.map(i=>i.value).filter(v=>v>0).sort((a,b)=>a-b);
    let stats=null;
    if(prices.length>0){
      const low=prices[Math.floor(prices.length*0.1)]??prices[0];
      const high=prices[Math.floor(prices.length*0.9)]??prices[prices.length-1];
      const mid=Math.floor(prices.length/2);
      const median=prices.length%2===0?(prices[mid-1]+prices[mid])/2:prices[mid];
      const bucketCount=6; const range=prices[prices.length-1]-prices[0]; const bucketSize=range/bucketCount||1;
      const buckets=Array(bucketCount).fill(0).map((_,i)=>({ min:prices[0]+i*bucketSize,max:prices[0]+(i+1)*bucketSize,count:0 }));
      prices.forEach(p=>{ const idx=Math.min(Math.floor((p-prices[0])/bucketSize),bucketCount-1); buckets[idx].count++; });
      stats={ low,high,median,count:prices.length,min:prices[0],max:prices[prices.length-1],buckets };
    }
    const sources=[];
    if(stats)sources.push({ label:"eBay",value:stats.median,weight:0.5,color:"#f59e0b" });
    if(pokemonResult)sources.push({ label:"TCGPlayer",value:pokemonResult.value,weight:0.3,color:"#3b82f6" });
    if(scryfallResult)sources.push({ label:"Scryfall",value:scryfallResult.value,weight:0.2,color:"#10b981" });
    const totalWeight=sources.reduce((s,src)=>s+src.weight,0);
    const estimate=sources.length>0?sources.reduce((s,src)=>s+src.value*(src.weight/totalWeight),0):null;
    setPriceData({ stats,tcgplayer:pokemonResult,scryfall:scryfallResult,sources,estimate });
    setLoading(false);
  }

  function formatDate(dateStr){ if(!dateStr)return null; const d=new Date(dateStr); return d.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}); }
  const guide=[{ grade:"PSA 10 / BGS 10",mult:"5–20×",color:"#10b981" },{ grade:"PSA 9 / BGS 9.5",mult:"2–5×",color:"#34d399" },{ grade:"PSA 8 / BGS 9",mult:"1.2–2×",color:"#f59e0b" },{ grade:"PSA 7 / BGS 8.5",mult:"0.8–1.2×",color:"#f87171" },{ grade:"Raw NM",mult:"Baseline (1×)",color:"#818cf8" }];

  return (
    <div className="slide-in">
      <div style={{ marginBottom:28 }}><h1 style={{ fontSize:26,fontWeight:700,letterSpacing:-0.5,marginBottom:4 }}>Price Checker</h1><p style={{ fontSize:14,color:"#6b7280" }}>Multi-source market analysis — eBay, TCGPlayer & Scryfall.</p></div>

      {/* Search */}
      <div style={{ background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:20,padding:"28px",marginBottom:24 }}>
        <form onSubmit={handleSearch} style={{ display:"flex",gap:12,flexWrap:"wrap" }}>
          <div style={{ flex:1,minWidth:200,position:"relative" }}>
            <svg style={{ position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",width:15,height:15,color:"#6b7280" }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input className="input-field" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search any card…" style={IS}/>
            {query&&<button type="button" onClick={()=>{setQuery("");setResults([]);setSearched(false);setSelected(null);setPriceData(null);}} style={{ position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"#6b7280",cursor:"pointer",fontSize:15,lineHeight:1,padding:4 }}>✕</button>}
          </div>
          <button type="submit" className="btn-primary" style={{ background:"linear-gradient(135deg,#8b5cf6,#7c3aed)",color:"#fff",border:"none",borderRadius:12,padding:"11px 24px",fontFamily:"inherit",fontSize:14,fontWeight:600,cursor:"pointer",boxShadow:"0 4px 15px rgba(139,92,246,0.3)",whiteSpace:"nowrap" }}>Search</button>
        </form>
      </div>

      {loading&&<div style={{ textAlign:"center",padding:"60px 0" }}><span className="spin" style={{ fontSize:32 }}>⟳</span><div style={{ fontSize:14,color:"#6b7280",marginTop:16 }}>Fetching prices from eBay, TCGPlayer & Scryfall…</div></div>}
      {!loading&&searched&&results.length===0&&!priceData?.estimate&&<div style={{ textAlign:"center",padding:"60px 0" }}><div style={{ fontSize:36,marginBottom:12 }}>🔍</div><div style={{ fontSize:15,fontWeight:600,color:"#6b7280" }}>No results found</div></div>}

      {/* Market Estimate */}
      {!loading&&priceData?.estimate&&(
        <div style={{ marginBottom:24 }}>
          <div style={{ background:"linear-gradient(135deg,rgba(139,92,246,0.1),rgba(99,102,241,0.05))",border:"1px solid rgba(139,92,246,0.25)",borderRadius:20,padding:"24px",marginBottom:14 }}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:16,marginBottom:20 }}>
              <div>
                <div style={{ fontSize:11,fontWeight:700,color:"#8b5cf6",letterSpacing:1,marginBottom:6 }}>ESTIMATED MARKET VALUE</div>
                <div style={{ fontSize:46,fontWeight:700,letterSpacing:-1.5,color:"#f9fafb",lineHeight:1 }}>${priceData.estimate.toFixed(2)}</div>
                <div style={{ fontSize:12,color:"#6b7280",marginTop:6 }}>Weighted average across {priceData.sources.length} source{priceData.sources.length!==1?"s":""}</div>
              </div>
              <div style={{ display:"flex",flexDirection:"column",gap:8,minWidth:180 }}>
                {priceData.sources.map(src=>(
                  <div key={src.label} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:10,padding:"8px 12px",gap:16 }}>
                    <div style={{ display:"flex",alignItems:"center",gap:6 }}>
                      <div style={{ width:8,height:8,borderRadius:"50%",background:src.color,flexShrink:0 }}/>
                      <span style={{ fontSize:12,color:"#9ca3af" }}>{src.label}</span>
                    </div>
                    <span style={{ fontSize:13,fontWeight:700,color:"#f9fafb" }}>${src.value.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
            {priceData.stats&&(
              <div>
                <div style={{ fontSize:11,color:"#6b7280",marginBottom:8,fontWeight:600 }}>eBay PRICE RANGE · {priceData.stats.count} listings</div>
                <div style={{ position:"relative",height:8,background:"rgba(255,255,255,0.08)",borderRadius:4,marginBottom:10 }}>
                  <div style={{ position:"absolute",left:`${((priceData.stats.low-priceData.stats.min)/(priceData.stats.max-priceData.stats.min||1))*100}%`,right:`${(1-(priceData.stats.high-priceData.stats.min)/(priceData.stats.max-priceData.stats.min||1))*100}%`,height:"100%",background:"linear-gradient(90deg,#8b5cf6,#6366f1)",borderRadius:4 }}/>
                  <div style={{ position:"absolute",left:`${((priceData.stats.median-priceData.stats.min)/(priceData.stats.max-priceData.stats.min||1))*100}%`,transform:"translateX(-50%)",top:-4,width:4,height:16,background:"#fff",borderRadius:2,boxShadow:"0 0 6px rgba(255,255,255,0.6)" }}/>
                </div>
                <div style={{ display:"flex",justifyContent:"space-between",fontSize:11,color:"#6b7280" }}>
                  <span>Low <strong style={{color:"#9ca3af"}}>${priceData.stats.min.toFixed(2)}</strong></span>
                  <span style={{ color:"#c4b5fd",fontWeight:700 }}>Median ${priceData.stats.median.toFixed(2)}</span>
                  <span>High <strong style={{color:"#9ca3af"}}>${priceData.stats.max.toFixed(2)}</strong></span>
                </div>
              </div>
            )}
          </div>

          {/* Price Distribution */}
          {priceData.stats?.buckets&&(
            <div style={{ background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:18,padding:"20px",marginBottom:14 }}>
              <div style={{ fontSize:13,fontWeight:600,color:"#9ca3af",marginBottom:2 }}>📊 Price Distribution</div>
              <div style={{ fontSize:11,color:"#4b5563",marginBottom:16 }}>eBay listing count by price range</div>
              <div style={{ display:"flex",alignItems:"flex-end",gap:6,height:90 }}>
                {priceData.stats.buckets.map((b,i)=>{
                  const maxCount=Math.max(...priceData.stats.buckets.map(x=>x.count),1);
                  const pct=b.count/maxCount;
                  return (
                    <div key={i} style={{ flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4 }}>
                      <div style={{ fontSize:9,color:"#6b7280",minHeight:12 }}>{b.count>0?b.count:""}</div>
                      <div style={{ width:"100%",height:`${Math.max(pct*64,b.count>0?4:0)}px`,background:"linear-gradient(180deg,#8b5cf6,#6366f1)",borderRadius:"3px 3px 0 0",opacity:0.35+pct*0.65 }}/>
                      <div style={{ fontSize:9,color:"#4b5563",textAlign:"center" }}>${Math.round(b.min)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TCGPlayer / Scryfall result cards */}
          {(priceData.tcgplayer||priceData.scryfall)&&(
            <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:12,marginBottom:14 }}>
              {priceData.tcgplayer&&(
                <div style={{ background:"rgba(59,130,246,0.06)",border:"1px solid rgba(59,130,246,0.2)",borderRadius:14,padding:14 }}>
                  <div style={{ display:"flex",alignItems:"center",gap:6,marginBottom:10 }}><div style={{ width:8,height:8,borderRadius:"50%",background:"#3b82f6" }}/><span style={{ fontSize:11,fontWeight:700,color:"#60a5fa" }}>TCGPlayer</span></div>
                  <div style={{ display:"flex",gap:10,alignItems:"center" }}>
                    {priceData.tcgplayer.image&&<img src={priceData.tcgplayer.image} alt="" style={{ width:40,height:56,objectFit:"cover",borderRadius:5,flexShrink:0 }}/>}
                    <div><div style={{ fontSize:12,fontWeight:700,marginBottom:2,color:"#f9fafb" }}>{priceData.tcgplayer.name}</div><div style={{ fontSize:10,color:"#6b7280",marginBottom:6 }}>{priceData.tcgplayer.set}</div><div style={{ fontSize:20,fontWeight:700,color:"#60a5fa" }}>${priceData.tcgplayer.value.toFixed(2)}</div></div>
                  </div>
                </div>
              )}
              {priceData.scryfall&&(
                <div style={{ background:"rgba(16,185,129,0.06)",border:"1px solid rgba(16,185,129,0.2)",borderRadius:14,padding:14 }}>
                  <div style={{ display:"flex",alignItems:"center",gap:6,marginBottom:10 }}><div style={{ width:8,height:8,borderRadius:"50%",background:"#10b981" }}/><span style={{ fontSize:11,fontWeight:700,color:"#34d399" }}>Scryfall (MTG)</span></div>
                  <div style={{ display:"flex",gap:10,alignItems:"center" }}>
                    {priceData.scryfall.image&&<img src={priceData.scryfall.image} alt="" style={{ width:40,height:56,objectFit:"cover",borderRadius:5,flexShrink:0 }}/>}
                    <div><div style={{ fontSize:12,fontWeight:700,marginBottom:2,color:"#f9fafb" }}>{priceData.scryfall.name}</div><div style={{ fontSize:10,color:"#6b7280",marginBottom:6 }}>{priceData.scryfall.set}</div><div style={{ fontSize:20,fontWeight:700,color:"#34d399" }}>${priceData.scryfall.value.toFixed(2)}</div></div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* eBay Listings */}
      {results.length>0&&(
        <div style={{ marginBottom:24 }}>
          <div style={{ fontSize:13,fontWeight:600,color:"#9ca3af",marginBottom:12 }}>🏷️ eBay Listings ({results.length})</div>
          <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:12 }}>
            {results.map((r,i)=>(
              <div key={i} className="price-result fade-up" onClick={()=>setSelected(selected===r?null:r)} style={{ background:selected===r?"rgba(139,92,246,0.08)":"rgba(255,255,255,0.03)",border:selected===r?"1px solid rgba(139,92,246,0.35)":"1px solid rgba(255,255,255,0.08)",borderRadius:14,padding:14,animationDelay:`${i*0.05}s`,cursor:"pointer" }}>
                <div style={{ display:"flex",gap:10,marginBottom:10 }}>
                  {r.image&&<img src={r.image} alt={r.name} style={{ width:48,height:64,objectFit:"cover",borderRadius:6,flexShrink:0 }}/>}
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:13,fontWeight:700,marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{r.name}</div>
                    <div style={{ fontSize:10,color:"#6b7280",marginBottom:3 }}>{r.set}</div>
                    {r.listedDate&&<div style={{ fontSize:10,color:"#4b5563" }}>Listed {formatDate(r.listedDate)}</div>}
                  </div>
                </div>
                <div style={{ fontSize:22,fontWeight:700,color:"#a78bfa" }}>${r.value.toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grading Estimator */}
      <div style={{ background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:18,padding:"22px" }}>
        <div style={{ fontSize:13,fontWeight:600,color:"#9ca3af",marginBottom:4 }}>🏆 Grading Estimator</div>
        <div style={{ fontSize:11,color:"#4b5563",marginBottom:16 }}>Multipliers vs. raw NM price</div>
        {guide.map(({grade,mult,color})=>(
          <div key={grade} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
            <span style={{ fontSize:12,color:"#9ca3af" }}>{grade}</span>
            <span style={{ fontSize:13,fontWeight:700,color }}>{mult}</span>
          </div>
        ))}
        {priceData?.estimate&&(
          <div style={{ marginTop:16,paddingTop:16,borderTop:"1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ fontSize:11,color:"#6b7280",marginBottom:10 }}>Dollar estimates for this card:</div>
            {[["PSA 10",10],["PSA 9",3],["PSA 8",1.5],["Raw NM",1]].map(([g,m])=>(
              <div key={g} style={{ display:"flex",justifyContent:"space-between",fontSize:12,padding:"7px 0",borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
                <span style={{color:"#9ca3af"}}>{g}</span>
                <span style={{fontWeight:600,color:"#c4b5fd"}}>~${Math.round(priceData.estimate*m).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Listing Detail Modal */}
      {selected&&<div onClick={()=>setSelected(null)} style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",backdropFilter:"blur(6px)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:24 }}>
        <div className="modal-anim" onClick={e=>e.stopPropagation()} style={{ background:"#13131a",border:"1px solid rgba(255,255,255,0.1)",borderRadius:22,padding:28,maxWidth:460,width:"100%",maxHeight:"88vh",overflowY:"auto",position:"relative" }}>
          <button onClick={()=>setSelected(null)} style={{ position:"absolute",top:16,right:16,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:"50%",width:34,height:34,color:"#9ca3af",cursor:"pointer",fontSize:16,fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>✕</button>
          {selected.image&&<img src={selected.image} alt={selected.name} style={{ width:"100%",maxHeight:220,objectFit:"contain",borderRadius:12,marginBottom:18,background:"rgba(255,255,255,0.03)" }}/>}
          <div style={{ fontSize:15,fontWeight:700,lineHeight:1.4,color:"#f9fafb",marginBottom:6,paddingRight:40 }}>{selected.name}</div>
          {selected.set&&<div style={{ fontSize:11,color:"#6b7280",marginBottom:14 }}>{selected.set}{selected.number?` · #${selected.number}`:""}</div>}
          <div style={{ fontSize:30,fontWeight:700,color:"#a78bfa",marginBottom:6 }}>${selected.value.toLocaleString()}</div>
          {selected.listedDate&&<div style={{ fontSize:12,color:"#6b7280",marginBottom:18 }}>Listed {formatDate(selected.listedDate)}</div>}
          {selected.url&&<a href={selected.url} target="_blank" rel="noreferrer" style={{ display:"inline-block",background:"rgba(139,92,246,0.15)",border:"1px solid rgba(139,92,246,0.3)",color:"#c4b5fd",borderRadius:9,padding:"9px 18px",fontSize:13,fontWeight:600,textDecoration:"none",marginBottom:22 }}>View on eBay →</a>}
          <div style={{ borderTop:"1px solid rgba(255,255,255,0.07)",paddingTop:18 }}>
            <div style={{ fontSize:12,fontWeight:600,color:"#a78bfa",marginBottom:12 }}>Grade estimates</div>
            {[["PSA 10",10],["PSA 9",3],["PSA 8",1.5],["Raw NM",1]].map(([g,m])=>(
              <div key={g} style={{ display:"flex",justifyContent:"space-between",fontSize:12,padding:"7px 0",borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
                <span style={{color:"#9ca3af"}}>{g}</span>
                <span style={{fontWeight:600,color:"#c4b5fd"}}>~${Math.round(selected.value*m).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>}
    </div>
  );
}

// ─────────────────────────────────────────────
//  PROFILE
// ─────────────────────────────────────────────
function Profile({ cards, liveData, profile, setProfile, userId, onSignOut }) {
  const [editing,setEditing]=useState(false); const [form,setForm]=useState(profile||{}); const [saving,setSaving]=useState(false);
  const getVal=c=>liveData[c.id]?.value??c.value;
  const totalValue=cards.reduce((s,c)=>s+getVal(c),0); const totalCost=cards.reduce((s,c)=>s+(c.purchase_price||0),0); const gain=totalValue-totalCost;
  const topCards=[...cards].sort((a,b)=>getVal(b)-getVal(a)).slice(0,3);
  useEffect(()=>{ if(profile)setForm(profile); },[profile]);
  async function saveProfile(){ setSaving(true); const { data }=await sb.from("profiles").update({ name:form.name,handle:form.handle,bio:form.bio,location:form.location }).eq("id",userId).select().single(); if(data)setProfile(data); setSaving(false); setEditing(false); }
  return (
    <div className="slide-in">
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:28 }}>
        <div><h1 style={{ fontSize:26,fontWeight:700,letterSpacing:-0.5,marginBottom:4 }}>Profile</h1><p style={{ fontSize:14,color:"#6b7280" }}>Your public collector profile</p></div>
        <div style={{ display:"flex",gap:10 }}>
          {editing
            ?<button className="btn-ghost" onClick={saveProfile} disabled={saving} style={{ background:"rgba(16,185,129,0.1)",color:"#10b981",border:"1px solid rgba(16,185,129,0.25)",borderRadius:12,padding:"10px 20px",fontFamily:"inherit",fontSize:13,fontWeight:600,cursor:"pointer" }}>{saving?<span className="spin">⟳</span>:"💾 Save"}</button>
            :<button className="btn-ghost" onClick={()=>setEditing(true)} style={{ background:"rgba(255,255,255,0.05)",color:"#9ca3af",border:"1px solid rgba(255,255,255,0.1)",borderRadius:12,padding:"10px 20px",fontFamily:"inherit",fontSize:13,fontWeight:600,cursor:"pointer" }}>✏️ Edit</button>}
          <button onClick={onSignOut} style={{ background:"rgba(239,68,68,0.08)",color:"#f87171",border:"1px solid rgba(239,68,68,0.2)",borderRadius:12,padding:"10px 16px",fontFamily:"inherit",fontSize:13,fontWeight:600,cursor:"pointer" }}>Sign Out</button>
        </div>
      </div>
      <div style={{ display:"grid",gridTemplateColumns:"minmax(280px,320px) 1fr",gap:20 }}>
        <div>
          <div style={{ background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:20,overflow:"hidden",marginBottom:16 }}>
            <div style={{ height:100,background:"linear-gradient(135deg,rgba(139,92,246,0.4),rgba(99,102,241,0.3),rgba(6,182,212,0.2))",position:"relative" }}>
              <div style={{ position:"absolute",bottom:-36,left:24 }}>
                <div style={{ width:72,height:72,borderRadius:"50%",background:"linear-gradient(135deg,#8b5cf6,#6366f1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:30,border:"3px solid #13131a",boxShadow:"0 4px 16px rgba(139,92,246,0.4)" }}>🃏</div>
              </div>
            </div>
            <div style={{ padding:"44px 24px 24px" }}>
              {editing?(
                <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
                  {[["Display Name","name","Your name"],["Handle","handle","@handle"],["Location","location","City, Country"]].map(([lbl,field,ph])=>(
                    <div key={field}><div style={{ fontSize:11,color:"#6b7280",marginBottom:4 }}>{lbl}</div><input value={form[field]||""} onChange={e=>setForm(f=>({...f,[field]:e.target.value}))} placeholder={ph} style={{ width:"100%",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:8,color:"#f9fafb",padding:"8px 10px",fontFamily:"inherit",fontSize:13,outline:"none" }}/></div>
                  ))}
                  <div><div style={{ fontSize:11,color:"#6b7280",marginBottom:4 }}>Bio</div><textarea value={form.bio||""} onChange={e=>setForm(f=>({...f,bio:e.target.value}))} placeholder="About you…" style={{ width:"100%",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:8,color:"#f9fafb",padding:"8px 10px",fontFamily:"inherit",fontSize:13,outline:"none",resize:"vertical",minHeight:80 }}/></div>
                </div>
              ):(
                <>
                  <div style={{ fontSize:20,fontWeight:700,letterSpacing:-0.3,marginBottom:2 }}>{profile?.name||"Collector"}</div>
                  <div style={{ fontSize:13,color:"#8b5cf6",fontWeight:600,marginBottom:6 }}>{profile?.handle||"@collector"}</div>
                  {profile?.location&&<div style={{ fontSize:12,color:"#6b7280",marginBottom:10 }}>📍 {profile.location}</div>}
                  <div style={{ fontSize:13,color:"#9ca3af",lineHeight:1.6,marginBottom:16 }}>{profile?.bio||"No bio yet — tap Edit to add one."}</div>
                  <div style={{ fontSize:11,color:"#4b5563" }}>Member since {profile?.joined||"2024"}</div>
                </>
              )}
            </div>
          </div>
          <div style={{ background:"rgba(139,92,246,0.08)",border:"1px solid rgba(139,92,246,0.2)",borderRadius:16,padding:"16px 20px" }}>
            <div style={{ fontSize:12,fontWeight:600,color:"#a78bfa",marginBottom:8 }}>🔗 Share Profile</div>
            <div style={{ fontSize:12,color:"#6b7280",fontFamily:"'DM Mono',monospace",marginBottom:10,background:"rgba(0,0,0,0.3)",padding:"8px 10px",borderRadius:8 }}>cardvault.app/u/{(profile?.handle||"@collector").replace("@","")}</div>
            <button className="btn-ghost" onClick={()=>navigator.clipboard?.writeText(`cardvault.app/u/${(profile?.handle||"collector").replace("@","")}`)} style={{ width:"100%",background:"rgba(139,92,246,0.15)",color:"#c4b5fd",border:"1px solid rgba(139,92,246,0.3)",borderRadius:10,padding:"9px",fontFamily:"inherit",fontSize:12,fontWeight:600,cursor:"pointer" }}>Copy Link</button>
          </div>
        </div>
        <div style={{ display:"flex",flexDirection:"column",gap:16 }}>
          <div style={{ background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:20,padding:"22px" }}>
            <div style={{ fontSize:13,fontWeight:600,color:"#9ca3af",marginBottom:16 }}>📊 Collection Stats</div>
            <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12 }}>
              {[["Cards",cards.length],["Value",`$${Math.round(totalValue).toLocaleString()}`],["Gain",`${gain>=0?"+":"-"}$${Math.abs(Math.round(gain)).toLocaleString()}`],["Sports",cards.filter(c=>c.category==="sports").length],["TCG",cards.filter(c=>c.category==="tcg").length],["Favs",cards.filter(c=>c.favorite).length]].map(([lbl,val])=>(
                <div key={lbl} style={{ background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:12,padding:"14px" }}>
                  <div style={{ fontSize:10,color:"#4b5563",fontWeight:500,marginBottom:4 }}>{lbl}</div>
                  <div style={{ fontSize:20,fontWeight:700,letterSpacing:-0.3 }}>{val}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:20,padding:"22px",flex:1 }}>
            <div style={{ fontSize:13,fontWeight:600,color:"#9ca3af",marginBottom:16 }}>👑 Top Cards</div>
            {topCards.length===0&&<div style={{ textAlign:"center",padding:"20px 0",fontSize:13,color:"#4b5563" }}>Add cards to see your top picks</div>}
            {topCards.map((card,i)=>{
              const img=card.image_url||liveData[card.id]?.cardImage; const badge=conditionBadge[card.condition]||conditionBadge["Raw NM"];
              return (
                <div key={card.id} style={{ display:"flex",gap:14,alignItems:"center",padding:"12px 14px",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:12,marginBottom:10 }}>
                  <div style={{ width:24,height:24,borderRadius:"50%",background:["linear-gradient(135deg,#f59e0b,#f97316)","linear-gradient(135deg,#9ca3af,#6b7280)","linear-gradient(135deg,#92400e,#78350f)"][i],display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,flexShrink:0 }}>{i+1}</div>
                  {img?<img src={img} alt={card.name} style={{ width:36,height:48,objectFit:"cover",borderRadius:5,flexShrink:0 }}/>:<div style={{ width:36,height:48,borderRadius:5,background:"rgba(255,255,255,0.05)",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16 }}>{card.category==="sports"?sportEmoji[card.sport]:gameEmoji[card.game]}</div>}
                  <div style={{ flex:1,minWidth:0 }}>
                    <div style={{ fontSize:13,fontWeight:700,marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{card.name}</div>
                    <div style={{ fontSize:10,color:"#6b7280",fontFamily:"'DM Mono',monospace" }}>{card.year} · {card.set_name}</div>
                  </div>
                  <div style={{ textAlign:"right",flexShrink:0 }}>
                    <div style={{ fontSize:15,fontWeight:700,color:"#a78bfa" }}>${getVal(card).toLocaleString()}</div>
                    <span style={{ fontSize:9,fontWeight:600,color:badge.color,background:badge.bg,border:`1px solid ${badge.border}`,borderRadius:4,padding:"1px 5px" }}>{card.condition}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  MARKETPLACE
// ─────────────────────────────────────────────
function Marketplace() {
  const features=[{ icon:"🏷️",title:"List Cards for Sale",desc:"Set your price and list any card from your collection." },{ icon:"🔄",title:"Trade Offers",desc:"Send and receive multi-card trade offers." },{ icon:"🔔",title:"Price Alerts",desc:"Get notified when a card hits your target price." },{ icon:"⭐",title:"Seller Ratings",desc:"Build your reputation with a verified seller score." },{ icon:"🛡️",title:"Buyer Protection",desc:"Every transaction covered with dispute resolution." },{ icon:"📦",title:"Shipping Labels",desc:"Print prepaid shipping labels from your dashboard." }];
  return (
    <div className="slide-in" style={{ textAlign:"center",maxWidth:700,margin:"0 auto",paddingTop:40 }}>
      <div style={{ width:80,height:80,borderRadius:24,background:"linear-gradient(135deg,rgba(245,158,11,0.2),rgba(249,115,22,0.15))",border:"1px solid rgba(245,158,11,0.3)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:38,margin:"0 auto 24px" }}>🏪</div>
      <div style={{ display:"inline-flex",alignItems:"center",gap:8,fontSize:12,fontWeight:700,color:"#f59e0b",background:"rgba(245,158,11,0.12)",border:"1px solid rgba(245,158,11,0.3)",borderRadius:20,padding:"5px 14px",marginBottom:20 }}>COMING SOON</div>
      <h1 style={{ fontSize:32,fontWeight:700,letterSpacing:-1,marginBottom:12 }}>Card Vault Marketplace</h1>
      <p style={{ fontSize:15,color:"#9ca3af",lineHeight:1.7,marginBottom:40 }}>Buy, sell, and trade cards directly with other collectors — all within Card Vault.</p>
      <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:14,textAlign:"left" }}>
        {features.map(({icon,title,desc})=>(<div key={title} style={{ background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:16,padding:"20px" }}><div style={{ fontSize:26,marginBottom:10 }}>{icon}</div><div style={{ fontSize:13,fontWeight:700,marginBottom:6 }}>{title}</div><div style={{ fontSize:12,color:"#6b7280",lineHeight:1.6 }}>{desc}</div></div>))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  RESET PASSWORD SCREEN
// ─────────────────────────────────────────────
function ResetPasswordScreen({ onDone }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [success, setSuccess]   = useState("");

  const inp = { width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:12,color:"#f9fafb",padding:"13px 16px",fontFamily:"inherit",fontSize:14,outline:"none",marginBottom:12 };

  async function handleSubmit(e) {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords don't match"); return; }
    setLoading(true); setError("");
    try {
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw error;
      setSuccess("Password updated! Taking you to your vault...");
      setTimeout(onDone, 1500);
    } catch(err) { setError(err.message||"Something went wrong"); }
    setLoading(false);
  }

  return (
    <div style={{ minHeight:"100vh",background:"#0d0d12",display:"flex",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"'DM Sans',sans-serif",color:"#f9fafb" }}>
      <div style={{ position:"fixed",inset:0,pointerEvents:"none",overflow:"hidden" }}>
        <div style={{ position:"absolute",top:-200,left:-200,width:600,height:600,borderRadius:"50%",background:"radial-gradient(circle,rgba(139,92,246,0.08) 0%,transparent 70%)" }}/>
        <div style={{ position:"absolute",bottom:-200,right:-200,width:500,height:500,borderRadius:"50%",background:"radial-gradient(circle,rgba(59,130,246,0.05) 0%,transparent 70%)" }}/>
      </div>
      <div className="auth-fade" style={{ width:"100%",maxWidth:420,position:"relative",zIndex:1 }}>
        <div style={{ textAlign:"center",marginBottom:40 }}>
          <div style={{ width:64,height:64,borderRadius:20,background:"linear-gradient(135deg,#8b5cf6,#6366f1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:30,margin:"0 auto 16px",boxShadow:"0 8px 32px rgba(139,92,246,0.4)" }}>🔑</div>
          <div style={{ fontSize:26,fontWeight:700,letterSpacing:-0.5,marginBottom:6 }}>Set New Password</div>
          <div style={{ fontSize:14,color:"#6b7280" }}>Choose a new password for your vault</div>
        </div>
        <div style={{ background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:24,padding:"32px" }}>
          <form onSubmit={handleSubmit}>
            <input className="input-field" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="New password" style={inp} required minLength={6}/>
            <input className="input-field" type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="Confirm new password" style={{ ...inp,marginBottom:20 }} required minLength={6}/>
            {error&&<div style={{ background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.25)",borderRadius:10,padding:"10px 14px",fontSize:13,color:"#f87171",marginBottom:16 }}>{error}</div>}
            {success&&<div style={{ background:"rgba(16,185,129,0.1)",border:"1px solid rgba(16,185,129,0.25)",borderRadius:10,padding:"10px 14px",fontSize:13,color:"#10b981",marginBottom:16 }}>{success}</div>}
            <button type="submit" className="btn-primary" disabled={loading} style={{ width:"100%",background:"linear-gradient(135deg,#8b5cf6,#7c3aed)",color:"#fff",border:"none",borderRadius:12,padding:"14px",fontFamily:"inherit",fontSize:15,fontWeight:700,cursor:loading?"not-allowed":"pointer",opacity:loading?0.7:1,boxShadow:"0 4px 20px rgba(139,92,246,0.35)" }}>
              {loading?<span className="spin">⟳</span>:"Set New Password →"}
            </button>
          </form>
        </div>
        <div style={{ textAlign:"center",marginTop:20,fontSize:12,color:"#4b5563" }}>Your collection is private and secure</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  ROOT APP
// ─────────────────────────────────────────────
export default function App() {
  const [user,setUser]=useState(null); const [profile,setProfile]=useState(null); const [cards,setCards]=useState([]); const [liveData,setLiveData]=useState({}); const [page,setPage]=useState("dashboard"); const [loading,setLoading]=useState(true); const [resetMode,setResetMode]=useState(false);

  async function loadUserData(uid) {
    setLoading(true);
    const [{ data:prof },{ data:cardData }]=await Promise.all([
      sb.from("profiles").select("*").eq("id",uid).single(),
      sb.from("cards").select("*").eq("user_id",uid).order("created_at",{ ascending:false }),
    ]);
    if(prof)setProfile(prof);
    if(cardData){ setCards(cardData); cardData.forEach(c=>{ if(c.category==="tcg"&&(c.game==="Pokémon"||c.game==="Magic: The Gathering"))fetchAndStore(c); }); }
    setLoading(false);
  }

  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    const hasCode=params.has("code");
    const hasRecovery=window.location.hash.includes("type=recovery");
    // If there's a recovery code in the URL, skip getSession and wait for onAuthStateChange
    if(!hasCode&&!hasRecovery){
      sb.auth.getSession().then(({ data:{ session } })=>{ if(session?.user){ setUser(session.user); loadUserData(session.user.id); } else setLoading(false); });
    }
    const { data:{ subscription } }=sb.auth.onAuthStateChange((event,session)=>{
      if(event==="PASSWORD_RECOVERY"){
        setResetMode(true); setLoading(false);
        // Clean the code out of the URL so a refresh doesn't re-trigger this
        window.history.replaceState({},"",window.location.pathname);
      } else if(session?.user){
        setResetMode(false); setUser(session.user); loadUserData(session.user.id);
      } else {
        setUser(null);setProfile(null);setCards([]);setLoading(false);
      }
    });
    return ()=>subscription.unsubscribe();
  },[]);

  async function fetchAndStore(card) {
    setLiveData(prev=>({...prev,[card.id]:{loading:true}}));
    let result=await fetchLiveData(card);
    if(!result){
      const price=await fetchEbayPrice(card);
      if(price) result={ value:price, source:"eBay" };
    }
    if(result){
      setLiveData(prev=>({...prev,[card.id]:{...result,loading:false}}));
      await sb.from("cards").update({ value:result.value }).eq("id",card.id);
      setCards(prev=>prev.map(c=>c.id===card.id?{...c,value:result.value}:c));
    } else {
      setLiveData(prev=>({...prev,[card.id]:{error:true,loading:false}}));
    }
  }

  const pageTitles={ dashboard:{label:"Dashboard",sub:"Collection overview"},collection:{label:"Collection",sub:`${cards.length} cards`},prices:{label:"Price Checker",sub:"Live market prices"},marketplace:{label:"Marketplace",sub:"Coming soon"},profile:{label:"Profile",sub:"Your public page"} };

  if(loading)return(<div style={{ minHeight:"100vh",background:"#0d0d12",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16 }}><div style={{ width:56,height:56,borderRadius:18,background:"linear-gradient(135deg,#8b5cf6,#6366f1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,boxShadow:"0 8px 32px rgba(139,92,246,0.4)" }}>🃏</div><span className="spin" style={{ fontSize:24,color:"#8b5cf6" }}>⟳</span><style>{css}</style></div>);
  if(resetMode)return(<><style>{css}</style><ResetPasswordScreen onDone={()=>{ setResetMode(false); sb.auth.getSession().then(({data:{session}})=>{ if(session?.user){ setUser(session.user); loadUserData(session.user.id); } }); }}/></>);
  if(!user)return(<><style>{css}</style><AuthScreen onAuth={u=>{setUser(u);loadUserData(u.id);}}/></>);

  const pages={ dashboard:<Dashboard cards={cards} liveData={liveData} setPage={setPage} profile={profile}/>, collection:<Collection cards={cards} setCards={setCards} liveData={liveData} fetchAndStore={fetchAndStore} userId={user.id}/>, prices:<PriceChecker/>, marketplace:<Marketplace/>, profile:<Profile cards={cards} liveData={liveData} profile={profile} setProfile={setProfile} userId={user.id} onSignOut={()=>sb.auth.signOut()}/> };

  return (
    <>
      <style>{css}</style>
      <div style={{ minHeight:"100vh",background:"#0d0d12",fontFamily:"'DM Sans',sans-serif",color:"#f9fafb",display:"flex",flexDirection:"column" }}>
        <div style={{ position:"fixed",inset:0,pointerEvents:"none",zIndex:0,overflow:"hidden" }}>
          <div style={{ position:"absolute",top:-200,left:-200,width:600,height:600,borderRadius:"50%",background:"radial-gradient(circle,rgba(139,92,246,0.06) 0%,transparent 70%)" }}/>
          <div style={{ position:"absolute",bottom:-200,right:-200,width:500,height:500,borderRadius:"50%",background:"radial-gradient(circle,rgba(59,130,246,0.04) 0%,transparent 70%)" }}/>
        </div>
        <header style={{ position:"sticky",top:0,zIndex:40,background:"rgba(13,13,18,0.9)",backdropFilter:"blur(20px)",borderBottom:"1px solid rgba(255,255,255,0.07)",padding:"0 24px",display:"flex",alignItems:"center",justifyContent:"space-between",height:60,flexShrink:0 }}>
          <div style={{ display:"flex",alignItems:"center",gap:10 }}>
            <div style={{ width:34,height:34,borderRadius:10,background:"linear-gradient(135deg,#8b5cf6,#6366f1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,boxShadow:"0 3px 12px rgba(139,92,246,0.4)" }}>🃏</div>
            <div><div style={{ fontSize:15,fontWeight:700,letterSpacing:-0.3,lineHeight:1.1 }}>Card Vault</div><div style={{ fontSize:10,color:"#6b7280",lineHeight:1 }}>Pro Collection</div></div>
          </div>
          <div style={{ textAlign:"center" }}><div style={{ fontSize:14,fontWeight:700 }}>{pageTitles[page].label}</div><div style={{ fontSize:11,color:"#6b7280" }}>{pageTitles[page].sub}</div></div>
          <div style={{ display:"flex",alignItems:"center",gap:6 }}>
            {[["Pokémon",true],["MTG",true],["eBay",true]].map(([label,live])=>(
              <div key={label} style={{ display:"flex",alignItems:"center",gap:4,fontSize:10,color:live?"#10b981":"#4b5563",background:live?"rgba(16,185,129,0.08)":"rgba(255,255,255,0.04)",border:`1px solid ${live?"rgba(16,185,129,0.2)":"rgba(255,255,255,0.07)"}`,borderRadius:20,padding:"3px 8px" }}>
                <span style={{ width:5,height:5,borderRadius:"50%",background:live?"#10b981":"#374151",boxShadow:live?"0 0 4px #10b981":"none" }}/>{label}
              </div>
            ))}
          </div>
        </header>
        <main style={{ flex:1,overflowY:"auto",position:"relative",zIndex:1,padding:"28px 28px 100px",maxWidth:1200,width:"100%",margin:"0 auto" }}>
          {pages[page]}
        </main>
        <BottomNav page={page} setPage={setPage}/>
      </div>
    </>
  );
}

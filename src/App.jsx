import { useState, useEffect, useRef, useCallback } from "react";

// ─── Music Theory ─────────────────────────────────────────────────────────────

const NOTES = ["C","C#","D","Eb","E","F","F#","G","Ab","A","Bb","B"];

// Comprehensive semitone map — all common spellings
const SEMITONE_MAP = {
  C:0,"C#":1,"Db":1,"D♭":1,D:2,"D#":3,"Eb":3,"E♭":3,E:4,F:5,
  "F#":6,"Gb":6,"G♭":6,G:7,"G#":8,"Ab":8,"A♭":8,A:9,"A#":10,"Bb":10,"B♭":10,B:11,
  "C♯":1,"D♯":3,"F♯":6,"G♯":8,"A♯":10,
  // Triple-flat / double-flat edge cases (e.g. Bbb = A)
  "Bbb":9,"Abb":8,"Dbb":0,"Ebb":2,"Gbb":5,"Fbb":3,"Cbb":10,
};

// C3 = 130.81 Hz
const C3 = 130.81;

// Frequency for a named note at a given octave
function noteFreqOct(note, oct) {
  const semi = SEMITONE_MAP[note] ?? SEMITONE_MAP[note.replace("♭","b").replace("♯","#")] ?? 0;
  return C3 * Math.pow(2, (semi + (oct - 3) * 12) / 12);
}

// ─── Seed / RNG ───────────────────────────────────────────────────────────────

function hashSeed(n) {
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return (n ^ (n >>> 16)) >>> 0;
}
function getDaySeed() {
  const d = new Date();
  return hashSeed(d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate());
}
function seededRandom(seed) {
  let s = seed || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 0xffffffff; };
}

// ─── Chord Data ───────────────────────────────────────────────────────────────

const CHORD_TYPES = [
  "Major","Minor","Diminished","Augmented","Sus2","Sus4",
  "Major 7th","Minor 7th","Dominant 7th","Half-Diminished","Diminished 7th","Minor Major 7th",
  "Add9","Minor Add9","Major 9th","Minor 9th","Dominant 9th",
  "Major 11th","Minor 11th","Dominant 11th","Major 13th","Minor 13th",
  "Dominant 7th b9","Dominant 7th #11",
];
const CHORD_INTERVALS = {
  "Major":[0,4,7],"Minor":[0,3,7],"Diminished":[0,3,6],"Augmented":[0,4,8],
  "Sus2":[0,2,7],"Sus4":[0,5,7],
  "Major 7th":[0,4,7,11],"Minor 7th":[0,3,7,10],"Dominant 7th":[0,4,7,10],
  "Half-Diminished":[0,3,6,10],"Diminished 7th":[0,3,6,9],"Minor Major 7th":[0,3,7,11],
  "Add9":[0,4,7,14],"Minor Add9":[0,3,7,14],
  "Major 9th":[0,4,7,11,14],"Minor 9th":[0,3,7,10,14],"Dominant 9th":[0,4,7,10,14],
  "Major 11th":[0,4,7,11,14,17],"Minor 11th":[0,3,7,10,14,17],"Dominant 11th":[0,4,7,10,14,17],
  "Major 13th":[0,4,7,11,14,17,21],"Minor 13th":[0,3,7,10,14,17,21],
  "Dominant 7th b9":[0,4,7,10,13],"Dominant 7th #11":[0,4,7,10,18],
};

function getChordForSeed(seed) {
  const rng = seededRandom(seed);
  return {
    note: NOTES[Math.floor(rng() * NOTES.length)],
    type: CHORD_TYPES[Math.floor(rng() * CHORD_TYPES.length)],
  };
}
function getTodaysChord() { return getChordForSeed(getDaySeed()); }

// Returns unique notes only (deduped by semitone) for the piano roll
function getChordNotes(rootNote, type, dedupe = false) {
  const root = SEMITONE_MAP[rootNote] ?? 0;
  const intervals = CHORD_INTERVALS[type] || [0, 4, 7];
  const seen = new Set();
  const notes = [];
  for (const i of intervals) {
    const s = (root + i) % 12;
    if (dedupe && seen.has(s)) continue;
    seen.add(s);
    const name = NOTES.find(n => SEMITONE_MAP[n] === s) || NOTES[s % 12];
    notes.push(name);
  }
  return notes;
}

// ─── Chord Name Parser ────────────────────────────────────────────────────────

function parseChordName(name) {
  try {
    if (!name || typeof name !== "string") return { root: "C", type: "Major" };
    const m = name.match(/^([A-G][#♯b♭]?)/);
    if (!m) return { root: "C", type: "Major" };
    let root = m[1].replace("♯","#").replace("♭","b").replace(/([A-G])b/, (_,n) => n+"b");
    if (!(root in SEMITONE_MAP)) root = root.charAt(0);
    const rest = name.slice(m[1].length).trim().toLowerCase();
    const typeMap = [
      [/minor major 7|mmaj7/, "Minor Major 7th"],
      [/dom(inant)? ?7 ?[#♯]11/, "Dominant 7th #11"],
      [/dom(inant)? ?7 ?b9/, "Dominant 7th b9"],
      [/maj(or)? ?13/, "Major 13th"], [/min(or)? ?13|m13/, "Minor 13th"],
      [/maj(or)? ?11/, "Major 11th"], [/min(or)? ?11|m11/, "Minor 11th"],
      [/dom(inant)? ?11|11$/, "Dominant 11th"],
      [/maj(or)? ?9/, "Major 9th"], [/min(or)? ?9|m9/, "Minor 9th"],
      [/dom(inant)? ?9|^9$/, "Dominant 9th"],
      [/maj(or)? ?7|maj7/, "Major 7th"], [/min(or)? ?7|m7|-7/, "Minor 7th"],
      [/dom(inant)? ?7|^7$/, "Dominant 7th"],
      [/half.?dim|ø|m7b5/, "Half-Diminished"], [/dim(inished)? ?7|°7/, "Diminished 7th"],
      [/dim(inished)?|°/, "Diminished"], [/aug(mented)?/, "Augmented"],
      [/sus ?2/, "Sus2"], [/sus ?4|sus/, "Sus4"],
      [/min(or)? ?add ?9|madd9/, "Minor Add9"], [/add ?9/, "Add9"],
      [/maj(or)?/, "Major"], [/min(or)?|^m$/, "Minor"], [/^$/, "Major"],
    ];
    let type = "Major";
    for (const [re, t] of typeMap) { if (re.test(rest)) { type = t; break; } }
    return { root, type };
  } catch { return { root: "C", type: "Major" }; }
}

// ─── Audio Engine ─────────────────────────────────────────────────────────────

function playFreqs(freqs, style = "together") {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.42, ctx.currentTime);
    master.connect(ctx.destination);
    freqs.forEach((freq, i) => {
      const delay = style === "arpeggio" ? i * 0.1 : 0;
      [{ wt: "triangle", vol: 0.26 }, { wt: "sine", vol: 0.12 }].forEach(({ wt, vol }) => {
        const osc = ctx.createOscillator(), g = ctx.createGain();
        osc.connect(g); g.connect(master);
        osc.type = wt; osc.frequency.value = freq;
        const t = ctx.currentTime + delay;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(vol, t + 0.015);
        g.gain.exponentialRampToValueAtTime(0.001, t + 2.3);
        osc.start(t); osc.stop(t + 2.4);
      });
    });
    setTimeout(() => ctx.close(), 3500);
  } catch(e) { console.warn("audio", e); }
}

// Play chord notes anchored to C3, stacking intervals from root
function playChord(notes, style, rootNote) {
  const rootSemi = SEMITONE_MAP[rootNote] ?? 0;
  const rootFreq = noteFreqOct(rootNote, 3);
  // Dedupe frequencies so same-pitch notes don't stack
  const seen = new Set();
  const freqs = [];
  for (const n of notes) {
    let iv = (SEMITONE_MAP[n] ?? 0) - rootSemi;
    if (iv < 0) iv += 12;
    const freq = rootFreq * Math.pow(2, iv / 12);
    const rounded = Math.round(freq * 10);
    if (!seen.has(rounded)) { seen.add(rounded); freqs.push(freq); }
  }
  playFreqs(freqs, style);
}

function playChordByName(name) {
  const { root, type } = parseChordName(name);
  playChord(getChordNotes(root, type), "together", root);
}

// ─── Storage ──────────────────────────────────────────────────────────────────

async function loadStorage(key) {
  try {
    if (typeof window !== "undefined" && window.storage) {
      const r = await window.storage.get(key);
      return r ? JSON.parse(r.value) : null;
    }
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
async function saveStorage(key, value) {
  try {
    if (typeof window !== "undefined" && window.storage) {
      await window.storage.set(key, JSON.stringify(value)); return;
    }
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

// ─── Date Helpers ─────────────────────────────────────────────────────────────

function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function seedFromDateKey(dk) {
  const [y,m,d] = dk.split("-").map(Number);
  return hashSeed(y * 10000 + m * 100 + d);
}
function formatDateKey(dk) {
  const [y,m,d] = dk.split("-").map(Number);
  return new Date(y,m-1,d).toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" });
}
function getLast30Days() {
  return Array.from({length:30}, (_,i) => { const d = new Date(); d.setDate(d.getDate()-i); return dateKey(d); });
}

// ─── Keyboard ─────────────────────────────────────────────────────────────────

// C3 through F4 — one physical key per pitch
const WHITE_KEY_DEFS = [
  {note:"C",oct:3},{note:"D",oct:3},{note:"E",oct:3},{note:"F",oct:3},
  {note:"G",oct:3},{note:"A",oct:3},{note:"B",oct:3},
  {note:"C",oct:4},{note:"D",oct:4},{note:"E",oct:4},{note:"F",oct:4},
];
const BLACK_KEY_DEFS = [
  {note:"C#",oct:3,pos:0},{note:"Eb",oct:3,pos:1},
  {note:"F#",oct:3,pos:3},{note:"Ab",oct:3,pos:4},{note:"Bb",oct:3,pos:5},
  {note:"C#",oct:4,pos:7},{note:"Eb",oct:4,pos:8},{note:"F#",oct:4,pos:10},
];

function PianoKeyboard({ highlightedNotes }) {
  const [pressing, setPressing] = useState(null);
  // Dedupe: only highlight each note name once (first occurrence on keyboard wins)
  const highlightedOnce = [];
  const seenHL = new Set();
  for (const n of highlightedNotes) {
    if (!seenHL.has(n)) { seenHL.add(n); highlightedOnce.push(n); }
  }
  const isH = note => highlightedOnce.includes(note);

  const handleClick = (note, oct) => {
    if (!isH(note)) return;
    const id = `${note}-${oct}`;
    setPressing(id);
    playFreqs([noteFreqOct(note, oct)], "together");
    setTimeout(() => setPressing(null), 300);
  };

  const wStyle = (note, oct) => {
    const h = isH(note), pr = pressing === `${note}-${oct}`;
    return {
      width: 36, height: 120, border: "1px solid #c4a882", borderRadius: "0 0 6px 6px",
      background: pr ? "linear-gradient(180deg,#e8b800,#d09000)"
        : h ? "linear-gradient(180deg,#f5c842,#e8a800)"
        : "linear-gradient(180deg,#fdf8f0,#f0e8d8)",
      boxShadow: h ? "0 4px 12px rgba(245,200,66,0.6),inset 0 -2px 4px rgba(0,0,0,0.1)"
        : "inset 0 -2px 4px rgba(0,0,0,0.08)",
      display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 6,
      fontSize: 9, fontFamily: "'Cormorant Garamond',serif",
      color: h ? "#5a3800" : "#a0875c", fontWeight: 600,
      cursor: h ? "pointer" : "default",
      transition: "background 0.1s, transform 0.08s",
      transform: pr ? "scaleY(0.97) translateY(2px)" : "none",
      zIndex: 1, marginRight: 1, userSelect: "none",
    };
  };
  const bStyle = (note, oct) => {
    const h = isH(note), pr = pressing === `${note}-${oct}`;
    return {
      position: "absolute", width: 22, height: 72, borderRadius: "0 0 4px 4px", zIndex: 2,
      background: pr ? "linear-gradient(180deg,#e8a800,#c07000)"
        : h ? "linear-gradient(180deg,#c8930a,#a07000)"
        : "linear-gradient(180deg,#2a1f14,#1a1008)",
      boxShadow: h ? "0 2px 8px rgba(200,147,10,0.7)" : "0 3px 6px rgba(0,0,0,0.5)",
      display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 4,
      fontSize: 7, fontFamily: "'Cormorant Garamond',serif",
      color: h ? "#fff8e0" : "#6b5a3e",
      cursor: h ? "pointer" : "default",
      transition: "background 0.1s, transform 0.08s",
      transform: pr ? "scaleY(0.95) translateY(2px)" : "none",
      userSelect: "none",
    };
  };

  return (
    <div>
      {highlightedOnce.length > 0 && (
        <div style={{fontSize:11,color:"#7a6030",marginBottom:8,letterSpacing:"0.05em",fontStyle:"italic"}}>
          Click a highlighted key to hear it
        </div>
      )}
      <div style={{position:"relative",display:"flex",height:120}}>
        {WHITE_KEY_DEFS.map(({note,oct},i) => (
          <div key={`w${note}${oct}${i}`} style={wStyle(note,oct)} onClick={() => handleClick(note,oct)}>
            {isH(note) ? note : ""}
          </div>
        ))}
        {BLACK_KEY_DEFS.map(({note,oct,pos},i) => (
          <div key={`b${note}${oct}${i}`}
            style={{...bStyle(note,oct), left: pos*37+24, top: 0}}
            onClick={() => handleClick(note,oct)}>
            {isH(note) ? note : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── ChordChip ────────────────────────────────────────────────────────────────

function ChordChip({ chord }) {
  const [playing, setPlaying] = useState(false);
  const [hov, setHov] = useState(false);

  const handleClick = () => {
    if (playing) return;
    setPlaying(true);
    playChordByName(chord.name);
    setTimeout(() => setPlaying(false), 1800);
  };

  return (
    // Fixed min-width prevents layout shift on mobile when text changes ▶ → ♪
    <div style={{display:"inline-flex",flexDirection:"column",alignItems:"center",gap:3}}>
      {chord.numeral && (
        <span style={{
          fontSize:10, letterSpacing:"0.1em", fontStyle:"italic", lineHeight:1,
          fontFamily:"'Cormorant Garamond',serif", fontWeight:600,
          color: chord.featured ? "#c8940a" : "rgba(212,175,95,0.55)",
        }}>{chord.numeral}</span>
      )}
      <span
        onClick={handleClick}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        title={`Play ${chord.name}`}
        style={{
          // Fixed min-width so layout doesn't shift when icon swaps
          minWidth: 80,
          padding: "5px 14px",
          background: playing
            ? "linear-gradient(135deg,#f5e060,#c8900a)"
            : chord.featured
              ? (hov ? "linear-gradient(135deg,#f0d060,#b07010)" : "linear-gradient(135deg,#d4af5f,#9a6e20)")
              : (hov ? "rgba(212,175,95,0.22)" : "rgba(212,175,95,0.12)"),
          border: chord.featured ? "none" : "1px solid rgba(212,175,95,0.25)",
          borderRadius: 20, fontSize: 14, fontFamily: "'Cormorant Garamond',serif",
          fontWeight: chord.featured ? 700 : 400,
          color: chord.featured ? "#1a0e00" : playing ? "#1a0e00" : "#e8d4a0",
          letterSpacing: "0.03em", cursor: "pointer",
          transition: "background 0.15s ease, color 0.15s ease",
          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5,
          userSelect: "none", WebkitTapHighlightColor: "transparent",
        }}>
        {playing ? "♪" : "▶"} {chord.name}
      </span>
    </div>
  );
}

// ─── ProgressionCard ──────────────────────────────────────────────────────────

function ProgressionCard({ progression, index, isVisible, isFavorite, onToggleFav }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? "rgba(255,248,235,0.09)" : "rgba(255,248,235,0.05)",
        border: `1px solid ${hov ? "rgba(212,175,95,0.35)" : "rgba(212,175,95,0.18)"}`,
        borderRadius: 16, padding: "20px 24px", position: "relative",
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? "translateY(0)" : "translateY(20px)",
        transition: `opacity 0.5s ease ${index*0.12+0.3}s, transform 0.5s ease ${index*0.12+0.3}s, background 0.2s, border 0.2s`,
      }}>
      <button
        onClick={() => onToggleFav(index)}
        style={{
          position: "absolute", top: 14, right: 14, background: "none", border: "none",
          cursor: "pointer", fontSize: 20, lineHeight: 1, padding: 4, color: "#d4af5f",
          filter: isFavorite ? "none" : "grayscale(1) opacity(0.35)",
          transition: "filter 0.2s, transform 0.15s",
          transform: hov || isFavorite ? "scale(1.15)" : "scale(1)",
        }}>
        {isFavorite ? "★" : "☆"}
      </button>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14,paddingRight:36}}>
        <div style={{
          width:28,height:28,borderRadius:"50%",
          background:"linear-gradient(135deg,#d4af5f,#a07830)",
          display:"flex",alignItems:"center",justifyContent:"center",
          fontSize:13,fontWeight:700,color:"#1a0e00",fontFamily:"'Cormorant Garamond',serif",flexShrink:0,
        }}>{index+1}</div>
        <div style={{fontSize:11,fontFamily:"'Cormorant Garamond',serif",color:"#c4a060",letterSpacing:"0.12em",textTransform:"uppercase",fontWeight:600}}>
          {progression.name}
        </div>
      </div>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:12}}>
        {progression.chords.map((ch,ci) => <ChordChip key={ci} chord={ch}/>)}
      </div>
      <p style={{margin:0,fontSize:13.5,fontFamily:"'Cormorant Garamond',serif",color:"#b09060",lineHeight:1.6,fontStyle:"italic"}}>
        {progression.description}
      </p>
    </div>
  );
}

function LoadingDots() {
  return (
    <div style={{display:"flex",gap:8,justifyContent:"center",padding:"40px 0"}}>
      {[0,1,2].map(i => (
        <div key={i} style={{width:8,height:8,borderRadius:"50%",background:"#d4af5f",
          animation:`ldp 1.2s ease-in-out ${i*0.2}s infinite`}}/>
      ))}
      <style>{`@keyframes ldp{0%,80%,100%{opacity:.2;transform:scale(.8)}40%{opacity:1;transform:scale(1)}}`}</style>
    </div>
  );
}

// ─── Favorites Tab ────────────────────────────────────────────────────────────

function FavoritesView({ allFavorites, favoriteChords, onUnfavChord }) {
  const [subTab, setSubTab] = useState("progressions");

  return (
    <div style={{paddingTop:24}}>
      {/* Sub-tabs */}
      <div style={{display:"flex",gap:0,marginBottom:24,borderBottom:"1px solid rgba(212,175,95,0.1)"}}>
        {[["progressions","Progressions"],["chords","Chords ♪"]].map(([t,label]) => (
          <button key={t} onClick={() => setSubTab(t)} style={{
            background:"none",border:"none",padding:"10px 18px",cursor:"pointer",
            fontFamily:"'Cormorant Garamond',serif",fontSize:13,letterSpacing:"0.08em",
            color: subTab===t ? "#d4af5f" : "#5a4a28",
            borderBottom: subTab===t ? "2px solid #d4af5f" : "2px solid transparent",
            transition:"all 0.2s",
          }}>{label}</button>
        ))}
      </div>

      {subTab === "progressions" && (
        allFavorites.length === 0 ? (
          <div style={{textAlign:"center",padding:"48px 0",color:"#4a3820",fontStyle:"italic",fontSize:15}}>
            <div style={{fontSize:34,marginBottom:12,filter:"grayscale(1) opacity(0.4)"}}>★</div>
            No progressions saved yet.<br/>
            <span style={{fontSize:12,marginTop:8,display:"block",color:"#3a2a10"}}>
              Tap ☆ on any progression to save it here.
            </span>
          </div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {allFavorites.map(({dk, progression, chord:c}, i) => (
              <div key={`${dk}-${i}`}>
                {(i===0||allFavorites[i-1].dk!==dk) && (
                  <div style={{fontSize:11,letterSpacing:"0.12em",textTransform:"uppercase",
                    color:"#7a6030",marginBottom:8,paddingTop:i>0?16:0,
                    borderTop:i>0?"1px solid rgba(212,175,95,0.08)":"none"}}>
                    {formatDateKey(dk)} · {c.note} {c.type}
                  </div>
                )}
                <div style={{background:"rgba(255,248,235,0.05)",border:"1px solid rgba(212,175,95,0.16)",
                  borderRadius:14,padding:"16px 20px",marginBottom:4}}>
                  <div style={{fontSize:11,color:"#c4a060",letterSpacing:"0.12em",textTransform:"uppercase",fontWeight:600,marginBottom:10}}>
                    {progression.name}
                  </div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:7,marginBottom:9}}>
                    {progression.chords.map((ch,ci) => <ChordChip key={ci} chord={ch}/>)}
                  </div>
                  <p style={{margin:0,fontSize:13,color:"#b09060",fontStyle:"italic",lineHeight:1.55}}>
                    {progression.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {subTab === "chords" && (
        favoriteChords.length === 0 ? (
          <div style={{textAlign:"center",padding:"48px 0",color:"#4a3820",fontStyle:"italic",fontSize:15}}>
            <div style={{fontSize:34,marginBottom:12,filter:"grayscale(1) opacity(0.4)"}}>♪</div>
            No chords saved yet.<br/>
            <span style={{fontSize:12,marginTop:8,display:"block",color:"#3a2a10"}}>
              Tap ♡ next to any daily chord to save it here.
            </span>
          </div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {favoriteChords.map(({dk, note, type}, i) => (
              <div key={`chord-${dk}-${i}`} style={{
                background:"rgba(255,248,235,0.05)",border:"1px solid rgba(212,175,95,0.16)",
                borderRadius:14,padding:"16px 20px",
                display:"flex",justifyContent:"space-between",alignItems:"center",
              }}>
                <div>
                  <div style={{fontSize:11,color:"#7a6030",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:4}}>
                    {formatDateKey(dk)}
                  </div>
                  <div style={{fontFamily:"'Cormorant Garamond',serif"}}>
                    <span style={{fontSize:26,fontWeight:300,color:"#f5e4b0"}}>{note} </span>
                    <span style={{fontSize:14,color:"#c4a060",fontStyle:"italic"}}>{type}</span>
                  </div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <button
                    onClick={() => {
                      const notes = getChordNotes(note, type);
                      playChord(notes, "together", note);
                    }}
                    style={{background:"rgba(212,175,95,0.08)",border:"1px solid rgba(212,175,95,0.25)",
                      borderRadius:8,padding:"6px 12px",cursor:"pointer",color:"#d4af5f",
                      fontFamily:"'Cormorant Garamond',serif",fontSize:13}}>
                    ▶
                  </button>
                  <button
                    onClick={() => onUnfavChord(dk)}
                    style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:"#d4af5f",padding:4}}>
                    ★
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

// ─── Share Modal ──────────────────────────────────────────────────────────────

function ShareModal({ chord, onClose }) {
  const [copied, setCopied] = useState(false);
  const text = `🎹 Today's Piano Chord of the Day: ${chord.note} ${chord.type}\n\nLearn a new chord every day!`;
  const copy = () => navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  const platforms = [
    { label:"Twitter / X", icon:"𝕏", url:`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}` },
    { label:"Reddit", icon:"r/", url:`https://reddit.com/submit?title=${encodeURIComponent("Chord of the Day: "+chord.note+" "+chord.type)}&text=${encodeURIComponent(text)}` },
  ];
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:200,
      display:"flex",alignItems:"center",justifyContent:"center",padding:24}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#1a1005",border:"1px solid rgba(212,175,95,0.32)",
        borderRadius:22,padding:"28px 24px",maxWidth:380,width:"100%"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
          <div style={{fontSize:13,letterSpacing:"0.2em",textTransform:"uppercase",color:"#8a6a30",fontWeight:500}}>Share Today's Chord</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#5a4a28",fontSize:20,cursor:"pointer",padding:4}}>✕</button>
        </div>
        <div style={{background:"rgba(212,175,95,0.07)",border:"1px solid rgba(212,175,95,0.16)",borderRadius:14,padding:"14px 18px",marginBottom:16}}>
          <span style={{fontSize:28,fontWeight:300,color:"#f5e4b0",fontFamily:"'Cormorant Garamond',serif"}}>{chord.note} </span>
          <span style={{fontSize:15,color:"#c4a060",fontStyle:"italic",fontFamily:"'Cormorant Garamond',serif"}}>{chord.type}</span>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
          {platforms.map(p => (
            <a key={p.label} href={p.url} target="_blank" rel="noreferrer"
              style={{display:"flex",alignItems:"center",gap:12,padding:"10px 16px",
                background:"rgba(212,175,95,0.07)",border:"1px solid rgba(212,175,95,0.18)",
                borderRadius:10,textDecoration:"none",color:"#e8d4a0",
                fontFamily:"'Cormorant Garamond',serif",fontSize:14,cursor:"pointer"}}
              onMouseEnter={e=>e.currentTarget.style.background="rgba(212,175,95,0.15)"}
              onMouseLeave={e=>e.currentTarget.style.background="rgba(212,175,95,0.07)"}>
              <span style={{fontSize:12,fontWeight:700,width:22,textAlign:"center",color:"#d4af5f"}}>{p.icon}</span>
              {p.label}
            </a>
          ))}
        </div>
        <button onClick={copy} style={{width:"100%",padding:"10px 0",border:"1px solid rgba(212,175,95,0.28)",
          borderRadius:10,background:copied?"rgba(212,175,95,0.12)":"rgba(212,175,95,0.05)",
          color:copied?"#d4af5f":"#9a7e4a",fontFamily:"'Cormorant Garamond',serif",fontSize:14,cursor:"pointer"}}>
          {copied ? "✓ Copied!" : "Copy text"}
        </button>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const chord = getTodaysChord();
  // Deduplicated notes for piano display
  const chordNotes = getChordNotes(chord.note, chord.type, true);
  const today = dateKey();

  const [progressions, setProgressions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [chordInfo, setChordInfo] = useState(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  const [tab, setTab] = useState("today");
  const [isPlaying, setIsPlaying] = useState(false);
  const [playStyle, setPlayStyle] = useState("together");
  const [showShare, setShowShare] = useState(false);
  const [favorites, setFavorites] = useState({});       // progression favorites
  const [favoriteChords, setFavoriteChords] = useState([]); // chord favorites [{dk,note,type}]
  const [visitedDays, setVisitedDays] = useState([]);
  const [savedProgressions, setSavedProgressions] = useState({});
  const [todayChordFaved, setTodayChordFaved] = useState(false);
  const hasFetched = useRef(false);

  useEffect(() => {
    setTimeout(() => setVisible(true), 100);
    (async () => {
      const [favs, visits, saved, chordFavs] = await Promise.all([
        loadStorage("cotd-favorites"),
        loadStorage("cotd-visited"),
        loadStorage("cotd-saved-progs"),
        loadStorage("cotd-chord-favorites"),
      ]);
      if (favs) setFavorites(favs);
      if (saved) setSavedProgressions(saved);
      if (chordFavs) {
        setFavoriteChords(chordFavs);
        setTodayChordFaved(chordFavs.some(c => c.dk === today));
      }
      const v = visits || [];
      if (!v.includes(today)) {
        const next = [today, ...v].slice(0, 60);
        setVisitedDays(next); saveStorage("cotd-visited", next);
      } else setVisitedDays(v);
    })();
    fetchChordData();
  }, []);

  async function fetchChordData() {
    if (hasFetched.current) return;
    hasFetched.current = true;

    // Check if we already have today's progressions cached
    const cached = await loadStorage(`cotd-progs-${today}`);
    if (cached) {
      setProgressions(cached.progressions);
      setChordInfo(cached.info);
      setLoading(false); setInfoLoading(false);
      setSavedProgressions(prev => ({...prev, [today]: cached.progressions}));
      return;
    }

    setLoading(true); setInfoLoading(true);
    try {
      const [pRes, iRes] = await Promise.all([
        fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514", max_tokens: 1000,
            system: "You are a music theory expert. Return ONLY valid JSON, no markdown.",
            messages: [{ role: "user", content:
              `For the chord "${chord.note} ${chord.type}", generate exactly 3 chord progressions featuring it (different feels: jazz, pop, cinematic, blues, etc).\nReturn ONLY: {"progressions":[{"name":"style name","chords":[{"name":"chord name like Cmaj7 Am7 F G","numeral":"Roman numeral e.g. I ii IV V7 bVII","featured":true or false}],"description":"1 sentence"}]}`
            }],
          }),
        }),
        fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514", max_tokens: 400,
            system: "You are a music theory expert. Return ONLY valid JSON, no markdown.",
            messages: [{ role: "user", content:
              `For "${chord.note} ${chord.type}" return ONLY: {"character":"evocative 1-sentence sound description","notes":["C","E","G"],"tip":"1 beginner tip"}`
            }],
          }),
        }),
      ]);

      const pData = await pRes.json(), iData = await iRes.json();
      const clean = t => t.replace(/```json\n?|```/g, "").trim();
      const ex = str => { const s=str.indexOf("{"), e=str.lastIndexOf("}"); if(s===-1||e===-1) throw new Error("No JSON"); return JSON.parse(str.slice(s,e+1)); };
      const pText = pData.content?.map(c=>c.text||"").join("") || "";
      const iText = iData.content?.map(c=>c.text||"").join("") || "";
      const progs = ex(clean(pText)).progressions || [];
      let info = null;
      try { info = ex(clean(iText)); } catch {}

      setProgressions(Array.isArray(progs) ? progs : []);
      if (info) setChordInfo(info);

      // Cache today's progressions so they don't change on refresh
      saveStorage(`cotd-progs-${today}`, { progressions: progs, info });
      setSavedProgressions(prev => { const next = {...prev, [today]: progs}; saveStorage("cotd-saved-progs", next); return next; });

    } catch(e) {
      console.error("fetch error", e);
      setProgressions([{
        name: "Error — could not load progressions",
        chords: [{ name: e.message || "Unknown error", featured: true }],
        description: "Check that ANTHROPIC_API_KEY is set in Vercel → Settings → Environment Variables, then redeploy.",
      }]);
    } finally {
      setLoading(false); setInfoLoading(false);
    }
  }

  const handlePlayChord = () => {
    if (isPlaying) return;
    setIsPlaying(true);
    playChord(chordNotes, playStyle, chord.note);
    setTimeout(() => setIsPlaying(false), 2800);
  };

  const toggleFavorite = useCallback((idx) => {
    setFavorites(prev => {
      const existing = prev[today] || [];
      const next = existing.includes(idx) ? existing.filter(i=>i!==idx) : [...existing, idx];
      const updated = {...prev, [today]: next};
      saveStorage("cotd-favorites", updated);
      return updated;
    });
  }, [today]);

  const toggleChordFavorite = () => {
    setFavoriteChords(prev => {
      const already = prev.some(c => c.dk === today);
      const next = already
        ? prev.filter(c => c.dk !== today)
        : [...prev, { dk: today, note: chord.note, type: chord.type }];
      saveStorage("cotd-chord-favorites", next);
      setTodayChordFaved(!already);
      return next;
    });
  };

  const unfavChord = (dk) => {
    setFavoriteChords(prev => {
      const next = prev.filter(c => c.dk !== dk);
      saveStorage("cotd-chord-favorites", next);
      if (dk === today) setTodayChordFaved(false);
      return next;
    });
  };

  const todayFavs = favorites[today] || [];
  const allFavorites = Object.entries(favorites)
    .flatMap(([dk, idxs]) => {
      const progs = savedProgressions[dk]; if (!progs) return [];
      return idxs.map(i => progs[i] ? {dk, progression:progs[i], chord:getChordForSeed(seedFromDateKey(dk))} : null).filter(Boolean);
    }).sort((a,b) => b.dk.localeCompare(a.dk));

  const streak = (() => { let s=0, d=new Date(); while(visitedDays.includes(dateKey(d))){s++;d.setDate(d.getDate()-1);} return s; })();
  const todayStr = new Date().toLocaleDateString("en-US", {weekday:"long",month:"long",day:"numeric"});
  const favCount = allFavorites.length + favoriteChords.length;

  return (
    <div style={{minHeight:"100vh",background:"#0f0900",
      backgroundImage:"radial-gradient(ellipse 80% 60% at 50% -10%,rgba(180,120,20,0.18) 0%,transparent 70%)",
      fontFamily:"'Cormorant Garamond',Georgia,serif",color:"#e8d4a0",paddingBottom:60}}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,600&display=swap" rel="stylesheet"/>

      {/* Header */}
      <div style={{borderBottom:"1px solid rgba(212,175,95,0.15)",padding:"16px 24px",
        display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:20}}>🎹</span>
          <span style={{fontSize:15,fontWeight:600,letterSpacing:"0.15em",textTransform:"uppercase",color:"#d4af5f"}}>
            Chord of the Day
          </span>
          {streak > 0 && (
            <span style={{fontSize:12,color:"#c4a060",background:"rgba(212,175,95,0.1)",
              border:"1px solid rgba(212,175,95,0.2)",borderRadius:20,padding:"2px 10px"}}>
              🔥 {streak}-day streak
            </span>
          )}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:12,color:"#7a6040"}}>{todayStr}</span>
          <button onClick={() => setShowShare(true)}
            style={{background:"rgba(212,175,95,0.08)",border:"1px solid rgba(212,175,95,0.25)",
              borderRadius:10,padding:"7px 14px",cursor:"pointer",color:"#d4af5f",
              fontFamily:"'Cormorant Garamond',serif",fontSize:13,letterSpacing:"0.08em",
              display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:14}}>↗</span> Share
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{borderBottom:"1px solid rgba(212,175,95,0.1)",display:"flex",padding:"0 24px"}}>
        {[
          ["today","Today"],
          ["favorites", `Favorites${favCount > 0 ? " ★" : ""}`],
        ].map(([t,label]) => (
          <button key={t} onClick={() => setTab(t)} style={{
            background:"none",border:"none",padding:"13px 18px",cursor:"pointer",
            fontFamily:"'Cormorant Garamond',serif",fontSize:14,letterSpacing:"0.08em",
            color: tab===t ? "#d4af5f" : "#5a4a28",
            borderBottom: tab===t ? "2px solid #d4af5f" : "2px solid transparent",
            transition:"all 0.2s",
          }}>{label}</button>
        ))}
      </div>

      <div style={{maxWidth:680,margin:"0 auto",padding:"0 24px"}}>

        {/* ── TODAY ── */}
        {tab === "today" && (<>
          <div style={{textAlign:"center",padding:"44px 0 24px",
            opacity:visible?1:0,transform:visible?"translateY(0)":"translateY(-16px)",transition:"all 0.7s ease"}}>
            <div style={{fontSize:11,letterSpacing:"0.3em",textTransform:"uppercase",color:"#8a6a30",marginBottom:14,fontWeight:500}}>
              Today's Chord
            </div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:14,marginBottom:4}}>
              <h1 style={{fontSize:"clamp(54px,13vw,86px)",fontWeight:300,margin:0,color:"#f5e4b0",lineHeight:1}}>
                {chord.note}
              </h1>
              <button
                onClick={toggleChordFavorite}
                title={todayChordFaved ? "Remove from favorites" : "Save this chord"}
                style={{background:"none",border:"none",cursor:"pointer",fontSize:28,
                  color:"#d4af5f",padding:4,lineHeight:1,
                  filter:todayChordFaved?"none":"grayscale(1) opacity(0.4)",
                  transition:"filter 0.2s,transform 0.15s",
                  transform:todayChordFaved?"scale(1.1)":"scale(1)"}}>
                {todayChordFaved ? "♥" : "♡"}
              </button>
            </div>
            <h2 style={{fontSize:"clamp(17px,4.5vw,28px)",fontWeight:400,margin:"0 0 20px",color:"#c4a060",fontStyle:"italic",letterSpacing:"0.05em"}}>
              {chord.type}
            </h2>
            {!infoLoading && chordInfo?.character && (
              <p style={{fontSize:16,color:"#9a7e4a",fontStyle:"italic",maxWidth:400,margin:"0 auto",lineHeight:1.65}}>
                "{chordInfo.character}"
              </p>
            )}
          </div>

          <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:26,
            opacity:visible?1:0,transition:"opacity 0.6s ease 0.2s"}}>
            <div style={{flex:1,height:1,background:"linear-gradient(90deg,transparent,rgba(212,175,95,0.3))"}}/>
            <span style={{fontSize:14,color:"#7a5a20"}}>✦</span>
            <div style={{flex:1,height:1,background:"linear-gradient(90deg,rgba(212,175,95,0.3),transparent)"}}/>
          </div>

          {/* Piano card */}
          <div style={{background:"rgba(255,248,235,0.04)",border:"1px solid rgba(212,175,95,0.15)",
            borderRadius:20,padding:"22px 18px 20px",marginBottom:12,
            opacity:visible?1:0,transition:"opacity 0.6s ease 0.25s"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}>
              <div style={{fontSize:11,letterSpacing:"0.2em",textTransform:"uppercase",color:"#7a6030",fontWeight:500}}>
                Keyboard Diagram
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <select value={playStyle} onChange={e => setPlayStyle(e.target.value)}
                  style={{background:"rgba(212,175,95,0.07)",border:"1px solid rgba(212,175,95,0.2)",
                    borderRadius:8,color:"#c4a060",padding:"5px 10px",fontSize:12,
                    fontFamily:"'Cormorant Garamond',serif",cursor:"pointer"}}>
                  <option value="together">Together</option>
                  <option value="arpeggio">Arpeggio</option>
                </select>
                <button onClick={handlePlayChord} disabled={isPlaying}
                  style={{background:isPlaying?"linear-gradient(135deg,#d4af5f,#9a6e20)":"rgba(212,175,95,0.08)",
                    border:"1px solid rgba(212,175,95,0.25)",borderRadius:10,padding:"7px 16px",
                    cursor:isPlaying?"default":"pointer",display:"flex",alignItems:"center",gap:7,
                    color:isPlaying?"#1a0e00":"#d4af5f",fontFamily:"'Cormorant Garamond',serif",
                    fontSize:13,letterSpacing:"0.08em",transition:"all 0.2s"}}>
                  <span style={{fontSize:15}}>{isPlaying?"♪":"▶"}</span>
                  {isPlaying ? "Playing…" : "Play Chord"}
                </button>
              </div>
            </div>
            <div style={{overflowX:"auto",paddingBottom:4}}>
              <PianoKeyboard highlightedNotes={chordNotes}/>
            </div>
            <div style={{display:"flex",gap:8,marginTop:16,flexWrap:"wrap",alignItems:"center"}}>
              <span style={{fontSize:11,color:"#7a6030",letterSpacing:"0.1em",textTransform:"uppercase"}}>Notes:</span>
              {chordNotes.map((n,i) => (
                <span key={i} style={{padding:"3px 12px",background:"rgba(212,175,95,0.15)",
                  border:"1px solid rgba(212,175,95,0.3)",borderRadius:20,
                  fontSize:14,fontWeight:600,color:"#d4af5f",letterSpacing:"0.04em"}}>{n}</span>
              ))}
            </div>
            {chordInfo?.tip && (
              <div style={{marginTop:13,padding:"9px 14px",background:"rgba(212,175,95,0.05)",
                borderLeft:"2px solid rgba(212,175,95,0.4)",borderRadius:"0 8px 8px 0"}}>
                <span style={{fontSize:11,letterSpacing:"0.15em",textTransform:"uppercase",color:"#8a6a30"}}>💡 Tip  </span>
                <span style={{fontSize:13,color:"#b09060",fontStyle:"italic"}}>{chordInfo.tip}</span>
              </div>
            )}
          </div>

          {/* Progressions */}
          <div style={{marginTop:34}}>
            <div style={{fontSize:11,letterSpacing:"0.3em",textTransform:"uppercase",color:"#8a6a30",
              marginBottom:14,fontWeight:500,opacity:visible?1:0,transition:"opacity 0.6s ease 0.3s"}}>
              Chord Progressions · click ▶ to play · ☆ to save
            </div>
            {loading ? <LoadingDots/> : progressions ? (
              <div style={{display:"flex",flexDirection:"column",gap:11}}>
                {progressions.map((p,i) => (
                  <ProgressionCard key={i} progression={p} index={i} isVisible={visible}
                    isFavorite={todayFavs.includes(i)} onToggleFav={toggleFavorite}/>
                ))}
              </div>
            ) : null}
          </div>

          <div style={{textAlign:"center",marginTop:44,fontSize:12,color:"#4a3820",letterSpacing:"0.1em",
            opacity:visible?1:0,transition:"opacity 0.8s ease 0.8s"}}>
            A new chord awaits tomorrow ✦
          </div>
        </>)}

        {/* ── FAVORITES ── */}
        {tab === "favorites" && (
          <FavoritesView
            allFavorites={allFavorites}
            favoriteChords={favoriteChords}
            onUnfavChord={unfavChord}
          />
        )}
      </div>

      {showShare && <ShareModal chord={chord} onClose={() => setShowShare(false)}/>}
    </div>
  );
}

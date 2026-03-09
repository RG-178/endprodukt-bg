let seed = 20251110; // Abgabedatum: 10.11.2025
let titles;
let h1;
let canvas;
let seedValueEl;

function setup() {
    const container = document.getElementById("canvas-wrap");
    const rect = container ? container.getBoundingClientRect() : { width: window.innerWidth, height: window.innerHeight };
    const maxWidth = Math.max(0, Math.floor(window.innerWidth * 0.8));
    const maxHeight = Math.max(0, Math.floor(window.innerHeight * 0.8));
    const widthPx = Math.max(0, Math.min(rect.width, maxWidth));
    const heightPx = Math.max(0, Math.min(window.innerHeight - 120, maxHeight)); // Höhe begrenzt auf max 80% des Fensters
    const renderer = createCanvas(widthPx, heightPx); // Breite an parent anpassen, Höhe an Fenster
    renderer.parent("canvas-wrap");

    canvas = renderer.canvas;
    canvas.addEventListener("dblclick", () => {
        saveCanvas(`P-${seed}`,'png');
    });

    pixelDensity(6); // Pixel Dichte
    noLoop(); // Statisch
}

function windowResized(){
    resizeCanvasToParent();
}

function resizeCanvasToParent(){
    const container = document.getElementById("canvas-wrap");
    if (!container || !canvas) return;
    const rect = container.getBoundingClientRect();
    const maxWidth = Math.max(0, Math.floor(window.innerWidth * 0.8));
    const maxHeight = Math.max(0, Math.floor(window.innerHeight * 0.8));
    const w = Math.max(0, Math.min(rect.width, maxWidth));
    const h = Math.max(0, Math.min(window.innerHeight - 120, maxHeight));
    resizeCanvas(w, h);
    redraw();
}

function draw() {
    randomSeed(seed); // Zufall auf Seed fixieren
    noiseSeed(seed); // Perlin-Noise auf Seed fixieren
    background(0); // Hintergrund Schwarz #000

    // Grund-Säule in der Mitte
    push(); // Transform Zustände kapseln damit sich später nicht alles mitdreht
    translate(width/2, height/2); // Koordinatenursprung in die Mitte
    rotate(radians(random(-8,8))); // Leiche Gesamtdrehung -8 Grad bis 8 Grad damit es nicht zu orthogonal wird

    // Mehrere Layer mit unterschiedlichen Regeln
    const layers = 14; // 14 Layers insgesamt
    for (let i=0;i<layers;i++){
        push(); // abkapseln
        const dx = random(-width*0.18, width*0.18); // Zufällige seitliche Position
        const dy = map(i,0,layers-1, -height*0.35, height*0.35) + random(-10,10); // Zufällige vertikale Position
        translate(dx, dy); // Koordinatenursprung setzten
        rotate(radians(random(-20,20))); // Zufällige Rotation -20 Grad bis 20 Grad
        const w = random(width*0.25, width*0.55); // Zufällige Höhe
        const h = random(height*0.12, height*0.38); // Zufällige Breite

        // Farbpalette mit HSB, Hue-Saturation-Brightness + Alpha
        const hue = random(360);
        const sat = random(60,100);
        const bri = random(75,100);
        colorMode(HSB,360,100,100,100);
        const alpha = random(28,55); // transparenz

        // Abwechselnd Polygone und runde Schnitte
        if (random() < 0.5){
            // Variante A: Polygon
            fill(hue, sat, bri, alpha); // Fläche mit Farbe ausfüllen
            noStroke(); // Kein Rand
            polygon(0,0, w,h, int(random(4,7))); // Zeichnen Polygone mit 4-7 Ecken
            // Dünner weisser Rand
            stroke(0,0,100, 45); // Farbe
            strokeWeight(1); // Dicke
            noFill(); // Keine Füllung
            polygon(0,0, w*0.98, h*0.98, int(random(3,6))); // Polygone aus nur Rand mit 3-6 Ecken
        } else {
            // Variante B: Halbmond
            fill(hue, sat, bri, alpha); // Fläche mit Farbe ausfüllen
            noStroke(); // Kein Rand
            arcLike(0,0, w,h, random(TWO_PI), random(TWO_PI)); // Halbmond zeichnen
            // transparentes Rechteck darüber
            fill(0,0,100, 14); // Farbe
            rectMode(CENTER); // Zentriert
            rect(0,0, w*0.9, h*0.9); // 90% der Breite und Höhe
        }

        pop(); // Jeder Layer hat sein eigenes pop, damit der Rest nicht beeinflusst wird
    }

    // dünne Linien
    stroke(0,0,100, 70); // Farbe
    strokeWeight(1); // Dicke
    for (let i=0;i<6;i++){ // 6 Linien
        push(); // abkapseln
        rotate(radians(random(-40,40))); // drehen Zufällig -40 bis 40 Grad
        line(-width*0.45 + random(-20,20), random(-height*0.45, height*0.45), // Start Koordinaten
            width*0.45 + random(-20,20), random(-height*0.45, height*0.45)); // End Koordinaten
        pop(); // abkapseln
    }

    pop(); // abkapseln
}

// Hilfsfunktionen für Polygone
function polygon(cx, cy, w, h, sides){
    beginShape();
    for (let i=0; i<sides; i++){
        const a = TWO_PI * i / sides + random(-0.08,0.08);
        const rx = w/2 * (0.9 + random(-0.08,0.08));
        const ry = h/2 * (0.9 + random(-0.08,0.08));
        vertex(cx + cos(a)*rx, cy + sin(a)*ry);
    }
    endShape(CLOSE);
}

// Hilfsfunktion für Halbmond
function arcLike(cx, cy, w, h, a1, a2){
    const steps = 40;
    beginShape();
    for (let t=0; t<=steps; t++){
        const a = lerp(a1, a2, t/steps);
        vertex(cx + cos(a)*w/2, cy + sin(a)*h/2);
    }
    for (let t=steps; t>=0; t--){
        const a = lerp(a1, a2, t/steps);
        vertex(cx + cos(a)*w/2 * 0.6, cy + sin(a)*h/2 * 0.6 + 6);
    }
    endShape(CLOSE);
}

function myPrompt(message = "Bitte eingeben:", placeholder = "", title = "Eingabe") {
    return new Promise((resolve) => {
        const backdrop = document.getElementById("prompt-backdrop");
        const input = document.getElementById("prompt-input");
        const ok = document.getElementById("prompt-ok");
        const cancel = document.getElementById("prompt-cancel");
        const msgEl = document.getElementById("prompt-msg");
        const titleEl = document.getElementById("prompt-title");

        msgEl.textContent = message;
        titleEl.textContent = title;
        input.value = "";
        input.placeholder = placeholder;

        backdrop.setAttribute("aria-hidden", "false");

        const onKey = (e) => {
            if (e.key === "Escape") {
            cleanup();
            resolve(null);
            } else if (e.key === "Enter") {
            cleanup();
            resolve(input.value);
            }
        };

        const onOk = () => { cleanup(); resolve(input.value); };
        const onCancel = () => { cleanup(); resolve(null); };
        const onClickBackdrop = (e) => {
            if (e.target === backdrop) {
            cleanup(); resolve(null);
            }
        };

        function cleanup(){
            document.removeEventListener("keydown", onKey, true);
            ok.removeEventListener("click", onOk);
            cancel.removeEventListener("click", onCancel);
            backdrop.removeEventListener("click", onClickBackdrop);
            backdrop.setAttribute("aria-hidden", "true");
        }

        document.addEventListener("keydown", onKey, true);
        ok.addEventListener("click", onOk);
        cancel.addEventListener("click", onCancel);
        backdrop.addEventListener("click", onClickBackdrop);

        setTimeout(() => input.focus(), 0);
    });
}

function copyToClipboard(value = "") {
  if (!value) return;

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(value)
      .then(() => console.log("✅ Kopiert:", value))
      .catch(err => console.error("❌ Fehler beim Kopieren:", err));
  } else {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    try {
      document.execCommand("copy");
      console.log("✅ Kopiert (Fallback):", value);
    } catch (err) {
      console.error("❌ Fehler beim Fallback-Kopieren:", err);
    } finally {
      document.body.removeChild(textarea);
    }
  }
}

function updateTitle() {
    titles = document.querySelectorAll(".title");
    titles.forEach(title => {
        title.innerText = `P-${seed}`;
    });
    if (seedValueEl) {
        seedValueEl.textContent = seed;
    }
}

async function promptSeed() {
    const result = await myPrompt(`Gib den neuen Seed ein!`, "z.B. 1234", "Neuer Seed");
    if (result !== null && result !== "") {
        seed = result;
        redraw();
        updateTitle();
    }
}

window.addEventListener("resize", windowResized);

document.addEventListener("keydown", async (e) => {
    const key = e.key.toLowerCase();
    if (key === "k") {
        await promptSeed();
    } else if (key === "s") {
        saveCanvas(`P-${seed}`,'png');
    }
});

document.addEventListener("DOMContentLoaded", () => {
    seedValueEl = document.getElementById("seed-value");
    updateTitle();
    h1 = document.querySelector("h1.title");
    h1.addEventListener("dblclick", () => {
        const value = `P-${seed}`;
        copyToClipboard(value);
    });

    const seedBtn = document.getElementById("btn-seed");
    const saveBtn = document.getElementById("btn-save");
    const copyBtn = document.getElementById("btn-copy");

    if (seedBtn) seedBtn.addEventListener("click", promptSeed);
    if (saveBtn) saveBtn.addEventListener("click", () => saveCanvas(`P-${seed}`,'png'));
    if (copyBtn) copyBtn.addEventListener("click", () => copyToClipboard(`P-${seed}`));
});

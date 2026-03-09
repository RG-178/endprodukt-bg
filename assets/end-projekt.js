(() => {
    const KEY_INTERVAL_MS = 10000;
    const SAMPLE_EVERY_MS = 80;
    const CURSOR_HIDE_DELAY_MS = 1800;

    const statusEl = document.getElementById("mic-status");
    const dotEl = document.getElementById("mic-dot");
    const keyEl = document.getElementById("mic-key");
    const seedEl = document.getElementById("seed-value");
    const lastUpdateEl = document.getElementById("last-update");
    const saveBtn = document.getElementById("btn-save");
    const fullscreenBtn = document.getElementById("btn-fullscreen");
    const fullscreenTarget = document.getElementById("presentation-root");
    const enableMicBtn = document.getElementById("btn-enable-mic");
    const overlay = document.getElementById("mic-overlay");
    const overlayBtn = document.getElementById("mic-overlay-btn");
    const overlayCancelBtn = document.getElementById("mic-overlay-cancel");

    let audioCtx = null;
    let stream = null;
    let analyser = null;
    let frameTimer = null;
    let keyTimer = null;
    let frames = [];
    let lastKeyAt = 0;
    let currentKey = null;
    let currentSeed = 1291970663;
    let p5Ready = false;
    let sketch = null;
    let cursorHideTimer = null;

    function setUiState(state, message) {
        const states = {
            ok: { color: "#22c55e", glow: "rgba(34, 197, 94, 0.2)" },
            warn: { color: "#f59e0b", glow: "rgba(245, 158, 11, 0.2)" },
            bad: { color: "#ef4444", glow: "rgba(239, 68, 68, 0.2)" }
        };
        const current = states[state] || states.warn;

        if (statusEl) statusEl.textContent = message;
        if (dotEl) {
            dotEl.style.background = current.color;
            dotEl.style.boxShadow = `0 0 0 3px ${current.glow}`;
        }
    }

    function nowText() {
        return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    }

    function showOverlay(show) {
        if (!overlay) return;
        overlay.setAttribute("aria-hidden", show ? "false" : "true");
    }

    function getFullscreenElement() {
        return document.fullscreenElement
            || document.webkitFullscreenElement
            || document.mozFullScreenElement
            || document.msFullscreenElement
            || null;
    }

    function hasFullscreenSupportFor(el) {
        if (!el) return false;
        return typeof el.requestFullscreen === "function"
            || typeof el.webkitRequestFullscreen === "function"
            || typeof el.webkitRequestFullScreen === "function"
            || typeof el.mozRequestFullScreen === "function"
            || typeof el.msRequestFullscreen === "function";
    }

    async function requestElementFullscreen(el) {
        if (!el) return;
        if (typeof el.requestFullscreen === "function") {
            await el.requestFullscreen();
            return;
        }
        if (typeof el.webkitRequestFullscreen === "function") {
            el.webkitRequestFullscreen();
            return;
        }
        if (typeof el.webkitRequestFullScreen === "function") {
            el.webkitRequestFullScreen();
            return;
        }
        if (typeof el.mozRequestFullScreen === "function") {
            el.mozRequestFullScreen();
            return;
        }
        if (typeof el.msRequestFullscreen === "function") {
            el.msRequestFullscreen();
        }
    }

    async function exitAnyFullscreen() {
        if (typeof document.exitFullscreen === "function") {
            await document.exitFullscreen();
            return;
        }
        if (typeof document.webkitExitFullscreen === "function") {
            document.webkitExitFullscreen();
            return;
        }
        if (typeof document.mozCancelFullScreen === "function") {
            document.mozCancelFullScreen();
            return;
        }
        if (typeof document.msExitFullscreen === "function") {
            document.msExitFullscreen();
        }
    }

    function isFullscreenActive() {
        return getFullscreenElement() === fullscreenTarget;
    }

    function clearCursorHideTimer() {
        if (cursorHideTimer) {
            clearTimeout(cursorHideTimer);
            cursorHideTimer = null;
        }
    }

    function showCursor() {
        if (!fullscreenTarget) return;
        fullscreenTarget.classList.remove("ep-cursor-hidden");
    }

    function scheduleCursorHide() {
        if (!fullscreenTarget || !isFullscreenActive()) return;

        clearCursorHideTimer();
        cursorHideTimer = setTimeout(() => {
            if (isFullscreenActive()) {
                fullscreenTarget.classList.add("ep-cursor-hidden");
            }
        }, CURSOR_HIDE_DELAY_MS);
    }

    function onPointerActivity() {
        if (!isFullscreenActive()) return;
        showCursor();
        scheduleCursorHide();
    }

    function updateFullscreenUi() {
        const active = isFullscreenActive();

        if (fullscreenBtn) {
            fullscreenBtn.textContent = active ? "Fullscreen verlassen" : "Fullscreen anzeigen";
        }
    }

    async function toggleFullscreen() {
        if (!fullscreenTarget) return;
        if (!hasFullscreenSupportFor(fullscreenTarget)) {
            setUiState("warn", "fullscreen not supported");
            return;
        }

        try {
            if (isFullscreenActive()) {
                await exitAnyFullscreen();
            } else {
                await requestElementFullscreen(fullscreenTarget);
            }
        } catch (error) {
            const reason = error && error.name ? String(error.name) : "blocked";
            setUiState("warn", `fullscreen blocked (${reason})`);
        }
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function quantize(value, steps, min, max) {
        const t = (clamp(value, min, max) - min) / (max - min);
        return Math.round(t * (steps - 1));
    }

    function averageFrames(frames) {
        if (!frames.length) return null;
        const out = new Float32Array(frames[0].length);
        for (const f of frames) for (let i = 0; i < out.length; i++) out[i] += f[i];
        for (let i = 0; i < out.length; i++) out[i] /= frames.length;
        return out;
    }

    function spectrumToVector(avgDbSpectrum, sampleRate) {
        const N = avgDbSpectrum.length;
        const nyquist = sampleRate / 2;

        // dB -> linear amplitude
        const amps = new Float32Array(N);
        let sum = 1e-12;
        for (let i = 0; i < N; i++) {
            const a = Math.pow(10, avgDbSpectrum[i] / 20);
            amps[i] = a;
            sum += a;
        }

        // 16 log-Bänder
        const BANDS = 16;
        const bands = new Array(BANDS).fill(0);
        for (let i = 0; i < N; i++) {
            const f = (i / N) * nyquist;
            const t = Math.log1p(f) / Math.log1p(nyquist);
            const band = Math.min(BANDS - 1, Math.floor(t * BANDS));
            bands[band] += amps[i];
        }

        // normalize + quantize (rawer, wie Test)
        return bands.map(b => {
            const normalized = b / sum;
            return quantize(normalized, 24, 0, 0.25);
        });
    }

    function vectorToKey(vector) {
        return vector.map(v => v.toString(36)).join("");
    }

    function hashKeyToSeed(key) {
        let hash = 2166136261 >>> 0;

        for (let i = 0; i < key.length; i++) {
            hash ^= key.charCodeAt(i);
            hash = Math.imul(hash, 16777619) >>> 0;
        }

        return hash >>> 0;
    }

    async function stopPipeline() {
        if (frameTimer) clearInterval(frameTimer);
        if (keyTimer) clearInterval(keyTimer);

        frameTimer = null;
        keyTimer = null;
        frames = [];

        if (stream) {
            stream.getTracks().forEach((track) => track.stop());
            stream = null;
        }

        if (audioCtx) {
            await audioCtx.close();
            audioCtx = null;
        }

        analyser = null;
    }

    function applyKey(key, vector) {
        currentKey = key;
        currentSeed = hashKeyToSeed(key);

        if (keyEl) keyEl.textContent = key;
        if (seedEl) seedEl.textContent = String(currentSeed);

        lastKeyAt = Date.now();

        if (lastUpdateEl) {
            lastUpdateEl.textContent = nowText();
        }

        if (p5Ready && sketch) {
            sketch.redraw();
        }
    }

    async function startPipeline() {
        setUiState("warn", "initializing...");

        try {
            stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                }
            });
        } catch (_error) {
            showOverlay(true);
            setUiState("warn", "waiting for permission...");
            throw _error;
        }

        showOverlay(false);

        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === "suspended") {
            try {
                await audioCtx.resume();
            } catch (_error) {}
        }

        const source = audioCtx.createMediaStreamSource(stream);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0;
        source.connect(analyser);

        const frequencyBuffer = new Float32Array(analyser.frequencyBinCount);

        frameTimer = setInterval(() => {
            if (!analyser) return;

            analyser.getFloatFrequencyData(frequencyBuffer);
            frames.push(new Float32Array(frequencyBuffer));

            const maxFrames = Math.ceil(KEY_INTERVAL_MS / SAMPLE_EVERY_MS) + 4;
            if (frames.length > maxFrames) frames.shift();
        }, SAMPLE_EVERY_MS);

        keyTimer = setInterval(() => {
            const avgSpectrum = averageFrames(frames);
            if (!avgSpectrum || !audioCtx) return;

            const vector = spectrumToVector(avgSpectrum, audioCtx.sampleRate);
            const key = vectorToKey(vector);

            // applyKey erwartet (key, vector) -> lassen wir so
            applyKey(key, vector);

            setUiState("ok", "listening");
        }, KEY_INTERVAL_MS);

        setUiState("ok", "listening");
    }

    async function recover(reason) {
        setUiState("warn", `restarting... (${reason})`);

        try {
            await stopPipeline();
        } catch (_error) {}

        await new Promise((resolve) => setTimeout(resolve, 250));

        try {
            await startPipeline();
            setUiState("ok", "listening");
        } catch (_error) {
            setUiState("warn", "waiting for permission...");
        }
    }

    function initSketch() {
        const wrap = document.getElementById("canvas-wrap");
        if (!wrap) return;

        sketch = new p5((p) => {
            let cnv;

            function resizeCanvasToWrap() {
                const rect = wrap.getBoundingClientRect();
                const width = Math.max(10, Math.floor(rect.width));
                const height = Math.max(10, Math.floor(rect.height));

                if (!cnv) {
                    cnv = p.createCanvas(width, height);
                    cnv.parent("canvas-wrap");
                    if (saveBtn) {
                        saveBtn.addEventListener("click", () => p.saveCanvas(`mic-key-${currentSeed}`, "png"));
                    }
                } else {
                    p.resizeCanvas(width, height);
                }
            }

            p.setup = () => {
                resizeCanvasToWrap();
                p.noLoop();
                p.pixelDensity(Math.min(2, window.devicePixelRatio || 1));
                p.colorMode(p.HSB, 360, 100, 100, 100);
                p5Ready = true;
                if (seedEl) seedEl.textContent = String(currentSeed);
                p.redraw();
            };

            p.windowResized = () => {
                resizeCanvasToWrap();
                p.redraw();
            };

            p.draw = () => {
                p.randomSeed(currentSeed);
                p.noiseSeed(currentSeed);

                const w = p.width;
                const h = p.height;

                p.background(222, 45, 7);

                for (let i = 0; i < 8; i++) {
                    const hue = (currentSeed + i * 37) % 360;
                    p.noStroke();
                    p.fill(hue, 70, 95, 14);
                    const x = p.random(-w * 0.2, w * 1.2);
                    const y = p.random(-h * 0.2, h * 1.2);
                    const rw = p.random(w * 0.2, w * 0.9);
                    const rh = p.random(h * 0.15, h * 0.55);
                    p.push();
                    p.translate(x, y);
                    p.rotate(p.random(-0.9, 0.9));
                    p.rectMode(p.CENTER);
                    p.rect(0, 0, rw, rh, p.random(6, 26));
                    p.pop();
                }

                p.stroke(0, 0, 100, 35);
                p.strokeWeight(1.2);
                for (let i = 0; i < 12; i++) {
                    p.push();
                    p.translate(w * 0.5, h * 0.5);
                    p.rotate(p.random(-0.6, 0.6));
                    p.beginShape();
                    for (let x = -w * 0.55; x <= w * 0.55; x += 12) {
                        const noiseY = p.noise(i * 0.13, x * 0.004) * h * 0.6 - h * 0.3;
                        p.vertex(x, noiseY);
                    }
                    p.endShape();
                    p.pop();
                }

                for (let i = 0; i < 140; i++) {
                    const hue = (currentSeed * 0.1 + i * 3) % 360;
                    p.noStroke();
                    p.fill(hue, 80, 95, 22);
                    const px = p.random(w);
                    const py = p.random(h);
                    const size = Math.abs(p.randomGaussian()) * 7 + 1;
                    p.circle(px, py, size);
                }

                p.noStroke();
                p.fill(0, 0, 98, 88);
                p.rectMode(p.CORNER);
                p.rect(14, 14, 250, 52, 8);
                p.fill(210, 40, 12, 100);
                p.textFont("Space Grotesk");
                p.textSize(13);
                p.text(`key: ${currentKey || "-"}`, 22, 36);
                p.text(`seed: ${currentSeed}`, 22, 54);
            };
        });
    }

    if (overlayBtn) {
        overlayBtn.addEventListener("click", async () => {
            await recover("user gesture");
        });
    }

    if (overlayCancelBtn) {
        overlayCancelBtn.addEventListener("click", () => {
            showOverlay(false);
        });
    }

    if (enableMicBtn) {
        enableMicBtn.addEventListener("click", async () => {
            await recover("manual");
        });
    }

    if (fullscreenBtn) {
        fullscreenBtn.addEventListener("click", async () => {
            await toggleFullscreen();
        });
    }

    function onFullscreenChanged() {
        updateFullscreenUi();
        window.dispatchEvent(new Event("resize"));

        if (isFullscreenActive()) {
            scheduleCursorHide();
        } else {
            clearCursorHideTimer();
            showCursor();
        }
    }

    document.addEventListener("fullscreenchange", onFullscreenChanged);
    document.addEventListener("webkitfullscreenchange", onFullscreenChanged);
    document.addEventListener("mozfullscreenchange", onFullscreenChanged);
    document.addEventListener("MSFullscreenChange", onFullscreenChanged);

    document.addEventListener("keydown", (event) => {
        const key = event.key.toLowerCase();

        if ((event.ctrlKey || event.metaKey) && event.shiftKey && key === "f") {
            event.preventDefault();
            toggleFullscreen();
            return;
        }
        if (event.altKey && key === "enter") {
            event.preventDefault();
            toggleFullscreen();
            return;
        }

        if (key === "s" && saveBtn) {
            saveBtn.click();
        }
    });

    if (fullscreenTarget) {
        fullscreenTarget.addEventListener("mousemove", onPointerActivity);
        fullscreenTarget.addEventListener("mouseenter", onPointerActivity);
        fullscreenTarget.addEventListener("mouseleave", () => {
            clearCursorHideTimer();
            showCursor();
        });
        fullscreenTarget.addEventListener("pointerdown", onPointerActivity);
    }

    setInterval(() => {
        if (lastKeyAt && Date.now() - lastKeyAt > KEY_INTERVAL_MS * 2 + 3000) {
            recover("stalled key timer");
            return;
        }

        if (audioCtx && audioCtx.state === "suspended") {
            recover("audio suspended");
            return;
        }

        if (stream && stream.getTracks().every((track) => track.readyState !== "live")) {
            recover("stream ended");
        }
    }, 2000);

    initSketch();
    updateFullscreenUi();

    (async () => {
        try {
            await startPipeline();
        } catch (_error) {
            showOverlay(true);
        }
    })();
})();

(function () {
  if (window.Scanner) return;

  // ---------- ELEMENTOS ----------
  const el = id => document.getElementById(id);
  const overlayEl = () => el("scanFS") || document.querySelector(".scanfs");
  const videoEl = () => el("scanFSVideo") || (overlayEl() && overlayEl().querySelector("video"));

  // ---------- VARIÁVEIS ----------
  let backend = null;
  let detectorInterval = null;
  let running = false;
  let onScanCallback = null;
  let scanLocked = false;

  // ---------- FECHAR ----------
  async function stop() {
    try {
      if (backend && typeof backend.reset === "function") backend.reset();
    } catch (_) {}
    backend = null;

    if (detectorInterval) {
      clearInterval(detectorInterval);
      detectorInterval = null;
    }

    try {
      const v = videoEl();
      if (v && v.srcObject) {
        v.srcObject.getTracks().forEach(t => t.stop());
        v.srcObject = null;
      }
      v?.pause?.();
    } catch (_) {}

    const ov = overlayEl();
    if (ov) {
      ov.classList.remove("show");
      try {
        ov.style.display = "none";
        ov.removeAttribute("tabindex");
      } catch (_) {}
    }

    running = false;
    scanLocked = false;
  }

  // ---------- ABRIR ----------
  async function open(options = {}) {
    if (running) return;
    const cfg = Object.assign(
      {
        onScan: null,
        closeOnEsc: true,
        closeOnBackdrop: true,
      },
      options
    );

    onScanCallback = typeof cfg.onScan === "function" ? cfg.onScan : null;
    const ov = overlayEl();
    const v = videoEl();
    if (!ov || !v) throw new Error("Scanner overlay/video not found in DOM");

    ov.classList.add("show");
    ov.style.display = "block";
    ov.setAttribute("tabindex", "-1");
    running = true;

    // tecla ESC fecha
    if (cfg.closeOnEsc) {
      document.addEventListener("keydown", e => {
        if ((e.key === "Escape" || e.key === "Esc") && overlayEl()?.classList.contains("show")) stop();
      });
    }

    // click fora do vídeo fecha
    if (cfg.closeOnBackdrop) {
      ov.addEventListener("click", ev => {
        if (ev.target === ov) stop();
      });
    }

    try {
      v.muted = true;
      v.playsInline = true;
      v.autoplay = true;
    } catch (_) {}

    const ZX = window.ZXingBrowser || window.ZXing || window.ZXingJs || null;

    // ---------- ZXing backend ----------
    if (ZX && (ZX.BrowserMultiFormatReader || ZX.BrowserQRCodeReader || ZX.BrowserBarcodeReader)) {
      try {
        const Reader =
          ZX.BrowserMultiFormatReader || ZX.BrowserQRCodeReader || ZX.BrowserBarcodeReader;
        backend = new Reader();
        backend.decodeFromVideoDevice(undefined, v, (result, err) => {
          if (scanLocked) return;
          if (result && (result.getText || result.text)) {
            const txt = result.getText ? result.getText() : result.text || "";
            scanLocked = true;
            if (onScanCallback) onScanCallback(String(txt || ""));
            // 🔹 Mantém a câmera ativa (modo contínuo)
            setTimeout(() => {
              scanLocked = false;
            }, 800);
          }
        });
        return;
      } catch (e) {
        console.warn("Scanner: ZXing backend failed, fallback to BarcodeDetector", e);
        backend = null;
      }
    }

    // ---------- Fallback: BarcodeDetector ----------
    if (window.BarcodeDetector) {
      try {
        const formats = [
          "qr_code",
          "ean_13",
          "ean_8",
          "code_128",
          "code_39",
          "itf",
          "upc_a",
          "upc_e",
        ];
        const detector = new BarcodeDetector({ formats });

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });

        v.srcObject = stream;
        await v.play();

        detectorInterval = setInterval(async () => {
          if (scanLocked) return;
          try {
            const barcodes = await detector.detect(v);
            if (barcodes && barcodes.length) {
              const raw = barcodes[0].rawValue || barcodes[0].rawtext || "";
              scanLocked = true;
              if (onScanCallback) onScanCallback(String(raw || ""));
              // 🔹 Mantém o scanner aberto, sem parar o vídeo
              setTimeout(() => {
                scanLocked = false;
              }, 800);
            }
          } catch (_) {}
        }, 180);

        return;
      } catch (e) {
        console.warn("Scanner: BarcodeDetector init failed", e);
      }
    }

    await stop();
    throw new Error("No supported scanner backend found");
  }

  // ---------- CLICK FORA FECHA ----------
  document.addEventListener("click", ev => {
    const ov = overlayEl();
    if (!ov) return;
    if (ev.target === ov) stop();
  });

  // ---------- BLOQUEIA SAÍDA ACIDENTAL ----------
  window.addEventListener("popstate", e => {
    const ov = overlayEl();
    if (ov && ov.classList.contains("show")) {
      e.preventDefault();
      stop();
      history.pushState(null, "", location.href);
    }
  });

  window.addEventListener("keydown", e => {
    if ((e.key === "Escape" || e.key === "Backspace") && overlayEl()?.classList?.contains("show")) {
      e.preventDefault();
      stop();
    }
  });

  // ---------- API ----------
  window.Scanner = {
    open,
    close: stop,
  };
})();

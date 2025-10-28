(function () {
  if (window.Scanner) return;

  // ---------- ELEMENTOS ----------
  const el = id => document.getElementById(id);
  const overlayEl = () => el('scanFS') || document.querySelector('.scanfs');
  const videoEl   = () => el('scanFSVideo') || (overlayEl() && overlayEl().querySelector('video'));

  // ---------- VARIÁVEIS ----------
  let backend = null;
  let detectorInterval = null;
  let running = false;
  let onScanCallback = null;
  let _keydownHandler = null;
  let _backBtnHandler = null;
  let scanLocked = false;

  // ---------- FUNÇÃO DE SEGURANÇA ----------
  function safeStopStream(s) {
    try {
      if (!s) return;
      if (typeof s.getTracks === 'function') {
        s.getTracks().forEach(t => { try { t.stop(); } catch (_) {} });
        return;
      }
      if (Array.isArray(s)) s.forEach(t => { try { if (t && typeof t.stop === 'function') t.stop(); } catch (_) {} });
      if (s && typeof s.stop === 'function') s.stop();
    } catch (_) {}
  }

  // ---------- FECHAR SCANNER (manual) ----------
  async function stop() {
    try { if (backend && typeof backend.reset === 'function') backend.reset(); } catch (_) {}
    backend = null;

    if (detectorInterval) { clearInterval(detectorInterval); detectorInterval = null; }

    try { if (_keydownHandler) { document.removeEventListener('keydown', _keydownHandler); _keydownHandler = null; } } catch (_) {}
    try {
      const ov = overlayEl();
      const back = ov && ov.querySelector && ov.querySelector('#scanFSBack');
      if (back && _backBtnHandler) { back.removeEventListener('click', _backBtnHandler); _backBtnHandler = null; }
    } catch (_) {}

    try {
      const v = videoEl();
      if (v && v.srcObject) safeStopStream(v.srcObject);
      if (v) { v.pause(); v.srcObject = null; }
    } catch (_) {}

    const ov = overlayEl();
    if (ov) {
      ov.classList.remove('show');
      try { ov.style.display = 'none'; } catch (_) {}
      try { ov.removeAttribute('tabindex'); } catch (_) {}
    }

    running = false;
    scanLocked = false;
  }

  // ---------- ABRIR SCANNER ----------
  async function open(options = {}) {
    if (running) return;
    const cfg = Object.assign({
      onScan: null,
      autoClose: false, // 🚫 não fechar automaticamente
      closeOnEsc: true,
      closeOnBackdrop: true,
      closeOnBackBtn: true
    }, options);

    onScanCallback = typeof cfg.onScan === 'function' ? cfg.onScan : null;

    const ov = overlayEl();
    const v = videoEl();
    if (!ov || !v) throw new Error('Scanner overlay/video não encontrado no DOM');

    // Exibe overlay
    ov.classList.add('show');
    try { ov.style.display = 'block'; } catch (_) {}
    try { ov.setAttribute('tabindex', '-1'); ov.focus(); } catch (_) {}
    running = true;

    // tecla ESC fecha
    if (cfg.closeOnEsc) {
      try {
        _keydownHandler = function (e) {
          if (e && (e.key === 'Escape' || e.key === 'Esc')) {
            const o = overlayEl();
            if (o && o.classList.contains('show')) stop();
          }
        };
        document.addEventListener('keydown', _keydownHandler);
      } catch (_) {}
    }

    // botão "voltar"
    if (cfg.closeOnBackBtn) {
      try {
        const backBtn = ov.querySelector && ov.querySelector('#scanFSBack');
        if (backBtn) {
          _backBtnHandler = function (ev) { ev.preventDefault(); stop(); };
          backBtn.addEventListener('click', _backBtnHandler);
        }
      } catch (_) {}
    }

    // click fora do vídeo fecha
    if (cfg.closeOnBackdrop) {
      try {
        ov.addEventListener('click', function (ev) { if (ev.target === ov) stop(); });
      } catch (_) {}
    }

    try { v.muted = true; v.playsInline = true; v.autoplay = true; } catch (_) {}

    const ZX = window.ZXingBrowser || window.ZXing || window.ZXingJs || null;

    // ---------- ZXing (mantém câmera ativa) ----------
    if (ZX && (ZX.BrowserMultiFormatReader || ZX.BrowserQRCodeReader || ZX.BrowserBarcodeReader)) {
      try {
        const Reader = ZX.BrowserMultiFormatReader || ZX.BrowserQRCodeReader || ZX.BrowserBarcodeReader;
        backend = new Reader();

        backend.decodeFromVideoDevice(undefined, v, (result, err) => {
          if (scanLocked) return;
          if (result && (result.getText || result.text)) {
            const txt = result.getText ? result.getText() : (result.text || '');
            scanLocked = true;
            if (onScanCallback) onScanCallback(String(txt || ''));
            setTimeout(() => { scanLocked = false; }, 500);
          }

          // 🔁 mantém stream ativo (corrige Android/iPhone)
          if (v && v.srcObject && v.paused) {
            v.play().catch(() => {});
          }
          requestAnimationFrame(() => {
            if (running && v && v.srcObject) v.play().catch(()=>{});
          });
        });
        return;
      } catch (e) {
        console.warn('Scanner: ZXing backend falhou, tentando fallback', e);
        try { if (backend && typeof backend.reset === 'function') backend.reset(); } catch (_) {}
        backend = null;
      }
    }

    // ---------- Fallback: BarcodeDetector (mantém vídeo ativo) ----------
    if (window.BarcodeDetector) {
      try {
        const formats = ['qr_code', 'ean_13', 'ean_8', 'code_128', 'code_39', 'itf', 'upc_a', 'upc_e'];
        const detector = new BarcodeDetector({ formats });

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false
        });
        v.srcObject = stream;
        await v.play();

        detectorInterval = setInterval(async () => {
          if (scanLocked) return;
          try {
            const barcodes = await detector.detect(v);
            if (barcodes && barcodes.length) {
              const raw = barcodes[0].rawValue || barcodes[0].rawtext || '';
              scanLocked = true;
              if (onScanCallback) onScanCallback(String(raw || ''));
              setTimeout(() => { scanLocked = false; }, 500);
            }
          } catch (err) {
            // 🔁 garante que o vídeo nunca pare
            if (v && v.srcObject && v.paused) v.play().catch(()=>{});
          }
        }, 140);
        return;
      } catch (e) {
        console.warn('Scanner: BarcodeDetector init falhou', e);
      }
    }

    await stop();
    throw new Error('Nenhum backend de scanner suportado');
  }

  // ---------- CLIQUE FORA OU ESC FECHA ----------
  document.addEventListener('click', function (ev) {
    const ov = overlayEl();
    if (!ov) return;
    if (ev.target && (ev.target.id === 'scanFSBack' || ev.target.classList.contains('scan-close'))) stop();
    if (ev.target === ov) stop();
  });

  // ---------- EXPÕE API ----------
  window.Scanner = { open, close: stop };
})();

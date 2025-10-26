(function(){
  if (window.Scanner) return;

  const STORAGE_KEY = 'scan_packages';
  const el = id => document.getElementById(id);
  const overlayEl = () => el('scanFS') || el('scanOverlay') || document.querySelector('.scanfs');
  const videoEl = () => el('scanFSVideo') || el('scanVideo') || (overlayEl() && overlayEl().querySelector('video'));
  const countEl = () => el('scan-packages-count') || el('scanFSCount') || el('scanFSCount') ;

  let backend = null;
  let detectorInterval = null;
  let running = false;
  let onScanCallback = null;
  let _keydownHandler = null;
  let _backBtnHandler = null;

  function safeStopStream(s){
    try {
      if (!s) return;
      if (typeof s.getTracks === 'function') {
        s.getTracks().forEach(t => { try{ t.stop(); }catch(_){} });
        return;
      }
      if (Array.isArray(s)) s.forEach(t => { try{ if (t && typeof t.stop === 'function') t.stop(); }catch(_){} });
      if (s && typeof s.stop === 'function') s.stop();
    } catch(_) {}
  }

  function getCount(){ return parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10) || 0; }
  function setCount(n){ localStorage.setItem(STORAGE_KEY, String(n)); updateCountUI(); }
  function incCount(n = 1){ setCount(getCount() + (n||1)); }
  function updateCountUI(){
    const c = countEl();
    if (c) c.textContent = String(getCount());
  }

  async function stop(){
    try { if (backend && typeof backend.reset === 'function') backend.reset(); } catch(_) {}
    backend = null;
    if (detectorInterval) { clearInterval(detectorInterval); detectorInterval = null; }

    // remove key handler if present
    try { if (_keydownHandler) { document.removeEventListener('keydown', _keydownHandler); _keydownHandler = null; } } catch(_) {}
    // remove back button handler
    try {
      const ov = overlayEl();
      const back = ov && ov.querySelector && ov.querySelector('#scanFSBack');
      if (back && _backBtnHandler) { back.removeEventListener('click', _backBtnHandler); _backBtnHandler = null; }
    } catch(_) {}

    try {
      const v = videoEl();
      if (v && v.srcObject) safeStopStream(v.srcObject);
      if (v) { v.pause(); v.srcObject = null; }
    } catch(_) {}
    const ov = overlayEl();
    if (ov) {
      ov.classList.remove('show');
      try { ov.style.display = 'none'; } catch(_) {}
      try { ov.removeAttribute('tabindex'); } catch(_) {}
    }
    running = false;
  }

  async function open(options = {}) {
    if (running) return;
    // options with defaults
    const cfg = Object.assign({
      onScan: null,
      autoClose: true,
      closeOnEsc: true,
      closeOnBackdrop: true,
      closeOnBackBtn: true
    }, options);

    onScanCallback = typeof cfg.onScan === 'function' ? cfg.onScan : null;
    const ov = overlayEl();
    const v = videoEl();
    if (!ov || !v) throw new Error('Scanner overlay/video not found in DOM');

    ov.classList.add('show');
    try { ov.style.display = 'block'; } catch(_) {}
    try { ov.setAttribute('tabindex', '-1'); ov.focus(); } catch(_) {}
    running = true;
    updateCountUI();

    // attach Escape key handler to close scanner if enabled
    if (cfg.closeOnEsc) {
      try {
        _keydownHandler = function(e){
          if (e && (e.key === 'Escape' || e.key === 'Esc')) {
            const o = overlayEl();
            if (o && o.classList && o.classList.contains('show')) stop();
          }
        };
        document.addEventListener('keydown', _keydownHandler);
      } catch(_) {}
    }

    // bind back button inside overlay if enabled
    if (cfg.closeOnBackBtn) {
      try {
        const backBtn = ov.querySelector && ov.querySelector('#scanFSBack');
        if (backBtn) {
          _backBtnHandler = function(ev){ ev && ev.preventDefault && ev.preventDefault(); stop(); };
          backBtn.addEventListener('click', _backBtnHandler);
        }
      } catch(_) {}
    }

    // click outside video closes overlay if enabled
    if (cfg.closeOnBackdrop) {
      try {
        ov.addEventListener('click', function(ev){
          if (ev.target === ov) stop();
        });
      } catch(_) {}
    }

    // Prepare video element to minimize autoplay blocks
    try { v.muted = true; v.playsInline = true; v.autoplay = true; } catch(_) {}

    // ZXingBrowser preferred (supports many formats, already used in leitura)
    const ZX = window.ZXingBrowser || window.ZXing || window.ZXingJs || null;
    if (ZX && (ZX.BrowserMultiFormatReader || ZX.BrowserQRCodeReader || ZX.BrowserBarcodeReader)) {
      try {
        const Reader = ZX.BrowserMultiFormatReader || ZX.BrowserQRCodeReader || ZX.BrowserBarcodeReader;
        backend = new Reader();
        // pass undefined deviceId -> lets ZXing pick; most builds support decodeFromVideoDevice
        backend.decodeFromVideoDevice(undefined, v, (result, err) => {
          if (result && (result.getText || result.text)) {
            const txt = result.getText ? result.getText() : (result.text || '');
            try { incCount(1); } catch(_) {}
            if (onScanCallback) onScanCallback(String(txt || ''));
            if (options.autoClose !== false) stop();
          }
          // err while searching is normal; ignore
        });
        return;
      } catch (e) {
        console.warn('Scanner: ZXing backend failed, falling back', e);
        try { if (backend && typeof backend.reset === 'function') backend.reset(); } catch(_) {}
        backend = null;
      }
    }

    // Fallback: BarcodeDetector (if available)
    if (window.BarcodeDetector) {
      try {
        const formats = ['qr_code','ean_13','ean_8','code_128','code_39','itf','upc_a','upc_e'];
        const detector = new BarcodeDetector({ formats });
        // ensure camera stream attached for detector.detect(video) when required by UA
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
          v.srcObject = stream;
          try { await v.play(); } catch(_) { /* non-fatal */ }
        } catch(_) { /* allow detector to try without manual stream */ }

        detectorInterval = setInterval(async () => {
          try {
            const barcodes = await detector.detect(v);
            if (barcodes && barcodes.length) {
              const raw = barcodes[0].rawValue || barcodes[0].rawtext || '';
              try { incCount(1); } catch(_) {}
              if (onScanCallback) onScanCallback(String(raw || ''));
              if (options.autoClose !== false) stop();
            }
          } catch(_) {}
        }, 180);
        return;
      } catch(e) {
        console.warn('Scanner: BarcodeDetector init failed', e);
      }
    }

    // none available
    await stop();
    throw new Error('No supported scanner backend found');
  }

  // Bind overlay close if present
  document.addEventListener('click', function(ev){
    const ov = overlayEl();
    if (!ov) return;
    // close button patterns
    if (ev.target && (ev.target.id === 'scanFSBack' || ev.target.id === 'scanFSBackBtn' || ev.target.classList.contains('scan-close'))) {
      stop();
    }
    // click outside video closes
    if (ev.target === ov) stop();
  });

  // Expose API
  window.Scanner = {
    open,
    close: stop,
    getCount,
    incCount,
    updateCountUI
  };

  // init UI count on load
  document.addEventListener('DOMContentLoaded', updateCountUI, { once: true });
})();
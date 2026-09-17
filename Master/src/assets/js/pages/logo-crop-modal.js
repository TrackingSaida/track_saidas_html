/**
 * Modal de recorte de logo (pan/zoom) sem dependência externa.
 * Uso: const file = await window.openLogoCropModal(fileInputFile);
 * Retorna File (PNG recortado), o File original (enviar sem recortar) ou null (cancelar).
 */
(function (global) {
  "use strict";

  const VIEW_W = 420;
  const VIEW_H = 140; // ~3:1 — faixa do cabeçalho da etiqueta

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Não foi possível carregar a imagem."));
      img.src = src;
    });
  }

  function canvasToFile(canvas, nameBase) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Falha ao gerar a imagem recortada."));
            return;
          }
          const safe = String(nameBase || "logo").replace(/\.[^.]+$/, "") || "logo";
          resolve(new File([blob], `${safe}-crop.png`, { type: "image/png" }));
        },
        "image/png",
        0.92
      );
    });
  }

  /**
   * @param {File} file
   * @param {{ title?: string }} [opts]
   * @returns {Promise<File|null>}
   */
  async function openLogoCropModal(file, opts) {
    if (!file) return null;
    if (!global.Swal) return file;

    const objectUrl = URL.createObjectURL(file);
    let img;
    try {
      img = await loadImage(objectUrl);
    } catch (e) {
      URL.revokeObjectURL(objectUrl);
      throw e;
    }

    const state = {
      scale: 1,
      minScale: 1,
      maxScale: 4,
      offsetX: 0,
      offsetY: 0,
      dragging: false,
      lastX: 0,
      lastY: 0,
    };

    const cover = Math.max(VIEW_W / img.width, VIEW_H / img.height);
    state.minScale = cover;
    state.scale = cover;
    state.offsetX = (VIEW_W - img.width * state.scale) / 2;
    state.offsetY = (VIEW_H - img.height * state.scale) / 2;

    function clampOffsets() {
      const dw = img.width * state.scale;
      const dh = img.height * state.scale;
      if (dw <= VIEW_W) state.offsetX = (VIEW_W - dw) / 2;
      else state.offsetX = Math.min(0, Math.max(VIEW_W - dw, state.offsetX));
      if (dh <= VIEW_H) state.offsetY = (VIEW_H - dh) / 2;
      else state.offsetY = Math.min(0, Math.max(VIEW_H - dh, state.offsetY));
    }

    function paint(canvas) {
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, VIEW_W, VIEW_H);
      ctx.fillStyle = "#f3f4f6";
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.drawImage(img, state.offsetX, state.offsetY, img.width * state.scale, img.height * state.scale);
      ctx.strokeStyle = "rgba(55,65,81,0.85)";
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, VIEW_W - 2, VIEW_H - 2);
    }

    const html = `
      <div class="text-start">
        <p class="text-muted small mb-2">
          Arraste para posicionar e use o zoom para enquadrar a marca na faixa da etiqueta.
          Remova bordas vazias para a logo não ficar pequena.
        </p>
        <div class="border rounded bg-light d-flex justify-content-center p-2 mb-2">
          <canvas id="logoCropCanvas" width="${VIEW_W}" height="${VIEW_H}"
            style="width:100%;max-width:${VIEW_W}px;height:auto;cursor:grab;touch-action:none;background:#fff;"></canvas>
        </div>
        <label class="form-label small mb-1" for="logoCropZoom">Zoom</label>
        <input id="logoCropZoom" type="range" class="form-range" min="0" max="100" value="0">
        <div class="d-flex gap-2 flex-wrap mt-2">
          <button type="button" class="btn btn-sm btn-soft-secondary" id="logoCropReset">Reenquadrar</button>
        </div>
      </div>
    `;

    const moveHandler = (e) => {
      const canvas = document.getElementById("logoCropCanvas");
      if (!canvas || !state.dragging) return;
      state.offsetX += e.clientX - state.lastX;
      state.offsetY += e.clientY - state.lastY;
      state.lastX = e.clientX;
      state.lastY = e.clientY;
      clampOffsets();
      paint(canvas);
    };
    const upHandler = () => {
      state.dragging = false;
      const canvas = document.getElementById("logoCropCanvas");
      if (canvas) canvas.style.cursor = "grab";
    };

    const result = await Swal.fire({
      title: (opts && opts.title) || "Ajustar logo",
      html,
      width: Math.min(520, global.innerWidth - 24),
      showCancelButton: true,
      showDenyButton: true,
      focusConfirm: false,
      confirmButtonText: "Recortar e enviar",
      denyButtonText: "Enviar original",
      cancelButtonText: "Cancelar",
      reverseButtons: true,
      didOpen: () => {
        const canvas = document.getElementById("logoCropCanvas");
        const zoom = document.getElementById("logoCropZoom");
        const reset = document.getElementById("logoCropReset");
        if (!canvas || !zoom) return;

        const redraw = () => {
          clampOffsets();
          paint(canvas);
        };
        redraw();

        zoom.addEventListener("input", () => {
          const t = Number(zoom.value) / 100;
          const next = state.minScale * (1 + t * (state.maxScale / state.minScale - 1));
          const cx = VIEW_W / 2;
          const cy = VIEW_H / 2;
          const ix = (cx - state.offsetX) / state.scale;
          const iy = (cy - state.offsetY) / state.scale;
          state.scale = next;
          state.offsetX = cx - ix * state.scale;
          state.offsetY = cy - iy * state.scale;
          redraw();
        });

        reset?.addEventListener("click", () => {
          state.scale = state.minScale;
          zoom.value = "0";
          state.offsetX = (VIEW_W - img.width * state.scale) / 2;
          state.offsetY = (VIEW_H - img.height * state.scale) / 2;
          redraw();
        });

        canvas.addEventListener("mousedown", (e) => {
          state.dragging = true;
          state.lastX = e.clientX;
          state.lastY = e.clientY;
          canvas.style.cursor = "grabbing";
        });
        global.addEventListener("mousemove", moveHandler);
        global.addEventListener("mouseup", upHandler);

        canvas.addEventListener(
          "touchstart",
          (e) => {
            if (!e.touches[0]) return;
            state.dragging = true;
            state.lastX = e.touches[0].clientX;
            state.lastY = e.touches[0].clientY;
          },
          { passive: true }
        );
        canvas.addEventListener(
          "touchmove",
          (e) => {
            if (!state.dragging || !e.touches[0]) return;
            state.offsetX += e.touches[0].clientX - state.lastX;
            state.offsetY += e.touches[0].clientY - state.lastY;
            state.lastX = e.touches[0].clientX;
            state.lastY = e.touches[0].clientY;
            redraw();
          },
          { passive: true }
        );
        canvas.addEventListener("touchend", upHandler);
      },
      willClose: () => {
        global.removeEventListener("mousemove", moveHandler);
        global.removeEventListener("mouseup", upHandler);
      },
      preConfirm: async () => {
        const outW = 1140;
        const outH = 380;
        const out = document.createElement("canvas");
        out.width = outW;
        out.height = outH;
        const ctx = out.getContext("2d");
        const sx = -state.offsetX / state.scale;
        const sy = -state.offsetY / state.scale;
        const sw = VIEW_W / state.scale;
        const sh = VIEW_H / state.scale;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, outW, outH);
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
        try {
          return await canvasToFile(out, file.name);
        } catch (e) {
          Swal.showValidationMessage(e.message || "Falha ao recortar.");
          return false;
        }
      },
    });

    URL.revokeObjectURL(objectUrl);

    if (result.isConfirmed && result.value instanceof File) return result.value;
    if (result.isDenied) return file;
    return null;
  }

  global.openLogoCropModal = openLogoCropModal;
})(window);

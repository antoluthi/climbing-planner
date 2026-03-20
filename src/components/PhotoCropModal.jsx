import { useState, useRef, useEffect, useCallback } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";

// ─── PHOTO CROP MODAL ─────────────────────────────────────────────────────────

export function PhotoCropModal({ onSave, onClose }) {
  const { styles, isDark } = useThemeCtx();
  const SIZE = 260;
  const OUTPUT = 240;

  const [imgSrc, setImgSrc] = useState(null);
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const naturalRef = useRef({ w: 1, h: 1 });
  const dragRef = useRef(null);
  const pinchRef = useRef(null);
  const fileRef = useRef(null);
  const cropAreaRef = useRef(null);

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target.result;
      const img = new Image();
      img.onload = () => {
        naturalRef.current = { w: img.naturalWidth, h: img.naturalHeight };
        const fit = Math.max(SIZE / img.naturalWidth, SIZE / img.naturalHeight) * 1.05;
        setScale(fit);
        setPos({ x: 0, y: 0 });
      };
      img.src = src;
      setImgSrc(src);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const getImgStyle = () => {
    const nat = naturalRef.current;
    const w = nat.w * scale;
    const h = nat.h * scale;
    return {
      position: "absolute",
      left: SIZE / 2 + pos.x - w / 2,
      top: SIZE / 2 + pos.y - h / 2,
      width: w, height: h,
      pointerEvents: "none", userSelect: "none", draggable: false,
    };
  };

  const handleMouseDown = (e) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, posX: pos.x, posY: pos.y };
  };
  const handleMouseMove = (e) => {
    if (!dragRef.current) return;
    const { startX, startY, posX, posY } = dragRef.current;
    setPos({ x: posX + (e.clientX - startX), y: posY + (e.clientY - startY) });
  };
  const handleMouseUp = () => { dragRef.current = null; };

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    setScale(s => Math.max(0.1, Math.min(s * delta, 20)));
  }, []);

  const handleTouchStart = (e) => {
    if (e.touches.length === 1) {
      dragRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, posX: pos.x, posY: pos.y };
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchRef.current = { dist: Math.hypot(dx, dy), scale };
    }
  };
  const handleTouchMove = useCallback((e) => {
    e.preventDefault();
    if (e.touches.length === 1 && dragRef.current) {
      const { startX, startY, posX, posY } = dragRef.current;
      setPos({ x: posX + (e.touches[0].clientX - startX), y: posY + (e.touches[0].clientY - startY) });
    } else if (e.touches.length === 2 && pinchRef.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const newDist = Math.hypot(dx, dy);
      const ratio = newDist / pinchRef.current.dist;
      setScale(Math.max(0.1, Math.min(pinchRef.current.scale * ratio, 20)));
    }
  }, []);
  const handleTouchEnd = () => { dragRef.current = null; pinchRef.current = null; };

  // Attach wheel + touchmove as non-passive so preventDefault() works
  useEffect(() => {
    const el = cropAreaRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    return () => {
      el.removeEventListener("wheel", handleWheel);
      el.removeEventListener("touchmove", handleTouchMove);
    };
  }, [imgSrc, handleWheel, handleTouchMove]); // re-attach when image loads (el becomes visible)

  const handleConfirm = () => {
    if (!imgSrc) return;
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT; canvas.height = OUTPUT;
    const ctx = canvas.getContext("2d");
    ctx.beginPath();
    ctx.arc(OUTPUT / 2, OUTPUT / 2, OUTPUT / 2, 0, Math.PI * 2);
    ctx.clip();
    const img = new Image();
    img.onload = () => {
      const ratio = OUTPUT / SIZE;
      const nat = naturalRef.current;
      const w = nat.w * scale * ratio;
      const h = nat.h * scale * ratio;
      const x = OUTPUT / 2 + pos.x * ratio - w / 2;
      const y = OUTPUT / 2 + pos.y * ratio - h / 2;
      ctx.drawImage(img, x, y, w, h);
      onSave(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.src = imgSrc;
  };

  const accent = isDark ? "#c8906a" : "#8b4c20";
  const mutedColor = isDark ? "#707870" : "#8a7f70";
  const textColor = isDark ? "#e8e4de" : "#2a2218";

  return (
    <div style={styles.cropOverlay}>
      <div style={styles.cropModal}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: textColor, letterSpacing: "0.08em" }}>RECADRER LA PHOTO</span>
          <button style={{ background: "none", border: "none", color: mutedColor, cursor: "pointer", fontSize: 18 }} onClick={onClose}>✕</button>
        </div>

        {!imgSrc ? (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <div style={{ fontSize: 14, marginBottom: 12, color: isDark ? "#555" : "#aaa" }}>Photo</div>
            <button
              style={{ background: "none", border: `1px solid ${accent}55`, color: accent, padding: "8px 20px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}
              onClick={() => fileRef.current?.click()}
            >Choisir une photo</button>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
          </div>
        ) : (
          <>
            {/* Crop area — wheel + touchmove attached via useEffect (passive:false) */}
            <div
              ref={cropAreaRef}
              style={{ position: "relative", width: SIZE, height: SIZE, margin: "0 auto", borderRadius: "50%", overflow: "hidden", cursor: dragRef.current ? "grabbing" : "grab", background: "#000", userSelect: "none" }}
              onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
              onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}
            >
              <img src={imgSrc} style={getImgStyle()} alt="" />
              {/* Radial gradient to show circle edge */}
              <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: `radial-gradient(circle at center, transparent ${SIZE / 2 - 5}px, rgba(0,0,0,0.55) ${SIZE / 2 - 4}px)` }} />
              {/* SVG circle border — inside the crop div so it never blocks pointer events */}
              <svg width={SIZE} height={SIZE} style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}>
                <circle cx={SIZE / 2} cy={SIZE / 2} r={SIZE / 2 - 2} fill="none" stroke={accent} strokeWidth="1.5" />
              </svg>
            </div>
            <div style={{ textAlign: "center", marginTop: 8, fontSize: 10, color: mutedColor }}>Glisser · Molette ou pincer pour zoomer</div>
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button
                style={{ flex: 1, background: "none", border: `1px solid ${isDark ? "#2e3430" : "#bfb9aa"}`, color: mutedColor, padding: "8px", borderRadius: 5, cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}
                onClick={() => fileRef.current?.click()}
              >Changer</button>
              <button
                style={{ flex: 2, background: isDark ? "#263228" : "#d4e8db", border: `1px solid ${accent}66`, color: accent, padding: "8px", borderRadius: 5, cursor: "pointer", fontSize: 11, fontFamily: "inherit", fontWeight: 600 }}
                onClick={handleConfirm}
              >Confirmer</button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
          </>
        )}
      </div>
    </div>
  );
}

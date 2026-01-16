import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

function App() {
  const videoRef = useRef(null);
  const [overlays, setOverlays] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [streamStatus, setStreamStatus] = useState("connecting");

  /* ---------------- INIT ---------------- */

  useEffect(() => {
    let hls;

    // Setup HLS video streaming
    if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
      });

      hls.loadSource("http://localhost:5000/stream/stream.m3u8");
      hls.attachMedia(videoRef.current);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        videoRef.current.play();
        setStreamStatus("live");
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          setStreamStatus("error");
          console.error("HLS Error:", data);
        }
      });
    } else if (
      videoRef.current &&
      videoRef.current.canPlayType("application/vnd.apple.mpegurl")
    ) {
      videoRef.current.src = "http://localhost:5000/stream/stream.m3u8";
      setStreamStatus("live");
    }

    // Load overlays from backend
    fetch("http://localhost:5000/overlays")
      .then((res) => res.json())
      .then((data) => {
        const normalized = data.map((overlay) => ({
          id: overlay._id,
          type: overlay.type || "text",
          content: overlay.content || "",
          position: overlay.position || { x: 50, y: 50 },
          size: overlay.size || { width: 180, height: 50 },
          persisted: true,
        }));
        setOverlays(normalized);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load overlays:", err);
        setIsLoading(false);
      });

    return () => hls && hls.destroy();
  }, []);

  /* ---------------- BACKEND OPERATIONS ---------------- */

  const updateOverlayInDB = (id, data) => {
    fetch(`http://localhost:5000/overlays/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).catch((err) => console.error("Update failed:", err));
  };

  const createOverlayInDB = async (payload) => {
    try {
      const res = await fetch("http://localhost:5000/overlays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const { id } = await res.json();
      return id;
    } catch (err) {
      console.error("Create failed:", err);
      return null;
    }
  };

  /* ---------------- ADD OVERLAYS ---------------- */

  const addTextOverlay = async () => {
    const payload = {
      type: "text",
      content: "New Text Overlay",
      position: { x: 50, y: 50 },
      size: { width: 180, height: 50 },
    };

    const id = await createOverlayInDB(payload);
    if (id) {
      setOverlays((p) => [...p, { ...payload, id, persisted: true }]);
      setSelectedId(id);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const payload = {
      type: "image",
      content: URL.createObjectURL(file),
      position: { x: 60, y: 60 },
      size: { width: 150, height: 150 },
    };

    const id = await createOverlayInDB(payload);
    if (id) {
      setOverlays((p) => [...p, { ...payload, id, persisted: true }]);
      setSelectedId(id);
    }
  };

  /* ---------------- DELETE OVERLAYS ---------------- */

  const deleteSelected = async () => {
    if (!selectedId) return;

    try {
      await fetch(`http://localhost:5000/overlays/${selectedId}`, {
        method: "DELETE",
      });
      setOverlays((p) => p.filter((o) => o.id !== selectedId));
      setSelectedId(null);
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  const resetAllOverlays = async () => {
    if (!window.confirm("Delete all overlays? This cannot be undone.")) return;

    try {
      // Delete all overlays from backend
      await Promise.all(
        overlays.map((o) =>
          fetch(`http://localhost:5000/overlays/${o.id}`, { method: "DELETE" })
        )
      );
      setOverlays([]);
      setSelectedId(null);
    } catch (err) {
      console.error("Reset failed:", err);
    }
  };

  /* ---------------- DRAG & RESIZE ---------------- */

  const handleDrag = (id, e) => {
    e.stopPropagation();
    setSelectedId(id);

    const overlay = overlays.find((o) => o.id === id);
    if (!overlay) return;

    const startX = e.clientX - overlay.position.x;
    const startY = e.clientY - overlay.position.y;

    const onMouseMove = (ev) => {
      setOverlays((prev) =>
        prev.map((o) =>
          o.id === id
            ? {
                ...o,
                position: {
                  x: Math.max(0, ev.clientX - startX),
                  y: Math.max(0, ev.clientY - startY),
                },
              }
            : o
        )
      );
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);

      setOverlays((prev) => {
        const updated = prev.find((o) => o.id === id);
        if (updated?.persisted) {
          updateOverlayInDB(id, { position: updated.position });
        }
        return prev;
      });
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  const handleResize = (id, e) => {
    e.stopPropagation();

    const overlay = overlays.find((o) => o.id === id);
    if (!overlay) return;

    const sx = e.clientX;
    const sy = e.clientY;
    const sw = overlay.size.width;
    const sh = overlay.size.height;

    const onMouseMove = (ev) => {
      setOverlays((prev) =>
        prev.map((o) =>
          o.id === id
            ? {
                ...o,
                size: {
                  width: Math.max(50, sw + (ev.clientX - sx)),
                  height: Math.max(30, sh + (ev.clientY - sy)),
                },
              }
            : o
        )
      );
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);

      setOverlays((prev) => {
        const updated = prev.find((o) => o.id === id);
        if (updated?.persisted) {
          updateOverlayInDB(id, { size: updated.size });
        }
        return prev;
      });
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  const selectedOverlay = overlays.find((o) => o.id === selectedId);

  /* ---------------- UI ---------------- */

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a", padding: 20 }}>
      {/* Header */}
      <header
        style={{
          background: "linear-gradient(to right, #4f46e5, #7c3aed)",
          padding: "16px 24px",
          borderRadius: "12px",
          marginBottom: "24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h1 style={{ color: "white", margin: 0 }}>
          🎥 Livestream Overlay Studio
        </h1>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "6px 12px",
            background:
              streamStatus === "live"
                ? "#10b981"
                : streamStatus === "error"
                ? "#ef4444"
                : "#f59e0b",
            borderRadius: "20px",
            color: "white",
            fontSize: "14px",
            fontWeight: "600",
          }}
        >
          <span
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: "white",
              animation: streamStatus === "live" ? "pulse 2s infinite" : "none",
            }}
          />
          {streamStatus === "live"
            ? "LIVE"
            : streamStatus === "error"
            ? "ERROR"
            : "CONNECTING..."}
        </div>
      </header>

      {/* Main Content */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 320px",
          gap: 24,
          maxWidth: "1400px",
          margin: "0 auto",
        }}
      >
        {/* Video Container */}
        <div
          style={{
            background: "#1e293b",
            borderRadius: "12px",
            overflow: "hidden",
            border: "1px solid #334155",
          }}
        >
          <div style={{ position: "relative", paddingBottom: "56.25%" }}>
            <video
              ref={videoRef}
              autoPlay
              muted
              controls
              style={{
                position: "absolute",
                width: "100%",
                height: "100%",
                objectFit: "contain",
                background: "#000",
              }}
            />

            {/* Overlays */}
            {overlays.map((o) => (
              <div
                key={o.id}
                onMouseDown={(e) => handleDrag(o.id, e)}
                style={{
                  position: "absolute",
                  left: o.position.x,
                  top: o.position.y,
                  width: o.size.width,
                  height: o.size.height,
                  border:
                    selectedId === o.id
                      ? "2px solid #22c55e"
                      : "2px solid rgba(239,68,68,0.6)",
                  boxShadow:
                    selectedId === o.id ? "0 0 12px rgba(34,197,94,0.6)" : "none",
                  color: "#ef4444",
                  background: "rgba(0,0,0,0.4)",
                  cursor: "move",
                  userSelect: "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: "bold",
                  borderRadius: "6px",
                }}
              >
                {o.type === "text" && o.content}
                {o.type === "image" && (
                  <img
                    src={o.content}
                    alt=""
                    draggable={false}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                      pointerEvents: "none",
                    }}
                  />
                )}
                {selectedId === o.id && (
                  <div
                    onMouseDown={(e) => handleResize(o.id, e)}
                    style={{
                      position: "absolute",
                      right: -1,
                      bottom: -1,
                      width: 16,
                      height: 16,
                      background: "#22c55e",
                      cursor: "se-resize",
                      borderRadius: "0 0 4px 0",
                    }}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Info Bar */}
          <div
            style={{
              padding: "12px 16px",
              background: "#0f172a",
              borderTop: "1px solid #334155",
              display: "flex",
              justifyContent: "space-between",
              fontSize: "14px",
              color: "#94a3b8",
            }}
          >
            <span>📊 {overlays.length} overlay(s)</span>
            <span>🎬 RTSP → HLS Stream</span>
          </div>
        </div>

        {/* Controls Panel */}
        <div
          style={{
            background: "#1e293b",
            padding: 24,
            borderRadius: "12px",
            border: "1px solid #334155",
            height: "fit-content",
          }}
        >
          <h3 style={{ color: "white", marginTop: 0, marginBottom: 20 }}>
            ⚙️ Controls
          </h3>

          {/* Add Buttons */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button
              onClick={addTextOverlay}
              style={{
                width: "100%",
                padding: "12px",
                background: "linear-gradient(to right, #6366f1, #4f46e5)",
                color: "white",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: "600",
                fontSize: "14px",
              }}
            >
              ➕ Add Text Overlay
            </button>

            <label
              style={{
                width: "92%",
                padding: "12px",
                background: "linear-gradient(to right, #8b5cf6, #7c3aed)",
                color: "white",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: "600",
                textAlign: "center",
                fontSize: "14px",
              }}
            >
              🖼️ Upload Image
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={handleImageUpload}
              />
            </label>

            <button
              onClick={deleteSelected}
              disabled={!selectedId}
              style={{
                width: "100%",
                padding: "12px",
                background: selectedId ? "#dc2626" : "#334155",
                color: "white",
                border: "none",
                borderRadius: "8px",
                cursor: selectedId ? "pointer" : "not-allowed",
                fontWeight: "600",
                fontSize: "14px",
                opacity: selectedId ? 1 : 0.5,
              }}
            >
              🗑️ Delete Selected
            </button>

            <button
              onClick={resetAllOverlays}
              disabled={overlays.length === 0}
              style={{
                width: "100%",
                padding: "12px",
                background: "#475569",
                color: "white",
                border: "1px solid #64748b",
                borderRadius: "8px",
                cursor: overlays.length > 0 ? "pointer" : "not-allowed",
                fontWeight: "600",
                fontSize: "14px",
                opacity: overlays.length > 0 ? 1 : 0.5,
              }}
            >
              ♻️ Reset All
            </button>
          </div>

          {/* Text Editor */}
          {selectedOverlay?.type === "text" && (
            <div style={{ marginTop: 20 }}>
              <label
                style={{
                  display: "block",
                  color: "#94a3b8",
                  fontSize: "12px",
                  marginBottom: 6,
                  fontWeight: "600",
                }}
              >
                ✏️ Edit Text
              </label>
              <input
                type="text"
                value={selectedOverlay.content}
                placeholder="Enter text..."
                onChange={(e) => {
                  const value = e.target.value;
                  setOverlays((p) =>
                    p.map((o) =>
                      o.id === selectedId ? { ...o, content: value } : o
                    )
                  );
                  updateOverlayInDB(selectedId, { content: value });
                }}
                style={{
                  width: "100%",
                  padding: "10px",
                  borderRadius: "6px",
                  border: "1px solid #475569",
                  background: "#0f172a",
                  color: "white",
                  fontSize: "14px",
                }}
              />
            </div>
          )}

          {/* Tips */}
          <div
            style={{
              marginTop: 24,
              padding: 16,
              background: "#0f172a",
              borderRadius: "8px",
              border: "1px solid #334155",
            }}
          >
            <h4
              style={{
                color: "#818cf8",
                fontSize: "14px",
                marginTop: 0,
                marginBottom: 12,
              }}
            >
              💡 Quick Tips
            </h4>
            <ul
              style={{
                margin: 0,
                padding: 0,
                listStyle: "none",
                fontSize: "12px",
                color: "#94a3b8",
                lineHeight: "1.8",
              }}
            >
              <li>• Click to select overlay</li>
              <li>• Drag to reposition</li>
              <li>• Use handle to resize</li>
              <li>• Changes auto-save</li>
            </ul>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}

export default App;
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Badge, Button } from "@/components/ui";

export type BioModelType = "dna" | "mitochondria" | "membrane" | "chloroplast";

interface Bio3DViewerProps {
  modelType: BioModelType;
  isPro?: boolean;
}

const MODEL_INFO: Record<BioModelType, {
  title: string;
  subtitle: string;
  parts: Array<{ name: string; desc: string; color: string }>;
}> = {
  dna: {
    title: "DNA 雙螺旋立體分子模型",
    subtitle: "由去氧核糖與磷酸交替排列構成外側骨架，含氮鹼基 (A-T, C-G) 藉氫鍵配對向內延伸。",
    parts: [
      { name: "磷酸-核糖骨架", desc: "外側雙股反向平行（5'➔3' 與 3'➔5'）磷酸二酯鍵骨架", color: "#38bdf8" },
      { name: "A-T 鹼基對", desc: "腺嘌呤與胸腺嘧啶以 2 個氫鍵相連", color: "#f59e0b" },
      { name: "C-G 鹼基對", desc: "胞嘧啶與鳥嘌呤以 3 個氫鍵相連，熱穩定度較高", color: "#10b981" },
      { name: "主溝與次溝", desc: "雙螺旋外觀凹陷不對稱，供轉錄因子與調控蛋白辨識結合", color: "#a855f7" },
    ],
  },
  mitochondria: {
    title: "粒線體 3D 解剖內部結構模型",
    subtitle: "真核細胞能量工廠，雙層膜構造；內膜深折成嵴以擴增呼吸酵素與電子傳遞鏈表面積。",
    parts: [
      { name: "平滑外膜", desc: "含孔蛋白，分子量小於 5000 的分子可自由通過", color: "#38bdf8" },
      { name: "摺疊內膜 (嵴 Cristae)", desc: "進行電子傳遞鏈與氧化磷酸化，富含心磷脂與蛋白質", color: "#f43f5e" },
      { name: "基質 (Matrix)", desc: "內含檸檬酸循環酵素、自身環狀 DNA、RNA 與核糖體", color: "#fbbf24" },
      { name: "ATP 合成酶 (F₀F₁)", desc: "利用膜間腔質子濃度梯度驅動旋轉合成 ATP", color: "#a855f7" },
    ],
  },
  membrane: {
    title: "細胞膜流體鑲嵌 3D 結構模型",
    subtitle: "磷脂雙層構成基本骨架，外親水、內疏水；蛋白質與膽固醇鑲嵌其間，呈現流體特性。",
    parts: [
      { name: "親水性磷酸頭部", desc: "帶極性電荷，朝向細胞外液與細胞質水性環境", color: "#38bdf8" },
      { name: "疏水性脂肪酸尾部", desc: "非極性碳氫鏈朝向內部，阻隔水溶性與離子物質自由穿透", color: "#f59e0b" },
      { name: "跨膜通道/載體蛋白", desc: "貫穿脂雙層，協助特定親水分子與離子進行促進性擴散或主動運輸", color: "#8b5cf6" },
      { name: "膽固醇分子 (動物專有)", desc: "夾在磷脂尾部間，高溫防膜過度流動、低溫防膜凝固結晶", color: "#e11d48" },
    ],
  },
  chloroplast: {
    title: "葉綠體 3D 光合作用胞器模型",
    subtitle: "植物與藻類特有的雙層膜半自主胞器，內含類囊體疊合的葉綠餅與進行碳反應的基質。",
    parts: [
      { name: "平滑外膜與內膜", desc: "兩層生物膜保護，物質選擇性通透", color: "#34d399" },
      { name: "類囊體／葉綠餅 (Grana)", desc: "光反應場所，膜上含有光合色素（葉綠素、類胡蘿蔔素）與電子傳遞鏈", color: "#10b981" },
      { name: "基質 (Stroma)", desc: "碳反應場所，含固定 CO₂ 的 Rubisco 酵素及自身環狀 DNA", color: "#fbbf24" },
      { name: "類囊體腔", desc: "水光解產生的質子在此累積形成高濃度質子梯度", color: "#06b6d4" },
    ],
  },
};

export function Bio3DViewer({ modelType, isPro = false }: Bio3DViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [activePart, setActivePart] = useState<number | null>(0);
  const [autoRotate, setAutoRotate] = useState(true);
  const [wireframe, setWireframe] = useState(false);
  const [zoom, setZoom] = useState(1);
  const info = MODEL_INFO[modelType];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let angleX = 0.3;
    let angleY = 0.4;
    let isDragging = false;
    let lastX = 0;
    let lastY = 0;

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      angleY += dx * 0.01;
      angleX += dy * 0.01;
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onMouseUp = () => { isDragging = false; };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => Math.max(0.6, Math.min(1.8, z - e.deltaY * 0.001)));
    };

    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    // Touch support
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        isDragging = true;
        lastX = e.touches[0].clientX;
        lastY = e.touches[0].clientY;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!isDragging || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - lastX;
      const dy = e.touches[0].clientY - lastY;
      angleY += dx * 0.015;
      angleX += dy * 0.015;
      lastX = e.touches[0].clientX;
      lastY = e.touches[0].clientY;
    };
    const onTouchEnd = () => { isDragging = false; };

    canvas.addEventListener("touchstart", onTouchStart, { passive: true });
    canvas.addEventListener("touchmove", onTouchMove, { passive: true });
    canvas.addEventListener("touchend", onTouchEnd);

    // Render loop
    const render = () => {
      if (autoRotate && !isDragging) {
        angleY += 0.008;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const currentZoom = zoom;

      // 3D projection helper
      const project = (x: number, y: number, z: number) => {
        // Rotate Y
        const cosY = Math.cos(angleY);
        const sinY = Math.sin(angleY);
        const x1 = x * cosY - z * sinY;
        const z1 = z * cosY + x * sinY;

        // Rotate X
        const cosX = Math.cos(angleX);
        const sinX = Math.sin(angleX);
        const y2 = y * cosX - z1 * sinX;
        const z2 = z1 * cosX + y * sinX;

        // Perspective
        const fov = 400;
        const scale = (fov / (fov + z2 + 200)) * currentZoom;
        return {
          px: cx + x1 * scale,
          py: cy + y2 * scale,
          z: z2,
          scale,
        };
      };

      if (modelType === "dna") {
        // Draw 3D DNA Double Helix
        const pointsA: Array<{ px: number; py: number; z: number; scale: number }> = [];
        const pointsB: Array<{ px: number; py: number; z: number; scale: number }> = [];
        const r = 50;
        const steps = 36;
        const height = 180;

        for (let i = 0; i < steps; i++) {
          const theta = (i / steps) * Math.PI * 4;
          const y = (i / steps) * height - height / 2;

          const pA = project(Math.cos(theta) * r, y, Math.sin(theta) * r);
          const pB = project(Math.cos(theta + Math.PI) * r, y, Math.sin(theta + Math.PI) * r);
          pointsA.push(pA);
          pointsB.push(pB);

          // Base pair rungs
          if (i % 2 === 0) {
            ctx.beginPath();
            ctx.moveTo(pA.px, pA.py);
            ctx.lineTo(pB.px, pB.py);
            ctx.lineWidth = 3 * pA.scale;
            ctx.strokeStyle = i % 4 === 0 ? "rgba(245, 158, 11, 0.85)" : "rgba(16, 185, 129, 0.85)";
            ctx.stroke();

            // Center hydrogen bond dot
            const mid = project(0, y, 0);
            ctx.beginPath();
            ctx.arc(mid.px, mid.py, 2.5 * mid.scale, 0, Math.PI * 2);
            ctx.fillStyle = "#fff";
            ctx.fill();
          }
        }

        // Backbone strands
        const drawStrand = (pts: Array<{ px: number; py: number; z: number; scale: number }>, color: string) => {
          ctx.beginPath();
          for (let i = 0; i < pts.length; i++) {
            if (i === 0) ctx.moveTo(pts[i].px, pts[i].py);
            else ctx.lineTo(pts[i].px, pts[i].py);
          }
          ctx.strokeStyle = color;
          ctx.lineWidth = wireframe ? 1.5 : 4 * currentZoom;
          ctx.stroke();

          // Phosphate nodes
          for (const p of pts) {
            ctx.beginPath();
            ctx.arc(p.px, p.py, (wireframe ? 2 : 4) * p.scale, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
          }
        };

        drawStrand(pointsA, "#38bdf8");
        drawStrand(pointsB, "#a855f7");

      } else if (modelType === "mitochondria") {
        // Mitochondria 3D Capsule & Inner Cristae
        // Outer capsule contour
        const capsuleR = 60;
        const capsuleL = 120;
        ctx.strokeStyle = "rgba(56, 189, 248, 0.7)";
        ctx.lineWidth = 2.5;

        // Draw outer membrane ellipses in 3D
        for (let ring = -3; ring <= 3; ring++) {
          const y = (ring / 3) * (capsuleL / 2);
          const r = Math.sqrt(Math.max(0, 1 - Math.pow(y / (capsuleL / 2 + 10), 2))) * capsuleR;
          ctx.beginPath();
          for (let step = 0; step <= 24; step++) {
            const angle = (step / 24) * Math.PI * 2;
            const p = project(Math.cos(angle) * r, y, Math.sin(angle) * r);
            if (step === 0) ctx.moveTo(p.px, p.py);
            else ctx.lineTo(p.px, p.py);
          }
          ctx.stroke();
        }

        // Inner cristae (convoluted folds in red/pink)
        ctx.strokeStyle = "rgba(244, 63, 94, 0.9)";
        ctx.lineWidth = 3.5 * currentZoom;
        for (let i = -2; i <= 2; i++) {
          const cyPos = i * 22;
          ctx.beginPath();
          const p1 = project(-35, cyPos, -15);
          const p2 = project(25, cyPos + 6, 0);
          const p3 = project(-20, cyPos + 12, 15);
          ctx.moveTo(p1.px, p1.py);
          ctx.quadraticCurveTo(p2.px, p2.py, p3.px, p3.py);
          ctx.stroke();
        }

        // ATP synthase particles on inner membrane
        for (let i = -2; i <= 2; i++) {
          const p = project(28, i * 22 + 6, 0);
          ctx.beginPath();
          ctx.arc(p.px, p.py, 3 * p.scale, 0, Math.PI * 2);
          ctx.fillStyle = "#fbbf24";
          ctx.fill();
        }

      } else if (modelType === "membrane") {
        // Fluid Mosaic Lipid Bilayer 3D Grid
        const cols = 7;
        const rows = 5;
        const spacingX = 22;
        const spacingZ = 20;

        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const x = (c - cols / 2) * spacingX;
            const z = (r - rows / 2) * spacingZ;

            // Skip middle spot for transmembrane protein
            if (c === 3 && r === 2) continue;

            // Upper monolayer head
            const headTop = project(x, -25, z);
            ctx.beginPath();
            ctx.arc(headTop.px, headTop.py, 5 * headTop.scale, 0, Math.PI * 2);
            ctx.fillStyle = "#38bdf8";
            ctx.fill();

            // Upper tail
            const tailTop = project(x, -5, z);
            ctx.beginPath();
            ctx.moveTo(headTop.px, headTop.py);
            ctx.lineTo(tailTop.px, tailTop.py);
            ctx.strokeStyle = "rgba(245, 158, 11, 0.6)";
            ctx.lineWidth = 2 * headTop.scale;
            ctx.stroke();

            // Lower tail
            const tailBottom = project(x, 5, z);
            const headBottom = project(x, 25, z);
            ctx.beginPath();
            ctx.moveTo(tailBottom.px, tailBottom.py);
            ctx.lineTo(headBottom.px, headBottom.py);
            ctx.stroke();

            // Lower monolayer head
            ctx.beginPath();
            ctx.arc(headBottom.px, headBottom.py, 5 * headBottom.scale, 0, Math.PI * 2);
            ctx.fillStyle = "#38bdf8";
            ctx.fill();
          }
        }

        // Transmembrane Channel Protein (large purple barrel in center)
        const proteinP1 = project(0, -32, 0);
        const proteinP2 = project(0, 32, 0);
        ctx.beginPath();
        ctx.ellipse(proteinP1.px, proteinP1.py, 16 * proteinP1.scale, 10 * proteinP1.scale, 0, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(139, 92, 246, 0.85)";
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(proteinP2.px, proteinP2.py, 16 * proteinP2.scale, 10 * proteinP2.scale, 0, 0, Math.PI * 2);
        ctx.fill();
        // Barrel body
        ctx.beginPath();
        ctx.moveTo(proteinP1.px - 16 * proteinP1.scale, proteinP1.py);
        ctx.lineTo(proteinP2.px - 16 * proteinP2.scale, proteinP2.py);
        ctx.lineTo(proteinP2.px + 16 * proteinP2.scale, proteinP2.py);
        ctx.lineTo(proteinP1.px + 16 * proteinP1.scale, proteinP1.py);
        ctx.closePath();
        ctx.fillStyle = "rgba(139, 92, 246, 0.65)";
        ctx.fill();

      } else if (modelType === "chloroplast") {
        // Chloroplast 3D Stacks (Grana discs)
        // Outer disc shell
        ctx.strokeStyle = "rgba(52, 211, 153, 0.75)";
        ctx.lineWidth = 2.5;
        for (let ring = -2; ring <= 2; ring++) {
          const y = ring * 25;
          const r = Math.sqrt(Math.max(0, 1 - Math.pow(y / 70, 2))) * 75;
          ctx.beginPath();
          for (let step = 0; step <= 24; step++) {
            const angle = (step / 24) * Math.PI * 2;
            const p = project(Math.cos(angle) * r, y, Math.sin(angle) * r);
            if (step === 0) ctx.moveTo(p.px, p.py);
            else ctx.lineTo(p.px, p.py);
          }
          ctx.stroke();
        }

        // 3 Grana pillars (stacks of green thylakoid coins)
        const pillarPositions = [
          { x: -35, z: -15 },
          { x: 30, z: -20 },
          { x: 0, z: 25 },
        ];

        for (const pil of pillarPositions) {
          for (let layer = 0; layer < 5; layer++) {
            const y = layer * 9 - 18;
            const p = project(pil.x, y, pil.z);
            ctx.beginPath();
            ctx.ellipse(p.px, p.py, 16 * p.scale, 8 * p.scale, 0, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(16, 185, 129, 0.9)";
            ctx.fill();
            ctx.strokeStyle = "#064e3b";
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
    };
  }, [modelType, autoRotate, wireframe, zoom]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-cyan-300/25 bg-[radial-gradient(circle_at_50%_20%,rgba(56,189,248,.12),transparent_60%),linear-gradient(135deg,rgba(15,23,42,.95),rgba(15,23,42,.98))] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">🧬</span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white">{info.title}</h3>
              {isPro ? (
                <Badge tone="cyan">PRO 3D 解剖</Badge>
              ) : (
                <Badge tone="gold">Nova Pro 專屬</Badge>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted">{info.subtitle}</p>
          </div>
        </div>

        {isPro && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAutoRotate(!autoRotate)}
              className={`rounded-lg border px-2.5 py-1 text-xs transition ${autoRotate ? "border-cyan-300 bg-cyan-300/15 text-cyan-200" : "border-white/15 bg-white/5 text-muted"}`}
            >
              {autoRotate ? "■ 暫停旋轉" : "▶ 自動旋轉"}
            </button>
            <button
              type="button"
              onClick={() => setWireframe(!wireframe)}
              className={`rounded-lg border px-2.5 py-1 text-xs transition ${wireframe ? "border-violet-300 bg-violet-300/15 text-violet-200" : "border-white/15 bg-white/5 text-muted"}`}
            >
              透視模式
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              className="rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-xs text-muted hover:text-white"
            >
              重置
            </button>
          </div>
        )}
      </div>

      <div className="relative mt-4 flex flex-col items-center justify-center">
        {/* 3D Canvas */}
        <div className="relative h-64 w-full max-w-lg cursor-grab active:cursor-grabbing sm:h-72">
          <canvas
            ref={canvasRef}
            width={480}
            height={300}
            className="h-full w-full object-contain"
          />

          {isPro && (
            <p className="pointer-events-none absolute bottom-2 left-2 text-[10px] text-muted">
              ✦ 拖曳可 360° 旋轉 ｜ 滾輪或雙指可縮放模型
            </p>
          )}

          {/* Locked Overlay for Free Users */}
          {!isPro && (
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-slate-950/70 p-6 text-center backdrop-blur-sm">
              <div className="grid h-12 w-12 place-items-center rounded-2xl border border-amber-300/40 bg-amber-400/15 text-2xl shadow-[0_0_20px_rgba(251,191,36,.25)]">
                🔒
              </div>
              <h4 className="mt-3 text-base font-black text-amber-100">
                Nova Pro 尊榮解鎖：3D 沉浸式生物解剖模型
              </h4>
              <p className="mt-2 max-w-sm text-xs leading-5 text-slate-300">
                PRO 會員可享受 360° 自由拖曳旋轉、內部嵴微觀切面透視、高倍縮放與各構造考點即時高亮解說。
              </p>
              <div className="mt-4 flex gap-2">
                <Link href="/profile?tab=membership">
                  <Button size="sm">升級 Nova Pro 解鎖 3D</Button>
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Anatomical parts badges */}
        <div className="mt-4 w-full">
          <p className="text-xs font-semibold text-cyan-200">📌 核心解剖構造考點：</p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {info.parts.map((part, index) => (
              <button
                type="button"
                key={part.name}
                onClick={() => isPro && setActivePart(index)}
                className={`rounded-xl border p-2.5 text-left transition ${
                  activePart === index
                    ? "border-cyan-300 bg-cyan-300/15"
                    : "border-white/10 bg-white/[0.02] hover:border-white/30"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: part.color }}
                  />
                  <p className="text-xs font-bold text-white">{part.name}</p>
                </div>
                <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-muted">
                  {part.desc}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

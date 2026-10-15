/**
 * Procedural "film still" placeholders for the demo data: cinematic 16:9
 * SVGs (sky gradient, horizon, sun/moon, silhouettes, letterbox grain) that
 * vary by seed, so the board reads like a real production without network.
 */

type Mood = "dawn" | "night" | "storm" | "interior" | "noon" | "dusk";

const MOODS: Record<Mood, { sky: [string, string]; ground: string; light: string; sil: string }> = {
  dawn: { sky: ["#f2a65a", "#3b2f63"], ground: "#1d1626", light: "#ffd9a0", sil: "#120d18" },
  night: { sky: ["#0f1b3d", "#05070f"], ground: "#070a12", light: "#cfd8ff", sil: "#03050a" },
  storm: { sky: ["#5d6b78", "#1f262e"], ground: "#141a1f", light: "#e6eef5", sil: "#0b0f12" },
  interior: { sky: ["#6b4a2f", "#1b120c"], ground: "#24180f", light: "#ffcf8a", sil: "#120b06" },
  noon: { sky: ["#8ec5e8", "#3e7fb1"], ground: "#3d4b33", light: "#fffbe6", sil: "#1f2a1b" },
  dusk: { sky: ["#c2456b", "#2a1640"], ground: "#170d22", light: "#ffb38a", sil: "#0c0614" },
};

function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

export function frame(seed: string, mood: Mood): string {
  const r = rng(seed);
  const m = MOODS[mood];
  const horizon = 190 + r() * 80;
  const sunX = 80 + r() * 480;
  const sunY = horizon - 30 - r() * 90;
  const sunR = 14 + r() * 26;
  const shot = r(); // wide / medium / close composition
  let sil = "";
  if (mood === "interior") {
    // window + doorway + figure
    sil += `<rect x='${60 + r() * 120}' y='60' width='${120 + r() * 60}' height='170' fill='${m.light}' opacity='.18'/>`;
    sil += `<rect x='${380 + r() * 120}' y='90' width='70' height='250' fill='#000' opacity='.35'/>`;
  } else {
    // skyline / mountains
    let x = -10;
    let pts = `0,${horizon}`;
    while (x < 660) {
      x += 20 + r() * 60;
      pts += ` ${x},${horizon - (r() * (shot < 0.5 ? 70 : 30))}`;
    }
    sil += `<polygon points='${pts} 660,${horizon} 660,360 0,360' fill='${m.sil}' opacity='.9'/>`;
  }
  // character silhouette(s)
  const figures = shot < 0.33 ? 1 : shot < 0.66 ? 2 : 0;
  const scale = shot < 0.33 ? 1.9 : 1;
  for (let i = 0; i < figures; i++) {
    const fx = 150 + r() * 340 + i * 60;
    const fy = horizon + 10;
    const h = 70 * scale;
    sil += `<ellipse cx='${fx}' cy='${fy - h}' rx='${9 * scale}' ry='${11 * scale}' fill='${m.sil}'/>`;
    sil += `<path d='M${fx - 16 * scale},${fy + 40} Q${fx},${fy - h - 2} ${fx + 16 * scale},${fy + 40} Z' fill='${m.sil}'/>`;
  }
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 360' preserveAspectRatio='xMidYMid slice'>
<defs>
<linearGradient id='s' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${m.sky[1]}'/><stop offset='1' stop-color='${m.sky[0]}'/></linearGradient>
<radialGradient id='l' cx='${sunX / 640}' cy='${sunY / 360}' r='.6'><stop offset='0' stop-color='${m.light}' stop-opacity='.55'/><stop offset='1' stop-color='${m.light}' stop-opacity='0'/></radialGradient>
<radialGradient id='v' cx='.5' cy='.5' r='.75'><stop offset='.55' stop-color='#000' stop-opacity='0'/><stop offset='1' stop-color='#000' stop-opacity='.7'/></radialGradient>
<filter id='g'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' seed='${Math.floor(r() * 99)}'/><feColorMatrix values='0 0 0 0 .5 0 0 0 0 .5 0 0 0 0 .5 0 0 0 .09 0'/></filter>
</defs>
<rect width='640' height='360' fill='url(#s)'/>
<rect width='640' height='360' fill='url(#l)'/>
${mood === "interior" ? "" : `<circle cx='${sunX}' cy='${sunY}' r='${sunR}' fill='${m.light}' opacity='.9'/>`}
<rect y='${horizon}' width='640' height='${360 - horizon}' fill='${m.ground}'/>
${sil}
<rect width='640' height='360' fill='url(#v)'/>
<rect width='640' height='360' filter='url(#g)'/>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export type { Mood };

"use client";

/**
 * ProjectOverview — the beautiful, branded landing for a project. Presentation-first,
 * styled after the series bible (Cormorant Garamond + Inter; dark/cream/gold/blood
 * palette). Self-contained styling (scoped under .pb-ov) so it can't affect the rest
 * of the app. Data-driven from the existing GET endpoints; imagery lazy-loaded via the
 * dedicated /image endpoints (base64 in DB → fetch on scroll-into-view).
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// ---- per-project theme (P&B = the bible look; others get the same template, neutral accent) ----
interface Theme {
  displayTitle?: string;
  studio: string;
  tagline: string;
  synopsis: string;
  accent: string; // gold for P&B
}
function themeFor(title: string, productionNotes?: string | null): Theme {
  const t = (title || "").toLowerCase();
  if (t.includes("porcelain")) {
    return {
      displayTitle: "Porcelain & Blood",
      studio: "Lumovex · Blackforge Partners",
      tagline: "Sent to Die · A Time-Travel Microdrama",
      synopsis:
        "Jing Li GreenHill, a broke Amerasian artist in 2037 San Francisco, is sent by the dying collector Ying Hui back to 1807 Canton to recover two missing jade immortals — and discovers that love is lethal and her enemy is her own ancestor. Two eras, one bloodline, an eye that warns when death is near.",
      accent: "#c9a227",
    };
  }
  return {
    studio: "Lumovex",
    tagline: "",
    synopsis: (productionNotes || "").split(". ").slice(0, 2).join(". "),
    accent: "#c9a227",
  };
}

// ---- types (loose; only the fields we render) ----
interface OProject { id: string; title: string; type?: string; production_notes?: string | null; episode_number?: number | null; }
interface OChar { id: string; name: string; role?: string | null; description?: string | null; locked?: boolean; approved_cast_id?: string | null; element_preview_url?: string | null; }
interface OLoc { id: string; name: string; description?: string | null; time_of_day?: string | null; locked?: boolean; element_preview_url?: string | null; }
interface OScene { id: string; scene_number: number; location?: string | null; episode_number?: number | null; episode_title?: string | null; }
interface OFilm { id: string; label?: string | null; scope?: string; scene_id?: string | null; video_url?: string | null; duration_seconds?: number | null; status?: string; }

async function getJSON<T>(url: string): Promise<T | null> {
  try { const r = await fetch(url); if (!r.ok) return null; return (await r.json()) as T; } catch { return null; }
}

// elegant fallback: a monogram on a panel when there's no art
function Monogram({ name, ratio = "3 / 4" }: { name: string; ratio?: string }) {
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  return <div className="pb-img pb-mono" style={{ aspectRatio: ratio }}><span>{initial}</span></div>;
}

// picks the best image source: a direct preview URL (cloudfront, native-lazy),
// else the JSON /image endpoint (lazy-fetch), else a monogram.
function CardImage({ direct, endpoint, field, name, ratio = "3 / 4" }: { direct?: string | null; endpoint?: string; field?: string; name: string; ratio?: string }) {
  if (direct) return <div className="pb-img" style={{ aspectRatio: ratio }}><img src={direct} alt={name} loading="lazy" /></div>;
  if (endpoint && field) return <LazyImageFallback url={endpoint} field={field} alt={name} ratio={ratio} name={name} />;
  return <Monogram name={name} ratio={ratio} />;
}

// LazyImage variant that falls back to a monogram instead of a dead shimmer
function LazyImageFallback({ url, field, alt, ratio, name }: { url: string; field: string; alt: string; ratio: string; name: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [seen, setSeen] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!ref.current || seen) return;
    const ob = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setSeen(true); ob.disconnect(); } }, { rootMargin: "300px" });
    ob.observe(ref.current);
    return () => ob.disconnect();
  }, [seen]);
  useEffect(() => {
    if (!seen) return; let live = true;
    getJSON<Record<string, string>>(url).then((d) => { if (!live) return; const v = d?.[field]; if (v) setSrc(v); else setFailed(true); });
    return () => { live = false; };
  }, [seen, url, field]);
  if (failed) return <Monogram name={name} ratio={ratio} />;
  return <div ref={ref} className="pb-img" style={{ aspectRatio: ratio }}>{src ? <img src={src} alt={alt} /> : <div className="pb-img-ph" />}</div>;
}

export default function ProjectOverview({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<OProject | null>(null);
  const [chars, setChars] = useState<OChar[]>([]);
  const [locs, setLocs] = useState<OLoc[]>([]);
  const [scenes, setScenes] = useState<OScene[]>([]);
  const [films, setFilms] = useState<OFilm[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // load the Google fonts once
    if (!document.getElementById("pb-fonts")) {
      const l = document.createElement("link");
      l.id = "pb-fonts"; l.rel = "stylesheet";
      l.href = "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Inter:wght@300;400;500;600&display=swap";
      document.head.appendChild(l);
    }
  }, []);

  useEffect(() => {
    let live = true;
    (async () => {
      const [p, cast, loc, scn, asm] = await Promise.all([
        getJSON<{ project: OProject } | OProject>(`/api/projects/${projectId}`),
        getJSON<{ characters: OChar[] }>(`/api/projects/${projectId}/cast`),
        getJSON<{ locations: OLoc[] }>(`/api/projects/${projectId}/locations`),
        getJSON<{ scenes: OScene[] }>(`/api/projects/${projectId}/scenes`),
        getJSON<{ assemblies?: OFilm[]; assembled?: OFilm[] }>(`/api/projects/${projectId}/assembly`),
      ]);
      if (!live) return;
      const proj = (p as { project?: OProject })?.project ?? (p as OProject) ?? null;
      setProject(proj);
      setChars((cast?.characters || []).filter((c) => !c.role || true));
      setLocs(loc?.locations || []);
      setScenes(scn?.scenes || []);
      setFilms(((asm?.assemblies || asm?.assembled || []) as OFilm[]).filter((f) => f.video_url));
      setLoading(false);
    })();
    return () => { live = false; };
  }, [projectId]);

  const theme = themeFor(project?.title || "", project?.production_notes);

  // group scenes into episodes
  const episodes = (() => {
    const m = new Map<number, { ep: number; title: string; scenes: OScene[] }>();
    for (const s of scenes) {
      const ep = s.episode_number ?? 0;
      if (!m.has(ep)) m.set(ep, { ep, title: (s.episode_title || "").replace(/^S\d+E\d+\s*—\s*/, "") || `Episode ${ep}`, scenes: [] });
      m.get(ep)!.scenes.push(s);
    }
    return [...m.values()].filter((e) => e.ep > 0).sort((a, b) => a.ep - b.ep);
  })();

  return (
    <div className="pb-ov" style={{ ["--accent" as string]: theme.accent }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* top bar */}
      <div className="pb-top">
        <Link href="/projects" className="pb-back">← All projects</Link>
        <nav className="pb-nav">
          <a href="#story">Story</a><a href="#characters">Characters</a><a href="#locations">Locations</a><a href="#episodes">Episodes</a><a href="#films">Films</a>
        </nav>
        <Link href={`/projects/${projectId}/workspace`} className="pb-work">Production workspace →</Link>
      </div>

      {/* hero */}
      <header className="pb-hero">
        <div className="pb-kicker">{theme.studio.toUpperCase()}</div>
        <h1 className="pb-title">{theme.displayTitle || project?.title || (loading ? "…" : "Project")}</h1>
        {theme.tagline && <div className="pb-tagline">{theme.tagline}</div>}
        <div className="pb-rule" />
        <p className="pb-logline">{theme.synopsis}</p>
      </header>

      {/* story */}
      {project?.production_notes && (
        <section id="story" className="pb-sec">
          <h2 className="pb-h2">Story</h2>
          <p className="pb-body">{theme.synopsis}</p>
        </section>
      )}

      {/* characters */}
      {chars.length > 0 && (
        <section id="characters" className="pb-sec">
          <h2 className="pb-h2">Characters <span className="pb-count">{chars.length}</span></h2>
          <div className="pb-grid pb-grid-char">
            {chars.map((c) => {
              const locked = !!(c.element_preview_url || c.locked);
              return (
                <figure key={c.id} className={`pb-card${locked ? " pb-locked" : ""}`}>
                  <CardImage
                    direct={c.element_preview_url}
                    endpoint={c.approved_cast_id ? `/api/projects/${projectId}/cast/image?variation_id=${c.approved_cast_id}` : undefined}
                    field="image_url" name={c.name} ratio="3 / 4"
                  />
                  <figcaption>
                    <div className="pb-name">{c.name}</div>
                    {c.role && <div className="pb-role">{c.role}</div>}
                  </figcaption>
                  {locked && <span className="pb-tag">Locked</span>}
                </figure>
              );
            })}
          </div>
        </section>
      )}

      {/* locations */}
      {locs.length > 0 && (
        <section id="locations" className="pb-sec">
          <h2 className="pb-h2">Locations <span className="pb-count">{locs.length}</span></h2>
          <div className="pb-grid pb-grid-loc">
            {locs.map((l) => (
              <figure key={l.id} className="pb-plate">
                <CardImage
                  direct={l.element_preview_url}
                  endpoint={`/api/projects/${projectId}/locations/image?location_id=${l.id}&type=approved`}
                  field="approved_image_url" name={l.name} ratio="16 / 10"
                />
                <figcaption><span>{l.name}</span>{l.time_of_day && <em>{l.time_of_day}</em>}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {/* episodes */}
      {episodes.length > 0 && (
        <section id="episodes" className="pb-sec">
          <h2 className="pb-h2">Episodes <span className="pb-count">{episodes.length}</span></h2>
          <ol className="pb-eps">
            {episodes.map((e) => (
              <li key={e.ep} className="pb-ep">
                <span className="pb-epno">{String(e.ep).padStart(2, "0")}</span>
                <span className="pb-eptitle">{e.title}</span>
                <span className="pb-epmeta">{e.scenes.length} scene{e.scenes.length === 1 ? "" : "s"}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* films */}
      {films.length > 0 && (
        <section id="films" className="pb-sec">
          <h2 className="pb-h2">Finished films <span className="pb-count">{films.length}</span></h2>
          <div className="pb-grid pb-grid-film">
            {films.map((f) => (
              <figure key={f.id} className="pb-film">
                <video src={f.video_url || undefined} controls playsInline preload="metadata" />
                <figcaption>{f.label || f.scope || "Cut"}{f.duration_seconds ? ` · ${Math.round(f.duration_seconds)}s` : ""}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {loading && <div className="pb-loading">Loading the project…</div>}

      <footer className="pb-foot">
        <div>{theme.studio}</div>
        <div className="pb-tech">Generated with the AI Film Pipeline · Higgsfield Nano Banana Pro</div>
      </footer>
    </div>
  );
}

const CSS = `
.pb-ov{--ink:#0b0b0d;--panel:#100e13;--panel2:#1b1820;--cream:#ded7c9;--bright:#f3efe6;--muted:#a89f93;--blood:#b3122a;--jade:#3f6b5e;
  background:var(--ink);color:var(--cream);font-family:'Inter',system-ui,sans-serif;min-height:100vh;line-height:1.6;
  background-image:radial-gradient(1200px 600px at 50% -10%, rgba(201,162,39,.06), transparent 60%);}
.pb-ov *{box-sizing:border-box}
.pb-ov a{color:inherit;text-decoration:none}
.pb-top{position:sticky;top:0;z-index:20;display:flex;align-items:center;justify-content:space-between;gap:16px;
  padding:14px 28px;background:rgba(11,11,13,.96);border-bottom:1px solid rgba(222,215,201,.08);font-size:13px}
.pb-back,.pb-work{color:var(--muted)} .pb-work{color:var(--accent)}
.pb-nav{display:flex;gap:22px} .pb-nav a{color:var(--muted);letter-spacing:.04em;font-size:12px;text-transform:uppercase;transition:color .2s}
.pb-nav a:hover{color:var(--bright)}
.pb-hero{text-align:center;padding:96px 24px 70px;max-width:900px;margin:0 auto}
.pb-kicker{font-size:11px;letter-spacing:.42em;color:var(--accent);margin-bottom:26px}
.pb-title{font-family:'Cormorant Garamond',serif;font-weight:600;font-size:clamp(54px,9vw,108px);line-height:.98;margin:0;color:var(--bright);letter-spacing:.5px}
.pb-tagline{font-family:'Cormorant Garamond',serif;font-style:italic;font-size:clamp(18px,2.4vw,26px);color:var(--muted);margin-top:18px}
.pb-rule{width:64px;height:1px;background:var(--accent);margin:34px auto 30px;opacity:.8}
.pb-logline{font-size:17px;color:var(--cream);max-width:680px;margin:0 auto;opacity:.92}
.pb-sec{max-width:1120px;margin:0 auto;padding:46px 28px}
.pb-h2{font-family:'Cormorant Garamond',serif;font-weight:600;font-size:34px;color:var(--bright);margin:0 0 26px;display:flex;align-items:baseline;gap:12px;
  border-bottom:1px solid rgba(222,215,201,.1);padding-bottom:12px}
.pb-count{font-family:'Inter';font-size:13px;color:var(--accent);font-weight:500}
.pb-body{font-size:16px;color:var(--cream);max-width:760px;opacity:.9}
.pb-grid{display:grid;gap:18px}
.pb-grid-char{grid-template-columns:repeat(auto-fill,minmax(180px,1fr))}
.pb-grid-loc{grid-template-columns:repeat(auto-fill,minmax(300px,1fr))}
.pb-grid-film{grid-template-columns:repeat(auto-fill,minmax(240px,1fr))}
.pb-card{margin:0;background:var(--panel);border:1px solid rgba(222,215,201,.08);border-radius:10px;overflow:hidden;position:relative;transition:transform .25s,border-color .25s}
.pb-card:hover{transform:translateY(-3px);border-color:rgba(201,162,39,.4)}
.pb-locked{border-color:rgba(201,162,39,.32)}
.pb-card figcaption{padding:12px 14px}
.pb-name{font-family:'Cormorant Garamond',serif;font-size:21px;color:var(--bright);line-height:1.1}
.pb-role{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-top:4px}
.pb-desc{font-size:12px;color:var(--muted);margin-top:8px;opacity:.85}
.pb-textcard{padding:16px}
.pb-tag{position:absolute;top:10px;right:10px;font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:#1b1407;background:var(--accent);padding:3px 8px;border-radius:999px;font-weight:600}
.pb-plate{margin:0;border-radius:10px;overflow:hidden;position:relative;border:1px solid rgba(222,215,201,.08)}
.pb-plate figcaption{position:absolute;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:space-between;
  padding:14px 14px 12px;background:linear-gradient(transparent,rgba(8,8,10,.86));font-family:'Cormorant Garamond',serif;font-size:20px;color:var(--bright)}
.pb-plate figcaption em{font-family:'Inter';font-style:normal;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.pb-img{width:100%;background:var(--panel2);overflow:hidden}
.pb-img img{width:100%;height:100%;object-fit:cover;display:block}
.pb-img-ph{width:100%;height:100%;background:linear-gradient(100deg,var(--panel2) 30%,#241f2b 50%,var(--panel2) 70%);background-size:200% 100%;animation:pbsh 1.4s linear infinite}
.pb-img-fail{animation:none;opacity:.4}
@keyframes pbsh{to{background-position:-200% 0}}
.pb-mono{display:flex;align-items:center;justify-content:center;background:radial-gradient(120% 120% at 50% 0%,#241f2b,var(--panel) 70%)}
.pb-mono span{font-family:'Cormorant Garamond',serif;font-size:54px;color:var(--accent);opacity:.5}
.pb-eps{list-style:none;margin:0;padding:0;border-top:1px solid rgba(222,215,201,.08)}
.pb-ep{display:flex;align-items:baseline;gap:20px;padding:16px 6px;border-bottom:1px solid rgba(222,215,201,.08);transition:background .2s}
.pb-ep:hover{background:rgba(201,162,39,.04)}
.pb-epno{font-family:'Cormorant Garamond',serif;font-size:26px;color:var(--accent);width:44px;flex:none}
.pb-eptitle{font-family:'Cormorant Garamond',serif;font-size:23px;color:var(--bright);flex:1}
.pb-epmeta{font-size:12px;color:var(--muted);letter-spacing:.04em}
.pb-grid-film .pb-film{margin:0}
.pb-film video{width:100%;border-radius:10px;background:#000;display:block;aspect-ratio:9/16;object-fit:cover}
.pb-film figcaption{font-size:12px;color:var(--muted);margin-top:8px;text-align:center}
.pb-loading{text-align:center;color:var(--muted);padding:40px}
.pb-foot{max-width:1120px;margin:40px auto 0;padding:34px 28px 60px;border-top:1px solid rgba(222,215,201,.08);
  display:flex;justify-content:space-between;align-items:center;gap:16px;color:var(--muted);font-size:12px;flex-wrap:wrap}
.pb-foot div:first-child{font-family:'Cormorant Garamond',serif;font-size:17px;color:var(--cream)}
.pb-tech{letter-spacing:.04em;opacity:.7}
@media(max-width:640px){.pb-nav{display:none}.pb-hero{padding:60px 20px 44px}}
`;

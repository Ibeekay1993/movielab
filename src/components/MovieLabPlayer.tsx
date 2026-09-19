import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { AlertCircle, Maximize, Minimize, Pause, PictureInPicture2, Play, RotateCcw, RotateCw, Settings2, Volume2, VolumeX } from "lucide-react";

type Props = { src: string; title: string; poster?: string; storageKey: string; onEnded?: () => void };

function time(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const s = Math.floor(value), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? h + ":" + String(m).padStart(2, "0") + ":" + String(sec).padStart(2, "0") : m + ":" + String(sec).padStart(2, "0");
}

export default function MovieLabPlayer({ src, title, poster, storageKey, onEnded }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const saveRef = useRef<number | null>(null);
  const [playing, setPlaying] = useState(false), [current, setCurrent] = useState(0), [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0), [volume, setVolume] = useState(.8), [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false), [speed, setSpeed] = useState(1), [quality, setQuality] = useState(-1);
  const [qualities, setQualities] = useState<string[]>([]), [error, setError] = useState<string | null>(null), [controls, setControls] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const hls = new Hls({ enableWorker: true, capLevelToPlayerSize: true, backBufferLength: 90, maxBufferLength: 30 });
    hlsRef.current = hls;
    const saved = Number(localStorage.getItem(storageKey) || 0);
    const onMeta = () => {
      setDuration(video.duration || 0);
      if (saved > 5 && saved < video.duration - 15) video.currentTime = saved;
    };
    const onTime = () => {
      setCurrent(video.currentTime);
      if (video.buffered.length && video.duration) setBuffered((video.buffered.end(video.buffered.length - 1) / video.duration) * 100);
      if (saveRef.current) clearTimeout(saveRef.current);
      saveRef.current = window.setTimeout(() => localStorage.setItem(storageKey, String(Math.floor(video.currentTime))), 700);
    };
    const onEndedEvent = () => { localStorage.removeItem(storageKey); setPlaying(false); onEnded?.(); };
    const onError = () => setError("MovieLab could not play this media.");
    video.addEventListener("loadedmetadata", onMeta); video.addEventListener("timeupdate", onTime); video.addEventListener("progress", onTime);
    video.addEventListener("play", () => setPlaying(true)); video.addEventListener("pause", () => setPlaying(false));
    video.addEventListener("ended", onEndedEvent); video.addEventListener("error", onError);
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement)); document.addEventListener("fullscreenchange", onFs);
    setError(null); setCurrent(0); setBuffered(0); setQualities([]); setQuality(-1);

    if (/\.m3u8(?:$|\?)/i.test(src)) {
      if (Hls.isSupported()) {
        hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => setQualities(Array.from(new Set(data.levels.map(l => l.height ? l.height + "p" : Math.round(l.bitrate / 1000) + " kbps")))));
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (!data.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) return void hls.startLoad();
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) return void hls.recoverMediaError();
          setError("The stream could not recover from a playback error.");
        });
        hls.loadSource(src); hls.attachMedia(video);
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) video.src = src;
      else setError("This browser does not support HLS playback.");
    } else video.src = src;

    return () => {
      if (saveRef.current) clearTimeout(saveRef.current);
      hls.destroy(); hlsRef.current = null; video.pause(); video.removeAttribute("src"); video.load();
      document.removeEventListener("fullscreenchange", onFs);
    };
  }, [src, storageKey, onEnded]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.matches("input,select")) return;
      if (e.key === " " || e.key.toLowerCase() === "k") { e.preventDefault(); void togglePlay(); }
      if (e.key === "ArrowLeft") { e.preventDefault(); seek(-10); }
      if (e.key === "ArrowRight") { e.preventDefault(); seek(10); }
      if (e.key.toLowerCase() === "f") { e.preventDefault(); void fullscreenToggle(); }
      if (e.key.toLowerCase() === "m") { e.preventDefault(); muteToggle(); }
    };
    shell.addEventListener("keydown", key); return () => shell.removeEventListener("keydown", key);
  });

  async function togglePlay() {
    const v = videoRef.current; if (!v) return;
    if (v.paused) { setError(null); try { await v.play(); } catch { setError("Playback was blocked. Press play again."); } } else v.pause();
  }
  function seek(delta: number) { const v = videoRef.current; if (v) v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + delta)); }
  function muteToggle() { const v = videoRef.current; if (!v) return; v.muted = !v.muted; setMuted(v.muted); }
  async function fullscreenToggle() { const el = shellRef.current; if (!el) return; if (document.fullscreenElement) await document.exitFullscreen(); else await el.requestFullscreen(); }
  async function pipToggle() { const v = videoRef.current; if (!v || !document.pictureInPictureEnabled || !v.requestPictureInPicture) return; if (document.pictureInPictureElement) await document.exitPictureInPicture(); else await v.requestPictureInPicture(); }
  function qualityChange(value: number) { const hls = hlsRef.current; if (hls) { hls.currentLevel = value; setQuality(value); } }

  return <div ref={shellRef} className={"movielab-player" + (controls ? " controls-on" : "")} tabIndex={0}
    onMouseMove={() => setControls(true)} onMouseLeave={() => playing && setControls(false)} onDoubleClick={() => void fullscreenToggle()}>
    <video ref={videoRef} className="movielab-video" poster={poster} playsInline preload="metadata" />
    {!playing && !error && <button className="player-big-play" onClick={() => void togglePlay()} aria-label={"Play " + title}><Play size={30} fill="currentColor" /></button>}
    {error && <div className="player-error"><AlertCircle size={22}/><span>{error}</span><button onClick={() => { setError(null); void togglePlay(); }}>Retry</button></div>}
    <div className="player-scrim"/>
    <div className="player-controls">
      <div className="player-progress"><span style={{width: buffered + "%"}}/><input type="range" min="0" max={duration || 0} step=".1" value={current} onChange={e => { const v=videoRef.current; if(v) v.currentTime=Number(e.target.value); }} aria-label="Seek"/></div>
      <div className="player-toolbar">
        <div className="player-left">
          <button onClick={() => void togglePlay()} aria-label={playing ? "Pause" : "Play"}>{playing ? <Pause size={18}/> : <Play size={18}/>}</button>
          <button onClick={() => seek(-10)} aria-label="Back 10 seconds"><RotateCcw size={16}/><span>10</span></button>
          <button onClick={() => seek(10)} aria-label="Forward 10 seconds"><RotateCw size={16}/><span>10</span></button>
          <button onClick={muteToggle} aria-label={muted ? "Unmute" : "Mute"}>{muted ? <VolumeX size={18}/> : <Volume2 size={18}/>}</button>
          <input className="player-volume" type="range" min="0" max="1" step=".05" value={muted ? 0 : volume} onChange={e => { const n=Number(e.target.value),v=videoRef.current;if(v){v.volume=n;v.muted=n===0;}setVolume(n);setMuted(n===0); }} aria-label="Volume"/>
          <span className="player-time">{time(current)} / {time(duration)}</span>
        </div>
        <div className="player-right">
          {qualities.length > 0 && <label className="player-select"><span>Quality</span><select value={quality} onChange={e => qualityChange(Number(e.target.value))}><option value="-1">Auto</option>{qualities.map((q,i)=><option key={q} value={i}>{q}</option>)}</select></label>}
          <label className="player-select"><Settings2 size={14}/><select value={speed} onChange={e => {const n=Number(e.target.value);setSpeed(n);if(videoRef.current)videoRef.current.playbackRate=n;}} aria-label="Playback speed"><option value="0.75">0.75×</option><option value="1">1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></label>
          {document.pictureInPictureEnabled && <button onClick={() => void pipToggle()} aria-label="Picture in picture"><PictureInPicture2 size={17}/></button>}
          <button onClick={() => void fullscreenToggle()} aria-label="Fullscreen">{fullscreen ? <Minimize size={18}/> : <Maximize size={18}/>}</button>
        </div>
      </div>
    </div>
  </div>;
}

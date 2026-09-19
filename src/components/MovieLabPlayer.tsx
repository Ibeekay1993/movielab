import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { AlertCircle, Maximize, Minimize, Pause, PictureInPicture2, Play, RotateCcw, RotateCw, Settings2, Volume2, VolumeX } from "lucide-react";

type Props = { src: string; title: string; poster?: string; storageKey: string; onEnded?: () => void };
type Quality = { level: number; label: string };

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
  const hideRef = useRef<number | null>(null);
  const retryRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(.8);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [quality, setQuality] = useState(-1);
  const [qualities, setQualities] = useState<Quality[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [controls, setControls] = useState(true);

  function revealControls() {
    setControls(true);
    if (hideRef.current) window.clearTimeout(hideRef.current);
    if (playing) hideRef.current = window.setTimeout(() => setControls(false), 2800);
  }

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const isHls = /\.m3u8(?:$|\?)/i.test(src);
    const hls = isHls && Hls.isSupported()
      ? new Hls({ enableWorker: true, capLevelToPlayerSize: true, backBufferLength: 90, maxBufferLength: 30 })
      : null;
    hlsRef.current = hls;

    const saved = Number(localStorage.getItem(storageKey) || 0);
    const onMeta = () => {
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
      video.volume = volume;
      if (saved > 5 && saved < video.duration - 15) video.currentTime = saved;
    };
    const onTime = () => {
      setCurrent(video.currentTime);
      if (video.buffered.length && video.duration) {
        setBuffered((video.buffered.end(video.buffered.length - 1) / video.duration) * 100);
      }
      if (saveRef.current) window.clearTimeout(saveRef.current);
      saveRef.current = window.setTimeout(() => {
        localStorage.setItem(storageKey, String(Math.floor(video.currentTime)));
      }, 700);
    };
    const onPlay = () => { setPlaying(true); revealControls(); };
    const onPause = () => { setPlaying(false); setControls(true); };
    const onEndedEvent = () => { localStorage.removeItem(storageKey); setPlaying(false); setControls(true); onEnded?.(); };
    const onError = () => setError("MovieLab could not play this media. Check that the source is a valid video or HLS manifest.");
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));

    video.addEventListener("loadedmetadata", onMeta);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("progress", onTime);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", onEndedEvent);
    video.addEventListener("error", onError);
    document.addEventListener("fullscreenchange", onFs);

    setError(null);
    setCurrent(0);
    setBuffered(0);
    setQualities([]);
    setQuality(-1);
    retryRef.current = 0;

    if (isHls) {
      if (hls) {
        const onManifest = (_event: string, data: { levels: Array<{ height?: number; bitrate: number }> }) => {
          setQualities(data.levels.map((level, index) => ({
            level: index,
            label: level.height ? level.height + "p" : Math.round(level.bitrate / 1000) + " kbps",
          })));
        };
        const onHlsError = (_event: string, data: { fatal: boolean; type: string }) => {
          if (!data.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR && retryRef.current < 2) {
            retryRef.current += 1;
            window.setTimeout(() => hls.startLoad(), retryRef.current * 1000);
            return;
          }
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR && retryRef.current < 3) {
            retryRef.current += 1;
            hls.recoverMediaError();
            return;
          }
          setError("The HLS stream could not recover from a playback error.");
        };
        hls.on(Hls.Events.MANIFEST_PARSED, onManifest);
        hls.on(Hls.Events.ERROR, onHlsError);
        hls.loadSource(src);
        hls.attachMedia(video);

        return () => {
          hls.off(Hls.Events.MANIFEST_PARSED, onManifest);
          hls.off(Hls.Events.ERROR, onHlsError);
          hls.destroy();
          hlsRef.current = null;
          cleanup();
        };
      }
      if (video.canPlayType("application/vnd.apple.mpegurl")) video.src = src;
      else setError("This browser does not support HLS playback.");
    } else {
      video.src = src;
    }

    const cleanup = () => {
      if (saveRef.current) window.clearTimeout(saveRef.current);
      if (hideRef.current) window.clearTimeout(hideRef.current);
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("progress", onTime);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onEndedEvent);
      video.removeEventListener("error", onError);
      document.removeEventListener("fullscreenchange", onFs);
      video.pause();
      video.removeAttribute("src");
      video.load();
    }

    return () => {
      if (hls) hls.destroy();
      hlsRef.current = null;
      cleanup();
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
    shell.addEventListener("keydown", key);
    return () => shell.removeEventListener("keydown", key);
  });

  async function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      setError(null);
      try { await v.play(); } catch { setError("Playback was blocked. Press play again."); }
    } else v.pause();
  }

  function seek(delta: number) {
    const v = videoRef.current;
    if (v && Number.isFinite(v.duration)) v.currentTime = Math.max(0, Math.min(v.duration, v.currentTime + delta));
    revealControls();
  }

  function muteToggle() {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
    revealControls();
  }

  async function fullscreenToggle() {
    const el = shellRef.current;
    if (!el) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await el.requestFullscreen();
  }

  async function pipToggle() {
    const v = videoRef.current;
    if (!v || !document.pictureInPictureEnabled || !v.requestPictureInPicture) return;
    if (document.pictureInPictureElement) await document.exitPictureInPicture();
    else await v.requestPictureInPicture();
  }

  function qualityChange(value: number) {
    const hls = hlsRef.current;
    if (!hls) return;
    hls.currentLevel = value;
    setQuality(value);
  }

  return <div
    ref={shellRef}
    className={"movielab-player" + (controls ? " controls-on" : "")}
    tabIndex={0}
    onMouseMove={revealControls}
    onTouchStart={revealControls}
    onMouseLeave={() => playing && setControls(false)}
    onDoubleClick={() => void fullscreenToggle()}
  >
    <video ref={videoRef} className="movielab-video" poster={poster} playsInline preload="metadata" />
    {!playing && !error && <button className="player-big-play" onClick={() => void togglePlay()} aria-label={"Play " + title}><Play size={30} fill="currentColor" /></button>}
    {error && <div className="player-error"><AlertCircle size={22}/><span>{error}</span><button onClick={() => { setError(null); retryRef.current = 0; void togglePlay(); }}>Retry</button></div>}
    <div className="player-scrim"/>
    <div className="player-controls">
      <div className="player-progress">
        <span style={{width: buffered + "%"}}/>
        <input type="range" min="0" max={duration || 0} step=".1" value={current} onChange={e => { const v=videoRef.current; if(v) v.currentTime=Number(e.target.value); revealControls(); }} aria-label="Seek"/>
      </div>
      <div className="player-toolbar">
        <div className="player-left">
          <button onClick={() => void togglePlay()} aria-label={playing ? "Pause" : "Play"}>{playing ? <Pause size={18}/> : <Play size={18}/>}</button>
          <button onClick={() => seek(-10)} aria-label="Back 10 seconds"><RotateCcw size={16}/><span>10</span></button>
          <button onClick={() => seek(10)} aria-label="Forward 10 seconds"><RotateCw size={16}/><span>10</span></button>
          <button onClick={muteToggle} aria-label={muted ? "Unmute" : "Mute"}>{muted ? <VolumeX size={18}/> : <Volume2 size={18}/>}</button>
          <input className="player-volume" type="range" min="0" max="1" step=".05" value={muted ? 0 : volume} onChange={e => { const n=Number(e.target.value),v=videoRef.current;if(v){v.volume=n;v.muted=n===0;}setVolume(n);setMuted(n===0);revealControls(); }} aria-label="Volume"/>
          <span className="player-time">{time(current)} / {time(duration)}</span>
        </div>
        <div className="player-right">
          {qualities.length > 0 && <label className="player-select"><span>Quality</span><select value={quality} onChange={e => qualityChange(Number(e.target.value))}><option value="-1">Auto</option>{qualities.map(q => <option key={q.level} value={q.level}>{q.label}</option>)}</select></label>}
          <label className="player-select"><Settings2 size={14}/><select value={speed} onChange={e => {const n=Number(e.target.value);setSpeed(n);if(videoRef.current)videoRef.current.playbackRate=n;revealControls();}} aria-label="Playback speed"><option value="0.75">0.75×</option><option value="1">1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></label>
          {typeof document !== "undefined" && document.pictureInPictureEnabled && <button onClick={() => void pipToggle()} aria-label="Picture in picture"><PictureInPicture2 size={17}/></button>}
          <button onClick={() => void fullscreenToggle()} aria-label="Fullscreen">{fullscreen ? <Minimize size={18}/> : <Maximize size={18}/>}</button>
        </div>
      </div>
    </div>
  </div>;
}

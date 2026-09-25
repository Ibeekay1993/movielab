import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { UploadCloud, Film, CheckCircle2, AlertCircle, LoaderCircle } from "lucide-react";
import { Upload } from "tus-js-client";
import { supabase } from "../lib/supabase";

type StorageProvider = "cloudflare_stream" | "gofile";
type RightsStatus = "unknown" | "authorized" | "licensed";

export default function MediaLibrary() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [titleId, setTitleId] = useState("");
  const [episodeId, setEpisodeId] = useState("");
  const [rights, setRights] = useState<RightsStatus>("unknown");
  const [provider, setProvider] = useState<StorageProvider>("gofile");
  const [quality, setQuality] = useState("1080p");
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  function resetState() {
    setError("");
    setStatus("");
    setProgress(0);
  }

  async function uploadToCloudflare(sessionToken: string) {
    const res = await supabase!.functions.invoke("media-upload", {
      body: {
        filename: file!.name,
        title_id: titleId || null,
        episode_id: episodeId || null,
        rights_status: rights,
        max_duration_seconds: 14400,
      },
    });

    if (res.error || !res.data?.upload_url) {
      throw new Error(res.error?.message ?? res.data?.error ?? "Could not create Cloudflare upload.");
    }

    setStatus("Uploading and processing…");
    await new Promise<void>((resolve, reject) => {
      const uploader = new Upload(file!, {
        uploadUrl: res.data.upload_url,
        retryDelays: [0, 1000, 3000, 5000, 10000],
        metadata: { filename: file!.name, filetype: file!.type || "video/mp4" },
        onError: reject,
        onProgress: (sent, total) => setProgress(Math.round((sent / total) * 100)),
        onSuccess: resolve,
      });
      uploader.start();
    });

    void sessionToken;
  }

  async function uploadToGoFile(sessionToken: string) {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    if (!supabaseUrl) throw new Error("VITE_SUPABASE_URL is not configured.");

    const form = new FormData();
    form.append("file", file!, file!.name);

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", supabaseUrl.replace(/\/$/, "") + "/functions/v1/gofile-upload");
      xhr.setRequestHeader("Authorization", "Bearer " + sessionToken);
      xhr.setRequestHeader("apikey", import.meta.env.VITE_SUPABASE_ANON_KEY ?? "");
      xhr.setRequestHeader("x-movielab-title-id", titleId);
      xhr.setRequestHeader("x-movielab-episode-id", episodeId);
      xhr.setRequestHeader("x-movielab-rights-status", rights);
      xhr.setRequestHeader("x-movielab-quality", quality);
      xhr.setRequestHeader("x-movielab-filename", file!.name);
      xhr.setRequestHeader("x-movielab-mime-type", file!.type || "video/mp4");

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
      };

      xhr.onerror = () => reject(new Error("Network error while uploading to GoFile."));
      xhr.onload = () => {
        let payload: { ok?: boolean; error?: string; message?: string } = {};
        try { payload = JSON.parse(xhr.responseText); } catch { /* handled below */ }
        if (xhr.status >= 200 && xhr.status < 300 && payload.ok) {
          setStatus(payload.message ?? "GoFile upload complete.");
          resolve();
          return;
        }
        reject(new Error(payload.error ?? "GoFile upload failed."));
      };

      xhr.send(form);
    });
  }

  async function upload() {
    resetState();

    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }

    if (!file || (!titleId && !episodeId)) {
      setError("Select a media file and provide a title or episode ID.");
      return;
    }

    if (titleId && episodeId) {
      setError("Use either a title ID for a movie or an episode ID for a series episode, not both.");
      return;
    }

    setStatus("Checking CMS permissions…");

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setError("Sign in to MovieLab CMS first.");
      setStatus("");
      return;
    }

    try {
      if (provider === "gofile") {
        setStatus("Uploading directly through MovieLab to GoFile…");
        await uploadToGoFile(session.access_token);
      } else {
        await uploadToCloudflare(session.access_token);
        setStatus("Upload complete. Cloudflare Stream is processing the video.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("");
    }
  }

  return <main className="page media-library">
    <div className="page-head">
      <div>
        <span className="eyebrow plain">MovieLab CMS</span>
        <h1>Media Library</h1>
        <p>Store MovieLab originals and partner-authorized masters without tying the catalogue to one storage provider.</p>
      </div>
      <Link className="button button-glass" to="/">Back to MovieLab</Link>
    </div>

    <section className="upload-card">
      <div className="upload-drop" onClick={() => inputRef.current?.click()}>
        <input
          ref={inputRef}
          hidden
          type="file"
          accept="video/*,.mkv,.mp4,.mov,.webm"
          onChange={e => { setFile(e.target.files?.[0] ?? null); resetState(); }}
        />
        {file
          ? <><CheckCircle2 size={30}/><strong>{file.name}</strong><span>{(file.size / 1024 / 1024 / 1024).toFixed(2)} GB selected</span></>
          : <><UploadCloud size={34}/><strong>Choose a movie or episode</strong><span>MovieLab sends the video to the selected storage provider.</span></>}
      </div>

      <div className="upload-fields">
        <label>
          Storage provider
          <select value={provider} onChange={e => setProvider(e.target.value as StorageProvider)}>
            <option value="gofile">GoFile — file delivery</option>
            <option value="cloudflare_stream">Cloudflare Stream — managed video</option>
          </select>
        </label>
        <label>
          Quality
          <select value={quality} onChange={e => setQuality(e.target.value)}>
            <option value="2160p">4K / 2160p</option>
            <option value="1080p">1080p</option>
            <option value="720p">720p</option>
            <option value="480p">480p</option>
            <option value="source">Source quality</option>
          </select>
        </label>
        <label>
          Rights status
          <select value={rights} onChange={e => setRights(e.target.value as RightsStatus)}>
            <option value="unknown">Unknown — not playable</option>
            <option value="authorized">Authorized</option>
            <option value="licensed">Licensed</option>
          </select>
        </label>
        <label>
          Title ID
          <input value={titleId} onChange={e => setTitleId(e.target.value)} placeholder="UUID for a movie"/>
        </label>
        <label>
          Episode ID <span className="optional">(leave blank for movies)</span>
          <input value={episodeId} onChange={e => setEpisodeId(e.target.value)} placeholder="UUID for an episode"/>
        </label>
      </div>

      <button
        className="button button-light upload-button"
        onClick={upload}
        disabled={!file || (!titleId && !episodeId) || Boolean(status && progress < 100)}
      >
        <UploadCloud size={17}/>
        {status && progress < 100 ? "Uploading " + progress + "%" : "Upload media"}
      </button>

      {progress > 0 && <div className="progress-track"><i style={{ width: progress + "%" }}/></div>}
      {status && <p className="upload-status"><LoaderCircle size={15}/>{status}</p>}
      {error && <p className="upload-error"><AlertCircle size={15}/>{error}</p>}
    </section>

    <div className="upload-note">
      <Film size={18}/>
      <span>
        GoFile is treated as a replaceable storage provider. MovieLab keeps metadata in Supabase and only exposes
        media that has a valid MovieLab rights record. Cloudflare Stream remains available for content that needs
        managed transcoding and adaptive playback.
      </span>
    </div>
  </main>;
}

import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { UploadCloud, Film, CheckCircle2, AlertCircle, LoaderCircle } from "lucide-react";
import { Upload } from "tus-js-client";
import { supabase } from "../lib/supabase";

export default function MediaLibrary() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file,setFile] = useState<File|null>(null);
  const [titleId,setTitleId] = useState("");
  const [episodeId,setEpisodeId] = useState("");
  const [rights,setRights] = useState<"unknown"|"authorized"|"licensed">("unknown");
  const [progress,setProgress] = useState(0);
  const [status,setStatus] = useState("");
  const [error,setError] = useState("");

  async function upload() {
    if(!supabase){setError("Supabase is not configured.");return;}
    if(!file || (!titleId && !episodeId)){setError("Select a media file and provide a title or episode ID.");return;}
    setError(""); setStatus("Creating secure upload…"); setProgress(0);
    const {data:{session}}=await supabase.auth.getSession();
    if(!session){setError("Sign in to MovieLab CMS first.");setStatus("");return;}
    const res=await supabase.functions.invoke("media-upload",{
      body:{filename:file.name,title_id:titleId||null,episode_id:episodeId||null,rights_status:rights,max_duration_seconds:14400}
    });
    if(res.error || !res.data?.upload_url){setError(res.error?.message ?? res.data?.error ?? "Could not create upload.");setStatus("");return;}
    setStatus("Uploading and processing…");
    await new Promise<void>((resolve,reject)=>{
      const uploader=new Upload(file,{
        uploadUrl:res.data.upload_url,
        retryDelays:[0,1000,3000,5000,10000],
        metadata:{filename:file.name,filetype:file.type||"video/mp4"},
        onError:reject,
        onProgress:(sent,total)=>setProgress(Math.round(sent/total*100)),
        onSuccess:()=>resolve()
      });
      uploader.start();
    }).then(()=>setStatus("Upload complete. Video processing is handled by the media provider."))
      .catch(e=>{setError(e instanceof Error?e.message:String(e));setStatus("");});
  }

  return <main className="page media-library">
    <div className="page-head"><div><span className="eyebrow plain">MovieLab CMS</span><h1>Media Library</h1><p>Upload your authorized movie and episode masters directly to the video layer.</p></div><Link className="button button-glass" to="/">Back to MovieLab</Link></div>
    <section className="upload-card">
      <div className="upload-drop" onClick={()=>inputRef.current?.click()}>
        <input ref={inputRef} hidden type="file" accept="video/*,.mkv,.mp4,.mov,.webm" onChange={e=>setFile(e.target.files?.[0]??null)}/>
        {file?<><CheckCircle2 size={30}/><strong>{file.name}</strong><span>{(file.size/1024/1024/1024).toFixed(2)} GB selected</span></>:<><UploadCloud size={34}/><strong>Choose a movie or episode</strong><span>Large files upload directly to the video provider.</span></>}
      </div>
      <div className="upload-fields">
        <label>Title ID<input value={titleId} onChange={e=>setTitleId(e.target.value)} placeholder="UUID from MovieLab catalogue"/></label>
        <label>Episode ID <span className="optional">(leave blank for movies)</span><input value={episodeId} onChange={e=>setEpisodeId(e.target.value)} placeholder="UUID from episodes"/></label>
        <label>Rights status<select value={rights} onChange={e=>setRights(e.target.value as typeof rights)}><option value="unknown">Unknown — not playable</option><option value="authorized">Authorized</option><option value="licensed">Licensed</option></select></label>
      </div>
      <button className="button button-light upload-button" onClick={upload} disabled={!file || (!titleId&&!episodeId) || Boolean(status && progress<100)}><UploadCloud size={17}/>{status&&progress<100 ? \`Uploading \${progress}%\` : "Upload media"}</button>
      {progress>0&&<div className="progress-track"><i style={{width:\`\${progress}%\`}}/></div>}
      {status&&<p className="upload-status"><LoaderCircle size={15}/>{status}</p>}
      {error&&<p className="upload-error"><AlertCircle size={15}/>{error}</p>}
    </section>
    <div className="upload-note"><Film size={18}/><span>Telegram, TMDB, TVmaze, OMDb, Watchmode and future partner/X connectors remain separate source adapters. Uploading your own media does not replace them.</span></div>
  </main>;
}

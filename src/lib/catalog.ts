import type {Title} from "../types/catalog";
export function findTitle(titles:Title[],slug:string){return titles.find(t=>t.slug===slug)}
export function searchTitles(titles:Title[],query:string){const q=query.trim().toLowerCase();if(!q)return titles;return titles.filter(t=>[t.title,t.overview,...t.genre,...t.country,...t.language].join(" ").toLowerCase().includes(q))}
export function formatRuntime(minutes?:number){if(!minutes)return "";const h=Math.floor(minutes/60),m=minutes%60;return h?String(h)+"h"+(m?" "+m+"m":""):m+"m"}
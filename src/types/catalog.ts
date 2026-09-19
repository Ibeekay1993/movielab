export type TitleType="movie"|"series";
export type AvailabilityKind="movielab"|"subscription"|"rent"|"buy"|"external";
export interface Availability{provider:string;kind:AvailabilityKind;territory:string;label:string;url?:string}
export interface Episode{id:string;number:number;title:string;runtimeMinutes:number;overview?:string}
export interface Season{number:number;episodes:Episode[]}
export interface Title{id:string;slug:string;title:string;year:number;rating:string;runtimeMinutes?:number;genre:string[];type:TitleType;overview:string;posterUrl:string;backdropUrl:string;featured?:boolean;country:string[];language:string[];match?:number;availability:Availability[];seasons?:Season[];tmdbId?:number;}
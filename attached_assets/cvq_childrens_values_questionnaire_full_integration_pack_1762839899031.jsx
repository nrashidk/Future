// =============================
// CVQ (Children’s Values Questionnaire) – Full Integration Pack
// Stack: React + Vite + Tailwind + shadcn/ui, Express, Drizzle (Postgres)
// This pack adds:
// 1) DB schema & seed for CVQ items and suggestions
// 2) API: GET /api/cvq/items, POST /api/cvq/submit, GET /api/cvq/result/latest
// 3) Client page /cvq with short-form CVQ (21 items, 7 domains × 3 items)
// 4) Composite scoring integration: include CVQ at 20% weight
// 5) Revised Country Alignment logic (mapping to national priorities)
//
// NOTE: This file presents all source fragments in one place. Copy into your repo as indicated by headers.
// =============================

// =============================
// 0) SHARED: value domains (age-appropriate)
// =============================
// Domains: Achievement, Honesty, Kindness, Respect, Responsibility, Peacefulness, Environment
export type CvqDomain =
  | "achievement"
  | "honesty"
  | "kindness"
  | "respect"
  | "responsibility"
  | "peacefulness"
  | "environment";

export const CVQ_DOMAIN_LABEL: Record<CvqDomain, string> = {
  achievement: "Achievement",
  honesty: "Honesty",
  kindness: "Kindness",
  respect: "Respect",
  responsibility: "Responsibility",
  peacefulness: "Peacefulness",
  environment: "Environmental Care",
};

// =============================
// 1) DRIZZLE SCHEMA (server/shared/schema.ts)
// =============================
/*
import { pgTable, varchar, text, integer, timestamp, jsonb, sql } from "drizzle-orm/pg-core";

export const cvqItems = pgTable("cvq_items", {
  id: varchar("id").primaryKey().notNull(),            // e.g., CVQ-A1
  domain: varchar("domain").notNull(),                 // CvqDomain
  text: text("text").notNull(),
  reverse: integer("reverse").notNull().default(0),    // 0 or 1
  version: varchar("version").notNull().default("1.0.0"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const cvqResults = pgTable("cvq_results", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull(),
  version: varchar("version").notNull(),
  // raw domain sums (3–15 if 3 items × 1..5)
  achievement: integer("d_achievement").notNull(),
  honesty: integer("d_honesty").notNull(),
  kindness: integer("d_kindness").notNull(),
  respect: integer("d_respect").notNull(),
  responsibility: integer("d_responsibility").notNull(),
  peacefulness: integer("d_peacefulness").notNull(),
  environment: integer("d_environment").notNull(),
  // normalized 0–100 json
  norm: jsonb("norm").$type<Record<string, number>>().default(sql`'{}'::jsonb`),
  top: jsonb("top").$type<string[]>().default(sql`'[]'::jsonb`),
  flags: jsonb("flags").$type<Record<string, boolean>>().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at").defaultNow(),
});
*/

// =============================
// 2) SEED (server/seed.ts): 21 items (7×3)
// =============================
/*
import { randomUUID } from "node:crypto";
import { cvqItems } from "@shared/schema";

const V = "1.0.0";
const items: { id:string; domain:CvqDomain; text:string; reverse?:boolean }[] = [
  // ACHIEVEMENT
  { id: "CVQ-A1", domain: "achievement", text: "I try my best to do well in my studies." },
  { id: "CVQ-A2", domain: "achievement", text: "I set goals and work hard to reach them." },
  { id: "CVQ-A3", domain: "achievement", text: "I feel proud when I improve my performance." },
  // HONESTY
  { id: "CVQ-H1", domain: "honesty", text: "I tell the truth even when it is difficult." },
  { id: "CVQ-H2", domain: "honesty", text: "I return things that are not mine." },
  { id: "CVQ-H3", domain: "honesty", text: "I admit mistakes so I can learn from them." },
  // KINDNESS
  { id: "CVQ-K1", domain: "kindness", text: "I try to be helpful when someone needs support." },
  { id: "CVQ-K2", domain: "kindness", text: "I include classmates who feel left out." },
  { id: "CVQ-K3", domain: "kindness", text: "I look for small ways to make others’ day better." },
  // RESPECT
  { id: "CVQ-R1", domain: "respect", text: "I treat people politely even when we disagree." },
  { id: "CVQ-R2", domain: "respect", text: "I listen when others are speaking." },
  { id: "CVQ-R3", domain: "respect", text: "I take care of shared spaces and rules." },
  // RESPONSIBILITY
  { id: "CVQ-RE1", domain: "responsibility", text: "I finish tasks I said I would do." },
  { id: "CVQ-RE2", domain: "responsibility", text: "I plan my time so I am ready for class." },
  { id: "CVQ-RE3", domain: "responsibility", text: "I take care of my equipment and materials." },
  // PEACEFULNESS
  { id: "CVQ-P1", domain: "peacefulness", text: "I try to solve problems without fighting." },
  { id: "CVQ-P2", domain: "peacefulness", text: "I stay calm and think before I act." },
  { id: "CVQ-P3", domain: "peacefulness", text: "I look for solutions where everyone is heard." },
  // ENVIRONMENT
  { id: "CVQ-E1", domain: "environment", text: "I avoid wasting water, electricity, and materials." },
  { id: "CVQ-E2", domain: "environment", text: "I care about keeping our school and city clean." },
  { id: "CVQ-E3", domain: "environment", text: "I want to protect nature for the future." },
];

export async function seedCvqItems(db:any){
  for(const it of items){
    await db.insert(cvqItems).values({
      id: it.id, domain: it.domain, text: it.text, reverse: it.reverse?1:0, version: V
    }).onConflictDoNothing();
  }
}
*/

// =============================
// 3) SERVER ROUTES (server/routes.ts)
// =============================
/*
import { randomUUID } from "node:crypto";
import { and, eq, desc } from "drizzle-orm";
import { cvqItems, cvqResults } from "@shared/schema";

app.get("/api/cvq/items", isAuthenticated, async (req, res) => {
  const rows = await storage.db.select().from(cvqItems).orderBy(cvqItems.id);
  res.json(rows);
});

function normalize(raw:number, min:number, max:number){ return ((raw - min) / (max - min)) * 100; }

app.post("/api/cvq/submit", isAuthenticated, async (req, res) => {
  // body: { version:"1.0.0", responses: [{id:"CVQ-A1", value:1..5}], meta:{durationSec:number} }
  const { version, responses, meta } = req.body as { version:string; responses:{id:string; value:number}[]; meta?:{durationSec?:number} };
  const byId = Object.fromEntries((responses||[]).map(r=>[r.id, Number(r.value)]));
  const items = await storage.db.select().from(cvqItems).where(eq(cvqItems.version, version||"1.0.0"));

  // Sum per domain (3–15 expected if 3 items answered)
  const doms: Record<string, number> = {
    achievement:0, honesty:0, kindness:0, respect:0, responsibility:0, peacefulness:0, environment:0,
  };
  let answered = 0;
  for (const it of items){
    const v = byId[it.id];
    if (typeof v === 'number'){ answered++; }
    const val = typeof v === 'number' ? v : 3; // neutral if missing
    const adj = (it.reverse? (6 - val) : val);
    doms[it.domain] += adj;
  }

  // Normalize (3 items × 1..5 → 3..15)
  const norm: Record<string, number> = {};
  (Object.keys(doms) as (keyof typeof doms)[]).forEach(k=>{ norm[k] = Math.round(normalize(doms[k], 3, 15)); });
  const ranking = Object.entries(norm).sort((a,b)=>b[1]-a[1]).map(([k])=>k);
  const top = ranking.slice(0,3);

  // Flags
  const valuesOnly = Object.values(byId).filter(v=>typeof v==='number') as number[];
  const lowVariance = valuesOnly.length>10 && (valuesOnly.filter(v=>v===valuesOnly[0]).length/valuesOnly.length)>=0.8;
  const tooFast = meta?.durationSec ? meta.durationSec < (items.length * 2.5) : false;
  const incomplete = answered < items.length;

  const id = randomUUID();
  await storage.db.insert(cvqResults).values({
    id, userId: req.user!.id, version: version||"1.0.0",
    achievement: doms.achievement,
    honesty: doms.honesty,
    kindness: doms.kindness,
    respect: doms.respect,
    responsibility: doms.responsibility,
    peacefulness: doms.peacefulness,
    environment: doms.environment,
    norm, top, flags: { lowVariance, tooFast, incomplete }
  });

  res.status(201).json({ id, raw: doms, norm, top, flags: { lowVariance, tooFast, incomplete } });
});

app.get("/api/cvq/result/latest", isAuthenticated, async (req, res) => {
  const row = await storage.db.query.cvqResults.findFirst({ where: eq(cvqResults.userId, req.user!.id), orderBy: [desc(cvqResults.createdAt)] });
  res.json(row ?? null);
});
*/

// =============================
// 4) CLIENT PAGE (client/src/pages/CVQ.tsx)
// =============================
/*
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CVQ_DOMAIN_LABEL, CvqDomain } from "@/lib/cvq"; // put types in src/lib/cvq.ts

type Item = { id:string; domain:CvqDomain; text:string; reverse:number };

type Result = {
  id: string; raw: Record<CvqDomain, number>;
  norm: Record<CvqDomain, number>; top: CvqDomain[];
  flags: { lowVariance:boolean; tooFast:boolean; incomplete:boolean };
};

export default function CVQ(){
  const [items, setItems] = useState<Item[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [startedAt] = useState<number>(()=>Date.now());

  useEffect(()=>{ fetch('/api/cvq/items').then(r=>r.json()).then(setItems); },[]);

  const progress = Math.round((Object.keys(answers).length / Math.max(1, items.length)) * 100);

  function setAnswer(id:string, v:number){ setAnswers(s=>({ ...s, [id]: v })); }

  async function submit(){
    const durationSec = Math.round((Date.now()-startedAt)/1000);
    const payload = { version: '1.0.0', responses: Object.entries(answers).map(([id,value])=>({id, value})), meta:{ durationSec } };
    const res = await fetch('/api/cvq/submit',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) }).then(r=>r.json());
    setResult(res);
  }

  if(result){
    return <CVQResults res={result} onRestart={()=>{ setAnswers({}); setResult(null); }} />
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      <h1 className="text-2xl font-semibold">Personal Values (CVQ)</h1>
      <p className="text-sm text-muted-foreground">Tell us which values matter most to you at school and in life. Your values help us match study paths and activities you will enjoy and stick with.</p>

      <div className="h-2 w-full rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${progress}%` }} /></div>

      <div className="grid gap-3">
        {items.map(it => (
          <Card key={it.id}>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">{CVQ_DOMAIN_LABEL[it.domain]}</div>
              <div className="mb-3 mt-1 text-base">{it.text}</div>
              <Likert value={answers[it.id]} onChange={(v)=>setAnswer(it.id, v)} />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={()=>{ setAnswers({}); }}>Reset</Button>
        <Button onClick={submit} disabled={items.length===0}>See my values</Button>
      </div>
    </div>
  );
}

function Likert({ value, onChange }:{ value?:number; onChange:(v:1|2|3|4|5)=>void }){
  const opts = [1,2,3,4,5] as const;
  return (
    <div className="flex gap-2" role="radiogroup" aria-label="Agreement">
      {opts.map(v => (
        <label key={v} className={`grid h-9 w-9 place-items-center rounded-lg border text-sm ${value===v? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
          <input type="radio" className="sr-only" checked={value===v} onChange={()=>onChange(v)} />{v}
        </label>
      ))}
    </div>
  );
}

function CVQResults({ res, onRestart }:{ res:Result; onRestart:()=>void }){
  const ranking = Object.entries(res.norm).sort((a,b)=>b[1]-a[1]) as [CvqDomain, number][];
  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Your top values</h2>
        <Button variant="outline" onClick={onRestart}>Retake</Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Scores</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {ranking.map(([k,v]) => (
              <div key={k}>
                <div className="flex justify-between text-sm"><span>{CVQ_DOMAIN_LABEL[k]}</span><span>{Math.round(v)}%</span></div>
                <div className="h-2 w-full rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${v}%` }} /></div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>What this means</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>Your values help us suggest study areas, activities, and volunteering ideas that feel meaningful to you. We’ll use these scores (at 20% weight) together with your Holland interests and subject strengths.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
*/

// =============================
// 5) COMPOSITE SCORING UPDATE (client/src/lib/composite.ts)
// =============================
/*
// Revised Country Alignment (national priorities) + CVQ weight at 20%
// - Each program/major has tags of national priorities (e.g., sustainability, AI, health, tourism, logistics, space, fintech)
// - Student gets CVQ profile + RIASEC + readiness scores
// - Country alignment score is how well the program advances *priorities*, not feasibility

export type NationalPriority =
  | "sustainability" | "ai" | "health" | "education" | "tourism" | "logistics" | "space" | "fintech" | "agritech";

export type Program = {
  id: string;
  title: string;
  priorities: NationalPriority[];  // program contributes to these national goals
  pedagogy: "hands_on"|"lecture"|"project"|"hybrid";
  riasecProfile: Partial<Record<"R"|"I"|"A"|"S"|"E"|"C", number>>; // 0..100 ideal interest fit
  valuesProfile: Partial<Record<CvqDomain, number>>; // ideal value emphases
  subjectNeeds: Partial<Record<string, number>>; // subject ids → importance 0..1
};

export type UserSignals = {
  riasec: Record<"R"|"I"|"A"|"S"|"E"|"C", number>; // 0..100
  cvq: Record<CvqDomain, number>; // 0..100 (norm)
  readiness: Record<string, number>; // subject → 0..100
  kolb?: { x:number; y:number; style:string };
  dreamTags?: string[]; // from free-text
  priorityWeights?: Partial<Record<NationalPriority, number>>; // optional, if user rates national goals importance
};

const W = { riasec:0.30, country:0.20, cvq:0.20, readiness:0.20 }; // 0.10 Kolb modifier handled separately

export function scoreProgram(p: Program, u: UserSignals){
  // 1) Holland interest match: cosine-like mean of overlapping keys
  const riasecKeys = Object.keys(p.riasecProfile) as (keyof typeof u.riasec)[];
  const riasecScore = avg(riasecKeys.map(k => mix(u.riasec[k]||0, p.riasecProfile[k]||0)));

  // 2) CVQ values match: average match on the program's emphasized values
  const vKeys = Object.keys(p.valuesProfile) as CvqDomain[];
  const cvqScore = vKeys.length? avg(vKeys.map(k=> mix(u.cvq[k]||0, p.valuesProfile[k]||0))) : 50;

  // 3) Readiness: weighted by program subjectNeeds (0..1)
  const sKeys = Object.keys(p.subjectNeeds||{});
  const readinessScore = sKeys.length? (
    sum(sKeys.map(k => (u.readiness[k]||0) * (p.subjectNeeds[k]||0))) / Math.max(1, sum(sKeys.map(k => (p.subjectNeeds[k]||0))))
  ) : 60;

  // 4) Country Alignment (national priorities): If user has optional priorityWeights, compute overlap; else use program’s priority salience alone
  const weights = u.priorityWeights || {};
  const countryScore = p.priorities.length ? (
    avg(p.priorities.map(pr => (weights[pr] ?? 100))) // if no user weights, assume national priorities are important; you can replace with backend priority salience 0..100
  ) : 50;

  // Base composite
  let composite = W.riasec*riasecScore + W.country*countryScore + W.cvq*cvqScore + W.readiness*readinessScore;

  // 5) Kolb modifier (± up to 10 points)
  if (u.kolb){
    const active = u.kolb.y >= 0; const abstract = u.kolb.x >= 0;
    if (p.pedagogy === 'project' || p.pedagogy==='hands_on') composite += active? 5: -2;
    if (p.pedagogy === 'lecture') composite += abstract? 3: -2;
    if (p.pedagogy === 'hybrid') composite += 2;
  }

  return Math.round(clamp(composite, 0, 100));
}

function avg(xs:number[]){ return xs.length? xs.reduce((a,b)=>a+b,0)/xs.length : 0; }
function sum(xs:number[]){ return xs.reduce((a,b)=>a+b,0); }
function mix(a:number,b:number){ return (a + b) / 2; }
function clamp(n:number,min:number,max:number){ return Math.max(min, Math.min(max, n)); }
*/

// =============================
// 6) ROUTER REGISTRATION (client/src/App.tsx)
// =============================
/*
import CVQ from "@/pages/CVQ";
// ...
<Route path="/cvq" component={CVQ} />
*/

// =============================
// 7) REPORT HOOK (client/src/pages/Results.tsx)
// =============================
/*
// In your final report page, pull latest CVQ result and show top domains.
useEffect(()=>{ fetch('/api/cvq/result/latest').then(r=>r.json()).then(setCvq); },[]);
// Show bars and explain that CVQ contributes 20% to the overall fit.
*/

// =============================
// END PACK

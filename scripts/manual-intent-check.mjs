import fs from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { env, pipeline } from '@huggingface/transformers'
import intentAliases from '../src/lib/intent-aliases.json' with { type: 'json' }

const ROOT=process.cwd()
const MODEL_DIR=process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT,'public/models/intent-v1')
const DATA_DIR=path.join(ROOT,'public/data')
const CANONICAL_QA_BY_ID=intentAliases.canonicalByQaId
const NOT_COVERED='NOT_COVERED'

class BM25Index {
  k1=1.5; b=0.75; avgDocLength=0; docLengths=[]; termFreqs=new Map(); docFreqs=new Map(); numDocs=0
  tokenize(text){ return text.toLowerCase().replace(/[^\w\s]/g,' ').split(/\s+/).filter(t=>t.length>2) }
  index(documents){
    this.numDocs=documents.length; this.docLengths=[]; this.termFreqs.clear(); this.docFreqs.clear()
    for(let i=0;i<documents.length;i++){
      const tokens=this.tokenize(documents[i]); this.docLengths[i]=tokens.length
      const termCounts=new Map(); for(const token of tokens) termCounts.set(token,(termCounts.get(token)||0)+1)
      for(const [term,count] of termCounts){
        if(!this.termFreqs.has(term)) this.termFreqs.set(term,new Array(this.numDocs).fill(0))
        this.termFreqs.get(term)[i]=count
        this.docFreqs.set(term,(this.docFreqs.get(term)||0)+1)
      }
    }
    this.avgDocLength=this.docLengths.reduce((a,b)=>a+b,0)/Math.max(1,this.numDocs)
  }
  search(query){
    const queryTokens=this.tokenize(query); const scores=new Array(this.numDocs).fill(0)
    for(const term of queryTokens){
      const docFreq=this.docFreqs.get(term)||0; if(!docFreq) continue
      const idf=Math.log((this.numDocs-docFreq+0.5)/(docFreq+0.5)+1)
      const termFreqArray=this.termFreqs.get(term)
      for(let i=0;i<this.numDocs;i++){
        const tf=termFreqArray[i]; if(!tf) continue
        const dl=this.docLengths[i]
        const tfNorm=(tf*(this.k1+1))/(tf+this.k1*(1-this.b+this.b*(dl/this.avgDocLength)))
        scores[i]+=idf*tfNorm
      }
    }
    return scores
  }
}

function normalizeQuery(query){ return query.toLowerCase().replace(/\u2019/g,"'").replace(/[^\w\s]/g,' ').replace(/\s+/g,' ').trim() }
function softmax(values, temperature){ const t=temperature<=0?1:temperature; const scaled=values.map(v=>v/t); const max=Math.max(...scaled); const exp=scaled.map(v=>Math.exp(v-max)); const sum=exp.reduce((a,b)=>a+b,0); return exp.map(v=>v/sum) }
function parseLabel(label, manifest){ if(manifest.labels.includes(label)) return label; const m=label.match(/(\d+)$/); if(!m) return label; const idx=Number.parseInt(m[1],10); return manifest.labels[idx]||label }
function canonicalizeQaId(id){ return CANONICAL_QA_BY_ID[id] || id }
function shouldOverrideLowMarginAbstain(confidence, topCandidates){
  if(topCandidates.length===0) return false
  const topScore=topCandidates[0]?.score ?? 0
  const secondScore=topCandidates[1]?.score ?? 0
  const gap=topScore-secondScore
  const ratio=secondScore>0 ? topScore/secondScore : Number.POSITIVE_INFINITY
  if(topScore >= 7.5 && gap >= 3) return true
  if(confidence < 0.22) return false
  if(topCandidates.length===1) return topScore >= 2.5
  if(topScore >= 7 && gap >= 3) return true
  if(topScore >= 5 && ratio >= 2.5) return true
  return topScore >= 4 && gap >= 4
}

function inferHintedSections(normalizedQuery){
  const hints=[]
  const push=(sectionId)=>{ if(!hints.includes(sectionId)) hints.push(sectionId) }
  if(/\bmixed age\b/.test(normalizedQuery)) push('110-300-0357')
  if(/\b(unvaccinated|vaccin|immuniz|shot record|shots required|exempt)\b/.test(normalizedQuery)) push('110-300-0210')
  if(/\b(food safety|safe food|food handling|kitchen safety|leftovers?|refrigerat(?:e|ion)|raw meat|expired food|food temp(?:erature)?|holding temperature)\b/.test(normalizedQuery)) push('110-300-0197')
  if(/\b(breast milk|expressed milk|pumped milk)\b/.test(normalizedQuery)) push('110-300-0281')
  if(/\b(formula|bottle|sanitize bottle|half finished bottle|warm bottle|microwave bottle|shared bottle|discard formula|throw away formula)\b/.test(normalizedQuery)) push('110-300-0280')
  if(/\b(play outside every day|go outside every day|outside every day|daily outdoor|outdoor time required|outdoor play time|required outdoor play|active outdoor play|outside each day)\b/.test(normalizedQuery)) push('110-300-0360')
  if(/\b(outdoor space|outdoor play space|play area|square feet outside|required per child outside)\b/.test(normalizedQuery)) push('110-300-0145')
  if(/\b(notify parents|tell me|tell parents|report to parents|contact the parent|serious injury|injury|hurt at daycare|accident|incident)\b/.test(normalizedQuery)) push('110-300-0475')
  if(/\b(outbreak|fever|vomit|throwing up|throw up|sick child|lice|return to daycare|send home|rectally)\b/.test(normalizedQuery)) push('110-300-0205')
  if(/\b(wash hands|hand sanitizer)\b/.test(normalizedQuery)) push('110-300-0200')
  if(/\b(indoor temperature|room temperature|inside daycare|inside child care|temperature inside|temperature indoors|water temperature)\b/.test(normalizedQuery)) push('110-300-0165')
  if(/\b(general safety|safety requirements|safety rules|hazard|hazards|choking hazard|safe environment)\b/.test(normalizedQuery)) push('110-300-0165')
  if(/\b(infant feeding|feeding plan|feeding rules|feeding infants|feeding babies|feed babies|feed infants|solid foods?|high chair|juice)\b/.test(normalizedQuery)) push('110-300-0285')
  if(/\b(medication|medicine|melatonin|sunscreen|prescription)\b/.test(normalizedQuery)) push('110-300-0215')
  if(/\b(emergency preparedness|emergency plan|disaster plan|evacuation drill|evacuation plan|lockdown|shelter in place|fire drill)\b/.test(normalizedQuery)) push('110-300-0470')
  if(/\b(staff qualification|staff qualifications|worker qualifications|qualifications do daycare workers need|background checks?|fingerprints?|preservice|work at a daycare|work at daycare)\b/.test(normalizedQuery)) push('110-300-0100')
  if(/\b(family home|family child care|home daycare|family daycare|family provider|provider working alone|working alone)\b/.test(normalizedQuery) && /\b(ratio|capacity|group size|school age|infant|children|kids|staff|staffing|care for)\b/.test(normalizedQuery)) push('110-300-0355')
  if(/\b(center|classroom|teacher|staff member)\b/.test(normalizedQuery) && /\b(ratio|capacity|group size|school age|toddler|infant|preschool|kids|staffing)\b/.test(normalizedQuery)) push('110-300-0356')
  if(/\b(how often do staff need training|training frequency|in service training)\b/.test(normalizedQuery)) push('110-300-0107')
  return hints
}

const manifest=JSON.parse(await fs.readFile(path.join(MODEL_DIR,'manifest.json'),'utf8'))
const answerBank=JSON.parse(await fs.readFile(path.join(DATA_DIR,'intent-answer-bank.v1.json'),'utf8'))
const queryBank=JSON.parse(await fs.readFile(path.join(DATA_DIR,'intent-query-bank.v1.json'),'utf8'))
const answerByQaId=new Map(answerBank.map(r=>[r.qaId,r]))
const queriesByQaId=new Map(queryBank.map(r=>[r.qaId,r.queries]))
const exactQueries=new Map()
const sectionIndexes=new Map()
for(const record of answerBank){
  const canonicalQaId=canonicalizeQaId(record.qaId)
  const canonicalRecord=answerByQaId.get(canonicalQaId) || record
  const sectionId=canonicalRecord.sectionId
  const byCanonical=sectionIndexes.get(sectionId) || new Map()
  const existing=byCanonical.get(canonicalQaId) || { record: canonicalRecord, queries:new Set([canonicalRecord.question]) }
  existing.queries.add(record.question)
  for(const q of queriesByQaId.get(record.qaId) || []) existing.queries.add(q)
  byCanonical.set(canonicalQaId, existing)
  sectionIndexes.set(sectionId, byCanonical)
}
for(const [sectionId, grouped] of sectionIndexes){
  const records=Array.from(grouped.values()).map(({record,queries})=>({record,queries:[...queries]}))
  for (const entry of records){
    for (const query of entry.queries){
      const normalized=normalizeQuery(query)
      if(!normalized) continue
      const existingQaId=exactQueries.get(normalized)
      if(existingQaId===undefined) exactQueries.set(normalized, entry.record.qaId)
      else if(existingQaId!==entry.record.qaId) exactQueries.set(normalized, null)
    }
  }
  const index=new BM25Index(); index.index(records.map(r=>r.queries.join(' ')))
  sectionIndexes.set(sectionId,{index,records})
}
const exactQueryQaIds=new Map([...exactQueries.entries()].filter(([,qaId]) => Boolean(qaId)))

function getTopCandidatesForSection(sectionId, normalizedQuery){
  const section=sectionIndexes.get(sectionId)
  if(!section) return []
  const scores=section.index.search(normalizedQuery)
  return scores
    .map((score,i)=>({score,record:section.records[i].record}))
    .sort((a,b)=>b.score-a.score)
    .slice(0,5)
}

function maybeApplyHintedSectionOverride(normalizedQuery, sectionId, ranked, matched){
  const hintedSections=inferHintedSections(normalizedQuery).filter((hint)=>hint!==sectionId)
  if(hintedSections.length===0) return { sectionId, ranked, overridden:false }
  const currentTopScore=ranked[0]?.score ?? 0
  let bestSectionId=sectionId
  let bestRanked=ranked
  let bestScore=currentTopScore
  for(const hintedSectionId of hintedSections){
    const hintedRanked=getTopCandidatesForSection(hintedSectionId, normalizedQuery)
    const hintedScore=hintedRanked[0]?.score ?? 0
    if(hintedScore > bestScore){
      bestScore=hintedScore
      bestSectionId=hintedSectionId
      bestRanked=hintedRanked
    }
  }
  if(bestSectionId===sectionId || bestRanked.length===0) return { sectionId, ranked, overridden:false }
  const delta=bestScore-currentTopScore
  if(!matched){
    if(bestScore >= 3.2 && delta >= 0.6) return { sectionId:bestSectionId, ranked:bestRanked, overridden:true }
    return { sectionId, ranked, overridden:false }
  }
  if(bestScore >= 4.5 && delta >= 1.2) return { sectionId:bestSectionId, ranked:bestRanked, overridden:true }
  return { sectionId, ranked, overridden:false }
}

env.allowLocalModels=true
env.allowRemoteModels=false
env.useFS=true
env.localModelPath=path.dirname(MODEL_DIR) + path.sep
const classify=await pipeline('text-classification', MODEL_DIR, { local_files_only:true, device:'cpu' })

async function runQuery(text){
  const normalized=normalizeQuery(text)
  const exactQaId=exactQueryQaIds.get(normalized)
  if(exactQaId){
    const exactRecord=answerByQaId.get(exactQaId)
    const ranked=exactRecord ? getTopCandidatesForSection(exactRecord.sectionId, normalized) : []
    const top=ranked[0] || (exactRecord ? { record: exactRecord, score: 1 } : null)
    if(top){
      return {
        outcome:'matched',
        confidence:1,
        margin:1,
        section:exactRecord?.sectionId || 'UNKNOWN',
        qaId:top.record.qaId,
        question:top.record.question,
        answer:top.record.answer,
        url:top.record.url,
        topCandidates: ranked.map(r=>({question:r.record.question, score:Number(r.score.toFixed(3))}))
      }
    }
  }
  const raw=await classify(normalized,{ top_k:5 })
  const parsed=raw.map(item=>({label:parseLabel(item.label,manifest),score:item.score}))
  const probs=softmax(parsed.map(i=>i.score), manifest.temperature || 1)
  const top1=probs[0] || 0
  const top2=probs[1] || 0
  const margin=top1-top2
  let label=parsed[0]?.label || NOT_COVERED
  let ranked=getTopCandidatesForSection(label, normalized)
  let reason = label===NOT_COVERED ? 'ood' : top1 < (manifest.thresholds?.minConfidence ?? 0.1) ? 'low_confidence' : margin < (manifest.thresholds?.minMargin ?? 0.12) ? 'low_margin' : 'matched'
  const hinted=maybeApplyHintedSectionOverride(normalized, label, ranked, reason==='matched')
  if(hinted.overridden){
    label=hinted.sectionId
    ranked=hinted.ranked
    reason='matched'
  }
  if(reason==='low_margin' && shouldOverrideLowMarginAbstain(top1, ranked)) reason='matched'
  if(ranked.length===0) return { outcome:'abstain', reason:'no_candidates', confidence:top1, margin, section:label }
  if(reason!=='matched') return {
    outcome:'abstain',
    reason,
    confidence:top1,
    margin,
    section:label,
    topCandidates: ranked.map(r=>({question:r.record.question, score:Number(r.score.toFixed(3))}))
  }
  const top=ranked[0]
  return {
    outcome:'matched',
    confidence:top1,
    margin,
    section:label,
    qaId:top.record.qaId,
    question:top.record.question,
    answer:top.record.answer,
    url:top.record.url,
    topCandidates: ranked.map(r=>({question:r.record.question, score:Number(r.score.toFixed(3))}))
  }
}

const tests=[
  {expect:'match', note:'infant sleep blankets', text:'my 5 month old rolls around with a blanket at daycare, is that allowed?', expectedQuestion:'Can babies use blankets in cribs at daycare?'},
  {expect:'match', note:'safe sleep position', text:'do babies have to be put on their back for naps?', expectedQuestion:'What position should babies sleep in?'},
  {expect:'match', note:'sick child fever', text:'what fever gets a kid sent home from childcare?', expectedQuestion:'What fever requires a child to be sent home?'},
  {expect:'match', note:'vomiting exclusion', text:'how many times can my kid throw up before daycare has to send them home?', expectedQuestion:'How many times can a child vomit before being sent home?'},
  {expect:'match', note:'return after illness', text:'when can she come back after being sick?', expectedQuestion:'When can a child return to daycare after being sick?'},
  {expect:'match', note:'immunization rules', text:'can an unvaccinated child still attend daycare in washington?', expectedQuestion:'Can unvaccinated children attend daycare?'},
  {expect:'match', note:'medication permission', text:'can staff give my child her prescription medicine if I sign a form?', expectedQuestion:'Can daycare staff give my child medicine?'},
  {expect:'match', note:'sunscreen permission', text:'do they need my permission to put sunscreen on him?', expectedQuestion:'Does daycare need permission to apply sunscreen?'},
  {expect:'match', note:'formula disposal', text:'we made a bottle and baby only drank half. can they put it back in the fridge?', expectedQuestion:'Can I put a half-finished bottle back in the fridge?'},
  {expect:'match', note:'breast milk storage', text:'how is breast milk supposed to be stored once I bring it in?', expectedQuestion:'How should breast milk be labeled and stored at daycare?'},
  {expect:'match', note:'formula permission for breastfed infant', text:'can daycare give formula to my breastfed baby without asking me first?', expectedQuestion:'Can daycare feed my baby formula without permission?'},
  {expect:'match', note:'handwashing duration', text:'how long are you supposed to wash hands for?', expectedQuestion:'How long should you wash hands for?'},
  {expect:'match', note:'staff handwashing moments', text:'when exactly do staff need to wash their hands?', expectedQuestion:'When should staff wash their hands?'},
  {expect:'match', note:'fridge temp', text:'what temp does the daycare fridge need to stay at?', expectedQuestion:'What temperature should the refrigerator be?'},
  {expect:'match', note:'leftovers', text:'how long can daycare keep leftovers before tossing them?', expectedQuestion:'How long can leftover food be stored?'},
  {expect:'match', note:'food from home', text:'am I allowed to send food from home for my child?', expectedQuestion:'Can I bring food from home for my child?'},
  {expect:'match', note:'fire drill frequency', text:'how often does daycare have to do fire drills?', expectedQuestion:'How often must fire drills be practiced?'},
  {expect:'match', note:'injury reporting', text:'if my child gets hurt there, do they have to tell me?', expectedQuestion:'What happens if my child gets hurt at daycare?'},
  {expect:'match', note:'background checks', text:'do daycare employees have to pass background checks?', expectedQuestion:'What background check is required for daycare workers?'},
  {expect:'match', note:'minimum age to work', text:'how old do you have to be to work at a daycare?', expectedQuestion:'How old do you have to be to work at a daycare?'},
  {expect:'match', note:'yelling discipline', text:'is it okay for daycare workers to yell at kids?', expectedQuestion:'Can daycare workers yell at children?'},
  {expect:'match', note:'timeout discipline', text:'can they use timeout?', expectedQuestion:'Is timeout allowed at daycare?'},
  {expect:'match', note:'fence height', text:'how tall does the playground fence have to be?', expectedQuestion:'How tall does a daycare fence need to be?'},
  {expect:'match', note:'daily outdoor play', text:'do kids have to go outside every day?', expectedQuestion:'Do children have to play outside every day?'},
  {expect:'match', note:'school age ratio hard case', text:'how many school age kids can one staff member have?', expectedQuestion:'How many school-age children can one family home provider care for?'},
  {expect:'match', note:'choking prevention', text:'how small should food be cut up for babies?', expectedQuestion:'How small should food be cut for infants?'},
  {expect:'match', note:'infant fever hard typo', text:'wath temperature counts as a fever in an infant?', expectedQuestion:'What temperature is considered a fever for infants?'},
  {expect:'abstain', note:'not covered legal advice', text:'can I sue a daycare for negligence?'},
  {expect:'abstain', note:'not covered prices', text:'how much does daycare cost per month in seattle?'},
  {expect:'abstain', note:'not covered taxes', text:'can I claim daycare costs on my taxes?'},
  {expect:'abstain', note:'not covered staffing wages', text:'what is the minimum wage for daycare workers?'},
  {expect:'abstain', note:'not covered curriculum choice', text:'is montessori better than play based preschool?'}
]

const started=performance.now()
const results=[]
let matchedExpectation=0
for(const test of tests){
  const result=await runQuery(test.text)
  const ok=
    (test.expect==='match' &&
      result.outcome==='matched' &&
      result.question===test.expectedQuestion) ||
    (test.expect==='abstain' && result.outcome==='abstain')
  if(ok) matchedExpectation+=1
  results.push({ ...test, ok, result })
}
const elapsed=performance.now()-started
console.log(JSON.stringify({ elapsedMs: elapsed, count: results.length, matchedExpectation, results }, null, 2))

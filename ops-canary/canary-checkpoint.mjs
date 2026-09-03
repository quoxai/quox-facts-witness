#!/usr/bin/env node
/**
 * ops-canary checkpoint generator.
 *
 * Emits one signed, externally countersigned checkpoint per day describing
 * the observable operational state of a Quox instance. Started 2026-09-03
 * (day 0) in direct response to the benchmark round-5 assessors' unanimous
 * verdict-mover: "a pre-committed, externally mirrored unattended
 * production-canary evidence bundle: immutable daily checkpoints ... full
 * incident/restart history ... It must include failures, not only
 * happy-path receipts."
 *
 * Pre-commitment properties:
 *   - The signing key is the SAME Ed25519 key that signs the quox.ai/facts
 *     chain; its public half has been embedded in every published
 *     facts.receipt.json and mirrored to this append-only repo since
 *     seq 1 (2026-09-02), i.e. the key was publicly pinned BEFORE this
 *     canary started. This script never generates a key: it fails if the
 *     pinned key is absent.
 *   - Checkpoints append to their own WARD chain (ward:quox.ai/ops-canary),
 *     exported in full in this directory (chain.json), so a skipped or
 *     deleted day is visible as a seq gap to anyone.
 *   - Each day's statement is countersigned by an RFC-3161 TSA outside
 *     Quox's control (freetsa.org) by the companion shell step.
 *   - Failures are data: restarts, unhealthy states and manual incident
 *     notes are recorded, never filtered. A metric that cannot be gathered
 *     is recorded as unavailable with the reason, never fabricated.
 *
 * Honesty label: this canary observes the DEVELOPMENT instance (dev-1)
 * until the production canary is signed off. The instance
 * field says so on every checkpoint.
 *
 * Runs on the instance host (systemd timer). Secrets: reads the collector
 * INTERNAL_SERVICE_KEY from the local deployment env file at runtime; the
 * key never appears in output or in this repo.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const CHAIN_ID = 'ward:quox.ai/ops-canary'
const ISSUER_ID = 'quox.ai#dev-signer'
const DAY_ZERO = '2026-09-03'
const INSTANCE = 'Quox development instance dev-1 (production canary pending owner sign-off, stated per the honesty rule rather than hidden)'

const WARD_SDK_HOME = process.env.QUOX_WARD_SDK || '/home/control/ward-sdk'
const FACTS_KEYS = process.env.QUOX_WARD_FACTS_HOME
  ? join(process.env.QUOX_WARD_FACTS_HOME.replace(/^~\//, `${homedir()}/`), 'keys')
  : join(homedir(), '.quox-ward/facts/keys')
const ENV_FILE = process.env.QUOX_COLLECTOR_ENV || '/home/control/quox-dashboard/.env'

const sdkEntry = join(WARD_SDK_HOME, 'dist/src/index.js')
if (!existsSync(sdkEntry)) { console.error(`canary: ward-sdk build missing at ${sdkEntry}`); process.exit(1) }
const ward = await import(pathToFileURL(sdkEntry).href)
const { appendEntry, computeTip, signTipHash, loadKeypair } = ward

const PUB = join(FACTS_KEYS, 'ed25519_public.pem')
const PRIV = join(FACTS_KEYS, 'ed25519_private.pem')
if (!existsSync(PUB) || !existsSync(PRIV)) {
  console.error('canary: pinned facts signing key not found — refusing to mint a new one (pre-commitment would be broken)')
  process.exit(1)
}

const today = new Date().toISOString().slice(0, 10)
const dayNumber = Math.round((Date.parse(today) - Date.parse(DAY_ZERO)) / 86400000)
const dayDir = join(HERE, `day-${String(dayNumber).padStart(4, '0')}`)

function tryRun(fn, label) {
  try { return fn() } catch (err) { return { unavailable: true, reason: `${label}: ${err.message}`.slice(0, 200) } }
}

// --- collector health, over HTTP like any client -------------------------
const serviceKey = tryRun(() => {
  const line = readFileSync(ENV_FILE, 'utf8').split('\n').find((l) => l.startsWith('INTERNAL_SERVICE_KEY='))
  if (!line) throw new Error('key line absent')
  return line.slice('INTERNAL_SERVICE_KEY='.length)
}, 'env')

function curlJson(url, headers = []) {
  const args = ['-sf', '-m', '20', url]
  for (const h of headers) args.push('-H', h)
  return JSON.parse(execFileSync('curl', args, { encoding: 'utf8' }))
}

const collectorHealth = tryRun(() => {
  const code = execFileSync('curl', ['-s', '-m', '20', '-o', '/dev/null', '-w', '%{http_code}', 'http://localhost:9848/health'], { encoding: 'utf8' })
  return { http: Number(code), healthy: code === '200' }
}, 'collector-health')

// --- container states: restarts and unhealthy states are the point -------
const containers = tryRun(() => {
  const out = execFileSync('docker', ['ps', '-a', '--filter', 'name=quox-', '--format', '{{.Names}}\t{{.Status}}'], { encoding: 'utf8' })
  const rows = out.trim().split('\n').filter(Boolean).map((l) => {
    const [name, status] = l.split('\t')
    return { name, status }
  })
  for (const r of rows) {
    const started = execFileSync('docker', ['inspect', '--format', '{{.State.StartedAt}}|{{.RestartCount}}', r.name], { encoding: 'utf8' }).trim()
    const [startedAt, restartCount] = started.split('|')
    r.started_at = startedAt
    r.restart_count = Number(restartCount)
    r.restarted_last_24h = (Date.now() - Date.parse(startedAt)) < 86400000
  }
  return rows
}, 'docker')

// --- evidence-substrate growth (monotonic counters; shrinkage = a finding)
const voltStats = typeof serviceKey === 'string'
  ? tryRun(() => curlJson('http://localhost:9848/volt/stats', [`X-Service-Key: ${serviceKey}`, 'X-Org-Id: 01M1JH55Q8QFSYPYE0N165BXTG']), 'volt-stats')
  : { unavailable: true, reason: 'service key unavailable' }

// --- the facts chain position this day observed ---------------------------
const factsChain = tryRun(() => {
  const chain = JSON.parse(readFileSync(join(homedir(), '.quox-ward/facts/chain.json'), 'utf8'))
  const head = chain.entries[chain.entries.length - 1]
  return { seq: head.seq, chain_hash: head.chain_hash }
}, 'facts-chain')

// --- incidents: manual notes are first-class, absence is stated -----------
const incidentsFile = join(HERE, 'incidents', `${today}.md`)
const incidents = existsSync(incidentsFile)
  ? readFileSync(incidentsFile, 'utf8').trim()
  : 'none recorded for this date (manual incident notes land in ops-canary/incidents/<date>.md; automated restart detection above is independent of this field)'

const checkpoint = {
  canary_version: 1,
  chain_id: CHAIN_ID,
  day: dayNumber,
  date: today,
  day_zero: DAY_ZERO,
  instance: INSTANCE,
  started_reason: 'Benchmark round-5 (2026-09-03) unanimous verdict-mover: pre-committed longitudinal operational evidence, failures included. Report: quox-strategy benchmark-round5-2026-09-03 (summarised in this repo README).',
  collector: collectorHealth,
  containers,
  volt_stats_demo_org: voltStats,
  facts_chain_head: factsChain,
  incidents,
}

mkdirSync(dayDir, { recursive: true })
const serialized = `${JSON.stringify(checkpoint, null, 2)}\n`
writeFileSync(join(dayDir, 'checkpoint.json'), serialized)
const checkpointHash = createHash('sha256').update(serialized).digest('hex')

// --- append to the canary chain (public export, gaps visible) -------------
const chainPath = join(HERE, 'chain.json')
const chainExport = existsSync(chainPath)
  ? JSON.parse(readFileSync(chainPath, 'utf8'))
  : { chain_id: CHAIN_ID, entries: [], tips: [] }
const sourceId = `${CHAIN_ID}#day-${dayNumber}#sha256:${checkpointHash}`
let entry = chainExport.entries.find((e) => e.source_id === sourceId)
if (!entry) {
  entry = appendEntry(chainExport.entries, {
    chainId: CHAIN_ID, sourceKind: 'EXTERNAL', sourceId,
    payloadHash: checkpointHash, issuerId: ISSUER_ID,
  })
  chainExport.entries.push(entry)
}
const keypair = loadKeypair(PUB, PRIV)
const publicKeyPem = readFileSync(PUB, 'utf8')
let tip = chainExport.tips.find((t) => t.tip_seq === entry.seq)
if (!tip) {
  const sig = signTipHash(entry.chain_hash, keypair.privateKey)
  tip = computeTip(CHAIN_ID, chainExport.entries, entry.seq, { keyId: keypair.keyId, sig })
  chainExport.tips.push(tip)
}
writeFileSync(chainPath, `${JSON.stringify(chainExport, null, 2)}\n`)

writeFileSync(join(dayDir, 'statement.txt'),
  `${CHAIN_ID} day=${dayNumber} seq=${entry.seq} chain_hash=${entry.chain_hash} checkpoint_sha256=${checkpointHash}\n`)
writeFileSync(join(dayDir, 'receipt.json'), `${JSON.stringify({
  receipt_version: 1,
  subject: `ops-canary day ${dayNumber} (${today})`,
  checkpoint_sha256: checkpointHash,
  ward_entry: entry,
  ward_tip: tip,
  public_key: publicKeyPem,
  note: 'Same Ed25519 key as the quox.ai/facts chain: publicly pinned in every facts.receipt.json and in this repo since seq 1, before this canary began.',
}, null, 2)}\n`)

console.log(`canary: day ${dayNumber} checkpoint written (seq ${entry.seq}, sha256 ${checkpointHash.slice(0, 12)}...)`)

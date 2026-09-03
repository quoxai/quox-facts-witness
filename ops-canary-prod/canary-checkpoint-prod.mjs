#!/usr/bin/env node
/**
 * ops-canary-prod checkpoint generator (PROD-CORE P1, started 2026-09-03).
 *
 * The PRODUCTION sibling of ../ops-canary: same protocol (daily checkpoint,
 * own WARD chain, pre-pinned Ed25519 key, RFC-3161 countersignature,
 * append-only public history, failures included), observing the Quox
 * production instance (prod-1, the QuoxCORE deployment behind quox.ai's
 * own operations).
 *
 * OBSERVATION-ONLY in this phase: it reads state and asserts nothing ran.
 * The governed self-workload (enforcement drills, weekly retraining checks,
 * backup schedule, monitoring) arrives as later PROD-CORE phases, each
 * addition itself checkpointed here when it lands. That build-up being
 * visible in this history, phase by phase, is deliberate.
 *
 * Architecture note, stated for verifiers: metrics are gathered REMOTELY
 * over SSH from the box that holds the (publicly pre-pinned) signing key;
 * the key never resides on the observed instance. The metric VALUES remain
 * self-reported, the same boundary every receipt in this repository states.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const CHAIN_ID = 'ward:quox.ai/ops-canary-prod'
const ISSUER_ID = 'quox.ai#dev-signer'
const DAY_ZERO = '2026-09-03'
const INSTANCE = 'Quox production instance prod-1 (the QuoxCORE deployment running Quox Ltd’s own production operations)'
const SSH_TARGET = process.env.QUOX_PROD_SSH || 'quox-prod'

const WARD_SDK_HOME = process.env.QUOX_WARD_SDK || '/home/control/ward-sdk'
const FACTS_KEYS = join(homedir(), '.quox-ward/facts/keys')

const sdkEntry = join(WARD_SDK_HOME, 'dist/src/index.js')
if (!existsSync(sdkEntry)) { console.error(`canary-prod: ward-sdk build missing at ${sdkEntry}`); process.exit(1) }
const ward = await import(pathToFileURL(sdkEntry).href)
const { appendEntry, computeTip, signTipHash, loadKeypair } = ward

const PUB = join(FACTS_KEYS, 'ed25519_public.pem')
const PRIV = join(FACTS_KEYS, 'ed25519_private.pem')
if (!existsSync(PUB) || !existsSync(PRIV)) {
  console.error('canary-prod: pinned signing key not found; refusing to mint a new one')
  process.exit(1)
}

const today = new Date().toISOString().slice(0, 10)
const dayNumber = Math.round((Date.parse(today) - Date.parse(DAY_ZERO)) / 86400000)
const dayDir = join(HERE, `day-${String(dayNumber).padStart(4, '0')}`)

function sshRun(cmd) {
  return execFileSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', SSH_TARGET, cmd], { encoding: 'utf8', timeout: 60000 })
}
function tryRun(fn, label) {
  try { return fn() } catch (err) { return { unavailable: true, reason: `${label}: ${String(err.message).slice(0, 160)}` } }
}

// An UNREACHABLE instance is a checkpoint, not a skipped day: reachability
// itself is the first metric, and a down day must appear in the history.
const reachable = tryRun(() => { sshRun('true'); return { ok: true } }, 'ssh')

let containers = { unavailable: true, reason: 'instance unreachable' }
let collector = containers, backupFreshness = containers, host = containers
if (reachable.ok) {
  containers = tryRun(() => {
    const out = sshRun('docker ps -a --format "{{.Names}}\t{{.Status}}" | grep -E "^quox-" ; true')
    return out.trim().split('\n').filter(Boolean).map((l) => {
      const [name, status] = l.split('\t')
      const inspect = sshRun(`docker inspect --format "{{.State.StartedAt}}|{{.RestartCount}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}" ${name}`).trim()
      const [startedAt, restartCount, health] = inspect.split('|')
      return {
        name, status, health,
        started_at: startedAt,
        restart_count: Number(restartCount),
        restarted_last_24h: (Date.now() - Date.parse(startedAt)) < 86400000,
      }
    })
  }, 'docker')

  collector = tryRun(() => {
    const body = sshRun('curl -s -m 15 http://localhost:9848/health')
    const parsed = JSON.parse(body)
    // The collector reports status:"healthy"; the website reports
    // status:"ok". Day-0's first draft accepted only "ok" and mis-scored a
    // healthy collector as down; corrected before any external reference.
    return {
      healthy: ['ok', 'healthy'].includes(parsed.status),
      version: parsed.version ?? null,
      uptime_seconds: parsed.uptime_seconds ?? null,
    }
  }, 'collector-health')

  // PROD-CORE P3 will add a recurring schedule; until then this HONESTLY
  // reports the age of whatever newest backup artifact exists, which on
  // day 0 is a one-off pre-deploy snapshot, and that gap is the finding.
  backupFreshness = tryRun(() => {
    const out = sshRun('ls -t /opt/quoxcore/*.tar.gz 2>/dev/null | head -1 | xargs -r stat -c "%Y" ; true').trim()
    if (!out) return { newest_backup: null, note: 'no backup artifacts found' }
    const ageHours = Math.round((Date.now() / 1000 - Number(out)) / 3600)
    return { newest_backup_age_hours: ageHours, recurring_schedule: false, note: 'one-off pre-deploy snapshots only; recurring schedule is PROD-CORE P3' }
  }, 'backups')

  host = tryRun(() => {
    const disk = sshRun('df -h / | tail -1').trim().split(/\s+/)
    const load = sshRun('cut -d" " -f1-3 /proc/loadavg').trim()
    const up = sshRun('cut -d" " -f1 /proc/uptime').trim()
    return { disk_used: disk[4] ?? null, load_avg: load, uptime_days: Math.round(Number(up) / 86400) }
  }, 'host')
}

// Org count: a live activity signal, and the prerequisite for the governed
// self-workload (PROD-CORE P2/P4). Zero on 2026-09-03 is the honest state
// of a production instance that has not yet been provisioned with a working
// org; the number changing over time is exactly the trace the canary exists
// to leave. Read over SSH so no prod secret transits the key-holding box.
let orgs = { unavailable: true, reason: 'instance unreachable' }
if (reachable.ok) {
  orgs = tryRun(() => {
    const out = sshRun('SK=$(docker exec quox-collector printenv INTERNAL_SERVICE_KEY); curl -s -m 15 "http://localhost:3101/api/internal/orgs/list" -H "X-Service-Key: $SK"')
    const parsed = JSON.parse(out)
    const list = Array.isArray(parsed) ? parsed : (parsed.orgs || parsed.data || [])
    return { count: list.length }
  }, 'orgs')
}

const incidentsFile = join(HERE, 'incidents', `${today}.md`)
const incidents = existsSync(incidentsFile)
  ? readFileSync(incidentsFile, 'utf8').trim()
  : 'none recorded for this date (manual notes land in ops-canary-prod/incidents/<date>.md)'

const checkpoint = {
  canary_version: 1,
  chain_id: CHAIN_ID,
  day: dayNumber,
  date: today,
  day_zero: DAY_ZERO,
  instance: INSTANCE,
  phase: 'PROD-CORE P1: observation only; governed self-workload arrives in later phases and each addition will be visible in this history',
  reachable: reachable.ok === true,
  collector,
  containers,
  orgs,
  backup_freshness: backupFreshness,
  host,
  incidents,
}

mkdirSync(dayDir, { recursive: true })
const serialized = `${JSON.stringify(checkpoint, null, 2)}\n`
writeFileSync(join(dayDir, 'checkpoint.json'), serialized)
const checkpointHash = createHash('sha256').update(serialized).digest('hex')

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
  subject: `ops-canary-prod day ${dayNumber} (${today})`,
  checkpoint_sha256: checkpointHash,
  ward_entry: entry,
  ward_tip: tip,
  public_key: publicKeyPem,
  note: 'Same Ed25519 key as the quox.ai/facts chain: publicly pinned in every facts.receipt.json and in this repo since seq 1, before either canary began.',
}, null, 2)}\n`)

console.log(`canary-prod: day ${dayNumber} checkpoint written (seq ${entry.seq}, sha256 ${checkpointHash.slice(0, 12)}...)`)

import { redirect } from 'next/navigation'

// PAUSED (Galen, Aug 24 2026): the Railway brain is down for cost; its full
// page (all tabs) lives on as a STATIC ARCHIVE with a paused banner and a
// stubbed /state fed by the final snapshot (67 eyes, champion "forms") —
// public/swarm2-archive.html, extracted from swarm2-brain/server.js.
// We REDIRECT rather than iframe: this site sends X-Frame-Options: DENY, so
// it cannot frame itself (the old iframe worked only because it framed the
// Railway origin). RESUME: bring the Railway service back up and restore the
// live iframe (git history of this file).
export default function Swarm2Page() {
  redirect('/swarm2-archive.html')
}

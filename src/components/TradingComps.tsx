import React, { useEffect, useMemo, useState } from "react";
import { Users, Loader2, Plus, RefreshCw, X, ExternalLink } from "lucide-react";
import { useDeal } from "../context/DealContext";
import { apiUrl, BACKEND_MISSING } from "../lib/api";
import { compsStats, impliedPrice, meaningful, PeersResult, toPeer } from "../lib/peers";
import { CompanyData, Peer } from "../types";
import { cn, fmt, fmtX } from "../lib/utils";

const KEYS = [
  { key: "evRevenue", label: "EV/Revenue" },
  { key: "evEbitda", label: "EV/EBITDA" },
  { key: "pe", label: "P/E" },
] as const;

// One automatic search per target per page load, so switching tabs doesn't re-query the SEC.
const autoSearched = new Set<string>();

async function readError(res: Response) {
  const body = await res.json().catch(() => null);
  return body?.error ?? (res.status === 404 && !body ? BACKEND_MISSING : `HTTP ${res.status}`);
}

/** Trading comparables: peers auto-picked by SIC code and size from SEC data, editable by the user. */
export function TradingComps() {
  const { state, setState } = useDeal();
  const t = state.target!;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [add, setAdd] = useState("");
  const [adding, setAdding] = useState(false);
  const info = state.peerInfo;
  const peers = state.peers;

  const setPeers = (f: (p: Peer[]) => Peer[]) => setState(prev => ({ ...prev, peers: f(prev.peers) }));

  const search = async () => {
    setLoading(true);
    setError(null);
    try {
      const exclude = state.acquirer ? `?exclude=${encodeURIComponent(state.acquirer.ticker)}` : "";
      const res = await fetch(apiUrl(`/api/peers/${encodeURIComponent(t.ticker)}${exclude}`));
      if (!res.ok) throw new Error(await readError(res));
      const { peers: found, ...meta } = (await res.json()) as PeersResult;
      // Keep peers the user added by hand.
      setState(prev => ({ ...prev, peers: [...found, ...prev.peers.filter(p => p.why === "Added by you" && !found.some(f => f.ticker === p.ticker))], peerInfo: meta }));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!peers.length && !autoSearched.has(t.ticker)) {
      autoSearched.add(t.ticker);
      search();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.ticker]);

  const addPeer = async () => {
    const ticker = add.trim().toUpperCase();
    if (!ticker || peers.some(p => p.ticker === ticker)) return setAdd("");
    setAdding(true);
    setError(null);
    try {
      const res = await fetch(apiUrl(`/api/market/${encodeURIComponent(ticker)}`));
      if (!res.ok) throw new Error(`${ticker}: ${await readError(res)}`);
      const c = (await res.json()) as CompanyData;
      setPeers(p => [...p, toPeer(c, "Added by you")]);
      setAdd("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAdding(false);
    }
  };

  const stats = useMemo(() => KEYS.map(k => ({ ...k, s: compsStats(peers, k.key) })), [peers]);
  const offer = state.deal.offer;

  return (
    <section className="bg-bg-card border border-border-alt rounded-2xl p-6" aria-label="Trading comparables">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
        <div>
          <h3 className="text-[10px] font-bold uppercase tracking-[4px] text-accent-blue flex items-center gap-2">
            <Users size={14} /> Trading Comparables
          </h3>
          <p className="text-xs text-text-muted mt-2 max-w-2xl">
            {info ? (
              <>
                Picked from SEC data: the {peers.filter(p => p.why !== "Added by you").length} listed companies with SIC code{" "}
                <span className="text-text-secondary">{info.sic}{info.sicDescription ? ` (${info.sicDescription})` : ""}</span>
                {info.widened ? " and related codes in its industry group" : ""} whose CY{info.revenueYear} revenue is closest to {t.ticker}'s, out of {info.candidates} candidates.
                Their figures load from their own filings, like the target's.
              </>
            ) : (
              <>Peers are picked from SEC filings by industry (SIC code) and size, then loaded from their own filings.</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={add}
            onChange={e => setAdd(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addPeer()}
            placeholder="Add ticker"
            aria-label="Add peer ticker"
            className="w-28 bg-bg border border-border-alt rounded-md px-3 py-1.5 font-mono text-[11px] text-text-primary outline-none focus:border-accent-blue"
          />
          <button onClick={addPeer} disabled={adding || !add.trim()} className="p-1.5 border border-border-alt rounded-md text-text-secondary hover:bg-bg-alt disabled:opacity-40" aria-label="Add peer">
            {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          </button>
          <button onClick={search} disabled={loading} className="px-3 py-1.5 border border-border-alt rounded-md text-[10px] font-bold uppercase tracking-widest text-text-secondary hover:bg-bg-alt disabled:opacity-40 flex items-center gap-2">
            {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} {info ? "Re-pick" : "Find peers"}
          </button>
        </div>
      </div>

      {loading && <p className="text-xs text-text-muted my-4 flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> Searching SEC filings for {t.ticker}'s industry and loading each peer's filings. This can take 20–30 seconds the first time.</p>}
      {error && <p className="text-xs text-accent-red my-3">{error}</p>}

      {peers.length > 0 && (
        <div className="overflow-x-auto mt-4">
          <table className="w-full text-left font-mono text-[11px] border-collapse min-w-[640px]">
            <thead>
              <tr className="text-text-muted text-[9px] uppercase tracking-wider border-b border-border-alt">
                <th className="py-2 pr-2 w-6"><span className="sr-only">Include</span></th>
                <th className="py-2 pr-3 font-bold">Company</th>
                <th className="py-2 px-3 font-bold text-right">Mkt cap (M)</th>
                {KEYS.map(k => <th key={k.key} className="py-2 px-3 font-bold text-right">{k.label}</th>)}
                <th className="py-2 px-3 font-bold">Period · source</th>
                <th className="py-2 w-6"><span className="sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody className="text-text-secondary">
              {peers.map(p => (
                <tr key={p.ticker} className={cn("border-b border-border-alt/60", !p.included && "opacity-40")}>
                  <td className="py-2 pr-2">
                    <input type="checkbox" checked={p.included} aria-label={`Include ${p.ticker}`}
                      onChange={() => setPeers(ps => ps.map(x => (x.ticker === p.ticker ? { ...x, included: !x.included } : x)))} />
                  </td>
                  <td className="py-2 pr-3" title={p.why}>
                    <div className="text-text-primary font-bold">{p.ticker}</div>
                    <div className="text-[10px] text-text-muted font-sans truncate max-w-[220px]">{p.name}</div>
                    <div className="text-[9px] text-text-muted font-sans max-w-[260px]">{p.why}</div>
                  </td>
                  <td className="py-2 px-3 text-right">{fmt(p.marketCap)}</td>
                  {KEYS.map(k => (
                    <td key={k.key} className="py-2 px-3 text-right">{meaningful(k.key, p[k.key]) ? fmtX(p[k.key]) : <span className="text-text-muted" title="Not meaningful: negative or near-zero earnings">NM</span>}</td>
                  ))}
                  <td className="py-2 px-3 text-[10px]">
                    <div>{p.period}</div>
                    {p.filingUrl ? (
                      <a href={p.filingUrl} target="_blank" rel="noreferrer" className="text-accent-blue hover:underline inline-flex items-center gap-1">{p.source} <ExternalLink size={9} /></a>
                    ) : <span className="text-text-muted">{p.source}</span>}
                  </td>
                  <td className="py-2">
                    <button aria-label={`Remove ${p.ticker}`} onClick={() => setPeers(ps => ps.filter(x => x.ticker !== p.ticker))} className="text-text-muted hover:text-accent-red"><X size={12} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="text-text-primary">
              {(["q1", "median", "q3"] as const).map(q => (
                <tr key={q} className={cn(q === "median" && "font-bold")}>
                  <td />
                  <td className="py-1.5 pr-3 text-[10px] uppercase tracking-wider text-text-muted">{q === "q1" ? "25th percentile" : q === "q3" ? "75th percentile" : "Median"}</td>
                  <td />
                  {stats.map(({ key, s }) => <td key={key} className="py-1.5 px-3 text-right">{s ? fmtX(s[q]) : "—"}</td>)}
                  <td colSpan={2} />
                </tr>
              ))}
            </tfoot>
          </table>
        </div>
      )}

      {peers.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
          {stats.map(({ key, label, s }) => {
            const price = s ? impliedPrice(key, s.median, t) : NaN;
            return (
              <div key={key} className="bg-bg-alt border border-border-alt rounded-lg p-3">
                <div className="text-[9px] uppercase tracking-widest text-text-muted">{t.ticker} at median {label}</div>
                <div className="text-lg font-bold text-text-primary font-mono">{Number.isFinite(price) ? `${t.currency}${fmt(price, 2)}` : "—"}</div>
                <div className="text-[10px] text-text-muted">
                  {Number.isFinite(price) && offer > 0 ? `Offer ${t.currency}${fmt(offer, 2)} is ${offer >= price ? "above" : "below"} this by ${fmt(Math.abs(offer / price - 1) * 100, 1)}%` : s ? "Target figure not positive" : "No meaningful peer multiples"}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {info && (
        <details className="mt-4 text-[11px] text-text-muted">
          <summary className="cursor-pointer text-text-secondary">Sources and method</summary>
          <ul className="mt-2 space-y-1 list-disc pl-5">
            {info.sources.map(s => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer" className="text-accent-blue hover:underline">{s.label}</a></li>)}
            <li>Multiples use each peer's latest reported (LTM) figures and today's share price. EV = market cap + net debt. Negative or extreme multiples (EV/Revenue over 50x, EV/EBITDA or P/E over 100x) are shown as NM and left out of the statistics.</li>
            {info.skipped.length > 0 && <li>Skipped because their data could not be loaded: {info.skipped.join("; ")}</li>}
          </ul>
        </details>
      )}
    </section>
  );
}

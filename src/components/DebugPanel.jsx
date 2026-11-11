import React, { useEffect, useRef, useState } from "react";
import { restoreFromRecoveryKey, importKeysJson, describeError } from "../services/matrixClient.js";
import { getMessageBackupStatus } from "../services/messageRecovery.js";

export default function DebugPanel(p) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState("");
  const [keyJson, setKeyJson] = useState("");
  const [keyMsg, setKeyMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [backupStatus, setBackupStatus] = useState("Not checked");
  const recoveryInput = useRef(null);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!p.recoveryRequest) return;
    setOpen(true);
    requestAnimationFrame(() => recoveryInput.current?.focus());
  }, [p.recoveryRequest]);

  useEffect(() => {
    let active = true;
    if (open && p.canRestore) {
      getMessageBackupStatus(p.client).then((s) => { if (active) setBackupStatus(s); })
        .catch(() => { if (active) setBackupStatus("Could not check backup"); });
    }
    return () => { active = false; };
  }, [open, p.canRestore, p.client]);

  // Diagnostic info: NO passwords, access tokens, recovery keys or session keys.
  const diag = {
    app: "Matrix Chat Tester",
    sdk: "matrix-js-sdk 45.0.0 (Rust crypto)",
    time: new Date().toISOString(),
    homeserver: p.homeserver || null,
    userId: p.userId || null,
    deviceId: p.deviceId || null,
    connection: p.status,
    syncState: p.syncState,
    crypto: p.cryptoStatus,
    messageBackup: backupStatus,
    selectedRoomId: p.roomId || null,
    selectedRoomEncrypted: p.roomEncrypted ?? null,
    messagesLoaded: p.msgCount,
    recentErrors: p.errors,
    userAgent: navigator.userAgent,
  };
  const connectionTone = p.status === "Connected" ? "ok" : p.status === "Not connected" ? "bad" : "warn";
  const diagnostics = [
    ["Homeserver", diag.homeserver],
    ["User ID", diag.userId],
    ["Device ID", diag.deviceId],
    ["Connection", diag.connection],
    ["Sync state", diag.syncState],
    ["Encryption", diag.crypto],
    ["Message backup", backupStatus],
    ["Selected room", diag.selectedRoomId],
    ["Room encrypted", diag.selectedRoomEncrypted == null ? null : diag.selectedRoomEncrypted ? "Yes" : "No"],
    ["Messages loaded", diag.messagesLoaded],
  ];

  const copy = async () => {
    await navigator.clipboard.writeText(JSON.stringify(diag, null, 2));
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };

  const restore = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setKeyMsg(null);
    const suppliedKey = recoveryKey;
    setRecoveryKey("");
    try {
      const r = await restoreFromRecoveryKey(p.client, suppliedKey, {
        progressCallback: (progress) => setKeyMsg(progress.stage === "fetch"
          ? "Downloading message keys…"
          : `Importing message keys… ${progress.successes ?? 0} imported`),
      });
      setBackupStatus(await getMessageBackupStatus(p.client));
      setKeyMsg(r.imported > 0
        ? `Restored ${r.imported} of ${r.total} keys. Messages with matching keys will update automatically; missing keys need a trusted device's room-key export.`
        : `No keys imported (${r.total} found in backup). Use a room-key export from a device that can read the missing messages.`);
      p.onRecovered?.();
    } catch (e) { const t = describeError(e, "keys"); setKeyMsg("Restore failed: " + t); p.pushError("Key restore: " + t); }
    finally { setRecoveryKey(""); setBusy(false); busyRef.current = false; }
  };

  const doImport = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setKeyMsg(null);
    try { await importKeysJson(p.client, keyJson); setKeyMsg("Room keys imported."); p.onRecovered?.(); }
    catch (e) { const t = describeError(e, "keys"); setKeyMsg("Import failed: " + t); p.pushError("Key import: " + t); }
    finally { setKeyJson(""); setBusy(false); busyRef.current = false; }
  };

  return (
    <div className="debug">
      <button className="debug-toggle" aria-expanded={open} aria-controls="debug-panel-content" onClick={() => setOpen(!open)}>
        <span className="debug-toggle-copy">
          <span className={`debug-chevron${open ? " is-open" : ""}`} aria-hidden="true">›</span>
          <span>
            <span className="debug-title">Developer diagnostics</span>
            <span className="debug-subtitle">Connection, encryption and recovery</span>
          </span>
        </span>
        <span className={`debug-status ${connectionTone}`}>{p.status || "Status unavailable"}</span>
      </button>
      {open && (
        <div className="debug-body" id="debug-panel-content">
          <section className="debug-section" aria-label="Session diagnostics">
            <div className="debug-grid">
              {diagnostics.map(([label, value]) => (
                <div className="debug-item" key={label}>
                  <span className="debug-label">{label}</span>
                  <span className="debug-value" title={value == null ? undefined : String(value)}>{value ?? "—"}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="debug-section debug-errors" aria-labelledby="debug-errors-title">
            <div className="debug-section-heading">
              <span id="debug-errors-title" className="debug-section-title">Recent errors</span>
              <span className={`debug-error-count${p.errors.length ? " has-errors" : ""}`}>{p.errors.length}</span>
            </div>
            {p.errors.length === 0 ? <div className="muted small">No recent errors</div> : (
              <ul className="errlist">{p.errors.map((e, i) => <li key={i}><span className="muted">{e.at}</span> {e.text}</li>)}</ul>
            )}
          </section>
          <div className="debug-actions">
            <button className="btn small" onClick={copy}>{copied ? "Copied!" : "Copy diagnostic info"}</button>
          </div>

          {p.canRestore && (
            <section className="keys" aria-labelledby="debug-keys-title">
              <div>
                <div className="debug-section-title" id="debug-keys-title">Recover message keys</div>
                <div className="muted small">Restore a backup or import a room-key export to read historical messages.</div>
              </div>
              <div className="row">
                <input ref={recoveryInput} aria-label="Recovery Key" type="password" placeholder="Element Recovery Key (Security Key)" value={recoveryKey}
                  onChange={(e) => setRecoveryKey(e.target.value)} autoComplete="off" disabled={busy} />
                <button className="btn small" disabled={busy || !recoveryKey} onClick={restore}>Restore from backup</button>
              </div>
              <div className="row">
                <textarea aria-label="Room-key export JSON" rows={2} placeholder="Paste unencrypted room-key export JSON" value={keyJson} onChange={(e) => setKeyJson(e.target.value)} />
                <button className="btn small" disabled={busy || !keyJson} onClick={doImport}>Import keys</button>
              </div>
              {keyMsg && <div className="debug-key-message small" role="status">{keyMsg}</div>}
            </section>
          )}
        </div>
      )}
    </div>
  );
}

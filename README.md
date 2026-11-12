# watchdog-state

State for the stale-feed alert's [cloud check] layer (fix plan step 8). One file,
`state.json`, holding the last known feed state and when the last notification was sent, so
"once when stale, every 3 hours while stale, once on recovery" survives between runs -
GitHub Actions runners are ephemeral and have nowhere else to remember it.

This branch is ORPHAN on purpose: it shares no history with `main`, is not served by GitHub
Pages, and nothing on `main` reads it. It is written only when the state CHANGES, so an
outage costs a handful of commits rather than one every 15 minutes.

It contains no secrets. The ntfy topic lives only in the `NTFY_TOPIC` repository secret.

# Preprod deployment records

Files in this directory contain public, reproducible deployment plans and
confirmed transaction references. They must never contain a seed phrase,
private key, signing key, wallet password, or Blockfrost project key.

`preprod-plan.json` is deliberately labelled `PLANNED_NOT_SUBMITTED` until the
bootstrap transaction is signed in Lace, submitted, and independently observed
through Blockfrost. A script address or locally derived policy id is not proof
of an on-chain deployment.

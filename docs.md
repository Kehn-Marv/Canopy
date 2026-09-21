# Canopy Detection Rules

The following rules run continuously over the real, hash-chained event ledger. They are explicit, inspectable heuristics.

| Rule | Fires when | Where it is blind |
|---|---|---|
| **Bulk egress burst** | One person touches five or more distinct items inside thirty minutes. | A steady drip of one file a day stays under it. |
| **Departure surge** | Heavy access by someone whose departure date is inside 45 days. | Only works if the departure date was actually entered. |
| **Outside-domain release** | A releasable or exportable grant pointing at a non-institutional address. | A personal address that also gets institutional mail looks external either way. |
| **Unrecognised device** | A link opened from a device this vault has never seen. | Clearing site data makes a known device look new. |
| **Retry after revocation** | Repeated attempts to use a link that was already withdrawn. | Often just a confused collaborator, not an attacker. |
| **Off-hours access** | Access between midnight and 05:00 local time. | Lab work genuinely happens at night. Ranked low for that reason. |
| **Capture pressure** | Print-screen, print or copy attempts inside the protected viewer. | A phone camera pointed at the screen produces no event at all. |
| **Integrity failure** | Stored ciphertext no longer matches its recorded digest. | Cannot tell disk corruption from deliberate tampering. |
| **Dormant access** | A live grant with no expiry that has not been used in 30 days. | Seasonal collaborators will be flagged every dry spell. |

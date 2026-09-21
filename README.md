# Canopy

**ICSC 2026 Universities Hackathon -- Track F: Protecting University Research**

Canopy is a zero-trust cryptographic vault and protected document viewer for university laboratories. It is built as a native Windows desktop application (.exe) that makes sensitive research files (unpublished results, draft patent applications, datasets, methods) harder to copy, forward, or take away without permission, while preserving the collaborative workflows researchers depend on.

## The Problem (Track F)

University laboratories hold work whose value depends on not being seen too early. The protection around it is close to nothing: files sit on shared drives with stale permissions, on personal cloud accounts, on students' laptops, and in WhatsApp groups that never get deleted. Staff and students arrive and leave every year, and nobody removes old access.

The real difficulty is not encryption. It is people. Research culture depends on sharing, and any control heavy enough to work will simply be avoided by a researcher facing a deadline.

## How Canopy Solves It

| Challenge Requirement | How Canopy Addresses It |
|---|---|
| Make files harder to copy, forward, or take away | Files are encrypted at rest (AES-256-GCM), viewable only inside the app's protected viewer. The OS-level capture guard blocks screenshots, screen recordings, and remote screen sharing. Content is decrypted in memory only and never written to disk. |
| Allow normal collaborative work | Capability-based share links let the vault owner grant access to any collaborator (internal or external, across departments, universities, and countries) without giving away the file. Links can be configured for view-only, exportable, time-limited, or device-bound access. |
| Detect realistic leak patterns | Nine deterministic detection rules run over the audit ledger: bulk download bursts, departure-surge correlation, outside-domain releases, unrecognised devices, retry-after-revocation, off-hours access, capture pressure, integrity failures, and dormant (forgotten) access grants. |
| Controlled sharing with external partners | Released copies carry provenance footers and dynamic watermarks tied to the recipient's identity. Terms must be accepted before access opens. Every interaction is recorded in a tamper-evident ledger. |
| Handle staff/student turnover | One-click offboarding revokes all of a departing person's active grants simultaneously. Departure dates trigger automatic detection alerts when access climbs near a leave date. |
| Work during power and network cuts | Fully offline-first. All data is persisted in IndexedDB. Transfers are chunked and resumable. Actions queue in an outbox with exponential backoff. |

## Key Features

| Feature | Description |
|---|---|
| **Native Capture Protection** | Hooks into the Windows API (`SetWindowDisplayAffinity`) via Rust to block OS-level screenshots, screen recordings, and remote screen sharing. Content blanks when the window loses focus. |
| **Sealed `.canopy` Containers** | A proprietary encrypted file format. Files are decrypted strictly in memory. Revocation destroys the cryptographic key, not a flag. |
| **Universal Safe Renderer** | Safely displays PDFs, DOCX, XLSX, images, audio, video, and 30+ code languages without extracting files to disk. Identifies files by magic bytes, not declared MIME types. |
| **Tamper-Evident Audit Ledger** | Append-only, hash-chained log. Every interaction is recorded, hashed, and chained. Tampering with any entry invalidates every entry after it. |
| **Leak-Detection Engine** | Nine heuristic rules that flag suspicious patterns and recommend one-click actions (revoke access, offboard person). Each rule documents its own blind spots. |
| **Resumable Chunked Transfers** | Large files are split into 1 MiB chunks. Progress survives crashes, power cuts, and closed windows. Resumes automatically. |
| **Dynamic Watermarking** | User-identity watermarks tiled across viewed content and burned into released image copies. |

## Technology Stack

* **Frontend:** React 18, TypeScript, Vite
* **Styling:** TailwindCSS, Lucide Icons
* **Desktop Shell:** Tauri v2, Rust
* **Storage:** IndexedDB, LocalStorage (fully local, no cloud dependency)
* **Cryptography:** Web Crypto API (PBKDF2, AES-GCM-256, HKDF-SHA-256)

## Getting Started

### Prerequisites

* [Node.js](https://nodejs.org/en/) v18 or higher
* [Rust](https://www.rust-lang.org/tools/install) (for Tauri compilation)
* Microsoft Visual Studio C++ Build Tools (Windows requirement for Rust)

### Installation

1. Install JavaScript dependencies:
   ```bash
   npm install
   ```

2. Install Tauri API and CLI:
   ```bash
   npm install @tauri-apps/api@latest
   npm install -D @tauri-apps/cli@latest
   ```

### Running the Application

**Desktop app with native capture protection (recommended):**
```bash
npx tauri dev
```

**Web-only development (UI work, no native hooks):**
```bash
npm run dev
```

### Building the Executable

To compile a standalone Windows executable (.exe) and installers (.msi, .nsis):

```bash
npx tauri build
```

Output location: `src-tauri/target/release/bundle/`

## Honest Limitations

* No user-space application can prevent hardware-level capture (phone cameras, HDMI capture cards). The UI states this plainly.
* Remote machine-to-machine sync is not shipped in this build. The outbox infrastructure exists, but no relay endpoint is connected.
* Detection thresholds are fixed. A patient attacker who stays below them will not trigger an alert.
* Device identity is application-level, not hardware-bound. Clearing site data resets it.

# Canopy

Canopy is a secure, cryptographic vault and protected document viewer distributed as a native Windows desktop application. Built with security and zero-trust principles at its core, it provides an airtight environment for sharing, viewing, and auditing sensitive digital assets.

Canopy protects files at rest via a sealed cryptographic container format, protects files in transit via an offline-first resilient sync queue, and protects files in use via OS-level capture deterrence and dynamic watermarking.

## Key Features

| Feature | Description |
|---------|-------------|
| **Native Capture Protection** | Hooks directly into the Windows API (`SetWindowDisplayAffinity`) via Rust to natively block OS-level screenshots, screen recordings, and remote screen sharing while a protected asset is on screen. |
| **Sealed `.canopy` Containers** | A proprietary encrypted file format using PBKDF2, AES-GCM, and HKDF. Files are decrypted strictly in memory and keys are wrapped per-link, allowing instant cryptographic revocation even offline. |
| **Universal Safe Renderer** | An isolated, script-free renderer that safely displays PDFs, DOCX, XLSX, images, audio, video, and 30+ code languages without ever extracting files to disk. Identifies files using content-sniffed magic bytes instead of trusting declared MIME types. |
| **Tamper-Evident Ledger** | An append-only cryptographic audit log. Every interaction (opening, copying, revoked access) is recorded, hashed, and chained. Includes built-in leak-detection rules to alert on suspicious behavior. |
| **Offline-First Sync Engine** | Fully functional offline. Actions are written to a resilient outbox using IndexedDB compare-and-swap writes. Large files are handled via a resumable chunked transfer queue. |
| **Dynamic Watermarking** | Renders robust, non-removable user-identity watermarks across all protected documents. |

## Technology Stack

Canopy is a hybrid application combining a web frontend with a high-performance native systems backend.

* **Frontend:** React 18, Vite, TypeScript
* **Styling:** TailwindCSS, Lucide Icons
* **Desktop Shell:** Tauri v2, Rust
* **Storage:** IndexedDB, LocalStorage
* **Cryptography:** Web Crypto API, native Rust implementations

## Getting Started

### Prerequisites
Before you begin, ensure you have the following installed on your machine:
* [Node.js](https://nodejs.org/en/) (v18 or higher)
* [Rust](https://www.rust-lang.org/tools/install) (for Tauri compilation)
* Microsoft Visual Studio C++ Build Tools (Windows requirement for Rust)

### Installation

1. **Install JavaScript Dependencies**
   ```bash
   npm install
   ```

2. **Install Tauri API and CLI**
   ```bash
   npm install @tauri-apps/api@latest
   npm install -D @tauri-apps/cli@latest
   ```

### Running the Application

You have two primary ways to run Canopy depending on your development needs:

**1. Desktop App Development (Hot-Reloading)**
To run the fully-functional native Windows executable with live-reloading enabled:
```bash
npx tauri dev
```
This command concurrently starts the Vite development server and the Rust desktop shell.

**2. Web-Only Development**
If you are only working on UI or CSS and do not need native Windows API hooks (like capture protection):
```bash
npm run dev
```

## Building for Production

To compile an optimized, standalone Windows executable (`.exe`) and its corresponding `.msi` and `.nsis` installers:

```bash
npx tauri build
```
Once the build completes, your installers will be available in the `src-tauri/target/release/bundle/` directory, and the raw standalone executable will be at `src-tauri/target/release/app.exe`.

## Security Architecture Notes
* Canopy is designed to gracefully handle adversarial environments, but no user-space software can prevent hardware-level capture (e.g., pointing a physical phone camera at a monitor, or using a hardware HDMI capture card). The UI explicitly acknowledges this limitation to maintain trust.
* The Universal File Renderer actively strips JavaScript execution contexts (e.g., from SVGs and PDFs) to prevent XSS and sandbox escapes.
* Memory constraints are respected: large files are chunked to prevent OOM (Out Of Memory) crashes during decryption.

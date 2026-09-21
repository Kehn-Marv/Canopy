
import { Check, X } from 'lucide-react';

const ENFORCED = [
'Files are encrypted locally before saving to storage.',
'Revoking a link destroys the encryption key, making the file unreadable.',
'Links are unique to one person. Sharing a link makes that person responsible for any access.',
'Limits and expiry are strictly checked before access is granted.',
'The viewer blocks screenshots, printing, and unauthorized copying where possible.',
'All access, sharing, and capture attempts are permanently recorded in the audit log.',
'Storage tampering is detected automatically.',
'Removing a person immediately revokes all their active links.'];

const NOT_ENFORCED = [
'Physical cameras pointing at the screen cannot be blocked.',
'OS-level screen recording or virtual machines may bypass protections.',
'Once a file is downloaded or exported, it cannot be recalled.',
'If someone stays completely offline, they may bypass revocation until they reconnect.',
'Compromised or malware-infected devices cannot guarantee security.',
'Clearing browser data will reset your device identity.'];


export function HonestyPanel() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="flex flex-col rounded-2xl border border-ok/20 bg-gradient-to-b from-ok/10 to-ok/5 p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ok/20 shadow-inner">
             <Check className="h-4 w-4 text-ok" strokeWidth={3} />
          </div>
          <h3 className="text-[15px] font-semibold text-ok">What Canopy actually enforces</h3>
        </div>
        <ul className="space-y-4">
          {ENFORCED.map((item) =>
            <li key={item} className="flex gap-3 text-[12.5px] leading-relaxed text-foreground/80">
              <div className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-ok/40" aria-hidden />
              <span>{item}</span>
            </li>
          )}
        </ul>
      </section>
      
      <section className="flex flex-col rounded-2xl border border-destructive/20 bg-gradient-to-b from-destructive/10 to-destructive/5 p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-destructive/20 shadow-inner">
             <X className="h-4 w-4 text-destructive" strokeWidth={3} />
          </div>
          <h3 className="text-[15px] font-semibold text-destructive">What it cannot, and will not claim to</h3>
        </div>
        <ul className="space-y-4">
          {NOT_ENFORCED.map((item) =>
            <li key={item} className="flex gap-3 text-[12.5px] leading-relaxed text-foreground/80">
              <div className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-destructive/40" aria-hidden />
              <span>{item}</span>
            </li>
          )}
        </ul>
      </section>
    </div>);

}
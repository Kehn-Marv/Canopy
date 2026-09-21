import React, { useEffect, useRef, useState } from 'react';
import { FileUp, Info, X } from 'lucide-react';
import { toast } from 'sonner';
import { useVault } from '../contexts/VaultContext';
import { formatBytes } from '../lib/format';
import { cn } from '../lib/cn';
import {
  Dialog,
  DialogContent,
  DialogDescription,

  DialogHeader,
  DialogTitle } from
'./ui/Dialog';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Label } from './ui/Label';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/Select';
import type { Sensitivity } from '../types';

const SENSITIVITIES: {value: Sensitivity;label: string;hint: string;}[] = [
{ value: 'internal', label: 'Internal', hint: 'Fine for the group to read.' },
{ value: 'restricted', label: 'Restricted', hint: 'Named people only.' },
{ value: 'embargoed', label: 'Embargoed', hint: 'Pre-filing or pre-publication. Disclosure is damage.' }];


export function IngestDialog({
  open,
  onOpenChange,
  initialFiles = [],
  defaultProject = ''





}: {open: boolean;onOpenChange: (open: boolean) => void;initialFiles?: File[];defaultProject?: string;}) {
  const { ingest, meta, assets } = useVault();
  const [files, setFiles] = useState<File[]>(initialFiles);
  const [project, setProject] = useState(defaultProject);
  const [sensitivity, setSensitivity] = useState<Sensitivity>('restricted');
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const projects = Array.from(new Set(assets.map((a) => a.project).filter(Boolean)));

  useEffect(() => {
    if (open) {
      setFiles(initialFiles);
      setProject(defaultProject || projects[0] || '');
      setSensitivity('restricted');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const addFiles = (incoming: FileList | File[] | null) => {
    if (!incoming) return;
    const next = Array.from(incoming);
    setFiles((current) => {
      const seen = new Set(current.map((f) => `${f.name}:${f.size}:${f.lastModified}`));
      return [...current, ...next.filter((f) => !seen.has(`${f.name}:${f.size}:${f.lastModified}`))];
    });
  };

  const submit = () => {
    if (!files.length) return;
    if (!project.trim()) {
      toast.error('Give this a project name so you can find it later.');
      return;
    }
    const { accepted, rejected } = ingest(files, { project: project.trim(), sensitivity });
    rejected.forEach((message) => toast.error(message));
    if (accepted) toast.success(`Sealing ${accepted} item(s). You can keep working.`);
    onOpenChange(false);
  };

  const limit = meta?.maxBatchFiles ?? 12;
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="squircle-element gap-0 overflow-hidden border-border/60 bg-background/95 p-0 shadow-2xl backdrop-blur-xl sm:max-w-xl">
        <div className="p-7 space-y-6">
          <DialogHeader>
            <DialogTitle className="text-[18px] tracking-tight">Seal new material</DialogTitle>
            <DialogDescription className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground/90">
              Files are encrypted on this device before anything is written to storage. The plaintext
              never touches your disk.
            </DialogDescription>
          </DialogHeader>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            addFiles(e.dataTransfer.files);
          }}
          className={cn(
            'surface-grid squircle-element border border-dashed px-6 py-10 text-center transition-elegant',
            dragging ? 'border-primary bg-primary/10 shadow-[inset_0_0_0_1px_var(--primary)]' : 'border-border/80 hover:border-border'
          )}>
          
          <FileUp className="mx-auto h-7 w-7 text-muted-foreground/60 transition-transform duration-500 hover:scale-105" aria-hidden />
          <p className="mt-3 text-[14px] font-semibold tracking-tight">Drop files here</p>
          <p className="mt-1.5 text-[12.5px] text-muted-foreground">
            Up to {limit} at a time · {formatBytes(meta?.maxFileBytes ?? 0)} each
          </p>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="sr-only"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }} />
          
          <Button variant="outline" size="sm" className="mt-3" onClick={() => inputRef.current?.click()}>
            Choose files
          </Button>
        </div>

        {files.length > 0 &&
        <ul className="max-h-36 space-y-1 overflow-y-auto rounded-[0.5rem] border border-border/60 bg-muted/20 p-1.5">
            {files.map((file, index) =>
          <li
            key={`${file.name}-${index}`}
            className="flex items-center gap-2 rounded px-2.5 py-1.5 text-[12.5px] transition-colors hover:bg-background">
            
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <span className="num shrink-0 text-[11px] text-muted-foreground">
                  {file.size === 0 ? 'empty' : formatBytes(file.size)}
                </span>
                <button
              type="button"
              onClick={() => setFiles((c) => c.filter((_, i) => i !== index))}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
              aria-label={`Remove ${file.name}`}>
              
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
          )}
          </ul>
        }

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="project">Project</Label>
            <Input
              id="project"
              value={project}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProject(e.target.value)}
              placeholder="e.g. Chloroquine resensitisation"
              list="project-suggestions" />
            
            <datalist id="project-suggestions">
              {projects.map((p) =>
              <option key={p} value={p} />
              )}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sensitivity">Sensitivity</Label>
            <Select value={sensitivity} onValueChange={(v) => setSensitivity(v as Sensitivity)}>
              <SelectTrigger id="sensitivity">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SENSITIVITIES.map((s) =>
                <SelectItem key={s.value} value={s.value}>
                    <span className="font-semibold block sm:inline">{s.label}</span>
                    <span className="hidden sm:inline"> - </span>
                    <span className="text-muted-foreground">{s.hint}</span>
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Sealing is chunked and resumable. If the power goes or you close the window, you lose at most
          one megabyte of work, not the whole upload.
        </p>

        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-border/60 bg-muted/20 px-7 py-5 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-[12.5px]">
            Cancel
          </Button>
          <Button onClick={submit} disabled={!files.length} className="text-[12.5px]">
            Seal {files.length || ''} item{files.length === 1 ? '' : 's'}
            {totalBytes > 0 && <span className="num ml-1 opacity-70">· {formatBytes(totalBytes)}</span>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>);

}
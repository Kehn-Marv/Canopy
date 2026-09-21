import React, { useMemo, useState } from 'react';
import { CalendarX2, LogOut, Plus, RotateCcw, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useVault } from '../contexts/VaultContext';
import { PageHeader, StatStrip } from '../components/AppShell';

import { EmptyState } from '../components/EmptyState';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Label } from '../components/ui/Label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle } from
'../components/ui/Dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/Select';
import { effectiveStatus } from '../lib/policy';
import { initials } from '../lib/format';
import type { Person, PersonRole } from '../types';

const ROLE_LABEL: Record<PersonRole, string> = {
  pi: 'Principal investigator',
  postgrad: 'Postgraduate',
  assistant: 'Research assistant',
  collaborator: 'Academic collaborator',
  external: 'External / industry'
};

const DAY = 86_400_000;

export function People() {
  const { people, grants, meta, addPerson, editPerson, offboard, reinstate } = useVault();
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState({
    name: '',
    email: '',
    affiliation: '',
    role: 'postgrad' as PersonRole,
    departure: ''
  });
  const [error, setError] = useState<string | null>(null);
  const [offboardTarget, setOffboardTarget] = useState<Person | null>(null);
  const [departureTarget, setDepartureTarget] = useState<Person | null>(null);
  const [departureDate, setDepartureDate] = useState('');

  const held = useMemo(() => {
    const map = new Map<string, number>();
    grants.forEach((g) => {
      if (effectiveStatus(g).status !== 'active') return;
      map.set(g.recipientId, (map.get(g.recipientId) ?? 0) + 1);
    });
    return map;
  }, [grants]);

  const departing = people.filter((p) => p.status === 'departing');
  const withAccess = people.filter((p) => (held.get(p.id) ?? 0) > 0);

  const submitAdd = async () => {
    setError(null);
    try {
      await addPerson({
        name: draft.name,
        email: draft.email,
        affiliation: draft.affiliation,
        role: draft.role,
        departureAt: draft.departure ? new Date(draft.departure).getTime() : null
      });
      setAddOpen(false);
      setDraft({ name: '', email: '', affiliation: '', role: 'postgrad', departure: '' });
      toast.success('Collaborator added.');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div>
      <PageHeader
        title="Collaborators"
        subtitle="Access rots because people leave and nobody closes their links. Recording a departure date turns that into something the system watches for you."
        actions={
        <Button className="gap-2" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> Add collaborator
          </Button>
        } />
      

      <StatStrip
        items={[
        { label: 'People', value: String(people.length) },
        { label: 'Holding live access', value: String(withAccess.length) },
        { label: 'Leaving soon', value: String(departing.length), tone: departing.length ? 'warn' : undefined },
        {
          label: 'Offboarded',
          value: String(people.filter((p) => p.status === 'offboarded').length),
          tone: 'ok'
        }]
        } />
      

      {people.length ?
      <ul className="divide-y divide-border/60">
          {people.map((person) => {
          const count = held.get(person.id) ?? 0;
          const isOwner = person.id === meta?.ownerPersonId;
          const daysLeft =
          person.departureAt !== null ? Math.round((person.departureAt - Date.now()) / DAY) : null;
          return (
            <li key={person.id} className="group flex flex-col gap-4 px-5 py-4 transition-elegant hover:bg-accent/25 sm:flex-row sm:items-center sm:px-6">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.75rem] bg-primary/10 text-[14px] font-medium text-primary shadow-sm transition-transform duration-300 group-hover:scale-105">
                  {initials(person.name)}
                </span>
                <div className="min-w-0 flex-1 flex items-center h-10">
                  <div className="flex flex-wrap items-center gap-3 leading-none">
                    <span className="truncate text-[14px] font-medium text-foreground tracking-tight">{person.email}</span>
                    {isOwner && <span className="text-[10px] font-bold uppercase tracking-widest text-primary/70 mt-0.5">You</span>}
                    {person.status === 'departing' && (
                      <span className="text-[10px] font-bold uppercase tracking-widest text-warn/80 mt-0.5">
                        {daysLeft !== null && daysLeft >= 0 ? `Leaves in ${daysLeft}d` : 'Departure passed'}
                      </span>
                    )}
                    {person.status === 'offboarded' && <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mt-0.5">Offboarded</span>}
                    {!person.internal && <span className="text-[10px] font-bold uppercase tracking-widest text-info/80 mt-0.5">External</span>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  <span className={`text-[12.5px] tracking-tight ${count ? 'font-medium text-primary/90' : 'font-normal text-muted-foreground/40'}`}>
                    {count} live link{count === 1 ? '' : 's'}
                  </span>
                  {!isOwner && person.status !== 'offboarded' &&
                <div className="flex gap-1.5 opacity-0 transition-opacity duration-300 group-hover:opacity-100 focus-within:opacity-100">
                      <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => {
                      setDepartureTarget(person);
                      setDepartureDate(
                        person.departureAt ?
                        new Date(person.departureAt).toISOString().slice(0, 10) :
                        ''
                      );
                    }}>
                    
                        <CalendarX2 className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Departure</span>
                      </Button>
                      <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1.5 text-destructive"
                    onClick={() => setOffboardTarget(person)}>
                    
                        <LogOut className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Offboard</span>
                      </Button>
                    </div>
                }
                  {person.status === 'offboarded' &&
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() =>
                  void reinstate(person.id).then(() =>
                  toast.success(
                    `${person.name} access restored. You will need to send them new links.`
                  )
                  )
                  }>
                  
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Reinstate</span>
                    </Button>
                }
                </div>
              </li>);

        })}
        </ul> :

      <div className="p-4 sm:p-6">
          <EmptyState
          icon={<Users className="h-7 w-7" />}
          title="No collaborators yet"
          body="Add the people you actually work with. Every share link is tied to one of them by name."
          action={<Button onClick={() => setAddOpen(true)}>Add the first collaborator</Button>} />
        
        </div>
      }

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="squircle-element border-border/80 bg-background/95 p-6 shadow-xl backdrop-blur-xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add a collaborator</DialogTitle>
            <DialogDescription>
              A departure date is optional, but it is the single most useful field here.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="p-name">Full name</Label>
              <Input id="p-name" value={draft.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-email">Email</Label>
              <Input
                id="p-email"
                type="email"
                value={draft.email}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, email: e.target.value })}
                placeholder={`name@${meta?.orgDomain || 'institution.edu'}`} />
              
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-aff">Department or institution</Label>
              <Input
                id="p-aff"
                value={draft.affiliation}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, affiliation: e.target.value })} />
              
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="p-role">Role</Label>
                <Select value={draft.role} onValueChange={(v) => setDraft({ ...draft, role: v as PersonRole })}>
                  <SelectTrigger id="p-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ROLE_LABEL) as PersonRole[]).map((role) =>
                    <SelectItem key={role} value={role}>
                        {ROLE_LABEL[role]}
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-dep">Departure date</Label>
                <Input
                  id="p-dep"
                  type="date"
                  value={draft.departure}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, departure: e.target.value })} />
                
              </div>
            </div>
            {error &&
            <p role="alert" className="text-[13px] text-destructive">
                {error}
              </p>
            }
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void submitAdd()}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(departureTarget)} onOpenChange={(open: boolean) => !open && setDepartureTarget(null)}>
        <DialogContent className="squircle-element border-border/80 bg-background/95 p-6 shadow-xl backdrop-blur-xl sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Departure date</DialogTitle>
            <DialogDescription>
              {departureTarget?.name} will be watched for unusual access as the date approaches.
            </DialogDescription>
          </DialogHeader>
          <Input type="date" value={departureDate} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDepartureDate(e.target.value)} />
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                if (!departureTarget) return;
                void editPerson(departureTarget, { departureAt: null }).then(() => {
                  setDepartureTarget(null);
                  toast.success('Departure date cleared.');
                });
              }}>
              
              Clear
            </Button>
            <Button
              onClick={() => {
                if (!departureTarget || !departureDate) return;
                void editPerson(departureTarget, { departureAt: new Date(departureDate).getTime() }).then(() => {
                  setDepartureTarget(null);
                  toast.success('Departure recorded.');
                });
              }}>
              
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(offboardTarget)}
        onOpenChange={(open) => !open && setOffboardTarget(null)}
        title={`Offboard ${offboardTarget?.name ?? ''}`}
        description={`Every live link they hold (${held.get(offboardTarget?.id ?? '') ?? 0}) is revoked in one action, and the reason is written to the ledger against each one. Reinstating them later does not bring the old links back.`}
        confirmLabel="Offboard and close all access"
        destructive
        onConfirm={async () => {
          if (!offboardTarget) return;
          const count = await offboard(offboardTarget.id);
          toast.success(`${offboardTarget.name} offboarded. ${count} link(s) closed.`);
          setOffboardTarget(null);
        }} />
      
    </div>);

}
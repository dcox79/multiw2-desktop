'use client';

import { useState } from 'react';
import { useDependents } from '@/hooks/use-dependents';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import type { Dependent } from '@/lib/types';

const relationships: Dependent['relationship'][] = ['child', 'stepchild', 'foster_child', 'sibling', 'parent', 'other'];

export function DependentsSettings() {
  const { dependents, isLoading, error, addDependent, updateDependent, removeDependent, isAdding, isUpdating, isDeleting } = useDependents();
  const [editing, setEditing] = useState<Dependent | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [formError, setFormError] = useState('');
  return <Card>
    <CardHeader><CardTitle>Dependents</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">Store dependent details locally. Review eligible counts in each year&apos;s tax profile before calculating.</p>
      {isLoading ? <p>Loading…</p> : error ? <p role="alert">Could not load dependents.</p> : dependents.map(dependent => <div key={dependent.id} className="flex items-center justify-between gap-3 border-b pb-2">
        <div><p className="text-sm font-medium">{dependent.firstName}</p><p className="text-xs text-muted-foreground">{dependent.relationship.replaceAll('_', ' ')} · {dependent.dateOfBirth}</p></div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => { setEditing(dependent); setFormError(''); }}>Edit {dependent.firstName}</Button>
          <Button size="sm" variant="ghost" disabled={isDeleting} onClick={() => { if (window.confirm(`Delete dependent ${dependent.firstName}?`)) void removeDependent(dependent.id).catch(() => {}); }}>Delete</Button>
        </div>
      </div>)}
      <form key={editing?.id ?? formKey} className="space-y-3" onSubmit={async e => {
        e.preventDefault(); setFormError('');
        const data = new FormData(e.currentTarget);
        const fields = { firstName: String(data.get('name')).trim(), dateOfBirth: String(data.get('birth')), relationship: String(data.get('relationship')) as Dependent['relationship'], isFullTimeStudent: data.has('student'), isDisabled: data.has('disabled') };
        try { if (editing) await updateDependent({ id: editing.id, ...fields }); else await addDependent(fields); setEditing(null); setFormKey(key => key + 1); }
        catch (err) { setFormError(err instanceof Error ? err.message : 'Failed to save dependent'); }
      }}>
        <h3 className="text-sm font-semibold">{editing ? 'Edit dependent' : 'Add dependent'}</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1"><Label htmlFor="dependent-name">First name</Label><Input id="dependent-name" name="name" required maxLength={100} defaultValue={editing?.firstName ?? ''} /></div>
          <div className="space-y-1"><Label htmlFor="dependent-birth">Date of birth</Label><Input id="dependent-birth" name="birth" type="date" required defaultValue={editing?.dateOfBirth ?? ''} /></div>
        </div>
        <div className="space-y-1"><Label htmlFor="dependent-relationship">Relationship</Label><select id="dependent-relationship" name="relationship" className="block rounded border p-2 bg-background" defaultValue={editing?.relationship ?? 'child'}>{relationships.map(value => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></div>
        <label className="flex items-center gap-2 text-sm"><input name="student" type="checkbox" defaultChecked={editing?.isFullTimeStudent} />Full-time student</label>
        <label className="flex items-center gap-2 text-sm"><input name="disabled" type="checkbox" defaultChecked={editing?.isDisabled} />Has a disability</label>
        {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
        <Button type="submit" disabled={isAdding || isUpdating}>{editing ? 'Save dependent' : 'Add dependent'}</Button>
        {editing && <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>}
      </form>
    </CardContent>
  </Card>;
}

import { useEffect, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { Drawer } from '@/components/ui/Overlay';
import { Button } from '@/components/ui/Button';
import { Field, Select, TextArea, TextInput } from '@/components/ui/Field';
import { useApp } from '@/state/AppProvider';
import { useToast } from '@/components/ui/Toast';
import { formatLabel, formatOptions } from '@/components/shared/resourceMeta';
import type { Resource, ResourceCategoryId, ResourceFormat } from '@/types';
import type { ResourceDraft } from '@/state/store';
import { cn } from '@/utils/cn';

const NEEDS_URL: ResourceFormat[] = ['video', 'pdf', 'link'];

/** Add or edit a resource. `Save & Assign` hands straight to the assign step. */
export function ResourceFormDrawer({
  open,
  onClose,
  resource,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  resource?: Resource;
  onSaved?: (resourceId: string, assign: boolean) => void;
}) {
  const { state, dispatch } = useApp();
  const toast = useToast();

  const empty: ResourceDraft = {
    title: '',
    summary: '',
    format: 'audio',
    categoryId: 'breathing',
    durationMin: 5,
    tags: [],
    body: [''],
  };
  const [draft, setDraft] = useState<ResourceDraft>(empty);
  const [tagInput, setTagInput] = useState('');

  useEffect(() => {
    if (!open) return;
    setDraft(
      resource
        ? {
            id: resource.id,
            title: resource.title,
            summary: resource.summary,
            format: resource.format,
            categoryId: resource.categoryId,
            durationMin: resource.durationMin,
            instructions: resource.instructions,
            url: resource.url,
            tags: [...resource.tags],
            body: resource.body.length > 0 ? [...resource.body] : [''],
          }
        : empty,
    );
    setTagInput('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, resource?.id]);

  const set = <K extends keyof ResourceDraft>(key: K, value: ResourceDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const save = (assign: boolean) => {
    if (!draft.title.trim()) return;
    dispatch({ type: 'resource/save', draft });
    toast(resource ? `${draft.title} updated` : `${draft.title} added to the Sanctuary`);
    onClose();
    if (assign) {
      // A freshly created resource is the newest one in the library.
      const id = draft.id ?? state.resources[0]?.id;
      onSaved?.(id ?? '', true);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      eyebrow="Sanctuary"
      title={resource ? 'Edit Resource' : 'Add Resource'}
      description="Everything here is something you have chosen to give someone."
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <div className="flex gap-2">
            {!resource && (
              <Button size="sm" onClick={() => save(true)} disabled={!draft.title.trim()}>
                Save &amp; Assign
              </Button>
            )}
            <Button
              variant="primary"
              size="sm"
              onClick={() => save(false)}
              disabled={!draft.title.trim()}
              icon={<Check className="h-4 w-4" />}
            >
              Save to Sanctuary
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        <Field label="Title">
          {(id) => (
            <TextInput
              id={id}
              value={draft.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="Evening Body Scan"
            />
          )}
        </Field>

        <Field label="Description">
          {(id) => (
            <TextArea
              id={id}
              rows={2}
              value={draft.summary}
              onChange={(e) => set('summary', e.target.value)}
              placeholder="One line about what this is for."
            />
          )}
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Type">
            {(id) => (
              <Select
                id={id}
                value={draft.format}
                onChange={(e) => set('format', e.target.value as ResourceFormat)}
              >
                {formatOptions.map((option) => (
                  <option key={option} value={option}>
                    {formatLabel[option]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Category">
            {(id) => (
              <Select
                id={id}
                value={draft.categoryId}
                onChange={(e) => set('categoryId', e.target.value as ResourceCategoryId)}
              >
                {state.resourceCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.title}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        <Field label="Duration in minutes">
          {(id) => (
            <TextInput
              id={id}
              type="number"
              min={1}
              max={120}
              value={draft.durationMin}
              onChange={(e) => set('durationMin', Number(e.target.value))}
            />
          )}
        </Field>

        {NEEDS_URL.includes(draft.format) && (
          <Field label="Link" hint="Where the file or page lives.">
            {(id) => (
              <TextInput
                id={id}
                type="url"
                value={draft.url ?? ''}
                onChange={(e) => set('url', e.target.value)}
                placeholder="https://"
              />
            )}
          </Field>
        )}

        <Field label="Instructions" hint="Shown to the client above the steps.">
          {(id) => (
            <TextArea
              id={id}
              rows={2}
              value={draft.instructions ?? ''}
              onChange={(e) => set('instructions', e.target.value)}
            />
          )}
        </Field>

        <fieldset>
          <legend className="eyebrow mb-1.5">What the client reads</legend>
          <div className="space-y-2">
            {draft.body.map((line, index) => (
              <div key={index} className="flex gap-2">
                <TextInput
                  value={line}
                  onChange={(e) =>
                    set(
                      'body',
                      draft.body.map((l, i) => (i === index ? e.target.value : l)),
                    )
                  }
                  aria-label={`Step ${index + 1}`}
                />
                {draft.body.length > 1 && (
                  <button
                    type="button"
                    onClick={() => set('body', draft.body.filter((_, i) => i !== index))}
                    aria-label={`Remove step ${index + 1}`}
                    className="tap-target shrink-0 rounded-control text-ink-faint transition-colors hover:bg-sage-wash hover:text-rose-deep"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => set('body', [...draft.body, ''])}
            className="mt-2 inline-flex min-h-[2rem] items-center gap-1.5 text-[0.8125rem] font-medium text-forest-accent hover:underline"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add a step
          </button>
        </fieldset>

        <fieldset>
          <legend className="eyebrow mb-1.5">Tags</legend>
          <div className="flex flex-wrap gap-1.5">
            {draft.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1.5 rounded-full bg-sage-wash px-3 py-1 text-2xs text-forest-accent"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => set('tags', draft.tags.filter((t) => t !== tag))}
                  aria-label={`Remove ${tag}`}
                  className="text-ink-faint hover:text-rose-deep"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <TextInput
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' || !tagInput.trim()) return;
                e.preventDefault();
                if (!draft.tags.includes(tagInput.trim())) set('tags', [...draft.tags, tagInput.trim()]);
                setTagInput('');
              }}
              placeholder="Add a tag and press Enter"
              aria-label="Add a tag"
            />
          </div>
        </fieldset>

        <p className={cn('rounded-card bg-cream/70 px-4 py-3 text-2xs leading-relaxed text-ink-soft')}>
          Nothing here reaches a client until you assign it. The Sanctuary is your library first.
        </p>
      </div>
    </Drawer>
  );
}

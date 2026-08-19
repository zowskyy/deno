"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { PageRenderer, type TopEightLink } from "@/components/PageRenderer";
import type { FriendSummary } from "@/lib/friends";
import type { GuestbookEntry } from "@/lib/guestbook";
import type { PageDocument, PagePartId, StoredPage, TemplateId } from "@/lib/pageDocumentTypes";
import { getContrastWarnings, TEMPLATE_PRESETS } from "@/lib/pageDocumentTheme";
import {
  exportPageAction,
  importPageAction,
  publishDraftAction,
  restoreVersionAction,
  saveAndPublishAction,
  saveDraftAction,
  setGuestbookDisabledAction,
  setHiddenFromDiscoveryAction,
  setPublishedAction,
  setVisibilityAction,
} from "./actions";

const MAX_UNDO = 20;

const TEMPLATE_OPTIONS: { id: TemplateId; label: string }[] = [
  { id: "soft-web", label: "Soft Web" },
  { id: "pixel-tavern", label: "Pixel Tavern" },
  { id: "chrome-angel", label: "Chrome Angel" },
  { id: "dark-zine", label: "Dark Zine" },
  { id: "clean-portfolio", label: "Clean Portfolio" },
  { id: "start-simple", label: "Start Simple" },
];

const PART_LABELS: Record<PagePartId, string> = {
  identity: "Identity",
  friends: "Friends",
  links: "Links",
  now: "Now",
  gallery: "Gallery",
  blog: "Blog",
  devlog: "Devlog",
  guestbook: "Guestbook",
  topEight: "Top 8",
  badges: "Badges",
};

type TabId = "look" | "layout" | "content" | "access" | "publish";

const TABS: { id: TabId; label: string }[] = [
  { id: "look", label: "Look" },
  { id: "layout", label: "Layout" },
  { id: "content", label: "Content" },
  { id: "access", label: "Access" },
  { id: "publish", label: "Publish" },
];

function buildTopEightPreview(handles: string[], friends: FriendSummary[]): TopEightLink[] {
  return handles.map((handle) => ({
    handle,
    label: friends.find((f) => f.handle === handle)?.handle ?? handle,
  }));
}

export interface StudioClientProps {
  initialDocument: PageDocument;
  publishedDocument: PageDocument;
  hasDraft: boolean;
  isPublished: boolean;
  visibility: StoredPage["visibility"];
  hiddenFromDiscovery: boolean;
  guestbookDisabled: boolean;
  versions: { id: string; createdAt: string }[];
  handle: string;
  friends: FriendSummary[];
  guestbookEntries: GuestbookEntry[];
}

function newId(): string {
  return crypto.randomUUID();
}

export function StudioClient({
  initialDocument,
  publishedDocument,
  hasDraft: initialHasDraft,
  isPublished: initialIsPublished,
  visibility: initialVisibility,
  hiddenFromDiscovery: initialHiddenFromDiscovery,
  guestbookDisabled: initialGuestbookDisabled,
  versions: initialVersions,
  handle,
  friends,
  guestbookEntries,
}: StudioClientProps) {
  const [document, setDocument] = useState<PageDocument>(initialDocument);
  const [publishedDoc, setPublishedDoc] = useState<PageDocument>(publishedDocument);
  const [undoStack, setUndoStack] = useState<PageDocument[]>([]);
  const [tab, setTab] = useState<TabId>("look");
  const [previewMobile, setPreviewMobile] = useState(false);
  const [safePreview, setSafePreview] = useState(true);
  const [isPublished, setIsPublished] = useState(initialIsPublished);
  const [visibility, setVisibility] = useState(initialVisibility);
  const [hiddenFromDiscovery, setHiddenFromDiscovery] = useState(initialHiddenFromDiscovery);
  const [guestbookDisabled, setGuestbookDisabled] = useState(initialGuestbookDisabled);
  const [hasDraft, setHasDraft] = useState(initialHasDraft);
  const [versions, setVersions] = useState(initialVersions);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const previewDocument = safePreview ? document : publishedDoc;
  const contrastWarnings = useMemo(() => getContrastWarnings(document), [document]);
  const previewTopEight = useMemo(
    () => buildTopEightPreview(previewDocument.topEight, friends),
    [previewDocument.topEight, friends],
  );

  const commitEdit = useCallback(
    (next: PageDocument) => {
      setUndoStack((prev) => {
        const stack = [...prev, document];
        while (stack.length > MAX_UNDO) stack.shift();
        return stack;
      });
      setDocument(next);
      setMessage(null);
      setError(null);
    },
    [document],
  );

  const undo = useCallback(() => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1]!;
    setUndoStack((stack) => stack.slice(0, -1));
    setDocument(prev);
    setMessage("Undid last change.");
    setError(null);
  }, [undoStack]);

  const runAction = useCallback(
    (label: string, fn: () => Promise<{ ok?: boolean; error?: string; document?: PageDocument; exportJson?: string }>) => {
      startTransition(async () => {
        setMessage(null);
        setError(null);
        const result = await fn();
        if (result.error) {
          setError(result.error);
          return;
        }
        if (result.document) {
          setDocument(result.document);
          setPublishedDoc(result.document);
          setUndoStack([]);
        }
        setMessage(label);
      });
    },
    [],
  );

  const saveDraft = () => {
    runAction("Draft saved — safe to preview without publishing.", () =>
      saveDraftAction(JSON.stringify(document)).then((r) => {
        if (r.ok) setHasDraft(true);
        return r;
      }),
    );
  };

  const saveAndPublish = () => {
    runAction("Published live.", () =>
      saveAndPublishAction(JSON.stringify(document)).then((r) => {
        if (r.ok) setHasDraft(false);
        return r;
      }),
    );
  };

  const publishExistingDraft = () => {
    runAction("Draft published live.", () =>
      publishDraftAction().then((r) => {
        if (r.ok && r.document) {
          setDocument(r.document);
          setPublishedDoc(r.document);
          setHasDraft(false);
        }
        return r;
      }),
    );
  };

  const handleExport = () => {
    startTransition(async () => {
      setMessage(null);
      setError(null);
      const result = await exportPageAction();
      if (result.error) {
        setError(result.error);
        return;
      }
      if (!result.exportJson) return;
      const blob = new Blob([result.exportJson], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement("a");
      a.href = url;
      a.download = `webroom-${handle}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage("Export downloaded.");
    });
  };

  const handleImport = (file: File) => {
    startTransition(async () => {
      setMessage(null);
      setError(null);
      const text = await file.text();
      const result = await importPageAction(text);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.document) {
        setDocument(result.document);
        setPublishedDoc(result.document);
        setUndoStack([]);
        setHasDraft(false);
      }
      setMessage("Import applied and published.");
    });
  };

  const restoreVersion = (versionId: string) => {
    runAction("Version restored.", () =>
      restoreVersionAction(versionId).then((r) => {
        if (r.ok) {
          setHasDraft(false);
          setVersions((v) => {
            const exists = v.some((item) => item.id === versionId);
            if (exists) return v;
            return [{ id: versionId, createdAt: new Date().toISOString() }, ...v];
          });
        }
        return r;
      }),
    );
  };

  return (
    <div className="studio-shell">
      <header className="studio-header">
        <div>
          <p className="studio-kicker mono">Studio</p>
          <h1>Shape your page</h1>
          <p className="studio-subtitle">@{handle} · edits preview live on the right</p>
        </div>
        <div className="studio-header-actions">
          <button type="button" className="btn secondary" onClick={undo} disabled={undoStack.length === 0 || pending}>
            Undo
          </button>
          <button type="button" className="btn secondary" onClick={saveDraft} disabled={pending}>
            Save draft
          </button>
          <button type="button" className="btn" onClick={saveAndPublish} disabled={pending}>
            Publish
          </button>
        </div>
      </header>

      {(message || error) && (
        <div className={error ? "error-banner" : "studio-message"} role={error ? "alert" : "status"}>
          {error ?? message}
        </div>
      )}

      <div className="studio-body">
        <div className="studio-panel">
          <nav className="studio-tabs" aria-label="Studio sections">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={tab === t.id ? "studio-tab active" : "studio-tab"}
                onClick={() => setTab(t.id)}
                aria-current={tab === t.id ? "page" : undefined}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <div className="studio-tab-panel">
            {tab === "look" && (
              <LookTab document={document} onChange={commitEdit} />
            )}
            {tab === "layout" && (
              <LayoutTab document={document} onChange={commitEdit} />
            )}
            {tab === "content" && (
              <ContentTab document={document} onChange={commitEdit} friends={friends} />
            )}
            {tab === "access" && (
              <AccessTab document={document} onChange={commitEdit} warnings={contrastWarnings} />
            )}
            {tab === "publish" && (
              <PublishTab
                document={document}
                onChange={commitEdit}
                isPublished={isPublished}
                visibility={visibility}
                hiddenFromDiscovery={hiddenFromDiscovery}
                guestbookDisabled={guestbookDisabled}
                hasDraft={hasDraft}
                safePreview={safePreview}
                versions={versions}
                pending={pending}
                onSafePreviewChange={setSafePreview}
                onPublishToggle={(published) =>
                  runAction(published ? "Page is live." : "Page unpublished.", () =>
                    setPublishedAction(published).then((r) => {
                      if (r.ok) setIsPublished(published);
                      return r;
                    }),
                  )
                }
                onVisibilityChange={(v) =>
                  runAction(`Visibility set to ${v}.`, () =>
                    setVisibilityAction(v).then((r) => {
                      if (r.ok) setVisibility(v);
                      return r;
                    }),
                  )
                }
                onHiddenChange={(hidden) =>
                  runAction(hidden ? "Hidden from discovery." : "Visible in discovery.", () =>
                    setHiddenFromDiscoveryAction(hidden).then((r) => {
                      if (r.ok) setHiddenFromDiscovery(hidden);
                      return r;
                    }),
                  )
                }
                onGuestbookDisabledChange={(disabled) =>
                  runAction(disabled ? "Guestbook disabled." : "Guestbook enabled.", () =>
                    setGuestbookDisabledAction(disabled).then((r) => {
                      if (r.ok) setGuestbookDisabled(disabled);
                      return r;
                    }),
                  )
                }
                onPublishDraft={publishExistingDraft}
                onExport={handleExport}
                onImport={handleImport}
                onRestoreVersion={restoreVersion}
              />
            )}
          </div>
        </div>

        <aside className="studio-preview" aria-label="Live preview">
          <div className="studio-preview-toolbar">
            <span className="mono">Preview</span>
            <div className="studio-preview-toggles">
              <button
                type="button"
                className={!previewMobile ? "studio-chip active" : "studio-chip"}
                onClick={() => setPreviewMobile(false)}
              >
                Desktop
              </button>
              <button
                type="button"
                className={previewMobile ? "studio-chip active" : "studio-chip"}
                onClick={() => setPreviewMobile(true)}
              >
                Mobile
              </button>
            </div>
          </div>
          <div className={previewMobile ? "studio-preview-frame mobile" : "studio-preview-frame desktop"}>
            <PageRenderer
              document={previewDocument}
              friends={friends}
              handle={handle}
              readerMode={false}
              guestbookEntries={guestbookEntries}
              topEightLinks={previewTopEight}
            />
          </div>
          <p className="studio-preview-note mono">
            {safePreview ? "Showing your current edits" : "Showing what's live"}
            {" · "}
            <Link href={`/@${handle}`}>Open page</Link>
          </p>
        </aside>
      </div>
    </div>
  );
}

function LookTab({
  document: doc,
  onChange,
}: {
  document: PageDocument;
  onChange: (d: PageDocument) => void;
}) {
  const setTemplate = (template: TemplateId) => {
    const preset = TEMPLATE_PRESETS[template];
    onChange({
      ...doc,
      theme: {
        ...doc.theme,
        template,
        accent: preset.accent,
        background: preset.background,
        fontStyle: preset.fontStyle,
      },
    });
  };

  return (
    <>
      <h2 className="studio-section-title">Look</h2>
      <p className="studio-hint">Template, colors, spacing, and type style.</p>

      <fieldset className="studio-fieldset">
        <legend>Template</legend>
        <div className="studio-template-grid">
          {TEMPLATE_OPTIONS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={doc.theme.template === t.id ? "studio-template-card active" : "studio-template-card"}
              onClick={() => setTemplate(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="studio-color-row">
        <label className="field">
          <span>Accent</span>
          <input
            type="color"
            value={doc.theme.accent}
            onChange={(e) =>
              onChange({ ...doc, theme: { ...doc.theme, accent: e.target.value } })
            }
          />
          <span className="mono studio-hex">{doc.theme.accent}</span>
        </label>
        <label className="field">
          <span>Background</span>
          <input
            type="color"
            value={doc.theme.background}
            onChange={(e) =>
              onChange({ ...doc, theme: { ...doc.theme, background: e.target.value } })
            }
          />
          <span className="mono studio-hex">{doc.theme.background}</span>
        </label>
      </div>

      <label className="field">
        <span>Density</span>
        <select
          value={doc.theme.density}
          onChange={(e) =>
            onChange({
              ...doc,
              theme: { ...doc.theme, density: e.target.value as PageDocument["theme"]["density"] },
            })
          }
        >
          <option value="cozy">Cozy</option>
          <option value="comfortable">Comfortable</option>
          <option value="spacious">Spacious</option>
        </select>
      </label>

      <label className="field">
        <span>Font style</span>
        <select
          value={doc.theme.fontStyle}
          onChange={(e) =>
            onChange({
              ...doc,
              theme: { ...doc.theme, fontStyle: e.target.value as PageDocument["theme"]["fontStyle"] },
            })
          }
        >
          <option value="sans">Sans</option>
          <option value="serif">Serif</option>
          <option value="mono">Mono</option>
        </select>
      </label>
    </>
  );
}

function LayoutTab({
  document: doc,
  onChange,
}: {
  document: PageDocument;
  onChange: (d: PageDocument) => void;
}) {
  const movePart = (index: number, direction: -1 | 1) => {
    const next = [...doc.pageParts];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item!);
    onChange({ ...doc, pageParts: next });
  };

  const togglePart = (part: PagePartId) => {
    const has = doc.pageParts.includes(part);
    if (has) {
      onChange({ ...doc, pageParts: doc.pageParts.filter((p) => p !== part) });
    } else {
      onChange({ ...doc, pageParts: [...doc.pageParts, part] });
    }
  };

  return (
    <>
      <h2 className="studio-section-title">Layout</h2>
      <p className="studio-hint">Reorder sections and adjust spacing.</p>

      <label className="field">
        <span>Density</span>
        <select
          value={doc.theme.density}
          onChange={(e) =>
            onChange({
              ...doc,
              theme: { ...doc.theme, density: e.target.value as PageDocument["theme"]["density"] },
            })
          }
        >
          <option value="cozy">Cozy</option>
          <option value="comfortable">Comfortable</option>
          <option value="spacious">Spacious</option>
        </select>
      </label>

      <fieldset className="studio-fieldset">
        <legend>Page sections</legend>
        <ul className="studio-part-list">
          {(Object.keys(PART_LABELS) as PagePartId[]).map((part) => {
            const enabled = doc.pageParts.includes(part);
            const index = doc.pageParts.indexOf(part);
            return (
              <li key={part} className="studio-part-row">
                <label className="studio-part-check">
                  <input type="checkbox" checked={enabled} onChange={() => togglePart(part)} />
                  {PART_LABELS[part]}
                </label>
                {enabled && (
                  <div className="studio-part-order">
                    <button type="button" className="studio-icon-btn" onClick={() => movePart(index, -1)} aria-label="Move up">
                      ↑
                    </button>
                    <button type="button" className="studio-icon-btn" onClick={() => movePart(index, 1)} aria-label="Move down">
                      ↓
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </fieldset>

      <fieldset className="studio-fieldset">
        <legend>Render order</legend>
        <ol className="studio-order-list">
          {doc.pageParts.map((part, i) => (
            <li key={part} className="studio-order-item">
              <span>{PART_LABELS[part]}</span>
              <div className="studio-part-order">
                <button type="button" className="studio-icon-btn" onClick={() => movePart(i, -1)} aria-label="Move up">
                  ↑
                </button>
                <button type="button" className="studio-icon-btn" onClick={() => movePart(i, 1)} aria-label="Move down">
                  ↓
                </button>
              </div>
            </li>
          ))}
        </ol>
      </fieldset>
    </>
  );
}

function ContentTab({
  document: doc,
  onChange,
  friends,
}: {
  document: PageDocument;
  onChange: (d: PageDocument) => void;
  friends: FriendSummary[];
}) {
  const [tagInput, setTagInput] = useState("");

  const addTag = () => {
    const slug = tagInput.trim().toLowerCase().replace(/\s+/g, "-");
    if (!slug || doc.tags.includes(slug) || doc.tags.length >= 10) return;
    onChange({ ...doc, tags: [...doc.tags, slug] });
    setTagInput("");
  };

  return (
    <>
      <h2 className="studio-section-title">Content</h2>
      <p className="studio-hint">Identity, links, media, writing, and tags.</p>

      <fieldset className="studio-fieldset">
        <legend>Identity</legend>
        <label className="field">
          <span>Display name</span>
          <input
            type="text"
            maxLength={60}
            value={doc.identity.displayName}
            onChange={(e) =>
              onChange({ ...doc, identity: { ...doc.identity, displayName: e.target.value } })
            }
          />
        </label>
        <label className="field">
          <span>Bio</span>
          <textarea
            maxLength={280}
            rows={2}
            value={doc.identity.bio}
            onChange={(e) => onChange({ ...doc, identity: { ...doc.identity, bio: e.target.value } })}
          />
        </label>
        <label className="field">
          <span>Status line</span>
          <input
            type="text"
            maxLength={80}
            value={doc.identity.status ?? ""}
            onChange={(e) =>
              onChange({
                ...doc,
                identity: { ...doc.identity, status: e.target.value || undefined },
              })
            }
          />
        </label>
      </fieldset>

      <fieldset className="studio-fieldset">
        <legend>Now</legend>
        <textarea
          maxLength={280}
          rows={3}
          value={doc.now}
          onChange={(e) => onChange({ ...doc, now: e.target.value })}
          placeholder="What you're focused on right now"
        />
      </fieldset>

      <fieldset className="studio-fieldset">
        <legend>Links</legend>
        {doc.links.map((link, i) => (
          <div key={i} className="studio-card">
            <label className="field">
              <span>Label</span>
              <input
                type="text"
                maxLength={80}
                value={link.label}
                onChange={(e) => {
                  const links = [...doc.links];
                  links[i] = { ...link, label: e.target.value };
                  onChange({ ...doc, links });
                }}
              />
            </label>
            <label className="field">
              <span>URL</span>
              <input
                type="url"
                value={link.url}
                onChange={(e) => {
                  const links = [...doc.links];
                  links[i] = { ...link, url: e.target.value };
                  onChange({ ...doc, links });
                }}
              />
            </label>
            <button
              type="button"
              className="btn secondary studio-remove"
              onClick={() => onChange({ ...doc, links: doc.links.filter((_, j) => j !== i) })}
            >
              Remove
            </button>
          </div>
        ))}
        {doc.links.length < 30 && (
          <button
            type="button"
            className="btn secondary"
            onClick={() =>
              onChange({
                ...doc,
                links: [...doc.links, { label: "New link", url: "https://example.com" }],
              })
            }
          >
            Add link
          </button>
        )}
      </fieldset>

      <fieldset className="studio-fieldset">
        <legend>Gallery</legend>
        {doc.gallery.map((item) => (
          <div key={item.id} className="studio-card">
            <label className="field">
              <span>Image URL</span>
              <input
                type="url"
                value={item.url}
                onChange={(e) =>
                  onChange({
                    ...doc,
                    gallery: doc.gallery.map((g) => (g.id === item.id ? { ...g, url: e.target.value } : g)),
                  })
                }
              />
            </label>
            <label className="field">
              <span>Alt text</span>
              <input
                type="text"
                maxLength={200}
                value={item.alt}
                onChange={(e) =>
                  onChange({
                    ...doc,
                    gallery: doc.gallery.map((g) => (g.id === item.id ? { ...g, alt: e.target.value } : g)),
                  })
                }
              />
            </label>
            <label className="field">
              <span>Caption</span>
              <input
                type="text"
                maxLength={280}
                value={item.caption ?? ""}
                onChange={(e) =>
                  onChange({
                    ...doc,
                    gallery: doc.gallery.map((g) =>
                      g.id === item.id ? { ...g, caption: e.target.value || undefined } : g,
                    ),
                  })
                }
              />
            </label>
            <button
              type="button"
              className="btn secondary studio-remove"
              onClick={() => onChange({ ...doc, gallery: doc.gallery.filter((g) => g.id !== item.id) })}
            >
              Remove
            </button>
          </div>
        ))}
        {doc.gallery.length < 12 && (
          <button
            type="button"
            className="btn secondary"
            onClick={() =>
              onChange({
                ...doc,
                gallery: [
                  ...doc.gallery,
                  { id: newId(), url: "https://example.com/image.jpg", alt: "Describe this image" },
                ],
              })
            }
          >
            Add image
          </button>
        )}
      </fieldset>

      <fieldset className="studio-fieldset">
        <legend>Blog posts</legend>
        {doc.blog.map((post) => (
          <div key={post.id} className="studio-card">
            <label className="field">
              <span>Title</span>
              <input
                type="text"
                maxLength={120}
                value={post.title}
                onChange={(e) =>
                  onChange({
                    ...doc,
                    blog: doc.blog.map((p) => (p.id === post.id ? { ...p, title: e.target.value } : p)),
                  })
                }
              />
            </label>
            <label className="field">
              <span>Slug</span>
              <input
                type="text"
                maxLength={80}
                value={post.slug}
                onChange={(e) =>
                  onChange({
                    ...doc,
                    blog: doc.blog.map((p) => (p.id === post.id ? { ...p, slug: e.target.value } : p)),
                  })
                }
              />
            </label>
            <label className="field">
              <span>Body</span>
              <textarea
                rows={4}
                value={post.body}
                onChange={(e) =>
                  onChange({
                    ...doc,
                    blog: doc.blog.map((p) => (p.id === post.id ? { ...p, body: e.target.value } : p)),
                  })
                }
              />
            </label>
            <button
              type="button"
              className="btn secondary studio-remove"
              onClick={() => onChange({ ...doc, blog: doc.blog.filter((p) => p.id !== post.id) })}
            >
              Remove
            </button>
          </div>
        ))}
        {doc.blog.length < 50 && (
          <button
            type="button"
            className="btn secondary"
            onClick={() =>
              onChange({
                ...doc,
                blog: [
                  ...doc.blog,
                  {
                    id: newId(),
                    title: "New post",
                    slug: `post-${doc.blog.length + 1}`,
                    body: "Start writing…",
                    publishedAt: new Date().toISOString(),
                  },
                ],
              })
            }
          >
            Add post
          </button>
        )}
      </fieldset>

      <fieldset className="studio-fieldset">
        <legend>Devlog</legend>
        {doc.devlog.map((entry) => (
          <div key={entry.id} className="studio-card">
            <label className="field">
              <span>Date</span>
              <input
                type="date"
                value={entry.date.slice(0, 10)}
                onChange={(e) =>
                  onChange({
                    ...doc,
                    devlog: doc.devlog.map((d) =>
                      d.id === entry.id ? { ...d, date: e.target.value } : d,
                    ),
                  })
                }
              />
            </label>
            <label className="field">
              <span>Entry</span>
              <textarea
                rows={3}
                maxLength={500}
                value={entry.body}
                onChange={(e) =>
                  onChange({
                    ...doc,
                    devlog: doc.devlog.map((d) => (d.id === entry.id ? { ...d, body: e.target.value } : d)),
                  })
                }
              />
            </label>
            <button
              type="button"
              className="btn secondary studio-remove"
              onClick={() => onChange({ ...doc, devlog: doc.devlog.filter((d) => d.id !== entry.id) })}
            >
              Remove
            </button>
          </div>
        ))}
        {doc.devlog.length < 100 && (
          <button
            type="button"
            className="btn secondary"
            onClick={() =>
              onChange({
                ...doc,
                devlog: [
                  ...doc.devlog,
                  { id: newId(), date: new Date().toISOString().slice(0, 10), body: "Today I…" },
                ],
              })
            }
          >
            Add entry
          </button>
        )}
      </fieldset>

      <fieldset className="studio-fieldset">
        <legend>Badges</legend>
        {doc.badges.map((badge) => (
          <div key={badge.id} className="studio-card studio-badge-row">
            <label className="field">
              <span>Emoji</span>
              <input
                type="text"
                maxLength={8}
                value={badge.emoji ?? ""}
                onChange={(e) =>
                  onChange({
                    ...doc,
                    badges: doc.badges.map((b) =>
                      b.id === badge.id ? { ...b, emoji: e.target.value || undefined } : b,
                    ),
                  })
                }
              />
            </label>
            <label className="field">
              <span>Label</span>
              <input
                type="text"
                maxLength={40}
                value={badge.label}
                onChange={(e) =>
                  onChange({
                    ...doc,
                    badges: doc.badges.map((b) => (b.id === badge.id ? { ...b, label: e.target.value } : b)),
                  })
                }
              />
            </label>
            <button
              type="button"
              className="btn secondary studio-remove"
              onClick={() => onChange({ ...doc, badges: doc.badges.filter((b) => b.id !== badge.id) })}
            >
              Remove
            </button>
          </div>
        ))}
        {doc.badges.length < 20 && (
          <button
            type="button"
            className="btn secondary"
            onClick={() =>
              onChange({
                ...doc,
                badges: [...doc.badges, { id: newId(), label: "New badge" }],
              })
            }
          >
            Add badge
          </button>
        )}
      </fieldset>

      <fieldset className="studio-fieldset">
        <legend>Top 8</legend>
        <p className="studio-hint">Friend handles to highlight (max 8).</p>
        {doc.topEight.map((friendHandle, i) => (
          <div key={i} className="studio-card studio-top-eight-row">
            <label className="field">
              <span>@{i + 1}</span>
              <input
                type="text"
                maxLength={32}
                value={friendHandle}
                list="studio-friend-handles"
                onChange={(e) => {
                  const topEight = [...doc.topEight];
                  topEight[i] = e.target.value;
                  onChange({ ...doc, topEight });
                }}
              />
            </label>
            <button
              type="button"
              className="btn secondary studio-remove"
              onClick={() => onChange({ ...doc, topEight: doc.topEight.filter((_, j) => j !== i) })}
            >
              Remove
            </button>
          </div>
        ))}
        <datalist id="studio-friend-handles">
          {friends.map((f) => (
            <option key={f.userId} value={f.handle} />
          ))}
        </datalist>
        {doc.topEight.length < 8 && (
          <button
            type="button"
            className="btn secondary"
            onClick={() => onChange({ ...doc, topEight: [...doc.topEight, friends[0]?.handle ?? ""] })}
          >
            Add friend slot
          </button>
        )}
      </fieldset>

      <fieldset className="studio-fieldset">
        <legend>Tags</legend>
        <div className="studio-tag-row">
          <input
            type="text"
            maxLength={30}
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            placeholder="e.g. art, zines"
          />
          <button type="button" className="btn secondary" onClick={addTag}>Add</button>
        </div>
        <ul className="studio-tag-list">
          {doc.tags.map((tag) => (
            <li key={tag}>
              <span className="mono">{tag}</span>
              <button
                type="button"
                className="studio-icon-btn"
                onClick={() => onChange({ ...doc, tags: doc.tags.filter((t) => t !== tag) })}
                aria-label={`Remove ${tag}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </fieldset>
    </>
  );
}

function AccessTab({
  document: doc,
  onChange,
  warnings,
}: {
  document: PageDocument;
  onChange: (d: PageDocument) => void;
  warnings: string[];
}) {
  return (
    <>
      <h2 className="studio-section-title">Access</h2>
      <p className="studio-hint">Accessibility reminders and motion preferences.</p>

      <label className="studio-toggle">
        <input
          type="checkbox"
          checked={doc.access.altTextReminder}
          onChange={(e) =>
            onChange({ ...doc, access: { ...doc.access, altTextReminder: e.target.checked } })
          }
        />
        <span>Alt text reminders for gallery images</span>
      </label>

      <label className="studio-toggle">
        <input
          type="checkbox"
          checked={doc.access.contrastWarningsEnabled}
          onChange={(e) =>
            onChange({ ...doc, access: { ...doc.access, contrastWarningsEnabled: e.target.checked } })
          }
        />
        <span>Contrast warnings</span>
      </label>

      <label className="studio-toggle">
        <input
          type="checkbox"
          checked={doc.theme.reduceMotion}
          onChange={(e) =>
            onChange({ ...doc, theme: { ...doc.theme, reduceMotion: e.target.checked } })
          }
        />
        <span>Reduce motion on your page</span>
      </label>

      {doc.access.altTextReminder && doc.gallery.some((g) => !g.alt.trim()) && (
        <p className="studio-warning">Some gallery images are missing alt text.</p>
      )}

      {warnings.length > 0 && (
        <ul className="studio-warning-list">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </>
  );
}

function PublishTab({
  document: doc,
  onChange,
  isPublished,
  visibility,
  hiddenFromDiscovery,
  guestbookDisabled,
  hasDraft,
  safePreview,
  versions,
  pending,
  onSafePreviewChange,
  onPublishToggle,
  onVisibilityChange,
  onHiddenChange,
  onGuestbookDisabledChange,
  onPublishDraft,
  onExport,
  onImport,
  onRestoreVersion,
}: {
  document: PageDocument;
  onChange: (d: PageDocument) => void;
  isPublished: boolean;
  visibility: StoredPage["visibility"];
  hiddenFromDiscovery: boolean;
  guestbookDisabled: boolean;
  hasDraft: boolean;
  safePreview: boolean;
  versions: { id: string; createdAt: string }[];
  pending: boolean;
  onSafePreviewChange: (v: boolean) => void;
  onPublishToggle: (published: boolean) => void;
  onVisibilityChange: (v: StoredPage["visibility"]) => void;
  onHiddenChange: (hidden: boolean) => void;
  onGuestbookDisabledChange: (disabled: boolean) => void;
  onPublishDraft: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onRestoreVersion: (id: string) => void;
}) {
  return (
    <>
      <h2 className="studio-section-title">Publish</h2>
      <p className="studio-hint">Visibility, drafts, versions, and backup.</p>

      <div className="studio-publish-row">
        <button
          type="button"
          className="btn"
          disabled={pending}
          onClick={() => onPublishToggle(!isPublished)}
        >
          {isPublished ? "Unpublish" : "Publish page"}
        </button>
        {hasDraft && (
          <button type="button" className="btn secondary" disabled={pending} onClick={onPublishDraft}>
            Publish saved draft
          </button>
        )}
      </div>

      <label className="field">
        <span>Visibility</span>
        <select
          value={visibility}
          disabled={pending}
          onChange={(e) => onVisibilityChange(e.target.value as StoredPage["visibility"])}
        >
          <option value="private">Private — only you</option>
          <option value="unlisted">Unlisted — link only</option>
          <option value="public">Public — discoverable</option>
        </select>
      </label>

      <label className="studio-toggle">
        <input
          type="checkbox"
          checked={hiddenFromDiscovery}
          disabled={pending}
          onChange={(e) => onHiddenChange(e.target.checked)}
        />
        <span>Hide from discovery (still reachable by link when public)</span>
      </label>

      <label className="studio-toggle">
        <input
          type="checkbox"
          checked={guestbookDisabled}
          disabled={pending}
          onChange={(e) => onGuestbookDisabledChange(e.target.checked)}
        />
        <span>Disable guestbook</span>
      </label>

      <label className="studio-toggle">
        <input
          type="checkbox"
          checked={doc.guestbook.enabled}
          onChange={(e) =>
            onChange({ ...doc, guestbook: { ...doc.guestbook, enabled: e.target.checked } })
          }
        />
        <span>Guestbook enabled in page document</span>
      </label>

      <label className="studio-toggle">
        <input
          type="checkbox"
          checked={safePreview}
          onChange={(e) => onSafePreviewChange(e.target.checked)}
        />
        <span>Safe preview — show current edits in preview panel (not what&apos;s live)</span>
      </label>

      <fieldset className="studio-fieldset">
        <legend>Version history</legend>
        {versions.length === 0 ? (
          <p className="studio-hint">No previous versions yet — they appear after you publish changes.</p>
        ) : (
          <ul className="studio-version-list">
            {versions.map((v) => (
              <li key={v.id}>
                <span className="mono">{new Date(v.createdAt).toLocaleString()}</span>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={pending}
                  onClick={() => onRestoreVersion(v.id)}
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <fieldset className="studio-fieldset">
        <legend>Export & import</legend>
        <div className="studio-publish-row">
          <button type="button" className="btn secondary" disabled={pending} onClick={onExport}>
            Download JSON
          </button>
          <label className="btn secondary studio-file-label">
            Upload JSON
            <input
              type="file"
              accept="application/json,.json"
              className="studio-file-input"
              disabled={pending}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onImport(file);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </fieldset>
    </>
  );
}

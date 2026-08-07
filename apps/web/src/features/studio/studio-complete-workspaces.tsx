"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type {
  CatalogueWorkspace,
  StudioBlock,
  StudioBlockType,
  StudioCourseSpaceSummary,
  StudioLessonDetail,
  StudioLibrary,
  StudioWorkspace,
} from "@veza/contracts";

async function post(operation: string, input: Record<string, unknown>) {
  const response = await fetch(`/api/studio/${operation}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof body.message === "string" ? body.message : "Studio operation failed");
  return body;
}

function uid() {
  return crypto.randomUUID();
}

function label(type: string) {
  return type.replaceAll("_", " ").replaceAll("-", " ").replace(/^./, (value) => value.toUpperCase());
}

function defaultData(type: StudioBlockType): Record<string, unknown> {
  if (type === "heading") return { text: "Section heading", level: 2 };
  if (type === "paragraph") return { text: "Start writing the lesson content." };
  if (type === "callout") return { title: "Key idea", text: "Explain the important point." };
  if (type === "quote") return { text: "Quoted text", attribution: "Source" };
  if (type === "image") return { url: "", altText: "", caption: "" };
  if (["video", "audio"].includes(type)) return { url: "", captions: "", transcript: "" };
  if (type === "file") return { assetId: "", label: "Download resource" };
  if (type === "embed") return { url: "https://", title: "Embedded resource" };
  if (type === "code") return { language: "text", code: "" };
  if (type === "equation") return { latex: "", accessibleText: "" };
  if (["quiz", "activity"].includes(type)) {
    return { title: label(type), instructions: "", completionRule: { type: "submitted" } };
  }
  if (type === "outcome") return { title: "Learning outcome", text: "" };
  return {};
}

const palette: readonly StudioBlockType[] = [
  "heading",
  "paragraph",
  "callout",
  "quote",
  "image",
  "video",
  "audio",
  "file",
  "embed",
  "table",
  "columns",
  "accordion",
  "tabs",
  "divider",
  "code",
  "equation",
  "quiz",
  "activity",
  "outcome",
];

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <details className="vz-action-panel"><summary>{title}<span>+</span></summary>{children}</details>;
}

async function sha256(data: ArrayBuffer | string) {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function uploadStudioFile(file: File, objectKey: string, onProgress: (percent: number) => void) {
  const sessionId = crypto.randomUUID();
  const chunkSize = 4 * 1024 * 1024;
  let offset = 0;
  while (offset < file.size) {
    const chunk = file.slice(offset, Math.min(offset + chunkSize, file.size));
    const response = await fetch("/api/studio-upload", {
      method: "PATCH",
      headers: {
        "content-type": "application/octet-stream",
        "x-upload-session-id": sessionId,
        "x-object-key": objectKey,
        "x-upload-offset": String(offset),
        "x-upload-total": String(file.size),
      },
      body: chunk,
    });
    const body = (await response.json()) as Record<string, unknown>;
    if (!response.ok) throw new Error(typeof body.message === "string" ? body.message : "Studio upload failed");
    const next = Number(body.uploadOffset);
    if (!Number.isSafeInteger(next) || next <= offset) throw new Error("Studio ingest returned an invalid offset");
    offset = next;
    onProgress(Math.round((offset / file.size) * 100));
  }
}

export function StudioHomeWorkspaceComplete({
  institutionId,
  studio,
  catalogue,
  library,
}: {
  institutionId: string;
  studio: StudioWorkspace;
  catalogue: CatalogueWorkspace;
  library: StudioLibrary;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [importResult, setImportResult] = useState<Record<string, unknown> | null>(null);
  const approved = catalogue.blueprints.filter((item) => item.lifecycle === "approved");

  async function submit(
    operation: string,
    event: FormEvent<HTMLFormElement>,
    build: (data: FormData) => Record<string, unknown>,
  ) {
    event.preventDefault();
    setMessage("Saving...");
    try {
      await post(operation, { institutionId, ...build(new FormData(event.currentTarget)) });
      event.currentTarget.reset();
      setMessage("Saved");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Operation failed");
    }
  }

  async function registerAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const file = data.get("file");
    if (!(file instanceof File) || file.size < 1) return;
    setMessage("Preparing Studio asset...");
    try {
      const checksum = await sha256(await file.arrayBuffer());
      const safeName = file.name.replace(/[^A-Za-z0-9._ -]/g, "_");
      const objectKey = `studio/${institutionId}/${crypto.randomUUID()}-${safeName}`;
      await uploadStudioFile(file, objectKey, (percent) => setMessage(`Uploading asset ${percent}%`));
      await post("asset-register", {
        institutionId,
        courseSpaceId: String(data.get("courseSpaceId") || "") || undefined,
        assetKind: String(data.get("assetKind")),
        objectKey,
        originalFilename: file.name,
        mediaType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        checksumSha256: checksum,
        altText: String(data.get("altText") || "") || undefined,
        captionText: String(data.get("captionText") || "") || undefined,
        transcriptText: String(data.get("transcriptText") || "") || undefined,
        metadata: { source: "studio-browser-upload" },
      });
      setMessage("Asset uploaded and queued for malware scanning.");
      event.currentTarget.reset();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Asset upload failed");
    }
  }

  return (
    <div className="vz-learning-page vz-studio-home">
      <header className="vz-page-heading">
        <div><p>VEZA STUDIO</p><h1>Structured course authoring</h1><span>Build accessible lessons from governed blocks, review immutable revisions and publish fixed delivery snapshots.</span></div>
        <small>{message}</small>
      </header>

      <section className="vz-studio-register">
        <div className="vz-studio-tree">
          {studio.spaces.map((space) => (
            <article key={space.id}>
              <header><div><small>{space.status.replaceAll("_", " ")}</small><h2>{space.title}</h2><span>{space.moduleCount} modules · {space.lessonCount} lessons</span></div><strong>v{space.version}</strong></header>
              <div>{studio.modules.filter((module) => module.courseSpaceId === space.id).map((module) => <section key={module.id}><h3>{module.sequenceNumber}. {module.title}</h3>{studio.lessons.filter((lesson) => lesson.moduleId === module.id).map((lesson) => <Link key={lesson.id} href={`/studio/lessons/${lesson.id}`}><span>{lesson.sequenceNumber}</span><div><strong>{lesson.title}</strong><small>{lesson.lessonType} · {lesson.status.replaceAll("_", " ")}</small></div></Link>)}</section>)}</div>
            </article>
          ))}
          {!studio.spaces.length ? <div className="vz-empty-state"><strong>No Studio course space</strong><p>Create one from an effective approved blueprint. Content remains separate from catalogue approval.</p></div> : null}
        </div>
        <aside className="vz-studio-actions">
          <Panel title="Create course space">
            <form onSubmit={(event) => submit("course-space-create", event, (data) => ({ blueprintVersionId: String(data.get("blueprintVersionId")), title: String(data.get("title")) }))}>
              <label>Approved blueprint<select name="blueprintVersionId" required><option value="">Select blueprint</option>{approved.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.title}</option>)}</select></label>
              <label>Course-space title<input name="title" required minLength={3} maxLength={200} /></label>
              <button>Create space</button>
            </form>
          </Panel>
          <Panel title="Create module">
            <form onSubmit={(event) => submit("module-create", event, (data) => ({ courseSpaceId: String(data.get("courseSpaceId")), title: String(data.get("title")), description: String(data.get("description") || "") || undefined, sequenceNumber: Number(data.get("sequenceNumber")), availabilityRule: {}, completionRule: { type: "all-lessons" } }))}>
              <label>Course space<select name="courseSpaceId" required>{studio.spaces.map((space) => <option key={space.id} value={space.id}>{space.title}</option>)}</select></label>
              <label>Title<input name="title" required /></label>
              <label>Description<textarea name="description" /></label>
              <label>Sequence<input type="number" name="sequenceNumber" min="1" required /></label>
              <button>Create module</button>
            </form>
          </Panel>
          <Panel title="Create lesson">
            <form onSubmit={(event) => submit("lesson-create", event, (data) => { const module = studio.modules.find((item) => item.id === String(data.get("moduleId"))); return { courseSpaceId: module?.courseSpaceId, moduleId: String(data.get("moduleId")), title: String(data.get("title")), summary: String(data.get("summary") || "") || undefined, sequenceNumber: Number(data.get("sequenceNumber")), lessonType: String(data.get("lessonType")), estimatedMinutes: Number(data.get("estimatedMinutes") || 0) || undefined, availabilityRule: {}, completionRule: { type: "viewed" } }; })}>
              <label>Module<select name="moduleId" required>{studio.modules.map((module) => <option key={module.id} value={module.id}>{module.title}</option>)}</select></label>
              <label>Title<input name="title" required /></label>
              <label>Summary<textarea name="summary" /></label>
              <div className="vz-form-row"><label>Sequence<input type="number" name="sequenceNumber" min="1" required /></label><label>Minutes<input type="number" name="estimatedMinutes" min="1" /></label></div>
              <label>Type<select name="lessonType"><option value="lesson">Lesson</option><option value="resource">Resource</option><option value="activity">Activity</option><option value="discussion">Discussion</option><option value="assignment-link">Assignment link</option></select></label>
              <button>Create lesson</button>
            </form>
          </Panel>
        </aside>
      </section>

      <section className="vz-studio-library">
        <header><div><p>CONTENT LIBRARY</p><h2>Reusable blocks and media evidence</h2></div><span>{library.reusableBlocks.length + library.assets.length}</span></header>
        <div className="vz-completion-grid">
          <div className="vz-record-surface">
            {library.reusableBlocks.map((block) => <article key={block.id}><div><small>{label(block.blockType)}</small><strong>{block.name}</strong><span>Reusable block v{block.version}</span></div></article>)}
            {library.assets.map((asset) => <article key={asset.id}><div><small>{asset.assetKind}</small><strong>{asset.originalFilename}</strong><span>{asset.status} · {asset.malwareStatus}</span></div><dl><div><dt>Size</dt><dd>{Math.ceil(asset.sizeBytes / 1024)} KB</dd></div><div><dt>Checksum</dt><dd><code>{asset.checksumSha256.slice(0, 12)}</code></dd></div></dl></article>)}
          </div>
          <aside className="vz-governance-rail">
            <Panel title="Create reusable block">
              <form onSubmit={(event) => submit("reusable-block-create", event, (data) => ({ name: String(data.get("name")), blockType: String(data.get("blockType")), content: defaultData(String(data.get("blockType")) as StudioBlockType) }))}>
                <label>Name<input name="name" required minLength={3} /></label>
                <label>Block type<select name="blockType">{palette.map((type) => <option key={type} value={type}>{label(type)}</option>)}</select></label>
                <button>Create reusable block</button>
              </form>
            </Panel>
            <Panel title="Upload media or file">
              <form onSubmit={registerAsset}>
                <label>Course space<select name="courseSpaceId"><option value="">Institution library</option>{studio.spaces.map((space) => <option key={space.id} value={space.id}>{space.title}</option>)}</select></label>
                <label>Asset kind<select name="assetKind"><option value="image">Image</option><option value="video">Video</option><option value="audio">Audio</option><option value="document">Document</option><option value="archive">Archive</option><option value="other">Other</option></select></label>
                <label>File<input type="file" name="file" required /></label>
                <label>Alternative text<input name="altText" /></label>
                <label>Caption or resource description<textarea name="captionText" /></label>
                <label>Transcript<textarea name="transcriptText" /></label>
                <button>Upload asset</button>
              </form>
            </Panel>
          </aside>
        </div>
      </section>

      <section className="vz-studio-publications">
        <header><div><p>PUBLICATION EVIDENCE</p><h2>Snapshots, rollback and compatibility</h2></div><span>{library.publications.length}</span></header>
        <div className="vz-completion-grid">
          <div className="vz-record-surface">
            {library.publications.map((snapshot) => <article key={snapshot.id}><div><small>{snapshot.status}</small><strong>{snapshot.courseTitle} · publication {snapshot.publicationNumber}</strong><span>{new Date(snapshot.publishedAt).toLocaleString("en-ZA")}</span></div><dl><div><dt>Checksum</dt><dd><code>{snapshot.checksumSha256.slice(0, 12)}</code></dd></div><div><dt>Rollback</dt><dd>{snapshot.rollbackOfSnapshotId ? "Yes" : "No"}</dd></div></dl></article>)}
            {library.importReports.map((report) => <article key={report.id}><div><small>{report.sourceFormat}</small><strong>{report.compatibilityStatus}</strong><span>{new Date(report.createdAt).toLocaleString("en-ZA")}</span></div><pre>{JSON.stringify(report.report, null, 2)}</pre></article>)}
          </div>
          <aside className="vz-governance-rail">
            <Panel title="Analyse course import">
              <form onSubmit={async (event) => { event.preventDefault(); const data = new FormData(event.currentTarget); try { const manifest = JSON.parse(String(data.get("manifest"))); const sourceChecksum = await sha256(JSON.stringify(manifest)); const result = await post("import-analyse", { institutionId, courseSpaceId: String(data.get("courseSpaceId") || "") || undefined, sourceFormat: String(data.get("sourceFormat")), sourceChecksum, manifest }); setImportResult(result); router.refresh(); } catch (error) { setImportResult({ error: error instanceof Error ? error.message : "Import analysis failed" }); } }}>
                <label>Target course space<select name="courseSpaceId"><option value="">Unassigned report</option>{studio.spaces.map((space) => <option key={space.id} value={space.id}>{space.title}</option>)}</select></label>
                <label>Source format<select name="sourceFormat"><option value="common-cartridge">Common Cartridge</option><option value="canvas">Canvas</option><option value="moodle">Moodle</option><option value="scorm">SCORM</option><option value="veza-json">Veza JSON</option></select></label>
                <label>Manifest JSON<textarea name="manifest" rows={10} required defaultValue={'{"title":"Imported course","modules":[],"lessons":[],"resources":[]}'}/></label>
                <button>Analyse compatibility</button>
                {importResult ? <pre>{JSON.stringify(importResult, null, 2)}</pre> : null}
              </form>
            </Panel>
            <Panel title="Rollback and republish">
              <form onSubmit={(event) => submit("course-publish", event, (data) => { const snapshot = library.publications.find((item) => item.id === String(data.get("snapshotId"))); const space = studio.spaces.find((item) => item.id === snapshot?.courseSpaceId); return { courseSpaceId: snapshot?.courseSpaceId, expectedCourseSpaceVersion: space?.version, sourceReviewId: snapshot?.sourceReviewId, rollbackOfSnapshotId: snapshot?.id, reason: String(data.get("reason")) }; })}>
                <label>Prior publication<select name="snapshotId" required><option value="">Select snapshot</option>{library.publications.filter((item) => item.status === "superseded").map((item) => <option key={item.id} value={item.id}>{item.courseTitle} · publication {item.publicationNumber}</option>)}</select></label>
                <label>Rollback reason<textarea name="reason" required minLength={10} /></label>
                <button>Republish selected snapshot</button>
              </form>
            </Panel>
          </aside>
        </div>
      </section>
    </div>
  );
}

function BlockInspector({ block, onChange }: { block: StudioBlock; onChange: (data: Record<string, unknown>) => void }) {
  return <div className="vz-block-inspector"><header><small>BLOCK INSPECTOR</small><strong>{label(block.type)}</strong></header>{Object.entries(block.data).map(([key, current]) => <label key={key}>{key.replaceAll(/([A-Z])/g, " $1")}{typeof current === "string" && current.length > 60 ? <textarea value={current} onChange={(event) => onChange({ ...block.data, [key]: event.target.value })} /> : typeof current === "number" ? <input type="number" value={current} onChange={(event) => onChange({ ...block.data, [key]: Number(event.target.value) })} /> : typeof current === "string" ? <input value={current} onChange={(event) => onChange({ ...block.data, [key]: event.target.value })} /> : <textarea value={JSON.stringify(current, null, 2)} onChange={(event) => { try { onChange({ ...block.data, [key]: JSON.parse(event.target.value) }); } catch { return; } }} />}</label>)}</div>;
}

function diffSummary(current: readonly StudioBlock[], previous: readonly StudioBlock[]) {
  const prior = new Map(previous.map((block) => [block.id, JSON.stringify(block)]));
  const next = new Map(current.map((block) => [block.id, JSON.stringify(block)]));
  const added = [...next.keys()].filter((id) => !prior.has(id));
  const removed = [...prior.keys()].filter((id) => !next.has(id));
  const changed = [...next.keys()].filter((id) => prior.has(id) && prior.get(id) !== next.get(id));
  return { added, removed, changed };
}

export function StudioLessonEditorComplete({
  institutionId,
  detail,
  library,
  space,
}: {
  institutionId: string;
  detail: StudioLessonDetail;
  library: StudioLibrary;
  space: StudioCourseSpaceSummary;
}) {
  const router = useRouter();
  const latest = detail.revisions[0];
  const previous = detail.revisions[1];
  const [blocks, setBlocks] = useState<StudioBlock[]>(latest ? [...latest.blocks] : []);
  const [selected, setSelected] = useState<string | null>(blocks[0]?.id ?? null);
  const [lessonVersion, setLessonVersion] = useState(detail.version);
  const [baseRevisionId, setBaseRevisionId] = useState(detail.currentRevisionId);
  const [courseSpaceVersion, setCourseSpaceVersion] = useState(space.version);
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [role, setRole] = useState<"learner" | "instructor">("learner");
  const [status, setStatus] = useState("All changes saved");
  const dirty = useRef(false);
  const selectedBlock = blocks.find((block) => block.id === selected);
  const pendingReviews = detail.reviews.filter((review) => review.status === "pending");
  const approvedReviews = detail.reviews.filter((review) => review.status === "approved");
  const findings = latest ? [...latest.accessibilityReport.findings, ...latest.linkReport.findings] : [];
  const changes = diffSummary(blocks, previous?.blocks ?? []);

  function addBlock(type: StudioBlockType, data = defaultData(type)) {
    const block: StudioBlock = { id: uid(), type, data };
    setBlocks((current) => [...current, block]);
    setSelected(block.id);
    dirty.current = true;
  }
  function updateBlock(id: string, data: Record<string, unknown>) { setBlocks((current) => current.map((block) => block.id === id ? { ...block, data } : block)); dirty.current = true; }
  function move(id: string, delta: number) { setBlocks((current) => { const index = current.findIndex((block) => block.id === id); const target = index + delta; if (index < 0 || target < 0 || target >= current.length) return current; const sourceBlock = current[index]; const targetBlock = current[target]; if (!sourceBlock || !targetBlock) return current; const next = [...current]; next[index] = targetBlock; next[target] = sourceBlock; return next; }); dirty.current = true; }
  function remove(id: string) { setBlocks((current) => current.filter((block) => block.id !== id)); setSelected(null); dirty.current = true; }

  async function save(changeSummary = "Autosaved structured block changes") {
    const result = await post("revision-save", { institutionId, lessonId: detail.id, basedOnRevisionId: baseRevisionId, expectedLessonVersion: lessonVersion, blocks, changeSummary });
    setLessonVersion(Number(result.lessonVersion));
    setBaseRevisionId(String(result.id));
    dirty.current = false;
    return result;
  }

  useEffect(() => {
    const timer = window.setInterval(async () => {
      if (!dirty.current) return;
      setStatus("Autosaving...");
      try { await save(); setStatus(`Saved ${new Date().toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}`); }
      catch (error) { dirty.current = true; setStatus(error instanceof Error ? error.message : "Autosave failed"); }
    }, 5000);
    return () => window.clearInterval(timer);
  });

  async function operation(name: string, input: Record<string, unknown>) {
    setStatus("Working...");
    try { const result = await post(name, { institutionId, ...input }); setStatus("Recorded"); router.refresh(); return result; }
    catch (error) { setStatus(error instanceof Error ? error.message : "Operation failed"); return undefined; }
  }

  return (
    <div className="vz-learning-page vz-studio-editor">
      <header className="vz-editor-bar"><div><Link href="/studio">Studio</Link><span>/</span><strong>{detail.title}</strong><small>{status}</small></div><div><select value={role} onChange={(event) => setRole(event.target.value as "learner" | "instructor")}><option value="learner">Learner preview</option><option value="instructor">Instructor preview</option></select><div className="vz-device-switch"><button className={device === "desktop" ? "active" : ""} onClick={() => setDevice("desktop")}>Desktop</button><button className={device === "tablet" ? "active" : ""} onClick={() => setDevice("tablet")}>Tablet</button><button className={device === "mobile" ? "active" : ""} onClick={() => setDevice("mobile")}>Mobile</button></div><button onClick={() => save("Manual checkpoint before review").then(() => setStatus("Checkpoint saved"))}>Save checkpoint</button></div></header>
      <section className="vz-editor-shell">
        <aside className="vz-block-palette"><header><small>BLOCKS</small><strong>Insert content</strong></header>{palette.map((type) => <button key={type} onClick={() => addBlock(type)}><span>+</span>{label(type)}</button>)}<header><small>REUSABLE</small><strong>Institution library</strong></header>{library.reusableBlocks.map((block) => <button key={block.id} onClick={() => addBlock(block.blockType, block.content)}><span>↳</span>{block.name}</button>)}<header><small>READY ASSETS</small><strong>Media and files</strong></header>{library.assets.filter((asset) => asset.status === "ready").map((asset) => <button key={asset.id} onClick={() => addBlock(asset.assetKind === "document" || asset.assetKind === "archive" ? "file" : asset.assetKind === "other" ? "file" : asset.assetKind, { assetId: asset.id, url: asset.objectKey, altText: asset.altText ?? "", captions: asset.captionText ?? "", transcript: asset.transcriptText ?? "", label: asset.originalFilename })}><span>◎</span>{asset.originalFilename}</button>)}</aside>
        <main className={`vz-editor-canvas ${device}`}><div className="vz-preview-role">Previewing as {role}</div>{blocks.map((block, index) => <article key={block.id} className={selected === block.id ? "selected" : ""} onClick={() => setSelected(block.id)}><div className="vz-block-toolbar"><span>{label(block.type)}</span><button onClick={(event) => { event.stopPropagation(); move(block.id, -1); }} disabled={index === 0}>↑</button><button onClick={(event) => { event.stopPropagation(); move(block.id, 1); }} disabled={index === blocks.length - 1}>↓</button><button onClick={(event) => { event.stopPropagation(); remove(block.id); }}>Remove</button></div><div className="vz-editor-block-preview"><strong>{String(block.data.title ?? block.data.text ?? block.data.label ?? label(block.type))}</strong>{block.type === "image" && !block.data.altText ? <small className="error">Alternative text required</small> : null}{["video", "audio"].includes(block.type) && !block.data.transcript && !block.data.captions ? <small className="error">Caption or transcript required</small> : null}</div></article>)}{!blocks.length ? <button className="vz-empty-canvas" onClick={() => addBlock("heading")}>Add the first structured block</button> : null}</main>
        <aside className="vz-editor-inspector">{selectedBlock ? <BlockInspector block={selectedBlock} onChange={(data) => updateBlock(selectedBlock.id, data)} /> : <div className="vz-empty-state"><strong>Select a block</strong><p>Block properties and accessibility requirements appear here.</p></div>}<section className="vz-quality-panel"><header><small>QUALITY GATE</small><strong>{findings.length ? `${findings.length} findings` : "Ready for review"}</strong></header>{findings.slice(0, 8).map((finding) => <p key={`${finding.code}-${finding.blockId ?? "document"}`} className={finding.severity}><b>{finding.severity}</b>{finding.message}</p>)}</section><section className="vz-history-panel"><header><small>CHANGE SUMMARY</small><strong>Compared with prior revision</strong></header><p>{changes.added.length} added · {changes.changed.length} changed · {changes.removed.length} removed</p></section><section className="vz-history-panel"><header><small>REVISION HISTORY</small><strong>{detail.revisions.length}</strong></header>{detail.revisions.slice(0, 8).map((revision) => <article key={revision.id}><span>v{revision.revisionNumber}</span><div><strong>{revision.changeSummary}</strong><small>{revision.checksumSha256.slice(0, 12)} · {new Date(revision.createdAt).toLocaleString("en-ZA")}</small></div></article>)}</section></aside>
      </section>

      <section className="vz-studio-review-workspace">
        <header><div><p>COLLABORATIVE REVIEW</p><h2>Comments, decisions and publication</h2></div><span>{detail.comments.length} comments</span></header>
        <div className="vz-completion-grid">
          <section className="vz-record-surface">
            {detail.comments.map((comment) => <article key={comment.id}><div><small>{comment.status}</small><strong>{comment.blockId ? `Block ${comment.blockId}` : "Document comment"}</strong><span>{comment.body}</span></div><button type="button" onClick={() => operation("comment-status", { commentId: comment.id, expectedVersion: comment.version, status: comment.status === "resolved" ? "reopened" : "resolved" })}>{comment.status === "resolved" ? "Reopen" : "Resolve"}</button></article>)}
            {detail.reviews.map((review) => <article key={review.id}><div><small>{review.status}</small><strong>Review for revision {review.revisionId.slice(0, 8)}</strong><span>{review.decisionNotes ?? "Awaiting independent decision"}</span></div><dl><div><dt>Version</dt><dd>v{review.version}</dd></div></dl></article>)}
          </section>
          <aside className="vz-governance-rail">
            <Panel title="Add anchored comment"><form onSubmit={(event) => { event.preventDefault(); const data=new FormData(event.currentTarget); operation("comment-create",{lessonId:detail.id,revisionId:baseRevisionId,blockId:String(data.get("blockId")||"")||undefined,body:String(data.get("body"))}); event.currentTarget.reset(); }}><label>Block<select name="blockId"><option value="">Whole document</option>{blocks.map((block)=><option key={block.id} value={block.id}>{label(block.type)} · {block.id.slice(0,8)}</option>)}</select></label><label>Comment<textarea name="body" required /></label><button>Add comment</button></form></Panel>
            <Panel title="Submit for review"><form onSubmit={(event) => { event.preventDefault(); operation("review-request",{lessonId:detail.id,revisionId:baseRevisionId}); }}><p>Accessibility, link checks and open comments are enforced by the API.</p><button disabled={!baseRevisionId}>Request independent review</button></form></Panel>
            <Panel title="Decide pending review"><form onSubmit={(event) => { event.preventDefault(); const data=new FormData(event.currentTarget); const review=pendingReviews.find((item)=>item.id===String(data.get("reviewId"))); if(review) operation("review-decision",{reviewId:review.id,expectedVersion:review.version,decision:String(data.get("decision")),notes:String(data.get("notes"))}); }}><label>Review<select name="reviewId" required>{pendingReviews.map((review)=><option key={review.id} value={review.id}>{review.id.slice(0,8)} · revision {review.revisionId.slice(0,8)}</option>)}</select></label><label>Decision<select name="decision"><option value="approved">Approve</option><option value="changes-requested">Request changes</option></select></label><label>Decision notes<textarea name="notes" required minLength={10} /></label><button>Record decision</button></form></Panel>
            <Panel title="Publish approved snapshot"><form onSubmit={async (event) => { event.preventDefault(); const data=new FormData(event.currentTarget); const result=await operation("course-publish",{courseSpaceId:detail.courseSpaceId,expectedCourseSpaceVersion:courseSpaceVersion,sourceReviewId:String(data.get("reviewId")),reason:String(data.get("reason"))}); if(result?.courseSpaceVersion)setCourseSpaceVersion(Number(result.courseSpaceVersion)); }}><label>Approved review<select name="reviewId" required>{approvedReviews.map((review)=><option key={review.id} value={review.id}>{review.id.slice(0,8)} · revision {review.revisionId.slice(0,8)}</option>)}</select></label><label>Publication reason<textarea name="reason" required minLength={10} /></label><button>Publish immutable snapshot</button></form></Panel>
          </aside>
        </div>
      </section>
    </div>
  );
}
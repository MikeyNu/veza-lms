"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { CatalogueWorkspace, StudioBlock, StudioBlockType, StudioLessonDetail, StudioWorkspace } from "@veza/contracts";

async function post(operation: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(`/api/studio/${operation}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
  const body = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof body.message === "string" ? body.message : "Studio operation failed");
  return body;
}

function uid(): string { return crypto.randomUUID(); }
function blockLabel(type: StudioBlockType): string { return type.replaceAll("_", " ").replace(/^./, (value) => value.toUpperCase()); }

const palette: readonly StudioBlockType[] = ["heading","paragraph","callout","quote","image","video","audio","file","embed","table","columns","accordion","tabs","divider","code","equation","quiz","activity","outcome"];

function defaultData(type: StudioBlockType): Record<string, unknown> {
  if (type === "heading") return { text: "Section heading", level: 2 };
  if (type === "paragraph") return { text: "Start writing the lesson content." };
  if (type === "callout") return { title: "Key idea", text: "Explain the important point." };
  if (type === "quote") return { text: "Quoted text", attribution: "Source" };
  if (type === "image") return { url: "", alt: "", caption: "" };
  if (["video", "audio"].includes(type)) return { url: "", caption: "", transcript: "" };
  if (type === "file") return { assetId: "", label: "Download resource" };
  if (type === "embed") return { url: "https://", title: "Embedded resource" };
  if (type === "code") return { language: "text", code: "" };
  if (type === "equation") return { latex: "", accessibleText: "" };
  if (["quiz", "activity"].includes(type)) return { title: blockLabel(type), instructions: "", completionRule: { type: "submitted" } };
  if (type === "outcome") return { title: "Learning outcome", text: "" };
  return {};
}

export function StudioHomeWorkspace({ institutionId, studio, catalogue }: { institutionId: string; studio: StudioWorkspace; catalogue: CatalogueWorkspace }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const approved = catalogue.blueprints.filter((item) => item.lifecycle === "approved");
  async function submit(operation: string, event: FormEvent<HTMLFormElement>, build: (data: FormData) => Record<string, unknown>) {
    event.preventDefault(); setMessage("Saving...");
    try { await post(operation, { institutionId, ...build(new FormData(event.currentTarget)) }); event.currentTarget.reset(); setMessage("Saved"); router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Operation failed"); }
  }
  return <div className="vz-learning-page vz-studio-home">
    <header className="vz-page-heading"><div><p>VEZA STUDIO</p><h1>Structured course authoring</h1><span>Build accessible lessons from governed blocks, review immutable revisions and publish fixed delivery snapshots.</span></div><small>{message}</small></header>
    <section className="vz-studio-register">
      <div className="vz-studio-tree">
        {studio.spaces.map((space) => <article key={space.id}>
          <header><div><small>{space.status.replaceAll("_", " ")}</small><h2>{space.title}</h2><span>{space.moduleCount} modules · {space.lessonCount} lessons</span></div><strong>v{space.version}</strong></header>
          <div>{studio.modules.filter((module) => module.courseSpaceId === space.id).map((module) => <section key={module.id}><h3>{module.sequenceNumber}. {module.title}</h3>{studio.lessons.filter((lesson) => lesson.moduleId === module.id).map((lesson) => <Link key={lesson.id} href={`/studio/lessons/${lesson.id}`}><span>{lesson.sequenceNumber}</span><div><strong>{lesson.title}</strong><small>{lesson.lessonType} · {lesson.status.replaceAll("_", " ")}</small></div></Link>)}</section>)}</div>
        </article>)}
        {!studio.spaces.length ? <div className="vz-empty-state"><strong>No Studio course space</strong><p>Create one from an effective approved blueprint. Content remains separate from catalogue approval.</p></div> : null}
      </div>
      <aside className="vz-studio-actions">
        <details open><summary>Create course space</summary><form onSubmit={(event) => submit("course-space-create", event, (data) => ({ blueprintVersionId: String(data.get("blueprintVersionId")), title: String(data.get("title")) }))}><label>Approved blueprint<select name="blueprintVersionId" required><option value="">Select blueprint</option>{approved.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.title}</option>)}</select></label><label>Course-space title<input name="title" required minLength={3} maxLength={200}/></label><button>Create space</button></form></details>
        <details><summary>Create module</summary><form onSubmit={(event) => submit("module-create", event, (data) => ({ courseSpaceId: String(data.get("courseSpaceId")), title: String(data.get("title")), description: String(data.get("description") || "") || undefined, sequenceNumber: Number(data.get("sequenceNumber")), availabilityRule: {}, completionRule: { type: "all-lessons" } }))}><label>Course space<select name="courseSpaceId" required>{studio.spaces.map((space) => <option key={space.id} value={space.id}>{space.title}</option>)}</select></label><label>Title<input name="title" required/></label><label>Description<textarea name="description"/></label><label>Sequence<input type="number" name="sequenceNumber" min="1" required/></label><button>Create module</button></form></details>
        <details><summary>Create lesson</summary><form onSubmit={(event) => submit("lesson-create", event, (data) => { const module = studio.modules.find((item) => item.id === String(data.get("moduleId"))); return { courseSpaceId: module?.courseSpaceId, moduleId: String(data.get("moduleId")), title: String(data.get("title")), summary: String(data.get("summary") || "") || undefined, sequenceNumber: Number(data.get("sequenceNumber")), lessonType: String(data.get("lessonType")), estimatedMinutes: Number(data.get("estimatedMinutes") || 0) || undefined, availabilityRule: {}, completionRule: { type: "viewed" } }; })}><label>Module<select name="moduleId" required>{studio.modules.map((module) => <option key={module.id} value={module.id}>{module.title}</option>)}</select></label><label>Title<input name="title" required/></label><label>Summary<textarea name="summary"/></label><div className="vz-form-row"><label>Sequence<input type="number" name="sequenceNumber" min="1" required/></label><label>Minutes<input type="number" name="estimatedMinutes" min="1"/></label></div><label>Type<select name="lessonType"><option value="lesson">Lesson</option><option value="resource">Resource</option><option value="activity">Activity</option><option value="discussion">Discussion</option><option value="assignment-link">Assignment link</option></select></label><button>Create lesson</button></form></details>
      </aside>
    </section>
  </div>;
}

function BlockInspector({ block, onChange }: { block: StudioBlock; onChange: (data: Record<string, unknown>) => void }) {
  const fields = Object.entries(block.data);
  return <div className="vz-block-inspector"><header><small>BLOCK INSPECTOR</small><strong>{blockLabel(block.type)}</strong></header>{fields.map(([key, value]) => <label key={key}>{key.replaceAll(/([A-Z])/g, " $1")} {typeof value === "string" && String(value).length > 60 ? <textarea value={String(value)} onChange={(event) => onChange({ ...block.data, [key]: event.target.value })}/> : typeof value === "number" ? <input type="number" value={value} onChange={(event) => onChange({ ...block.data, [key]: Number(event.target.value) })}/> : typeof value === "string" ? <input value={value} onChange={(event) => onChange({ ...block.data, [key]: event.target.value })}/> : <textarea value={JSON.stringify(value, null, 2)} onChange={(event) => { try { onChange({ ...block.data, [key]: JSON.parse(event.target.value) }); } catch {} }}/>}</label>)}</div>;
}

export function StudioLessonEditor({ institutionId, detail }: { institutionId: string; detail: StudioLessonDetail }) {
  const router = useRouter();
  const latest = detail.revisions[0];
  const [blocks, setBlocks] = useState<StudioBlock[]>(latest ? [...latest.blocks] : []);
  const [selected, setSelected] = useState<string | null>(blocks[0]?.id ?? null);
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [role, setRole] = useState<"learner" | "instructor">("learner");
  const [status, setStatus] = useState("All changes saved");
  const dirty = useRef(false);
  const selectedBlock = blocks.find((block) => block.id === selected);

  function addBlock(type: StudioBlockType) { const block: StudioBlock = { id: uid(), type, data: defaultData(type) }; setBlocks((current) => [...current, block]); setSelected(block.id); dirty.current = true; }
  function updateBlock(id: string, data: Record<string, unknown>) { setBlocks((current) => current.map((block) => block.id === id ? { ...block, data } : block)); dirty.current = true; }
  function move(id: string, delta: number) { setBlocks((current) => { const index = current.findIndex((block) => block.id === id); const target = index + delta; if (index < 0 || target < 0 || target >= current.length) return current; const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next; }); dirty.current = true; }
  function remove(id: string) { setBlocks((current) => current.filter((block) => block.id !== id)); setSelected(null); dirty.current = true; }

  useEffect(() => {
    const timer = window.setInterval(async () => {
      if (!dirty.current) return;
      dirty.current = false; setStatus("Autosaving...");
      try {
        await post("revision-save", { institutionId, lessonId: detail.id, basedOnRevisionId: detail.currentRevisionId, expectedLessonVersion: detail.version, blocks, changeSummary: "Autosaved structured block changes" });
        setStatus(`Saved ${new Date().toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}`);
        router.refresh();
      } catch (error) { dirty.current = true; setStatus(error instanceof Error ? error.message : "Autosave failed"); }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [blocks, detail.currentRevisionId, detail.id, detail.version, institutionId, router]);

  async function requestReview() {
    if (!detail.currentRevisionId) return;
    try { await post("review-request", { institutionId, lessonId: detail.id, revisionId: detail.currentRevisionId, expectedLessonVersion: detail.version, notes: "Structured lesson ready for independent review." }); router.refresh(); }
    catch (error) { setStatus(error instanceof Error ? error.message : "Review request failed"); }
  }

  async function publishCourse() {
    try { await post("course-publish", { institutionId, courseSpaceId: detail.courseSpaceId, expectedCourseSpaceVersion: 1, publicationNotes: "Publish approved lesson revisions for learner delivery." }); router.refresh(); }
    catch (error) { setStatus(error instanceof Error ? error.message : "Publication failed"); }
  }

  const findings = latest ? [...latest.accessibilityReport.findings, ...latest.linkReport.findings] : [];
  return <div className="vz-learning-page vz-studio-editor">
    <header className="vz-editor-bar"><div><Link href="/studio">Studio</Link><span>/</span><strong>{detail.title}</strong><small>{status}</small></div><div><select value={role} onChange={(event) => setRole(event.target.value as "learner" | "instructor")}><option value="learner">Learner preview</option><option value="instructor">Instructor preview</option></select><div className="vz-device-switch"><button className={device === "desktop" ? "active" : ""} onClick={() => setDevice("desktop")}>Desktop</button><button className={device === "tablet" ? "active" : ""} onClick={() => setDevice("tablet")}>Tablet</button><button className={device === "mobile" ? "active" : ""} onClick={() => setDevice("mobile")}>Mobile</button></div><button onClick={requestReview}>Request review</button><button className="primary" onClick={publishCourse}>Publish</button></div></header>
    <section className="vz-editor-shell">
      <aside className="vz-block-palette"><header><small>BLOCKS</small><strong>Insert content</strong></header>{palette.map((type) => <button key={type} onClick={() => addBlock(type)}><span>+</span>{blockLabel(type)}</button>)}</aside>
      <main className={`vz-editor-canvas ${device}`}><div className="vz-preview-role">Previewing as {role}</div>{blocks.map((block, index) => <article key={block.id} className={selected === block.id ? "selected" : ""} onClick={() => setSelected(block.id)}><div className="vz-block-toolbar"><span>{blockLabel(block.type)}</span><button onClick={(event) => { event.stopPropagation(); move(block.id, -1); }} disabled={index === 0}>↑</button><button onClick={(event) => { event.stopPropagation(); move(block.id, 1); }} disabled={index === blocks.length - 1}>↓</button><button onClick={(event) => { event.stopPropagation(); remove(block.id); }}>Remove</button></div><div className="vz-editor-block-preview"><strong>{String(block.data.title ?? block.data.text ?? block.data.label ?? blockLabel(block.type))}</strong>{block.type === "image" && !block.data.alt ? <small className="error">Alternative text required</small> : null}{["video", "audio"].includes(block.type) && !block.data.transcript ? <small className="error">Caption or transcript required</small> : null}</div></article>)}{!blocks.length ? <button className="vz-empty-canvas" onClick={() => addBlock("heading")}>Add the first structured block</button> : null}</main>
      <aside className="vz-editor-inspector">{selectedBlock ? <BlockInspector block={selectedBlock} onChange={(data) => updateBlock(selectedBlock.id, data)} /> : <div className="vz-empty-state"><strong>Select a block</strong><p>Block properties and accessibility requirements appear here.</p></div>}<section className="vz-quality-panel"><header><small>QUALITY GATE</small><strong>{findings.length ? `${findings.length} findings` : "Ready for review"}</strong></header>{findings.slice(0, 8).map((finding) => <p key={`${finding.code}-${finding.blockId ?? "document"}`} className={finding.severity}><b>{finding.severity}</b>{finding.message}</p>)}</section><section className="vz-history-panel"><header><small>REVISION HISTORY</small><strong>{detail.revisions.length}</strong></header>{detail.revisions.slice(0, 8).map((revision) => <article key={revision.id}><span>v{revision.revisionNumber}</span><div><strong>{revision.changeSummary}</strong><small>{revision.checksumSha256.slice(0, 12)} · {new Date(revision.createdAt).toLocaleString("en-ZA")}</small></div></article>)}</section></aside>
    </section>
  </div>;
}

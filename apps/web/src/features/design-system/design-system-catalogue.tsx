"use client";

import {
  AuditHistory, BlockPalette, BulkActionBar, Button, ButtonLink, Checkbox, Combobox,
  CommandPalette, CommandPaletteTrigger, ContentBlock, ContextRail, DataTable,
  DateTimeRange, Dialog, Drawer, EditableRegion, EmptyState, ErrorState, Field,
  FieldGroup, FileUpload, FilterBar, IconButton, InspectorPanel, Link, LoadingState,
  MetricStrip, OptionalField, Pagination, PageHeader, Popover, RadioGroup,
  RichTextToolbar, Section, Select, Skeleton, SplitWorkspace, StatusIndicator,
  StructuredContent, StructuredEditorStatus, Switch, Tabs, Textarea, TextInput,
  Timeline, ToastProvider, Toolbar, ValidationSummary, useToast,
  type DataColumn, type FileUploadItem, type VezaDensity,
} from "@veza/ui";
import { useMemo, useState, type CSSProperties } from "react";

type Row = { readonly id: string; readonly learner: string; readonly programme: string; readonly state: "Active" | "At risk" | "Completed"; readonly progress: number };
const rows: readonly Row[] = [
  { id: "LRN-1048", learner: "Naledi Mokoena", programme: "Project Management", state: "Active", progress: 68 },
  { id: "LRN-1053", learner: "Sipho Dlamini", programme: "Project Management", state: "At risk", progress: 31 },
  { id: "LRN-1061", learner: "Amina Patel", programme: "Digital Learning Design", state: "Completed", progress: 100 },
];
const columns: readonly DataColumn<Row>[] = [
  { key: "learner", header: "Learner", cell: (row) => <><strong>{row.learner}</strong><small className="ds-cell-detail">{row.id}</small></> },
  { key: "programme", header: "Programme", cell: (row) => row.programme },
  { key: "state", header: "State", cell: (row) => <StatusIndicator label={row.state} tone={row.state === "Completed" ? "success" : row.state === "At risk" ? "warning" : "information"} /> },
  { key: "progress", header: "Progress", align: "end", sortable: true, sortDirection: "descending", cell: (row) => `${row.progress}%` },
];

function Body() {
  const toast = useToast();
  const [density, setDensity] = useState<VezaDensity>("comfortable");
  const [contrast, setContrast] = useState(false);
  const [rtl, setRtl] = useState(false);
  const [longText, setLongText] = useState(false);
  const [motion, setMotion] = useState(false);
  const [accent, setAccent] = useState("#4F46E5");
  const [dialog, setDialog] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const [region, setRegion] = useState("johannesburg");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set(["LRN-1053"]));
  const [files, setFiles] = useState<readonly FileUploadItem[]>([]);
  const style = useMemo(() => ({
    "--institution-accent": accent,
    "--veza-institution-accent": accent,
    ...(motion ? { "--veza-motion-fast": "0ms", "--veza-motion-standard": "0ms" } : {}),
  }) as CSSProperties, [accent, motion]);
  const selectRow = (id: string, value: boolean) => setSelected((current) => { const next = new Set(current); value ? next.add(id) : next.delete(id); return next; });

  return <div className="ds-catalogue" data-veza-density={density} data-veza-contrast={contrast ? "high" : undefined} data-reduced-motion={motion ? "true" : undefined} dir={rtl ? "rtl" : "ltr"} style={style}>
    <aside className="ds-lab" aria-label="Catalogue test controls">
      <div><strong>Test conditions</strong><span>Applied to every component example.</span></div>
      <Field label="Density"><Select value={density} onChange={(event) => setDensity(event.currentTarget.value as VezaDensity)}><option value="comfortable">Comfortable</option><option value="compact">Compact</option><option value="reduced">Reduced learner mode</option></Select></Field>
      <Field label="Institution accent"><TextInput type="color" value={accent} onChange={(event) => setAccent(event.currentTarget.value)} /></Field>
      <Switch label="High contrast" checked={contrast} onCheckedChange={setContrast} />
      <Switch label="Long text" checked={longText} onCheckedChange={setLongText} />
      <Switch label="Right-to-left" checked={rtl} onCheckedChange={setRtl} />
      <Switch label="Reduced motion" checked={motion} onCheckedChange={setMotion} />
    </aside>

    <main className="ds-main">
      <PageHeader eyebrow="VEZA SHARED UI" title={longText ? "Shared interface system for multilingual, regulated and operationally complex learning institutions" : "Shared interface system"} description={longText ? "This extended description verifies formal terminology, translated labels, long qualification names and detailed policy wording without clipped controls or decorative shortcuts." : "Governed operational controls tested across density, access needs, institution accents and long institutional language."} metadata={<><span>WCAG 2.2 AA target</span><span>React 19</span><span>Institution accent boundary</span></>} actions={<><CommandPaletteTrigger onClick={() => setPalette(true)} /><Button onClick={() => toast.notify({ title: "Catalogue state captured", tone: "success" })}>Test notification</Button></>} />
      <MetricStrip items={[{ label: "Components", value: "34", detail: "Shared patterns" },{ label: "Density modes", value: "3" },{ label: "Keyboard contracts", value: "11" },{ label: "Elevated surfaces", value: "Transient only" }]} />

      <Section title="Actions, links and tabs" description="A single primary action anchors each decision area. Secondary and quiet actions preserve hierarchy.">
        <Toolbar><Button>Save changes</Button><Button variant="secondary">Preview</Button><Button variant="quiet">Cancel</Button><Button variant="danger">Revoke</Button><IconButton label="More actions" icon={<span>•••</span>} /><ButtonLink href="#forms" variant="secondary">Review forms</ButtonLink><Link href="#records" variant="standalone">Open records</Link></Toolbar>
        <Tabs label="Record views" tabs={[{ id: "summary", label: "Summary", content: <p>Summary evidence remains concise and task-focused.</p> },{ id: "history", label: "History", badge: "12", content: <p>Historical evidence uses timelines and audit records.</p> },{ id: "policy", label: "Policy", content: <p>Policy changes remain effective-dated and reviewable.</p> }]} />
      </Section>

      <Section id="forms" title="Forms and validation" description="Native controls, persistent labels and linked validation messages form the default path.">
        <div className="ds-form-layout"><form className="ds-form" onSubmit={(event) => event.preventDefault()}>
          <ValidationSummary issues={[{ id: "name-error", fieldId: "institution-name", message: "Enter the institution's registered name." }]} />
          <Field label="Institution name" description="Use the registered legal or operating name." error="Enter the institution's registered name."><TextInput id="institution-name" aria-invalid="true" /></Field>
          <OptionalField label="Public website"><TextInput type="url" placeholder="https://institution.example" /></OptionalField>
          <Combobox label="Operational region" value={region} onValueChange={setRegion} options={[{ value: "johannesburg", label: "Johannesburg", description: "Africa/Johannesburg" },{ value: "cape-town", label: "Cape Town" },{ value: "durban", label: "Durban" }]} />
          <Field label="Institution type"><Select defaultValue="university"><option value="university">University</option><option value="college">College</option><option value="training">Training provider</option></Select></Field>
          <Field label="Policy note"><Textarea defaultValue="Changes require approval from an authorised institution administrator." /></Field>
          <DateTimeRange legend="Effective window" startName="startsAt" endName="endsAt" />
          <FieldGroup legend="Delivery options"><Checkbox label="Campus delivery" defaultChecked /><Checkbox label="Online delivery" defaultChecked /><Checkbox label="Workplace learning" /></FieldGroup>
          <RadioGroup name="visibility" defaultValue="staff" options={[{ value: "staff", label: "Staff only" },{ value: "institution", label: "Institution wide" }]} />
          <Switch label="Require independent approval" defaultChecked />
        </form><div className="ds-state-column"><StatusIndicator tone="success" label="Ready" detail="Checks passed" /><StatusIndicator tone="warning" label="Attention" detail="Two policies need review" /><LoadingState label="Loading policy" detail="Reading the approved version" /><ErrorState message="The identity provider did not return a signed response." reference="COR-7F3A9" action={<Button size="small" variant="secondary">Retry</Button>} /><div className="ds-skeleton-stack"><Skeleton width="42%" /><Skeleton width="88%" /><Skeleton shape="block" /></div></div></div>
      </Section>

      <Section title="Overlays and notifications" description="Dialogs, drawers and popovers are the only elevated surfaces.">
        <Toolbar><Button onClick={() => setDialog(true)}>Open dialog</Button><Button variant="secondary" onClick={() => setDrawer(true)}>Open drawer</Button><Popover label="Approval policy" trigger={<Button variant="quiet">Open popover</Button>}><strong>Independent approval</strong><p>Two authorised users approve high-risk changes.</p></Popover><Button variant="secondary" onClick={() => toast.notify({ title: "Policy saved", actionLabel: "Undo", onAction: () => undefined })}>Show toast</Button></Toolbar>
        <Dialog open={dialog} onClose={() => setDialog(false)} title="Approve operational change" description="This decision becomes audit evidence." footer={<><Button variant="quiet" onClick={() => setDialog(false)}>Cancel</Button><Button onClick={() => setDialog(false)}>Approve</Button></>}><Field label="Approval reason"><Textarea defaultValue="The change aligns with the approved operating model." /></Field></Dialog>
        <Drawer open={drawer} onClose={() => setDrawer(false)} title="Record inspector" description="Review evidence without leaving the task." footer={<Button onClick={() => setDrawer(false)}>Done</Button>}><AuditHistory entries={[{ id: "a0", action: "Status verified", actor: "M. Ndhlovu", occurredAt: "2026-08-05T17:20:00Z", reason: "Annual control review", correlationId: "COR-2F81" }]} /></Drawer>
      </Section>

      <Section id="records" title="Tables, filters and bulk actions" description="Dense records stay tabular. Filters remain attached to the dataset they affect.">
        <FilterBar activeFilters={[{ id: "state", label: "State", value: "Active and at risk" }]} resultsSummary="3 learners"><TextInput aria-label="Search learners" placeholder="Search learner or identifier" /><Select aria-label="Programme"><option>All programmes</option><option>Project Management</option></Select></FilterBar>
        <DataTable caption="Learner progression" rows={rows} columns={columns} getRowId={(row) => row.id} selectedRowIds={selected} onSelectionChange={selectRow} onSelectAll={(value) => setSelected(value ? new Set(rows.map((row) => row.id)) : new Set())} rowActions={(row) => <IconButton label={`Open ${row.learner}`} icon={<span>→</span>} />} />
        <Pagination currentPage={1} totalPages={8} onNext={() => undefined} />
        <BulkActionBar selectedCount={selected.size} onClear={() => setSelected(new Set())}><Button size="small" variant="secondary">Assign cohort</Button><Button size="small" variant="danger">Withdraw</Button></BulkActionBar>
      </Section>

      <Section title="Timeline, audit and boundaries"><div className="ds-two-column"><Timeline items={[{ id: "t1", title: "Application received", timestamp: "09:12", description: "Admissions evidence was submitted.", tone: "information" },{ id: "t2", title: "Identity verified", timestamp: "10:03", tone: "success" },{ id: "t3", title: "Evidence needs review", timestamp: "10:20", tone: "warning" }]} /><AuditHistory entries={[{ id: "a1", action: "Programme assignment changed", actor: "L. Khumalo", occurredAt: "2026-08-05T09:12:00Z", reason: "Approved transfer request", correlationId: "COR-913B", before: "Certificate", after: "Diploma" }]} /></div><div className="ds-three-column"><EmptyState compact title="No waitlisted learners" description="New entries will appear in authoritative order." /><LoadingState label="Recomputing progress" /><ErrorState title="Export failed" message="The structured export could not be completed." reference="EXP-1042" /></div></Section>

      <Section title="Context rail and inspector" description="The dominant task remains central. Context and inspection remain stable but subordinate."><div className="ds-workspace-frame"><SplitWorkspace rail={<ContextRail label="Course context" title={<strong>PMGT 101</strong>} items={[{ id: "overview", label: "Overview", active: true },{ id: "learners", label: "Learners", meta: "84" },{ id: "assessment", label: "Assessment", meta: "4" }]} />} inspector={<InspectorPanel title="Selected learner" description="Naledi Mokoena"><StatusIndicator tone="success" label="Identity linked" /><StatusIndicator tone="information" label="Submission received" /></InspectorPanel>}><Section divided={false} title="Submission evidence"><DataTable caption="Submission attempts" rows={rows.slice(0, 2)} columns={columns.slice(0, 3)} getRowId={(row) => row.id} /></Section></SplitWorkspace></div></Section>

      <Section title="Authoring blocks" description="Structured content remains inspectable and movable without drag-only interaction."><div className="ds-authoring"><BlockPalette items={[{ type: "heading", label: "Heading", description: "Section hierarchy" },{ type: "paragraph", label: "Paragraph", description: "Body content" },{ type: "outcome", label: "Outcome", description: "Mapped learning outcome" }]} onInsert={() => undefined} /><StructuredContent label="Lesson content"><ContentBlock blockId="b1" type="heading" label="Introduction" selected draggable controls={<IconButton label="Block menu" icon={<span>•••</span>} />}><EditableRegion label="Heading text" value="Project initiation and accountable delivery" multiline={false} /></ContentBlock><ContentBlock blockId="b2" type="paragraph" label="Overview" draggable><EditableRegion label="Paragraph text" value="A project begins with a clearly stated purpose, accountable ownership and explicit delivery evidence." /></ContentBlock></StructuredContent><InspectorPanel title="Block settings"><RichTextToolbar actions={[{ id: "bold", label: "Bold", icon: <b>B</b>, onAction: () => undefined },{ id: "italic", label: "Italic", icon: <i>I</i>, onAction: () => undefined }]} /><StructuredEditorStatus state="saved" detail="Saved 14 seconds ago" /></InspectorPanel></div></Section>

      <Section title="File handling"><FileUpload label="Evidence files" description="Upload approved evidence. Every file is scanned before use." items={files} maximumFiles={3} maximumSizeBytes={10 * 1024 * 1024} accept="image/*,.pdf" onFilesSelected={(selectedFiles) => setFiles((current) => [...current, ...selectedFiles.map((file) => ({ id: `${file.name}-${file.lastModified}`, file }))])} onRemove={(id) => setFiles((current) => current.filter((item) => item.id !== id))} /></Section>
    </main>

    <CommandPalette open={palette} onOpenChange={setPalette} title="Find a workspace action" commands={[{ id: "people", label: "Open people", group: "Navigation", keywords: ["learner", "staff"], onSelect: () => setPalette(false) },{ id: "audit", label: "Open audit evidence", group: "Navigation", onSelect: () => setPalette(false) },{ id: "new", label: "Create programme", group: "Create", onSelect: () => setPalette(false) }]} />
  </div>;
}

export function DesignSystemCatalogue() {
  return <ToastProvider><Body /></ToastProvider>;
}

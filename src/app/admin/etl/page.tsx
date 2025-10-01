"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Upload, XCircle } from "lucide-react";
import { collection, doc, getDocs, writeBatch } from "firebase/firestore";
import type { ZodType } from "zod";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { getFirebaseFirestore } from "@/lib/firebase";
import {
  computeDiff,
  detectFormatFromName,
  formatSummary,
  parseCourses,
  parseMajors,
  parseSections,
  runIntegrityChecks,
  courseSchema,
  majorSchema,
  sectionSchema,
  type CourseRecord,
  type DatasetKey,
  type DiffResult,
  type FileFormat,
  type IntegrityIssue,
  type MajorRecord,
  type SectionRecord,
} from "@/lib/etl/parsers";

interface DatasetState<T> {
  status: "idle" | "parsing" | "ready" | "error";
  parsed?: Record<string, T>;
  diff?: DiffResult<T>;
  error?: string;
  fileName?: string;
  applying: boolean;
  lastAppliedAt?: string;
}

interface DatasetConfig<T> {
  key: DatasetKey;
  label: string;
  description: string;
  collection: string;
  parse: (content: string, format: FileFormat) => Promise<Record<string, T>>;
  schema: ZodType<T>;
}

type DatasetData = {
  majors: MajorRecord;
  courses: CourseRecord;
  sections: SectionRecord;
};

const datasetConfigs: { [K in DatasetKey]: DatasetConfig<DatasetData[K]> } = {
  majors: {
    key: "majors",
    label: "Majors & Requirements",
    description: "Upload major requirement rules as CSV or JSON to overwrite the majors collection.",
    collection: "majors",
    parse: (content, format) => parseMajors(content, format),
    schema: majorSchema,
  },
  courses: {
    key: "courses",
    label: "Course Catalog",
    description: "Upload the authoritative course list.",
    collection: "courses",
    parse: (content, format) => parseCourses(content, format),
    schema: courseSchema,
  },
  sections: {
    key: "sections",
    label: "Sections",
    description: "Upload term section offerings with meeting times.",
    collection: "sections",
    parse: (content, format) => parseSections(content, format),
    schema: sectionSchema,
  },
};

type DatasetStates = {
  [K in DatasetKey]: DatasetState<DatasetData[K]>;
};

type ExistingData = {
  [K in DatasetKey]: Record<string, DatasetData[K]>;
};

const DATASET_KEYS = ["majors", "courses", "sections"] as const satisfies DatasetKey[];

const INITIAL_DATASET_STATE = { status: "idle", applying: false } as const;
const MAX_PREVIEW = 10;

export default function EtlPage() {
  const [activeTab, setActiveTab] = useState<"majors" | "catalog" | "integrity">("majors");
  const [existingData, setExistingData] = useState<ExistingData>({
    majors: {},
    courses: {},
    sections: {},
  });
  const [datasetStates, setDatasetStates] = useState<DatasetStates>({
    majors: { ...INITIAL_DATASET_STATE },
    courses: { ...INITIAL_DATASET_STATE },
    sections: { ...INITIAL_DATASET_STATE },
  });
  const [initialLoadError, setInitialLoadError] = useState<string | null>(null);
  const [loadingExisting, setLoadingExisting] = useState<boolean>(true);

  useEffect(() => {
    async function loadExisting() {
      try {
        const db = getFirebaseFirestore();
        const nextExisting: ExistingData = { majors: {}, courses: {}, sections: {} };

        for (const key of Object.keys(datasetConfigs) as DatasetKey[]) {
          const config = datasetConfigs[key];
          const snapshot = await getDocs(collection(db, config.collection));

          snapshot.forEach((docSnapshot) => {
            const data = docSnapshot.data();
            const parsed = config.schema.parse({
              id: data.id ?? docSnapshot.id,
              ...data,
            });
            nextExisting[key as keyof ExistingData][docSnapshot.id] = parsed;
          });
        }

        setExistingData(nextExisting);

        setDatasetStates((prev) => {
          const next: DatasetStates = { ...prev };

          const recompute = <K extends DatasetKey>(key: K) => {
            const stateForKey = prev[key];
            if (stateForKey.parsed) {
              const diff = computeDiff(nextExisting[key], stateForKey.parsed);
              next[key] = { ...stateForKey, diff };
            }
          };

          DATASET_KEYS.forEach((key) => recompute(key));

          return next;
        });
      } catch (error) {
        console.error(error);
        setInitialLoadError(
          error instanceof Error
            ? error.message
            : "Unable to load existing Firestore data."
        );
      } finally {
        setLoadingExisting(false);
      }
    }

    loadExisting();
  }, []);

  function updateDatasetState<K extends DatasetKey>(
    key: K,
    updater: (state: DatasetStates[K]) => DatasetStates[K]
  ) {
    setDatasetStates((prev) => ({
      ...prev,
      [key]: updater(prev[key]),
    }));
  }

  async function handleFileSelected<K extends DatasetKey>(key: K, file: File) {
    updateDatasetState(key, (state) => ({
      ...state,
      status: "parsing",
      error: undefined,
      fileName: file.name,
    }));

    try {
      const content = await file.text();
      const format = detectFormatFromName(file.name);
      const config = datasetConfigs[key];
      const parsed = await config.parse(content, format);

      const diff = computeDiff(existingData[key], parsed);

      updateDatasetState(key, (state) => ({
        ...state,
        status: "ready",
        parsed,
        diff,
        error: undefined,
      }));
    } catch (error) {
      console.error(error);
      updateDatasetState(key, (state) => ({
        ...state,
        status: "error",
        error:
          error instanceof Error
            ? error.message
            : "Failed to parse file. Please confirm format.",
      }));
    }
  }

  async function applyDataset<K extends DatasetKey>(key: K) {
    const state = datasetStates[key];
    const parsed = state.parsed;
    if (!parsed) return;

    updateDatasetState(key, (prev) => ({ ...prev, applying: true, error: undefined }));

    try {
      const db = getFirebaseFirestore();
      const config = datasetConfigs[key];
      const diff = computeDiff(existingData[key], parsed);
      const operationsCount =
        diff.added.length + diff.updated.length + diff.removed.length;

      if (operationsCount === 0) {
        updateDatasetState(key, (prev) => ({ ...prev, applying: false }));
        return;
      }

      let batch = writeBatch(db);
      let opCount = 0;
      const pendingCommits: Array<Promise<void>> = [];

      const commitBatch = () => {
        if (opCount === 0) return;
        pendingCommits.push(batch.commit());
        batch = writeBatch(db);
        opCount = 0;
      };

      const enqueueSet = (id: string, record: DatasetData[K]) => {
        const ref = doc(db, config.collection, id);
        const payload = JSON.parse(JSON.stringify(record));
        batch.set(ref, payload);
        opCount += 1;
        if (opCount >= 400) {
          commitBatch();
        }
      };

      const enqueueDelete = (id: string) => {
        const ref = doc(db, config.collection, id);
        batch.delete(ref);
        opCount += 1;
        if (opCount >= 400) {
          commitBatch();
        }
      };

      diff.added.forEach(({ id, record }) => enqueueSet(id, record));
      diff.updated.forEach(({ id, record }) => enqueueSet(id, record));
      diff.removed.forEach(({ id }) => enqueueDelete(id));

      if (opCount > 0) {
        commitBatch();
      }

      await Promise.all(pendingCommits);

      setExistingData((prev) => ({
        ...prev,
        [key]: parsed,
      }) as ExistingData);

      const refreshedDiff = computeDiff(parsed, parsed);

      updateDatasetState(key, (prev) => ({
        ...prev,
        applying: false,
        diff: refreshedDiff,
        lastAppliedAt: new Date().toISOString(),
        error: undefined,
      }));
    } catch (error) {
      console.error(error);
      updateDatasetState(key, (prev) => ({
        ...prev,
        applying: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to apply changes to Firestore.",
      }));
    }
  }

  const combinedData = useMemo(() => ({
    majors: datasetStates.majors.parsed ?? existingData.majors,
    courses: datasetStates.courses.parsed ?? existingData.courses,
    sections: datasetStates.sections.parsed ?? existingData.sections,
  }), [datasetStates, existingData]);

  const readyForIntegrity = useMemo(() => {
    return Object.values(combinedData).every((dataset) => Object.keys(dataset).length > 0);
  }, [combinedData]);

  const integrityIssues = useMemo(() => {
    if (!readyForIntegrity) return [] as IntegrityIssue[];
    return runIntegrityChecks(combinedData);
  }, [combinedData, readyForIntegrity]);

  const integritySummary = useMemo(() => {
    const errors = integrityIssues.filter((issue) => issue.type === "error");
    const warnings = integrityIssues.filter((issue) => issue.type === "warning");
    return {
      errors,
      warnings,
    };
  }, [integrityIssues]);

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-6 py-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Catalog ETL Console</h1>
        <p className="text-sm text-muted-foreground">
          Upload majors, courses, and section datasets, preview diff against Firestore, and apply batched updates.
        </p>
      </header>

      {initialLoadError && (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4" />
          <span>{initialLoadError}</span>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)}>
        <TabsList>
          <TabsTrigger value="majors">Majors & Requirements</TabsTrigger>
          <TabsTrigger value="catalog">Course Catalog</TabsTrigger>
          <TabsTrigger value="integrity">Integrity Check</TabsTrigger>
        </TabsList>

        <TabsContent value="majors" className="space-y-6 pt-4">
          <DatasetPanel
            datasetKey="majors"
            config={datasetConfigs.majors}
            state={datasetStates.majors}
            existingCount={Object.keys(existingData.majors).length}
            loadingExisting={loadingExisting}
            onFileSelected={(file) => handleFileSelected("majors", file)}
            onApply={() => applyDataset("majors")}
          />
        </TabsContent>

        <TabsContent value="catalog" className="grid gap-6 pt-4 md:grid-cols-2">
          <DatasetPanel
            datasetKey="courses"
            config={datasetConfigs.courses}
            state={datasetStates.courses}
            existingCount={Object.keys(existingData.courses).length}
            loadingExisting={loadingExisting}
            onFileSelected={(file) => handleFileSelected("courses", file)}
            onApply={() => applyDataset("courses")}
          />
          <DatasetPanel
            datasetKey="sections"
            config={datasetConfigs.sections}
            state={datasetStates.sections}
            existingCount={Object.keys(existingData.sections).length}
            loadingExisting={loadingExisting}
            onFileSelected={(file) => handleFileSelected("sections", file)}
            onApply={() => applyDataset("sections")}
          />
        </TabsContent>

        <TabsContent value="integrity" className="space-y-6 pt-4">
          <IntegrityPanel
            ready={readyForIntegrity}
            issues={integrityIssues}
            summary={integritySummary}
          />
        </TabsContent>
      </Tabs>
    </main>
  );
}

type DatasetPanelProps<T> = {
  datasetKey: DatasetKey;
  config: DatasetConfig<T>;
  state: DatasetState<T>;
  existingCount: number;
  loadingExisting: boolean;
  onFileSelected: (file: File) => void;
  onApply: () => void | Promise<void>;
};

function DatasetPanel<T extends object>({
  datasetKey,
  config,
  state,
  existingCount,
  loadingExisting,
  onFileSelected,
  onApply,
}: DatasetPanelProps<T>) {
  const totalChanges = useMemo(() => {
    if (!state.diff) return 0;
    return state.diff.added.length + state.diff.updated.length + state.diff.removed.length;
  }, [state.diff]);

  const hasChanges = totalChanges > 0;

  const fileInputId = `${datasetKey}-file-input`;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <CardTitle>{config.label}</CardTitle>
        <CardDescription>{config.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor={fileInputId} className="text-sm font-medium">
            Upload CSV or JSON
          </label>
          <Input
            id={fileInputId}
            type="file"
            accept=".csv,.json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                onFileSelected(file);
                event.target.value = "";
              }
            }}
          />
          <p className="text-xs text-muted-foreground">
            {state.fileName ? `Selected: ${state.fileName}` : "No file selected"}
          </p>
        </div>

        <DatasetStatus
          state={state}
          existingCount={existingCount}
          loadingExisting={loadingExisting}
          hasChanges={hasChanges}
        />

        <DiffPreview datasetKey={datasetKey} state={state} />

        <div className="mt-auto flex items-center justify-between border-t pt-4">
          <div className="text-xs text-muted-foreground">
            {state.lastAppliedAt && (
              <span>
                Last applied {new Date(state.lastAppliedAt).toLocaleString()}
              </span>
            )}
          </div>
          <Button
            onClick={() => onApply()}
            disabled={!state.parsed || !hasChanges || state.applying || state.status === "parsing"}
          >
            {state.applying ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Applying
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" /> Apply
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function DatasetStatus<T>({
  state,
  existingCount,
  loadingExisting,
  hasChanges,
}: {
  state: DatasetState<T>;
  existingCount: number;
  loadingExisting: boolean;
  hasChanges: boolean;
}) {
  if (state.status === "parsing") {
    return (
      <div className="flex items-center gap-2 rounded-md border border-blue-100 bg-blue-50 p-3 text-sm text-blue-700">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Parsing dataset…</span>
      </div>
    );
  }

  if (state.status === "error" && state.error) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        <XCircle className="h-4 w-4" />
        <div>
          <p className="font-medium">Parse error</p>
          <p>{state.error}</p>
        </div>
      </div>
    );
  }

  if (loadingExisting) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-muted p-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading existing Firestore data…</span>
      </div>
    );
  }

  if (state.status === "ready") {
    return (
      <div className="grid gap-2 rounded-md border border-brand-primary/10 bg-brand-primary/5 p-3 text-sm">
        <p className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          {hasChanges
            ? `${state.diff?.added.length ?? 0} added / ${state.diff?.updated.length ?? 0} updated / ${state.diff?.removed.length ?? 0} removed`
            : "No changes detected"}
        </p>
        <p className="text-xs text-muted-foreground">Existing documents: {existingCount}</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-muted p-3 text-sm text-muted-foreground">
      Ready for upload. Existing documents: {existingCount}
    </div>
  );
}

function DiffPreview<T extends object>({
  datasetKey,
  state,
}: {
  datasetKey: DatasetKey;
  state: DatasetState<T>;
}) {
  if (!state.diff || state.status !== "ready") {
    return (
      <div className="rounded-md border border-dashed border-muted-foreground/40 p-4 text-sm text-muted-foreground">
        Upload a dataset to preview changes.
      </div>
    );
  }

  const { diff } = state;

  return (
    <div className="space-y-4">
      <DiffList
        title="Added"
        emptyLabel="No new documents"
        datasetKey={datasetKey}
        items={diff.added.map(({ id, record }) => ({ id, record }))}
      />
      <DiffList
        title="Updated"
        emptyLabel="No updates"
        datasetKey={datasetKey}
        items={diff.updated.map(({ id, record }) => ({ id, record }))}
      />
      <DiffList
        title="Removed"
        emptyLabel="No deletions"
        datasetKey={datasetKey}
        items={diff.removed.map(({ id, record }) => ({ id, record }))}
      />
    </div>
  );
}

function DiffList<T extends object>({
  title,
  emptyLabel,
  datasetKey,
  items,
}: {
  title: string;
  emptyLabel: string;
  datasetKey: DatasetKey;
  items: Array<{ id: string; record: T }>;
}) {
  if (items.length === 0) {
    return (
      <div className="space-y-2">
        <h4 className="text-sm font-medium">{title}</h4>
        <p className="text-xs text-muted-foreground">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">
        {title} <span className="text-muted-foreground">({items.length})</span>
      </h4>
      <ul className="space-y-2 text-xs">
        {items.slice(0, MAX_PREVIEW).map(({ id, record }) => (
          <li
            key={id}
            className="rounded border border-brand-primary/10 bg-white p-2 shadow-sm"
          >
            <p className="font-medium">{id}</p>
            <p className="text-muted-foreground">
              {formatSummary(datasetKey, record as MajorRecord | CourseRecord | SectionRecord)}
            </p>
          </li>
        ))}
        {items.length > MAX_PREVIEW && (
          <li className="text-muted-foreground">…and {items.length - MAX_PREVIEW} more</li>
        )}
      </ul>
    </div>
  );
}

function IntegrityPanel({
  ready,
  issues,
  summary,
}: {
  ready: boolean;
  issues: IntegrityIssue[];
  summary: { errors: IntegrityIssue[]; warnings: IntegrityIssue[] };
}) {
  if (!ready) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Integrity Check</CardTitle>
          <CardDescription>
            Upload majors, courses, and sections datasets to enable integrity validation.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Integrity Check</CardTitle>
        <CardDescription>
          Validates course references, prerequisite relationships, meeting windows, and linked sections before applying.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            {summary.errors.length === 0 ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <AlertCircle className="h-4 w-4 text-red-600" />
            )}
            <span className={summary.errors.length === 0 ? "text-emerald-600" : "text-red-600"}>
              {summary.errors.length} errors
            </span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <AlertCircle className="h-4 w-4" />
            <span>{summary.warnings.length} warnings</span>
          </div>
        </div>

        {issues.length === 0 ? (
          <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            <span>All integrity checks passed. You are ready to apply changes.</span>
          </div>
        ) : (
          <ul className="space-y-2 text-sm">
            {issues.map((issue, index) => (
              <li
                key={index}
                className={`flex items-start gap-2 rounded-md border p-3 ${
                  issue.type === "error"
                    ? "border-red-200 bg-red-50 text-red-700"
                    : "border-amber-200 bg-amber-50 text-amber-700"
                }`}
              >
                <AlertCircle className="mt-0.5 h-4 w-4" />
                <span>{issue.message}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

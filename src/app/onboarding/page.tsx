"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  Loader2,
  MapPin,
  WifiOff,
} from "lucide-react";
import {
  collection,
  doc,
  getDocs,
  setDoc,
} from "firebase/firestore";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { getFirebaseFirestore } from "@/lib/firebase";
import {
  courseSchema,
  majorSchema,
  sectionSchema,
  termSchema,
  type CourseRecord,
  type MajorRecord,
  type SectionRecord,
  type TermRecord,
} from "@/lib/etl/parsers";
import {
  loadCatalogCache,
  saveCatalogCache,
  setOfflineMode,
  useOfflineMode,
} from "@/lib/catalogCache";
import { cn } from "@/lib/utils";
import type {
  Day,
  Preferences,
  ProtectedBlock,
  StudentProfile,
  TimeString,
} from "@/types/catalog";

interface QuizResponses {
  likert: Record<string, number>;
  traits: Record<string, string[]>;
}

type LikertQuestion = {
  id: string;
  type: "likert";
  prompt: string;
  helper?: string;
  tagWeights: Record<string, number>;
};

type TraitOption = {
  id: string;
  label: string;
  description?: string;
  tagWeights: Record<string, number>;
};

type TraitQuestion = {
  id: string;
  type: "traits";
  prompt: string;
  pick: number;
  options: TraitOption[];
};

type QuizQuestion = LikertQuestion | TraitQuestion;

const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: "likert-strategy",
    type: "likert",
    prompt: "I enjoy tackling ambiguous problems with no clear solution.",
    helper: "Think consulting cases or strategic challenges.",
    tagWeights: { Strategy: 1, Leadership: 0.4 },
  },
  {
    id: "likert-quant",
    type: "likert",
    prompt: "Working with data and quantitative models energizes me.",
    tagWeights: { Quant: 1 },
  },
  {
    id: "likert-leadership",
    type: "likert",
    prompt: "I naturally step up to organize and motivate a team.",
    tagWeights: { Leadership: 1, Strategy: 0.3 },
  },
  {
    id: "likert-design",
    type: "likert",
    prompt: "Designing user experiences or visual systems excites me.",
    tagWeights: { Design: 1 },
  },
  {
    id: "likert-ethics",
    type: "likert",
    prompt: "Ethical considerations play a major role in my decisions.",
    tagWeights: { Ethics: 1 },
  },
  {
    id: "likert-ops",
    type: "likert",
    prompt: "I like streamlining processes to make things run efficiently.",
    tagWeights: { Strategy: 0.5, Quant: 0.5 },
  },
  {
    id: "traits-team",
    type: "traits",
    prompt: "Pick two traits that best describe your role on a team.",
    pick: 2,
    options: [
      {
        id: "visionary",
        label: "Visionary",
        description: "Sets direction and long-term goals",
        tagWeights: { Strategy: 0.6, Leadership: 0.4 },
      },
      {
        id: "analyst",
        label: "Analytical",
        description: "Digs into numbers and evidence",
        tagWeights: { Quant: 0.7, Strategy: 0.3 },
      },
      {
        id: "facilitator",
        label: "Facilitator",
        description: "Keeps the group aligned and motivated",
        tagWeights: { Leadership: 0.7, Ethics: 0.3 },
      },
      {
        id: "designer",
        label: "Designer",
        description: "Shapes experiences and interfaces",
        tagWeights: { Design: 0.8 },
      },
      {
        id: "advocate",
        label: "Advocate",
        description: "Centers values and social impact",
        tagWeights: { Ethics: 0.7, Leadership: 0.3 },
      },
    ],
  },
  {
    id: "traits-workstyle",
    type: "traits",
    prompt: "Pick two phrases that capture your work style.",
    pick: 2,
    options: [
      {
        id: "structured",
        label: "Structured & organized",
        tagWeights: { Quant: 0.4, Strategy: 0.4 },
      },
      {
        id: "experimental",
        label: "Experimental & iterative",
        tagWeights: { Design: 0.6, Strategy: 0.3 },
      },
      {
        id: "people-first",
        label: "People-first collaborator",
        tagWeights: { Leadership: 0.5, Ethics: 0.4 },
      },
      {
        id: "data-driven",
        label: "Data-driven decision maker",
        tagWeights: { Quant: 0.7 },
      },
      {
        id: "mission",
        label: "Mission-driven advocate",
        tagWeights: { Ethics: 0.7 },
      },
    ],
  },
  {
    id: "traits-extracurricular",
    type: "traits",
    prompt: "How do you spend free time? Pick two that resonate most.",
    pick: 2,
    options: [
      {
        id: "case-club",
        label: "Business case competitions",
        tagWeights: { Strategy: 0.6, Leadership: 0.4 },
      },
      {
        id: "build-things",
        label: "Building side projects",
        tagWeights: { Design: 0.5, Quant: 0.4 },
      },
      {
        id: "volunteer",
        label: "Community volunteering",
        tagWeights: { Ethics: 0.7, Leadership: 0.3 },
      },
      {
        id: "finance-club",
        label: "Investment & finance clubs",
        tagWeights: { Quant: 0.6, Strategy: 0.3 },
      },
      {
        id: "creative-arts",
        label: "Creative arts & design",
        tagWeights: { Design: 0.7 },
      },
    ],
  },
  {
    id: "likert-learning",
    type: "likert",
    prompt: "I prefer coursework that challenges me to learn new frameworks quickly.",
    tagWeights: { Strategy: 0.5, Quant: 0.3, Design: 0.2 },
  },
];

const FALLBACK_MAJORS: MajorRecord[] = [
  {
    id: "business-admin",
    name: "Business Administration BS",
    catalogYear: "2026-2027",
    requirementGroups: [],
  },
  {
    id: "cs-bs",
    name: "Computer Science BS",
    catalogYear: "2026-2027",
    requirementGroups: [],
  },
];

const FALLBACK_COURSES: CourseRecord[] = [
  {
    id: "BUS-210",
    code: "BUS 210",
    title: "Operations Management",
    credits: 3,
    genEdTags: ["SOC"],
    prereqs: [],
    equivalents: [],
    tags: ["Business"],
    level: 200,
  },
  {
    id: "BUS-320",
    code: "BUS 320",
    title: "Strategic Management",
    credits: 3,
    genEdTags: [],
    prereqs: ["BUS-210"],
    equivalents: [],
    tags: ["Business"],
    level: 300,
  },
  {
    id: "CS-210",
    code: "CS 210",
    title: "Algorithms",
    credits: 4,
    genEdTags: [],
    prereqs: ["CS-120"],
    equivalents: [],
    tags: ["Computer Science"],
    level: 300,
  },
  {
    id: "CS-230",
    code: "CS 230",
    title: "Software Engineering",
    credits: 3,
    genEdTags: [],
    prereqs: ["CS-120"],
    equivalents: [],
    tags: ["Computer Science"],
    level: 300,
  },
];

const DAYS: Day[] = ["M", "T", "W", "R", "F"];
const TIME_SLOTS: TimeString[] = Array.from({ length: 14 }, (_, index) => {
  const hour = 7 + index;
  return `${hour.toString().padStart(2, "0")}:00` as TimeString;
});

const defaultPreferences: Preferences = {
  earliest: "08:00",
  latest: "18:00",
  daysOff: [],
  protectedBlocks: [],
  targetCredits: 15,
  minBreakMins: 15,
  avoidProfIds: [],
  preferProfIds: [],
  density: "compact",
  fridays: "neutral",
};

const defaultQuizResponses: QuizResponses = { likert: {}, traits: {} };

const INITIAL_PROFILE: StudentProfile = {
  id: "demo-student",
  name: "",
  majorIds: [],
  catalogYear: "",
  completedCourseIds: [],
  preferences: defaultPreferences,
  interestTags: {},
};

function calculateInterestTags(responses: QuizResponses): Record<string, number> {
  const totals: Record<string, number> = {};

  const addScore = (tag: string, value: number) => {
    totals[tag] = (totals[tag] ?? 0) + value;
  };

  for (const question of QUIZ_QUESTIONS) {
    if (question.type === "likert") {
      const response = responses.likert[question.id];
      if (!response) continue;
      const normalized = (response - 1) / 4;
      for (const [tag, weight] of Object.entries(question.tagWeights)) {
        addScore(tag, normalized * weight);
      }
    } else {
      const selected = responses.traits[question.id] ?? [];
      for (const optionId of selected) {
        const option = question.options.find((item) => item.id === optionId);
        if (!option) continue;
        for (const [tag, weight] of Object.entries(option.tagWeights)) {
          addScore(tag, weight);
        }
      }
    }
  }

  const scores = Object.entries(totals);
  if (scores.length === 0) return {};
  const maxScore = Math.max(...scores.map(([, value]) => value));
  if (maxScore === 0) return {};

  const normalized: Record<string, number> = {};
  for (const [tag, value] of scores) {
    normalized[tag] = parseFloat((value / maxScore).toFixed(2));
  }
  return normalized;
}

function formatTimeRange(start: TimeString, end: TimeString) {
  return `${start} – ${end}`;
}

function timeToMinutes(time: TimeString): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function addHours(time: TimeString, hours: number): TimeString {
  const totalMinutes = timeToMinutes(time) + hours * 60;
  const h = Math.floor(totalMinutes / 60)
    .toString()
    .padStart(2, "0");
  return `${h}:00` as TimeString;
}

function dedupeAndSortStrings(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

export default function OnboardingPage() {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [profile, setProfile] = useState<StudentProfile>(INITIAL_PROFILE);
  const [quizResponses, setQuizResponses] = useState<QuizResponses>(defaultQuizResponses);
  const [majors, setMajors] = useState<MajorRecord[]>([]);
  const [courses, setCourses] = useState<CourseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [autoDemoLoaded, setAutoDemoLoaded] = useState(false);
  const offlineMode = useOfflineMode();
  const searchParams = useSearchParams();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        const db = getFirebaseFirestore();
        const [majorsSnapshot, coursesSnapshot, sectionsSnapshot, termsSnapshot] = await Promise.all([
          getDocs(collection(db, "majors")),
          getDocs(collection(db, "courses")),
          getDocs(collection(db, "sections")),
          getDocs(collection(db, "terms")),
        ]);

        const loadedMajors: MajorRecord[] = majorsSnapshot.docs.map((docSnap) =>
          majorSchema.parse({ id: docSnap.id, ...docSnap.data() })
        );
        const loadedCourses: CourseRecord[] = coursesSnapshot.docs.map((docSnap) =>
          courseSchema.parse({ id: docSnap.id, ...docSnap.data() })
        );
        const loadedSections: SectionRecord[] = sectionsSnapshot.docs.map((docSnap) =>
          sectionSchema.parse({ id: docSnap.id, ...docSnap.data() })
        );
        const loadedTerms: TermRecord[] = termsSnapshot.docs.map((docSnap) =>
          termSchema.parse({ id: docSnap.id, ...docSnap.data() })
        );

        if (!isMounted) return;

        const majorsResult = loadedMajors.length > 0 ? loadedMajors : FALLBACK_MAJORS;
        const coursesResult = loadedCourses.length > 0 ? loadedCourses : FALLBACK_COURSES;

        setMajors(majorsResult);
        setCourses(coursesResult);

        if (loadedMajors.length > 0 && loadedCourses.length > 0) {
          setOfflineMode(false);
          void saveCatalogCache({
            majors: loadedMajors,
            courses: loadedCourses,
            sections: loadedSections,
            terms: loadedTerms,
            fetchedAt: Date.now(),
          });
        } else {
          setOfflineMode(true);
        }

        if (!profile.catalogYear) {
          const catalogYear = dedupeAndSortStrings(
            majorsResult.map((major) => major.catalogYear)
          )[0];
          if (catalogYear) {
            setProfile((prev) => ({ ...prev, catalogYear }));
          }
        }
      } catch (error) {
        console.error(error);
        const cached = await loadCatalogCache();
        if (isMounted) {
          if (cached) {
            setMajors(cached.majors.length > 0 ? cached.majors : FALLBACK_MAJORS);
            setCourses(cached.courses.length > 0 ? cached.courses : FALLBACK_COURSES);
            setOfflineMode(true);
            setLoadError(null);
          } else {
            setMajors(FALLBACK_MAJORS);
            setCourses(FALLBACK_COURSES);
            setOfflineMode(true);
            setLoadError(
              error instanceof Error ? error.message : "Unable to load catalog data from Firebase."
            );
          }
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const catalogYears = useMemo(
    () =>
      dedupeAndSortStrings(
        majors.map((major) => major.catalogYear).concat(profile.catalogYear ? [profile.catalogYear] : [])
      ),
    [majors, profile.catalogYear]
  );

  const quizCompletion = useMemo(() => {
    let answered = 0;
    for (const question of QUIZ_QUESTIONS) {
      if (question.type === "likert") {
        if (quizResponses.likert[question.id]) answered += 1;
      } else {
        if ((quizResponses.traits[question.id] ?? []).length === question.pick) {
          answered += 1;
        }
      }
    }
    return answered / QUIZ_QUESTIONS.length;
  }, [quizResponses]);

  const projectedInterestTags = useMemo(
    () => calculateInterestTags(quizResponses),
    [quizResponses]
  );

  const canProceed = useMemo(() => {
    if (stepIndex === 0) {
      return (
        profile.id.trim().length > 0 &&
        profile.name.trim().length > 0 &&
        profile.catalogYear.trim().length > 0 &&
        profile.majorIds.length > 0
      );
    }
    if (stepIndex === 1) {
      return QUIZ_QUESTIONS.every((question) => {
        if (question.type === "likert") {
          return Boolean(quizResponses.likert[question.id]);
        }
        return (quizResponses.traits[question.id] ?? []).length === question.pick;
      });
    }
    return true;
  }, [profile, quizResponses, stepIndex]);

  const handleLoadDemo = useCallback(() => {
    const majorSource = majors.length > 0 ? majors : FALLBACK_MAJORS;
    const courseSource = courses.length > 0 ? courses : FALLBACK_COURSES;
    const sampleMajors = majorSource.slice(0, 2).map((major) => major.id);
    const sampleCourses = courseSource.slice(0, 4).map((course) => course.id);
    const demoResponses: QuizResponses = {
      likert: {
        "likert-strategy": 5,
        "likert-quant": 4,
        "likert-leadership": 4,
        "likert-design": 3,
        "likert-ethics": 4,
        "likert-ops": 5,
        "likert-learning": 5,
      },
      traits: {
        "traits-team": ["visionary", "analyst"],
        "traits-workstyle": ["structured", "data-driven"],
        "traits-extracurricular": ["case-club", "finance-club"],
      },
    };

    setQuizResponses(demoResponses);

    setProfile((prev) => ({
      ...prev,
      id: "demo-student",
      name: "Jordan Rivera",
      majorIds: sampleMajors.length ? sampleMajors : prev.majorIds,
      minorIds: [],
      catalogYear:
        prev.catalogYear ||
        dedupeAndSortStrings(majorSource.map((major) => major.catalogYear))[0] ||
        "2026-2027",
      completedCourseIds: sampleCourses,
      transferCredits: 6,
      preferences: {
        ...prev.preferences,
        earliest: "09:00",
        latest: "16:00",
        daysOff: ["F"],
        targetCredits: 15,
        minBreakMins: 20,
        density: "compact",
        fridays: "avoid",
        protectedBlocks: [
          { day: "M", start: "16:00", end: "18:00", label: "Work shift" },
          { day: "W", start: "07:00", end: "08:00", label: "Gym" },
        ],
        preferProfIds: ["prof-sanchez"],
        avoidProfIds: ["prof-taylor"],
      },
      interestTags: calculateInterestTags(demoResponses),
    }));
  }, [courses, majors]);

  useEffect(() => {
    if (autoDemoLoaded) return;
    const demoParam = searchParams.get("demo");
    if (!demoParam) return;
    if (majors.length === 0 || courses.length === 0) return;
    const normalized = demoParam.toLowerCase();
    if (normalized === "0" || normalized === "false") {
      setAutoDemoLoaded(true);
      return;
    }
    handleLoadDemo();
    setAutoDemoLoaded(true);
  }, [autoDemoLoaded, courses.length, handleLoadDemo, majors.length, searchParams]);

  const handleNext = () => {
    if (stepIndex < 2 && canProceed) {
      setStepIndex((index) => index + 1);
    }
  };

  const handleBack = () => {
    if (stepIndex > 0) {
      setStepIndex((index) => index - 1);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);

    try {
      const db = getFirebaseFirestore();
      const interestTags = calculateInterestTags(quizResponses);
      const payload: StudentProfile = {
        ...profile,
        interestTags,
        preferences: {
          ...profile.preferences,
          daysOff: profile.preferences.daysOff ?? [],
          protectedBlocks: profile.preferences.protectedBlocks ?? [],
          avoidProfIds: profile.preferences.avoidProfIds ?? [],
          preferProfIds: profile.preferences.preferProfIds ?? [],
        },
      };

      await setDoc(doc(db, "students", payload.id), payload);
      router.push("/planner");
    } catch (error) {
      console.error(error);
      setSaveError(
        error instanceof Error ? error.message : "Unable to save profile. Try again."
      );
      setSaving(false);
    }
  };

  if (!isMounted) {
    return null;
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-6 py-10">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Let’s build your Advisorly profile</h1>
          <p className="text-sm text-muted-foreground">
            Three quick steps: degree details, interest quiz, and scheduling preferences.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {offlineMode && (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-warn/25 px-3 py-1 text-xs font-semibold text-brand-text">
              <WifiOff className="h-3 w-3" /> Demo Catalog (offline)
            </span>
          )}
          <Button variant="outline" onClick={handleLoadDemo} disabled={loading}>
            <Check className="mr-2 h-4 w-4" /> Load Demo Profile
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader className="flex flex-col gap-2 border-b border-brand-primary/20 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Step {stepIndex + 1} of 3
            </p>
            <CardTitle>
              {stepIndex === 0 && "Degree & Progress"}
              {stepIndex === 1 && "Interests Quiz"}
              {stepIndex === 2 && "Schedule Preferences"}
            </CardTitle>
            <CardDescription>
              {stepIndex === 0 &&
                "Tell us about your program, catalog year, and finished courses."}
              {stepIndex === 1 &&
                "Help Advisorly tailor electives with a quick personality + interest check."}
              {stepIndex === 2 &&
                "Lock in timing constraints, protected commitments, and instructor preferences."}
            </CardDescription>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {loadError ? (
              <span className="text-red-600">{loadError}</span>
            ) : loading ? (
              <span className="flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading catalog…
              </span>
            ) : offlineMode ? (
              <span className="flex items-center gap-1 text-brand-text">
                <WifiOff className="h-3 w-3" /> Demo Catalog (offline)
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <CalendarClock className="h-3 w-3" /> Catalog ready
              </span>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {stepIndex === 0 && (
            <StepDegree
              majors={majors}
              courses={courses}
              catalogYears={catalogYears}
              profile={profile}
              onProfileChange={setProfile}
            />
          )}

          {stepIndex === 1 && (
            <StepQuiz
              responses={quizResponses}
              onResponsesChange={setQuizResponses}
              interestPreview={projectedInterestTags}
            />
          )}

          {stepIndex === 2 && (
            <StepPreferences profile={profile} onProfileChange={setProfile} />
          )}

          {saveError && stepIndex === 2 && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {saveError}
            </div>
          )}
        </CardContent>

        <footer className="flex flex-col gap-3 border-t border-brand-primary/20 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-muted-foreground">
            {stepIndex === 1 && (
              <span>{Math.round(quizCompletion * 100)}% of quiz complete</span>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={handleBack} disabled={stepIndex === 0 || saving}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            {stepIndex < 2 && (
              <Button onClick={handleNext} disabled={!canProceed || saving}>
                Next <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
            {stepIndex === 2 && (
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
                  </>
                ) : (
                  "Save & View Planner"
                )}
              </Button>
            )}
          </div>
        </footer>
      </Card>
    </main>
  );
}

type StepDegreeProps = {
  majors: MajorRecord[];
  courses: CourseRecord[];
  catalogYears: string[];
  profile: StudentProfile;
  onProfileChange: React.Dispatch<React.SetStateAction<StudentProfile>>;
};

function StepDegree({ majors, courses, catalogYears, profile, onProfileChange }: StepDegreeProps) {
  const [courseSearch, setCourseSearch] = useState("");

  const filteredCourses = useMemo(() => {
    if (!courseSearch.trim()) return courses.slice(0, 12);
    const needle = courseSearch.toLowerCase();
    return courses
      .filter(
        (course) =>
          course.code.toLowerCase().includes(needle) ||
          course.title.toLowerCase().includes(needle)
      )
      .slice(0, 20);
  }, [courseSearch, courses]);

  const selectedCourses = useMemo(
    () => courses.filter((course) => profile.completedCourseIds.includes(course.id)),
    [courses, profile.completedCourseIds]
  );

  const toggleCourse = (courseId: string) => {
    onProfileChange((prev) => {
      const exists = prev.completedCourseIds.includes(courseId);
      const nextCourses = exists
        ? prev.completedCourseIds.filter((id) => id !== courseId)
        : [...prev.completedCourseIds, courseId];
      return { ...prev, completedCourseIds: nextCourses };
    });
  };

  const toggleMajor = (majorId: string) => {
    onProfileChange((prev) => {
      const exists = prev.majorIds.includes(majorId);
      const nextMajors = exists
        ? prev.majorIds.filter((id) => id !== majorId)
        : [...prev.majorIds, majorId];
      return { ...prev, majorIds: nextMajors };
    });
  };

  const toggleMinor = (majorId: string) => {
    onProfileChange((prev) => {
      const current = prev.minorIds ?? [];
      const exists = current.includes(majorId);
      const nextMinors = exists
        ? current.filter((id) => id !== majorId)
        : [...current, majorId];
      return { ...prev, minorIds: nextMinors };
    });
  };

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium">Preferred student ID</label>
          <Input
            value={profile.id}
            onChange={(event) =>
              onProfileChange((prev) => ({ ...prev, id: event.target.value }))
            }
            placeholder="e.g. jriviera27"
          />
          <p className="text-xs text-muted-foreground">
            Advisorly stores your profile at students/&lt;id&gt;. Use something memorable.
          </p>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Your name</label>
          <Input
            value={profile.name}
            onChange={(event) =>
              onProfileChange((prev) => ({ ...prev, name: event.target.value }))
            }
            placeholder="Jordan Rivera"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Catalog year</label>
          <select
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={profile.catalogYear}
            onChange={(event) =>
              onProfileChange((prev) => ({ ...prev, catalogYear: event.target.value }))
            }
          >
            <option value="" disabled>
              Select catalog year
            </option>
            {catalogYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Transfer credits (optional)</label>
          <Input
            type="number"
            min={0}
            value={profile.transferCredits ?? ""}
            onChange={(event) =>
              onProfileChange((prev) => ({
                ...prev,
                transferCredits:
                  event.target.value === "" ? undefined : Number(event.target.value),
              }))
            }
            placeholder="0"
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Majors
        </h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {majors.map((major) => {
            const selected = profile.majorIds.includes(major.id);
            return (
              <label
                key={major.id}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border bg-white p-3 text-sm shadow-sm transition",
                  selected ? "border-primary" : "border-brand-primary/10 hover:border-primary/60"
                )}
              >
                <Checkbox
                  checked={selected}
                  onCheckedChange={() => toggleMajor(major.id)}
                  className="mt-0.5"
                />
                <div>
                  <p className="font-medium">{major.name}</p>
                  <p className="text-xs text-muted-foreground">Catalog {major.catalogYear}</p>
                </div>
              </label>
            );
          })}
        </div>
        {profile.majorIds.length === 0 && (
          <p className="text-xs text-red-600">Select at least one major to continue.</p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Minors (optional)
        </h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {majors.map((major) => {
            const selected = (profile.minorIds ?? []).includes(major.id);
            return (
              <label
                key={`minor-${major.id}`}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border bg-white p-3 text-sm shadow-sm transition",
                  selected ? "border-primary" : "border-brand-primary/10 hover:border-primary/60"
                )}
              >
                <Checkbox
                  checked={selected}
                  onCheckedChange={() => toggleMinor(major.id)}
                  className="mt-0.5"
                />
                <div>
                  <p className="font-medium">{major.name}</p>
                  <p className="text-xs text-muted-foreground">Catalog {major.catalogYear}</p>
                </div>
              </label>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Completed courses
          </h2>
          <span className="text-xs text-muted-foreground">
            {profile.completedCourseIds.length} selected
          </span>
        </div>
        <div className="space-y-3 rounded-lg border border-brand-primary/10 bg-brand-primary/5 p-3">
          <Input
            value={courseSearch}
            onChange={(event) => setCourseSearch(event.target.value)}
            placeholder="Search by code or title"
          />
          <div className="flex flex-wrap gap-2">
            {selectedCourses.map((course) => (
              <button
                type="button"
                key={`selected-${course.id}`}
                className="flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs text-primary hover:bg-primary/20"
                onClick={() => toggleCourse(course.id)}
              >
                {course.code}
                <span className="text-[10px] uppercase">✕</span>
              </button>
            ))}
            {selectedCourses.length === 0 && (
              <span className="text-xs text-muted-foreground">No courses selected yet.</span>
            )}
          </div>
          <div className="max-h-48 overflow-y-auto rounded-md border bg-white">
            {filteredCourses.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">No matches found.</p>
            ) : (
              filteredCourses.map((course) => {
                const selected = profile.completedCourseIds.includes(course.id);
                return (
                  <button
                    key={course.id}
                    type="button"
                    className={cn(
                      "flex w-full items-center justify-between border-b border-brand-primary/10 px-3 py-2 text-left text-sm hover:bg-brand-primary/5",
                      selected && "bg-primary/10 hover:bg-primary/20"
                    )}
                    onClick={() => toggleCourse(course.id)}
                  >
                    <span className="font-medium">{course.code}</span>
                    <span className="ml-3 flex-1 truncate text-xs text-muted-foreground">
                      {course.title}
                    </span>
                  </button>
                );
              })
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Completed courses help Advisorly avoid duplicates and unlock advanced electives.
          </p>
        </div>
      </section>
    </div>
  );
}

type StepQuizProps = {
  responses: QuizResponses;
  onResponsesChange: React.Dispatch<React.SetStateAction<QuizResponses>>;
  interestPreview: Record<string, number>;
};

function StepQuiz({ responses, onResponsesChange, interestPreview }: StepQuizProps) {
  const likeScale = [1, 2, 3, 4, 5];

  const handleLikertChange = (questionId: string, value: number) => {
    onResponsesChange((prev) => ({
      ...prev,
      likert: { ...prev.likert, [questionId]: value },
    }));
  };

  const handleTraitToggle = (questionId: string, optionId: string, maxPick: number) => {
    onResponsesChange((prev) => {
      const current = prev.traits[questionId] ?? [];
      const exists = current.includes(optionId);
      if (exists) {
        return {
          ...prev,
          traits: {
            ...prev.traits,
            [questionId]: current.filter((id) => id !== optionId),
          },
        };
      }
      if (current.length >= maxPick) {
        return prev;
      }
      return {
        ...prev,
        traits: {
          ...prev.traits,
          [questionId]: [...current, optionId],
        },
      };
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        {QUIZ_QUESTIONS.map((question) => (
          <Card key={question.id} className="border-brand-primary/10">
            <CardHeader className="space-y-1">
              <CardTitle className="text-base font-semibold">
                {question.prompt}
              </CardTitle>
              {question.type === "likert" && (
                <CardDescription>
                  {question.helper ?? "1 = strongly disagree, 5 = strongly agree"}
                </CardDescription>
              )}
              {question.type === "traits" && (
                <CardDescription>
                  Choose {question.pick}. Selected: {(responses.traits[question.id] ?? []).length}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              {question.type === "likert" ? (
                <div className="flex gap-2">
                  {likeScale.map((value) => {
                    const selected = responses.likert[question.id] === value;
                    return (
                      <Button
                        key={value}
                        variant={selected ? "default" : "outline"}
                        onClick={() => handleLikertChange(question.id, value)}
                        className="flex-1"
                      >
                        {value}
                      </Button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {question.options.map((option) => {
                    const selected = (responses.traits[question.id] ?? []).includes(option.id);
                    return (
                      <Button
                        key={option.id}
                        variant={selected ? "default" : "outline"}
                        onClick={() => handleTraitToggle(question.id, option.id, question.pick)}
                        className="justify-start"
                      >
                        <div className="text-left">
                          <p className="text-sm font-medium">{option.label}</p>
                          {option.description && (
                            <p className="text-xs text-muted-foreground">{option.description}</p>
                          )}
                        </div>
                      </Button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="rounded-lg border border-brand-primary/10 bg-brand-primary/5 p-4 text-sm">
        <p className="font-medium">Live interest profile preview</p>
        {Object.keys(interestPreview).length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Answer questions to visualize your interest weighting.
          </p>
        ) : (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {Object.entries(interestPreview).map(([tag, score]) => (
              <div key={tag} className="rounded-md bg-white p-3 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{tag}</p>
                <div className="mt-2 h-2 rounded-full bg-brand-primary/10">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.round(score * 100)}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Weight {Math.round(score * 100)}%
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

type StepPreferencesProps = {
  profile: StudentProfile;
  onProfileChange: React.Dispatch<React.SetStateAction<StudentProfile>>;
};

function StepPreferences({ profile, onProfileChange }: StepPreferencesProps) {
  const preferences = profile.preferences;
  const daysOff = preferences.daysOff ?? [];
  const avoidProfIds = preferences.avoidProfIds ?? [];
  const preferProfIds = preferences.preferProfIds ?? [];
  const protectedBlocks = preferences.protectedBlocks ?? [];

  const updatePreference = <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    onProfileChange((prev) => ({
      ...prev,
      preferences: {
        ...prev.preferences,
        [key]: value,
      },
    }));
  };

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium">Earliest class</label>
          <Input
            type="time"
            value={preferences.earliest ?? "08:00"}
            onChange={(event) =>
              updatePreference("earliest", event.target.value as TimeString)
            }
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Latest class</label>
          <Input
            type="time"
            value={preferences.latest ?? "18:00"}
            onChange={(event) => updatePreference("latest", event.target.value as TimeString)}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Target credits</label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={9}
              max={21}
              value={preferences.targetCredits ?? 15}
              onChange={(event) => updatePreference("targetCredits", Number(event.target.value))}
            />
            <span className="text-sm font-semibold">{preferences.targetCredits ?? 15}</span>
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Minimum break between classes (minutes)</label>
          <Input
            type="number"
            min={0}
            value={preferences.minBreakMins ?? 15}
            onChange={(event) =>
              updatePreference(
                "minBreakMins",
                event.target.value === "" ? undefined : Number(event.target.value)
              )
            }
          />
        </div>
      </section>

      <section className="space-y-2">
        <label className="text-sm font-medium">Days you’d like to keep free</label>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((day) => {
            const selected = daysOff.includes(day);
            return (
              <Button
                key={day}
                variant={selected ? "default" : "outline"}
                onClick={() => {
                  const nextDays = selected
                    ? daysOff.filter((value) => value !== day)
                    : [...daysOff, day];
                  updatePreference("daysOff", nextDays);
                }}
              >
                {day}
              </Button>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Protected time blocks</h2>
        </div>
        <ProtectedBlocksEditor
          blocks={protectedBlocks}
          onChange={(blocks) => updatePreference("protectedBlocks", blocks)}
        />
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <label className="text-sm font-medium">Class density</label>
          <div className="flex gap-2">
            {(["compact", "spread"] as const).map((option) => (
              <Button
                key={option}
                variant={preferences.density === option ? "default" : "outline"}
                onClick={() => updatePreference("density", option)}
                className="flex-1"
              >
                {option === "compact" ? "Compact" : "Spread"}
              </Button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Friday preference</label>
          <div className="flex gap-2">
            {(["avoid", "neutral", "prefer"] as const).map((option) => (
              <Button
                key={option}
                variant={preferences.fridays === option ? "default" : "outline"}
                onClick={() => updatePreference("fridays", option)}
                className="flex-1"
              >
                {option.charAt(0).toUpperCase() + option.slice(1)}
              </Button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Professor preferences</label>
          <p className="text-xs text-muted-foreground">
            Use the fields below to avoid or prioritize professors.
          </p>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-sm font-medium">Professors to avoid</label>
          <textarea
            className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            rows={3}
            placeholder="One per line or comma separated"
            value={avoidProfIds.join("\n")}
            onChange={(event) =>
              updatePreference(
                "avoidProfIds",
                event.target.value
                  .split(/[\n,]+/)
                  .map((token) => token.trim())
                  .filter(Boolean)
              )
            }
          />
        </div>
        <div>
          <label className="text-sm font-medium">Professors to prioritize</label>
          <textarea
            className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            rows={3}
            placeholder="One per line or comma separated"
            value={preferProfIds.join("\n")}
            onChange={(event) =>
              updatePreference(
                "preferProfIds",
                event.target.value
                  .split(/[\n,]+/)
                  .map((token) => token.trim())
                  .filter(Boolean)
              )
            }
          />
        </div>
      </section>
    </div>
  );
}

type ProtectedBlocksEditorProps = {
  blocks: ProtectedBlock[];
  onChange: (blocks: ProtectedBlock[]) => void;
};

function ProtectedBlocksEditor({ blocks, onChange }: ProtectedBlocksEditorProps) {
  const [dragState, setDragState] = useState<{
    day: Day;
    startIndex: number;
    currentIndex: number;
  } | null>(null);

  useEffect(() => {
    const handleMouseUp = () => {
      if (!dragState) return;
      const { day, startIndex, currentIndex } = dragState;
      const minIndex = Math.min(startIndex, currentIndex);
      const maxIndex = Math.max(startIndex, currentIndex);
      const start = TIME_SLOTS[minIndex];
      const end = addHours(TIME_SLOTS[maxIndex], 1);
      const newBlock: ProtectedBlock = {
        day,
        start,
        end,
        label: `Block ${blocks.length + 1}`,
      };
      onChange([...blocks, newBlock]);
      setDragState(null);
    };

    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, [blocks, dragState, onChange]);

  const cellIsActive = (day: Day, slot: TimeString) => {
    const slotStart = timeToMinutes(slot);
    const slotEnd = slotStart + 60;
    return blocks.some((block) => {
      if (block.day !== day) return false;
      return (
        timeToMinutes(block.start) < slotEnd &&
        timeToMinutes(block.end) > slotStart
      );
    });
  };

  const cellIsDragging = (day: Day, index: number) => {
    if (!dragState || dragState.day !== day) return false;
    const minIndex = Math.min(dragState.startIndex, dragState.currentIndex);
    const maxIndex = Math.max(dragState.startIndex, dragState.currentIndex);
    return index >= minIndex && index <= maxIndex;
  };

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg border border-brand-primary/10">
        <div className="grid grid-cols-[72px_repeat(5,_1fr)] bg-brand-primary/10 text-xs font-medium uppercase text-muted-foreground">
          <div className="flex items-center justify-center border-r border-brand-primary/10 px-2 py-2">
            Time
          </div>
          {DAYS.map((day) => (
            <div
              key={`header-${day}`}
              className="flex items-center justify-center border-r border-brand-primary/10 px-2 py-2 last:border-r-0"
            >
              {day}
            </div>
          ))}
        </div>
        {TIME_SLOTS.map((slot, index) => (
          <div
            key={`row-${slot}`}
            className="grid grid-cols-[72px_repeat(5,_1fr)] border-t border-brand-primary/10"
          >
            <div className="flex items-center justify-center border-r border-brand-primary/10 px-2 py-3 text-xs">
              {slot}
            </div>
            {DAYS.map((day) => (
              <div
                key={`${day}-${slot}`}
                className={cn(
                  "h-full cursor-crosshair border-r border-brand-primary/10 px-2 py-3 text-xs last:border-r-0",
                  cellIsActive(day, slot) && "bg-primary/20",
                  cellIsDragging(day, index) && "bg-primary/40"
                )}
                onMouseDown={() =>
                  setDragState({ day, startIndex: index, currentIndex: index })
                }
                onMouseEnter={() => {
                  setDragState((prev) =>
                    prev && prev.day === day
                      ? { ...prev, currentIndex: index }
                      : prev
                  );
                }}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="space-y-2">
        {blocks.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Drag across the grid to reserve blocks for work, sports, or other commitments.
          </p>
        ) : (
          <ul className="space-y-2">
            {blocks.map((block, index) => (
              <li
                key={`${block.day}-${block.start}-${block.end}-${index}`}
                className="flex flex-col gap-2 rounded-md border border-brand-primary/10 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-medium">
                    {block.label || `Block ${index + 1}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {block.day} · {formatTimeRange(block.start, block.end)}
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Input
                    value={block.label ?? ""}
                    placeholder="Label"
                    onChange={(event) => {
                      const nextBlocks = blocks.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, label: event.target.value }
                          : item
                      );
                      onChange(nextBlocks);
                    }}
                  />
                  <Button
                    variant="ghost"
                    onClick={() => {
                      const nextBlocks = blocks.filter((_, itemIndex) => itemIndex !== index);
                      onChange(nextBlocks);
                    }}
                  >
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

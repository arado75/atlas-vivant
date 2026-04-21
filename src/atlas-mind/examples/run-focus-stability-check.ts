import type { GlobalSummary } from "../decision-global-summary";
import type { AuditIssue, AuditStatus } from "../decision-auditor";
import type { SystemRecommendation } from "../decision-advisor";
import type { RelevantPattern } from "../decision-pattern-relevance";
import { clearDiscourseEngineState, evaluateDiscourse } from "../decision-discourse-engine";
import { getFocusStabilityState } from "../decision-focus-stability";

type FocusCase = {
  label: string;
  summary: GlobalSummary;
};

function makeSummary(input: {
  status: AuditStatus;
  issues: AuditIssue[];
  recommendations: SystemRecommendation[];
  patterns: RelevantPattern[];
}): GlobalSummary {
  return {
    status: input.status,
    overview: {
      totalDecisions: 12,
      counts: {
        ignore: 6,
        log: 3,
        watch: 2,
        flag: 1
      },
      activityLevel: "medium",
      topCities: [
        {
          city: "Paris",
          total: 6,
          significant: 3
        }
      ],
      recentFlagsCount: 1,
      recentWatchesCount: 2
    },
    trends: {
      statusTrend: "stable",
      activityTrend: "stable",
      flagTrend: "stable",
      watchTrend: "stable",
      dominantCityTrend: "stable"
    },
    audit: {
      status: input.status,
      issues: input.issues
    },
    recommendations: {
      status: input.status,
      recommendations: input.recommendations
    },
    topPatterns: input.patterns
  };
}

const summaryFocusInitial = makeSummary({
  status: "alert",
  issues: [
    {
      type: "city_dominance",
      message: "Concentration forte sur Paris."
    }
  ],
  recommendations: [
    {
      type: "review_city_coverage",
      message: "Elargir la couverture des villes.",
      priority: "high"
    }
  ],
  patterns: [
    {
      pattern: ["city_dominance", "review_city_coverage", "alert"],
      count: 3,
      relevanceScore: 3
    }
  ]
});

const summaryFocusMaintained = makeSummary({
  status: "alert",
  issues: [
    {
      type: "city_dominance",
      message: "Concentration forte sur Paris."
    }
  ],
  recommendations: [
    {
      type: "review_city_coverage",
      message: "Elargir la couverture des villes.",
      priority: "high"
    }
  ],
  patterns: [
    {
      pattern: ["city_dominance", "watch_city", "alert"],
      count: 2,
      relevanceScore: 2
    }
  ]
});

const summaryFocusReplaced = makeSummary({
  status: "watch",
  issues: [
    {
      type: "low_activity",
      message: "Activite faible."
    }
  ],
  recommendations: [
    {
      type: "review_flag_threshold",
      message: "Verifier le seuil de flag.",
      priority: "high"
    }
  ],
  patterns: []
});

function runCase(testCase: FocusCase) {
  const before = getFocusStabilityState();
  const evaluation = evaluateDiscourse(testCase.summary);
  const after = getFocusStabilityState();

  console.log(`\n[AtlasMind][FocusStability] ${testCase.label}`);
  console.log("before:", before);
  console.log(
    "currentFocus:",
    evaluation.focus ? `${evaluation.focus.type}:${evaluation.focus.value}` : "none"
  );
  console.log("label:", evaluation.focusStabilityLabel ?? "none");
  console.log("emitted:", evaluation.emitted, "discourseTag:", evaluation.discourseTag);
  console.log("after:", after);
  console.log("text:", evaluation.text);

  return {
    label: testCase.label,
    emitted: evaluation.emitted,
    discourseTag: evaluation.discourseTag,
    focusStabilityLabel: evaluation.focusStabilityLabel ?? null,
    before,
    after,
    text: evaluation.text
  };
}

export function runAtlasMindFocusStabilityCheck() {
  clearDiscourseEngineState();

  const cases: FocusCase[] = [
    {
      label: "premier_focus_emis",
      summary: summaryFocusInitial
    },
    {
      label: "focus_maintenu",
      summary: summaryFocusMaintained
    },
    {
      label: "focus_remplace",
      summary: summaryFocusReplaced
    },
    {
      label: "silence_inchange_1",
      summary: summaryFocusReplaced
    },
    {
      label: "silence_inchange_2",
      summary: summaryFocusReplaced
    },
    {
      label: "rappel_minimal_inchange",
      summary: summaryFocusReplaced
    }
  ];

  const results = cases.map(runCase);

  return {
    firstFocus: results[0],
    maintained: results[1],
    replaced: results[2],
    silence: results[3],
    reminder: results[5],
    allChecks: results
  };
}

import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useRoute, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Loader2,
  ExternalLink,
  FileText,
} from "lucide-react";
import type { BusinessUnit, EvaluationReport, RubricCriteria } from "@shared/schema";

const rubricLabels: Record<string, string> = {
  mission_alignment: "Mission Alignment",
  academic_excellence: "Academic & Life Skills",
  product_pricing: "Product & Pricing Design",
  gtm_community: "GTM & Community",
  ai_scalability: "AI & Scalability",
  financial_model: "Financial Model",
  talent_strategy: "Talent Strategy",
  access_funding: "Access & Funding Pathway",
};

function ScoreBar({ label, score, weight }: { label: string; score: number; weight: number }) {
  const color = score >= 8 ? "bg-emerald-500" : score >= 6 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="space-y-1" data-testid={`score-${label.toLowerCase().replace(/\s/g, "-")}`}>
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{(weight * 100).toFixed(0)}%</span>
          <span className="font-semibold w-8 text-right">{score.toFixed(1)}</span>
        </div>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${score * 10}%` }} />
      </div>
    </div>
  );
}

function RecommendationBadge({ rec }: { rec: string }) {
  const config: Record<string, { label: string; color: string; icon: any }> = {
    APPROVE: { label: "APPROVE", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200", icon: CheckCircle2 },
    REJECT: { label: "REJECT", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200", icon: XCircle },
    APPROVE_WITH_FIX: { label: "APPROVE WITH FIX", color: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200", icon: AlertTriangle },
  };
  const c = config[rec] || config.APPROVE;
  const Icon = c.icon;
  return (
    <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm ${c.color}`} data-testid="badge-recommendation">
      <Icon className="h-5 w-5" />
      {c.label}
    </div>
  );
}

export default function BusinessUnitDetail() {
  const [, params] = useRoute("/bu/:id");
  const buId = params?.id ? parseInt(params.id) : 0;

  const { data: bu, isLoading: buLoading } = useQuery<BusinessUnit>({
    queryKey: ["/api/business-units", buId],
    queryFn: () => apiRequest("GET", `/api/business-units/${buId}`).then((r) => r.json()),
    enabled: buId > 0,
  });

  const { data: evaluation, isLoading: evalLoading } = useQuery<EvaluationReport | null>({
    queryKey: ["/api/business-units", buId, "latest-evaluation"],
    queryFn: async () => {
      try {
        const r = await apiRequest("GET", `/api/business-units/${buId}/latest-evaluation`);
        return await r.json();
      } catch {
        return null;
      }
    },
    enabled: buId > 0,
    retry: false,
  });

  const { data: rubricItems } = useQuery<RubricCriteria[]>({
    queryKey: ["/api/evaluations", evaluation?.id, "rubric"],
    queryFn: () => apiRequest("GET", `/api/evaluations/${evaluation!.id}/rubric`).then((r) => r.json()),
    enabled: !!evaluation?.id,
  });

  if (buLoading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  if (!bu) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Business unit not found</p>
      </div>
    );
  }

  const rubricScores = evaluation?.rubricScores ? JSON.parse(evaluation.rubricScores) : null;
  const keyFindings = evaluation?.keyFindings ? JSON.parse(evaluation.keyFindings) : [];
  const criticalIssues = evaluation?.criticalIssues ? JSON.parse(evaluation.criticalIssues) : [];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="sm" data-testid="button-back">
              <ArrowLeft className="h-4 w-4 mr-1" /> Dashboard
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-lg font-bold">{bu.name}</h1>
          </div>
          {evaluation && <RecommendationBadge rec={evaluation.recommendation} />}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        {/* BU Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {bu.annualizedRevenue != null && (
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground">Annualized Revenue</p>
                <p className="text-xl font-bold">${bu.annualizedRevenue}M</p>
              </CardContent>
            </Card>
          )}
          {bu.enrollmentCurrent != null && (
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground">Students</p>
                <p className="text-xl font-bold">
                  {bu.enrollmentCurrent.toLocaleString()}
                  {bu.enrollmentTarget && (
                    <span className="text-sm font-normal text-muted-foreground"> / {bu.enrollmentTarget.toLocaleString()}</span>
                  )}
                </p>
              </CardContent>
            </Card>
          )}
          {bu.q2Budget != null && (
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground">Q2 Budget</p>
                <p className="text-xl font-bold">${bu.q2Budget}M</p>
              </CardContent>
            </Card>
          )}
          {bu.learningMultiplier != null && (
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground">Learning Multiplier</p>
                <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{bu.learningMultiplier}x</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Links */}
        <div className="flex gap-3 flex-wrap">
          {bu.budgetPlanUrl && (
            <a href={bu.budgetPlanUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" data-testid="link-budget-plan">
                <FileText className="h-4 w-4 mr-1" /> Budget Plan
                <ExternalLink className="h-3 w-3 ml-1" />
              </Button>
            </a>
          )}
          {bu.budgetModelUrl && (
            <a href={bu.budgetModelUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" data-testid="link-budget-model">
                <FileText className="h-4 w-4 mr-1" /> Budget Model
                <ExternalLink className="h-3 w-3 ml-1" />
              </Button>
            </a>
          )}
          {bu.financialModelUrl && (
            <a href={bu.financialModelUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" data-testid="link-financial-model">
                <FileText className="h-4 w-4 mr-1" /> Financial Model
                <ExternalLink className="h-3 w-3 ml-1" />
              </Button>
            </a>
          )}
        </div>

        {/* Evaluation Report */}
        {evalLoading ? (
          <Card>
            <CardContent className="pt-6">
              <Skeleton className="h-48 w-full" />
            </CardContent>
          </Card>
        ) : evaluation ? (
          <>
            {/* Score & Summary */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-base">AI QC Report — Executive Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="text-center">
                      <div className={`text-3xl font-bold ${
                        evaluation.overallScore >= 7 ? "text-emerald-600" :
                        evaluation.overallScore >= 5 ? "text-amber-600" : "text-red-600"
                      }`}>
                        {evaluation.overallScore.toFixed(1)}
                      </div>
                      <p className="text-xs text-muted-foreground">Overall</p>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold">{evaluation.confidenceScore}%</div>
                      <p className="text-xs text-muted-foreground">Confidence</p>
                    </div>
                  </div>
                  <p className="text-sm leading-relaxed" data-testid="text-executive-summary">
                    {evaluation.executiveSummary}
                  </p>
                  {evaluation.financialSummary && (
                    <div className="bg-muted/50 rounded-lg p-3">
                      <p className="text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wider">Financial Summary</p>
                      <p className="text-sm">{evaluation.financialSummary}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Rubric Scores */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Joe's Rubric Scores</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {rubricScores && Object.entries(rubricScores).map(([key, score]) => {
                    const weights: Record<string, number> = {
                      mission_alignment: 0.15, academic_excellence: 0.15,
                      product_pricing: 0.15, gtm_community: 0.10,
                      ai_scalability: 0.15, financial_model: 0.15,
                      talent_strategy: 0.05, access_funding: 0.10,
                    };
                    return (
                      <ScoreBar
                        key={key}
                        label={rubricLabels[key] || key}
                        score={score as number}
                        weight={weights[key] || 0.1}
                      />
                    );
                  })}
                </CardContent>
              </Card>
            </div>

            {/* Key Findings & Issues */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    Key Findings
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {keyFindings.map((finding: string, i: number) => (
                      <li key={i} className="text-sm flex gap-2">
                        <span className="text-emerald-500 mt-0.5 shrink-0">+</span>
                        <span>{finding}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    Critical Issues
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {criticalIssues.map((issue: string, i: number) => (
                      <li key={i} className="text-sm flex gap-2">
                        <span className="text-amber-500 mt-0.5 shrink-0">!</span>
                        <span>{issue}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>

            {/* Individual Rubric Justifications */}
            {rubricItems && rubricItems.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Detailed Rubric Assessment</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {rubricItems.map((item) => (
                      <div key={item.id} className="border-b pb-4 last:border-0 last:pb-0">
                        <div className="flex items-center justify-between mb-1">
                          <h4 className="text-sm font-semibold">{item.criterionLabel}</h4>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{(item.weight * 100).toFixed(0)}% weight</span>
                            <Badge variant={item.score >= 7 ? "default" : item.score >= 5 ? "secondary" : "destructive"}>
                              {item.score.toFixed(1)}/10
                            </Badge>
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground">{item.justification}</p>
                        {item.evidence && (
                          <p className="text-xs text-muted-foreground mt-1 italic">Evidence: {item.evidence}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        ) : (
          <Card>
            <CardContent className="pt-6 text-center py-12">
              <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <h3 className="font-semibold mb-1">No Evaluation Yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                This business unit has not been evaluated against Joe's rubric.
              </p>
              <Button data-testid="button-run-evaluation">Run Evaluation</Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

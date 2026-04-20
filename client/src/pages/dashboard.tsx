import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  GraduationCap,
  TrendingUp,
  BarChart3,
  Building2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Loader2,
  ExternalLink,
  Star,
  Target,
  Zap,
  Download,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { BusinessUnit } from "@shared/schema";

type EvaluationSummary = {
  id: number;
  recommendation: string;
  overallScore: number;
  confidenceScore: number;
  executiveSummary: string;
};

type EnrichedBU = BusinessUnit & {
  evaluation: EvaluationSummary | null;
};

type DashboardSummary = {
  totalUnits: number;
  pendingReview: number;
  evaluated: number;
  avgScore: number;
  approveCount: number;
  approveWithFixCount: number;
  rejectCount: number;
};

function RecommendationBadge({ recommendation }: { recommendation: string }) {
  const config: Record<string, { label: string; className: string; icon: any }> = {
    APPROVE: {
      label: "Approve",
      className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 border-emerald-200",
      icon: ShieldCheck,
    },
    APPROVE_WITH_FIX: {
      label: "Approve w/ Fix",
      className: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 border-amber-200",
      icon: ShieldAlert,
    },
    REJECT: {
      label: "Reject",
      className: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300 border-red-200",
      icon: ShieldX,
    },
  };
  const c = config[recommendation] || config.REJECT;
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${c.className}`}>
      <Icon className="h-3.5 w-3.5" />
      {c.label}
    </span>
  );
}

function ScoreDisplay({ score }: { score: number }) {
  const color =
    score >= 7.0
      ? "text-emerald-600 dark:text-emerald-400"
      : score >= 5.0
      ? "text-amber-600 dark:text-amber-400"
      : "text-red-600 dark:text-red-400";
  return (
    <span className="text-sm font-bold">
      <span className={color}>{score.toFixed(1)}</span>
      <span className="text-muted-foreground font-normal">/10</span>
    </span>
  );
}

function ScoreBar({ score }: { score: number }) {
  const pct = (score / 10) * 100;
  const color =
    score >= 7.0
      ? "bg-emerald-500"
      : score >= 5.0
      ? "bg-amber-500"
      : "bg-red-500";
  return (
    <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function KPICard({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: any;
  color: string;
}) {
  return (
    <Card className="relative overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className={`p-2 rounded-md ${color}`}>
          <Icon className="h-4 w-4 text-white" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}

function BUCard({ bu }: { bu: EnrichedBU }) {
  const ev = bu.evaluation;
  const borderColor = ev
    ? ev.recommendation === "APPROVE"
      ? "border-l-emerald-500"
      : ev.recommendation === "APPROVE_WITH_FIX"
      ? "border-l-amber-500"
      : "border-l-red-500"
    : "border-l-gray-300";

  return (
    <Link href={`/bu/${bu.id}`}>
      <Card
        className={`cursor-pointer hover:shadow-md transition-shadow border-l-4 ${borderColor}`}
      >
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="text-base truncate">{bu.name}</CardTitle>
              {bu.gm && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  GM: {bu.gm}
                </p>
              )}
            </div>
            {ev ? (
              <RecommendationBadge recommendation={ev.recommendation} />
            ) : (
              <Badge variant="outline" className="gap-1 shrink-0">
                <Clock className="h-3 w-3" />
                Not Evaluated
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {ev ? (
            <>
              <div className="flex items-center justify-between">
                <ScoreDisplay score={ev.overallScore} />
                <span className="text-xs text-muted-foreground">
                  {ev.confidenceScore}% confidence
                </span>
              </div>
              <ScoreBar score={ev.overallScore} />
            </>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              Awaiting AI QC evaluation
            </p>
          )}
          {(bu.budgetDocUrl || bu.budgetPnlUrl) && (
            <div className="flex gap-3 flex-wrap pt-2 border-t">
              {bu.budgetDocUrl && (
                <a
                  href={bu.budgetDocUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="h-3 w-3" /> Budget Doc
                </a>
              )}
              {bu.budgetPnlUrl && (
                <a
                  href={bu.budgetPnlUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="h-3 w-3" /> Budget P&L
                </a>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

export default function Dashboard() {
  const { toast } = useToast();
  const [evalProgress, setEvalProgress] = useState<string | null>(null);

  const { data: summary, isLoading: summaryLoading } =
    useQuery<DashboardSummary>({
      queryKey: ["/api/dashboard-summary"],
    });

  const { data: units, isLoading: unitsLoading } = useQuery<EnrichedBU[]>({
    queryKey: ["/api/business-units"],
  });

  const evaluateAllMutation = useMutation({
    mutationFn: async () => {
      setEvalProgress("Starting batch evaluation...");
      const res = await apiRequest("POST", "/api/evaluate-all?onlyPending=true");
      return res.json();
    },
    onSuccess: (data) => {
      setEvalProgress(null);
      toast({
        title: `Batch Evaluation Complete`,
        description: `${data.succeeded} succeeded, ${data.failed} failed out of ${data.total}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard-summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/business-units"] });
    },
    onError: (err: any) => {
      setEvalProgress(null);
      toast({
        title: "Batch Evaluation Failed",
        description: err.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });

  // Seed data on first load (run once)
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    apiRequest("POST", "/api/seed")
      .then(() => {
        queryClient.invalidateQueries({
          queryKey: ["/api/dashboard-summary"],
        });
        queryClient.invalidateQueries({ queryKey: ["/api/business-units"] });
      })
      .catch(() => {});
  }, []);

  // Sort: evaluated BUs first (by score desc), then unevaluated
  const sortedUnits = units
    ? [...units].sort((a, b) => {
        if (a.evaluation && b.evaluation) {
          return b.evaluation.overallScore - a.evaluation.overallScore;
        }
        if (a.evaluation) return -1;
        if (b.evaluation) return 1;
        return a.name.localeCompare(b.name);
      })
    : [];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary rounded-lg">
              <GraduationCap className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-none">
                Education Business Plan Grader
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Q2-26 Budget Summary AI QC Dashboard
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {summary?.evaluated || 0} / {summary?.totalUnits || 0} evaluated
            </Badge>
            <Button asChild variant="outline" size="sm">
              <a
                href="/api/evaluations/export-all.xlsx"
                download
                data-testid="link-export-all-xlsx"
              >
                <Download className="h-4 w-4 mr-1" />
                Export All (XLSX)
              </a>
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => evaluateAllMutation.mutate()}
              disabled={evaluateAllMutation.isPending}
            >
              {evaluateAllMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Zap className="h-4 w-4 mr-1" />
              )}
              {evaluateAllMutation.isPending
                ? "Evaluating..."
                : "Evaluate All Pending"}
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {summaryLoading ? (
            Array(4)
              .fill(0)
              .map((_, i) => (
                <Card key={i}>
                  <CardContent className="pt-6">
                    <Skeleton className="h-16 w-full" />
                  </CardContent>
                </Card>
              ))
          ) : (
            <>
              <KPICard
                title="Total BUs"
                value={summary?.totalUnits || 0}
                subtitle="Education business units"
                icon={Building2}
                color="bg-primary"
              />
              <KPICard
                title="Evaluated"
                value={summary?.evaluated || 0}
                subtitle="AI QC evaluations complete"
                icon={Star}
                color="bg-emerald-600"
              />
              <KPICard
                title="Average Score"
                value={
                  summary?.avgScore
                    ? `${summary.avgScore.toFixed(1)}/10`
                    : "—"
                }
                subtitle="Across all evaluated BUs"
                icon={BarChart3}
                color="bg-purple-600"
              />
              <KPICard
                title="Pending"
                value={summary?.pendingReview || 0}
                subtitle="Awaiting evaluation"
                icon={Target}
                color="bg-orange-600"
              />
            </>
          )}
        </div>

        {/* Recommendation Overview */}
        {summary && (
          <div className="flex gap-4 flex-wrap">
            <div className="flex items-center gap-1.5 text-sm">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <span className="font-semibold">{summary.approveCount}</span>
              <span className="text-muted-foreground">Approve</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm">
              <ShieldAlert className="h-4 w-4 text-amber-600" />
              <span className="font-semibold">
                {summary.approveWithFixCount}
              </span>
              <span className="text-muted-foreground">Approve w/ Fix</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm">
              <ShieldX className="h-4 w-4 text-red-600" />
              <span className="font-semibold">{summary.rejectCount}</span>
              <span className="text-muted-foreground">Reject</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm">
              <Clock className="h-4 w-4 text-gray-400" />
              <span className="font-semibold">{summary.pendingReview}</span>
              <span className="text-muted-foreground">Not Evaluated</span>
            </div>
          </div>
        )}

        {/* Business Unit Grid */}
        <div>
          <h2 className="text-base font-semibold mb-4">Business Units</h2>
          {unitsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array(6)
                .fill(0)
                .map((_, i) => (
                  <Card key={i}>
                    <CardContent className="pt-6">
                      <Skeleton className="h-32 w-full" />
                    </CardContent>
                  </Card>
                ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sortedUnits.map((bu) => (
                <BUCard key={bu.id} bu={bu} />
              ))}
            </div>
          )}
        </div>

        {/* Joe's Rubric Quick Reference */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Joe's Education Rubric — 8 Evaluation Categories
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
              <div className="space-y-2">
                <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                  Mission Alignment (15%)
                </p>
                <ul className="space-y-1 text-muted-foreground">
                  <li>Unlock potential — EVERY kid</li>
                  <li>Kids must love school</li>
                  <li>High Standards / High Support</li>
                </ul>
              </div>
              <div className="space-y-2">
                <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                  Academic Excellence (15%)
                </p>
                <ul className="space-y-1 text-muted-foreground">
                  <li>{">"} 2x learning (MAP testing)</li>
                  <li>3rd-party life skills benchmarks</li>
                  <li>Benchmark vs. the best</li>
                </ul>
              </div>
              <div className="space-y-2">
                <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                  Financial Model (15%)
                </p>
                <ul className="space-y-1 text-muted-foreground">
                  <li>High ROIC</li>
                  <li>Best-in-class retention</li>
                  <li>Asset-light model</li>
                </ul>
              </div>
              <div className="space-y-2">
                <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                  AI & Scalability (15%)
                </p>
                <ul className="space-y-1 text-muted-foreground">
                  <li>AI loops for quality at scale</li>
                  <li>Flywheel / network effects</li>
                  <li>Govt funding for access</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

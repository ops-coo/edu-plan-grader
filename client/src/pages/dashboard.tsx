import { useQuery } from "@tanstack/react-query";
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
} from "lucide-react";
import { useEffect, useRef } from "react";
import { queryClient } from "@/lib/queryClient";
import type { BusinessUnit } from "@shared/schema";

type DashboardSummary = {
  totalUnits: number;
  pendingReview: number;
  evaluated: number;
  inProgress: number;
  onHold: number;
  approved: number;
  rejected: number;
  fixRequired: number;
  avgScore: number;
  exemplary: number;
  promising: number;
  developing: number;
  criticallyFlawed: number;
  notRated: number;
};

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: any }> = {
    approved: { label: "Approved", variant: "default", icon: CheckCircle2 },
    rejected: { label: "Rejected", variant: "destructive", icon: XCircle },
    fix_required: { label: "Fix Required", variant: "secondary", icon: AlertTriangle },
    pending_review: { label: "Pending Review", variant: "outline", icon: Clock },
    in_progress: { label: "In Progress", variant: "outline", icon: Loader2 },
    evaluated: { label: "Evaluated", variant: "default", icon: CheckCircle2 },
    on_hold: { label: "On Hold", variant: "secondary", icon: Clock },
  };
  const c = config[status] || config.pending_review;
  const Icon = c.icon;
  return (
    <Badge variant={c.variant} className="gap-1" data-testid={`badge-status-${status}`}>
      <Icon className={`h-3 w-3 ${status === "in_progress" ? "animate-spin" : ""}`} />
      {c.label}
    </Badge>
  );
}

function BrainliftBadge({ rating }: { rating: string | null }) {
  if (!rating) return null;
  const config: Record<string, string> = {
    "Exemplary": "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
    "Promising": "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    "Developing": "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
    "Critically Flawed": "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config[rating] || "bg-gray-100 text-gray-800"}`}>
      {rating}
    </span>
  );
}

function KPICard({ title, value, subtitle, icon: Icon, color }: {
  title: string; value: string | number; subtitle?: string; icon: any; color: string;
}) {
  return (
    <Card className="relative overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className={`p-2 rounded-md ${color}`}>
          <Icon className="h-4 w-4 text-white" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold" data-testid={`kpi-${title.toLowerCase().replace(/\s/g, "-")}`}>{value}</div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

function BUCard({ bu }: { bu: BusinessUnit }) {
  const ratingColors: Record<string, string> = {
    "Exemplary": "border-l-emerald-500",
    "Promising": "border-l-blue-500",
    "Developing": "border-l-amber-500",
    "Critically Flawed": "border-l-red-500",
  };
  const borderColor = bu.brainliftRating ? (ratingColors[bu.brainliftRating] || "border-l-gray-400") : "border-l-gray-300";

  return (
    <Link href={`/bu/${bu.id}`}>
      <Card
        className={`cursor-pointer hover:shadow-md transition-shadow border-l-4 ${borderColor}`}
        data-testid={`card-bu-${bu.id}`}
      >
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">{bu.name}</CardTitle>
              {bu.gm && <p className="text-xs text-muted-foreground mt-1">GM: {bu.gm}</p>}
            </div>
            <StatusBadge status={bu.status} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 flex-wrap mb-3">
            <BrainliftBadge rating={bu.brainliftRating} />
            {bu.overallScore != null && (
              <span className="text-sm font-semibold">
                Score: <span className={
                  bu.overallScore >= 75 ? "text-emerald-600 dark:text-emerald-400" :
                  bu.overallScore >= 50 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"
                }>{bu.overallScore}</span>/100
              </span>
            )}
          </div>
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
  const { data: summary, isLoading: summaryLoading } = useQuery<DashboardSummary>({
    queryKey: ["/api/dashboard-summary"],
  });

  const { data: units, isLoading: unitsLoading } = useQuery<BusinessUnit[]>({
    queryKey: ["/api/business-units"],
  });

  // Seed data on first load (run once)
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    apiRequest("POST", "/api/seed").then(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard-summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/business-units"] });
    }).catch(() => {});
  }, []);

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
              <h1 className="text-lg font-bold leading-none">Education Business Plan Grader</h1>
              <p className="text-xs text-muted-foreground mt-0.5">Q2-26 Budget Summary AI QC Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {summary?.evaluated || 0} / {summary?.totalUnits || 0} rated
            </Badge>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {summaryLoading ? (
            Array(4).fill(0).map((_, i) => (
              <Card key={i}><CardContent className="pt-6"><Skeleton className="h-16 w-full" /></CardContent></Card>
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
                subtitle="With brainlift rating"
                icon={Star}
                color="bg-emerald-600"
              />
              <KPICard
                title="Average Score"
                value={summary?.avgScore ? `${summary.avgScore.toFixed(0)}/100` : "—"}
                subtitle="Across scored BUs"
                icon={BarChart3}
                color="bg-purple-600"
              />
              <KPICard
                title="Pending Review"
                value={summary?.pendingReview || 0}
                subtitle="Awaiting evaluation"
                icon={Target}
                color="bg-orange-600"
              />
            </>
          )}
        </div>

        {/* Brainlift Rating Overview */}
        {summary && (
          <div className="flex gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 text-sm">
              <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <span className="font-medium">{summary.exemplary}</span>
              <span className="text-muted-foreground">Exemplary</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm">
              <div className="h-2.5 w-2.5 rounded-full bg-blue-500" />
              <span className="font-medium">{summary.promising}</span>
              <span className="text-muted-foreground">Promising</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm">
              <div className="h-2.5 w-2.5 rounded-full bg-amber-500" />
              <span className="font-medium">{summary.developing}</span>
              <span className="text-muted-foreground">Developing</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm">
              <div className="h-2.5 w-2.5 rounded-full bg-red-500" />
              <span className="font-medium">{summary.criticallyFlawed}</span>
              <span className="text-muted-foreground">Critically Flawed</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm">
              <div className="h-2.5 w-2.5 rounded-full bg-gray-400" />
              <span className="font-medium">{summary.notRated}</span>
              <span className="text-muted-foreground">Not Rated</span>
            </div>
          </div>
        )}

        {/* Business Unit Grid */}
        <div>
          <h2 className="text-base font-semibold mb-4">Business Units</h2>
          {unitsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array(6).fill(0).map((_, i) => (
                <Card key={i}><CardContent className="pt-6"><Skeleton className="h-32 w-full" /></CardContent></Card>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {units?.map((bu) => <BUCard key={bu.id} bu={bu} />)}
            </div>
          )}
        </div>

        {/* Joe's Rubric Quick Reference */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Joe's Education Rubric — Evaluation Criteria</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
              <div className="space-y-2">
                <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">Mission (15%)</p>
                <ul className="space-y-1 text-muted-foreground">
                  <li>Unlock potential — EVERY kid</li>
                  <li>Kids must love school</li>
                  <li>High Standards / High Support</li>
                </ul>
              </div>
              <div className="space-y-2">
                <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">Academic (15%)</p>
                <ul className="space-y-1 text-muted-foreground">
                  <li>{">"} 2x learning (MAP testing)</li>
                  <li>3rd-party life skills benchmarks</li>
                  <li>Benchmark vs. the best</li>
                </ul>
              </div>
              <div className="space-y-2">
                <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">Financial (15%)</p>
                <ul className="space-y-1 text-muted-foreground">
                  <li>High ROIC</li>
                  <li>Best-in-class retention</li>
                  <li>Asset-light model</li>
                </ul>
              </div>
              <div className="space-y-2">
                <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">Scale (15%)</p>
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

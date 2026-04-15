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
  DollarSign,
  Users,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Loader2,
  BarChart3,
  ExternalLink,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { queryClient } from "@/lib/queryClient";
import type { BusinessUnit } from "@shared/schema";

type DashboardSummary = {
  totalUnits: number;
  approved: number;
  rejected: number;
  fixRequired: number;
  pending: number;
  evaluating: number;
  totalBudget: number;
  totalRevenue: number;
  totalEnrollment: number;
  avgScore: number;
  evaluationsCompleted: number;
};

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: any }> = {
    approved: { label: "Approved", variant: "default", icon: CheckCircle2 },
    rejected: { label: "Rejected", variant: "destructive", icon: XCircle },
    fix_required: { label: "Fix Required", variant: "secondary", icon: AlertTriangle },
    pending: { label: "Pending", variant: "outline", icon: Clock },
    evaluating: { label: "Evaluating", variant: "outline", icon: Loader2 },
  };
  const c = config[status] || config.pending;
  const Icon = c.icon;
  return (
    <Badge variant={c.variant} className="gap-1" data-testid={`badge-status-${status}`}>
      <Icon className={`h-3 w-3 ${status === "evaluating" ? "animate-spin" : ""}`} />
      {c.label}
    </Badge>
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
  const categoryColors: Record<string, string> = {
    physical_schools: "border-l-blue-500",
    virtual: "border-l-emerald-500",
    sports: "border-l-orange-500",
    tech: "border-l-purple-500",
    marketing: "border-l-pink-500",
    other: "border-l-gray-400",
  };
  const categoryLabels: Record<string, string> = {
    physical_schools: "Physical Schools",
    virtual: "Virtual / DTC",
    sports: "Sports Academies",
    tech: "Tech / Platform",
    marketing: "Marketing",
    other: "Other",
  };

  return (
    <Link href={`/bu/${bu.id}`}>
      <Card
        className={`cursor-pointer hover:shadow-md transition-shadow border-l-4 ${categoryColors[bu.category] || "border-l-gray-400"}`}
        data-testid={`card-bu-${bu.id}`}
      >
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">{bu.name}</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">{categoryLabels[bu.category]}</p>
            </div>
            <StatusBadge status={bu.status} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-sm">
            {bu.annualizedRevenue != null && (
              <div>
                <p className="text-muted-foreground text-xs">Revenue</p>
                <p className="font-semibold">${bu.annualizedRevenue}M/yr</p>
              </div>
            )}
            {bu.enrollmentCurrent != null && (
              <div>
                <p className="text-muted-foreground text-xs">Students</p>
                <p className="font-semibold">
                  {bu.enrollmentCurrent.toLocaleString()}
                  {bu.enrollmentTarget ? (
                    <span className="text-muted-foreground font-normal"> / {bu.enrollmentTarget.toLocaleString()}</span>
                  ) : null}
                </p>
              </div>
            )}
            {bu.learningMultiplier != null && (
              <div>
                <p className="text-muted-foreground text-xs">Learning</p>
                <p className="font-semibold text-emerald-600 dark:text-emerald-400">{bu.learningMultiplier}x</p>
              </div>
            )}
            {bu.q2Budget != null && (
              <div>
                <p className="text-muted-foreground text-xs">Q2 Budget</p>
                <p className="font-semibold">${bu.q2Budget}M</p>
              </div>
            )}
          </div>
          {bu.budgetModelUrl && (
            <div className="mt-3 pt-3 border-t">
              <a
                href={bu.budgetModelUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="h-3 w-3" /> Budget Model
              </a>
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
              {summary?.evaluationsCompleted || 0} / {summary?.totalUnits || 0} evaluated
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
                title="Total Revenue"
                value={`$${(summary?.totalRevenue || 0).toFixed(1)}M/yr`}
                subtitle="Annualized across all BUs"
                icon={DollarSign}
                color="bg-emerald-600"
              />
              <KPICard
                title="Students Enrolled"
                value={(summary?.totalEnrollment || 0).toLocaleString()}
                subtitle="Current enrollment"
                icon={Users}
                color="bg-blue-600"
              />
              <KPICard
                title="Q2 Budget"
                value={`$${(summary?.totalBudget || 0).toFixed(1)}M`}
                subtitle="Total Q2'26 investment"
                icon={TrendingUp}
                color="bg-orange-600"
              />
              <KPICard
                title="Avg Score"
                value={summary?.avgScore ? `${summary.avgScore.toFixed(1)}/10` : "—"}
                subtitle={`${summary?.evaluationsCompleted || 0} evaluations completed`}
                icon={BarChart3}
                color="bg-purple-600"
              />
            </>
          )}
        </div>

        {/* Status Overview */}
        {summary && (
          <div className="flex gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 text-sm">
              <div className="h-2.5 w-2.5 rounded-full bg-green-500" />
              <span className="font-medium">{summary.approved}</span>
              <span className="text-muted-foreground">Approved</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm">
              <div className="h-2.5 w-2.5 rounded-full bg-amber-500" />
              <span className="font-medium">{summary.fixRequired}</span>
              <span className="text-muted-foreground">Fix Required</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm">
              <div className="h-2.5 w-2.5 rounded-full bg-red-500" />
              <span className="font-medium">{summary.rejected}</span>
              <span className="text-muted-foreground">Rejected</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm">
              <div className="h-2.5 w-2.5 rounded-full bg-gray-400" />
              <span className="font-medium">{summary.pending}</span>
              <span className="text-muted-foreground">Pending</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm">
              <div className="h-2.5 w-2.5 rounded-full bg-blue-400 animate-pulse" />
              <span className="font-medium">{summary.evaluating}</span>
              <span className="text-muted-foreground">Evaluating</span>
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

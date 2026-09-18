import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  FolderKanban,
  FileText,
  Sparkles,
  CheckCircle2,
  CircleCheck,
  CircleX,
  CircleAlert,
  Bug,
  TrendingUp,
  TrendingDown,
  Upload,
  PlayCircle,
  BarChart3,
  Plus,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

import { API_URL } from "@/lib/api";

type ModuleFailure = {
  module: string;
  failed_count: number;
};

type ExecutionSummary = {
  name: string;
  value: number;
};

type DashboardSummary = {
  total_projects: number;
  uploaded_documents: number;
  generated_testcases: number;
  approved_testcases: number;
  passed_tests: number;
  failed_tests: number;
  blocked_tests: number;
  open_defects: number;
  module_failures: ModuleFailure[];
  execution_summary: ExecutionSummary[];
};

const defaultSummary: DashboardSummary = {
  total_projects: 0,
  uploaded_documents: 0,
  generated_testcases: 0,
  approved_testcases: 0,
  passed_tests: 0,
  failed_tests: 0,
  blocked_tests: 0,
  open_defects: 0,
  module_failures: [],
  execution_summary: [
    { name: "Passed", value: 0 },
    { name: "Failed", value: 0 },
    { name: "Blocked", value: 0 },
  ],
};

const pieColors: Record<string, string> = {
  Passed: "var(--color-success)",
  Failed: "var(--color-destructive)",
  Blocked: "var(--color-warning)",
};

function Dashboard() {
  const [summary, setSummary] = useState<DashboardSummary>(defaultSummary);
  const [loading, setLoading] = useState(true);

  const loadDashboardSummary = async () => {
    try {
      setLoading(true);

      const response = await fetch(`${API_URL}/dashboard-summary`);
      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || "Failed to load dashboard data");
      }

      setSummary({
        ...defaultSummary,
        ...data,
        execution_summary:
          data.execution_summary && data.execution_summary.length > 0
            ? data.execution_summary
            : defaultSummary.execution_summary,
        module_failures: data.module_failures || [],
      });
    } catch (error: any) {
      toast.error(error.message || "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardSummary();
  }, []);

  const approvalRate =
    summary.generated_testcases > 0
      ? Math.round(
          (summary.approved_testcases / summary.generated_testcases) * 100
        )
      : 0;

  const kpis = [
    {
      label: "Total Projects",
      value: summary.total_projects,
      icon: FolderKanban,
      accent: "bg-primary/10 text-primary",
      trend: "Live from database",
      up: true,
      to: "/projects" as const,
    },
    {
      label: "Uploaded Documents",
      value: summary.uploaded_documents,
      icon: FileText,
      accent: "bg-info/10 text-info",
      trend: "SRS/SOW uploaded",
      up: true,
      to: "/ai-generation" as const,
    },
    {
      label: "Generated Test Cases",
      value: summary.generated_testcases,
      icon: Sparkles,
      accent: "bg-chart-1/10 text-chart-1",
      trend: "AI generated cases",
      up: true,
      to: "/ai-generation" as const,
    },
    {
      label: "Approved Test Cases",
      value: summary.approved_testcases,
      icon: CheckCircle2,
      accent: "bg-success/10 text-success",
      trend: `${approvalRate}% approval rate`,
      up: true,
      to: "/ai-generation" as const,
    },
    {
      label: "Passed Tests",
      value: summary.passed_tests,
      icon: CircleCheck,
      accent: "bg-success/10 text-success",
      trend: "Executed as passed",
      up: true,
      to: "/execution" as const,
    },
    {
      label: "Failed Tests",
      value: summary.failed_tests,
      icon: CircleX,
      accent: "bg-destructive/10 text-destructive",
      trend: "Needs defect review",
      up: false,
      to: "/execution" as const,
    },
    {
      label: "Blocked Tests",
      value: summary.blocked_tests,
      icon: CircleAlert,
      accent: "bg-warning/15 text-warning-foreground",
      trend: "Blocked during execution",
      up: false,
      to: "/execution" as const,
    },
    {
      label: "Open Defects",
      value: summary.open_defects,
      icon: Bug,
      accent: "bg-destructive/10 text-destructive",
      trend: "Open / In Progress",
      up: false,
      to: "/defects" as const,
    },
  ];

  const summaryData = summary.execution_summary.map((item) => ({
    ...item,
    color: pieColors[item.name] || "var(--color-muted-foreground)",
  }));

  const moduleFailures = summary.module_failures.map((item) => ({
    module: item.module || "General",
    failures: item.failed_count,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Testing Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Real-time overview of projects, test cases, execution results, and
            defects.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/projects">
              <Plus className="h-4 w-4" /> Create Project
            </Link>
          </Button>

          <Button asChild variant="outline">
            <Link to="/ai-generation">
              <Upload className="h-4 w-4" /> Upload Document
            </Link>
          </Button>

          <Button asChild>
            <Link to="/ai-generation">
              <Sparkles className="h-4 w-4" /> Generate Test Cases
            </Link>
          </Button>

          <Button asChild variant="secondary">
            <Link to="/reports">
              <BarChart3 className="h-4 w-4" /> View Reports
            </Link>
          </Button>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {kpis.map((k) => (
          <Link key={k.label} to={k.to} className="block">
            <Card className="cursor-pointer p-4 transition hover:border-primary/40 hover:shadow-md">
              <div className="flex items-start justify-between">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-lg ${k.accent}`}
                >
                  <k.icon className="h-5 w-5" />
                </div>

                {k.up ? (
                  <TrendingUp className="h-4 w-4 text-success" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>

              <div className="mt-4 text-2xl font-semibold">
                {loading ? "..." : k.value.toLocaleString()}
              </div>

              <div className="text-xs text-muted-foreground">{k.label}</div>
              <div className="mt-1 text-[11px] text-muted-foreground/80">
                {k.trend}
              </div>
            </Card>
          </Link>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-1">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Execution Summary</h3>
            <Badge variant="outline">Live data</Badge>
          </div>

          <div className="mt-2 h-64">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={summaryData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                >
                  {summaryData.map((d) => (
                    <Cell key={d.name} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              Module-wise Failure Count
            </h3>
            <Badge variant="outline">From failed tests</Badge>
          </div>

          <div className="mt-2 h-64">
            <ResponsiveContainer>
              <BarChart data={moduleFailures}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                />
                <XAxis
                  dataKey="module"
                  stroke="var(--color-muted-foreground)"
                  fontSize={12}
                />
                <YAxis
                  stroke="var(--color-muted-foreground)"
                  fontSize={12}
                  allowDecimals={false}
                />
                <Tooltip />
                <Bar
                  dataKey="failures"
                  fill="var(--color-destructive)"
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Activity + Upcoming */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="text-sm font-semibold">Project Summary</h3>

          <ul className="mt-4 space-y-4">
            <li className="flex gap-3">
              <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
              <div className="text-sm">
                <span className="font-medium">
                  {summary.generated_testcases}
                </span>{" "}
                <span className="text-muted-foreground">
                  test cases generated from uploaded SRS/SOW documents.
                </span>
              </div>
            </li>

            <li className="flex gap-3">
              <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
              <div className="text-sm">
                <span className="font-medium">
                  {summary.approved_testcases}
                </span>{" "}
                <span className="text-muted-foreground">
                  test cases approved for execution.
                </span>
              </div>
            </li>

            <li className="flex gap-3">
              <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
              <div className="text-sm">
                <span className="font-medium">{summary.open_defects}</span>{" "}
                <span className="text-muted-foreground">
                  defects are currently open or in progress.
                </span>
              </div>
            </li>
          </ul>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Next Testing Actions</h3>

            <Button asChild variant="ghost" size="sm">
              <Link to="/execution">
                <PlayCircle className="h-4 w-4" /> Open execution
              </Link>
            </Button>
          </div>

          <ul className="mt-4 space-y-3">
            <li className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <div className="text-sm font-medium">
                  Execute approved test cases
                </div>
                <div className="text-xs text-muted-foreground">
                  Run all test cases that are approved.
                </div>
              </div>
              <Badge variant="default">High</Badge>
            </li>

            <li className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <div className="text-sm font-medium">Review failed tests</div>
                <div className="text-xs text-muted-foreground">
                  Create defects for failed test cases.
                </div>
              </div>
              <Badge variant="destructive">High</Badge>
            </li>

            <li className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <div className="text-sm font-medium">Check reports</div>
                <div className="text-xs text-muted-foreground">
                  Monitor testing progress and quality status.
                </div>
              </div>
              <Badge variant="secondary">Medium</Badge>
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
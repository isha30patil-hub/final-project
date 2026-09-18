import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  FileDown,
  FileSpreadsheet,
  Download,
  Printer,
  BarChart3,
  ShieldCheck,
  GitBranch,
} from "lucide-react";
import { toast } from "sonner";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { API_URL } from "@/lib/api";

export const Route = createFileRoute("/_app/reports")({
  component: ReportsPage,
});

type TestCase = {
  id: number;
  project_id: number;
  title: string;
  status: string;
  created_at?: string;
  approved_at?: string;
  solved_at?: string;
};

type Defect = {
  id: number;
  testcase_id: number;
  defect_title: string;
  severity: string;
  status: string;
};

type Execution = {
  id: number;
  testcase_id: number;
  testcase_title: string;
  status: string;
  queued_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  failure_summary?: string | null;
};

const executionBadgeVariant = (status: string) => {
  switch (status) {
    case "PASSED":
      return "default" as const;
    case "FAILED":
    case "ERROR":
      return "destructive" as const;
    default:
      return "secondary" as const;
  }
};

function durationLabel(exec: Execution) {
  if (!exec.started_at || !exec.finished_at) return "—";
  const ms = new Date(exec.finished_at).getTime() - new Date(exec.started_at).getTime();
  return `${(ms / 1000).toFixed(1)}s`;
}

function getModule(title: string) {
  const lower = title.toLowerCase();
  if (lower.includes("search")) return "Search Article";
  if (lower.includes("submit article")) return "Submit Article";
  if (lower.includes("reviewer")) return "Reviewer";
  if (lower.includes("publish")) return "Publish Article";
  if (lower.includes("status")) return "Check Status";
  if (lower.includes("email") || lower.includes("communication")) return "Communication";
  return "General";
}

function getDate(value?: string) {
  if (!value) return null;
  return value.slice(0, 10);
}

function ReportsPage() {
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [defects, setDefects] = useState<Defect[]>([]);
  const [executions, setExecutions] = useState<Execution[]>([]);

  const loadReports = async () => {
    try {
      // This page aggregates counts across every project, so it needs the
      // full set rather than the server's default page size.
      const tcResponse = await fetch(`${API_URL}/testcases?limit=5000`);
      const defectResponse = await fetch(`${API_URL}/defects`);
      const execResponse = await fetch(`${API_URL}/test-executions`);

      const tcData = await tcResponse.json();
      const defectData = await defectResponse.json();
      const execData = await execResponse.json();

      setTestCases(tcData);
      setDefects(defectData);
      setExecutions(Array.isArray(execData) ? execData : []);
    } catch {
      toast.error("Failed to load reports data");
    }
  };

  useEffect(() => {
    loadReports();
  }, []);

  const total = testCases.length;
  const generated = testCases.filter((t) => t.status === "Generated").length;
  const draft = testCases.filter((t) => t.status === "Draft").length;
  const approved = testCases.filter((t) => t.status === "Approved").length;
  const rejected = testCases.filter((t) => t.status === "Rejected").length;
  const passed = testCases.filter((t) => t.status === "Passed").length;
  const failed = testCases.filter((t) => t.status === "Failed").length;
  const blocked = testCases.filter((t) => t.status === "Blocked").length;

  const solvedTotal = approved + passed;
  const remaining = Math.max(total - solvedTotal, 0);

  const today = new Date().toISOString().slice(0, 10);

  const solvedToday = testCases.filter((t) => {
    const approvedDate = getDate(t.approved_at);
    const solvedDate = getDate(t.solved_at);

    if (approvedDate || solvedDate) {
      return approvedDate === today || solvedDate === today;
    }

    return t.status === "Approved" || t.status === "Passed";
  }).length;

  const remainingToday = Math.max(total - solvedToday, 0);

  const executed = passed + failed + blocked;
  const executionProgress = total === 0 ? 0 : Math.round((executed / total) * 100);

  const openDefects = defects.filter((d) => d.status === "Open").length;
  const closedDefects = defects.filter((d) => d.status === "Closed").length;
  const resolvedDefects = defects.filter((d) => d.status === "Resolved").length;

  const execution = [
    { name: "Passed", value: passed, color: "var(--color-success)" },
    { name: "Failed", value: failed, color: "var(--color-destructive)" },
    { name: "Blocked", value: blocked, color: "var(--color-warning)" },
    { name: "Approved", value: approved, color: "var(--color-info)" },
  ];

  const severity = [
    {
      name: "Critical",
      value: defects.filter((d) => d.severity === "Critical").length,
      color: "var(--color-destructive)",
    },
    {
      name: "High",
      value: defects.filter((d) => d.severity === "High").length,
      color: "#e8773a",
    },
    {
      name: "Medium",
      value: defects.filter((d) => d.severity === "Medium").length,
      color: "var(--color-warning)",
    },
    {
      name: "Low",
      value: defects.filter((d) => d.severity === "Low").length,
      color: "var(--color-muted-foreground)",
    },
  ];

  const dailyProgressData = useMemo(() => {
    const dateSet = new Set<string>();

    testCases.forEach((tc) => {
      if (tc.created_at) dateSet.add(getDate(tc.created_at)!);
      if (tc.approved_at) dateSet.add(getDate(tc.approved_at)!);
      if (tc.solved_at) dateSet.add(getDate(tc.solved_at)!);
    });

    if (dateSet.size === 0) {
      return [
        {
          day: "Today",
          solved: solvedToday,
          remaining: remainingToday,
        },
      ];
    }

    const dates = Array.from(dateSet).sort();

    let cumulativeCreated = 0;
    let cumulativeSolved = 0;

    return dates.map((day) => {
      const createdToday = testCases.filter((tc) => getDate(tc.created_at) === day).length;

      const solvedOnDay = testCases.filter((tc) => {
        return getDate(tc.approved_at) === day || getDate(tc.solved_at) === day;
      }).length;

      cumulativeCreated += createdToday;
      cumulativeSolved += solvedOnDay;

      return {
        day,
        solved: solvedOnDay,
        remaining: Math.max(cumulativeCreated - cumulativeSolved, 0),
      };
    });
  }, [testCases, solvedToday, remainingToday]);

  const moduleFail = useMemo(() => {
    const map: Record<string, number> = {};

    testCases
      .filter((t) => t.status === "Failed")
      .forEach((t) => {
        const module = getModule(t.title);
        map[module] = (map[module] || 0) + 1;
      });

    return Object.entries(map).map(([module, failures]) => ({
      module,
      failures,
    }));
  }, [testCases]);

  const coverage = useMemo(() => {
    const moduleMap: Record<string, { total: number; completed: number }> = {};

    testCases.forEach((t) => {
      const module = getModule(t.title);
      if (!moduleMap[module]) moduleMap[module] = { total: 0, completed: 0 };

      moduleMap[module].total += 1;

      if (["Passed", "Failed", "Blocked"].includes(t.status)) {
        moduleMap[module].completed += 1;
      }
    });

    return Object.entries(moduleMap).map(([module, data]) => ({
      module,
      pct: data.total === 0 ? 0 : Math.round((data.completed / data.total) * 100),
    }));
  }, [testCases]);

  const regressionSuggestions = testCases
    .filter((t) => t.status === "Failed")
    .slice(0, 4)
    .map((t) => ({
      module: getModule(t.title),
      text: `Retest related cases after failure in: ${t.title}`,
    }));

  const action = (label: string) => toast.success(`${label} — feature coming soon`);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground">
            Real-time view of test cases, execution progress, and defects from PostgreSQL.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => action("PDF report")}>
            <FileDown className="h-4 w-4" /> Export PDF
          </Button>
          <Button variant="outline" onClick={() => action("Excel report")}>
            <FileSpreadsheet className="h-4 w-4" /> Export Excel
          </Button>
          <Button variant="outline" onClick={() => action("Bundle")}>
            <Download className="h-4 w-4" /> Download Report
          </Button>
          <Button variant="secondary" onClick={() => toast.success("Sent to printer")}>
            <Printer className="h-4 w-4" /> Print
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-5">
          <h3 className="text-sm font-semibold">Total Test Cases</h3>
          <div className="mt-3 text-3xl font-semibold">{total}</div>
          <div className="text-xs text-muted-foreground">All statuses</div>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold">Solved Today</h3>
          <div className="mt-3 text-3xl font-semibold text-success">{solvedToday}</div>
          <div className="text-xs text-muted-foreground">Approved / passed today</div>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold">Remaining</h3>
          <div className="mt-3 text-3xl font-semibold text-warning-foreground">
            {remainingToday}
          </div>
          <div className="text-xs text-muted-foreground">Pending completion</div>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold">Open Defects</h3>
          <div className="mt-3 text-3xl font-semibold text-destructive">{openDefects}</div>
          <div className="text-xs text-muted-foreground">
            Resolved: {resolvedDefects} · Closed: {closedDefects}
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Daily Test Case Progress</h3>
          <Badge variant="outline">Live DB</Badge>
        </div>

        <div className="mt-3 h-72">
          <ResponsiveContainer>
            <BarChart data={dailyProgressData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="day" stroke="var(--color-muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
              <Tooltip />
              <Legend />
              <Bar
                dataKey="solved"
                name="Solved / Approved"
                fill="var(--color-success)"
                radius={[6, 6, 0, 0]}
              />
              <Bar
                dataKey="remaining"
                name="Remaining"
                fill="var(--color-primary)"
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Test case summary</h3>
            <Badge variant="outline">Live DB</Badge>
          </div>

          <div className="mt-3 grid grid-cols-4 gap-3 text-center">
            <div>
              <div className="text-2xl font-semibold">{generated}</div>
              <div className="text-xs text-muted-foreground">Generated</div>
            </div>

            <div>
              <div className="text-2xl font-semibold">{draft}</div>
              <div className="text-xs text-muted-foreground">Draft</div>
            </div>

            <div>
              <div className="text-2xl font-semibold text-success">{approved}</div>
              <div className="text-xs text-muted-foreground">Approved</div>
            </div>

            <div>
              <div className="text-2xl font-semibold text-destructive">{rejected}</div>
              <div className="text-xs text-muted-foreground">Rejected</div>
            </div>
          </div>

          <div className="mt-4">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Execution Progress</span>
              <span>{executionProgress}%</span>
            </div>
            <Progress value={executionProgress} className="mt-2" />
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Execution status</h3>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </div>

          <div className="mt-2 h-44">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={execution}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={65}
                  innerRadius={40}
                >
                  {execution.map((d) => (
                    <Cell key={d.name} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Defect severity</h3>
            <Badge variant="outline">{defects.length} total</Badge>
          </div>

          <div className="mt-2 h-44">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={severity}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={65}
                  innerRadius={40}
                >
                  {severity.map((d) => (
                    <Cell key={d.name} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="text-sm font-semibold">Module-wise failures</h3>
          <div className="mt-2 h-64">
            <ResponsiveContainer>
              <BarChart data={moduleFail}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="module" stroke="var(--color-muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
                <Tooltip />
                <Bar dataKey="failures" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-success" /> Requirement coverage
            </h3>
            <Badge variant="outline">
              Avg{" "}
              {coverage.length === 0
                ? 0
                : Math.round(coverage.reduce((a, b) => a + b.pct, 0) / coverage.length)}
              %
            </Badge>
          </div>

          <ul className="mt-4 space-y-3">
            {coverage.length === 0 && (
              <li className="text-sm text-muted-foreground">No coverage data available.</li>
            )}

            {coverage.map((c) => (
              <li key={c.module}>
                <div className="flex items-center justify-between text-sm">
                  <span>{c.module}</span>
                  <span className="font-medium">{c.pct}%</span>
                </div>
                <Progress value={c.pct} className="mt-1.5" />
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-primary" /> Regression suggestions
          </h3>
          <Badge variant="outline">Based on failed cases</Badge>
        </div>

        <ul className="mt-3 grid gap-2 text-sm md:grid-cols-2">
          {regressionSuggestions.length === 0 && (
            <li className="rounded-lg border border-border p-3 text-muted-foreground">
              No failed test cases yet. Regression suggestions will appear after failures.
            </li>
          )}

          {regressionSuggestions.map((r, index) => (
            <li key={index} className="rounded-lg border border-border p-3">
              <span className="font-medium">{r.module}</span> → {r.text}
            </li>
          ))}
        </ul>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between p-5 pb-0">
          <h3 className="text-sm font-semibold">Automated Execution History</h3>
          <Badge variant="outline">{executions.length} runs</Badge>
        </div>

        <Table className="mt-3">
          <TableHeader>
            <TableRow>
              <TableHead>Test Case</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Failure Summary</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {executions.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                  No automated runs yet. Execute an automatable test case from the Execution page.
                </TableCell>
              </TableRow>
            )}

            {executions.map((exec) => (
              <TableRow key={exec.id}>
                <TableCell className="max-w-[320px]">{exec.testcase_title}</TableCell>
                <TableCell>
                  <Badge variant={executionBadgeVariant(exec.status)}>{exec.status}</Badge>
                </TableCell>
                <TableCell>{durationLabel(exec)}</TableCell>
                <TableCell className="max-w-[360px] text-xs text-muted-foreground">
                  {exec.failure_summary || "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

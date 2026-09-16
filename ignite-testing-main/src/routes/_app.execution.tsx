import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  PlayCircle,
  CircleCheck,
  CircleX,
  CircleAlert,
  MessageSquarePlus,
  Bug,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_app/execution")({
  component: ExecutionPage,
});

const API_URL = "http://127.0.0.1:8000";

type TestCase = {
  id: number;
  project_id: number;
  module: string;
  title: string;
  steps: string;
  expected_result: string;
  status:
    | "Generated"
    | "Approved"
    | "Rejected"
    | "Draft"
    | "Passed"
    | "Failed"
    | "Blocked";
};

const getModuleName = (testcase: TestCase) => {
  if (testcase.module && testcase.module.trim() !== "") {
    return testcase.module;
  }

  const text = testcase.title.toLowerCase();

  if (
    text.includes("login") ||
    text.includes("registration") ||
    text.includes("register") ||
    text.includes("password") ||
    text.includes("email")
  ) {
    return "Login / Registration";
  }

  if (
    text.includes("cart") ||
    text.includes("product") ||
    text.includes("quantity") ||
    text.includes("checkout") ||
    text.includes("remove")
  ) {
    return "Shopping Cart";
  }

  return "General";
};

const getModulePrefix = (module: string) => {
  const text = module.toLowerCase();

  if (text.includes("login") || text.includes("registration")) return "LG";
  if (text.includes("cart")) return "SC";
  if (text.includes("payment")) return "PAY";
  if (text.includes("search")) return "SR";
  if (text.includes("profile")) return "PF";

  return "GEN";
};

const getModuleWiseTcId = (allProjectCases: TestCase[], testcase: TestCase) => {
  const sortedCases = [...allProjectCases].sort((a, b) => a.id - b.id);
  const currentPrefix = getModulePrefix(getModuleName(testcase));

  const sameModuleCases = sortedCases.filter(
    (tc) => getModulePrefix(getModuleName(tc)) === currentPrefix
  );

  const index = sameModuleCases.findIndex((tc) => tc.id === testcase.id);

  if (index === -1) {
    return `TC-${currentPrefix}-000`;
  }

  return `TC-${currentPrefix}-${String(index + 1).padStart(3, "0")}`;
};

const normalizeText = (text: string) => {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const getImportantWords = (text: string) => {
  const stopWords = new Set([
    "the",
    "and",
    "or",
    "to",
    "a",
    "an",
    "as",
    "is",
    "are",
    "be",
    "by",
    "for",
    "of",
    "in",
    "on",
    "with",
    "that",
    "this",
    "should",
    "shall",
    "system",
    "user",
    "test",
    "case",
    "result",
    "actual",
    "expected",
    "message",
    "display",
    "displayed",
  ]);

  return normalizeText(text)
    .split(" ")
    .filter((word) => word.length > 2 && !stopWords.has(word));
};

const isActualResultMatching = (actual: string, expected: string) => {
  const actualText = normalizeText(actual);
  const expectedText = normalizeText(expected);

  if (!actualText || !expectedText) return false;

  // Exact / near exact text match
  if (actualText === expectedText) return true;

  // Allows copied expected result with small changes
  if (actualText.includes(expectedText) || expectedText.includes(actualText)) {
    return true;
  }

  // Keyword based validation for practical demo.
  // Example: expected says "Confirm password must match password"
  // actual says "Confirm password must match password error displayed"
  const expectedWords = Array.from(new Set(getImportantWords(expected)));
  const actualWords = new Set(getImportantWords(actual));

  if (expectedWords.length === 0) return false;

  const matchedWords = expectedWords.filter((word) => actualWords.has(word));
  const matchScore = matchedWords.length / expectedWords.length;

  return matchScore >= 0.6;
};

function ExecutionPage() {
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedProjectName, setSelectedProjectName] = useState("");
  const [allCases, setAllCases] = useState<TestCase[]>([]);
  const [active, setActive] = useState<TestCase | null>(null);
  const [actual, setActual] = useState("");
  const [comment, setComment] = useState("");
  const [defectOpen, setDefectOpen] = useState(false);
  const [defectForm, setDefectForm] = useState({
    testcase_id: 0,
    defect_title: "",
    severity: "High",
    status: "Open",
  });

  const loadCases = async () => {
    try {
      const response = await fetch(`${API_URL}/testcases`);
      const data = await response.json();

      setAllCases(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Failed to load test cases");
    }
  };

  useEffect(() => {
    setSelectedProjectId(window.localStorage.getItem("selectedProjectId") || "");
    setSelectedProjectName(
      window.localStorage.getItem("selectedProjectName") || ""
    );

    loadCases();
  }, []);

  const projectCases = useMemo(
    () =>
      allCases.filter(
        (testcase) => String(testcase.project_id) === String(selectedProjectId)
      ),
    [allCases, selectedProjectId]
  );

  const cases = useMemo(
    () =>
      projectCases.filter((testcase) =>
        ["Approved", "Passed", "Failed", "Blocked"].includes(testcase.status)
      ),
    [projectCases]
  );

  const total = cases.length;

  const done = cases.filter((testcase) =>
    ["Passed", "Failed", "Blocked"].includes(testcase.status)
  ).length;

  const progress = total === 0 ? 0 : Math.round((done / total) * 100);

  const openExec = (testcase: TestCase) => {
    setActive(testcase);
    setActual("");
    setComment("");
  };

  const updateStatus = async (
    testcase: TestCase,
    status: "Passed" | "Failed" | "Blocked"
  ) => {
    try {
      const endpoint =
        status === "Passed" ? "pass" : status === "Failed" ? "fail" : "block";

      const response = await fetch(`${API_URL}/testcases/${testcase.id}/${endpoint}`, {
        method: "PUT",
      });

      if (!response.ok) {
        throw new Error("Status update failed");
      }

      if (status === "Failed") {
        setDefectForm({
          testcase_id: testcase.id,
          defect_title: `Test case failed: ${testcase.title}`,
          severity: "High",
          status: "Open",
        });

        setDefectOpen(true);
      } else {
        toast.success(`Test case marked ${status}`);
        setActive(null);
      }

      await loadCases();
    } catch {
      toast.error(`Failed to mark ${status}`);
    }
  };

  const handleMarkPass = () => {
    if (!active) return;

    if (!actual.trim()) {
      toast.error("Please enter the actual result first.");
      return;
    }

    const isMatching = isActualResultMatching(actual, active.expected_result);

    if (!isMatching) {
      toast.error(
        "Actual result does not match the expected result. Please mark it as Failed."
      );
      return;
    }

    updateStatus(active, "Passed");
  };

  const handleMarkFail = () => {
    if (!active) return;

    if (!actual.trim()) {
      toast.error("Please enter the actual result first.");
      return;
    }

    updateStatus(active, "Failed");
  };

  const handleMarkBlocked = () => {
    if (!active) return;

    if (!comment.trim() && !actual.trim()) {
      toast.error("Please enter the reason for blocking this test case.");
      return;
    }

    updateStatus(active, "Blocked");
  };

  const saveResult = () => {
    if (!actual.trim() && !comment.trim()) {
      toast.error("Please enter actual result or comment before saving.");
      return;
    }

    toast.success("Execution notes saved temporarily");
  };

  const submitDefect = async () => {
  if (!defectForm.testcase_id) {
    toast.error("Test case ID missing");
    return;
  }

  if (!defectForm.defect_title.trim()) {
    toast.error("Please enter defect title");
    return;
  }

  try {
    const response = await fetch(`${API_URL}/defects`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        testcase_id: defectForm.testcase_id,
        defect_title: defectForm.defect_title,
        severity: defectForm.severity,
        status: defectForm.status,
      }),
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      throw new Error(data.error || data.details || "Failed to log defect");
    }

    toast.success("Defect logged successfully");
    setDefectOpen(false);
    setActive(null);
    loadCases();
  } catch (error: any) {
    console.error("Defect log error:", error);
    toast.error(error.message || "Failed to log defect");
  }
};

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Test Execution
          </h1>

          <p className="text-sm text-muted-foreground">
            Run approved test cases and capture execution results.
          </p>

          {selectedProjectName && (
            <p className="text-sm font-medium text-primary">
              Project: {selectedProjectName}
            </p>
          )}
        </div>

        <Card className="min-w-[280px] p-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Execution progress</span>
            <span>
              {done}/{total}
            </span>
          </div>

          <Progress value={progress} className="mt-2" />

          <div className="mt-1 text-right text-xs text-muted-foreground">
            {progress}% complete
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>TC ID</TableHead>
              <TableHead>Project ID</TableHead>
              <TableHead>Module</TableHead>
              <TableHead>Scenario</TableHead>
              <TableHead className="text-center">Result</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {cases.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-12 text-center text-muted-foreground"
                >
                  No approved test cases yet. Approve test cases in the AI
                  Generation page first.
                </TableCell>
              </TableRow>
            )}

            {cases.map((testcase) => (
              <TableRow key={testcase.id}>
                <TableCell className="font-mono text-xs">
                  {getModuleWiseTcId(projectCases, testcase)}
                </TableCell>

                <TableCell>{testcase.project_id}</TableCell>

                <TableCell>
                  <Badge variant="secondary">{getModuleName(testcase)}</Badge>
                </TableCell>

                <TableCell className="max-w-[420px]">
                  {testcase.title}
                </TableCell>

                <TableCell className="text-center">
                  <Badge
                    variant={
                      testcase.status === "Passed"
                        ? "default"
                        : testcase.status === "Failed"
                        ? "destructive"
                        : testcase.status === "Blocked"
                        ? "secondary"
                        : "outline"
                    }
                  >
                    {testcase.status === "Approved"
                      ? "Not Executed"
                      : testcase.status}
                  </Badge>
                </TableCell>

                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openExec(testcase)}
                  >
                    <PlayCircle className="h-4 w-4" />
                    Execute
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!active && !defectOpen} onOpenChange={(open) => !open && setActive(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Execute Test Case{" "}
              {active ? getModuleWiseTcId(projectCases, active) : ""}
            </DialogTitle>

            <DialogDescription>
              {active && getModuleName(active)} · {active?.title}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Steps:</span>

              <pre className="mt-1 max-h-32 overflow-auto rounded-md border border-border bg-muted/40 p-2 font-mono text-xs whitespace-pre-wrap">
                {active?.steps}
              </pre>
            </div>

            <div>
              <span className="text-muted-foreground">Expected Result: </span>
              {active?.expected_result}
            </div>

            <div className="space-y-1.5">
              <Label>Actual result</Label>

              <Textarea
                rows={3}
                value={actual}
                onChange={(event) => setActual(event.target.value)}
                placeholder="Write the actual result observed during execution."
              />
            </div>

            <div className="space-y-1.5">
              <Label>Comment</Label>

              <Input
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Optional notes or reason for blocked status."
              />
            </div>
          </div>

          <DialogFooter className="flex-wrap gap-2">
            <Button variant="outline" onClick={() => setActive(null)}>
              <MessageSquarePlus className="h-4 w-4" />
              Close
            </Button>

            <Button variant="secondary" onClick={saveResult}>
              Save Result
            </Button>

            <Button variant="outline" onClick={handleMarkBlocked}>
              <CircleAlert className="h-4 w-4" />
              Mark Blocked
            </Button>

            <Button variant="destructive" onClick={handleMarkFail}>
              <CircleX className="h-4 w-4" />
              Mark Fail
            </Button>

            <Button onClick={handleMarkPass}>
              <CircleCheck className="h-4 w-4" />
              Mark Pass
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={defectOpen} onOpenChange={setDefectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bug className="h-5 w-5 text-destructive" />
              Log defect
            </DialogTitle>

            <DialogDescription>
              Linked to Test Case ID {defectForm.testcase_id}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label>Severity</Label>

              <Select
                value={defectForm.severity}
                onValueChange={(value) =>
                  setDefectForm({ ...defectForm, severity: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="Critical">Critical</SelectItem>
                  <SelectItem value="High">High</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="Low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Defect Title</Label>

              <Textarea
                rows={4}
                value={defectForm.defect_title}
                onChange={(event) =>
                  setDefectForm({
                    ...defectForm,
                    defect_title: event.target.value,
                  })
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDefectOpen(false);
                setActive(null);
              }}
            >
              Skip
            </Button>

            <Button onClick={submitDefect}>Log Defect</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
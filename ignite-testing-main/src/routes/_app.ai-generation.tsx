import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Sparkles,
  Loader2,
  RotateCcw,
  ClipboardCheck,
  Upload,
  CircleCheck,
  CircleX,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

export const Route = createFileRoute("/_app/ai-generation")({
  component: AIGenerationPage,
});

const API_URL = "http://127.0.0.1:8000";

type TestCase = {
  id: number;
  project_id: number;
  module: string;
  title: string;
  steps: string | string[];
  expected_result: string;
  status: string;
  coverage_type?: string | null;
  ai_quality_score?: number | null;
  ai_review_remark?: string | null;
  ai_recommendation?: string | null;
};

type Project = {
  id: number;
  name: string;
  description?: string;
};

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

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
    text.includes("shopping cart") ||
    text.includes("quantity") ||
    text.includes("product") ||
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

const getModuleWiseTcId = (cases: TestCase[], index: number) => {
  const currentCase = cases[index];
  const currentPrefix = getModulePrefix(getModuleName(currentCase));

  const moduleCount = cases
    .slice(0, index + 1)
    .filter((tc) => getModulePrefix(getModuleName(tc)) === currentPrefix)
    .length;

  return `TC-${currentPrefix}-${String(moduleCount).padStart(3, "0")}`;
};

const formatSteps = (steps: string | string[]) => {
  if (Array.isArray(steps)) {
    return steps.join("\n");
  }

  return steps || "";
};

const getAiDecision = (testcase: TestCase) => {
  if (testcase.ai_recommendation && testcase.ai_recommendation.trim() !== "") {
    return testcase.ai_recommendation;
  }

  if (["Approved", "Passed", "Failed", "Blocked"].includes(testcase.status)) {
    return "Auto Approved";
  }

  if (testcase.status === "Rejected") {
    return "Auto Rejected";
  }

  if (testcase.status === "Review") {
    return "Needs Review";
  }

  return "Manual Review";
};

const getStatusBadgeVariant = (status: string): BadgeVariant => {
  if (status === "Rejected") return "destructive";
  if (["Approved", "Passed", "Failed", "Blocked"].includes(status)) return "default";
  if (status === "Review") return "secondary";
  return "outline";
};

const getDecisionBadgeVariant = (decision: string): BadgeVariant => {
  const text = decision.toLowerCase();

  if (text.includes("reject")) return "destructive";
  if (text.includes("approved")) return "default";
  if (text.includes("review")) return "secondary";

  return "outline";
};

function AIGenerationPage() {
  const navigate = useNavigate();

  const [documentId, setDocumentId] = useState("");
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState<TestCase[]>([]);

  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedProjectName, setSelectedProjectName] = useState("");

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const loadExistingTestCases = async (projectId: string) => {
    if (!projectId) return;

    try {
      const response = await fetch(`${API_URL}/testcases`);
      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.details || data.error || "Failed to load test cases");
      }

      const projectTestCases = Array.isArray(data)
        ? data.filter(
            (testcase) => String(testcase.project_id) === String(projectId)
          )
        : [];

      setGenerated(projectTestCases);
    } catch (error: any) {
      toast.error(error.message || "Failed to load existing test cases");
    }
  };

  const clearSelectedProject = () => {
    setSelectedProjectId("");
    setSelectedProjectName("");
    setDocumentId("");
    setSelectedFile(null);
    setGenerated([]);

    window.localStorage.removeItem("selectedProjectId");
    window.localStorage.removeItem("selectedProjectName");
    window.localStorage.removeItem("selectedDocumentId");
  };

  const loadProjects = async (
    savedProjectId: string = "",
    savedProjectName: string = ""
  ) => {
    try {
      const response = await fetch(`${API_URL}/projects`);
      const data = await response.json();

      const projectList = Array.isArray(data) ? data : [];
      setProjects(projectList);

      if (projectList.length === 0) {
        clearSelectedProject();
        return;
      }

      if (savedProjectId) {
        const existingProject = projectList.find(
          (project) => String(project.id) === savedProjectId
        );

        if (!existingProject) {
          clearSelectedProject();
          return;
        }

        setSelectedProjectId(savedProjectId);
        setSelectedProjectName(existingProject.name || savedProjectName);

        window.localStorage.setItem("selectedProjectId", savedProjectId);
        window.localStorage.setItem(
          "selectedProjectName",
          existingProject.name || savedProjectName
        );

        await loadExistingTestCases(savedProjectId);
        return;
      }

      const firstProject = projectList[0];
      setSelectedProjectId(String(firstProject.id));
      setSelectedProjectName(firstProject.name);

      window.localStorage.setItem("selectedProjectId", String(firstProject.id));
      window.localStorage.setItem("selectedProjectName", firstProject.name);

      await loadExistingTestCases(String(firstProject.id));
    } catch {
      toast.error("Failed to load projects");
    }
  };

  const handleProjectChange = async (projectId: string) => {
    setSelectedProjectId(projectId);
    setDocumentId("");
    setSelectedFile(null);
    setGenerated([]);

    window.localStorage.removeItem("selectedDocumentId");

    const project = projects.find((p) => String(p.id) === projectId);

    if (project) {
      setSelectedProjectName(project.name);

      window.localStorage.setItem("selectedProjectId", String(project.id));
      window.localStorage.setItem("selectedProjectName", project.name);

      await loadExistingTestCases(projectId);
    }
  };

  const uploadDocument = async () => {
    if (!selectedProjectId) {
      toast.error("Please choose a project first");
      return;
    }

    if (!selectedFile) {
      toast.error("Please choose SRS/SOW PDF first");
      return;
    }

    try {
      setUploading(true);

      const formData = new FormData();
      formData.append("project_id", selectedProjectId);
      formData.append("file", selectedFile);

      const response = await fetch(`${API_URL}/upload-document`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || "Upload failed");
      }

      const uploadedDocId = data.document?.id;

      if (uploadedDocId) {
        setDocumentId(String(uploadedDocId));
        window.localStorage.setItem("selectedDocumentId", String(uploadedDocId));
      }

      toast.success("SRS/SOW uploaded and text extracted successfully");
    } catch (error: any) {
      toast.error(error.message || "Failed to upload SRS/SOW");
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    const savedDocId = window.localStorage.getItem("selectedDocumentId") || "";
    const savedProjectId = window.localStorage.getItem("selectedProjectId") || "";
    const savedProjectName =
      window.localStorage.getItem("selectedProjectName") || "";

    setDocumentId(savedDocId);
    loadProjects(savedProjectId, savedProjectName);
  }, []);

  const generate = async () => {
    if (!documentId) {
      toast.error("Please upload SRS/SOW PDF first.");
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(`${API_URL}/generate-testcases`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          document_id: Number(documentId),
        }),
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.details || data.error || "AI generation failed");
      }

      if (selectedProjectId) {
        await loadExistingTestCases(selectedProjectId);
      }

      const newCount = Array.isArray(data.generated_testcases)
        ? data.generated_testcases.length
        : 0;

      if (newCount > 0) {
        toast.success(`${newCount} test cases generated, validated, and auto-classified.`);
      } else {
        toast.warning("No new unique test cases found. Existing duplicates were skipped.");
      }

      if (typeof data.auto_approved_count === "number") {
        toast.info(
          `Auto Approved: ${data.auto_approved_count} | Review: ${data.needs_review_count || 0} | Rejected: ${data.auto_rejected_count || 0}`
        );
      }

      if (data.skipped_duplicates && data.skipped_duplicates > 0) {
        toast.info(`${data.skipped_duplicates} duplicate test cases skipped.`);
      }
    } catch (error: any) {
      console.error("Generation error:", error);
      toast.error(error.message || "Failed to generate test cases");
    } finally {
      setLoading(false);
    }
  };

  const updateTestCaseStatus = async (
    testcaseId: number,
    status: "Approved" | "Rejected"
  ) => {
    try {
      const response = await fetch(`${API_URL}/testcases/${testcaseId}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || "Status update failed");
      }

      const updatedTestcase = data.testcase;

      setGenerated((prev) =>
        prev.map((testcase) =>
          testcase.id === testcaseId
            ? {
                ...testcase,
                ...(updatedTestcase || {}),
                status,
              }
            : testcase
        )
      );

      toast.success(
        status === "Approved"
          ? "Review case approved and moved to Execution"
          : "Review case rejected"
      );
    } catch (error: any) {
      toast.error(error.message || "Failed to update test case status");
    }
  };

  const goExecution = () => {
    navigate({ to: "/execution" });
  };

  const displayedTestCases = [...generated].sort((a, b) => {
    const moduleA = getModuleName(a);
    const moduleB = getModuleName(b);

    if (moduleA !== moduleB) {
      return moduleA.localeCompare(moduleB);
    }

    return a.id - b.id;
  });

  const autoApprovedCases = displayedTestCases.filter((testcase) =>
    ["Approved", "Passed", "Failed", "Blocked"].includes(testcase.status)
  );

  const needsReviewCases = displayedTestCases.filter((testcase) =>
    ["Review", "Generated", "Draft"].includes(testcase.status)
  );

  const autoRejectedCases = displayedTestCases.filter(
    (testcase) => testcase.status === "Rejected"
  );

  const getDisplayTcId = (testcase: TestCase) => {
    const index = displayedTestCases.findIndex((tc) => tc.id === testcase.id);
    if (index === -1) return `TC-${String(testcase.id).padStart(3, "0")}`;
    return getModuleWiseTcId(displayedTestCases, index);
  };

  const renderTestCaseSection = (
    title: string,
    description: string,
    sectionCases: TestCase[],
    emptyText: string,
    showManualActions: boolean
  ) => (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>

        <Badge variant="outline">{sectionCases.length} cases</Badge>
      </div>

      {sectionCases.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          {emptyText}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table className="min-w-[1450px]">
            <TableHeader>
              <TableRow>
                <TableHead>TC ID</TableHead>
                <TableHead>Project ID</TableHead>
                <TableHead>Module</TableHead>
                <TableHead>Scenario</TableHead>
                <TableHead className="min-w-[280px]">Steps</TableHead>
                <TableHead className="min-w-[260px]">Expected Result</TableHead>
                <TableHead>Coverage</TableHead>
                <TableHead>AI Score</TableHead>
                <TableHead>AI Decision</TableHead>
                <TableHead className="min-w-[260px]">AI Remark</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-center">Action</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {sectionCases.map((testcase) => {
                const decision = getAiDecision(testcase);

                return (
                  <TableRow key={testcase.id}>
                    <TableCell className="font-mono text-xs">
                      {getDisplayTcId(testcase)}
                    </TableCell>

                    <TableCell>{testcase.project_id}</TableCell>

                    <TableCell>
                      <Badge variant="secondary">{getModuleName(testcase)}</Badge>
                    </TableCell>

                    <TableCell className="max-w-[220px]">
                      {testcase.title}
                    </TableCell>

                    <TableCell className="whitespace-pre-line text-xs">
                      {formatSteps(testcase.steps)}
                    </TableCell>

                    <TableCell className="text-xs">
                      {testcase.expected_result}
                    </TableCell>

                    <TableCell>
                      <Badge variant="outline">
                        {testcase.coverage_type || "Functional"}
                      </Badge>
                    </TableCell>

                    <TableCell className="font-medium">
                      {typeof testcase.ai_quality_score === "number"
                        ? `${testcase.ai_quality_score}/100`
                        : "—"}
                    </TableCell>

                    <TableCell>
                      <Badge variant={getDecisionBadgeVariant(decision)}>
                        {decision}
                      </Badge>
                    </TableCell>

                    <TableCell className="text-xs">
                      {testcase.ai_review_remark || "AI validation remark not available."}
                    </TableCell>

                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(testcase.status)}>
                        {testcase.status}
                      </Badge>
                    </TableCell>

                    <TableCell className="text-center">
                      {showManualActions ? (
                        <div className="flex justify-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              updateTestCaseStatus(testcase.id, "Approved")
                            }
                            title="Approve review case"
                            className="h-10 w-10 rounded-xl shadow-sm"
                          >
                            <CircleCheck className="h-5 w-5" />
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              updateTestCaseStatus(testcase.id, "Rejected")
                            }
                            title="Reject review case"
                            className="h-10 w-10 rounded-xl shadow-sm"
                          >
                            <CircleX className="h-5 w-5" />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Auto handled
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          AI Test Generation
        </h1>

        {selectedProjectName && (
          <p className="text-sm font-medium text-primary">
            Project: {selectedProjectName}
            {selectedProjectId && ` | ID: ${selectedProjectId}`}
          </p>
        )}

        <p className="text-sm text-muted-foreground">
          Generate test cases from uploaded SRS/SOW documents. AI will validate
          them automatically and classify them as Approved, Review, or Rejected.
        </p>
      </div>

      <Card className="p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <div className="text-sm font-medium">Project</div>

            <Select value={selectedProjectId} onValueChange={handleProjectChange}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a project" />
              </SelectTrigger>

              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={String(project.id)}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <div className="text-sm font-medium">SRS / SOW PDF</div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                id="srs-file"
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              />

              <Button asChild variant="outline">
                <label htmlFor="srs-file" className="cursor-pointer">
                  <Upload className="h-4 w-4" />
                  Choose PDF
                </label>
              </Button>

              <span className="text-sm text-muted-foreground">
                {selectedFile ? selectedFile.name : "No file selected"}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button onClick={uploadDocument} disabled={uploading}>
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Upload & Extract Text
              </>
            )}
          </Button>

          {documentId && (
            <Badge variant="outline">SRS/SOW uploaded successfully</Badge>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={generate} disabled={loading || !documentId}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                AI is generating and validating...
              </>
            ) : generated.length > 0 ? (
              <>
                <Sparkles className="h-4 w-4" />
                Generate More Test Cases
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generate Test Cases
              </>
            )}
          </Button>

          <Button variant="outline" onClick={generate} disabled={loading || !documentId}>
            <RotateCcw className="h-4 w-4" /> Regenerate
          </Button>

          <Button variant="secondary" onClick={goExecution}>
            <ClipboardCheck className="h-4 w-4" /> Execute Test Cases
          </Button>
        </div>
      </Card>

      {loading ? (
        <Card>
          <div className="flex flex-col items-center justify-center gap-3 p-16 text-sm text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div>Generating and validating test cases from the uploaded SRS/SOW...</div>
            <div className="text-xs">
              Reading requirements · Creating test cases · Checking requirement match · Auto-classifying
            </div>
          </div>
        </Card>
      ) : displayedTestCases.length === 0 ? (
        <Card>
          <div className="p-16 text-center text-sm text-muted-foreground">
            No test cases yet. Click{" "}
            <span className="font-medium text-foreground">
              Generate Test Cases
            </span>{" "}
            to begin.
          </div>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">Auto Approved</div>
              <div className="mt-1 text-2xl font-semibold">
                {autoApprovedCases.length}
              </div>
              <p className="text-xs text-muted-foreground">
                Directly available in Execution
              </p>
            </Card>

            <Card className="p-4">
              <div className="text-xs text-muted-foreground">Needs Review</div>
              <div className="mt-1 text-2xl font-semibold">
                {needsReviewCases.length}
              </div>
              <p className="text-xs text-muted-foreground">
                Tester checks only these doubtful cases
              </p>
            </Card>

            <Card className="p-4">
              <div className="text-xs text-muted-foreground">Auto Rejected</div>
              <div className="mt-1 text-2xl font-semibold">
                {autoRejectedCases.length}
              </div>
              <p className="text-xs text-muted-foreground">
                Irrelevant, duplicate, or weak cases
              </p>
            </Card>
          </div>

          {renderTestCaseSection(
            "Auto Approved Test Cases",
            "AI found these cases clear, traceable, executable, and ready for execution.",
            autoApprovedCases,
            "No auto-approved test cases found.",
            false
          )}

          {renderTestCaseSection(
            "Needs Review",
            "Only these doubtful cases require tester decision.",
            needsReviewCases,
            "No test cases need manual review.",
            true
          )}

          {renderTestCaseSection(
            "Auto Rejected Test Cases",
            "AI rejected these because they are irrelevant, duplicate, unclear, or not traceable to the SRS/SOW.",
            autoRejectedCases,
            "No auto-rejected test cases found.",
            false
          )}
        </>
      )}
    </div>
  );
}

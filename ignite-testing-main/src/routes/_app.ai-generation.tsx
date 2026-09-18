import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Sparkles,
  Loader2,
  RotateCcw,
  Save,
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
};

type Project = {
  id: number;
  name: string;
  description?: string;
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
    .filter(
      (tc) => getModulePrefix(getModuleName(tc)) === currentPrefix
    ).length;

  return `TC-${currentPrefix}-${String(moduleCount).padStart(3, "0")}`;
};

const formatSteps = (steps: string | string[]) => {
  if (Array.isArray(steps)) {
    return steps.join("\n");
  }

  return steps || "";
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

  // Just fetches and displays this project's existing test cases - no
  // generation-result toasts belong here (that's generate()'s job), and it
  // must never call itself: it previously did unconditionally, which caused
  // an unbounded recursive loop of /summary requests every time this ran.
  const loadExistingTestCases = async (projectId: string) => {
    if (!projectId) return;

    try {
      const response = await fetch(`${API_URL}/projects/${projectId}/summary`);
      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || "Failed to load existing test cases");
      }

      setGenerated(Array.isArray(data.testcases) ? data.testcases : []);
    } catch {
      toast.error("Failed to load existing test cases");
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

        loadExistingTestCases(savedProjectId);
      }
    } catch {
      toast.error("Failed to load projects");
    }
  };

  const handleProjectChange = (projectId: string) => {
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

      loadExistingTestCases(projectId);
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
    const savedDocId =
      window.localStorage.getItem("selectedDocumentId") || "";

    const savedProjectId =
      window.localStorage.getItem("selectedProjectId") || "";

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

      const createdCount = data.created_count ?? 0;

      if (createdCount > 0) {
        toast.success(`${createdCount} new unique test cases generated.`);
      } else {
        toast.warning("No new unique test cases found. Existing duplicates were skipped.");
      }

      if (data.skipped_duplicates > 0) {
        toast.info(`${data.skipped_duplicates} duplicate test cases skipped.`);
      }

      if (data.skipped_invalid > 0) {
        toast.warning(`${data.skipped_invalid} AI-generated cases failed schema validation and were skipped.`);
      }

      if (selectedProjectId) {
        await loadExistingTestCases(selectedProjectId);
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

      setGenerated((prev) =>
        prev.map((testcase) =>
          testcase.id === testcaseId ? { ...testcase, status } : testcase
        )
      );

      toast.success(
        status === "Approved"
          ? "Test case approved and moved to Execution"
          : "Test case rejected"
      );
    } catch (error: any) {
      toast.error(error.message || "Failed to update test case status");
    }
  };

  const saveDraft = async () => {
    if (generated.length === 0) {
      toast.error("Nothing to save yet");
      return;
    }

    try {
      await Promise.all(
        generated.map((testcase) =>
          fetch(`${API_URL}/testcases/${testcase.id}/draft`, {
            method: "PUT",
          })
        )
      );

      setGenerated((prev) =>
        prev.map((testcase) => ({
          ...testcase,
          status: "Draft",
        }))
      );

      toast.success("Generated test cases saved as Draft");
    } catch {
      toast.error("Failed to save as Draft");
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
          Generate test cases from uploaded SRS/SOW documents and approve or
          reject them for execution.
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
          <Button
            onClick={generate}
            disabled={loading || !documentId}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating test cases...
              </>
            ) : generated.length > 0 ? (
              <>
                <ClipboardCheck className="h-4 w-4" />
                {loading ? (
  <>
    <Loader2 className="h-4 w-4 animate-spin" />
    AI is generating test cases…
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

          <Button variant="outline" onClick={saveDraft}>
            <Save className="h-4 w-4" /> Save as Draft
          </Button>

          <Button variant="secondary" onClick={goExecution}>
            <ClipboardCheck className="h-4 w-4" /> Execute Test Cases
          </Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h3 className="text-sm font-semibold">Generated test cases</h3>
          {generated.length > 0 && (
            <Badge variant="outline">{generated.length} generated</Badge>
          )}
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 p-16 text-sm text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div>Generating test cases from the uploaded SRS/SOW...</div>
            <div className="text-xs">
              Reading requirements · Detecting scenarios · Creating test cases
            </div>
          </div>
        ) : generated.length === 0 ? (
          <div className="p-16 text-center text-sm text-muted-foreground">
            No test cases yet. Click{" "}
            <span className="font-medium text-foreground">
              Generate Test Cases
            </span>{" "}
            to begin.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>TC ID</TableHead>
                <TableHead>Project ID</TableHead>
                <TableHead>Module</TableHead>
                <TableHead>Scenario</TableHead>
                <TableHead className="min-w-[300px]">Steps</TableHead>
                <TableHead>Expected Result</TableHead>
                <TableHead className="text-center">Approve / Reject</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {displayedTestCases.map((testcase, index) => (
                <TableRow key={testcase.id}>
                  <TableCell className="font-mono text-xs">
                    {getModuleWiseTcId(displayedTestCases, index)}
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

                  <TableCell className="text-center">
                    <div className="flex justify-center gap-2">
                      <Button
                        size="sm"
                        variant={
                          testcase.status === "Approved" ? "default" : "outline"
                        }
                        onClick={() =>
                          updateTestCaseStatus(testcase.id, "Approved")
                        }
                        title="Approve test case"
                        className="h-11 w-11 rounded-xl shadow-sm"
                      >
                        <CircleCheck className="h-5 w-5" />
                      </Button>

                      <Button
                        size="sm"
                        variant={
                          testcase.status === "Rejected"
                            ? "destructive"
                            : "outline"
                        }
                        onClick={() =>
                          updateTestCaseStatus(testcase.id, "Rejected")
                        }
                        title="Reject test case"
                        className="h-11 w-11 rounded-xl shadow-sm"
                      >
                        <CircleX className="h-5 w-5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
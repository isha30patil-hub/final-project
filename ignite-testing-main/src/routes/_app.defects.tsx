import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Eye, Bug } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

export const Route = createFileRoute("/_app/defects")({
  component: DefectsPage,
});

import { API_URL } from "@/lib/api";

type Defect = {
  id: number;
  testcase_id: number;
  project_id?: number;
  defect_title: string;
  severity: "Critical" | "High" | "Medium" | "Low";
  status: "Open" | "In Progress" | "Resolved" | "Closed";
};
 type TestCaseRef = {
  id: number;
  project_id: number;
  title: string;
  status: string;
};

const sevStyle: Record<Defect["severity"], string> = {
  Critical: "bg-destructive text-destructive-foreground",
  High: "bg-destructive/15 text-destructive border-destructive/30",
  Medium: "bg-warning/15 text-warning-foreground border-warning/30",
  Low: "bg-muted text-muted-foreground",
};

const statusStyle: Record<Defect["status"], string> = {
  Open: "bg-destructive/15 text-destructive border-destructive/30",
  "In Progress": "bg-info/15 text-info border-info/30",
  Resolved: "bg-success/15 text-success border-success/30",
  Closed: "bg-muted text-muted-foreground",
};

function DefectsPage() {
  const [defects, setDefects] = useState<Defect[]>([]);
  
  const [sev, setSev] = useState("all");
  const [status, setStatus] = useState("all");
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<Defect | null>(null);
  const [testcases, setTestcases] = useState<TestCaseRef[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedProjectName, setSelectedProjectName] = useState("");

  const [form, setForm] = useState({
    testcase_id: "",
    defect_title: "",
    severity: "Medium",
    status: "Open",
  });

  const loadDefects = async () => {
    try {
      const response = await fetch(`${API_URL}/defects`);
      const data = await response.json();

      setDefects(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Failed to load defects");
    }
  };

  const updateStatus = async (
    id: number,
    newStatus: Defect["status"]
  ) => {
    try {
      await fetch(`${API_URL}/defects/${id}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: newStatus,
        }),
      });

      toast.success(`Status updated to ${newStatus}`);
      loadDefects();
    } catch {
      toast.error("Failed to update status");
    }
  };

  useEffect(() => {
    const savedProjectId =
      window.localStorage.getItem("selectedProjectId") || "";

    const savedProjectName =
      window.localStorage.getItem("selectedProjectName") || "";

    setSelectedProjectId(savedProjectId);
    setSelectedProjectName(savedProjectName);

    loadDefects();
    loadTestcases();
  }, []);

  const loadTestcases = async () => {
  try {
    const response = await fetch(`${API_URL}/testcases?limit=5000`);
    const data = await response.json();

    setTestcases(Array.isArray(data) ? data : []);
  } catch {
    toast.error("Failed to load test cases");
  }
};
const getLinkedTcDisplay = (defect: Defect) => {
  const executableStatuses = ["Approved", "Passed", "Failed", "Blocked"];

  const projectCases = testcases
    .filter(
      (tc) =>
        String(tc.project_id) === String(defect.project_id) &&
        executableStatuses.includes(tc.status)
    )
    .sort((a, b) => a.id - b.id);

  const index = projectCases.findIndex(
    (tc) => tc.id === defect.testcase_id
  );

  if (index === -1) {
    return `TC-${String(defect.testcase_id).padStart(3, "0")}`;
  }

  return `TC-${String(index + 1).padStart(3, "0")}`;
};
  const filtered = defects.filter((d) => {
    const matchesProject =
      !selectedProjectId || String(d.project_id) === selectedProjectId;

    const matchesSeverity =
      sev === "all" || d.severity === sev;

    const matchesStatus =
      status === "all" || d.status === status;

    return matchesProject && matchesSeverity && matchesStatus;
  });

  const save = async () => {
    if (!form.testcase_id.trim()) {
      toast.error("Test case ID is required");
      return;
    }

    if (!form.defect_title.trim()) {
      toast.error("Defect title is required");
      return;
    }

    try {
      await fetch(`${API_URL}/defects`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          testcase_id: Number(form.testcase_id),
          defect_title: form.defect_title,
          severity: form.severity,
          status: form.status,
        }),
      });

      toast.success("Defect added");

      setOpen(false);

      setForm({
        testcase_id: "",
        defect_title: "",
        severity: "Medium",
        status: "Open",
      });

      loadDefects();
    } catch {
      toast.error("Failed to add defect");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Defect Tracking
          </h1>

          {selectedProjectName && (
            <p className="text-sm font-medium text-primary">
              Project: {selectedProjectName}
              {selectedProjectId && ` | ID: ${selectedProjectId}`}
            </p>
          )}

          <p className="text-sm text-muted-foreground">
            Track defects raised during test execution.
          </p>
        </div>

        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Add Defect
        </Button>
      </div>

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select value={sev} onValueChange={setSev}>
            <SelectTrigger>
              <SelectValue placeholder="Severity" />
            </SelectTrigger>

            <SelectContent>
              <SelectItem value="all">All severities</SelectItem>
              <SelectItem value="Critical">Critical</SelectItem>
              <SelectItem value="High">High</SelectItem>
              <SelectItem value="Medium">Medium</SelectItem>
              <SelectItem value="Low">Low</SelectItem>
            </SelectContent>
          </Select>

          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>

            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="Open">Open</SelectItem>
              <SelectItem value="In Progress">In Progress</SelectItem>
              <SelectItem value="Resolved">Resolved</SelectItem>
              <SelectItem value="Closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Defect ID</TableHead>
              <TableHead>Linked TC</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Defect Title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">View</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-12 text-center text-muted-foreground"
                >
                  <Bug className="mx-auto mb-2 h-8 w-8" />
                  No defects found for this project.
                </TableCell>
              </TableRow>
            )}

            {filtered.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-mono text-xs">
                  DEF-{String(d.id).padStart(3, "0")}
                </TableCell>

                <TableCell className="font-mono text-xs">
                  {getLinkedTcDisplay(d)}
                </TableCell>

                <TableCell>
                  <Badge variant="outline" className={sevStyle[d.severity]}>
                    {d.severity}
                  </Badge>
                </TableCell>

                <TableCell
                  className="max-w-[520px] truncate"
                  title={d.defect_title}
                >
                  {d.defect_title}
                </TableCell>

                <TableCell>
                  <Select
                    value={d.status}
                    onValueChange={(v) =>
                      updateStatus(d.id, v as Defect["status"])
                    }
                  >
                    <SelectTrigger
                      className={`h-8 w-[150px] ${statusStyle[d.status]}`}
                    >
                      <SelectValue />
                    </SelectTrigger>

                    <SelectContent>
                      <SelectItem value="Open">Open</SelectItem>
                      <SelectItem value="In Progress">In Progress</SelectItem>
                      <SelectItem value="Resolved">Resolved</SelectItem>
                      <SelectItem value="Closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>

                <TableCell className="text-right">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setViewing(d)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log a new defect</DialogTitle>
            <DialogDescription>
              Create a defect linked to a failed test case.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label>Linked Test Case ID</Label>
              <Input
                value={form.testcase_id}
                onChange={(e) =>
                  setForm({
                    ...form,
                    testcase_id: e.target.value,
                  })
                }
                placeholder="Example: 58"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Severity</Label>
              <Select
                value={form.severity}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    severity: v,
                  })
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
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    status: v,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="Open">Open</SelectItem>
                  <SelectItem value="In Progress">In Progress</SelectItem>
                  <SelectItem value="Resolved">Resolved</SelectItem>
                  <SelectItem value="Closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Defect Title</Label>
              <Textarea
                rows={4}
                value={form.defect_title}
                onChange={(e) =>
                  setForm({
                    ...form,
                    defect_title: e.target.value,
                  })
                }
                placeholder="Describe the defect"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>

            <Button onClick={save}>
              Save Defect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!viewing}
        onOpenChange={(o) => !o && setViewing(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              DEF-{viewing && String(viewing.id).padStart(3, "0")}
            </DialogTitle>

            <DialogDescription>
              Linked to TC-
              {viewing && String(viewing.testcase_id).padStart(3, "0")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">Project ID: </span>
              {viewing?.project_id ?? "Not available"}
            </div>

            <div>
              <span className="text-muted-foreground">Severity: </span>
              {viewing?.severity}
            </div>

            <div>
              <span className="text-muted-foreground">Status: </span>
              {viewing?.status}
            </div>

            <div>
              <span className="text-muted-foreground">Defect Title:</span>
              <p className="mt-1">{viewing?.defect_title}</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
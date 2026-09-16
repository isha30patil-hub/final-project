import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Bug, ClipboardCheck, FileText, PlayCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app/projects/$projectId")({
  component: ProjectDetailsPage,
});

const API_URL = "http://localhost:8000";

function ProjectDetailsPage() {
  const { projectId } = Route.useParams();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetch(`${API_URL}/projects/${projectId}/summary`)
      .then((res) => res.json())
      .then((res) => setData(res));
  }, [projectId]);

  const statusCounts = useMemo(() => {
    const map: Record<string, number> = {};
    data?.testcase_status?.forEach((s: any) => {
      map[s.status] = s.count;
    });
    return map;
  }, [data]);

  if (!data) return <div className="p-6">Loading project...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Button asChild variant="ghost" className="mb-2 px-0">
            <Link to="/projects">
              <ArrowLeft className="h-4 w-4" /> Back to Projects
            </Link>
          </Button>

          <h1 className="text-2xl font-semibold tracking-tight">
            {data.project.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {data.project.description || "No description added"}
          </p>
        </div>

        <Badge variant="outline" className="bg-success/15 text-success border-success/30">
          Active
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileText className="h-4 w-4" /> Total Test Cases
          </div>
          <div className="mt-2 text-3xl font-bold">{data.total_testcases}</div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ClipboardCheck className="h-4 w-4" /> Approved
          </div>
          <div className="mt-2 text-3xl font-bold">{statusCounts.Approved || 0}</div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <PlayCircle className="h-4 w-4" /> Passed / Failed
          </div>
          <div className="mt-2 text-3xl font-bold">
            {statusCounts.Passed || 0} / {statusCounts.Failed || 0}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Bug className="h-4 w-4" /> Total Defects
          </div>
          <div className="mt-2 text-3xl font-bold">{data.total_defects}</div>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        {["Generated", "Approved", "Rejected", "Passed", "Failed"].map((status) => (
          <Card key={status} className="p-4 text-center">
            <div className="text-2xl font-semibold">{statusCounts[status] || 0}</div>
            <div className="text-xs text-muted-foreground">{status}</div>
          </Card>
        ))}
      </div>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">Project Test Cases</h3>
          <Badge variant="outline">{data.testcases.length} cases</Badge>
        </div>

        <div className="space-y-2">
          {data.testcases.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No test cases generated for this project yet.
            </div>
          )}

          {data.testcases.map((tc: any) => (
            <div key={tc.id} className="rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{tc.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    TC-{String(tc.id).padStart(3, "0")}
                  </div>
                </div>

                <Badge variant="outline">{tc.status}</Badge>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">Linked Defects</h3>
          <Badge variant="outline">{data.defects.length} defects</Badge>
        </div>

        <div className="space-y-2">
          {data.defects.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No defects logged for this project yet.
            </div>
          )}

          {data.defects.map((d: any) => (
            <div key={d.id} className="rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{d.defect_title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    DEF-{String(d.id).padStart(3, "0")} · Linked TC-{String(d.testcase_id).padStart(3, "0")}
                  </div>
                </div>

                <Badge variant="outline">{d.status}</Badge>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
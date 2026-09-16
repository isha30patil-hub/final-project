import { createFileRoute, Link} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Eye, FolderKanban } from "lucide-react";
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

export const Route = createFileRoute("/_app/projects")({
  component: ProjectsPage,
});

const API_URL = "http://localhost:8000";

type Project = {
  id: number;
  name: string;
  description: string;
};

function ProjectsPage() {
  

  const [projects, setProjects] = useState<Project[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
  });

  const getProjects = async () => {
    try {
      const response = await fetch(`${API_URL}/projects`);
      const data = await response.json();
      setProjects(data);
    } catch {
      toast.error("Failed to load projects");
    }
  };

  const openCreate = () => {
    setForm({ name: "", description: "" });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Project name is required");
      return;
    }

    try {
      await fetch(`${API_URL}/projects`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: form.name,
          description: form.description || "Created from frontend",
        }),
      });

      toast.success("Project created");
      setOpen(false);
      getProjects();
    } catch {
      toast.error("Failed to create project");
    }
  };

  useEffect(() => {
    getProjects();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">
            Manage testing projects stored in PostgreSQL through FastAPI.
          </p>
        </div>

        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> Add Project
        </Button>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Project</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Open</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {projects.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-12 text-center text-muted-foreground"
                >
                  <FolderKanban className="mx-auto mb-2 h-8 w-8" />
                  No projects found in database.
                </TableCell>
              </TableRow>
            )}

            {projects.map((project) => (
              <TableRow key={project.id}>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {project.id}
                </TableCell>

                <TableCell>
                  <div className="font-medium">{project.name}</div>
                </TableCell>

                <TableCell>
                  <div className="text-sm text-muted-foreground">
                    {project.description}
                  </div>
                </TableCell>

                <TableCell>
                  <Badge
                    variant="outline"
                    className="bg-success/15 text-success border-success/30"
                  >
                    Active
                  </Badge>
                </TableCell>

               <TableCell className="text-right">
  <button
    type="button"
    className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted"
    onClick={() => {
      localStorage.setItem("selectedProjectId", String(project.id));
      localStorage.setItem("selectedProjectName", project.name);

      window.location.href = `/projects/${project.id}`;
    }}
    aria-label="Open project"
  >
    <Eye className="h-4 w-4" />
  </button>
</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>
              Create a new testing project and store it in PostgreSQL.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="space-y-1.5">
              <Label>Project name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Hospital App"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                rows={3}
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                placeholder="Healthcare testing project"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save}>Save Project</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}